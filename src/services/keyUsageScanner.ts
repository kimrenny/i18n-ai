import type { ParsedLocalizationFile } from '../types/localization'
import { normalizeLanguageCode } from './languageNormalizer'
import { getLanguageDisplayName } from './localizationCoverage'
import type {
  KeyUsageLocation,
  DynamicUsageLocation,
  KeyUsageItem,
  KeyUsageScanResult,
  DetectionConfidence,
  KeyResolutionType,
} from '../types/keyUsage'
import {
  defaultDetectorRegistry,
  DetectorRegistry,
} from './keyUsage/detectorRegistry'
import type { LocalizationDetector, DetectorContext, DetectorScanResult, StaticConstantsMap } from './keyUsage/types'
import { AngularHtmlDetector } from './keyUsage/detectors/AngularHtmlDetector'
import {
  TypeScriptAstDetector,
  collectFileScopeContext,
  isLocalizationReceiverName,
  isLocalizationCallTarget,
  createEmptyStaticConstantsMap,
  mergeStaticConstants,
} from './keyUsage/detectors/TypeScriptAstDetector'
import { DotNetDetector } from './keyUsage/detectors/DotNetDetector'
import { VueDetector } from './keyUsage/detectors/VueDetector'
import { SvelteDetector } from './keyUsage/detectors/SvelteDetector'

export type { DetectionConfidence, LocalizationDetector, DetectorContext, DetectorScanResult }
export {
  defaultDetectorRegistry,
  DetectorRegistry,
  AngularHtmlDetector,
  TypeScriptAstDetector,
  DotNetDetector,
  VueDetector,
  SvelteDetector,
  collectFileScopeContext,
  isLocalizationReceiverName,
  isLocalizationCallTarget,
  createEmptyStaticConstantsMap,
  mergeStaticConstants,
}

/**
 * Supported file extensions for static source scanning across supported frameworks
 * (Angular HTML, TypeScript/JavaScript, Vue, Svelte, .NET/C#/Razor).
 */
export const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.html',
  '.vue',
  '.svelte',
  '.cs',
  '.razor',
  '.cshtml',
])

/**
 * Standard ignored directory names.
 */
export const SCANNER_IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  '.next',
  '.turbo',
  '.vscode',
  '.idea',
  'build',
  'coverage',
  '.cache',
  'out',
  '.output',
  'bin',
  'obj',
])

export interface FileScanInput {
  filePath: string
  relativePath: string
  content: string
}

export interface FileScanResult {
  filePath: string
  relativePath: string
  staticUsages: KeyUsageLocation[]
  dynamicUsages: DynamicUsageLocation[]
  success: boolean
  error?: string
}

/**
 * Determines if a relative or absolute path is inside an ignored directory.
 */
export function isIgnoredPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  const segments = normalized.split('/')
  return segments.some((segment) => SCANNER_IGNORED_DIRECTORIES.has(segment))
}

/**
 * Checks if a file path is a supported source code file.
 */
export function isSupportedSourceFile(filePath: string): boolean {
  if (isIgnoredPath(filePath)) return false
  const lower = filePath.toLowerCase()
  const dotIndex = lower.lastIndexOf('.')
  if (dotIndex === -1) return false
  const ext = lower.substring(dotIndex)
  return SUPPORTED_SOURCE_EXTENSIONS.has(ext)
}

/**
 * Scans JavaScript / TypeScript code using the TypeScript AST detector.
 */
export function scanSourceCode(
  filePath: string,
  relativePath: string,
  code: string
): FileScanResult {
  const detector = new TypeScriptAstDetector()
  try {
    const res = detector.detect({ filePath, relativePath, content: code })
    return {
      filePath,
      relativePath,
      staticUsages: res.staticUsages,
      dynamicUsages: res.dynamicUsages,
      success: true,
    }
  } catch (err) {
    return {
      filePath,
      relativePath,
      staticUsages: [],
      dynamicUsages: [],
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Scans Vue single-file components (.vue).
 */
export function scanVueFile(
  filePath: string,
  relativePath: string,
  content: string
): FileScanResult {
  const detector = new VueDetector()
  try {
    const res = detector.detect({ filePath, relativePath, content })
    return {
      filePath,
      relativePath,
      staticUsages: res.staticUsages,
      dynamicUsages: res.dynamicUsages,
      success: true,
    }
  } catch (err) {
    return {
      filePath,
      relativePath,
      staticUsages: [],
      dynamicUsages: [],
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Scans Svelte files (.svelte).
 */
export function scanSvelteFile(
  filePath: string,
  relativePath: string,
  content: string
): FileScanResult {
  const detector = new SvelteDetector()
  try {
    const res = detector.detect({ filePath, relativePath, content })
    return {
      filePath,
      relativePath,
      staticUsages: res.staticUsages,
      dynamicUsages: res.dynamicUsages,
      success: true,
    }
  } catch (err) {
    return {
      filePath,
      relativePath,
      staticUsages: [],
      dynamicUsages: [],
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * High-level scanner for any supported source file based on file extension and registered detectors.
 * Supports both positional arguments and FileScanInput object.
 */
export function scanSourceFile(
  filePathOrInput: string | FileScanInput,
  relativePath?: string,
  content?: string,
  workspaceConstants?: StaticConstantsMap
): FileScanResult {
  let filePath = ''
  let relPath = ''
  let fileContent = ''

  if (typeof filePathOrInput === 'object') {
    filePath = filePathOrInput.filePath
    relPath = filePathOrInput.relativePath
    fileContent = filePathOrInput.content
  } else {
    filePath = filePathOrInput
    relPath = relativePath || filePathOrInput
    fileContent = content || ''
  }

  try {
    const res = defaultDetectorRegistry.detectUsages({
      filePath,
      relativePath: relPath,
      content: fileContent,
      workspaceConstants,
    })

    return {
      filePath,
      relativePath: relPath,
      staticUsages: res.staticUsages,
      dynamicUsages: res.dynamicUsages,
      success: true,
    }
  } catch (err) {
    return {
      filePath,
      relativePath: relPath,
      staticUsages: [],
      dynamicUsages: [],
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Extracts all unique flattened key paths from parsed localization files.
 */
export function extractLocalizationKeyMap(
  parsedFiles: readonly ParsedLocalizationFile[]
): Map<string, { presentInLanguages: string[]; languageCount: number }> {
  const keyMap = new Map<string, { presentInLanguages: string[]; languageCount: number }>()

  for (const file of parsedFiles) {
    const langCode = normalizeLanguageCode(file.filename)
    const langName = getLanguageDisplayName(langCode) || file.filename
    const keys = file.keys ? Object.keys(file.keys) : []

    for (const key of keys) {
      const existing = keyMap.get(key)
      if (existing) {
        if (!existing.presentInLanguages.includes(langName)) {
          existing.presentInLanguages.push(langName)
          existing.languageCount = existing.presentInLanguages.length
        }
      } else {
        keyMap.set(key, {
          presentInLanguages: [langName],
          languageCount: 1,
        })
      }
    }
  }

  return keyMap
}

/**
 * Aggregates raw scan results and parsed localization files into structured KeyUsageScanResult.
 */
export function aggregateKeyUsages(
  fileScanResults: FileScanResult[],
  parsedFiles: readonly ParsedLocalizationFile[]
): KeyUsageScanResult {
  let scannedFilesCount = 0
  let parsedFilesCount = 0
  let skippedFilesCount = 0
  const skippedFiles: Array<{ filePath: string; error: string }> = []

  // Group detected static usages by key
  const staticUsagesByKey = new Map<string, KeyUsageLocation[]>()
  const allDynamicUsages: DynamicUsageLocation[] = []

  for (const res of fileScanResults) {
    scannedFilesCount++
    if (res.success) {
      parsedFilesCount++
    } else {
      skippedFilesCount++
      skippedFiles.push({
        filePath: res.filePath,
        error: res.error || 'Unknown scan error',
      })
    }
  }

  // Index usages by extracted key
  for (const res of fileScanResults) {
    if (res.success) {
      for (const u of res.staticUsages) {
        let key = u.key || ''
        if (!key) {
          const callMatch = /\(\s*[`'"](.*?)[`'"]\s*(?:,[\s\S]*)?\)|`([^`]+)`/.exec(
            u.matchedExpression
          )
          if (callMatch) {
            key = callMatch[1] ?? callMatch[2] ?? ''
          } else {
            key = u.matchedExpression
          }
        }
        key = key.trim()
        if (!key) continue

        const existing = staticUsagesByKey.get(key) || []
        existing.push(u)
        staticUsagesByKey.set(key, existing)
      }

      for (const d of res.dynamicUsages) {
        allDynamicUsages.push(d)
      }
    }
  }

  const knownLocKeys = extractLocalizationKeyMap(parsedFiles)
  const allKnownKeyNames = Array.from(knownLocKeys.keys())
  const possibleDynamicUsagesByKey = new Map<string, DynamicUsageLocation[]>()

  // 1. Workspace-aware dynamic prefix resolution
  for (const d of allDynamicUsages) {
    let prefix = d.staticPrefix || ''
    let suffix = ''

    if (!prefix) {
      // Extract static template prefix: e.g. `addKey.${expr}` or `providers.${id}.name`
      const tplMatch = /`([a-zA-Z0-9_.-]+)\$\{([\s\S]*?)\}([a-zA-Z0-9_.-]*)`/.exec(d.expression)
      if (tplMatch) {
        prefix = tplMatch[1]
        suffix = tplMatch[3] || ''
      } else {
        const concatMatch = /(['"])([a-zA-Z0-9_.-]+)\1\s*\+/.exec(d.expression)
        if (concatMatch) {
          prefix = concatMatch[2]
        }
      }
    }

    if (prefix && prefix.length >= 2) {
      // Find candidate known keys that match prefix and suffix
      const candidateKeys = allKnownKeyNames.filter((k) => {
        if (!k.startsWith(prefix)) return false
        if (suffix && !k.endsWith(suffix)) return false
        // Ensure reasonable depth (not an unrelated nested subtree)
        const remainder = k.substring(prefix.length, suffix ? k.length - suffix.length : undefined)
        return remainder.length > 0 && !remainder.includes('..')
      })

      // If bounded finite set found (<= 40 keys)
      if (candidateKeys.length > 0 && candidateKeys.length <= 40) {
        for (const candidateKey of candidateKeys) {
          const dynList = possibleDynamicUsagesByKey.get(candidateKey) || []
          dynList.push(d)
          possibleDynamicUsagesByKey.set(candidateKey, dynList)
        }
      }
    }
  }

  const items: KeyUsageItem[] = []

  let usedKeysCount = 0
  let unusedKeysCount = 0
  let missingKeysCount = 0

  // 2. Process all keys from localization files
  for (const [key, meta] of knownLocKeys.entries()) {
    const usages = staticUsagesByKey.get(key) || []
    const possibleDynamics = possibleDynamicUsagesByKey.get(key)
    const usageCount = usages.length
    const status = usageCount > 0 ? 'used' : 'unused'

    if (status === 'used') {
      usedKeysCount++
    } else {
      unusedKeysCount++
    }

    const hasStrong = usages.some((u) => u.confidence === 'strong')
    const hasMedium = usages.some((u) => u.confidence === 'medium')
    const highestConfidence: DetectionConfidence | undefined = hasStrong
      ? 'strong'
      : hasMedium
      ? 'medium'
      : usages.length > 0
      ? 'weak'
      : undefined

    const resolutionType: KeyResolutionType | undefined =
      usages.find((u) => u.resolutionType)?.resolutionType ||
      (usages.length > 0 ? 'direct-static' : undefined)

    items.push({
      key,
      status,
      usageCount,
      usages,
      presentInLanguages: meta.presentInLanguages,
      languageCount: meta.languageCount,
      highestConfidence,
      resolutionType,
      possibleDynamicUsages: possibleDynamics,
    })
  }

  // 3. Process code-reference missing keys (in code, but not in localization files)
  for (const [key, usages] of staticUsagesByKey.entries()) {
    if (!knownLocKeys.has(key)) {
      missingKeysCount++
      items.push({
        key,
        status: 'missing',
        usageCount: usages.length,
        usages,
        presentInLanguages: [],
        languageCount: 0,
        highestConfidence: 'strong',
        resolutionType: usages[0]?.resolutionType || 'direct-static',
      })
    }
  }

  // Sort items alphabetically by key
  items.sort((a, b) => a.key.localeCompare(b.key))

  return {
    scannedFilesCount,
    parsedFilesCount,
    skippedFilesCount,
    skippedFiles,
    totalUniqueKeys: items.length,
    usedKeysCount,
    unusedKeysCount,
    missingKeysCount,
    dynamicUsagesCount: allDynamicUsages.length,
    items,
    dynamicUsages: allDynamicUsages,
  }
}
