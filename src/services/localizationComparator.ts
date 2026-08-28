import type {
  ParsedLocalizationFile,
  LocalizationComparisonResult,
  KeyComparisonEntry,
  JsonValue,
} from '../types/localization'

/**
 * Compares localization keys across multiple parsed localization files.
 *
 * Rules:
 * - Operates on the UNION of all keys across all files (no master/canonical file).
 * - Key sorting is deterministic (alphabetical).
 * - Identifies which files have the key, which files are missing the key, and which files have empty string ("").
 * - Key is complete if present and non-empty in all compared files.
 * - Key is empty if present but value is strictly === "".
 * - Does not mutate input objects.
 */
export function compareLocalizationFiles(
  files: readonly ParsedLocalizationFile[]
): LocalizationComparisonResult {
  if (!files || files.length === 0) {
    return {
      comparedFileCount: 0,
      comparedFiles: [],
      totalUniqueKeys: 0,
      completeKeysCount: 0,
      incompleteKeysCount: 0,
      emptyKeysCount: 0,
      keys: [],
    }
  }

  const comparedFiles = files.map((f) => ({
    filename: f.filename,
    path: f.path,
  }))

  // Collect the union of all keys across all files
  const allKeysSet = new Set<string>()
  for (const file of files) {
    for (const key of Object.keys(file.keys)) {
      allKeysSet.add(key)
    }
  }

  // Sort keys alphabetically for deterministic ordering
  const sortedKeys = Array.from(allKeysSet).sort((a, b) => a.localeCompare(b))

  const keyEntries: KeyComparisonEntry[] = []
  let completeKeysCount = 0
  let incompleteKeysCount = 0
  let emptyKeysCount = 0

  for (const key of sortedKeys) {
    const presentInFiles: string[] = []
    const missingInFiles: string[] = []
    const emptyInFiles: string[] = []
    const values: Record<string, JsonValue> = {}

    for (const file of files) {
      if (Object.prototype.hasOwnProperty.call(file.keys, key)) {
        presentInFiles.push(file.filename)
        const val = file.keys[key]
        values[file.filename] = val
        if (val === '') {
          emptyInFiles.push(file.filename)
        }
      } else {
        missingInFiles.push(file.filename)
      }
    }

    const isComplete = missingInFiles.length === 0 && emptyInFiles.length === 0
    if (isComplete) {
      completeKeysCount++
    }
    if (missingInFiles.length > 0) {
      incompleteKeysCount++
    }
    if (emptyInFiles.length > 0) {
      emptyKeysCount++
    }

    keyEntries.push({
      key,
      isComplete,
      presentInFiles,
      missingInFiles,
      emptyInFiles,
      values,
    })
  }

  return {
    comparedFileCount: files.length,
    comparedFiles,
    totalUniqueKeys: sortedKeys.length,
    completeKeysCount,
    incompleteKeysCount,
    emptyKeysCount,
    keys: keyEntries,
  }
}
