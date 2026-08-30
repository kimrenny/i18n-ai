export type TranslationEngine = 'ai' | 'free'

export type AppLanguage =
  | 'en'
  | 'uk'
  | 'ru'
  | 'de'
  | 'fr'
  | 'es'
  | 'pt'
  | 'it'
  | 'pl'
  | 'cs'
  | 'tr'
  | 'zh-CN'
  | 'ja'
  | 'ko'

export const SUPPORTED_LANGUAGES: readonly {
  code: AppLanguage
  nativeName: string
  englishName: string
}[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish' },
  { code: 'cs', nativeName: 'Čeština', englishName: 'Czech' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Chinese (Simplified)' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean' },
] as const

export function isAppLanguage(val: unknown): val is AppLanguage {
  return (
    typeof val === 'string' &&
    SUPPORTED_LANGUAGES.some((lang) => lang.code === val)
  )
}

export type AiProviderId =
  | 'mock'
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'mistral'
  | 'xai'
  | 'deepseek'
  | 'ollama'

export type FreeProviderId = 'libretranslate' | 'mymemory'

export const VALID_AI_PROVIDERS: readonly AiProviderId[] = [
  'mock',
  'openai',
  'gemini',
  'anthropic',
  'mistral',
  'xai',
  'deepseek',
  'ollama',
] as const

export const VALID_FREE_PROVIDERS: readonly FreeProviderId[] = [
  'libretranslate',
  'mymemory',
] as const

export function isAiProviderId(val: unknown): val is AiProviderId {
  return typeof val === 'string' && VALID_AI_PROVIDERS.includes(val as AiProviderId)
}

export function isFreeProviderId(val: unknown): val is FreeProviderId {
  return typeof val === 'string' && VALID_FREE_PROVIDERS.includes(val as FreeProviderId)
}

export interface AiProviderConfig {
  model: string
  apiKey?: string
  baseUrl?: string
}

export interface FreeProviderConfig {
  baseUrl?: string
  apiKey?: string
  email?: string
}

export interface AiTranslationSettings {
  provider: AiProviderId
  requireEditConfirmation: boolean
  providers: Record<AiProviderId, AiProviderConfig>
}

export interface FreeTranslationSettings {
  provider: FreeProviderId
  providers: Record<FreeProviderId, FreeProviderConfig>
}

export interface AppSettings {
  language?: AppLanguage
  engine?: TranslationEngine
  aiTranslation: AiTranslationSettings
  freeTranslation?: FreeTranslationSettings
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

export const DEFAULT_FREE_TRANSLATION_SETTINGS: FreeTranslationSettings = {
  provider: 'libretranslate',
  providers: {
    libretranslate: {
      baseUrl: 'http://localhost:5000',
      apiKey: '',
    },
    mymemory: {
      baseUrl: 'https://api.mymemory.translated.net',
      email: '',
      apiKey: '',
    },
  },
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'en',
  engine: 'ai',
  aiTranslation: DEFAULT_AI_TRANSLATION_SETTINGS,
  freeTranslation: DEFAULT_FREE_TRANSLATION_SETTINGS,
}

/**
 * Migrates loaded, partial, or legacy settings objects, ensuring all required engine
 * and provider configurations exist with safe defaults and zero undefined references.
 */
export function migrateAppSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_APP_SETTINGS }
  }

  const data = raw as Record<string, unknown>

  // 1. Determine Language (safe fallback to English)
  const language: AppLanguage = isAppLanguage(data.language)
    ? data.language
    : DEFAULT_APP_SETTINGS.language || 'en'

  // 2. Determine Engine
  const engine: TranslationEngine = data.engine === 'free' ? 'free' : 'ai'

  // 3. Extract AI Translation Settings (support nested data.aiTranslation OR top-level legacy properties)
  const nestedAi = (
    data.aiTranslation && typeof data.aiTranslation === 'object' ? data.aiTranslation : {}
  ) as Record<string, unknown>

  const topLevelIsAi =
    isAiProviderId(data.provider) || Boolean(data.providers && typeof data.providers === 'object')

  const rawAiProvider = nestedAi.provider || (topLevelIsAi ? data.provider : undefined)
  const aiProvider: AiProviderId = isAiProviderId(rawAiProvider)
    ? rawAiProvider
    : DEFAULT_AI_TRANSLATION_SETTINGS.provider

  const rawRequireConfirmation =
    typeof nestedAi.requireEditConfirmation === 'boolean'
      ? nestedAi.requireEditConfirmation
      : typeof data.requireEditConfirmation === 'boolean'
      ? data.requireEditConfirmation
      : DEFAULT_AI_TRANSLATION_SETTINGS.requireEditConfirmation

  const rawAiProviders = {
    ...((data.providers && typeof data.providers === 'object' && topLevelIsAi
      ? (data.providers as Record<string, unknown>)
      : {})),
    ...((nestedAi.providers && typeof nestedAi.providers === 'object'
      ? (nestedAi.providers as Record<string, unknown>)
      : {})),
  }

  const aiProviders: Record<AiProviderId, AiProviderConfig> = {
    ...DEFAULT_AI_TRANSLATION_SETTINGS.providers,
  }

  for (const id of VALID_AI_PROVIDERS) {
    const rawConf = rawAiProviders[id] as Partial<AiProviderConfig> | undefined
    if (rawConf && typeof rawConf === 'object') {
      aiProviders[id] = {
        ...DEFAULT_AI_TRANSLATION_SETTINGS.providers[id],
        ...rawConf,
        model: rawConf.model?.trim() ? rawConf.model.trim() : DEFAULT_AI_TRANSLATION_SETTINGS.providers[id].model,
        apiKey: typeof rawConf.apiKey === 'string' ? rawConf.apiKey : DEFAULT_AI_TRANSLATION_SETTINGS.providers[id].apiKey,
        baseUrl: typeof rawConf.baseUrl === 'string' ? rawConf.baseUrl : DEFAULT_AI_TRANSLATION_SETTINGS.providers[id].baseUrl,
      }
    }
  }

  // Ensure Gemini model migration
  if (aiProviders.gemini) {
    aiProviders.gemini = {
      ...aiProviders.gemini,
      model: migrateGeminiModel(aiProviders.gemini.model),
    }
  }

  // 4. Extract Free Translation Settings (support nested data.freeTranslation OR top-level legacy free keys)
  const nestedFree = (
    data.freeTranslation && typeof data.freeTranslation === 'object' ? data.freeTranslation : {}
  ) as Record<string, unknown>

  const topLevelIsFree = isFreeProviderId(data.provider)
  const rawFreeProvider = nestedFree.provider || (topLevelIsFree ? data.provider : undefined)
  const freeProvider: FreeProviderId = isFreeProviderId(rawFreeProvider)
    ? rawFreeProvider
    : DEFAULT_FREE_TRANSLATION_SETTINGS.provider

  const rawFreeProviders = {
    ...((data.providers && typeof data.providers === 'object' && topLevelIsFree
      ? (data.providers as Record<string, unknown>)
      : {})),
    ...((nestedFree.providers && typeof nestedFree.providers === 'object'
      ? (nestedFree.providers as Record<string, unknown>)
      : {})),
  }

  const freeProviders: Record<FreeProviderId, FreeProviderConfig> = {
    ...DEFAULT_FREE_TRANSLATION_SETTINGS.providers,
  }

  for (const id of VALID_FREE_PROVIDERS) {
    const rawConf = rawFreeProviders[id] as Partial<FreeProviderConfig> | undefined
    if (rawConf && typeof rawConf === 'object') {
      freeProviders[id] = {
        ...DEFAULT_FREE_TRANSLATION_SETTINGS.providers[id],
        ...rawConf,
        baseUrl: typeof rawConf.baseUrl === 'string' ? rawConf.baseUrl : DEFAULT_FREE_TRANSLATION_SETTINGS.providers[id].baseUrl,
        apiKey: typeof rawConf.apiKey === 'string' ? rawConf.apiKey : DEFAULT_FREE_TRANSLATION_SETTINGS.providers[id].apiKey,
        email: typeof rawConf.email === 'string' ? rawConf.email : DEFAULT_FREE_TRANSLATION_SETTINGS.providers[id].email,
      }
    }
  }

  return {
    language,
    engine,
    aiTranslation: {
      provider: aiProvider,
      requireEditConfirmation: rawRequireConfirmation,
      providers: aiProviders,
    },
    freeTranslation: {
      provider: freeProvider,
      providers: freeProviders,
    },
  }
}
