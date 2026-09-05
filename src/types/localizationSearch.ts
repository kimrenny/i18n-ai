export type SearchMatchType = 'key' | 'value' | 'both'

export interface LocalizationSearchResult {
  id: string
  filename: string
  filePath: string
  languageCode: string
  languageName: string
  key: string
  value: string
  matchType: SearchMatchType
  isEmpty: boolean
}

export interface LanguageSearchResultsGroup {
  filename: string
  filePath: string
  languageCode: string
  languageName: string
  results: LocalizationSearchResult[]
}

export interface WorkspaceSearchResults {
  query: string
  totalMatches: number
  results: LocalizationSearchResult[]
  groups: LanguageSearchResultsGroup[]
}
