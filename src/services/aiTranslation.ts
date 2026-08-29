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

export interface AiTranslationProvider {
  readonly id: AiProviderId
  readonly name: string
  translate(
    request: AiTranslationRequest,
    config?: AiProviderConfig
  ): Promise<AiTranslationResult>
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

  constructor(
    customTranslateFn?: (
      request: AiTranslationRequest,
      config?: AiProviderConfig
    ) => Promise<AiTranslationResult>
  ) {
    this.customTranslateFn = customTranslateFn
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
  comparedFiles: { filename: string; keys: Record<string, import('../types/localization').JsonValue> }[]
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
 * Dispatches an AI translation request using either the secure Electron IPC bridge
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
    throw new Error(
      `API key is missing for ${def.name}. Please enter your API key in Settings.`
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
