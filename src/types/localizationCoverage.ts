export interface LanguageCoverageItem {
  filename: string
  path: string
  languageCode: string
  languageName: string
  isReference: boolean
  totalExpectedKeys: number
  translatedKeysCount: number
  missingKeysCount: number
  emptyKeysCount: number
  coveragePercentage: number
  issuesCount: number
}

export interface WorkspaceCoverageSummary {
  totalFiles: number
  totalLanguages: number
  totalReferenceKeys: number
  totalMissingKeys: number
  totalEmptyKeys: number
  averageCoverage: number | null
  referenceLanguageCode: string
  referenceLanguageName: string
  referenceFilename: string
  leastCompleteLanguages: LanguageCoverageItem[]
  items: LanguageCoverageItem[]
}

export interface ProblemNavigationTarget {
  key: string
  mode: 'missing' | 'empty'
}
