import { describe, it, expect } from 'vitest'
import { shouldConfirmAiEdit } from './aiEditPolicy'
import {
  DEFAULT_AI_TRANSLATION_SETTINGS,
  DEFAULT_APP_SETTINGS,
} from '../types/settings'

describe('aiEditPolicy service', () => {
  it('returns true for default settings (safe default)', () => {
    expect(shouldConfirmAiEdit(DEFAULT_AI_TRANSLATION_SETTINGS)).toBe(true)
    expect(shouldConfirmAiEdit(DEFAULT_APP_SETTINGS)).toBe(true)
  })

  it('returns true when undefined or null is provided', () => {
    expect(shouldConfirmAiEdit(undefined)).toBe(true)
    expect(shouldConfirmAiEdit(null)).toBe(true)
  })

  it('returns false only when requireEditConfirmation is explicitly false', () => {
    expect(shouldConfirmAiEdit({ requireEditConfirmation: false })).toBe(false)
    expect(
      shouldConfirmAiEdit({
        aiTranslation: { requireEditConfirmation: false },
      })
    ).toBe(false)
  })

  it('returns true when requireEditConfirmation is explicitly true', () => {
    expect(shouldConfirmAiEdit({ requireEditConfirmation: true })).toBe(true)
    expect(
      shouldConfirmAiEdit({
        aiTranslation: { requireEditConfirmation: true },
      })
    ).toBe(true)
  })

  it('falls back to true if settings object has corrupted or missing property', () => {
    expect(
      shouldConfirmAiEdit({} as import('../types/settings').AiTranslationSettings)
    ).toBe(true)
    expect(
      shouldConfirmAiEdit({
        aiTranslation: {} as import('../types/settings').AiTranslationSettings,
      })
    ).toBe(true)
  })
})
