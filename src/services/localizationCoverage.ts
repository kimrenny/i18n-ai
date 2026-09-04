import type {
  ParsedLocalizationFile,
  LocalizationComparisonResult,
} from '../types/localization'
import type {
  LanguageCoverageItem,
  WorkspaceCoverageSummary,
  ProblemNavigationTarget,
} from '../types/localizationCoverage'
import { normalizeLanguageCode } from './languageNormalizer'
import { getMissingKeysForFile, getEmptyKeysForFile } from './missingKeyNavigator'
import { SUPPORTED_LANGUAGES } from '../types/settings'

const LANGUAGE_NAMES: Record<string, { englishName: string; nativeName: string }> = {
  en: { englishName: 'English', nativeName: 'English' },
  uk: { englishName: 'Ukrainian', nativeName: 'Українська' },
  ru: { englishName: 'Russian', nativeName: 'Русский' },
  de: { englishName: 'German', nativeName: 'Deutsch' },
  fr: { englishName: 'French', nativeName: 'Français' },
  es: { englishName: 'Spanish', nativeName: 'Español' },
  pt: { englishName: 'Portuguese', nativeName: 'Português' },
  it: { englishName: 'Italian', nativeName: 'Italiano' },
  pl: { englishName: 'Polish', nativeName: 'Polski' },
  cs: { englishName: 'Czech', nativeName: 'Čeština' },
  tr: { englishName: 'Turkish', nativeName: 'Türkçe' },
  zh: { englishName: 'Chinese (Simplified)', nativeName: '简体中文' },
  'zh-cn': { englishName: 'Chinese (Simplified)', nativeName: '简体中文' },
  ja: { englishName: 'Japanese', nativeName: '日本語' },
  ko: { englishName: 'Korean', nativeName: '한국어' },
  ar: { englishName: 'Arabic', nativeName: 'العربية' },
  nl: { englishName: 'Dutch', nativeName: 'Nederlands' },
  sv: { englishName: 'Swedish', nativeName: 'Svenska' },
  no: { englishName: 'Norwegian', nativeName: 'Norsk' },
  da: { englishName: 'Danish', nativeName: 'Dansk' },
  fi: { englishName: 'Finnish', nativeName: 'Suomi' },
  el: { englishName: 'Greek', nativeName: 'Ελληνικά' },
  he: { englishName: 'Hebrew', nativeName: 'עברית' },
  hu: { englishName: 'Hungarian', nativeName: 'Magyar' },
  ro: { englishName: 'Romanian', nativeName: 'Română' },
  hi: { englishName: 'Hindi', nativeName: 'हिन्दी' },
  id: { englishName: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  vi: { englishName: 'Vietnamese', nativeName: 'Tiếng Việt' },
  th: { englishName: 'Thai', nativeName: 'ไทย' },
}

/**
 * Gets a readable language display name from language code.
 */
export function getLanguageDisplayName(code: string): string {
  const normalized = normalizeLanguageCode(code)
  if (LANGUAGE_NAMES[normalized]) {
    return LANGUAGE_NAMES[normalized].englishName
  }
  const supported = SUPPORTED_LANGUAGES.find((l) => l.code === normalized)
  if (supported) {
    return supported.englishName
  }
  return code.toUpperCase()
}

/**
 * Determines reference language file:
 * Prefers English ('en') if present, otherwise returns first valid file.
 */
export function determineReferenceLanguage(
  files: readonly ParsedLocalizationFile[]
): ParsedLocalizationFile | null {
  if (!files || files.length === 0) {
    return null
  }

  const enFile = files.find((f) => {
    const code = normalizeLanguageCode(f.filename)
    return code === 'en'
  })

  return enFile || files[0]
}

/**
 * Calculates workspace-wide translation coverage based on the canonical reference key set.
 */
export function calculateWorkspaceCoverage(
  files: readonly ParsedLocalizationFile[]
): WorkspaceCoverageSummary {
  if (!files || files.length === 0) {
    return {
      totalFiles: 0,
      totalLanguages: 0,
      totalReferenceKeys: 0,
      totalMissingKeys: 0,
      totalEmptyKeys: 0,
      averageCoverage: null,
      referenceLanguageCode: '',
      referenceLanguageName: '',
      referenceFilename: '',
      leastCompleteLanguages: [],
      items: [],
    }
  }

  const refFile = determineReferenceLanguage(files)
  if (!refFile) {
    return {
      totalFiles: 0,
      totalLanguages: 0,
      totalReferenceKeys: 0,
      totalMissingKeys: 0,
      totalEmptyKeys: 0,
      averageCoverage: null,
      referenceLanguageCode: '',
      referenceLanguageName: '',
      referenceFilename: '',
      leastCompleteLanguages: [],
      items: [],
    }
  }

  const refCode = normalizeLanguageCode(refFile.filename)
  const refName = getLanguageDisplayName(refCode)
  const refKeys = Object.keys(refFile.keys)
  const totalExpectedKeys = refKeys.length

  const items: LanguageCoverageItem[] = files.map((file) => {
    const isReference = file.filename === refFile.filename
    const languageCode = normalizeLanguageCode(file.filename)
    const languageName = getLanguageDisplayName(languageCode)

    if (isReference) {
      return {
        filename: file.filename,
        path: file.path,
        languageCode,
        languageName,
        isReference: true,
        totalExpectedKeys,
        translatedKeysCount: totalExpectedKeys,
        missingKeysCount: 0,
        emptyKeysCount: 0,
        coveragePercentage: 100,
        issuesCount: 0,
      }
    }

    let translatedKeysCount = 0
    let missingKeysCount = 0
    let emptyKeysCount = 0

    for (const key of refKeys) {
      if (Object.prototype.hasOwnProperty.call(file.keys, key)) {
        const val = file.keys[key]
        if (val === '' || val === null || val === undefined) {
          emptyKeysCount++
        } else {
          translatedKeysCount++
        }
      } else {
        missingKeysCount++
      }
    }

    const coveragePercentage =
      totalExpectedKeys > 0
        ? Math.round((translatedKeysCount / totalExpectedKeys) * 100)
        : 100
    const issuesCount = missingKeysCount + emptyKeysCount

    return {
      filename: file.filename,
      path: file.path,
      languageCode,
      languageName,
      isReference: false,
      totalExpectedKeys,
      translatedKeysCount,
      missingKeysCount,
      emptyKeysCount,
      coveragePercentage,
      issuesCount,
    }
  })

  // Calculate unique languages count
  const uniqueLanguageCodes = new Set(items.map((i) => i.languageCode))

  // Non-reference statistics
  const nonReferenceItems = items.filter((i) => !i.isReference)
  const totalMissingKeys = nonReferenceItems.reduce(
    (acc, curr) => acc + curr.missingKeysCount,
    0
  )
  const totalEmptyKeys = nonReferenceItems.reduce(
    (acc, curr) => acc + curr.emptyKeysCount,
    0
  )

  const averageCoverage =
    nonReferenceItems.length > 0
      ? Math.round(
          nonReferenceItems.reduce((acc, curr) => acc + curr.coveragePercentage, 0) /
            nonReferenceItems.length
        )
      : null

  // Least complete languages (sorted ascending by coverage, then descending by issues, then alphabetical)
  const leastCompleteLanguages = [...items]
    .filter((item) => !item.isReference)
    .sort((a, b) => {
      if (a.coveragePercentage !== b.coveragePercentage) {
        return a.coveragePercentage - b.coveragePercentage
      }
      if (a.issuesCount !== b.issuesCount) {
        return b.issuesCount - a.issuesCount
      }
      return a.languageName.localeCompare(b.languageName)
    })

  return {
    totalFiles: files.length,
    totalLanguages: uniqueLanguageCodes.size,
    totalReferenceKeys: totalExpectedKeys,
    totalMissingKeys,
    totalEmptyKeys,
    averageCoverage,
    referenceLanguageCode: refCode,
    referenceLanguageName: refName,
    referenceFilename: refFile.filename,
    leastCompleteLanguages,
    items,
  }
}

/**
 * Determines the first problem key to navigate to when clicking a language row.
 * Priority:
 * 1. Missing keys (alphabetical)
 * 2. Empty keys (alphabetical)
 * 3. null (if file has no issues)
 */
export function getFirstProblemKeyForFile(
  filename: string,
  comparisonResult?: LocalizationComparisonResult | null
): ProblemNavigationTarget | null {
  if (!comparisonResult) {
    return null
  }

  const missing = getMissingKeysForFile(filename, comparisonResult)
  if (missing.length > 0) {
    return {
      key: missing[0],
      mode: 'missing',
    }
  }

  const empty = getEmptyKeysForFile(filename, comparisonResult)
  if (empty.length > 0) {
    return {
      key: empty[0],
      mode: 'empty',
    }
  }

  return null
}
