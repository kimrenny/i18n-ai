import { describe, it, expect } from 'vitest'
import { scanSourceCode, aggregateKeyUsages } from '../keyUsageScanner'
import { parseLocalizationData } from '../localizationParser'

describe('StaticValuePropagator and Dynamic Key Resolution Suite', () => {
  it('1. resolves literal variables and alias chains', () => {
    const code = `
      import { useTranslation } from 'react-i18next'
      const { t } = useTranslation()

      const a = 'CHAIN.KEY'
      const b = a
      const c = b

      t(c)
    `
    const result = scanSourceCode('src/TestChain.tsx', 'src/TestChain.tsx', code)
    expect(result.staticUsages.length).toBe(1)
    expect(result.staticUsages[0].key).toBe('CHAIN.KEY')
    expect(result.staticUsages[0].resolutionType).toBe('constant')
    expect(result.staticUsages[0].confidence).toBe('medium')
  })

  it('2. resolves static template literals and string concatenation', () => {
    const code = `
      import { useTranslation } from 'react-i18next'
      const { t } = useTranslation()

      const section = 'HOME'
      const suffix = 'TITLE'
      const prefix = 'HOME.'

      // Template
      t(\`\${section}.TITLE\`)

      // Concatenation
      t(prefix + suffix)
    `
    const result = scanSourceCode('src/TestTpl.tsx', 'src/TestTpl.tsx', code)
    expect(result.staticUsages.length).toBe(2)
    expect(result.staticUsages[0].key).toBe('HOME.TITLE')
    expect(result.staticUsages[0].resolutionType).toBe('template-resolved')
    expect(result.staticUsages[1].key).toBe('HOME.TITLE')
    expect(result.staticUsages[1].resolutionType).toBe('template-resolved')
  })

  it('3. resolves arrays of keys passed to localization methods', () => {
    const code = `
      import { TranslateService } from '@ngx-translate/core'
      const translate: TranslateService = {} as any

      const keys = ['HOME.TITLE', 'HOME.SUBTITLE']
      translate.get(keys)
    `
    const result = scanSourceCode('src/test.ts', 'src/test.ts', code)
    expect(result.staticUsages.length).toBe(2)
    expect(result.staticUsages[0].key).toBe('HOME.TITLE')
    expect(result.staticUsages[1].key).toBe('HOME.SUBTITLE')
  })

  it('4. resolves object properties and element access dictionaries', () => {
    const code = `
      import { useTranslation } from 'react-i18next'
      const { t } = useTranslation()

      const validation = {
        errorKey: 'errorEmpty'
      }

      const validationErrors = {
        empty: 'errorEmpty',
        dots: 'errorConsecutiveDots'
      } as const

      t(\`addKey.\${validation.errorKey}\`)
      t(\`addKey.\${validationErrors['empty']}\`)
    `
    const result = scanSourceCode('src/TestObj.tsx', 'src/TestObj.tsx', code)
    expect(result.staticUsages.length).toBe(2)
    expect(result.staticUsages[0].key).toBe('addKey.errorEmpty')
    expect(result.staticUsages[1].key).toBe('addKey.errorEmpty')
  })

  it('5. resolves ternary finite unions to all possible candidate keys', () => {
    const code = `
      import { useTranslation } from 'react-i18next'
      const { t } = useTranslation()

      const errorKey = condition ? 'errorEmpty' : 'errorConsecutiveDots'
      t(\`addKey.\${errorKey}\`)
    `
    const result = scanSourceCode('src/TestUnion.tsx', 'src/TestUnion.tsx', code)
    expect(result.staticUsages.length).toBe(2)
    const keys = result.staticUsages.map((u) => u.key)
    expect(keys).toContain('addKey.errorEmpty')
    expect(keys).toContain('addKey.errorConsecutiveDots')
    expect(result.staticUsages[0].resolutionType).toBe('template-resolved')
  })

  it('6. resolves array-of-objects property mappings like providers.*', () => {
    const code = `
      import { useTranslation } from 'react-i18next'
      const { t } = useTranslation()

      const AI_PROVIDERS = [
        { id: 'gemini' },
        { id: 'openai' },
        { id: 'anthropic' }
      ]

      AI_PROVIDERS.forEach((p) => {
        t(\`providers.\${p.id}.name\`)
      })
    `
    const result = scanSourceCode('src/TestProviders.tsx', 'src/TestProviders.tsx', code)
    expect(result.staticUsages.length).toBe(3)
    const keys = result.staticUsages.map((u) => u.key)
    expect(keys).toContain('providers.gemini.name')
    expect(keys).toContain('providers.openai.name')
    expect(keys).toContain('providers.anthropic.name')
  })

  it('7. leaves truly unresolvable expressions dynamic and sets possibleDynamicUsages on matching keys', () => {
    const code = `
      import { useTranslation } from 'react-i18next'
      const { t } = useTranslation()

      function render(userInput: string) {
        t(\`home.\${getUserInput()}\`)
        t(\`addKey.\${userInput}\`)
      }
    `
    const fileResult = scanSourceCode('src/TestDyn.tsx', 'src/TestDyn.tsx', code)
    expect(fileResult.staticUsages.length).toBe(0)
    expect(fileResult.dynamicUsages.length).toBe(2)

    const parsedEn = parseLocalizationData('en.json', '/locales/en.json', {
      home: { title: 'Home Title', header: 'Home Header' },
      addKey: { errorEmpty: 'Empty', keyLabel: 'Key' },
      other: { key: 'Other' },
    })

    const aggregated = aggregateKeyUsages([fileResult], [parsedEn])

    // Keys remain unused (no fake static usages)
    const homeTitle = aggregated.items.find((i) => i.key === 'home.title')
    expect(homeTitle?.status).toBe('unused')
    expect(homeTitle?.usageCount).toBe(0)
    // But possibleDynamicUsages is populated!
    expect(homeTitle?.possibleDynamicUsages?.length).toBe(1)
    expect(homeTitle?.possibleDynamicUsages?.[0].expression).toContain('home.')

    const addKeyEmpty = aggregated.items.find((i) => i.key === 'addKey.errorEmpty')
    expect(addKeyEmpty?.status).toBe('unused')
    expect(addKeyEmpty?.possibleDynamicUsages?.length).toBe(1)

    const otherKey = aggregated.items.find((i) => i.key === 'other.key')
    expect(otherKey?.status).toBe('unused')
    expect(otherKey?.possibleDynamicUsages).toBeUndefined()
  })

  it('8. handles cyclic variable references safely without infinite recursion', () => {
    const code = `
      import { useTranslation } from 'react-i18next'
      const { t } = useTranslation()

      const a: any = b
      const b: any = a

      t(a)
    `
    const result = scanSourceCode('src/TestCycle.tsx', 'src/TestCycle.tsx', code)
    expect(result.dynamicUsages.length).toBe(1)
    expect(result.staticUsages.length).toBe(0)
  })

  it('9. resolves AddTranslationKeyModal addKey.* regression cases', () => {
    const code = `
      import { useTranslation } from 'react-i18next'
      const { t } = useTranslation()

      const validation = {
        errorKey: 'errorEmpty'
      }

      // Regression case from AddTranslationKeyModal
      const rendered = t(\`addKey.\${plan.validation.errorKey}\`)
    `
    // When propertyValues has errorKey definitions
    const result = scanSourceCode('src/AddTranslationKeyModal.tsx', 'src/AddTranslationKeyModal.tsx', code)
    expect(result.staticUsages.length).toBeGreaterThanOrEqual(1)
    expect(result.staticUsages[0].key).toBe('addKey.errorEmpty')
  })
})
