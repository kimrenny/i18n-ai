import { describe, it, expect, beforeEach } from 'vitest'
import {
  MockAiTranslationProvider,
  getAiTranslationProvider,
  setAiTranslationProvider,
  findSourceReference,
  resolveLanguageFromFilename,
  executeAiTranslation,
  type AiTranslationRequest,
} from './aiTranslation'
import { DEFAULT_AI_TRANSLATION_SETTINGS } from '../types/settings'

describe('aiTranslation service', () => {
  beforeEach(() => {
    setAiTranslationProvider(new MockAiTranslationProvider())
  })

  it('translates text using MockAiTranslationProvider deterministically', async () => {
    const provider = getAiTranslationProvider()
    const request: AiTranslationRequest = {
      key: 'MENU.PLAY',
      sourceFile: 'en.json',
      targetFile: 'ru.json',
      sourceValue: 'Play',
    }

    const response = await provider.translate(request)
    expect(response.translatedText).toBe('[AI: RU] Play')
    expect(response.provider).toBe('mock')
    expect(response.model).toBe('mock-v1')
  })

  it('allows plugging in a custom AI translation provider', async () => {
    const customProvider = new MockAiTranslationProvider(async (req) => ({
      translatedText: `Custom translated: ${req.sourceValue}`,
      provider: 'mock',
      model: 'custom-model',
    }))

    setAiTranslationProvider(customProvider)

    const response = await getAiTranslationProvider().translate({
      key: 'AUTH.LOGOUT',
      sourceFile: 'en.json',
      targetFile: 'es.json',
      sourceValue: 'Logout',
    })

    expect(response.translatedText).toBe('Custom translated: Logout')
    expect(response.model).toBe('custom-model')
  })

  it('validates API key requirement for cloud providers in executeAiTranslation', async () => {
    const request: AiTranslationRequest = {
      key: 'MENU.PLAY',
      sourceFile: 'en.json',
      targetFile: 'ru.json',
      sourceValue: 'Play',
    }

    const settingsWithNoKey = {
      ...DEFAULT_AI_TRANSLATION_SETTINGS,
      provider: 'openai' as const,
      providers: {
        ...DEFAULT_AI_TRANSLATION_SETTINGS.providers,
        openai: { model: 'gpt-4o-mini', apiKey: '' },
      },
    }

    await expect(
      executeAiTranslation(request, settingsWithNoKey)
    ).rejects.toThrow(/API key is missing for OpenAI/i)
  })

  it('resolves language code from filename', () => {
    expect(resolveLanguageFromFilename('en.json')).toBe('en')
    expect(resolveLanguageFromFilename('ru.JSON')).toBe('ru')
    expect(resolveLanguageFromFilename('zh-CN.json')).toBe('zh-CN')
  })

  describe('findSourceReference', () => {
    it('prefers en.json when non-empty value is available', () => {
      const compared = [
        { filename: 'ru.json', keys: { 'MENU.PLAY': '' } },
        { filename: 'de.json', keys: { 'MENU.PLAY': 'Spielen' } },
        { filename: 'en.json', keys: { 'MENU.PLAY': 'Play' } },
      ]

      const ref = findSourceReference('MENU.PLAY', 'ru.json', compared)
      expect(ref).toEqual({
        sourceFile: 'en.json',
        sourceLanguage: 'en',
        sourceValue: 'Play',
      })
    })

    it('falls back to another non-empty file when en.json is not available', () => {
      const compared = [
        { filename: 'ru.json', keys: { 'MENU.PLAY': '' } },
        { filename: 'de.json', keys: { 'MENU.PLAY': 'Spielen' } },
      ]

      const ref = findSourceReference('MENU.PLAY', 'ru.json', compared)
      expect(ref).toEqual({
        sourceFile: 'de.json',
        sourceLanguage: 'de',
        sourceValue: 'Spielen',
      })
    })

    it('returns null when no non-empty source is found', () => {
      const compared = [
        { filename: 'ru.json', keys: { 'MENU.PLAY': '' } },
        { filename: 'es.json', keys: { 'MENU.PLAY': '' } },
      ]

      const ref = findSourceReference('MENU.PLAY', 'ru.json', compared)
      expect(ref).toBeNull()
    })
  })
})
