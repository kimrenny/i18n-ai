import { describe, it, expect } from 'vitest'
import { normalizeLanguageCode } from './languageNormalizer'

describe('languageNormalizer', () => {
  it('normalizes filenames to base language codes', () => {
    expect(normalizeLanguageCode('en.json')).toBe('en')
    expect(normalizeLanguageCode('ru.json')).toBe('ru')
    expect(normalizeLanguageCode('de.json')).toBe('de')
  })

  it('normalizes common dialect tags according to ISO standards', () => {
    expect(normalizeLanguageCode('en-US')).toBe('en')
    expect(normalizeLanguageCode('en-GB')).toBe('en')
    expect(normalizeLanguageCode('uk-UA')).toBe('uk')
    expect(normalizeLanguageCode('pt-BR')).toBe('pt')
    expect(normalizeLanguageCode('pt_BR')).toBe('pt')
    expect(normalizeLanguageCode('zh-CN')).toBe('zh')
    expect(normalizeLanguageCode('zh-Hans')).toBe('zh')
    expect(normalizeLanguageCode('fr-CA')).toBe('fr')
  })

  it('handles empty or undefined inputs gracefully with fallback', () => {
    expect(normalizeLanguageCode('')).toBe('en')
    expect(normalizeLanguageCode(undefined)).toBe('en')
  })

  it('preserves valid 2-letter language codes', () => {
    expect(normalizeLanguageCode('pl')).toBe('pl')
    expect(normalizeLanguageCode('ja')).toBe('ja')
    expect(normalizeLanguageCode('ko')).toBe('ko')
    expect(normalizeLanguageCode('es')).toBe('es')
  })
})
