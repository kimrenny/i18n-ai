import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DEPRECATED_GEMINI_MODELS,
  migrateGeminiModel,
  DEFAULT_AI_TRANSLATION_SETTINGS,
} from '../../types/settings'
import { getProviderDefinition } from '../aiProviderRegistry'
import {
  performAiTranslation,
  type AiTranslationRequestPayload,
} from '../../../electron/main/aiService'

describe('Google Gemini Translation Provider & Settings Migration', () => {
  const sampleRequest: AiTranslationRequestPayload = {
    key: 'SETTINGS.THEME',
    sourceFile: 'en.json',
    targetFile: 'es.json',
    sourceLanguage: 'en',
    targetLanguage: 'es',
    sourceValue: 'Dark Mode',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('provides gemini-3.6-flash as default model in registry and settings', () => {
    const geminiDef = getProviderDefinition('gemini')
    expect(geminiDef.defaultModel).toBe('gemini-3.6-flash')
    expect(DEFAULT_AI_TRANSLATION_SETTINGS.providers.gemini.model).toBe(
      'gemini-3.6-flash'
    )
  })

  it('correctly migrates deprecated gemini-2.0-flash to gemini-3.6-flash', () => {
    expect(DEPRECATED_GEMINI_MODELS.has('gemini-2.0-flash')).toBe(true)
    expect(migrateGeminiModel('gemini-2.0-flash')).toBe('gemini-3.6-flash')
    expect(migrateGeminiModel('gemini-1.5-pro')).toBe('gemini-3.6-flash')
    expect(migrateGeminiModel('gemini-3.6-pro')).toBe('gemini-3.6-pro')
    expect(migrateGeminiModel('custom-supported-model')).toBe(
      'custom-supported-model'
    )
  })

  it('performs Gemini translation request using gemini-3.6-flash', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Modo oscuro' }],
            },
          },
        ],
      }),
    })
    globalThis.fetch = mockFetch

    const result = await performAiTranslation(sampleRequest, {
      provider: 'gemini',
      requireEditConfirmation: true,
      providers: {
        gemini: {
          model: 'gemini-3.6-flash',
          apiKey: 'test-gemini-key',
        },
      },
    })

    expect(result.translatedText).toBe('Modo oscuro')
    expect(result.provider).toBe('gemini')
    expect(result.model).toBe('gemini-3.6-flash')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('models/gemini-3.6-flash:generateContent'),
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('handles obsolete model 404 response with clear, actionable message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Model models/retired-model is not found.',
    })
    globalThis.fetch = mockFetch

    await expect(
      performAiTranslation(sampleRequest, {
        provider: 'gemini',
        requireEditConfirmation: true,
        providers: {
          gemini: {
            model: 'retired-model',
            apiKey: 'test-gemini-key',
          },
        },
      })
    ).rejects.toThrow(
      /The selected Gemini model \("retired-model"\) is no longer available/i
    )
  })

  it('validates API key requirement for Gemini', async () => {
    await expect(
      performAiTranslation(sampleRequest, {
        provider: 'gemini',
        requireEditConfirmation: true,
        providers: {
          gemini: {
            model: 'gemini-3.6-flash',
            apiKey: '',
          },
        },
      })
    ).rejects.toThrow(/API key is required for Google Gemini/i)
  })
})
