import { describe, it, expect } from 'vitest'
import { translate, LOCALES } from './translator'
import { SUPPORTED_LANGUAGES, type AppLanguage } from '../types/settings'

describe('i18n system', () => {
  it('registers all 14 supported languages with valid dictionaries', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(14)
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LOCALES[lang.code]).toBeDefined()
      expect(typeof LOCALES[lang.code]).toBe('object')
      expect(LOCALES[lang.code].app).toBeDefined()
      expect(LOCALES[lang.code].summary).toBeDefined()
      expect(LOCALES[lang.code].translation).toBeDefined()
      expect(LOCALES[lang.code].settings).toBeDefined()
    }
  })

  it('translates strings in English correctly', () => {
    expect(translate('en', 'app.title')).toBe('Localization AI')
    expect(translate('en', 'translation.translateWithAi')).toBe('✨ Translate with AI')
    expect(translate('en', 'translation.translateWithFree')).toBe('✨ Translate with Free')
  })

  it('translates strings across multiple languages (Ukrainian, Japanese, German, Spanish)', () => {
    expect(translate('uk', 'translation.translateWithAi')).toBe('✨ Перекласти за допомогою AI')
    expect(translate('uk', 'translation.translateWithFree')).toBe('✨ Перекласти безкоштовно')

    expect(translate('ja', 'translation.translateWithAi')).toBe('✨ AI で翻訳')
    expect(translate('ja', 'translation.translateWithFree')).toBe('✨ 無料翻訳')

    expect(translate('de', 'translation.translateWithAi')).toBe('✨ Mit KI übersetzen')
    expect(translate('es', 'translation.translateWithAi')).toBe('✨ Traducir con IA')
  })

  it('interpolates parameters safely', () => {
    const interpolated = translate('en', 'summary.problemCount', { count: 5 })
    expect(interpolated).toBe('5 problem(s) detected across files')

    const progress = translate('en', 'translation.progressTranslated', { current: 10, total: 50 })
    expect(progress).toBe('Translated 10 / 50')
  })

  it('falls back to English when a key is missing in another language', () => {
    // If a subkey is missing in a fictional or partial language dictionary, fallback to English
    const fallback = translate('cs' as AppLanguage, 'app.title')
    expect(fallback).toBe('Localization AI')
  })

  it('falls back safely to key string if completely missing in all languages without throwing', () => {
    expect(translate('en', 'nonexistent.section.key')).toBe('nonexistent.section.key')
    expect(translate('uk', 'invalid_key')).toBe('invalid_key')
  })
})
