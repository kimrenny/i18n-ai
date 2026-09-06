export type QualityIssueSeverity = 'error' | 'warning' | 'info'

export type QualityIssueType =
  | 'missing_translation'
  | 'empty_translation'
  | 'placeholder_mismatch'
  | 'tag_mismatch'
  | 'same_as_reference'
  | 'whitespace_mismatch'
  | 'structural_conflict'

export interface LocalizationQualityIssue {
  id: string
  type: QualityIssueType
  severity: QualityIssueSeverity
  filename: string
  key: string
  referenceFilename: string
  message: string
  languageCode: string
  languageName: string
  details?: {
    referenceValue?: string
    targetValue?: string
    missingPlaceholders?: string[]
    extraPlaceholders?: string[]
    missingTags?: string[]
    extraTags?: string[]
  }
}

export interface WorkspaceQualitySummary {
  totalIssues: number
  totalErrors: number
  totalWarnings: number
  totalInfos: number
  errorCount: number
  warningCount: number
  infoCount: number
  issues: LocalizationQualityIssue[]
  bySeverity: {
    error: LocalizationQualityIssue[]
    warning: LocalizationQualityIssue[]
    info: LocalizationQualityIssue[]
  }
  byType: Record<QualityIssueType, LocalizationQualityIssue[]>
  byFile: Record<string, LocalizationQualityIssue[]>
}

export interface QualityFilterOptions {
  severity?: QualityIssueSeverity | 'all'
  type?: QualityIssueType | 'all'
  filename?: string | 'all'
  language?: string | 'all'
}
