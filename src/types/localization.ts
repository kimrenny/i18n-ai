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
