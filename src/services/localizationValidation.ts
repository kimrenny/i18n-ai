import type {
  WorkspaceQualitySummary,
  QualityIssueType,
} from '../types/localizationQuality'
import type {
  WorkspacePreflightReport,
  PreflightCheckSummary,
  PreflightCheckCategory,
  PreflightAffectedFile,
  PreflightAffectedLanguage,
  PreflightValidationStatus,
} from '../types/localizationValidation'

const CHECK_DEFINITIONS: Array<{
  category: PreflightCheckCategory
  type: QualityIssueType
  labelKey: string
}> = [
  {
    category: 'missing_translations',
    type: 'missing_translation',
    labelKey: 'preflight.checkMissing',
  },
  {
    category: 'placeholder_mismatches',
    type: 'placeholder_mismatch',
    labelKey: 'preflight.checkPlaceholders',
  },
  {
    category: 'tag_mismatches',
    type: 'tag_mismatch',
    labelKey: 'preflight.checkTags',
  },
  {
    category: 'structural_conflicts',
    type: 'structural_conflict',
    labelKey: 'preflight.checkStructural',
  },
  {
    category: 'empty_translations',
    type: 'empty_translation',
    labelKey: 'preflight.checkEmpty',
  },
  {
    category: 'whitespace_mismatches',
    type: 'whitespace_mismatch',
    labelKey: 'preflight.checkWhitespace',
  },
  {
    category: 'same_as_reference',
    type: 'same_as_reference',
    labelKey: 'preflight.checkSameAsReference',
  },
]

/**
 * Pure aggregation function that performs production-readiness validation of the workspace
 * by aggregating existing quality and structural checks into a deterministic pre-flight report.
 */
export function validateWorkspacePreflight(
  qualitySummary: WorkspaceQualitySummary
): WorkspacePreflightReport {
  const allIssues = qualitySummary.issues || []

  // Build check summaries
  const checks: PreflightCheckSummary[] = CHECK_DEFINITIONS.map((def) => {
    const issues = qualitySummary.byType?.[def.type] || []
    const count = issues.length
    const sampleSeverity = issues[0]?.severity || (
      def.category === 'empty_translations' || def.category === 'whitespace_mismatches'
        ? 'warning'
        : def.category === 'same_as_reference'
        ? 'info'
        : 'error'
    )

    let status: 'pass' | 'warn' | 'fail' = 'pass'
    if (count > 0) {
      if (sampleSeverity === 'error') {
        status = 'fail'
      } else if (sampleSeverity === 'warning') {
        status = 'warn'
      } else {
        status = 'pass'
      }
    }

    return {
      category: def.category,
      type: def.type,
      severity: sampleSeverity,
      labelKey: def.labelKey,
      count,
      status,
      issues,
    }
  })

  // Calculate overall status
  let status: PreflightValidationStatus = 'PASS'
  if (qualitySummary.totalErrors > 0) {
    status = 'FAILED'
  } else if (qualitySummary.totalWarnings > 0) {
    status = 'WARNINGS'
  } else {
    status = 'PASS'
  }

  // Aggregate affected files
  const fileMap = new Map<string, PreflightAffectedFile>()
  for (const issue of allIssues) {
    let fileEntry = fileMap.get(issue.filename)
    if (!fileEntry) {
      fileEntry = {
        filename: issue.filename,
        languageCode: issue.languageCode,
        languageName: issue.languageName,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        totalCount: 0,
        issues: [],
      }
      fileMap.set(issue.filename, fileEntry)
    }

    if (issue.severity === 'error') fileEntry.errorCount++
    if (issue.severity === 'warning') fileEntry.warningCount++
    if (issue.severity === 'info') fileEntry.infoCount++
    fileEntry.totalCount++
    fileEntry.issues.push(issue)
  }

  const affectedFiles = Array.from(fileMap.values()).sort((a, b) => {
    if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount
    if (b.warningCount !== a.warningCount) return b.warningCount - a.warningCount
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount
    return a.filename.localeCompare(b.filename)
  })

  // Aggregate affected languages
  const langMap = new Map<string, PreflightAffectedLanguage>()
  for (const issue of allIssues) {
    const key = issue.languageCode || issue.languageName
    let langEntry = langMap.get(key)
    if (!langEntry) {
      langEntry = {
        languageCode: issue.languageCode,
        languageName: issue.languageName,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        totalCount: 0,
      }
      langMap.set(key, langEntry)
    }

    if (issue.severity === 'error') langEntry.errorCount++
    if (issue.severity === 'warning') langEntry.warningCount++
    if (issue.severity === 'info') langEntry.infoCount++
    langEntry.totalCount++
  }

  const affectedLanguages = Array.from(langMap.values()).sort((a, b) => {
    if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount
    if (b.warningCount !== a.warningCount) return b.warningCount - a.warningCount
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount
    return a.languageName.localeCompare(b.languageName)
  })

  // Calculate unique affected keys count
  const uniqueKeys = new Set(allIssues.map((i) => i.key))

  return {
    status,
    timestamp: Date.now(),
    totalIssues: qualitySummary.totalIssues || 0,
    totalErrors: qualitySummary.totalErrors || 0,
    totalWarnings: qualitySummary.totalWarnings || 0,
    totalInfo: qualitySummary.totalInfos || 0,
    affectedFilesCount: affectedFiles.length,
    affectedLanguagesCount: affectedLanguages.length,
    affectedKeysCount: uniqueKeys.size,
    checks,
    affectedFiles,
    affectedLanguages,
    allIssues,
  }
}
