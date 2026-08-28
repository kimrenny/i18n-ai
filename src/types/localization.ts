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

export type TreeNodeType = 'folder' | 'leaf' | 'conflict'

export interface LocalizationTreeNode {
  id: string
  segment: string
  fullKey: string
  type: TreeNodeType
  children: LocalizationTreeNode[]
  isPresent: boolean
  isMissing: boolean
  isConflict: boolean
  value?: JsonValue
  missingInFiles: string[]
  presentInFiles: string[]
}

export interface FileTreeData {
  filename: string
  totalKeys: number
  presentKeysCount: number
  missingKeysCount: number
  rootNodes: LocalizationTreeNode[]
}

export interface KeyAdditionPlan {
  key: string
  value: string
}

export interface FileModificationPlan {
  filename: string
  path: string
  keysToAdd: KeyAdditionPlan[]
  conflicts: string[]
  newRawJson: JsonValue
  formattedJson: string
}

export interface MissingKeysAdditionPlan {
  filesToModify: FileModificationPlan[]
  totalKeysToAdd: number
  hasConflicts: boolean
  conflictMessages: string[]
}
