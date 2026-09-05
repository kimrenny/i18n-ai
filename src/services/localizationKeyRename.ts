import type {
  JsonValue,
  ParsedLocalizationFile,
} from '../types/localization'
import type {
  RenameTranslationKeyParams,
  RenameTranslationKeyPlan,
  FileKeyRenamePlan,
} from '../types/localizationKeyRename'
import type { KeyInsertionValidationResult } from '../types/localizationKeyInsertion'
import {
  validateTranslationKey,
  checkKeyExistsInFile,
  insertKeyIntoLocalizationObject,
} from './localizationKeyInsertion'
import { deleteKeyFromFile } from './localizationWriter'
import { resolveLanguageFromFilename } from './aiTranslation'
import { getLanguageDisplayName } from './localizationCoverage'

/**
 * Validates the new key against rename rules.
 */
export function validateRenameKey(
  _oldKey: string,
  newKey: string
): KeyInsertionValidationResult {
  const validation = validateTranslationKey(newKey)
  if (!validation.isValid) {
    return validation
  }

  return {
    isValid: true,
    trimmedKey: validation.trimmedKey,
  }
}

/**
 * Renames a key inside a raw JSON object representation.
 *
 * Rules:
 * - Pure function: deeply clones input and does not mutate it.
 * - If oldKey === newKey: returns original cloned raw as a no-op.
 * - If oldKey is absent: returns renamed: false without modifying.
 * - If newKey already exists in the object: throws a collision conflict.
 * - Preserves all translation values, formatting, and surrounding structure.
 */
export function renameKeyInLocalizationObject(
  raw: JsonValue,
  oldKey: string,
  newKey: string
): {
  updatedRaw: JsonValue
  formattedJson: string
  renamed: boolean
  value: JsonValue
} {
  if (!oldKey || typeof oldKey !== 'string') {
    throw new Error('Invalid old key')
  }
  if (!newKey || typeof newKey !== 'string') {
    throw new Error('Invalid new key')
  }

  const clonedRaw: Record<string, JsonValue> =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? JSON.parse(JSON.stringify(raw))
      : {}

  const dummyFile: ParsedLocalizationFile = {
    filename: 'virtual.json',
    path: '/virtual.json',
    raw: clonedRaw,
    keys: {},
    keyCount: 0,
  }

  const oldCheck = checkKeyExistsInFile(dummyFile, oldKey)
  if (!oldCheck.exists) {
    return {
      updatedRaw: clonedRaw,
      formattedJson: JSON.stringify(clonedRaw, null, 2) + '\n',
      renamed: false,
      value: undefined as unknown as JsonValue,
    }
  }

  const existingValue = oldCheck.existingValue

  if (oldKey === newKey) {
    return {
      updatedRaw: clonedRaw,
      formattedJson: JSON.stringify(clonedRaw, null, 2) + '\n',
      renamed: true,
      value: existingValue,
    }
  }

  // Check if target new key already exists in this object
  const newCheck = checkKeyExistsInFile(dummyFile, newKey)
  if (newCheck.exists) {
    throw new Error(`Target key "${newKey}" already exists in JSON structure.`)
  }

  // 1. Physically delete old key
  const { updatedRaw: afterDeleteRaw } = deleteKeyFromFile(clonedRaw, oldKey)

  // 2. Insert new key with exact original value
  const { updatedRaw: finalRaw, formattedJson } = insertKeyIntoLocalizationObject(
    afterDeleteRaw,
    newKey,
    existingValue
  )

  return {
    updatedRaw: finalRaw,
    formattedJson,
    renamed: true,
    value: existingValue,
  }
}

/**
 * Plans a rename operation across all provided localization files.
 *
 * Rules:
 * - Pure function: does not mutate files or objects.
 * - Targets all files that contain the old key.
 * - Files that do NOT contain the old key are skipped without creating artificial translations.
 * - Rejects with conflict if the new key already exists in any affected file.
 * - Rejects with conflict if new key syntax is invalid.
 * - Returns a unified plan used for both Preview and actual execution.
 */
export function planRenameTranslationKey(
  files: readonly ParsedLocalizationFile[],
  params: RenameTranslationKeyParams
): RenameTranslationKeyPlan {
  const trimmedOldKey = params.oldKey.trim()
  const validation = validateRenameKey(trimmedOldKey, params.newKey)
  const trimmedNewKey = validation.trimmedKey

  if (!validation.isValid) {
    return {
      oldKey: trimmedOldKey,
      newKey: params.newKey,
      validation,
      filesToModify: [],
      skippedFiles: [],
      hasConflicts: true,
      conflictMessages: [validation.errorKey || 'Invalid key'],
      canApply: false,
    }
  }

  const filesToModify: FileKeyRenamePlan[] = []
  const skippedFiles: string[] = []
  const conflictMessages: string[] = []

  for (const file of files) {
    const langCode = resolveLanguageFromFilename(file.filename)
    const langName = getLanguageDisplayName(langCode)
    const { exists: oldExists, existingValue: oldValue } = checkKeyExistsInFile(file, trimmedOldKey)

    if (!oldExists) {
      skippedFiles.push(file.filename)
      continue
    }

    // Check if new key already exists in this file
    if (trimmedOldKey !== trimmedNewKey) {
      const { exists: newExists } = checkKeyExistsInFile(file, trimmedNewKey)
      if (newExists) {
        conflictMessages.push(
          `Key "${trimmedNewKey}" already exists in ${file.filename} (${langName}).`
        )
        continue
      }
    }

    try {
      const { updatedRaw, formattedJson, renamed, value } = renameKeyInLocalizationObject(
        file.raw,
        trimmedOldKey,
        trimmedNewKey
      )

      if (renamed) {
        const beforeRaw =
          file.raw && typeof file.raw === 'object' && !Array.isArray(file.raw)
            ? (JSON.parse(JSON.stringify(file.raw)) as Record<string, JsonValue>)
            : {}

        filesToModify.push({
          filename: file.filename,
          path: file.path,
          languageCode: langCode,
          languageName: langName,
          oldKey: trimmedOldKey,
          newKey: trimmedNewKey,
          value: value !== undefined ? value : oldValue,
          beforeRawJson: beforeRaw,
          afterRawJson: updatedRaw as Record<string, JsonValue>,
          formattedJson,
        })
      } else {
        skippedFiles.push(file.filename)
      }
    } catch (err) {
      conflictMessages.push(
        err instanceof Error ? err.message : `Failed to rename key in ${file.filename}`
      )
    }
  }

  const hasConflicts = conflictMessages.length > 0
  const canApply = !hasConflicts && filesToModify.length > 0 && validation.isValid

  return {
    oldKey: trimmedOldKey,
    newKey: trimmedNewKey,
    validation,
    filesToModify,
    skippedFiles,
    hasConflicts,
    conflictMessages,
    canApply,
  }
}
