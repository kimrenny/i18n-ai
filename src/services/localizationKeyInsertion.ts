import type {
  JsonValue,
  ParsedLocalizationFile,
} from '../types/localization'
import type {
  AddTranslationKeyParams,
  AddTranslationKeyPlan,
  FileKeyInsertionPlan,
  ExistingKeyInfo,
  KeyInsertionValidationResult,
} from '../types/localizationKeyInsertion'
import { resolveLanguageFromFilename } from './aiTranslation'
import { getLanguageDisplayName } from './localizationCoverage'

/**
 * Validates a localization key string (supporting dot-notation paths).
 *
 * Rules:
 * - Must not be empty or whitespace-only ('errorEmpty').
 * - Must not start or end with a dot '.' ('errorDotBoundary').
 * - Must not contain consecutive dots '..' ('errorConsecutiveDots').
 * - Must not have any empty or whitespace-only segments ('errorEmptySegment').
 */
export function validateTranslationKey(rawKey: string): KeyInsertionValidationResult {
  if (typeof rawKey !== 'string') {
    return { isValid: false, trimmedKey: '', errorKey: 'errorEmpty' }
  }

  const trimmedKey = rawKey.trim()
  if (trimmedKey.length === 0) {
    return { isValid: false, trimmedKey: '', errorKey: 'errorEmpty' }
  }

  if (trimmedKey.startsWith('.') || trimmedKey.endsWith('.')) {
    return { isValid: false, trimmedKey, errorKey: 'errorDotBoundary' }
  }

  if (trimmedKey.includes('..')) {
    return { isValid: false, trimmedKey, errorKey: 'errorConsecutiveDots' }
  }

  const segments = trimmedKey.split('.')
  for (const seg of segments) {
    if (!seg || seg.trim().length === 0) {
      return { isValid: false, trimmedKey, errorKey: 'errorEmptySegment' }
    }
  }

  return { isValid: true, trimmedKey }
}

/**
 * Inserts a key and value into a raw JSON object representation.
 *
 * Rules:
 * - Pure function: deeply clones input and does not mutate it.
 * - For dot-notation paths (e.g. 'ADMIN.DASHBOARD.TITLE'), creates/reuses intermediate nested objects.
 * - If an existing intermediate segment is a primitive or array instead of an object, throws structural conflict.
 * - If the leaf property is an existing object, throws structural conflict.
 * - Formats result with standard 2-space indentation and trailing newline.
 */
export function insertKeyIntoLocalizationObject(
  raw: JsonValue,
  fullKey: string,
  value: JsonValue
): { updatedRaw: JsonValue; formattedJson: string } {
  if (!fullKey || typeof fullKey !== 'string') {
    throw new Error('Invalid key')
  }

  const clonedRaw: Record<string, JsonValue> =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? JSON.parse(JSON.stringify(raw))
      : {}

  const segments = fullKey.split('.')
  let current: Record<string, JsonValue> = clonedRaw
  let accumulated = ''

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    accumulated = accumulated ? `${accumulated}.${seg}` : seg

    if (!Object.prototype.hasOwnProperty.call(current, seg)) {
      const newObj: Record<string, JsonValue> = {}
      current[seg] = newObj
      current = newObj
    } else {
      const val = current[seg]
      if (typeof val !== 'object' || val === null || Array.isArray(val)) {
        throw new Error(
          `Structural conflict: cannot insert "${fullKey}" because "${accumulated}" is a ${
            Array.isArray(val) ? 'array' : typeof val
          } instead of an object.`
        )
      }
      current = val as Record<string, JsonValue>
    }
  }

  const leaf = segments[segments.length - 1]
  const existingLeaf = current[leaf]
  if (
    existingLeaf !== undefined &&
    typeof existingLeaf === 'object' &&
    existingLeaf !== null &&
    !Array.isArray(existingLeaf)
  ) {
    throw new Error(
      `Structural conflict: cannot set "${fullKey}" because it is already an object.`
    )
  }

  current[leaf] = value

  return {
    updatedRaw: clonedRaw,
    formattedJson: JSON.stringify(clonedRaw, null, 2) + '\n',
  }
}

/**
 * Checks if a key exists in parsed localization file keys or nested raw structure.
 */
export function checkKeyExistsInFile(
  file: ParsedLocalizationFile,
  key: string
): { exists: boolean; existingValue: JsonValue } {
  if (file.keys && Object.prototype.hasOwnProperty.call(file.keys, key)) {
    return { exists: true, existingValue: file.keys[key] }
  }

  // Check in raw object via dot traversal or flat key
  if (file.raw && typeof file.raw === 'object' && !Array.isArray(file.raw)) {
    const rawObj = file.raw as Record<string, JsonValue>
    if (Object.prototype.hasOwnProperty.call(rawObj, key)) {
      return { exists: true, existingValue: rawObj[key] }
    }

    const segments = key.split('.')
    let current: unknown = file.raw
    let found = true
    for (const seg of segments) {
      if (
        current &&
        typeof current === 'object' &&
        !Array.isArray(current) &&
        Object.prototype.hasOwnProperty.call(current, seg)
      ) {
        current = (current as Record<string, unknown>)[seg]
      } else {
        found = false
        break
      }
    }
    if (found && current !== undefined) {
      return { exists: true, existingValue: current as JsonValue }
    }
  }

  return { exists: false, existingValue: undefined as unknown as JsonValue }
}

/**
 * Plans the addition of a translation key to one or all localization files.
 *
 * Rules:
 * - Never mutates input files or objects.
 * - In 'single' mode: target only the specified file; if key already exists, records conflict.
 * - In 'all' mode: modifies files where the key is absent; preserves existing translations in other files.
 * - Returns a complete, deterministic plan with preview information and conflict validation.
 */
export function planAddTranslationKey(
  files: readonly ParsedLocalizationFile[],
  params: AddTranslationKeyParams
): AddTranslationKeyPlan {
  const validation = validateTranslationKey(params.key)
  const trimmedKey = validation.trimmedKey

  if (!validation.isValid) {
    return {
      key: params.key,
      mode: params.mode,
      validation,
      filesToModify: [],
      alreadyExistingFiles: [],
      skippedFiles: [],
      hasConflicts: true,
      conflictMessages: [validation.errorKey || 'Invalid key'],
      canApply: false,
    }
  }

  const filesToModify: FileKeyInsertionPlan[] = []
  const alreadyExistingFiles: ExistingKeyInfo[] = []
  const skippedFiles: string[] = []
  const conflictMessages: string[] = []

  for (const file of files) {
    const langCode = resolveLanguageFromFilename(file.filename)
    const langName = getLanguageDisplayName(langCode)
    const { exists, existingValue } = checkKeyExistsInFile(file, trimmedKey)

    if (exists) {
      alreadyExistingFiles.push({
        filename: file.filename,
        languageCode: langCode,
        languageName: langName,
        existingValue,
      })
    }

    if (params.mode === 'single') {
      if (file.filename === params.singleTargetFile) {
        if (exists) {
          conflictMessages.push(
            `Key "${trimmedKey}" already exists in ${file.filename} (${langName}).`
          )
        } else {
          const valToAdd = params.translationsByFile?.[file.filename] ?? ''
          try {
            const { updatedRaw, formattedJson } = insertKeyIntoLocalizationObject(
              file.raw,
              trimmedKey,
              valToAdd
            )
            const beforeRaw =
              file.raw && typeof file.raw === 'object' && !Array.isArray(file.raw)
                ? (JSON.parse(JSON.stringify(file.raw)) as Record<string, JsonValue>)
                : {}

            filesToModify.push({
              filename: file.filename,
              path: file.path,
              languageCode: langCode,
              languageName: langName,
              key: trimmedKey,
              value: valToAdd,
              isAlreadyExisting: false,
              beforeRawJson: beforeRaw,
              afterRawJson: updatedRaw as Record<string, JsonValue>,
              formattedJson,
            })
          } catch (err) {
            conflictMessages.push(
              err instanceof Error ? err.message : `Failed to insert key in ${file.filename}`
            )
          }
        }
      } else {
        skippedFiles.push(file.filename)
      }
    } else {
      // 'all' mode
      if (exists) {
        skippedFiles.push(file.filename)
      } else {
        const valToAdd = params.translationsByFile?.[file.filename] ?? ''
        try {
          const { updatedRaw, formattedJson } = insertKeyIntoLocalizationObject(
            file.raw,
            trimmedKey,
            valToAdd
          )
          const beforeRaw =
            file.raw && typeof file.raw === 'object' && !Array.isArray(file.raw)
              ? (JSON.parse(JSON.stringify(file.raw)) as Record<string, JsonValue>)
              : {}

          filesToModify.push({
            filename: file.filename,
            path: file.path,
            languageCode: langCode,
            languageName: langName,
            key: trimmedKey,
            value: valToAdd,
            isAlreadyExisting: false,
            beforeRawJson: beforeRaw,
            afterRawJson: updatedRaw as Record<string, JsonValue>,
            formattedJson,
          })
        } catch (err) {
          conflictMessages.push(
            err instanceof Error ? err.message : `Failed to insert key in ${file.filename}`
          )
        }
      }
    }
  }

  const hasConflicts = conflictMessages.length > 0
  const canApply = !hasConflicts && filesToModify.length > 0 && validation.isValid

  return {
    key: trimmedKey,
    mode: params.mode,
    validation,
    filesToModify,
    alreadyExistingFiles,
    skippedFiles,
    hasConflicts,
    conflictMessages,
    canApply,
  }
}
