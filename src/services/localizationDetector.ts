/**
 * Utility to strictly distinguish localization/translation JSON files from
 * general project/configuration JSON files (e.g. package.json, tsconfig.json).
 */

const KNOWN_NON_LOCALIZATION_FILENAMES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock.json',
  'pnpm-lock.json',
  'composer.json',
  'composer.lock.json',
  'bower.json',
  'lerna.json',
  'turbo.json',
  'nx.json',
  'angular.json',
  'nest-cli.json',
  'manifest.json',
  'app.json',
  'project.json',
  'launch.json',
  'settings.json',
  'tasks.json',
  'extensions.json',
  'schema.json',
  'vercel.json',
  'netlify.json',
  'now.json',
])

const KNOWN_NON_LOCALIZATION_PATTERNS = [
  /^tsconfig(\..*)?\.json$/i,
  /^jsconfig(\..*)?\.json$/i,
  /^\.eslintrc(\..*)?\.json$/i,
  /^\.prettierrc(\..*)?\.json$/i,
  /^\.babelrc(\..*)?\.json$/i,
  /^\.stylelintrc(\..*)?\.json$/i,
  /^\.swcrc(\..*)?\.json$/i,
  /^jest\.config(\..*)?\.json$/i,
  /^typedoc(\..*)?\.json$/i,
  /\.schema\.json$/i,
]

// Standard ISO 639-1 / BCP 47 language codes and common locale names
export const STANDARD_LOCALE_CODES = new Set([
  'en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'cs', 'tr', 'uk', 'zh', 'zh-cn', 'zh-tw', 'zh-hans', 'zh-hant',
  'ja', 'ko', 'ar', 'hi', 'bn', 'nl', 'sv', 'no', 'da', 'fi', 'el', 'he', 'hu', 'id', 'ms', 'ro', 'sk', 'bg',
  'hr', 'sr', 'sl', 'et', 'lv', 'lt', 'th', 'vi', 'fa', 'ur', 'kk', 'uz', 'az', 'hy', 'ka', 'eu', 'gl', 'ca',
  'en-us', 'en-gb', 'en-ca', 'en-au', 'pt-br', 'pt-pt', 'es-es', 'es-419', 'es-mx', 'fr-fr', 'fr-ca', 'de-de',
  'de-at', 'de-ch', 'it-it', 'ru-ru', 'uk-ua', 'ja-jp', 'ko-kr',
])

/**
 * Common real-world locale aliases mapping to standard ISO 639-1 language codes.
 * Example: 'ua' is widely used as a real-world filename convention for Ukrainian ('uk').
 */
export const LOCALE_ALIASES: Record<string, string> = {
  ua: 'uk',
  'ua-ua': 'uk',
  'uk-ua': 'uk',
  cn: 'zh',
  cz: 'cs',
  jp: 'ja',
  kr: 'ko',
}

/**
 * Normalizes a locale code candidate, resolving aliases (e.g. 'ua' -> 'uk').
 */
export function normalizeLocaleCode(code: string): string {
  const lower = code.toLowerCase().trim()
  if (LOCALE_ALIASES[lower]) {
    return LOCALE_ALIASES[lower]
  }
  return lower
}

/**
 * Checks if a code string is a recognized ISO 639-1 locale code or known alias.
 */
export function isRecognizedLocaleCode(code: string): boolean {
  const lower = code.toLowerCase().trim()
  const normalized = normalizeLocaleCode(lower)
  return STANDARD_LOCALE_CODES.has(normalized) || STANDARD_LOCALE_CODES.has(lower)
}

export const LOCALIZATION_DIR_NAMES = new Set([
  'locales',
  'locale',
  'i18n',
  'lang',
  'langs',
  'languages',
  'translations',
  'translation',
  'messages',
])

export const RECOGNIZED_LOCALIZATION_NAMESPACES = new Set([
  'common',
  'messages',
  'strings',
  'ui',
  'errors',
  'auth',
  'labels',
  'menu',
  'navigation',
  'footer',
  'header',
  'buttons',
  'dialogs',
  'validation',
  'forms',
  'translation',
  'translations',
  'locale',
  'locales',
  'main',
  'global',
])

/**
 * Determines whether a file path/name represents a translation file.
 */
export function isLocalizationFile(fileName: string, relativePath = '', parsedContent?: unknown): boolean {
  const lowerName = fileName.toLowerCase().trim()

  // Must end with .json
  if (!lowerName.endsWith('.json')) {
    return false
  }

  // Check blacklist of known config filenames
  if (KNOWN_NON_LOCALIZATION_FILENAMES.has(lowerName)) {
    return false
  }

  // Check blacklist patterns (e.g. tsconfig.app.json, .eslintrc.json)
  for (const pattern of KNOWN_NON_LOCALIZATION_PATTERNS) {
    if (pattern.test(lowerName)) {
      return false
    }
  }

  const baseNameWithoutExt = lowerName.replace(/\.json$/, '')

  // 1. Direct match with standard language/locale code or alias (e.g. en.json, ru.json, uk.json, ua.json, zh-CN.json)
  if (isRecognizedLocaleCode(baseNameWithoutExt)) {
    return true
  }

  // 2. Common prefix/suffix patterns (e.g. messages_en.json, messages_ua.json, translation.ru.json, strings-de.json, locale.ua.json, i18n-ua.json)
  const parts = baseNameWithoutExt.split(/[_.-]/).filter(Boolean)
  const hasLocaleCodeInParts = parts.some((part) => isRecognizedLocaleCode(part))
  if (hasLocaleCodeInParts) {
    return true
  }

  // 3. Content-based verification if parsed content is provided
  if (parsedContent && typeof parsedContent === 'object' && !Array.isArray(parsedContent)) {
    return isLocalizationContentStructure(parsedContent as Record<string, unknown>)
  }

  // 4. Located in a recognized localization directory with recognized namespace (e.g. locales/common.json, i18n/menu.json)
  const normalizedPath = (relativePath || '').toLowerCase().replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/').filter(Boolean)
  const isInLocalizationDir = pathSegments.some((seg) => LOCALIZATION_DIR_NAMES.has(seg))
  if (isInLocalizationDir && RECOGNIZED_LOCALIZATION_NAMESPACES.has(baseNameWithoutExt)) {
    return true
  }

  // Default: if it doesn't match any locale code, prefix/suffix, recognized namespace, or verified content structure, it is not a localization file
  return false
}

/**
 * Analyzes object structure to check if it looks like a localization dictionary
 * (nested key-value pairs where leaf nodes are strings) and not a config file.
 */
export function isLocalizationContentStructure(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj)
  if (keys.length === 0) {
    return true // empty translation file
  }

  // Exclude common npm/config root keys
  const configKeys = new Set([
    'name',
    'version',
    'dependencies',
    'devdependencies',
    'peerdependencies',
    'scripts',
    'compileroptions',
    '$schema',
    'workspaces',
    'repository',
    'license',
    'rules',
    'extends',
    'plugins',
  ])

  let configKeyMatchCount = 0
  for (const k of keys) {
    if (configKeys.has(k.toLowerCase())) {
      configKeyMatchCount++
    }
  }
  if (configKeyMatchCount >= 2) {
    return false
  }

  // Check leaves: at least 70% of non-object values should be strings
  let totalLeaves = 0
  let stringLeaves = 0

  const inspect = (node: Record<string, unknown>, depth: number) => {
    if (depth > 12) return
    for (const val of Object.values(node)) {
      if (typeof val === 'string') {
        totalLeaves++
        stringLeaves++
      } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        inspect(val as Record<string, unknown>, depth + 1)
      } else if (val !== null && val !== undefined) {
        totalLeaves++
      }
    }
  }

  inspect(obj, 0)
  if (totalLeaves === 0) return true
  return stringLeaves / totalLeaves >= 0.7
}
