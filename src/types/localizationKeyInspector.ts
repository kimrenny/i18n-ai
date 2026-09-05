export type KeyTranslationStatus = 'translated' | 'empty' | 'missing'

export interface KeyLanguageStatus {
  filename: string
  filePath: string
  languageCode: string
  languageName: string
  isReference: boolean
  status: KeyTranslationStatus
  value: string | null // null for missing, "" for empty, actual string or formatted JSON
  rawPresent: boolean
}

export interface KeyInspectionResult {
  key: string
  referenceLanguage: {
    filename: string
    languageCode: string
    languageName: string
    value: string | null
    status: KeyTranslationStatus
  } | null
  languages: KeyLanguageStatus[]
  totalLanguages: number
  translatedCount: number
  emptyCount: number
  missingCount: number
  coveragePercentage: number
}
