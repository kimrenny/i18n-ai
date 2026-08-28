import type { LocalizationComparisonResult } from '../types/localization'

/**
 * Returns the list of missing keys for a given file in deterministic alphabetical order.
 */
export function getMissingKeysForFile(
  filename: string,
  comparisonResult: LocalizationComparisonResult
): string[] {
  if (!comparisonResult || !comparisonResult.keys) {
    return []
  }

  return comparisonResult.keys
    .filter((entry) => entry.missingInFiles.includes(filename))
    .map((entry) => entry.key)
}

/**
 * Returns all ancestor key paths for a full dot-notated localization key.
 * Example: 'ADMIN.PANEL.BUTTON.SAVE' -> ['ADMIN', 'ADMIN.PANEL', 'ADMIN.PANEL.BUTTON']
 */
export function getParentPaths(fullKey: string): string[] {
  if (!fullKey) {
    return []
  }

  const segments = fullKey.split('.')
  if (segments.length <= 1) {
    return []
  }

  const parents: string[] = []
  let current = ''

  for (let i = 0; i < segments.length - 1; i++) {
    current = current ? `${current}.${segments[i]}` : segments[i]
    parents.push(current)
  }

  return parents
}
