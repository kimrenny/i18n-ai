import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  performFreeTranslation,
  performBatchFreeTranslation,
  normalizeLanguage,
  type FreeTranslationSettingsPayload,
} from './freeTranslationService'
import { AiTranslationError } from './aiService'

describe('freeTranslationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('normalizeLanguage', () => {
    it('normalizes locale tags and filenames correctly', () => {
      expect(normalizeLanguage('en-US')).toBe('en')
      expect(normalizeLanguage('ru.json')).toBe('ru')
      expect(normalizeLanguage('uk-UA')).toBe('uk')
      expect(normalizeLanguage('pt-BR')).toBe('pt')
      expect(normalizeLanguage('zh-CN')).toBe('zh')
    })
  })

  describe('LibreTranslate', () => {
    const libreSettings: FreeTranslationSettingsPayload = {
      provider: 'libretranslate',
      providers: {
        libretranslate: {
          baseUrl: 'http://localhost:5000',
        },
      },
    }

    it('translates single entry via LibreTranslate POST /translate', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          translatedText: 'Открыть',
        }),
      })
      globalThis.fetch = mockFetch

      const result = await performFreeTranslation(
        {
          key: 'MENU.OPEN',
          sourceFile: 'en.json',
          targetFile: 'ru.json',
          sourceValue: 'Open',
        },
        libreSettings
      )

      expect(result.translatedText).toBe('Открыть')
      expect(result.provider).toBe('libretranslate')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5000/translate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            q: 'Open',
            source: 'en',
            target: 'ru',
            format: 'text',
          }),
        })
      )
    })

    it('translates batch in a single array request for LibreTranslate', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          translatedText: ['Открыть', 'Сохранить {name}'],
        }),
      })
      globalThis.fetch = mockFetch

      const result = await performBatchFreeTranslation(
        {
          sourceFile: 'en.json',
          targetFile: 'ru.json',
          targetLanguage: 'ru',
          sourceLanguage: 'en',
          entries: [
            { key: 'MENU.OPEN', text: 'Open' },
            { key: 'MENU.SAVE', text: 'Save {name}' },
          ],
        },
        libreSettings
      )

      expect(result.translations).toHaveLength(2)
      expect(result.translations[0]).toEqual({
        key: 'MENU.OPEN',
        translation: 'Открыть',
      })
      expect(result.translations[1]).toEqual({
        key: 'MENU.SAVE',
        translation: 'Сохранить {name}',
      })
    })

    it('provides clear actionable error when LibreTranslate connection fails', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed ECONNREFUSED'))
      globalThis.fetch = mockFetch

      await expect(
        performFreeTranslation(
          {
            key: 'MENU.OPEN',
            sourceFile: 'en.json',
            targetFile: 'ru.json',
            sourceValue: 'Open',
          },
          libreSettings
        )
      ).rejects.toThrow(/Ensure your local or remote LibreTranslate instance is running/i)
    })

    it('fails validation when LibreTranslate corrupts placeholders', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          translatedText: 'Сохранить имя', // {name} corrupted
        }),
      })
      globalThis.fetch = mockFetch

      await expect(
        performFreeTranslation(
          {
            key: 'MENU.SAVE',
            sourceFile: 'en.json',
            targetFile: 'ru.json',
            sourceValue: 'Save {name}',
          },
          libreSettings
        )
      ).rejects.toThrow(/Placeholder "{name}"/i)
    })
  })

  describe('MyMemory', () => {
    const mymemorySettings: FreeTranslationSettingsPayload = {
      provider: 'mymemory',
      providers: {
        mymemory: {
          baseUrl: 'https://api.mymemory.translated.net',
          email: 'user@example.com',
        },
      },
    }

    it('translates single entry via MyMemory GET endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          responseData: { translatedText: 'Открыть' },
          responseStatus: 200,
        }),
      })
      globalThis.fetch = mockFetch

      const result = await performFreeTranslation(
        {
          key: 'MENU.OPEN',
          sourceFile: 'en.json',
          targetFile: 'ru.json',
          sourceValue: 'Open',
        },
        mymemorySettings
      )

      expect(result.translatedText).toBe('Открыть')
      expect(result.provider).toBe('mymemory')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.mymemory.translated.net/get?q=Open&langpair=en|ru&de=user%40example.com'),
        expect.anything()
      )
    })

    it('identifies MyMemory 429 rate limits', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          responseData: { translatedText: '' },
          responseStatus: 429,
          responseDetails: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE BANDWIDTH FOR TODAY. VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE',
        }),
      })
      globalThis.fetch = mockFetch

      try {
        await performFreeTranslation(
          {
            key: 'MENU.OPEN',
            sourceFile: 'en.json',
            targetFile: 'ru.json',
            sourceValue: 'Open',
          },
          mymemorySettings
        )
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(AiTranslationError)
        const aiErr = err as AiTranslationError
        expect(aiErr.status).toBe(429)
      }
    })
  })

  describe('Regression: Undefined provider handling in Free Translation', () => {
    it('safely defaults to LibreTranslate when provider is undefined or settings is empty', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          translatedText: 'Открыть',
        }),
      })
      globalThis.fetch = mockFetch

      const result = await performFreeTranslation(
        {
          key: 'MENU.OPEN',
          sourceFile: 'en.json',
          targetFile: 'ru.json',
          sourceValue: 'Open',
        },
        {} as unknown
      )

      expect(result.provider).toBe('libretranslate')
      expect(result.translatedText).toBe('Открыть')
    })
  })
})
