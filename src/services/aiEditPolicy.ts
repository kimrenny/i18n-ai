import type { AiTranslationSettings, AppSettings } from '../types/settings'

/**
 * Determines whether an AI-proposed translation edit requires explicit user review/confirmation.
 *
 * Safety policy:
 * - Returns true by default (safe default) if settings are absent, null, or undefined.
 * - Returns true when requireEditConfirmation === true.
 * - Returns false only when requireEditConfirmation is explicitly set to false.
 */
export function shouldConfirmAiEdit(
  settings?: AiTranslationSettings | AppSettings | null
): boolean {
  if (!settings) {
    return true
  }

  if ('aiTranslation' in settings && settings.aiTranslation) {
    return typeof settings.aiTranslation.requireEditConfirmation === 'boolean'
      ? settings.aiTranslation.requireEditConfirmation
      : true
  }

  if ('requireEditConfirmation' in settings) {
    return typeof settings.requireEditConfirmation === 'boolean'
      ? settings.requireEditConfirmation
      : true
  }

  return true
}
