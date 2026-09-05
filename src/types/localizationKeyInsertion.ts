import type { JsonValue } from './localization'

export type AddKeyTargetMode = 'single' | 'all'

export interface KeyInsertionValidationResult {
  isValid: boolean
  trimmedKey: string
  errorKey?: 'errorEmpty' | 'errorDotBoundary' | 'errorConsecutiveDots' | 'errorEmptySegment'
}

export interface FileKeyInsertionPlan {
  filename: string
  path: string
  languageCode: string
  languageName: string
  key: string
  value: string
  isAlreadyExisting: boolean
  beforeRawJson: Record<string, JsonValue>
  afterRawJson: Record<string, JsonValue>
  formattedJson: string
}

export interface ExistingKeyInfo {
  filename: string
  languageCode: string
  languageName: string
  existingValue: JsonValue
}

export interface AddTranslationKeyParams {
  key: string
  mode: AddKeyTargetMode
  singleTargetFile?: string
  translationsByFile?: Record<string, string>
}

export interface AddTranslationKeyPlan {
  key: string
  mode: AddKeyTargetMode
  validation: KeyInsertionValidationResult
  filesToModify: FileKeyInsertionPlan[]
  alreadyExistingFiles: ExistingKeyInfo[]
  skippedFiles: string[]
  hasConflicts: boolean
  conflictMessages: string[]
  canApply: boolean
}
