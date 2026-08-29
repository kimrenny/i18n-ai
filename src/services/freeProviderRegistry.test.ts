import { describe, it, expect } from 'vitest'
import {
  FREE_PROVIDERS,
  getFreeProviderDefinition,
} from './freeProviderRegistry'

describe('freeProviderRegistry', () => {
  it('registers LibreTranslate and MyMemory with expected metadata', () => {
    const libre = getFreeProviderDefinition('libretranslate')
    expect(libre.name).toBe('LibreTranslate')
    expect(libre.requiresApiKey).toBe(false)
    expect(libre.supportsBatch).toBe(true)
    expect(libre.defaultBaseUrl).toBe('http://localhost:5000')

    const mymemory = getFreeProviderDefinition('mymemory')
    expect(mymemory.name).toBe('MyMemory')
    expect(mymemory.requiresApiKey).toBe(false)
    expect(mymemory.supportsBatch).toBe(false)
    expect(mymemory.defaultBaseUrl).toBe('https://api.mymemory.translated.net')
  })

  it('falls back to LibreTranslate on unknown provider id', () => {
    const fallback = getFreeProviderDefinition('unknown' as unknown as import('../types/settings').FreeProviderId)
    expect(fallback.id).toBe('libretranslate')
  })

  it('exposes all free providers in FREE_PROVIDERS array', () => {
    expect(FREE_PROVIDERS.length).toBeGreaterThanOrEqual(2)
    expect(FREE_PROVIDERS.map((p) => p.id)).toContain('libretranslate')
    expect(FREE_PROVIDERS.map((p) => p.id)).toContain('mymemory')
  })
})
