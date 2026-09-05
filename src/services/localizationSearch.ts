import type { ParsedLocalizationFile } from '../types/localization'
import type {
  LocalizationSearchResult,
  LanguageSearchResultsGroup,
  WorkspaceSearchResults,
  SearchMatchType,
} from '../types/localizationSearch'
import { getLanguageDisplayName } from './localizationCoverage'
import { normalizeLanguageCode } from './languageNormalizer'

/**
 * Searches across all already-parsed workspace localization files.
 *
 * Rules:
 * - Pure in-memory search over parsed files.
 * - Searches existing keys and translation values.
 * - Whitespace-trimmed, case-insensitive substring matching.
 * - Empty query returns zero matches.
 * - Deterministic ordering: preserves workspace file order, sorted alphabetically by key within file.
 */
export function searchWorkspaceLocalization(
  files: readonly ParsedLocalizationFile[],
  rawQuery: string
): WorkspaceSearchResults {
  const query = rawQuery.trim()
  if (!query || !files || files.length === 0) {
    return {
      query: rawQuery,
      totalMatches: 0,
      results: [],
      groups: [],
    }
  }

  const lowerQuery = query.toLowerCase()
  const allResults: LocalizationSearchResult[] = []
  const groups: LanguageSearchResultsGroup[] = []

  for (const file of files) {
    const languageCode = normalizeLanguageCode(file.filename)
    const languageName = getLanguageDisplayName(languageCode)
    const fileResults: LocalizationSearchResult[] = []

    // Deterministic alphabetical sort by key
    const sortedKeys = Object.keys(file.keys || {}).sort((a, b) =>
      a.localeCompare(b)
    )

    for (const key of sortedKeys) {
      const rawVal = file.keys[key]
      const valueStr =
        typeof rawVal === 'string'
          ? rawVal
          : rawVal === null
          ? 'null'
          : rawVal !== undefined
          ? String(rawVal)
          : ''

      const keyMatched = key.toLowerCase().includes(lowerQuery)
      const valueMatched = valueStr.toLowerCase().includes(lowerQuery)

      if (keyMatched || valueMatched) {
        let matchType: SearchMatchType = 'key'
        if (keyMatched && valueMatched) {
          matchType = 'both'
        } else if (valueMatched) {
          matchType = 'value'
        }

        const isEmpty =
          typeof rawVal === 'string' ? rawVal.trim().length === 0 : false

        const resultItem: LocalizationSearchResult = {
          id: `${file.filename}:${key}`,
          filename: file.filename,
          filePath: file.path,
          languageCode,
          languageName,
          key,
          value: valueStr,
          matchType,
          isEmpty,
        }

        fileResults.push(resultItem)
        allResults.push(resultItem)
      }
    }

    if (fileResults.length > 0) {
      groups.push({
        filename: file.filename,
        filePath: file.path,
        languageCode,
        languageName,
        results: fileResults,
      })
    }
  }

  return {
    query: rawQuery,
    totalMatches: allResults.length,
    results: allResults,
    groups,
  }
}

export interface HighlightSegment {
  text: string
  isMatch: boolean
}

/**
 * Splits text into segments marking matched substrings for UI highlighting.
 */
export function splitMatchRanges(
  text: string,
  rawQuery: string
): HighlightSegment[] {
  const query = rawQuery.trim()
  if (!text || !query) {
    return [{ text, isMatch: false }]
  }

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const segments: HighlightSegment[] = []

  let currentIndex = 0
  let matchIndex = lowerText.indexOf(lowerQuery, currentIndex)

  while (matchIndex !== -1) {
    if (matchIndex > currentIndex) {
      segments.push({
        text: text.slice(currentIndex, matchIndex),
        isMatch: false,
      })
    }

    segments.push({
      text: text.slice(matchIndex, matchIndex + query.length),
      isMatch: true,
    })

    currentIndex = matchIndex + query.length
    matchIndex = lowerText.indexOf(lowerQuery, currentIndex)
  }

  if (currentIndex < text.length) {
    segments.push({
      text: text.slice(currentIndex),
      isMatch: false,
    })
  }

  return segments.length > 0 ? segments : [{ text, isMatch: false }]
}
