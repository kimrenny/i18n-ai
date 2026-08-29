import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  performAiTranslation,
  type AiTranslationRequestPayload,
  type AiTranslationSettingsPayload,
} from './aiService'

describe('electron main aiService', () => {
  const baseRequest: AiTranslationRequestPayload = {
    key: 'AUTH.LOGIN',
    sourceFile: 'en.json',
    targetFile: 'de.json',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    sourceValue: 'Log in with {provider}',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles mock provider deterministically without network calls', async () => {
    const settings: AiTranslationSettingsPayload = {
      provider: 'mock',
      requireEditConfirmation: true,
      providers: {
        mock: { model: 'mock-v1' },
      },
    }

    const result = await performAiTranslation(baseRequest, settings)
    expect(result.translatedText).toBe('[AI: DE] Log in with {provider}')
    expect(result.provider).toBe('mock')
    expect(result.model).toBe('mock-v1')
  })

  it('handles empty source value gracefully', async () => {
    const settings: AiTranslationSettingsPayload = {
      provider: 'openai',
      requireEditConfirmation: true,
      providers: {
        openai: { model: 'gpt-4o-mini', apiKey: 'sk-test' },
      },
    }

    const result = await performAiTranslation(
      { ...baseRequest, sourceValue: '' },
      settings
    )
    expect(result.translatedText).toBe('')
  })

  it('throws error when API key is missing for OpenAI', async () => {
    const settings: AiTranslationSettingsPayload = {
      provider: 'openai',
      requireEditConfirmation: true,
      providers: {
        openai: { model: 'gpt-4o-mini', apiKey: '' },
      },
    }

    await expect(performAiTranslation(baseRequest, settings)).rejects.toThrow(
      /API key is required for OPENAI/i
    )
  })

  it('performs OpenAI chat completion with system and user prompts and strips wrapping quotes', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '"Mit {provider} anmelden"',
            },
          },
        ],
      }),
    })
    globalThis.fetch = mockFetch

    const settings: AiTranslationSettingsPayload = {
      provider: 'openai',
      requireEditConfirmation: true,
      providers: {
        openai: { model: 'gpt-4o-mini', apiKey: 'sk-test-123' },
      },
    }

    const result = await performAiTranslation(baseRequest, settings)
    expect(result.translatedText).toBe('Mit {provider} anmelden')
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-4o-mini')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-123',
        }),
      })
    )
  })

  describe('Google Gemini provider', () => {
    it('performs Google Gemini request with gemini-3.6-flash', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Mit {provider} anmelden' }],
              },
            },
          ],
        }),
      })
      globalThis.fetch = mockFetch

      const settings: AiTranslationSettingsPayload = {
        provider: 'gemini',
        requireEditConfirmation: true,
        providers: {
          gemini: { model: 'gemini-3.6-flash', apiKey: 'gemini-key' },
        },
      }

      const result = await performAiTranslation(baseRequest, settings)
      expect(result.translatedText).toBe('Mit {provider} anmelden')
      expect(result.provider).toBe('gemini')
      expect(result.model).toBe('gemini-3.6-flash')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('models/gemini-3.6-flash:generateContent'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('automatically migrates deprecated gemini-2.0-flash to gemini-3.6-flash', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Mit {provider} anmelden' }],
              },
            },
          ],
        }),
      })
      globalThis.fetch = mockFetch

      const settings: AiTranslationSettingsPayload = {
        provider: 'gemini',
        requireEditConfirmation: true,
        providers: {
          gemini: { model: 'gemini-2.0-flash', apiKey: 'gemini-key' },
        },
      }

      const result = await performAiTranslation(baseRequest, settings)
      expect(result.translatedText).toBe('Mit {provider} anmelden')
      expect(result.model).toBe('gemini-3.6-flash')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('models/gemini-3.6-flash:generateContent'),
        expect.anything()
      )
    })

    it('produces user-friendly error when Gemini API returns 404 for obsolete model', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Model models/old-model is no longer available.',
      })
      globalThis.fetch = mockFetch

      const settings: AiTranslationSettingsPayload = {
        provider: 'gemini',
        requireEditConfirmation: true,
        providers: {
          gemini: { model: 'custom-unsupported-model', apiKey: 'gemini-key' },
        },
      }

      await expect(performAiTranslation(baseRequest, settings)).rejects.toThrow(
        /The selected Gemini model \("custom-unsupported-model"\) is no longer available/i
      )
    })

    it('produces clear error for invalid Gemini API key (400 / 401)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'API_KEY_INVALID: The provided API key is invalid.',
      })
      globalThis.fetch = mockFetch

      const settings: AiTranslationSettingsPayload = {
        provider: 'gemini',
        requireEditConfirmation: true,
        providers: {
          gemini: { model: 'gemini-3.6-flash', apiKey: 'bad-key' },
        },
      }

      await expect(performAiTranslation(baseRequest, settings)).rejects.toThrow(
        /Invalid Google Gemini API key/i
      )
    })
  })

  it('performs Anthropic Claude messages request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: 'Mit {provider} anmelden' }],
      }),
    })
    globalThis.fetch = mockFetch

    const settings: AiTranslationSettingsPayload = {
      provider: 'anthropic',
      requireEditConfirmation: true,
      providers: {
        anthropic: {
          model: 'claude-3-5-sonnet-20241022',
          apiKey: 'claude-key',
        },
      },
    }

    const result = await performAiTranslation(baseRequest, settings)
    expect(result.translatedText).toBe('Mit {provider} anmelden')
    expect(result.provider).toBe('anthropic')
    expect(result.model).toBe('claude-3-5-sonnet-20241022')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'claude-key',
        }),
      })
    )
  })

  it('performs Ollama request and handles connection failure gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed ECONNREFUSED'))
    globalThis.fetch = mockFetch

    const settings: AiTranslationSettingsPayload = {
      provider: 'ollama',
      requireEditConfirmation: true,
      providers: {
        ollama: { model: 'llama3.1', baseUrl: 'http://localhost:11434' },
      },
    }

    await expect(performAiTranslation(baseRequest, settings)).rejects.toThrow(
      /Ensure the Ollama server is running/i
    )
  })
})
