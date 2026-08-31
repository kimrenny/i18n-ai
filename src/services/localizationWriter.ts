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
 * - Safely handles nested paths (e.g. 'MENU.PLAY') and flat keys.
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

  // Direct flat key match
  if (Object.prototype.hasOwnProperty.call(clonedRaw, fullKey)) {
    clonedRaw[fullKey] = newValue
    return {
      updatedRaw: clonedRaw,
      formattedJson: JSON.stringify(clonedRaw, null, 2) + '\n',
    }
  }

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

/**
 * Recursively deletes a key from a nested/hybrid/flat JSON object structure,
 * and removes any empty parent objects that are left with no keys.
 */
function deleteKeyRecursive(
  obj: Record<string, JsonValue>,
  remainingPath: string
): boolean {
  // 1. Direct property match (e.g. flat key or current leaf property)
  if (Object.prototype.hasOwnProperty.call(obj, remainingPath)) {
    delete obj[remainingPath]
    return true
  }

  // 2. Try prefix matching for nested / hybrid paths
  const segments = remainingPath.split('.')
  for (let i = 1; i <= segments.length - 1; i++) {
    const prefix = segments.slice(0, i).join('.')
    const suffix = segments.slice(i).join('.')

    if (
      Object.prototype.hasOwnProperty.call(obj, prefix) &&
      typeof obj[prefix] === 'object' &&
      obj[prefix] !== null &&
      !Array.isArray(obj[prefix])
    ) {
      const childObj = obj[prefix] as Record<string, JsonValue>
      const deleted = deleteKeyRecursive(childObj, suffix)
      if (deleted) {
        // Clean up empty parent object
        if (Object.keys(childObj).length === 0) {
          delete obj[prefix]
        }
        return true
      }
    }
  }

  return false
}

/**
 * Recursively deletes a section / subtree from a nested/hybrid/flat JSON object structure,
 * and removes any empty parent objects left with no keys.
 */
function deleteSectionRecursive(
  obj: Record<string, JsonValue>,
  sectionPath: string
): boolean {
  let anyDeleted = false

  // 1. Direct match on section object
  if (Object.prototype.hasOwnProperty.call(obj, sectionPath)) {
    delete obj[sectionPath]
    anyDeleted = true
  }

  // 2. Flat keys starting with `${sectionPath}.`
  const prefixDot = `${sectionPath}.`
  for (const key of Object.keys(obj)) {
    if (key.startsWith(prefixDot)) {
      delete obj[key]
      anyDeleted = true
    }
  }

  // 3. Nested traversal
  const segments = sectionPath.split('.')
  for (let i = 1; i <= segments.length; i++) {
    const prefix = segments.slice(0, i).join('.')
    const suffix = segments.slice(i).join('.')

    if (
      Object.prototype.hasOwnProperty.call(obj, prefix) &&
      typeof obj[prefix] === 'object' &&
      obj[prefix] !== null &&
      !Array.isArray(obj[prefix])
    ) {
      const childObj = obj[prefix] as Record<string, JsonValue>
      if (suffix === '') {
        delete obj[prefix]
        anyDeleted = true
      } else {
        const deleted = deleteSectionRecursive(childObj, suffix)
        if (deleted) {
          anyDeleted = true
          if (Object.keys(childObj).length === 0) {
            delete obj[prefix]
          }
        }
      }
    }
  }

  return anyDeleted
}

/**
 * Physically deletes a single key from a localization file's raw JSON representation.
 *
 * Rules:
 * - Pure function: deeply clones input and does not mutate it.
 * - Physically deletes the key from the JSON object.
 * - Safely handles nested paths and flat dotted keys.
 * - Cleans up intermediate empty parent objects left behind.
 */
export function deleteKeyFromFile(
  raw: JsonValue,
  fullKey: string
): { updatedRaw: JsonValue; formattedJson: string; deleted: boolean } {
  if (!fullKey || typeof fullKey !== 'string') {
    throw new Error('Invalid key')
  }

  const clonedRaw: Record<string, JsonValue> =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? JSON.parse(JSON.stringify(raw))
      : {}

  const deleted = deleteKeyRecursive(clonedRaw, fullKey)

  return {
    updatedRaw: clonedRaw,
    formattedJson: JSON.stringify(clonedRaw, null, 2) + '\n',
    deleted,
  }
}

/**
 * Physically deletes an entire section / object subtree from a localization file's raw JSON representation.
 *
 * Rules:
 * - Pure function: deeply clones input and does not mutate it.
 * - Deletes the entire subtree and all of its descendants physically.
 * - Cleans up intermediate empty parent objects left behind.
 */
export function deleteSectionFromFile(
  raw: JsonValue,
  sectionPath: string
): { updatedRaw: JsonValue; formattedJson: string; deleted: boolean } {
  if (!sectionPath || typeof sectionPath !== 'string') {
    throw new Error('Invalid section path')
  }

  const clonedRaw: Record<string, JsonValue> =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? JSON.parse(JSON.stringify(raw))
      : {}

  const deleted = deleteSectionRecursive(clonedRaw, sectionPath)

  return {
    updatedRaw: clonedRaw,
    formattedJson: JSON.stringify(clonedRaw, null, 2) + '\n',
    deleted,
  }
}
