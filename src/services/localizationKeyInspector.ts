import type { ParsedLocalizationFile, JsonValue } from '../types/localization'
import type {
  KeyInspectionResult,
  KeyLanguageStatus,
  KeyTranslationStatus,
} from '../types/localizationKeyInspector'
import {
  determineReferenceLanguage,
  getLanguageDisplayName,
} from './localizationCoverage'
import { normalizeLanguageCode } from './languageNormalizer'

/**
 * Formats a JsonValue into a displayable string for inspector preview.
 */
export function formatKeyValue(val: JsonValue | undefined): string | null {
  if (val === undefined) {
    return null
  }
  if (typeof val === 'string') {
    return val
  }
  if (val === null) {
    return ''
  }
  if (typeof val === 'boolean' || typeof val === 'number') {
    return String(val)
  }
  if (Array.isArray(val)) {
    return JSON.stringify(val)
  }
  return '{...}'
}

/**
 * Determines whether a given value constitutes an 'empty' translation status.
 */
export function isValueEmpty(val: JsonValue | undefined): boolean {
  return val === '' || val === null || val === undefined
}

/**
 * Inspects a translation key across all parsed localization files.
 * Reuses reference language determination and status semantics.
 */
export function inspectTranslationKey(
  key: string | null | undefined,
  files: readonly ParsedLocalizationFile[]
): KeyInspectionResult | null {
  if (!key || typeof key !== 'string' || key.trim() === '' || !files || files.length === 0) {
    return null
  }

  const trimmedKey = key.trim()
  const refFile = determineReferenceLanguage(files)
  const totalLanguages = files.length

  let translatedCount = 0
  let emptyCount = 0
  let missingCount = 0

  const languages: KeyLanguageStatus[] = []

  for (const file of files) {
    const isReference = refFile !== null && file.filename === refFile.filename
    const languageCode = normalizeLanguageCode(file.filename)
    const languageName = getLanguageDisplayName(languageCode)

    const rawPresent = Object.prototype.hasOwnProperty.call(file.keys, trimmedKey)
    const rawVal = rawPresent ? file.keys[trimmedKey] : undefined

    let status: KeyTranslationStatus

    if (!rawPresent) {
      status = 'missing'
      missingCount++
    } else if (isValueEmpty(rawVal)) {
      status = 'empty'
      emptyCount++
    } else {
      status = 'translated'
      translatedCount++
    }

    languages.push({
      filename: file.filename,
      filePath: file.path,
      languageCode,
      languageName,
      isReference,
      status,
      value: formatKeyValue(rawVal),
      rawPresent,
    })
  }

  // Determine reference language details
  let referenceLanguage: KeyInspectionResult['referenceLanguage'] = null
  if (refFile) {
    const refCode = normalizeLanguageCode(refFile.filename)
    const refName = getLanguageDisplayName(refCode)
    const refPresent = Object.prototype.hasOwnProperty.call(refFile.keys, trimmedKey)
    const refVal = refPresent ? refFile.keys[trimmedKey] : undefined
    const refStatus: KeyTranslationStatus = !refPresent
      ? 'missing'
      : isValueEmpty(refVal)
        ? 'empty'
        : 'translated'

    referenceLanguage = {
      filename: refFile.filename,
      languageCode: refCode,
      languageName: refName,
      value: formatKeyValue(refVal),
      status: refStatus,
    }
  }

  const coveragePercentage =
    totalLanguages > 0 ? Math.round((translatedCount / totalLanguages) * 100) : 0

  return {
    key: trimmedKey,
    referenceLanguage,
    languages,
    totalLanguages,
    translatedCount,
    emptyCount,
    missingCount,
    coveragePercentage,
  }
}
