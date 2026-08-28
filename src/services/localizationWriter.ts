import type {
  ParsedLocalizationFile,
  LocalizationComparisonResult,
  MissingKeysAdditionPlan,
  FileModificationPlan,
  KeyAdditionPlan,
  JsonValue,
} from '../types/localization'

/**
 * Plans the addition of missing localization keys with empty strings ("").
 *
 * Rules:
 * - Operates on all participating compared files and the comparison result.
 * - Deeply clones JSON data and does NOT mutate inputs.
 * - Preserves existing keys, existing values, and original hierarchy.
 * - Detects structural conflicts safely without overwriting primitive user data.
 * - Returns formatted readable pretty-printed JSON.
 */
export function planMissingKeysAddition(
  files: readonly ParsedLocalizationFile[],
  comparisonResult: LocalizationComparisonResult
): MissingKeysAdditionPlan {
  const filesToModify: FileModificationPlan[] = []
  const allConflictMessages: string[] = []
  let totalKeysToAdd = 0

  for (const file of files) {
    const missingEntries = comparisonResult.keys.filter((entry) =>
      entry.missingInFiles.includes(file.filename)
    )

    if (missingEntries.length === 0) {
      continue
    }

    // Deep clone original raw JSON object
    const clonedRaw: Record<string, JsonValue> =
      file.raw && typeof file.raw === 'object' && !Array.isArray(file.raw)
        ? JSON.parse(JSON.stringify(file.raw))
        : {}

    const keysToAdd: KeyAdditionPlan[] = []
    const fileConflicts: string[] = []

    for (const entry of missingEntries) {
      const fullKey = entry.key
      const segments = fullKey.split('.')

      let current: Record<string, JsonValue> = clonedRaw
      let hasConflict = false
      let accumulated = ''

      // Traverse/create intermediate objects
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
            const msg = `Cannot add "${fullKey}" because "${accumulated}" in ${file.filename} is a ${
              Array.isArray(val) ? 'array' : typeof val
            } instead of an object.`
            fileConflicts.push(msg)
            allConflictMessages.push(msg)
            hasConflict = true
            break
          }
          current = val as Record<string, JsonValue>
        }
      }

      if (!hasConflict) {
        const leaf = segments[segments.length - 1]
        if (
          typeof current === 'object' &&
          current !== null &&
          !Array.isArray(current)
        ) {
          if (!Object.prototype.hasOwnProperty.call(current, leaf)) {
            current[leaf] = ''
            keysToAdd.push({ key: fullKey, value: '' })
            totalKeysToAdd++
          }
        }
      }
    }

    if (keysToAdd.length > 0 || fileConflicts.length > 0) {
      filesToModify.push({
        filename: file.filename,
        path: file.path,
        keysToAdd,
        conflicts: fileConflicts,
        newRawJson: clonedRaw,
        formattedJson: JSON.stringify(clonedRaw, null, 2) + '\n',
      })
    }
  }

  return {
    filesToModify,
    totalKeysToAdd,
    hasConflicts: allConflictMessages.length > 0,
    conflictMessages: allConflictMessages,
  }
}

/**
 * Updates a single key in a localization file's raw JSON representation.
 *
 * Rules:
 * - Pure function: deeply clones input and does not mutate it.
 * - Preserves all unrelated keys, values, and formatting.
 * - Safely handles nested paths (e.g. 'MENU.PLAY').
 * - Throws error if attempting to overwrite an incompatible non-object parent.
 */
export function updateSingleKeyInFile(
  raw: JsonValue,
  fullKey: string,
  newValue: JsonValue
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
          `Structural conflict: cannot update "${fullKey}" because "${accumulated}" is a primitive value.`
        )
      }
      current = val as Record<string, JsonValue>
    }
  }

  const leaf = segments[segments.length - 1]
  current[leaf] = newValue

  return {
    updatedRaw: clonedRaw,
    formattedJson: JSON.stringify(clonedRaw, null, 2) + '\n',
  }
}
