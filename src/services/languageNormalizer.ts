/**
 * Language code normalization service for translation engines.
 * Normalizes locale strings, filenames, and dialect codes into ISO 639-1 standards.
 */

// Common dialect mapping to standard language codes
const DIALECT_MAP: Record<string, string> = {
  'en-us': 'en',
  'en-gb': 'en',
  'en-ca': 'en',
  'en-au': 'en',
  'ru-ru': 'ru',
  'uk-ua': 'uk',
  'pl-pl': 'pl',
  'de-de': 'de',
  'de-at': 'de',
  'de-ch': 'de',
  'fr-fr': 'fr',
  'fr-ca': 'fr',
  'es-es': 'es',
  'es-mx': 'es',
  'es-419': 'es',
  'it-it': 'it',
  'pt-pt': 'pt',
  'pt-br': 'pt',
  'ja-jp': 'ja',
  'ko-kr': 'ko',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hans': 'zh',
  'zh-hant': 'zh',
  'nl-nl': 'nl',
  'nl-be': 'nl',
  'tr-tr': 'tr',
  'sv-se': 'sv',
  'nb-no': 'no',
  'nn-no': 'no',
  'da-dk': 'da',
  'fi-fi': 'fi',
  'cs-cz': 'cs',
  'hu-hu': 'hu',
  'ro-ro': 'ro',
  'bg-bg': 'bg',
  'el-gr': 'el',
  'he-il': 'he',
  'ar-sa': 'ar',
  'id-id': 'id',
  'vi-vn': 'vi',
  'th-th': 'th',
}

/**
 * Normalizes a locale identifier, filename, or BCP 47 tag to a standard language code.
 * Examples:
 * - "ru.json" -> "ru"
 * - "en-US" -> "en"
 * - "uk-UA" -> "uk"
 * - "pt_BR" -> "pt"
 * - "zh-CN" -> "zh"
 */
export function normalizeLanguageCode(input?: string): string {
  if (!input || !input.trim()) {
    return 'en'
  }

  // 1. Remove file extensions (e.g., .json, .yaml, .ts)
  let cleaned = input.trim().replace(/\.[a-zA-Z0-9]+$/i, '')

  // 2. Replace underscores with hyphens and convert to lowercase
  cleaned = cleaned.replace(/_/g, '-').toLowerCase()

  // 3. Check exact dialect map
  if (DIALECT_MAP[cleaned]) {
    return DIALECT_MAP[cleaned]
  }

  // 4. If hyphenated (e.g. "en-us" or "custom-lang"), extract primary subtag
  if (cleaned.includes('-')) {
    const primary = cleaned.split('-')[0]
    if (primary && primary.length >= 2) {
      return primary
    }
  }

  return cleaned
}
