import type { AppLanguage } from '../types/settings'

export type LocaleTranslations = Record<string, Record<string, string>>

export interface I18nContextValue {
  language: AppLanguage
  t: (key: string, params?: Record<string, string | number>) => string
}
