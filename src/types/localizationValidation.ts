import type {
  LocalizationQualityIssue,
  QualityIssueSeverity,
  QualityIssueType,
} from './localizationQuality'

export type PreflightValidationStatus = 'PASS' | 'WARNINGS' | 'FAILED'

export type PreflightCheckCategory =
  | 'missing_translations'
  | 'placeholder_mismatches'
  | 'tag_mismatches'
  | 'structural_conflicts'
  | 'empty_translations'
  | 'whitespace_mismatches'
  | 'same_as_reference'

export interface PreflightCheckSummary {
  category: PreflightCheckCategory
  type: QualityIssueType
  severity: QualityIssueSeverity
  labelKey: string
  count: number
  status: 'pass' | 'warn' | 'fail'
  issues: LocalizationQualityIssue[]
}

export interface PreflightAffectedFile {
  filename: string
  languageCode: string
  languageName: string
  errorCount: number
  warningCount: number
  infoCount: number
  totalCount: number
  issues: LocalizationQualityIssue[]
}

export interface PreflightAffectedLanguage {
  languageCode: string
  languageName: string
  errorCount: number
  warningCount: number
  infoCount: number
  totalCount: number
}

export interface WorkspacePreflightReport {
  status: PreflightValidationStatus
  timestamp: number
  totalIssues: number
  totalErrors: number
  totalWarnings: number
  totalInfo: number
  affectedFilesCount: number
  affectedLanguagesCount: number
  affectedKeysCount: number
  checks: PreflightCheckSummary[]
  affectedFiles: PreflightAffectedFile[]
  affectedLanguages: PreflightAffectedLanguage[]
  allIssues: LocalizationQualityIssue[]
}
