import type { TranslationEngine } from '../types/settings'

/**
 * Returns the primary action button label for a single-key translation
 * based on the active translation engine and optional localization function.
 *
 * Examples:
 * - AI Mode: "✨ Translate with AI"
 * - Free Mode: "✨ Translate with Free"
 */
export function getTranslateActionLabel(
  engine: TranslationEngine = 'ai',
  t?: (key: string) => string
): string {
  if (engine === 'free') {
    return t ? t('translation.translateWithFree') : '✨ Translate with Free'
  }
  return t ? t('translation.translateWithAi') : '✨ Translate with AI'
}

/**
 * Returns the short button label for inline/compact translation triggers.
 *
 * Examples:
 * - AI Mode: "✨ AI Translate"
 * - Free Mode: "✨ Free Translate"
 */
export function getTranslateShortLabel(
  engine: TranslationEngine = 'ai',
  t?: (key: string) => string
): string {
  if (engine === 'free') {
    return t ? t('translation.freeTranslateShort') : '✨ Free Translate'
  }
  return t ? t('translation.aiTranslateShort') : '✨ AI Translate'
}

/**
 * Returns the title attribute/tooltip for single-key translation actions.
 */
export function getTranslateTitle(
  engine: TranslationEngine = 'ai',
  t?: (key: string) => string
): string {
  if (engine === 'free') {
    return t ? t('translation.translateWithFreeTitle') : 'Translate with Free'
  }
  return t ? t('translation.translateWithAiTitle') : 'Translate with AI'
}
