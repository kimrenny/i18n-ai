import { describe, it, expect } from 'vitest'
import {
  getTranslateActionLabel,
  getTranslateShortLabel,
  getTranslateTitle,
} from './translationLabels'
import { translate } from '../i18n'

describe('translationLabels', () => {
  it('returns AI labels by default and when engine is ai', () => {
    expect(getTranslateActionLabel('ai')).toBe('✨ Translate with AI')
    expect(getTranslateActionLabel(undefined)).toBe('✨ Translate with AI')
    expect(getTranslateShortLabel('ai')).toBe('✨ AI Translate')
    expect(getTranslateTitle('ai')).toBe('Translate with AI')
  })

  it('returns Free labels when engine is free', () => {
    expect(getTranslateActionLabel('free')).toBe('✨ Translate with Free')
    expect(getTranslateShortLabel('free')).toBe('✨ Free Translate')
    expect(getTranslateTitle('free')).toBe('Translate with Free')
  })

  it('integrates with i18n translation functions across languages', () => {
    const tUk = (key: string) => translate('uk', key)
    expect(getTranslateActionLabel('ai', tUk)).toBe('✨ Перекласти за допомогою AI')
    expect(getTranslateActionLabel('free', tUk)).toBe('✨ Перекласти безкоштовно')
    expect(getTranslateShortLabel('free', tUk)).toBe('✨ Безкоштовний переклад')

    const tJa = (key: string) => translate('ja', key)
    expect(getTranslateActionLabel('ai', tJa)).toBe('✨ AI で翻訳')
    expect(getTranslateActionLabel('free', tJa)).toBe('✨ 無料翻訳')
  })
})
