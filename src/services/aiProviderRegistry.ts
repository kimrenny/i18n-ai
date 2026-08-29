import type { AiProviderId } from '../types/settings'

export interface AiProviderDefinition {
  id: AiProviderId
  name: string
  description: string
  requiresApiKey: boolean
  supportsLocalModels: boolean
  defaultModel: string
  popularModels: string[]
  defaultBaseUrl?: string
}

export const AI_PROVIDERS: readonly AiProviderDefinition[] = [
  {
    id: 'mock',
    name: 'Mock / Offline',
    description: 'Deterministic offline provider for development and testing without network or API keys.',
    requiresApiKey: false,
    supportsLocalModels: false,
    defaultModel: 'mock-v1',
    popularModels: ['mock-v1'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI GPT models (GPT-4o, GPT-4o-mini, o3-mini).',
    requiresApiKey: true,
    supportsLocalModels: false,
    defaultModel: 'gpt-4o-mini',
    popularModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini', 'gpt-4-turbo'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google DeepMind Gemini models (Gemini 3.6 Flash, Gemini 3.6 Pro, Gemini 2.5 Flash).',
    requiresApiKey: true,
    supportsLocalModels: false,
    defaultModel: 'gemini-3.6-flash',
    popularModels: [
      'gemini-3.6-flash',
      'gemini-3.6-pro',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Anthropic Claude models (Claude 3.5 Sonnet, Claude 3.5 Haiku).',
    requiresApiKey: true,
    supportsLocalModels: false,
    defaultModel: 'claude-3-5-sonnet-20241022',
    popularModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral AI multilingual models (Mistral Large, Mistral Small, Codestral).',
    requiresApiKey: true,
    supportsLocalModels: false,
    defaultModel: 'mistral-large-latest',
    popularModels: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    description: 'xAI Grok models (Grok 2).',
    requiresApiKey: true,
    supportsLocalModels: false,
    defaultModel: 'grok-2-latest',
    popularModels: ['grok-2-latest', 'grok-2-vision-latest'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek LLM models (DeepSeek-V3, DeepSeek-R1).',
    requiresApiKey: true,
    supportsLocalModels: false,
    defaultModel: 'deepseek-chat',
    popularModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Self-hosted local models running via Ollama on your machine.',
    requiresApiKey: false,
    supportsLocalModels: true,
    defaultModel: 'llama3.1',
    popularModels: ['llama3.1', 'qwen2.5', 'gemma3', 'mistral', 'phi3'],
    defaultBaseUrl: 'http://localhost:11434',
  },
] as const

export function getProviderDefinition(id: AiProviderId): AiProviderDefinition {
  const found = AI_PROVIDERS.find((p) => p.id === id)
  if (!found) {
    return AI_PROVIDERS[0] // fallback to Mock
  }
  return found
}
