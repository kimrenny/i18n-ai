import { describe, it, expect } from 'vitest'
import { validateWorkspacePreflight } from './localizationValidation'
import type {
  WorkspaceQualitySummary,
  LocalizationQualityIssue,
} from '../types/localizationQuality'

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

describe('localizationValidation service', () => {
  it('returns PASS status for a completely clean workspace', () => {
    const summary = createMockQualitySummary([])
    const report = validateWorkspacePreflight(summary)

    expect(report.status).toBe('PASS')
    expect(report.totalIssues).toBe(0)
    expect(report.totalErrors).toBe(0)
    expect(report.totalWarnings).toBe(0)
    expect(report.totalInfo).toBe(0)
    expect(report.affectedFilesCount).toBe(0)
    expect(report.affectedLanguagesCount).toBe(0)
    expect(report.affectedKeysCount).toBe(0)
    expect(report.checks.every((c) => c.status === 'pass' && c.count === 0)).toBe(true)
  })

  it('maintains PASS status when only informational issues exist', () => {
    const summary = createMockQualitySummary([
      {
        id: 'ru.json:same_as_reference:brand.name',
        type: 'same_as_reference',
        severity: 'info',
        filename: 'ru.json',
        key: 'brand.name',
        referenceFilename: 'en.json',
        message: 'Translation is identical to reference',
        languageCode: 'ru',
        languageName: 'Russian',
      },
    ])

    const report = validateWorkspacePreflight(summary)

    expect(report.status).toBe('PASS')
    expect(report.totalIssues).toBe(1)
    expect(report.totalErrors).toBe(0)
    expect(report.totalWarnings).toBe(0)
    expect(report.totalInfo).toBe(1)
    expect(report.affectedFilesCount).toBe(1)
    expect(report.affectedLanguagesCount).toBe(1)
    expect(report.affectedKeysCount).toBe(1)

    const sameAsRefCheck = report.checks.find((c) => c.category === 'same_as_reference')
    expect(sameAsRefCheck?.count).toBe(1)
    expect(sameAsRefCheck?.status).toBe('pass')
  })

  it('returns WARNINGS status when only warnings (e.g. empty or whitespace) exist', () => {
    const summary = createMockQualitySummary([
      {
        id: 'de.json:empty_translation:auth.forgot_password',
        type: 'empty_translation',
        severity: 'warning',
        filename: 'de.json',
        key: 'auth.forgot_password',
        referenceFilename: 'en.json',
        message: 'Translation value is empty',
        languageCode: 'de',
        languageName: 'German',
      },
      {
        id: 'fr.json:whitespace_mismatch:ui.button',
        type: 'whitespace_mismatch',
        severity: 'warning',
        filename: 'fr.json',
        key: 'ui.button',
        referenceFilename: 'en.json',
        message: 'Leading whitespace mismatch',
        languageCode: 'fr',
        languageName: 'French',
      },
    ])

    const report = validateWorkspacePreflight(summary)

    expect(report.status).toBe('WARNINGS')
    expect(report.totalErrors).toBe(0)
    expect(report.totalWarnings).toBe(2)
    expect(report.totalInfo).toBe(0)
    expect(report.affectedFilesCount).toBe(2)
    expect(report.affectedLanguagesCount).toBe(2)
    expect(report.affectedKeysCount).toBe(2)

    const emptyCheck = report.checks.find((c) => c.category === 'empty_translations')
    expect(emptyCheck?.count).toBe(1)
    expect(emptyCheck?.status).toBe('warn')

    const wsCheck = report.checks.find((c) => c.category === 'whitespace_mismatches')
    expect(wsCheck?.count).toBe(1)
    expect(wsCheck?.status).toBe('warn')
  })

  it('returns FAILED status when blocking errors exist (even if warnings & info are present)', () => {
    const summary = createMockQualitySummary([
      {
        id: 'ja.json:missing_translation:auth.login',
        type: 'missing_translation',
        severity: 'error',
        filename: 'ja.json',
        key: 'auth.login',
        referenceFilename: 'en.json',
        message: 'Missing translation',
        languageCode: 'ja',
        languageName: 'Japanese',
      },
      {
        id: 'de.json:placeholder_mismatch:auth.welcome',
        type: 'placeholder_mismatch',
        severity: 'error',
        filename: 'de.json',
        key: 'auth.welcome',
        referenceFilename: 'en.json',
        message: 'Placeholder mismatch',
        languageCode: 'de',
        languageName: 'German',
      },
      {
        id: 'de.json:empty_translation:auth.logout',
        type: 'empty_translation',
        severity: 'warning',
        filename: 'de.json',
        key: 'auth.logout',
        referenceFilename: 'en.json',
        message: 'Empty translation',
        languageCode: 'de',
        languageName: 'German',
      },
    ])

    const report = validateWorkspacePreflight(summary)

    expect(report.status).toBe('FAILED')
    expect(report.totalErrors).toBe(2)
    expect(report.totalWarnings).toBe(1)
    expect(report.totalInfo).toBe(0)
    expect(report.affectedFilesCount).toBe(2)
    expect(report.affectedLanguagesCount).toBe(2)
    expect(report.affectedKeysCount).toBe(3)

    const missingCheck = report.checks.find((c) => c.category === 'missing_translations')
    expect(missingCheck?.count).toBe(1)
    expect(missingCheck?.status).toBe('fail')

    const phCheck = report.checks.find((c) => c.category === 'placeholder_mismatches')
    expect(phCheck?.count).toBe(1)
    expect(phCheck?.status).toBe('fail')
  })

  it('sorts affected files and affected languages deterministically by error count first', () => {
    const summary = createMockQualitySummary([
      {
        id: 'fr.json:empty_translation:key1',
        type: 'empty_translation',
        severity: 'warning',
        filename: 'fr.json',
        key: 'key1',
        referenceFilename: 'en.json',
        message: 'Empty translation',
        languageCode: 'fr',
        languageName: 'French',
      },
      {
        id: 'de.json:missing_translation:key2',
        type: 'missing_translation',
        severity: 'error',
        filename: 'de.json',
        key: 'key2',
        referenceFilename: 'en.json',
        message: 'Missing translation',
        languageCode: 'de',
        languageName: 'German',
      },
      {
        id: 'de.json:tag_mismatch:key3',
        type: 'tag_mismatch',
        severity: 'error',
        filename: 'de.json',
        key: 'key3',
        referenceFilename: 'en.json',
        message: 'Tag mismatch',
        languageCode: 'de',
        languageName: 'German',
      },
    ])

    const report = validateWorkspacePreflight(summary)

    // de.json has 2 errors, fr.json has 0 errors and 1 warning
    expect(report.affectedFiles[0].filename).toBe('de.json')
    expect(report.affectedFiles[0].errorCount).toBe(2)
    expect(report.affectedFiles[1].filename).toBe('fr.json')
    expect(report.affectedFiles[1].warningCount).toBe(1)

    expect(report.affectedLanguages[0].languageName).toBe('German')
    expect(report.affectedLanguages[1].languageName).toBe('French')
  })
})
