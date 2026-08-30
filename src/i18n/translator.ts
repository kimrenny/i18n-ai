import type { AppLanguage } from '../types/settings'

import en from './locales/en.json'
import uk from './locales/uk.json'
import ru from './locales/ru.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import pt from './locales/pt.json'
import it from './locales/it.json'
import pl from './locales/pl.json'
import cs from './locales/cs.json'
import tr from './locales/tr.json'
import zhCN from './locales/zh-CN.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'

export const LOCALES: Record<AppLanguage, Record<string, unknown>> = {
  en,
  uk,
  ru,
  de,
  fr,
  es,
  pt,
  it,
  pl,
  cs,
  tr,
  'zh-CN': zhCN,
  ja,
  ko,
}

function getNestedValue(obj: unknown, parts: string[]): string | undefined {
  let curr: unknown = obj
  for (const part of parts) {
    if (!curr || typeof curr !== 'object') return undefined
    curr = (curr as Record<string, unknown>)[part]
  }
  return typeof curr === 'string' ? curr : undefined
}

/**
 * Resolves a nested translation key (e.g. 'summary.missingKeys', 'providers.openai.description')
 * for a given language, with fallback to English and safe string interpolation.
 */
export function translate(
  lang: AppLanguage,
  keyPath: string,
  params?: Record<string, string | number>
): string {
  const parts = keyPath.split('.')
  const targetDict = LOCALES[lang] || LOCALES.en
  const fallbackDict = LOCALES.en

  const rawValue = getNestedValue(targetDict, parts) ?? getNestedValue(fallbackDict, parts)

  if (typeof rawValue !== 'string') {
    return keyPath
  }

  if (!params) {
    return rawValue
  }

  let interpolated = rawValue
  for (const [pKey, pVal] of Object.entries(params)) {
    const regex = new RegExp(`\\{${pKey}\\}`, 'g')
    interpolated = interpolated.replace(regex, String(pVal))
  }

  return interpolated
}
