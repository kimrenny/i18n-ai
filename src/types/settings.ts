export interface AiTranslationSettings {
  requireEditConfirmation: boolean
}

export interface AppSettings {
  aiTranslation: AiTranslationSettings
}

export const DEFAULT_AI_TRANSLATION_SETTINGS: AiTranslationSettings = {
  requireEditConfirmation: true,
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  aiTranslation: DEFAULT_AI_TRANSLATION_SETTINGS,
}
