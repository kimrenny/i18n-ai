import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KeyUsagePanel } from './KeyUsagePanel'
import { I18nProvider } from '../../i18n/I18nContext'
import type { KeyUsageScanResult } from '../../types/keyUsage'

const mockScanResult: KeyUsageScanResult = {
  scannedFilesCount: 5,
  parsedFilesCount: 5,
  skippedFilesCount: 0,
  totalUniqueKeys: 3,
  usedKeysCount: 1,
  unusedKeysCount: 1,
  missingKeysCount: 1,
  dynamicUsagesCount: 1,
  items: [
    {
      key: 'app.title',
      status: 'used',
      usageCount: 2,
      usages: [
        {
          filePath: '/src/App.tsx',
          relativePath: 'src/App.tsx',
          line: 10,
          column: 5,
          matchedExpression: "t('app.title')",
          lineText: "<h1>{t('app.title')}</h1>",
        },
        {
          filePath: '/src/Header.tsx',
          relativePath: 'src/Header.tsx',
          line: 20,
          column: 3,
          matchedExpression: "t('app.title')",
          lineText: "title: t('app.title')",
        },
      ],
      presentInLanguages: ['English', 'German'],
      languageCount: 2,
    },
    {
      key: 'common.unused',
      status: 'unused',
      usageCount: 0,
      usages: [],
      presentInLanguages: ['English'],
      languageCount: 1,
    },
    {
      key: 'missing.code.key',
      status: 'missing',
      usageCount: 1,
      usages: [
        {
          filePath: '/src/Widget.tsx',
          relativePath: 'src/Widget.tsx',
          line: 42,
          column: 8,
          matchedExpression: "t('missing.code.key')",
          lineText: "t('missing.code.key')",
        },
      ],
      presentInLanguages: [],
      languageCount: 0,
    },
  ],
  dynamicUsages: [
    {
      filePath: '/src/Dynamic.tsx',
      relativePath: 'src/Dynamic.tsx',
      line: 15,
      column: 4,
      expression: 't(`admin.${param}.label`)',
      lineText: 'const val = t(`admin.${param}.label`)',
    },
  ],
}

describe('KeyUsagePanel', () => {
  it('renders stats summary and key list', () => {
    render(<KeyUsagePanel scanResult={mockScanResult} />)

    expect(screen.getByTestId('key-usage-stats-bar')).toBeInTheDocument()
    expect(screen.getByTestId('key-item-app.title')).toBeInTheDocument()
    expect(screen.getByTestId('key-item-common.unused')).toBeInTheDocument()
    expect(screen.getByTestId('key-item-missing.code.key')).toBeInTheDocument()
  })

  it('filters items by status chips', () => {
    render(<KeyUsagePanel scanResult={mockScanResult} />)

    // Click 'Used'
    fireEvent.click(screen.getByTestId('filter-used'))
    expect(screen.getByTestId('key-item-app.title')).toBeInTheDocument()
    expect(screen.queryByTestId('key-item-common.unused')).not.toBeInTheDocument()
    expect(screen.queryByTestId('key-item-missing.code.key')).not.toBeInTheDocument()

    // Click 'Unused'
    fireEvent.click(screen.getByTestId('filter-unused'))
    expect(screen.queryByTestId('key-item-app.title')).not.toBeInTheDocument()
    expect(screen.getByTestId('key-item-common.unused')).toBeInTheDocument()

    // Click 'Missing'
    fireEvent.click(screen.getByTestId('filter-missing'))
    expect(screen.queryByTestId('key-item-app.title')).not.toBeInTheDocument()
    expect(screen.getByTestId('key-item-missing.code.key')).toBeInTheDocument()

    // Click 'Dynamic'
    fireEvent.click(screen.getByTestId('filter-dynamic'))
    expect(screen.getByTestId('dynamic-usage-item-0')).toBeInTheDocument()
  })

  it('filters items by search input', () => {
    render(<KeyUsagePanel scanResult={mockScanResult} />)

    const searchInput = screen.getByTestId('key-usage-search-input')
    fireEvent.change(searchInput, { target: { value: 'missing' } })

    expect(screen.queryByTestId('key-item-app.title')).not.toBeInTheDocument()
    expect(screen.getByTestId('key-item-missing.code.key')).toBeInTheDocument()
  })

  it('shows details and invokes onNavigateToSource when clicking a usage item', () => {
    const onNavigateToSource = vi.fn()
    render(
      <KeyUsagePanel
        scanResult={mockScanResult}
        selectedKeyPath="app.title"
        onNavigateToSource={onNavigateToSource}
      />
    )

    expect(screen.getByTestId('usage-item-0')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('usage-item-0'))

    expect(onNavigateToSource).toHaveBeenCalledWith('/src/App.tsx', 10)
  })

  it('invokes onNavigateToLocalization when clicking localization navigation button', () => {
    const onNavigateToLocalization = vi.fn()
    render(
      <KeyUsagePanel
        scanResult={mockScanResult}
        selectedKeyPath="app.title"
        onNavigateToLocalization={onNavigateToLocalization}
      />
    )

    const navBtn = screen.getByTestId('nav-to-localization-btn')
    fireEvent.click(navBtn)
    expect(onNavigateToLocalization).toHaveBeenCalledWith('app.title')
  })

  it('renders translated copy button in English and Russian without raw key fallback', () => {
    // English
    const { unmount } = render(
      <I18nProvider language="en">
        <KeyUsagePanel scanResult={mockScanResult} selectedKeyPath="app.title" />
      </I18nProvider>
    )

    const copyBtnEn = screen.getByRole('button', { name: 'Copy' })
    expect(copyBtnEn).toBeInTheDocument()
    expect(copyBtnEn).toHaveTextContent('Copy')
    expect(copyBtnEn).not.toHaveTextContent('common.copy')
    unmount()

    // Russian
    render(
      <I18nProvider language="ru">
        <KeyUsagePanel scanResult={mockScanResult} selectedKeyPath="app.title" />
      </I18nProvider>
    )

    const copyBtnRu = screen.getByRole('button', { name: 'Копировать' })
    expect(copyBtnRu).toBeInTheDocument()
    expect(copyBtnRu).toHaveTextContent('Копировать')
    expect(copyBtnRu).not.toHaveTextContent('common.copy')
  })
})

