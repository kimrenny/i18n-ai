import type { AiProviderId, AiProviderConfig, AiTranslationSettings } from '../types/settings'
import { getProviderDefinition } from './aiProviderRegistry'

export interface AiTranslationRequest {
  key: string
  sourceFile: string
  targetFile: string
  sourceLanguage?: string
  targetLanguage?: string
  sourceValue: string
  targetValue?: string
  context?: string
}

export interface AiTranslationResult {
  translatedText: string
  provider: AiProviderId
  model: string
  detectedLanguage?: string
}

export interface BatchTranslationEntry {
  key: string
  text: string
  context?: string
}

export interface BatchAiTranslationRequest {
  targetLanguage: string
  sourceLanguage?: string
  targetFile: string
  sourceFile: string
  entries: BatchTranslationEntry[]
}

export interface BatchAiTranslationResult {
  translations: { key: string; translation: string }[]
  provider: AiProviderId
  model: string
}

export class AiTranslationError extends Error {
  readonly status?: number
  readonly code?: string
  readonly retryable: boolean
  readonly retryAfterMs?: number

  constructor(
    message: string,
    options?: {
      status?: number
      code?: string
      retryable?: boolean
      retryAfterMs?: number
    }
  ) {
    super(message)
    this.name = 'AiTranslationError'
    this.status = options?.status
    this.code = options?.code
    this.retryable = options?.retryable ?? false
    this.retryAfterMs = options?.retryAfterMs
    Object.setPrototypeOf(this, AiTranslationError.prototype)
  }
}

export function is429RateLimitError(error: unknown): boolean {
  if (error instanceof AiTranslationError) {
    return error.status === 429 || error.code === 'RATE_LIMIT'
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>
    if (e.status === 429 || e.code === 'RATE_LIMIT') {
      return true
    }
    if (typeof e.message === 'string') {
      const msg = e.message.toLowerCase()
      // Only match 429 or explicit rate limit keywords
      if (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('resource_exhausted')
      ) {
        return true
      }
    }
  }
  return false
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AiTranslationError) {
    return error.retryable
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>
    if (typeof e.retryable === 'boolean') {
      return e.retryable
    }
    if (
      e.status === 429 ||
      e.status === 408 ||
      (typeof e.status === 'number' && e.status >= 500 && e.status <= 504)
    ) {
      return true
    }
    if (typeof e.message === 'string') {
      const msg = e.message.toLowerCase()
      if (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('network error') ||
        msg.includes('fetch failed') ||
        msg.includes('timeout')
      ) {
        return true
      }
    }
  }
  return false
}

export function parseRetryAfterHeader(header?: string | null): number | undefined {
  if (!header) return undefined
  const trimmed = header.trim()
  if (!trimmed) return undefined
  const seconds = Number(trimmed)
  if (!isNaN(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000)
  }
  const dateParsed = Date.parse(trimmed)
  if (!isNaN(dateParsed)) {
    const diff = dateParsed - Date.now()
    return diff > 0 ? diff : 0
  }
  return undefined
}

export function getRetryAfterMs(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>
    if (typeof e.retryAfterMs === 'number' && !isNaN(e.retryAfterMs) && e.retryAfterMs >= 0) {
      return e.retryAfterMs
    }
    if (typeof e.retryAfter === 'string') {
      const parsed = parseRetryAfterHeader(e.retryAfter)
      if (parsed !== undefined) return parsed
    }
  }
  return undefined
}

export function calculate429BackoffDelay(
  attempt: number,
  retryAfterMs?: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 15000,
  enableJitter: boolean = false
): number {
  if (typeof retryAfterMs === 'number' && !isNaN(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, maxDelayMs)
  }
  const exponent = Math.max(0, attempt - 1)
  const delay = baseDelayMs * Math.pow(2, exponent)
  const jitter = enableJitter ? Math.floor(Math.random() * 200) : 0
  return Math.min(delay + jitter, maxDelayMs)
}

export interface SingleTranslationProgressInfo {
  status: 'idle' | 'translating' | 'retrying' | 'success' | 'error'
  attempt: number // 0 for initial translation, 1..3 for retrying
  maxRetries: number // 3
  delayRemainingMs?: number
  message?: string
  error?: unknown
  key: string
  targetFile: string
}

export interface ExecuteAiTranslationOptions {
  maxRetries?: number // defaults to 3
  baseDelayMs?: number // defaults to 1000
  maxDelayMs?: number // defaults to 15000
  enableJitter?: boolean
  countdownIntervalMs?: number // defaults to 1000ms
  onProgress?: (progress: SingleTranslationProgressInfo) => void
  signal?: AbortSignal
}

export interface AiTranslationProvider {
  readonly id: AiProviderId
  readonly name: string
  translate(
    request: AiTranslationRequest,
    config?: AiProviderConfig
  ): Promise<AiTranslationResult>
  translateBatch?(
    request: BatchAiTranslationRequest,
    config?: AiProviderConfig
  ): Promise<BatchAiTranslationResult>
}

/**
 * Deterministic Mock AI Translation Provider for local development, testing, and offline usage.
 */
export class MockAiTranslationProvider implements AiTranslationProvider {
  readonly id: AiProviderId = 'mock'
  readonly name: string = 'Mock / Offline'

  private customTranslateFn?: (
    request: AiTranslationRequest,
    config?: AiProviderConfig
  ) => Promise<AiTranslationResult>

  private customTranslateBatchFn?: (
    request: BatchAiTranslationRequest,
    config?: AiProviderConfig
  ) => Promise<BatchAiTranslationResult>

  constructor(
    customTranslateFn?: (
      request: AiTranslationRequest,
      config?: AiProviderConfig
    ) => Promise<AiTranslationResult>,
    customTranslateBatchFn?: (
      request: BatchAiTranslationRequest,
      config?: AiProviderConfig
    ) => Promise<BatchAiTranslationResult>
  ) {
    this.customTranslateFn = customTranslateFn
    this.customTranslateBatchFn = customTranslateBatchFn
  }

  async translate(
    request: AiTranslationRequest,
    config?: AiProviderConfig
  ): Promise<AiTranslationResult> {
    if (this.customTranslateFn) {
      return this.customTranslateFn(request, config)
    }

    if (!request.sourceValue && request.sourceValue !== '') {
      throw new Error('No source text provided for translation.')
    }

    const langTarget = (
      request.targetLanguage || request.targetFile.replace(/\.json$/i, '')
    ).toUpperCase()

    const translatedText = request.sourceValue
      ? `[AI: ${langTarget}] ${request.sourceValue}`
      : ''

    return {
      translatedText,
      provider: 'mock',
      model: config?.model || 'mock-v1',
      detectedLanguage:
        request.sourceLanguage || request.sourceFile.replace(/\.json$/i, ''),
    }
  }

  async translateBatch(
    request: BatchAiTranslationRequest,
    config?: AiProviderConfig
  ): Promise<BatchAiTranslationResult> {
    if (this.customTranslateBatchFn) {
      return this.customTranslateBatchFn(request, config)
    }

    const langTarget = request.targetLanguage.toUpperCase()
    const translations = request.entries.map((e) => ({
      key: e.key,
      translation: e.text ? `[AI: ${langTarget}] ${e.text}` : '',
    }))

    return {
      translations,
      provider: 'mock',
      model: config?.model || 'mock-v1',
    }
  }
}

let activeProvider: AiTranslationProvider = new MockAiTranslationProvider()

export function getAiTranslationProvider(): AiTranslationProvider {
  return activeProvider
}

export function setAiTranslationProvider(provider: AiTranslationProvider): void {
  activeProvider = provider
}

/**
 * Resolves target language code or name from a filename (e.g. "ru.json" -> "ru").
 */
export function resolveLanguageFromFilename(filename: string): string {
  return filename.replace(/\.json$/i, '')
}

/**
 * Finds the most suitable source translation entry from compared files.
 * Prefers 'en.json' if available and non-empty, otherwise picks first non-empty file value.
 */
export function findSourceReference(
  key: string,
  targetFilename: string,
  comparedFiles: readonly { filename: string; keys: Record<string, import('../types/localization').JsonValue> }[]
): { sourceFile: string; sourceLanguage: string; sourceValue: string } | null {
  const otherFiles = comparedFiles.filter((f) => f.filename !== targetFilename)
  if (otherFiles.length === 0) {
    return null
  }

  // 1. Try en.json first
  const enFile = otherFiles.find((f) => f.filename.toLowerCase().includes('en'))
  if (enFile && typeof enFile.keys[key] === 'string' && enFile.keys[key] !== '') {
    return {
      sourceFile: enFile.filename,
      sourceLanguage: resolveLanguageFromFilename(enFile.filename),
      sourceValue: enFile.keys[key] as string,
    }
  }

  // 2. Try any other file with non-empty string value
  for (const file of otherFiles) {
    const val = file.keys[key]
    if (typeof val === 'string' && val !== '') {
      return {
        sourceFile: file.filename,
        sourceLanguage: resolveLanguageFromFilename(file.filename),
        sourceValue: val,
      }
    }
  }

  return null
}

/**
 * Dispatches a single translation request using either the secure Electron IPC bridge
 * or an in-memory/mock provider if running in tests/browser.
 */
export async function executeAiTranslation(
  request: AiTranslationRequest,
  settings: AiTranslationSettings | import('../types/settings').AppSettings
): Promise<AiTranslationResult> {
  const isFreeEngine = 'engine' in settings && settings.engine === 'free'

  if (isFreeEngine) {
    const freeSettings = (settings as import('../types/settings').AppSettings).freeTranslation || {
      provider: 'libretranslate',
      providers: {
        libretranslate: { baseUrl: 'http://localhost:5000' },
        mymemory: { baseUrl: 'https://api.mymemory.translated.net' },
      },
    }

    if (window.electronAPI?.translateWithAi) {
      const result = await window.electronAPI.translateWithAi(request, settings)
      if (result && typeof result.translatedText === 'string') {
        return result
      }
    }

    // Fallback to in-memory provider
    return await activeProvider.translate(request, { model: freeSettings.provider })
  }

  const aiSettings = 'aiTranslation' in settings ? settings.aiTranslation : settings
  const providerId = aiSettings.provider || 'mock'
  const providerConfig = aiSettings.providers[providerId] || {
    model: getProviderDefinition(providerId).defaultModel,
  }

  const def = getProviderDefinition(providerId)
  if (def.requiresApiKey && !providerConfig.apiKey?.trim()) {
    throw new AiTranslationError(
      `API key is missing for ${def.name}. Please enter your API key in Settings.`,
      { code: 'MISSING_API_KEY', retryable: false }
    )
  }

  // If running in Electron and electronAPI.translateWithAi is available
  if (window.electronAPI?.translateWithAi) {
    const result = await window.electronAPI.translateWithAi(request, settings)
    if (result && typeof result.translatedText === 'string') {
      return result
    }
  }

  // Fallback to active provider in memory (for tests and offline previews)
  return await activeProvider.translate(request, providerConfig)
}

/**
 * Dispatches a multi-entry batch translation request using the secure Electron IPC bridge
 * or an in-memory/mock provider.
 */
export async function executeBatchAiTranslation(
  request: BatchAiTranslationRequest,
  settings: AiTranslationSettings | import('../types/settings').AppSettings
): Promise<BatchAiTranslationResult> {
  const isFreeEngine = 'engine' in settings && settings.engine === 'free'

  if (isFreeEngine) {
    const freeSettings = (settings as import('../types/settings').AppSettings).freeTranslation || {
      provider: 'libretranslate',
      providers: {
        libretranslate: { baseUrl: 'http://localhost:5000' },
        mymemory: { baseUrl: 'https://api.mymemory.translated.net' },
      },
    }

    if (window.electronAPI?.translateBatchWithAi) {
      const result = await window.electronAPI.translateBatchWithAi(request, settings)
      if (result && Array.isArray(result.translations)) {
        return result
      }
    }

    // Fallback to in-memory provider batch
    if (activeProvider.translateBatch) {
      return await activeProvider.translateBatch(request, { model: freeSettings.provider })
    }

    const translations: { key: string; translation: string }[] = []
    for (const entry of request.entries) {
      const singleRes = await activeProvider.translate(
        {
          key: entry.key,
          sourceFile: request.sourceFile,
          targetFile: request.targetFile,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          sourceValue: entry.text,
        },
        { model: freeSettings.provider }
      )
      translations.push({ key: entry.key, translation: singleRes.translatedText })
    }

    return {
      translations,
      provider: freeSettings.provider as unknown as AiProviderId,
      model: freeSettings.provider,
    }
  }

  const aiSettings = 'aiTranslation' in settings ? settings.aiTranslation : settings
  const providerId = aiSettings.provider || 'mock'
  const providerConfig = aiSettings.providers[providerId] || {
    model: getProviderDefinition(providerId).defaultModel,
  }

  const def = getProviderDefinition(providerId)
  if (def.requiresApiKey && !providerConfig.apiKey?.trim()) {
    throw new AiTranslationError(
      `API key is missing for ${def.name}. Please enter your API key in Settings.`,
      { code: 'MISSING_API_KEY', retryable: false }
    )
  }

  // If running in Electron and electronAPI.translateBatchWithAi is available
  if (window.electronAPI?.translateBatchWithAi) {
    const result = await window.electronAPI.translateBatchWithAi(request, settings)
    if (result && Array.isArray(result.translations)) {
      return result
    }
  }

  // In-memory provider batch execution
  if (activeProvider.translateBatch) {
    return await activeProvider.translateBatch(request, providerConfig)
  }

  // Fallback: translate each item
  const translations: { key: string; translation: string }[] = []
  for (const entry of request.entries) {
    const singleRes = await activeProvider.translate(
      {
        key: entry.key,
        sourceFile: request.sourceFile,
        targetFile: request.targetFile,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        sourceValue: entry.text,
      },
      providerConfig
    )
    translations.push({ key: entry.key, translation: singleRes.translatedText })
  }

  return {
    translations,
    provider: providerId,
    model: providerConfig.model || 'default',
  }
}

/**
 * Dispatches a single AI translation request with automatic bounded retries ONLY for HTTP 429 Too Many Requests.
 *
 * Retries up to maxRetries (default 3) attempts with exponential backoff / Retry-After prioritization
 * and non-busy countdown notifications.
 */
export async function executeAiTranslationWithRetry(
  request: AiTranslationRequest,
  settings: AiTranslationSettings | import('../types/settings').AppSettings,
  options?: ExecuteAiTranslationOptions
): Promise<AiTranslationResult> {
  const maxRetries = options?.maxRetries ?? 3
  const baseDelayMs = options?.baseDelayMs ?? 1000
  const maxDelayMs = options?.maxDelayMs ?? 15000
  const enableJitter = options?.enableJitter ?? false
  const countdownIntervalMs = options?.countdownIntervalMs ?? 1000
  const signal = options?.signal

  if (signal?.aborted) {
    const abortErr = new Error('Translation cancelled by user.')
    options?.onProgress?.({
      status: 'error',
      attempt: 0,
      maxRetries,
      key: request.key,
      targetFile: request.targetFile,
      error: abortErr,
    })
    throw abortErr
  }

  let attempt = 0 // 0 = initial attempt, 1 = retry 1, 2 = retry 2, 3 = retry 3
  while (true) {
    if (signal?.aborted) {
      const abortErr = new Error('Translation cancelled by user.')
      options?.onProgress?.({
        status: 'error',
        attempt,
        maxRetries,
        key: request.key,
        targetFile: request.targetFile,
        error: abortErr,
      })
      throw abortErr
    }

    options?.onProgress?.({
      status: 'translating',
      attempt,
      maxRetries,
      key: request.key,
      targetFile: request.targetFile,
    })

    try {
      const result = await executeAiTranslation(request, settings)
      if (signal?.aborted) {
        throw new Error('Translation cancelled by user.')
      }
      options?.onProgress?.({
        status: 'success',
        attempt,
        maxRetries,
        key: request.key,
        targetFile: request.targetFile,
      })
      return result
    } catch (err) {
      if (signal?.aborted) {
        const abortErr = new Error('Translation cancelled by user.')
        options?.onProgress?.({
          status: 'error',
          attempt,
          maxRetries,
          key: request.key,
          targetFile: request.targetFile,
          error: abortErr,
        })
        throw abortErr
      }

      const is429 = is429RateLimitError(err)
      if (!is429 || attempt >= maxRetries) {
        options?.onProgress?.({
          status: 'error',
          attempt,
          maxRetries,
          key: request.key,
          targetFile: request.targetFile,
          error: err,
        })
        throw err
      }

      attempt++
      const retryAfterMs = getRetryAfterMs(err)
      const delayMs = calculate429BackoffDelay(attempt, retryAfterMs, baseDelayMs, maxDelayMs, enableJitter)

      if (delayMs > 0) {
        let remainingMs = delayMs
        options?.onProgress?.({
          status: 'retrying',
          attempt,
          maxRetries,
          delayRemainingMs: remainingMs,
          key: request.key,
          targetFile: request.targetFile,
        })

        const startTime = Date.now()
        while (remainingMs > 0) {
          if (signal?.aborted) {
            const abortErr = new Error('Translation cancelled by user.')
            options?.onProgress?.({
              status: 'error',
              attempt,
              maxRetries,
              key: request.key,
              targetFile: request.targetFile,
              error: abortErr,
            })
            throw abortErr
          }

          const sleepChunk = Math.min(countdownIntervalMs, remainingMs)
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => {
              clearTimeout(timer)
              signal?.removeEventListener('abort', onAbort)
              reject(new Error('Translation cancelled by user.'))
            }
            if (signal?.aborted) {
              return reject(new Error('Translation cancelled by user.'))
            }
            signal?.addEventListener('abort', onAbort)
            const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
              signal?.removeEventListener('abort', onAbort)
              resolve()
            }, sleepChunk)
          })

          const elapsed = Date.now() - startTime
          remainingMs = Math.max(0, delayMs - elapsed)

          if (remainingMs > 0) {
            options?.onProgress?.({
              status: 'retrying',
              attempt,
              maxRetries,
              delayRemainingMs: remainingMs,
              key: request.key,
              targetFile: request.targetFile,
            })
          }
        }
      }
    }
  }
}

