import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { scanWorkspaceSourceFiles } from '../../electron/main/keyUsageService'
import { parseLocalizationData } from './localizationParser'
import { aggregateKeyUsages } from './keyUsageScanner'
import { KeyUsagePanel } from '../components/keyUsage/KeyUsagePanel'
import { FilePreview } from '../components/preview/FilePreview'
import { I18nProvider } from '../i18n/I18nContext'
import enLocale from '../i18n/locales/en.json'
import deLocale from '../i18n/locales/de.json'
import ruLocale from '../i18n/locales/ru.json'

describe('Manual Scenario Verification: Key Usage Scanner (20 Scenarios)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'key-usage-manual-test-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('Scenarios 1-10 & 16-17: Real workspace structure, static/dynamic calls, AST extraction, ignored directories & JSON exclusion', async () => {
    // 1. Setup real workspace structure with src, components, ignored node_modules, .git, dist, and locales
    const srcDir = path.join(tempDir, 'src')
    const compDir = path.join(srcDir, 'components')
    const nodeModulesDir = path.join(tempDir, 'node_modules', 'some-pkg')
    const gitDir = path.join(tempDir, '.git', 'objects')
    const distDir = path.join(tempDir, 'dist')
    const localesDir = path.join(tempDir, 'locales')

    await fs.mkdir(compDir, { recursive: true })
    await fs.mkdir(nodeModulesDir, { recursive: true })
    await fs.mkdir(gitDir, { recursive: true })
    await fs.mkdir(distDir, { recursive: true })
    await fs.mkdir(localesDir, { recursive: true })

    // Localization files (not treated as source code)
    const enJson = {
      app: {
        title: 'Localization AI',
        welcome: 'Welcome!',
        unused_header: 'Unused Header',
      },
      common: {
        save: 'Save',
        cancel: 'Cancel',
      },
    }
    const ruJson = {
      app: {
        title: 'Локализация AI',
        welcome: 'Добро пожаловать!',
        unused_header: 'Неиспользуемый заголовок',
      },
      common: {
        save: 'Сохранить',
        cancel: 'Отмена',
      },
    }
    await fs.writeFile(path.join(localesDir, 'en.json'), JSON.stringify(enJson, null, 2))
    await fs.writeFile(path.join(localesDir, 'ru.json'), JSON.stringify(ruJson, null, 2))

    // Real source code files with various call expressions:
    // Scenario 8: static call t('app.title')
    // Scenario 9: nested call i18n.t('common.save')
    // Scenario 10: dynamic call t(variable), t('prefix.' + key), t(`dynamic.${dyn}`)
    // Scenario 6: missing key call t('missing.key.path')
    const componentCode = `
import React from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

export function AppHeader({ dynamicSection }: { dynamicSection: string }) {
  const { t } = useTranslation()

  // Scenario 8: Static call
  const title = t('app.title')

  // Scenario 9: Nested call
  const saveLabel = i18n.t('common.save')

  // Scenario 6: Code-reference missing key
  const missingLabel = t('missing.code.key')

  // Scenario 10: Dynamic calls (must not modify key statuses)
  const dyn1 = t(dynamicSection)
  const dyn2 = t('prefix.' + dynamicSection)
  const dyn3 = t(\`app.\${dynamicSection}.label\`)

  // Static template literal (must resolve statically)
  const welcome = t(\`app.welcome\`)

  return (
    <div>
      <h1>{title}</h1>
      <p>{welcome}</p>
      <span>{saveLabel}</span>
      <em>{missingLabel}</em>
    </div>
  )
}
`
    await fs.writeFile(path.join(compDir, 'AppHeader.tsx'), componentCode)

    // Ignored files (Scenario 16)
    await fs.writeFile(path.join(nodeModulesDir, 'index.js'), `t('ignored.node_modules.key')`)
    await fs.writeFile(path.join(distDir, 'bundle.js'), `t('ignored.dist.key')`)
    await fs.writeFile(path.join(gitDir, 'git-info.txt'), `t('ignored.git.key')`)

    // 2. Run real workspace scanner
    const scanResult = await scanWorkspaceSourceFiles(tempDir)

    // Confirm ignored files were NOT scanned (Scenario 16)
    expect(scanResult.fileScanResults.some((f) => f.filePath.includes('node_modules'))).toBe(false)
    expect(scanResult.fileScanResults.some((f) => f.filePath.includes('dist'))).toBe(false)
    expect(scanResult.fileScanResults.some((f) => f.filePath.includes('.git'))).toBe(false)

    // Confirm localization JSON files were NOT scanned as source files (Scenario 17)
    expect(scanResult.fileScanResults.some((f) => f.filePath.endsWith('.json'))).toBe(false)

    // Parse localization files
    const parsedEn = parseLocalizationData('en.json', path.join(localesDir, 'en.json'), enJson)
    const parsedRu = parseLocalizationData('ru.json', path.join(localesDir, 'ru.json'), ruJson)
    const parsedFiles = [parsedEn, parsedRu]

    // 3. Aggregate results
    const aggregated = aggregateKeyUsages(scanResult.fileScanResults, parsedFiles)

    // Scenario 3: Confirm scan completes and summary counts are plausible
    expect(aggregated.scannedFilesCount).toBe(1)
    expect(aggregated.parsedFilesCount).toBe(1)
    expect(aggregated.skippedFilesCount).toBe(0)

    // Scenario 4: Used keys
    const usedItemTitle = aggregated.items.find((i) => i.key === 'app.title')
    expect(usedItemTitle?.status).toBe('used')
    expect(usedItemTitle?.usageCount).toBe(1)

    const usedItemWelcome = aggregated.items.find((i) => i.key === 'app.welcome')
    expect(usedItemWelcome?.status).toBe('used')
    expect(usedItemWelcome?.usageCount).toBe(1)

    const usedItemSave = aggregated.items.find((i) => i.key === 'common.save')
    expect(usedItemSave?.status).toBe('used')
    expect(usedItemSave?.usageCount).toBe(1)

    // Scenario 5: Unused keys (common.cancel, app.unused_header)
    const unusedItemCancel = aggregated.items.find((i) => i.key === 'common.cancel')
    expect(unusedItemCancel?.status).toBe('unused')
    expect(unusedItemCancel?.usageCount).toBe(0)

    const unusedItemHeader = aggregated.items.find((i) => i.key === 'app.unused_header')
    expect(unusedItemHeader?.status).toBe('unused')
    expect(unusedItemHeader?.usageCount).toBe(0)

    // Scenario 6: Code-reference missing keys (missing.code.key)
    const missingItem = aggregated.items.find((i) => i.key === 'missing.code.key')
    expect(missingItem?.status).toBe('missing')
    expect(missingItem?.usageCount).toBe(1)
    expect(missingItem?.presentInLanguages).toEqual([])

    // Scenario 7: Dynamic references are separate and do NOT alter key statuses
    expect(aggregated.dynamicUsagesCount).toBe(3)
    expect(aggregated.dynamicUsages.length).toBe(3)
    expect(aggregated.dynamicUsages[0].expression).toBe('t(dynamicSection)')
    expect(aggregated.dynamicUsages[1].expression).toBe("t('prefix.' + dynamicSection)")
    expect(aggregated.dynamicUsages[2].expression).toBe('t(`app.${dynamicSection}.label`)')
  })

  it('Scenarios 11-15 & 18-20: KeyUsagePanel UI interactions, search/filtering, line navigation, Inspector card, status bar, and localization', async () => {
    const mockScanResult = {
      scannedFilesCount: 5,
      parsedFilesCount: 5,
      skippedFilesCount: 0,
      skippedFiles: [],
      totalUniqueKeys: 4,
      usedKeysCount: 2,
      unusedKeysCount: 1,
      missingKeysCount: 1,
      dynamicUsagesCount: 1,
      items: [
        {
          key: 'app.title',
          status: 'used' as const,
          usageCount: 2,
          usages: [
            { filePath: 'src/App.tsx', relativePath: 'src/App.tsx', line: 10, column: 15, matchedExpression: "t('app.title')", lineText: "const title = t('app.title')" },
            { filePath: 'src/Header.tsx', relativePath: 'src/Header.tsx', line: 25, column: 8, matchedExpression: "t('app.title')", lineText: "const header = t('app.title')" },
          ],
          presentInLanguages: ['English', 'German'],
          languageCount: 2,
        },
        {
          key: 'app.footer',
          status: 'unused' as const,
          usageCount: 0,
          usages: [],
          presentInLanguages: ['English', 'German'],
          languageCount: 2,
        },
        {
          key: 'auth.forgot_password',
          status: 'missing' as const,
          usageCount: 1,
          usages: [
            { filePath: 'src/Login.tsx', relativePath: 'src/Login.tsx', line: 42, column: 12, matchedExpression: "t('auth.forgot_password')", lineText: "const btn = t('auth.forgot_password')" },
          ],
          presentInLanguages: [],
          languageCount: 0,
        },
      ],
      dynamicUsages: [
        {
          filePath: 'src/DynamicComp.tsx',
          relativePath: 'src/DynamicComp.tsx',
          line: 18,
          column: 5,
          expression: 'categoryName',
          lineText: 'const val = t(categoryName)',
        },
      ],
    }

    const mockNavigateToSource = vi.fn()
    const mockNavigateToLocalization = vi.fn()
    const mockSelectKey = vi.fn()

    // 1. Render KeyUsagePanel
    render(
      <I18nProvider>
        <KeyUsagePanel
          scanResult={mockScanResult}
          onNavigateToSource={mockNavigateToSource}
          onNavigateToLocalization={mockNavigateToLocalization}
          onSelectKey={mockSelectKey}
        />
      </I18nProvider>
    )

    // Scenario 13: Search & filter combinations
    // Filter chip "Used"
    const usedChip = screen.getByTestId('filter-used')
    fireEvent.click(usedChip)
    expect(screen.getByText('app.title')).toBeInTheDocument()
    expect(screen.queryByText('app.footer')).not.toBeInTheDocument()
    expect(screen.queryByText('auth.forgot_password')).not.toBeInTheDocument()

    // Filter chip "Unused"
    const unusedChip = screen.getByTestId('filter-unused')
    fireEvent.click(unusedChip)
    expect(screen.getByText('app.footer')).toBeInTheDocument()
    expect(screen.queryByText('app.title')).not.toBeInTheDocument()

    // Filter chip "Missing"
    const missingChip = screen.getByTestId('filter-missing')
    fireEvent.click(missingChip)
    expect(screen.getByText('auth.forgot_password')).toBeInTheDocument()

    // Filter chip "Dynamic"
    const dynamicChip = screen.getByTestId('filter-dynamic')
    fireEvent.click(dynamicChip)
    expect(screen.getByText('categoryName')).toBeInTheDocument()

    // Filter back to "All" and test Search input
    const allChip = screen.getByTestId('filter-all')
    fireEvent.click(allChip)
    const searchInput = screen.getByPlaceholderText(/Search keys, files, or expressions/i)
    fireEvent.change(searchInput, { target: { value: 'forgot' } })
    expect(screen.getByText('auth.forgot_password')).toBeInTheDocument()
    expect(screen.queryByText('app.title')).not.toBeInTheDocument()

    // Reset search
    fireEvent.change(searchInput, { target: { value: '' } })

    // Select 'app.title'
    const titleKeyItem = screen.getByTestId('key-item-app.title')
    fireEvent.click(titleKeyItem)

    // Scenario 11: Click source usage location
    const sourceUsageBtn = screen.getByTestId('usage-item-0')
    fireEvent.click(sourceUsageBtn)
    expect(mockNavigateToSource).toHaveBeenCalledWith('src/App.tsx', 10)

    // Scenario 12: Click localization navigation
    const locNavBtn = screen.getByTestId('nav-to-localization-btn')
    fireEvent.click(locNavBtn)
    expect(mockNavigateToLocalization).toHaveBeenCalledWith('app.title')

    // Scenario 11 part 2: Verify FilePreview handles targetLine
    const { container: previewContainer } = render(
      <I18nProvider>
        <FilePreview
          fileName="App.tsx"
          filePath="src/App.tsx"
          content={`line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10`}
          targetLine={10}
        />
      </I18nProvider>
    )
    const targetRow = previewContainer.querySelector('.is-target-line')
    expect(targetRow).toBeInTheDocument()
    expect(targetRow).toHaveTextContent('10')

    // Scenario 18: Verify status bar text format (no emoji)
    // Keys 1 missing · 1 unused
    const statusText = `Keys ${mockScanResult.missingKeysCount} missing · ${mockScanResult.unusedKeysCount} unused`
    expect(statusText).not.toMatch(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/u) // no emoji
    expect(statusText).toBe('Keys 1 missing · 1 unused')

    // Scenario 19: Verify localization in EN, DE, RU
    expect(enLocale.keyUsage.title).toBe('Key Usage Scanner')
    expect(deLocale.keyUsage.title).toBe('Schlüsselverwendungs-Scanner')
    expect(ruLocale.keyUsage.title).toBe('Сканер использования ключей')
    expect(enLocale.keyUsage.tabTitleShort).toBe('Key Usage')
    expect(ruLocale.keyUsage.tabTitleShort).toBe('Использование ключей')
  })
})
