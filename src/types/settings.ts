export type AiProviderId =
  | 'mock'
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'mistral'
  | 'xai'
  | 'deepseek'
  | 'ollama'

export interface AiProviderConfig {
  model: string
  apiKey?: string
  baseUrl?: string
}

export interface AiTranslationSettings {
  provider: AiProviderId
  requireEditConfirmation: boolean
  providers: Record<AiProviderId, AiProviderConfig>
}

export interface AppSettings {
  aiTranslation: AiTranslationSettings
}

export const DEPRECATED_GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-2.0-pro-exp-02-05',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
  'gemini-1.0-pro',
  'gemini-pro',
])

export function migrateGeminiModel(model?: string): string {
  if (!model || DEPRECATED_GEMINI_MODELS.has(model.toLowerCase().trim())) {
    return 'gemini-3.6-flash'
  }
  return model.trim()
}

export const DEFAULT_AI_TRANSLATION_SETTINGS: AiTranslationSettings = {
  provider: 'mock',
  requireEditConfirmation: true,
  providers: {
    mock: {
      model: 'mock-v1',
    },
    openai: {
      model: 'gpt-4o-mini',
      apiKey: '',
    },
    gemini: {
      model: 'gemini-3.6-flash',
      apiKey: '',
    },
    anthropic: {
      model: 'claude-3-5-sonnet-20241022',
      apiKey: '',
    },
    mistral: {
      model: 'mistral-large-latest',
      apiKey: '',
    },
    xai: {
      model: 'grok-2-latest',
      apiKey: '',
    },
    deepseek: {
      model: 'deepseek-chat',
      apiKey: '',
    },
    ollama: {
      model: 'llama3.1',
      baseUrl: 'http://localhost:11434',
    },
  },
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  aiTranslation: DEFAULT_AI_TRANSLATION_SETTINGS,
}
