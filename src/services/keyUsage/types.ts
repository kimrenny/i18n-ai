import type {
  KeyUsageLocation,
  DynamicUsageLocation,
  DetectionConfidence,
} from '../../types/keyUsage'

export type { DetectionConfidence }

export interface StaticConstantsMap {
  strings: Map<string, string>
  arrays: Map<string, string[]>
  objects: Map<string, Map<string, string>>
  propertyValues: Map<string, string[]>
}

export interface DetectorContext {
  filePath: string
  relativePath: string
  content: string
  workspaceConstants?: StaticConstantsMap
}

export interface DetectorScanResult {
  staticUsages: KeyUsageLocation[]
  dynamicUsages: DynamicUsageLocation[]
}

/**
 * Interface for a pluggable localization usage detector strategy.
 */
export interface LocalizationDetector {
  /** Unique detector identifier (e.g. 'angular-html', 'typescript-ast', 'dotnet-csharp') */
  readonly id: string
  /** Human-readable display name */
  readonly name: string
  /** File extensions handled by this detector, in lowercase with leading dot */
  readonly supportedExtensions: string[]
  /** Executes detection against file content */
  detect(context: DetectorContext): DetectorScanResult
}
