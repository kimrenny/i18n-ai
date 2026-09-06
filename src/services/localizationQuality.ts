import type {
  ParsedLocalizationFile,
  LocalizationComparisonResult,
} from '../types/localization'
import type {
  LocalizationQualityIssue,
  QualityIssueSeverity,
  WorkspaceQualitySummary,
  QualityFilterOptions,
} from '../types/localizationQuality'
import {
  determineReferenceLanguage,
  getLanguageDisplayName,
} from './localizationCoverage'
import { normalizeLanguageCode } from './languageNormalizer'

// Regex patterns to capture software placeholders
// Matches: {name}, {{count}}, %s, %d, %1$s, $t(key), @:key, :variable, #tag#
const PLACEHOLDER_REGEX = /\{\{[^}]+\}\}|\{[^}]+\}|%[0-9]*\$?[sd]|%s|%d|\$t\([^)]+\)|@:[a-zA-Z0-9_.-]+|:[a-zA-Z0-9_]+|#[a-zA-Z0-9_]+#/g

// Regex pattern to capture HTML/XML tags
const HTML_TAG_REGEX = /<\/?([a-zA-Z0-9_-]+)(?:\s+[^>]*?)?\/?>/g

/**
 * Extracts multiset counts of placeholders from text.
 */
export function extractPlaceholderCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  if (!text) return counts
  const matches = text.match(PLACEHOLDER_REGEX)
  if (!matches) return counts
  for (const match of matches) {
    counts.set(match, (counts.get(match) || 0) + 1)
  }
  return counts
}

/**
 * Extracts multiset counts of HTML/XML tags from text.
 */
export function extractHtmlTagCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  if (!text) return counts
  const matches = text.match(HTML_TAG_REGEX)
  if (!matches) return counts
  for (const match of matches) {
    counts.set(match, (counts.get(match) || 0) + 1)
  }
  return counts
}

/**
 * Checks for missing or extra placeholders between reference and target texts.
 * Compares multiset counts so duplicate placeholders are validated while order differences are ignored.
 */
export function checkPlaceholderMismatch(
  refText: string,
  targetText: string
): { hasMismatch: boolean; missing: string[]; extra: string[] } {
  const refCounts = extractPlaceholderCounts(refText)
  const targetCounts = extractPlaceholderCounts(targetText)

  const missing: string[] = []
  const extra: string[] = []

  for (const [ph, count] of refCounts.entries()) {
    const targetCount = targetCounts.get(ph) || 0
    if (targetCount < count) {
      const diff = count - targetCount
      for (let i = 0; i < diff; i++) {
        missing.push(ph)
      }
    }
  }

  for (const [ph, count] of targetCounts.entries()) {
    const refCount = refCounts.get(ph) || 0
    if (count > refCount) {
      const diff = count - refCount
      for (let i = 0; i < diff; i++) {
        extra.push(ph)
      }
    }
  }

  return {
    hasMismatch: missing.length > 0 || extra.length > 0,
    missing,
    extra,
  }
}

/**
 * Checks for missing or extra HTML/XML tags between reference and target texts.
 */
export function checkHtmlTagMismatch(
  refText: string,
  targetText: string
): { hasMismatch: boolean; missing: string[]; extra: string[] } {
  const refCounts = extractHtmlTagCounts(refText)
  const targetCounts = extractHtmlTagCounts(targetText)

  const missing: string[] = []
  const extra: string[] = []

  for (const [tag, count] of refCounts.entries()) {
    const targetCount = targetCounts.get(tag) || 0
    if (targetCount < count) {
      const diff = count - targetCount
      for (let i = 0; i < diff; i++) {
        missing.push(tag)
      }
    }
  }

  for (const [tag, count] of targetCounts.entries()) {
    const refCount = refCounts.get(tag) || 0
    if (count > refCount) {
      const diff = count - refCount
      for (let i = 0; i < diff; i++) {
        extra.push(tag)
      }
    }
  }

  return {
    hasMismatch: missing.length > 0 || extra.length > 0,
    missing,
    extra,
  }
}

/**
 * Checks for suspicious leading or trailing whitespace/newline mismatches.
 */
export function checkWhitespaceMismatch(refText: string, targetText: string): boolean {
  // Check leading whitespace
  const refLeadingSpace = refText.startsWith(' ') || refText.startsWith('\t')
  const targetLeadingSpace = targetText.startsWith(' ') || targetText.startsWith('\t')
  if (refLeadingSpace !== targetLeadingSpace) return true

  // Check trailing whitespace
  const refTrailingSpace = refText.endsWith(' ') || refText.endsWith('\t')
  const targetTrailingSpace = targetText.endsWith(' ') || targetText.endsWith('\t')
  if (refTrailingSpace !== targetTrailingSpace) return true

  // Check leading newline
  const refLeadingNewline = refText.startsWith('\n') || refText.startsWith('\r\n')
  const targetLeadingNewline = targetText.startsWith('\n') || targetText.startsWith('\r\n')
  if (refLeadingNewline !== targetLeadingNewline) return true

  // Check trailing newline
  const refTrailingNewline = refText.endsWith('\n') || refText.endsWith('\r\n')
  const targetTrailingNewline = targetText.endsWith('\n') || targetText.endsWith('\r\n')
  if (refTrailingNewline !== targetTrailingNewline) return true

  return false
}

const SEVERITY_WEIGHT: Record<QualityIssueSeverity, number> = {
  error: 1,
  warning: 2,
  info: 3,
}

/**
 * Calculates project-wide localization quality issues deterministically.
 * Uses the canonical reference key set from determineReferenceLanguage.
 */
export function calculateWorkspaceQuality(
  files: readonly ParsedLocalizationFile[],
  comparisonResult?: LocalizationComparisonResult | null
): WorkspaceQualitySummary {
  const emptySummary: WorkspaceQualitySummary = {
    totalIssues: 0,
    totalErrors: 0,
    totalWarnings: 0,
    totalInfos: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    issues: [],
    bySeverity: { error: [], warning: [], info: [] },
    byType: {
      missing_translation: [],
      empty_translation: [],
      placeholder_mismatch: [],
      tag_mismatch: [],
      same_as_reference: [],
      whitespace_mismatch: [],
      structural_conflict: [],
    },
    byFile: {},
  }

  if (!files || files.length === 0) {
    return emptySummary
  }

  const refFile = determineReferenceLanguage(files)
  if (!refFile) {
    return emptySummary
  }

  const refKeys = Object.keys(refFile.keys).sort((a, b) => a.localeCompare(b))
  const allIssues: LocalizationQualityIssue[] = []

  // Collect all parent prefixes across the workspace (e.g. from nested.deep.leaf -> nested.deep)
  const allWorkspacePrefixes = new Set<string>()
  for (const f of files) {
    for (const k of Object.keys(f.keys)) {
      const parts = k.split('.')
      let prefix = ''
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}.${parts[i]}` : parts[i]
        allWorkspacePrefixes.add(prefix)
      }
    }
  }

  for (const file of files) {
    const isReference = file.filename === refFile.filename
    const languageCode = normalizeLanguageCode(file.filename)
    const languageName = getLanguageDisplayName(languageCode)
    const fileKeys = file.keys
    const fileKeyNames = Object.keys(fileKeys)

    // 1. Structural conflicts check (e.g. leaf key vs object branch)
    for (const k of fileKeyNames) {
      if (allWorkspacePrefixes.has(k)) {
        allIssues.push({
          id: `${file.filename}:structural_conflict:${k}`,
          type: 'structural_conflict',
          severity: 'error',
          filename: file.filename,
          key: k,
          referenceFilename: refFile.filename,
          message: `Structural conflict: key "${k}" is used as both an object section and a direct value.`,
          languageCode,
          languageName,
        })
      }
    }

    if (isReference) {
      // For reference file, check for empty values only
      for (const key of refKeys) {
        const val = refFile.keys[key]
        if (val === '' || val === null || val === undefined) {
          allIssues.push({
            id: `${file.filename}:empty_translation:${key}`,
            type: 'empty_translation',
            severity: 'warning',
            filename: file.filename,
            key,
            referenceFilename: refFile.filename,
            message: `Reference translation for "${key}" is empty.`,
            languageCode,
            languageName,
          })
        }
      }
    } else {
      // Re-use existing comparisonResult missing info if provided, otherwise compute from keys
      const missingKeysSet: Set<string> | null =
        comparisonResult && comparisonResult.keys
          ? new Set(
              comparisonResult.keys
                .filter((entry) => entry.missingInFiles.includes(file.filename))
                .map((entry) => entry.key)
            )
          : null

      // For non-reference files
      for (const key of refKeys) {
        const isMissing = missingKeysSet
          ? missingKeysSet.has(key)
          : !Object.prototype.hasOwnProperty.call(fileKeys, key)

        if (isMissing) {
          // A. Missing translation (short-circuit: do not run further checks on missing key)
          allIssues.push({
            id: `${file.filename}:missing_translation:${key}`,
            type: 'missing_translation',
            severity: 'error',
            filename: file.filename,
            key,
            referenceFilename: refFile.filename,
            message: `Translation missing for key "${key}".`,
            languageCode,
            languageName,
          })
          continue
        }

        const targetVal = fileKeys[key]
        const refVal = refFile.keys[key]

        // B. Empty translation (short-circuit: do not run further checks on empty key)
        if (targetVal === '' || targetVal === null || targetVal === undefined) {
          allIssues.push({
            id: `${file.filename}:empty_translation:${key}`,
            type: 'empty_translation',
            severity: 'warning',
            filename: file.filename,
            key,
            referenceFilename: refFile.filename,
            message: `Translation for key "${key}" is empty.`,
            languageCode,
            languageName,
          })
          continue
        }

        if (typeof targetVal === 'string' && typeof refVal === 'string') {
          // C. Same-as-reference translation
          if (targetVal === refVal && refVal.trim().length > 0) {
            allIssues.push({
              id: `${file.filename}:same_as_reference:${key}`,
              type: 'same_as_reference',
              severity: 'info',
              filename: file.filename,
              key,
              referenceFilename: refFile.filename,
              message: `Translation is identical to reference value: "${refVal}".`,
              languageCode,
              languageName,
              details: {
                referenceValue: refVal,
                targetValue: targetVal,
              },
            })
          }

          // D. Placeholder mismatch (multiset comparison)
          const phMismatch = checkPlaceholderMismatch(refVal, targetVal)
          if (phMismatch.hasMismatch) {
            const descParts: string[] = []
            if (phMismatch.missing.length > 0) {
              descParts.push(`missing [${phMismatch.missing.join(', ')}]`)
            }
            if (phMismatch.extra.length > 0) {
              descParts.push(`extra [${phMismatch.extra.join(', ')}]`)
            }
            allIssues.push({
              id: `${file.filename}:placeholder_mismatch:${key}`,
              type: 'placeholder_mismatch',
              severity: 'error',
              filename: file.filename,
              key,
              referenceFilename: refFile.filename,
              message: `Placeholder mismatch: ${descParts.join('; ')}.`,
              languageCode,
              languageName,
              details: {
                referenceValue: refVal,
                targetValue: targetVal,
                missingPlaceholders: phMismatch.missing,
                extraPlaceholders: phMismatch.extra,
              },
            })
          }

          // E. HTML/XML Tag mismatch
          const tagMismatch = checkHtmlTagMismatch(refVal, targetVal)
          if (tagMismatch.hasMismatch) {
            const descParts: string[] = []
            if (tagMismatch.missing.length > 0) {
              descParts.push(`missing tags [${tagMismatch.missing.join(', ')}]`)
            }
            if (tagMismatch.extra.length > 0) {
              descParts.push(`extra tags [${tagMismatch.extra.join(', ')}]`)
            }
            allIssues.push({
              id: `${file.filename}:tag_mismatch:${key}`,
              type: 'tag_mismatch',
              severity: 'error',
              filename: file.filename,
              key,
              referenceFilename: refFile.filename,
              message: `Markup mismatch: ${descParts.join('; ')}.`,
              languageCode,
              languageName,
              details: {
                referenceValue: refVal,
                targetValue: targetVal,
                missingTags: tagMismatch.missing,
                extraTags: tagMismatch.extra,
              },
            })
          }

          // F. Whitespace mismatch
          if (checkWhitespaceMismatch(refVal, targetVal)) {
            allIssues.push({
              id: `${file.filename}:whitespace_mismatch:${key}`,
              type: 'whitespace_mismatch',
              severity: 'warning',
              filename: file.filename,
              key,
              referenceFilename: refFile.filename,
              message: `Leading or trailing whitespace does not match reference value.`,
              languageCode,
              languageName,
              details: {
                referenceValue: refVal,
                targetValue: targetVal,
              },
            })
          }
        }
      }
    }
  }

  // Deterministic sorting:
  // 1. Severity weight (error: 1, warning: 2, info: 3)
  // 2. Filename (localeCompare)
  // 3. Key (localeCompare)
  // 4. Issue Type (localeCompare)
  allIssues.sort((a, b) => {
    const sevDiff = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity]
    if (sevDiff !== 0) return sevDiff

    const fileDiff = a.filename.localeCompare(b.filename)
    if (fileDiff !== 0) return fileDiff

    const keyDiff = a.key.localeCompare(b.key)
    if (keyDiff !== 0) return keyDiff

    return a.type.localeCompare(b.type)
  })

  let errorCount = 0
  let warningCount = 0
  let infoCount = 0

  const bySeverity: WorkspaceQualitySummary['bySeverity'] = {
    error: [],
    warning: [],
    info: [],
  }

  const byType: WorkspaceQualitySummary['byType'] = {
    missing_translation: [],
    empty_translation: [],
    placeholder_mismatch: [],
    tag_mismatch: [],
    same_as_reference: [],
    whitespace_mismatch: [],
    structural_conflict: [],
  }

  const byFile: WorkspaceQualitySummary['byFile'] = {}

  for (const issue of allIssues) {
    if (issue.severity === 'error') errorCount++
    if (issue.severity === 'warning') warningCount++
    if (issue.severity === 'info') infoCount++

    bySeverity[issue.severity].push(issue)
    byType[issue.type].push(issue)

    if (!byFile[issue.filename]) {
      byFile[issue.filename] = []
    }
    byFile[issue.filename].push(issue)
  }

  return {
    totalIssues: allIssues.length,
    totalErrors: errorCount,
    totalWarnings: warningCount,
    totalInfos: infoCount,
    errorCount,
    warningCount,
    infoCount,
    issues: allIssues,
    bySeverity,
    byType,
    byFile,
  }
}

/**
 * Pure filtering function for quality issues list.
 */
export function filterQualityIssues(
  issues: readonly LocalizationQualityIssue[],
  filters: QualityFilterOptions
): LocalizationQualityIssue[] {
  const { severity = 'all', type = 'all', filename = 'all', language = 'all' } = filters
  const fileFilter = filename !== 'all' ? filename : language

  return issues.filter((issue) => {
    if (severity !== 'all' && issue.severity !== severity) {
      return false
    }
    if (type !== 'all' && issue.type !== type) {
      return false
    }
    if (fileFilter !== 'all' && issue.filename !== fileFilter && issue.languageCode !== fileFilter) {
      return false
    }
    return true
  })
}
