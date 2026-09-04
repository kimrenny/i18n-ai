export type LocalizationProblemType = 'missing' | 'empty'

export interface LocalizationProblem {
  id: string
  type: LocalizationProblemType
  filename: string
  path: string
  languageCode: string
  languageName: string
  key: string
}

export interface LanguageProblemsGroup {
  filename: string
  path: string
  languageCode: string
  languageName: string
  missingCount: number
  emptyCount: number
  totalCount: number
  problems: LocalizationProblem[]
}

export interface WorkspaceProblemsSummary {
  totalProblems: number
  totalMissing: number
  totalEmpty: number
  problems: LocalizationProblem[]
  groups: LanguageProblemsGroup[]
}
