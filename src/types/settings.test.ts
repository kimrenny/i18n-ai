import { describe, it, expect } from 'vitest'
import {
  migrateAppSettings,
  DEFAULT_APP_SETTINGS,
  isAiProviderId,
  isFreeProviderId,
} from './settings'

describe('settings migration & validation', () => {
  it('returns default settings when raw input is null, undefined, or empty', () => {
    expect(migrateAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS)
    expect(migrateAppSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS)
    expect(migrateAppSettings({})).toEqual(DEFAULT_APP_SETTINGS)
    expect(migrateAppSettings('invalid-string')).toEqual(DEFAULT_APP_SETTINGS)
  })

  it('migrates legacy flat AI settings and preserves API keys and model configuration', () => {
    const legacySettings = {
      provider: 'openai',
      requireEditConfirmation: false,
      providers: {
        openai: {
          model: 'gpt-4o',
          apiKey: 'sk-test-secret-key',
        },
      },
    }

    const migrated = migrateAppSettings(legacySettings)
    expect(migrated.engine).toBe('ai')
    expect(migrated.aiTranslation.provider).toBe('openai')
    expect(migrated.aiTranslation.requireEditConfirmation).toBe(false)
    expect(migrated.aiTranslation.providers.openai.model).toBe('gpt-4o')
    expect(migrated.aiTranslation.providers.openai.apiKey).toBe('sk-test-secret-key')
    expect(migrated.freeTranslation).toBeDefined()
    expect(migrated.freeTranslation?.provider).toBe('libretranslate')
  })

  it('migrates legacy flat Free settings and preserves URLs and keys', () => {
    const legacyFreeSettings = {
      provider: 'libretranslate',
      requireEditConfirmation: true,
      baseUrl: 'http://custom-libre.local:5000',
    }

    const migrated = migrateAppSettings(legacyFreeSettings)
    expect(migrated.freeTranslation?.provider).toBe('libretranslate')
    expect(migrated.aiTranslation.provider).toBe('mock')
  })

  it('automatically upgrades deprecated Gemini models in settings', () => {
    const oldGeminiSettings = {
      aiTranslation: {
        provider: 'gemini',
        providers: {
          gemini: {
            model: 'gemini-2.0-flash',
            apiKey: 'gemini-secret-api-key',
          },
        },
      },
    }

    const migrated = migrateAppSettings(oldGeminiSettings)
    expect(migrated.aiTranslation.provider).toBe('gemini')
    expect(migrated.aiTranslation.providers.gemini.model).toBe('gemini-3.6-flash')
    expect(migrated.aiTranslation.providers.gemini.apiKey).toBe('gemini-secret-api-key')
  })

  it('safely handles missing provider or invalid provider names by falling back to mock', () => {
    const invalidSettings = {
      engine: 'ai',
      aiTranslation: {
        provider: 'non_existent_provider_xyz',
      },
    }

    const migrated = migrateAppSettings(invalidSettings)
    expect(migrated.aiTranslation.provider).toBe('mock')
    expect(migrated.aiTranslation.providers.mock.model).toBe('mock-v1')
  })

  it('safely handles missing free provider by falling back to libretranslate', () => {
    const invalidFree = {
      engine: 'free',
      freeTranslation: {
        provider: 'non_existent_free_xyz',
      },
    }

    const migrated = migrateAppSettings(invalidFree)
    expect(migrated.freeTranslation?.provider).toBe('libretranslate')
    expect(migrated.freeTranslation?.providers.libretranslate.baseUrl).toBe('http://localhost:5000')
  })

  it('validates provider IDs correctly with isAiProviderId and isFreeProviderId', () => {
    expect(isAiProviderId('openai')).toBe(true)
    expect(isAiProviderId('gemini')).toBe(true)
    expect(isAiProviderId('mock')).toBe(true)
    expect(isAiProviderId('libretranslate')).toBe(false)
    expect(isAiProviderId(undefined)).toBe(false)

    expect(isFreeProviderId('libretranslate')).toBe(true)
    expect(isFreeProviderId('mymemory')).toBe(true)
    expect(isFreeProviderId('openai')).toBe(false)
  })
})
