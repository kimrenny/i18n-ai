import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProblemsPanel } from './ProblemsPanel'
import { I18nProvider } from '../../i18n/I18nContext'
import type { WorkspaceProblemsSummary, LocalizationProblem } from '../../types/localizationProblems'

describe('ProblemsPanel component', () => {
  const mockProblems: LocalizationProblem[] = [
    {
      id: 'de.json:missing:actions.delete',
      type: 'missing',
      filename: 'de.json',
      path: '/locales/de.json',
      languageCode: 'de',
      languageName: 'German',
      key: 'actions.delete',
    },
    {
      id: 'de.json:empty:app.desc',
      type: 'empty',
      filename: 'de.json',
      path: '/locales/de.json',
      languageCode: 'de',
      languageName: 'German',
      key: 'app.desc',
    },
    {
      id: 'fr.json:missing:actions.cancel',
      type: 'missing',
      filename: 'fr.json',
      path: '/locales/fr.json',
      languageCode: 'fr',
      languageName: 'French',
      key: 'actions.cancel',
    },
  ]

  const mockSummary: WorkspaceProblemsSummary = {
    totalProblems: 3,
    totalMissing: 2,
    totalEmpty: 1,
    problems: mockProblems,
    groups: [
      {
        filename: 'de.json',
        path: '/locales/de.json',
        languageCode: 'de',
        languageName: 'German',
        missingCount: 1,
        emptyCount: 1,
        totalCount: 2,
        problems: [mockProblems[0], mockProblems[1]],
      },
      {
        filename: 'fr.json',
        path: '/locales/fr.json',
        languageCode: 'fr',
        languageName: 'French',
        missingCount: 1,
        emptyCount: 0,
        totalCount: 1,
        problems: [mockProblems[2]],
      },
    ],
  }

  const renderWithI18n = (ui: React.ReactElement) => {
    return render(<I18nProvider language="en">{ui}</I18nProvider>)
  }

  it('renders nothing when isOpen is false', () => {
    renderWithI18n(
      <ProblemsPanel
        isOpen={false}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateProblem={vi.fn()}
      />
    )

    expect(screen.queryByTestId('problems-panel')).not.toBeInTheDocument()
  })

  it('renders empty state when totalProblems is 0', () => {
    const emptySummary: WorkspaceProblemsSummary = {
      totalProblems: 0,
      totalMissing: 0,
      totalEmpty: 0,
      problems: [],
      groups: [],
    }

    renderWithI18n(
      <ProblemsPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={emptySummary}
        onNavigateProblem={vi.fn()}
      />
    )

    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
    expect(screen.getByTestId('problems-total-badge')).toHaveTextContent('0')
    expect(screen.getByTestId('problems-empty-all-complete')).toBeInTheDocument()
    expect(screen.getByText(/no localization problems/i)).toBeInTheDocument()
  })

  it('renders grouped problem list with headers and counts', () => {
    renderWithI18n(
      <ProblemsPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateProblem={vi.fn()}
      />
    )

    expect(screen.getByTestId('problems-total-badge')).toHaveTextContent('3')
    expect(screen.getByTestId('problems-group-de.json')).toBeInTheDocument()
    expect(screen.getByTestId('problems-group-fr.json')).toBeInTheDocument()

    expect(screen.getByTestId('problem-item-de.json:missing:actions.delete')).toHaveTextContent('actions.delete')
    expect(screen.getByTestId('problem-item-de.json:empty:app.desc')).toHaveTextContent('app.desc')
    expect(screen.getByTestId('problem-item-fr.json:missing:actions.cancel')).toHaveTextContent('actions.cancel')
  })

  it('filters by language dropdown', () => {
    renderWithI18n(
      <ProblemsPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateProblem={vi.fn()}
      />
    )

    const langFilter = screen.getByTestId('problems-language-filter')
    fireEvent.change(langFilter, { target: { value: 'de.json' } })

    expect(screen.getByTestId('problems-group-de.json')).toBeInTheDocument()
    expect(screen.queryByTestId('problems-group-fr.json')).not.toBeInTheDocument()
  })

  it('filters by problem type dropdown (missing vs empty)', () => {
    renderWithI18n(
      <ProblemsPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateProblem={vi.fn()}
      />
    )

    const typeFilter = screen.getByTestId('problems-type-filter')
    fireEvent.change(typeFilter, { target: { value: 'empty' } })

    expect(screen.getByTestId('problem-item-de.json:empty:app.desc')).toBeInTheDocument()
    expect(screen.queryByTestId('problem-item-de.json:missing:actions.delete')).not.toBeInTheDocument()
    expect(screen.queryByTestId('problem-item-fr.json:missing:actions.cancel')).not.toBeInTheDocument()
  })

  it('invokes onNavigateProblem when clicking a problem item or pressing Enter/Space', () => {
    const mockNavigate = vi.fn()
    renderWithI18n(
      <ProblemsPanel
        isOpen={true}
        onClose={vi.fn()}
        summary={mockSummary}
        onNavigateProblem={mockNavigate}
      />
    )

    const problemRow = screen.getByTestId('problem-item-de.json:missing:actions.delete')
    fireEvent.click(problemRow)

    expect(mockNavigate).toHaveBeenCalledWith(mockProblems[0])

    fireEvent.keyDown(problemRow, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(problemRow, { key: ' ' })
    expect(mockNavigate).toHaveBeenCalledTimes(3)
  })

  it('invokes onClose when clicking close button', () => {
    const mockClose = vi.fn()
    renderWithI18n(
      <ProblemsPanel
        isOpen={true}
        onClose={mockClose}
        summary={mockSummary}
        onNavigateProblem={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('problems-close-btn'))
    expect(mockClose).toHaveBeenCalledTimes(1)
  })
})
