import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PreflightValidatorPanel } from './PreflightValidatorPanel'
import { validateWorkspacePreflight } from '../../services/localizationValidation'
import type {
  WorkspaceQualitySummary,
  LocalizationQualityIssue,
} from '../../types/localizationQuality'

function createMockQualitySummary(
  issues: LocalizationQualityIssue[] = []
): WorkspaceQualitySummary {
  let errorCount = 0
  let warningCount = 0
  let infoCount = 0

  const bySeverity: WorkspaceQualitySummary['bySeverity'] = {
    error: [],
    warning: [],
    info: [],
  }

  const byType: WorkspaceQualitySummary['byType'] = {
    missing_translation: [],
    empty_translation: [],
    placeholder_mismatch: [],
    tag_mismatch: [],
    same_as_reference: [],
    whitespace_mismatch: [],
    structural_conflict: [],
  }

  const byFile: WorkspaceQualitySummary['byFile'] = {}

  for (const issue of issues) {
    if (issue.severity === 'error') errorCount++
    if (issue.severity === 'warning') warningCount++
    if (issue.severity === 'info') infoCount++

    bySeverity[issue.severity].push(issue)
    byType[issue.type].push(issue)

    if (!byFile[issue.filename]) {
      byFile[issue.filename] = []
    }
    byFile[issue.filename].push(issue)
  }

  return {
    totalIssues: issues.length,
    totalErrors: errorCount,
    totalWarnings: warningCount,
    totalInfos: infoCount,
    errorCount,
    warningCount,
    infoCount,
    issues,
    bySeverity,
    byType,
    byFile,
  }
}

describe('PreflightValidatorPanel component', () => {
  it('does not render when isOpen is false', () => {
    const report = validateWorkspacePreflight(createMockQualitySummary([]))
    const { container } = render(
      <PreflightValidatorPanel
        isOpen={false}
        onClose={vi.fn()}
        report={report}
        onNavigateQuality={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders clean READY state when 0 errors and 0 warnings exist', () => {
    const report = validateWorkspacePreflight(createMockQualitySummary([]))
    render(
      <PreflightValidatorPanel
        isOpen={true}
        onClose={vi.fn()}
        report={report}
        onNavigateQuality={vi.fn()}
      />
    )

    expect(screen.getByTestId('preflight-panel')).toBeInTheDocument()
    expect(screen.getByTestId('preflight-status-badge')).toHaveTextContent(/Ready|Готово|Passed/i)
    expect(screen.getByTestId('preflight-hero-card')).toBeInTheDocument()
    expect(screen.getByTestId('preflight-clean-state')).toBeInTheDocument()
  })

  it('renders FAILED state with error counts and allows category & file filtering', () => {
    const issues: LocalizationQualityIssue[] = [
      {
        id: 'de.json:missing_translation:auth.login',
        type: 'missing_translation',
        severity: 'error',
        filename: 'de.json',
        key: 'auth.login',
        referenceFilename: 'en.json',
        message: 'Missing translation',
        languageCode: 'de',
        languageName: 'German',
      },
      {
        id: 'fr.json:empty_translation:auth.logout',
        type: 'empty_translation',
        severity: 'warning',
        filename: 'fr.json',
        key: 'auth.logout',
        referenceFilename: 'en.json',
        message: 'Empty translation',
        languageCode: 'fr',
        languageName: 'French',
      },
    ]

    const report = validateWorkspacePreflight(createMockQualitySummary(issues))
    const mockNavigate = vi.fn()
    const mockClose = vi.fn()
    const mockRunValidation = vi.fn()

    render(
      <PreflightValidatorPanel
        isOpen={true}
        onClose={mockClose}
        report={report}
        onRunValidation={mockRunValidation}
        onNavigateQuality={mockNavigate}
      />
    )

    expect(screen.getByTestId('preflight-status-badge')).toBeInTheDocument()
    expect(screen.getByTestId('preflight-issue-de.json:missing_translation:auth.login')).toBeInTheDocument()
    expect(screen.getByTestId('preflight-issue-fr.json:empty_translation:auth.logout')).toBeInTheDocument()

    // Click Run Validation
    const runBtn = screen.getByTestId('preflight-run-btn')
    fireEvent.click(runBtn)
    expect(mockRunValidation).toHaveBeenCalled()

    // Filter by category: missing_translations
    const missingCheckBtn = screen.getByTestId('preflight-check-missing_translations')
    fireEvent.click(missingCheckBtn)
    expect(screen.getByTestId('preflight-issue-de.json:missing_translation:auth.login')).toBeInTheDocument()
    expect(screen.queryByTestId('preflight-issue-fr.json:empty_translation:auth.logout')).not.toBeInTheDocument()

    // Reset category filter
    const resetCatBtn = screen.getByTestId('preflight-reset-category-filter')
    fireEvent.click(resetCatBtn)
    expect(screen.getByTestId('preflight-issue-fr.json:empty_translation:auth.logout')).toBeInTheDocument()

    // Filter by file: fr.json
    const frFileBtn = screen.getByTestId('preflight-file-fr.json')
    fireEvent.click(frFileBtn)
    expect(screen.queryByTestId('preflight-issue-de.json:missing_translation:auth.login')).not.toBeInTheDocument()
    expect(screen.getByTestId('preflight-issue-fr.json:empty_translation:auth.logout')).toBeInTheDocument()

    // Click issue row to navigate
    const frIssue = screen.getByTestId('preflight-issue-fr.json:empty_translation:auth.logout')
    fireEvent.click(frIssue)
    expect(mockNavigate).toHaveBeenCalledWith(issues[1])

    // Close panel
    const closeBtn = screen.getByTestId('preflight-close-btn')
    fireEvent.click(closeBtn)
    expect(mockClose).toHaveBeenCalled()
  })
})
