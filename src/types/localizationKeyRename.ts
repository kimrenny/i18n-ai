import type { JsonValue } from './localization'
import type { KeyInsertionValidationResult } from './localizationKeyInsertion'

export interface FileKeyRenamePlan {
  filename: string
  path: string
  languageCode: string
  languageName: string
  oldKey: string
  newKey: string
  value: JsonValue
  beforeRawJson: Record<string, JsonValue>
  afterRawJson: Record<string, JsonValue>
  formattedJson: string
}

export interface RenameTranslationKeyParams {
  oldKey: string
  newKey: string
}

export interface RenameTranslationKeyPlan {
  oldKey: string
  newKey: string
  validation: KeyInsertionValidationResult
  filesToModify: FileKeyRenamePlan[]
  skippedFiles: string[]
  hasConflicts: boolean
  conflictMessages: string[]
  canApply: boolean
}
