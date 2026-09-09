import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  scanSourceCode,
  scanVueFile,
  aggregateKeyUsages,
} from './keyUsageScanner'
import { KeyUsagePanel } from '../components/keyUsage/KeyUsagePanel'
import { TranslationKeyInspector } from '../components/inspector/TranslationKeyInspector'
import { FilePreview } from '../components/preview/FilePreview'
import type { ParsedLocalizationFile } from '../types/localization'

describe('Comprehensive Key Usage Scanner Integration Verification', () => {
  const mockParsedFiles: ParsedLocalizationFile[] = [
    {
      filename: 'en.json',
      path: '/locales/en.json',
      raw: {
        app: { title: 'Desktop App', subtitle: 'AI Localization' },
        common: { save: 'Save', cancel: 'Cancel', delete: 'Delete' },
        legacy: { oldFeature: 'Old Feature' },
      },
      keys: {
        'app.title': 'Desktop App',
        'app.subtitle': 'AI Localization',
        'common.save': 'Save',
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'legacy.oldFeature': 'Old Feature',
      },
      keyCount: 6,
    },
    {
      filename: 'fr.json',
      path: '/locales/fr.json',
      raw: {
        app: { title: 'Application Bureau' },
        common: { save: 'Enregistrer', cancel: 'Annuler' },
      },
      keys: {
        'app.title': 'Application Bureau',
        'common.save': 'Enregistrer',
        'common.cancel': 'Annuler',
      },
      keyCount: 3,
    },
  ]

  const sourceFiles = [
    {
      filePath: '/src/App.tsx',
      relativePath: 'src/App.tsx',
      content: `
        import React from 'react'
        import { useTranslation } from './i18n'

        export function App() {
          const { t } = useTranslation()
          return (
            <div>
              <h1>{t('app.title')}</h1>
              <p>{t('app.subtitle')}</p>
              <button>{t('common.save')}</button>
              <span>{t('missing.code.button')}</span>
            </div>
          )
        }
      `,
    },
    {
      filePath: '/src/Header.vue',
      relativePath: 'src/Header.vue',
      content: `
        <template>
          <header>
            <h2>{{ $t('app.title') }}</h2>
            <span>{{ $t('missing.vue.badge') }}</span>
          </header>
        </template>
        <script>
        export default {
          mounted() {
            console.log(this.$t('common.save'))
          }
        }
        </script>
      `,
    },
    {
      filePath: '/src/DynamicHelper.ts',
      relativePath: 'src/DynamicHelper.ts',
      content: `
        export function getLabel(dynamicKey: string, section: string) {
          const a = t(dynamicKey)
          const b = t(\`admin.\${section}.title\`)
          const c = translate('common.delete')
        }
      `,
    },
  ]

  it('Scenario 1: scans multiple source files (.tsx, .vue, .ts) and aggregates complete results', () => {
    const scanResults = sourceFiles.map((sf) => {
      if (sf.filePath.endsWith('.vue')) {
        return scanVueFile(sf.filePath, sf.relativePath, sf.content)
      }
      return scanSourceCode(sf.filePath, sf.relativePath, sf.content)
    })

    const agg = aggregateKeyUsages(scanResults, mockParsedFiles)

    expect(agg.scannedFilesCount).toBe(3)
    expect(agg.parsedFilesCount).toBe(3)
    expect(agg.skippedFilesCount).toBe(0)
    expect(agg.dynamicUsagesCount).toBe(2)

    // Check Used keys
    // app.title (used in App.tsx line 9 and Header.vue line 4) -> 2 usages
    const appTitle = agg.items.find((i) => i.key === 'app.title')
    expect(appTitle?.status).toBe('used')
    expect(appTitle?.usageCount).toBe(2)
    expect(appTitle?.presentInLanguages).toEqual(['English', 'French'])

    // common.save (used in App.tsx line 11 and Header.vue line 11) -> 2 usages
    const commonSave = agg.items.find((i) => i.key === 'common.save')
    expect(commonSave?.status).toBe('used')
    expect(commonSave?.usageCount).toBe(2)

    // common.delete (used in DynamicHelper.ts line 5) -> 1 usage
    const commonDelete = agg.items.find((i) => i.key === 'common.delete')
    expect(commonDelete?.status).toBe('used')
    expect(commonDelete?.usageCount).toBe(1)

    // Check Unused keys
    // common.cancel (0 usages)
    const commonCancel = agg.items.find((i) => i.key === 'common.cancel')
    expect(commonCancel?.status).toBe('unused')
    expect(commonCancel?.usageCount).toBe(0)

    // legacy.oldFeature (0 usages)
    const legacyOld = agg.items.find((i) => i.key === 'legacy.oldFeature')
    expect(legacyOld?.status).toBe('unused')
    expect(legacyOld?.usageCount).toBe(0)

    // Check Code-Reference Missing keys
    // missing.code.button (referenced in App.tsx line 12, not in en.json / fr.json)
    const missingBtn = agg.items.find((i) => i.key === 'missing.code.button')
    expect(missingBtn?.status).toBe('missing')
    expect(missingBtn?.usageCount).toBe(1)
    expect(missingBtn?.presentInLanguages).toEqual([])

    // missing.vue.badge (referenced in Header.vue line 5, not in en.json / fr.json)
    const missingBadge = agg.items.find((i) => i.key === 'missing.vue.badge')
    expect(missingBadge?.status).toBe('missing')
    expect(missingBadge?.usageCount).toBe(1)

    // Check Summary Counts
    expect(agg.usedKeysCount).toBe(4) // app.title, app.subtitle, common.save, common.delete
    expect(agg.unusedKeysCount).toBe(2) // common.cancel, legacy.oldFeature
    expect(agg.missingKeysCount).toBe(2) // missing.code.button, missing.vue.badge
    expect(agg.totalUniqueKeys).toBe(8)
  })

  it('Scenario 2: KeyUsagePanel filters items and interacts with selection', () => {
    const scanResults = sourceFiles.map((sf) => {
      if (sf.filePath.endsWith('.vue')) {
        return scanVueFile(sf.filePath, sf.relativePath, sf.content)
      }
      return scanSourceCode(sf.filePath, sf.relativePath, sf.content)
    })
    const agg = aggregateKeyUsages(scanResults, mockParsedFiles)

    const onSelectKey = vi.fn()
    const onNavigateToSource = vi.fn()
    const onNavigateToLocalization = vi.fn()

    render(
      <KeyUsagePanel
        scanResult={agg}
        selectedKeyPath="app.title"
        onSelectKey={onSelectKey}
        onNavigateToSource={onNavigateToSource}
        onNavigateToLocalization={onNavigateToLocalization}
      />
    )

    // Verify stats bar
    expect(screen.getByTestId('key-usage-stats-bar')).toBeInTheDocument()

    // Verify selected key details
    expect(screen.getByTestId('key-item-app.title')).toBeInTheDocument()
    expect(screen.getByTestId('usage-item-0')).toBeInTheDocument()

    // Click usage item -> navigates to source file
    fireEvent.click(screen.getByTestId('usage-item-0'))
    expect(onNavigateToSource).toHaveBeenCalledWith('/src/App.tsx', 9)

    // Click localization navigation button
    const navBtn = screen.getByTestId('nav-to-localization-btn')
    fireEvent.click(navBtn)
    expect(onNavigateToLocalization).toHaveBeenCalledWith('app.title')

    // Switch to Missing filter
    fireEvent.click(screen.getByTestId('filter-missing'))
    expect(screen.getByTestId('key-item-missing.code.button')).toBeInTheDocument()
    expect(screen.queryByTestId('key-item-app.title')).not.toBeInTheDocument()

    // Switch to Dynamic filter
    fireEvent.click(screen.getByTestId('filter-dynamic'))
    expect(screen.getByTestId('dynamic-usage-item-0')).toBeInTheDocument()
  })

  it('Scenario 3: FilePreview highlights target line and renders source code', () => {
    const fileContent = `line 1\nline 2\nconst title = t('app.title')\nline 4\nline 5`
    render(
      <FilePreview
        fileName="App.tsx"
        filePath="/src/App.tsx"
        content={fileContent}
        targetLine={3}
      />
    )

    const targetRow = screen.getByTestId('preview-target-line')
    expect(targetRow).toBeInTheDocument()
    expect(targetRow).toHaveClass('is-target-line')
    expect(targetRow).toHaveTextContent("const title = t('app.title')")
  })

  it('Scenario 4: TranslationKeyInspector renders usage badge and navigates to Key Usage panel', () => {
    const onOpenKeyUsage = vi.fn()
    const keyUsageItem = {
      key: 'app.title',
      status: 'used' as const,
      usageCount: 2,
      usages: [],
      presentInLanguages: ['English', 'French'],
      languageCount: 2,
    }

    render(
      <TranslationKeyInspector
        selectedKey="app.title"
        parsedFiles={mockParsedFiles}
        keyUsageItem={keyUsageItem}
        onNavigateLanguage={vi.fn()}
        onOpenKeyUsage={onOpenKeyUsage}
        onClose={vi.fn()}
      />
    )

    const usageCard = screen.getByTestId('inspector-usage-card')
    expect(usageCard).toBeInTheDocument()
    expect(usageCard).toHaveTextContent('2 usages')

    const openUsageBtn = screen.getByTestId('inspector-open-usage-btn')
    fireEvent.click(openUsageBtn)
    expect(onOpenKeyUsage).toHaveBeenCalledWith('app.title')
  })
})
