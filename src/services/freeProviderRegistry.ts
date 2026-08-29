import type { FreeProviderId } from '../types/settings'

export interface FreeProviderDefinition {
  id: FreeProviderId
  name: string
  description: string
  requiresApiKey: boolean
  supportsBatch: boolean
  defaultBaseUrl: string
  isLocal: boolean
  documentationUrl?: string
}

export const FREE_PROVIDERS: readonly FreeProviderDefinition[] = [
  {
    id: 'libretranslate',
    name: 'LibreTranslate',
    description:
      'Free, open-source machine translation engine. Connects to self-hosted instances (e.g. http://localhost:5000) or public LibreTranslate-compatible servers.',
    requiresApiKey: false,
    supportsBatch: true,
    defaultBaseUrl: 'http://localhost:5000',
    isLocal: true,
    documentationUrl: 'https://github.com/LibreTranslate/LibreTranslate',
  },
  {
    id: 'mymemory',
    name: 'MyMemory',
    description:
      'Public collaborative translation memory API. Free tier supports up to 5,000 chars/day (10,000 chars/day with email).',
    requiresApiKey: false,
    supportsBatch: false,
    defaultBaseUrl: 'https://api.mymemory.translated.net',
    isLocal: false,
    documentationUrl: 'https://mymemory.translated.net/doc/spec.php',
  },
] as const

export function getFreeProviderDefinition(id: FreeProviderId): FreeProviderDefinition {
  const found = FREE_PROVIDERS.find((p) => p.id === id)
  if (!found) {
    return FREE_PROVIDERS[0]
  }
  return found
}
