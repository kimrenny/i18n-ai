export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface ParsedLocalizationFile {
  filename: string
  path: string
  raw: JsonValue
  keys: Record<string, JsonValue>
  keyCount: number
}

export interface FileParseResult {
  filename: string
  path: string
  success: boolean
  data?: ParsedLocalizationFile
  error?: string
}

export interface KeyComparisonEntry {
  key: string
  isComplete: boolean
  presentInFiles: string[]
  missingInFiles: string[]
  values: Record<string, JsonValue>
}

export interface LocalizationComparisonResult {
  comparedFileCount: number
  comparedFiles: { filename: string; path: string }[]
  totalUniqueKeys: number
  completeKeysCount: number
  incompleteKeysCount: number
  keys: KeyComparisonEntry[]
}
