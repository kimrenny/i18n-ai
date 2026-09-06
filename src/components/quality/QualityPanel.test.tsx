import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QualityPanel } from './QualityPanel'
import { I18nProvider } from '../../i18n/I18nContext'
import type { WorkspaceQualitySummary, LocalizationQualityIssue } from '../../types/localizationQuality'

describe('QualityPanel component', () => {
  const mockIssues: LocalizationQualityIssue[] = [
    {
      id: 'de.json:placeholder_mismatch:greeting',
      type: 'placeholder_mismatch',
      severity: 'error',
      filename: 'de.json',
      referenceFilename: 'en.json',
      languageCode: 'de',
      languageName: 'German',
      key: 'greeting',
      message: 'Placeholder count mismatch: expected 2, found 1',
    },
    {
      id: 'de.json:whitespace_mismatch:app.title',
      type: 'whitespace_mismatch',
      severity: 'warning',
      filename: 'de.json',
      referenceFilename: 'en.json',
      languageCode: 'de',
      languageName: 'German',
      key: 'app.title',
      message: 'Leading whitespace mismatch with reference text',
    },
    {
      id: 'fr.json:same_as_reference:common.ok',
      type: 'same_as_reference',
      severity: 'info',
      filename: 'fr.json',
      referenceFilename: 'en.json',
      languageCode: 'fr',
      languageName: 'French',
      key: 'common.ok',
      message: 'Target translation is identical to reference value',
    },
  ]

  const mockSummary: WorkspaceQualitySummary = {
    totalIssues: 3,
    totalErrors: 1,
    totalWarnings: 1,
    totalInfos: 1,
    errorCount: 1,
    warningCount: 1,
    infoCount: 1,
    issues: mockIssues,
    byType: {
      missing_translation: [],
      empty_translation: [],
      placeholder_mismatch: [mockIssues[0]],
      tag_mismatch: [],
      same_as_reference: [mockIssues[2]],
      whitespace_mismatch: [mockIssues[1]],
      structural_conflict: [],
    },
    bySeverity: {
      error: [mockIssues[0]],
      warning: [mockIssues[1]],
      info: [mockIssues[2]],
    },
    byFile: {
      'de.json': [mockIssues[0], mockIssues[1]],
      'fr.json': [mockIssues[2]],
    },
  }

  const renderWithI18n = (ui: React.ReactElement) => {
    return render(<I18nProvider language="en">{ui}</I18nProvider>)
  }

  it('renders nothing when isOpen is false', () => {
    renderWithI18n(
      <QualityPanel
        isOpen={false}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateQuality={vi.fn()}
      />
    )

    expect(screen.queryByTestId('quality-panel')).not.toBeInTheDocument()
  })

  it('renders clean empty state when totalIssues is 0', () => {
    const emptySummary: WorkspaceQualitySummary = {
      totalIssues: 0,
      totalErrors: 0,
      totalWarnings: 0,
      totalInfos: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      issues: [],
      byType: {
        missing_translation: [],
        empty_translation: [],
        placeholder_mismatch: [],
        tag_mismatch: [],
        same_as_reference: [],
        whitespace_mismatch: [],
        structural_conflict: [],
      },
      bySeverity: {
        error: [],
        warning: [],
        info: [],
      },
      byFile: {},
    }

    renderWithI18n(
      <QualityPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={emptySummary}
        onNavigateQuality={vi.fn()}
      />
    )

    expect(screen.getByTestId('quality-panel')).toBeInTheDocument()
    expect(screen.getByTestId('quality-total-badge')).toHaveTextContent('0')
    expect(screen.getByTestId('quality-empty-all-clean')).toBeInTheDocument()
  })

  it('renders issue list with severity badges, key, language, and messages', () => {
    renderWithI18n(
      <QualityPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateQuality={vi.fn()}
      />
    )

    expect(screen.getByTestId('quality-total-badge')).toHaveTextContent('3')
    expect(screen.getByText('1E')).toBeInTheDocument()
    expect(screen.getByText('1W')).toBeInTheDocument()
    expect(screen.getByText('1I')).toBeInTheDocument()

    expect(screen.getByTestId('quality-item-de.json:placeholder_mismatch:greeting')).toBeInTheDocument()
    expect(screen.getByTestId('quality-item-de.json:whitespace_mismatch:app.title')).toBeInTheDocument()
    expect(screen.getByTestId('quality-item-fr.json:same_as_reference:common.ok')).toBeInTheDocument()
  })

  it('filters by language dropdown', () => {
    renderWithI18n(
      <QualityPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateQuality={vi.fn()}
      />
    )

    const langFilter = screen.getByTestId('quality-language-filter')
    fireEvent.change(langFilter, { target: { value: 'de.json' } })

    expect(screen.getByTestId('quality-item-de.json:placeholder_mismatch:greeting')).toBeInTheDocument()
    expect(screen.getByTestId('quality-item-de.json:whitespace_mismatch:app.title')).toBeInTheDocument()
    expect(screen.queryByTestId('quality-item-fr.json:same_as_reference:common.ok')).not.toBeInTheDocument()
  })

  it('filters by severity dropdown', () => {
    renderWithI18n(
      <QualityPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateQuality={vi.fn()}
      />
    )

    const severityFilter = screen.getByTestId('quality-severity-filter')
    fireEvent.change(severityFilter, { target: { value: 'error' } })

    expect(screen.getByTestId('quality-item-de.json:placeholder_mismatch:greeting')).toBeInTheDocument()
    expect(screen.queryByTestId('quality-item-de.json:whitespace_mismatch:app.title')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quality-item-fr.json:same_as_reference:common.ok')).not.toBeInTheDocument()
  })

  it('filters by issue type dropdown', () => {
    renderWithI18n(
      <QualityPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateQuality={vi.fn()}
      />
    )

    const typeFilter = screen.getByTestId('quality-type-filter')
    fireEvent.change(typeFilter, { target: { value: 'same_as_reference' } })

    expect(screen.getByTestId('quality-item-fr.json:same_as_reference:common.ok')).toBeInTheDocument()
    expect(screen.queryByTestId('quality-item-de.json:placeholder_mismatch:greeting')).not.toBeInTheDocument()
    expect(screen.queryByTestId('quality-item-de.json:whitespace_mismatch:app.title')).not.toBeInTheDocument()
  })

  it('navigates when clicking an issue row or pressing Enter/Space', () => {
    const mockNavigate = vi.fn()
    renderWithI18n(
      <QualityPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateQuality={mockNavigate}
      />
    )

    const issueRow = screen.getByTestId('quality-item-de.json:placeholder_mismatch:greeting')
    fireEvent.click(issueRow)
    expect(mockNavigate).toHaveBeenCalledWith(mockIssues[0])

    fireEvent.keyDown(issueRow, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(issueRow, { key: ' ' })
    expect(mockNavigate).toHaveBeenCalledTimes(3)
  })

  it('closes panel when clicking close button', () => {
    const mockClose = vi.fn()
    renderWithI18n(
      <QualityPanel
        isOpen={true}
        onClose={mockClose}
        summary={mockSummary}
        onNavigateQuality={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('quality-close-btn'))
    expect(mockClose).toHaveBeenCalledTimes(1)
  })
})
