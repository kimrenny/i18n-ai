import {
  AiTranslationError,
  parseRetryAfterHeader,
} from './aiService'
import { migrateAppSettings } from '../../src/types/settings'

export function resolveFreeSettingsPayload(settings: unknown): FreeTranslationSettingsPayload {
  const canonical = migrateAppSettings(settings)
  return canonical.freeTranslation as FreeTranslationSettingsPayload
}

export interface SingleFreeTranslationRequestPayload {
  key: string
  sourceFile: string
  targetFile: string
  sourceLanguage?: string
  targetLanguage?: string
  sourceValue: string
  context?: string
}

export interface BatchFreeTranslationEntryPayload {
  key: string
  text: string
  context?: string
}

export interface BatchFreeTranslationRequestPayload {
  targetLanguage: string
  sourceLanguage?: string
  targetFile: string
  sourceFile: string
  entries: BatchFreeTranslationEntryPayload[]
}

export interface FreeTranslationSettingsPayload {
  provider: string
  providers: Record<
    string,
    {
      baseUrl?: string
      apiKey?: string
      email?: string
    }
  >
}

export interface SingleFreeTranslationResponsePayload {
  translatedText: string
  provider: string
  model: string
}

export interface BatchFreeTranslationResponsePayload {
  translations: { key: string; translation: string }[]
  provider: string
  model: string
}

// Regex to capture placeholders for validation
const PLACEHOLDER_REGEX = /\{\{[^}]+\}\}|\{[^}]+\}|%[0-9]*\$?[sd]|%s|%d|\$t\([^)]+\)|@:[a-zA-Z0-9_.-]+|:[a-zA-Z0-9_]+|#[a-zA-Z0-9_]+#/g
const HTML_TAG_REGEX = /<\/?([a-zA-Z0-9_-]+)(?:\s+[^>]*?)?\/?>/g

function extractPlaceholders(text: string): string[] {
  if (!text) return []
  const matches = text.match(PLACEHOLDER_REGEX)
  return matches ? Array.from(new Set(matches)) : []
}

function extractHtmlTags(text: string): string[] {
  if (!text) return []
  const matches = text.match(HTML_TAG_REGEX)
  return matches ? Array.from(new Set(matches)) : []
}

function validateTranslatedItem(key: string, sourceText: string, translatedText: string): void {
  if (sourceText.trim() !== '' && translatedText.trim() === '') {
    throw new AiTranslationError(
      `Empty translation returned for non-empty key "${key}".`,
      { code: 'VALIDATION_EMPTY', retryable: false }
    )
  }

  // Placeholders check
  const placeholders = extractPlaceholders(sourceText)
  for (const ph of placeholders) {
    if (!translatedText.includes(ph)) {
      throw new AiTranslationError(
        `Placeholder "${ph}" in key "${key}" was corrupted or missing in translation: "${translatedText}".`,
        { code: 'VALIDATION_PLACEHOLDER_CORRUPTED', retryable: false }
      )
    }
  }

  // HTML tags check
  const tags = extractHtmlTags(sourceText)
  for (const tag of tags) {
    if (!translatedText.includes(tag)) {
      throw new AiTranslationError(
        `HTML/XML tag "${tag}" in key "${key}" was corrupted or missing in translation: "${translatedText}".`,
        { code: 'VALIDATION_HTML_CORRUPTED', retryable: false }
      )
    }
  }
}

/**
 * Normalizes language codes for free translation engines (e.g. en-US -> en).
 */
export function normalizeLanguage(lang?: string): string {
  if (!lang) return 'en'
  const cleaned = lang.replace(/\.[a-zA-Z0-9]+$/i, '').replace(/_/g, '-').toLowerCase()
  if (cleaned.startsWith('en')) return 'en'
  if (cleaned.startsWith('ru')) return 'ru'
  if (cleaned.startsWith('uk')) return 'uk'
  if (cleaned.startsWith('pl')) return 'pl'
  if (cleaned.startsWith('de')) return 'de'
  if (cleaned.startsWith('fr')) return 'fr'
  if (cleaned.startsWith('es')) return 'es'
  if (cleaned.startsWith('it')) return 'it'
  if (cleaned.startsWith('pt')) return 'pt'
  if (cleaned.startsWith('zh')) return 'zh'
  if (cleaned.startsWith('ja')) return 'ja'
  if (cleaned.startsWith('ko')) return 'ko'
  if (cleaned.includes('-')) return cleaned.split('-')[0]
  return cleaned
}

/**
 * Executes a single translation using a Free Translation provider (LibreTranslate or MyMemory).
 */
export async function performFreeTranslation(
  request: SingleFreeTranslationRequestPayload,
  settings: unknown
): Promise<SingleFreeTranslationResponsePayload> {
  const resolved = resolveFreeSettingsPayload(settings)
  const provider = resolved.provider || 'libretranslate'
  const config = resolved.providers?.[provider] || { baseUrl: 'http://localhost:5000' }
  const targetLanguage = normalizeLanguage(request.targetLanguage || request.targetFile)
  const sourceLanguage = normalizeLanguage(request.sourceLanguage || request.sourceFile)

  if (!request.sourceValue) {
    return {
      translatedText: '',
      provider,
      model: 'free-v1',
    }
  }

  // 1. LibreTranslate
  if (provider === 'libretranslate') {
    const baseUrl = (config.baseUrl?.trim() || 'http://localhost:5000').replace(/\/+$/, '')
    const endpoint = `${baseUrl}/translate`

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: request.sourceValue,
          source: sourceLanguage,
          target: targetLanguage,
          format: 'text',
          api_key: config.apiKey?.trim() || undefined,
        }),
      })
    } catch (err) {
      if (
        err instanceof TypeError &&
        (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED'))
      ) {
        throw new AiTranslationError(
          `Unable to connect to LibreTranslate at ${baseUrl}. Ensure your local or remote LibreTranslate instance is running.`,
          { status: 0, retryable: false, code: 'CONNECTION_REFUSED' }
        )
      }
      throw new AiTranslationError(
        `Network error connecting to LibreTranslate: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, code: 'NETWORK_ERROR' }
      )
    }

    if (!response.ok) {
      const errText = await response.text()
      const retryAfterMs = parseRetryAfterHeader(
        response.headers?.get ? response.headers.get('retry-after') : undefined
      )
      const status = response.status
      const retryable = status === 429 || (status >= 500 && status <= 504) || status === 408

      let message = `LibreTranslate Error (${status}): ${errText || response.statusText}`
      if (status === 429) {
        message = 'LibreTranslate rate limit reached (HTTP 429). Too many requests.'
      } else if (status === 403) {
        message = 'Unauthorized LibreTranslate request. Please check your API key in Settings.'
      }

      throw new AiTranslationError(message, {
        status,
        retryable,
        retryAfterMs,
        code: `HTTP_${status}`,
      })
    }

    const data = (await response.json()) as { translatedText?: string | string[] }
    let translated = ''
    if (typeof data.translatedText === 'string') {
      translated = data.translatedText
    } else if (Array.isArray(data.translatedText) && data.translatedText[0]) {
      translated = data.translatedText[0]
    }

    validateTranslatedItem(request.key, request.sourceValue, translated)

    return {
      translatedText: translated,
      provider: 'libretranslate',
      model: 'libretranslate-standard',
    }
  }

  // 2. MyMemory
  if (provider === 'mymemory') {
    const baseUrl = (config.baseUrl?.trim() || 'https://api.mymemory.translated.net').replace(
      /\/+$/,
      ''
    )
    const emailParam = config.email?.trim() ? `&de=${encodeURIComponent(config.email.trim())}` : ''
    const keyParam = config.apiKey?.trim() ? `&key=${encodeURIComponent(config.apiKey.trim())}` : ''
    const endpoint = `${baseUrl}/get?q=${encodeURIComponent(request.sourceValue)}&langpair=${sourceLanguage}|${targetLanguage}${emailParam}${keyParam}`

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })
    } catch (err) {
      throw new AiTranslationError(
        `Network error connecting to MyMemory: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, code: 'NETWORK_ERROR' }
      )
    }

    if (!response.ok) {
      const status = response.status
      const retryAfterMs = parseRetryAfterHeader(
        response.headers?.get ? response.headers.get('retry-after') : undefined
      )
      const retryable = status === 429 || (status >= 500 && status <= 504) || status === 408
      throw new AiTranslationError(
        `MyMemory Error (${status}): ${response.statusText}`,
        { status, retryable, retryAfterMs, code: `HTTP_${status}` }
      )
    }

    const data = (await response.json()) as {
      responseData?: { translatedText?: string }
      responseStatus?: number
      responseDetails?: string
    }

    if (data.responseStatus === 429 || (data.responseDetails && data.responseDetails.includes('DAILY LIMIT'))) {
      throw new AiTranslationError(
        'MyMemory daily rate limit exceeded. Consider adding an email in Settings or using LibreTranslate.',
        { status: 429, retryable: false, code: 'RATE_LIMIT' }
      )
    }

    if (data.responseStatus && data.responseStatus !== 200) {
      throw new AiTranslationError(
        `MyMemory error (${data.responseStatus}): ${data.responseDetails || 'Unknown error'}`,
        { status: data.responseStatus, retryable: false, code: `MYMEMORY_${data.responseStatus}` }
      )
    }

    const translated = data.responseData?.translatedText || ''
    validateTranslatedItem(request.key, request.sourceValue, translated)

    return {
      translatedText: translated,
      provider: 'mymemory',
      model: 'mymemory-public',
    }
  }

  throw new AiTranslationError(`Unsupported free provider: "${provider}"`, {
    code: 'UNSUPPORTED_PROVIDER',
    retryable: false,
  })
}

/**
 * Executes a batch translation using a Free Translation provider.
 * Uses native array requests for LibreTranslate and controlled sequential queue for MyMemory.
 */
export async function performBatchFreeTranslation(
  request: BatchFreeTranslationRequestPayload,
  settings: unknown
): Promise<BatchFreeTranslationResponsePayload> {
  const resolved = resolveFreeSettingsPayload(settings)
  const provider = resolved.provider || 'libretranslate'
  const config = resolved.providers?.[provider] || { baseUrl: 'http://localhost:5000' }
  const targetLanguage = normalizeLanguage(request.targetLanguage || request.targetFile)
  const sourceLanguage = normalizeLanguage(request.sourceLanguage || request.sourceFile)

  if (!request.entries || request.entries.length === 0) {
    return {
      translations: [],
      provider,
      model: 'free-v1',
    }
  }

  // 1. LibreTranslate Batch (supports array of strings in 'q')
  if (provider === 'libretranslate') {
    const baseUrl = (config.baseUrl?.trim() || 'http://localhost:5000').replace(/\/+$/, '')
    const endpoint = `${baseUrl}/translate`

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: request.entries.map((e) => e.text),
          source: sourceLanguage,
          target: targetLanguage,
          format: 'text',
          api_key: config.apiKey?.trim() || undefined,
        }),
      })
    } catch (err) {
      if (
        err instanceof TypeError &&
        (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED'))
      ) {
        throw new AiTranslationError(
          `Unable to connect to LibreTranslate at ${baseUrl}. Ensure your local or remote LibreTranslate instance is running.`,
          { status: 0, retryable: false, code: 'CONNECTION_REFUSED' }
        )
      }
      throw new AiTranslationError(
        `Network error connecting to LibreTranslate: ${err instanceof Error ? err.message : String(err)}`,
        { retryable: true, code: 'NETWORK_ERROR' }
      )
    }

    if (!response.ok) {
      const errText = await response.text()
      const retryAfterMs = parseRetryAfterHeader(
        response.headers?.get ? response.headers.get('retry-after') : undefined
      )
      const status = response.status
      const retryable = status === 429 || (status >= 500 && status <= 504) || status === 408

      throw new AiTranslationError(
        `LibreTranslate Error (${status}): ${errText || response.statusText}`,
        { status, retryable, retryAfterMs, code: `HTTP_${status}` }
      )
    }

    const data = (await response.json()) as { translatedText?: string | string[] }
    const translatedList: string[] = Array.isArray(data.translatedText)
      ? data.translatedText
      : typeof data.translatedText === 'string'
      ? [data.translatedText]
      : []

    if (translatedList.length !== request.entries.length) {
      throw new AiTranslationError(
        `LibreTranslate returned ${translatedList.length} translations for ${request.entries.length} requested keys.`,
        { code: 'BATCH_COUNT_MISMATCH', retryable: false }
      )
    }

    const translations: { key: string; translation: string }[] = []
    for (let i = 0; i < request.entries.length; i++) {
      const entry = request.entries[i]
      const translated = translatedList[i] || ''
      validateTranslatedItem(entry.key, entry.text, translated)
      translations.push({
        key: entry.key,
        translation: translated,
      })
    }

    return {
      translations,
      provider: 'libretranslate',
      model: 'libretranslate-standard',
    }
  }

  // 2. MyMemory Batch (controlled sequential requests with rate protection)
  if (provider === 'mymemory') {
    const translations: { key: string; translation: string }[] = []

    for (const entry of request.entries) {
      if (!entry.text) {
        translations.push({ key: entry.key, translation: '' })
        continue
      }

      const res = await performFreeTranslation(
        {
          key: entry.key,
          sourceFile: request.sourceFile,
          targetFile: request.targetFile,
          sourceLanguage,
          targetLanguage,
          sourceValue: entry.text,
        },
        settings
      )

      translations.push({
        key: entry.key,
        translation: res.translatedText,
      })

      // Gentle pause to respect public rate limits
      await new Promise((r) => setTimeout(r, 40))
    }

    return {
      translations,
      provider: 'mymemory',
      model: 'mymemory-public',
    }
  }

  throw new AiTranslationError(`Unsupported free provider: "${provider}"`, {
    code: 'UNSUPPORTED_PROVIDER',
    retryable: false,
  })
}
