import { describe, it, expect } from 'vitest'
import {
  AI_PROVIDERS,
  getProviderDefinition,
} from './aiProviderRegistry'

describe('aiProviderRegistry', () => {
  it('contains definitions for all required providers', () => {
    const ids = AI_PROVIDERS.map((p) => p.id)
    expect(ids).toContain('mock')
    expect(ids).toContain('openai')
    expect(ids).toContain('gemini')
    expect(ids).toContain('anthropic')
    expect(ids).toContain('mistral')
    expect(ids).toContain('xai')
    expect(ids).toContain('deepseek')
    expect(ids).toContain('ollama')
  })

  it('correctly configures API key requirements and updated models', () => {
    const mockDef = getProviderDefinition('mock')
    expect(mockDef.requiresApiKey).toBe(false)

    const ollamaDef = getProviderDefinition('ollama')
    expect(ollamaDef.requiresApiKey).toBe(false)
    expect(ollamaDef.supportsLocalModels).toBe(true)
    expect(ollamaDef.defaultBaseUrl).toBe('http://localhost:11434')

    const openaiDef = getProviderDefinition('openai')
    expect(openaiDef.requiresApiKey).toBe(true)
    expect(openaiDef.defaultModel).toBe('gpt-4o-mini')

    const geminiDef = getProviderDefinition('gemini')
    expect(geminiDef.requiresApiKey).toBe(true)
    expect(geminiDef.defaultModel).toBe('gemini-3.6-flash')
    expect(geminiDef.popularModels).toContain('gemini-3.6-flash')
    expect(geminiDef.popularModels).toContain('gemini-3.6-pro')
    expect(geminiDef.popularModels).not.toContain('gemini-2.0-flash')

    const claudeDef = getProviderDefinition('anthropic')
    expect(claudeDef.requiresApiKey).toBe(true)
    expect(claudeDef.defaultModel).toBe('claude-3-5-sonnet-20241022')
  })

  it('falls back to mock provider on unknown provider ID', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fallback = getProviderDefinition('unknown-provider' as any)
    expect(fallback.id).toBe('mock')
  })
})
