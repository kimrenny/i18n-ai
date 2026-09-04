import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TranslationCoverageDashboard } from './TranslationCoverageDashboard'
import { I18nProvider } from '../../i18n/I18nContext'
import type { WorkspaceCoverageSummary } from '../../types/localizationCoverage'

describe('TranslationCoverageDashboard component', () => {
  const mockSummary: WorkspaceCoverageSummary = {
    totalFiles: 3,
    totalLanguages: 3,
    totalReferenceKeys: 100,
    totalMissingKeys: 15,
    totalEmptyKeys: 5,
    averageCoverage: 90,
    referenceLanguageCode: 'en',
    referenceLanguageName: 'English',
    referenceFilename: 'en.json',
    items: [
      {
        filename: 'en.json',
        path: '/proj/locales/en.json',
        languageCode: 'en',
        languageName: 'English',
        isReference: true,
        totalExpectedKeys: 100,
        translatedKeysCount: 100,
        missingKeysCount: 0,
        emptyKeysCount: 0,
        coveragePercentage: 100,
        issuesCount: 0,
      },
      {
        filename: 'ua.json',
        path: '/proj/locales/ua.json',
        languageCode: 'uk',
        languageName: 'Ukrainian',
        isReference: false,
        totalExpectedKeys: 100,
        translatedKeysCount: 95,
        missingKeysCount: 5,
        emptyKeysCount: 0,
        coveragePercentage: 95,
        issuesCount: 5,
      },
      {
        filename: 'de.json',
        path: '/proj/locales/de.json',
        languageCode: 'de',
        languageName: 'German',
        isReference: false,
        totalExpectedKeys: 100,
        translatedKeysCount: 85,
        missingKeysCount: 10,
        emptyKeysCount: 5,
        coveragePercentage: 85,
        issuesCount: 15,
      },
    ],
    leastCompleteLanguages: [
      {
        filename: 'de.json',
        path: '/proj/locales/de.json',
        languageCode: 'de',
        languageName: 'German',
        isReference: false,
        totalExpectedKeys: 100,
        translatedKeysCount: 85,
        missingKeysCount: 10,
        emptyKeysCount: 5,
        coveragePercentage: 85,
        issuesCount: 15,
      },
      {
        filename: 'ua.json',
        path: '/proj/locales/ua.json',
        languageCode: 'uk',
        languageName: 'Ukrainian',
        isReference: false,
        totalExpectedKeys: 100,
        translatedKeysCount: 95,
        missingKeysCount: 5,
        emptyKeysCount: 0,
        coveragePercentage: 95,
        issuesCount: 5,
      },
    ],
  }

  it('renders top metric cards, reference language badge, and language rows', () => {
    const handleSelect = vi.fn()
    render(
      <I18nProvider language="en">
        <TranslationCoverageDashboard summary={mockSummary} onSelectLanguage={handleSelect} />
      </I18nProvider>
    )

    expect(screen.getByTestId('metric-languages')).toHaveTextContent('3')
    expect(screen.getByTestId('metric-files')).toHaveTextContent('3')
    expect(screen.getByTestId('metric-total-keys')).toHaveTextContent('100')
    expect(screen.getByTestId('metric-average-coverage')).toHaveTextContent('90%')
    expect(screen.getByTestId('reference-language-badge')).toHaveTextContent('English (en.json)')

    // Language rows
    expect(screen.getByTestId('coverage-row-en.json')).toHaveTextContent('English')
    expect(screen.getByTestId('ref-pill-en.json')).toHaveTextContent('Reference')
    expect(screen.getByTestId('coverage-row-ua.json')).toHaveTextContent('Ukrainian')
    expect(screen.getByTestId('coverage-row-de.json')).toHaveTextContent('German')
  })

  it('clicking a language row calls onSelectLanguage with its filename', () => {
    const handleSelect = vi.fn()
    render(
      <I18nProvider language="en">
        <TranslationCoverageDashboard summary={mockSummary} onSelectLanguage={handleSelect} />
      </I18nProvider>
    )

    fireEvent.click(screen.getByTestId('coverage-row-de.json'))
    expect(handleSelect).toHaveBeenCalledWith('de.json')
  })

  it('clicking an item in least complete calls onSelectLanguage with its filename', () => {
    const handleSelect = vi.fn()
    render(
      <I18nProvider language="en">
        <TranslationCoverageDashboard summary={mockSummary} onSelectLanguage={handleSelect} />
      </I18nProvider>
    )

    fireEvent.click(screen.getByTestId('least-complete-de.json'))
    expect(handleSelect).toHaveBeenCalledWith('de.json')
  })

  it('renders empty state when totalFiles is 0', () => {
    const emptySummary: WorkspaceCoverageSummary = {
      totalFiles: 0,
      totalLanguages: 0,
      totalReferenceKeys: 0,
      totalMissingKeys: 0,
      totalEmptyKeys: 0,
      averageCoverage: null,
      referenceLanguageCode: '',
      referenceLanguageName: '',
      referenceFilename: '',
      leastCompleteLanguages: [],
      items: [],
    }

    render(
      <I18nProvider language="en">
        <TranslationCoverageDashboard summary={emptySummary} onSelectLanguage={vi.fn()} />
      </I18nProvider>
    )

    expect(screen.getByTestId('coverage-dashboard-empty')).toBeInTheDocument()
    expect(screen.getByText(/No localization files detected/i)).toBeInTheDocument()
  })
})
