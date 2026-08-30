import { describe, it, expect } from 'vitest'
import { LOCALES } from './translator'
import { SUPPORTED_LANGUAGES, type AppLanguage } from '../types/settings'

function getAllKeyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const paths: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      paths.push(...getAllKeyPaths(value as Record<string, unknown>, fullPath))
    } else {
      paths.push(fullPath)
    }
  }
  return paths.sort()
}

function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

describe('Locale Completeness and Consistency across all 14 languages', () => {
  const enLocale = LOCALES.en
  const enKeyPaths = getAllKeyPaths(enLocale)

  it('verifies English locale has a non-empty list of translation keys', () => {
    expect(enKeyPaths.length).toBeGreaterThan(50)
  })

  it.each(SUPPORTED_LANGUAGES)('ensures $code has 100% identical keys and non-empty values as en.json', ({ code, englishName }) => {
    const targetLocale = LOCALES[code as AppLanguage]
    expect(targetLocale, `Locale ${code} (${englishName}) should be defined`).toBeDefined()

    const targetKeyPaths = getAllKeyPaths(targetLocale)

    // Check for missing keys
    const missingKeys = enKeyPaths.filter((path) => !targetKeyPaths.includes(path))
    expect(
      missingKeys,
      `Locale ${code} (${englishName}) is missing the following translation keys: ${missingKeys.join(', ')}`
    ).toEqual([])

    // Check for extra/unexpected keys
    const extraKeys = targetKeyPaths.filter((path) => !enKeyPaths.includes(path))
    expect(
      extraKeys,
      `Locale ${code} (${englishName}) contains unexpected extra keys: ${extraKeys.join(', ')}`
    ).toEqual([])

    // Check that no string value is empty or undefined
    for (const keyPath of enKeyPaths) {
      const val = getValueAtPath(targetLocale, keyPath)
      expect(
        typeof val,
        `Locale ${code} translation for key "${keyPath}" must be a string`
      ).toBe('string')
      expect(
        (val as string).trim().length,
        `Locale ${code} translation for key "${keyPath}" must not be empty`
      ).toBeGreaterThan(0)
    }
  })
})
