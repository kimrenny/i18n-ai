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

export function getRetryAfterMs(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>
    if (typeof e.retryAfterMs === 'number' && e.retryAfterMs > 0) {
      return e.retryAfterMs
    }
  }
  return undefined
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
 * Dispatches a single AI translation request using either the secure Electron IPC bridge
 * or an in-memory/mock provider if running in tests/browser.
 */
export async function executeAiTranslation(
  request: AiTranslationRequest,
  settings: AiTranslationSettings
): Promise<AiTranslationResult> {
  const providerId = settings.provider || 'mock'
  const providerConfig = settings.providers[providerId] || {
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
 * Dispatches a multi-entry batch AI translation request using the secure Electron IPC bridge
 * or an in-memory/mock provider.
 */
export async function executeBatchAiTranslation(
  request: BatchAiTranslationRequest,
  settings: AiTranslationSettings
): Promise<BatchAiTranslationResult> {
  const providerId = settings.provider || 'mock'
  const providerConfig = settings.providers[providerId] || {
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
