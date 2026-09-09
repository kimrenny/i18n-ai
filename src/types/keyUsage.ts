/**
 * Status of a localization key relative to source-code references and localization files.
 * - 'used': Key exists in localization files AND has at least 1 static code reference.
 * - 'unused': Key exists in localization files AND has 0 static code references.
 * - 'missing': Key is statically referenced in source code, but does NOT exist in localization files.
 */
export type KeyUsageStatus = 'used' | 'unused' | 'missing'

/**
 * Filter mode in the Key Usage Panel UI.
 */
export type KeyUsageFilter = 'all' | 'used' | 'unused' | 'missing' | 'dynamic'

/**
 * Confidence level for detected localization usages.
 */
export type DetectionConfidence = 'strong' | 'medium' | 'weak' | 'dynamic'

/**
 * Method or syntax by which a localization key reference was resolved.
 */
export type KeyResolutionType =
  | 'direct-static'
  | 'constant'
  | 'array'
  | 'template-resolved'
  | 'object-property'
  | 'union-resolved'
  | 'prefix-inferred'

/**
 * Represents a single statically detected or resolved localization key usage in a source file.
 */
export interface KeyUsageLocation {
  /** Full absolute or workspace-relative path to the source file */
  filePath: string
  /** Normalized relative path for display */
  relativePath: string
  /** Line number in the source file (1-indexed) */
  line: number
  /** Column number in the source file (1-indexed) */
  column: number
  /** Code snippet or matched call expression, e.g. "t('app.title')" */
  matchedExpression: string
  /** Context line text for preview */
  lineText?: string
  /** Statically extracted localization key, e.g. "app.title" or "HOME.TITLE" */
  key?: string
  /** Identifier of the detector that found this usage */
  detectorId?: string
  /** Pattern name or description (e.g. "angular-pipe", "ts-call", "csharp-indexer") */
  pattern?: string
  /** Detection confidence */
  confidence?: DetectionConfidence
  /** How the key reference was resolved */
  resolutionType?: KeyResolutionType
}

/**
 * Represents a dynamic or unresolved localization call expression in source code.
 */
export interface DynamicUsageLocation {
  /** Full absolute or workspace-relative path to the source file */
  filePath: string
  /** Normalized relative path for display */
  relativePath: string
  /** Line number in the source file (1-indexed) */
  line: number
  /** Column number in the source file (1-indexed) */
  column: number
  /** The unresolved code expression, e.g. "t(`admin.${section}.title`)" */
  expression: string
  /** Context line text for preview */
  lineText?: string
  /** Identifier of the detector that found this usage */
  detectorId?: string
  /** Pattern name or description */
  pattern?: string
  /** Detection confidence */
  confidence?: DetectionConfidence
  /** Extracted static prefix if any (e.g. "addKey.") */
  staticPrefix?: string
}

/**
 * Aggregated usage item for a specific localization key.
 */
export interface KeyUsageItem {
  /** The localization key path, e.g. "app.title" or "COMMON.SAVE" */
  key: string
  /** Key status: 'used' | 'unused' | 'missing' */
  status: KeyUsageStatus
  /** Total number of static or resolved usages detected in source files */
  usageCount: number
  /** Array of all detected usage locations */
  usages: KeyUsageLocation[]
  /** List of language names or filenames where this key exists */
  presentInLanguages: string[]
  /** Total languages in the workspace containing this key */
  languageCount: number
  /** Highest confidence among detected usages */
  highestConfidence?: DetectionConfidence
  /** Dominant resolution type */
  resolutionType?: KeyResolutionType
  /** Matching dynamic usages that could map to this key namespace */
  possibleDynamicUsages?: DynamicUsageLocation[]
}

/**
 * Complete scan and aggregation results for a workspace.
 */
export interface KeyUsageScanResult {
  /** Total source files scanned */
  scannedFilesCount: number
  /** Source files successfully parsed without fatal error */
  parsedFilesCount: number
  /** Source files skipped due to read/parse failure */
  skippedFilesCount: number
  /** List of skipped file paths with error details */
  skippedFiles?: Array<{ filePath: string; error: string }>
  /** Total unique localization keys known (union of localization keys + missing keys) */
  totalUniqueKeys: number
  /** Number of keys with status 'used' */
  usedKeysCount: number
  /** Number of keys with status 'unused' */
  unusedKeysCount: number
  /** Number of keys with status 'missing' (code-reference missing) */
  missingKeysCount: number
  /** Total dynamic / unresolved localization call expressions found */
  dynamicUsagesCount: number
  /** List of aggregated key usage items sorted alphabetically */
  items: KeyUsageItem[]
  /** List of all dynamic/unresolved source code usages */
  dynamicUsages: DynamicUsageLocation[]
}
