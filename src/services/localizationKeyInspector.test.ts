import { describe, it, expect } from 'vitest'
import {
  inspectTranslationKey,
  formatKeyValue,
  isValueEmpty,
} from './localizationKeyInspector'
import type { ParsedLocalizationFile } from '../types/localization'

describe('localizationKeyInspector Service', () => {
  const mockFiles: ParsedLocalizationFile[] = [
    {
      filename: 'en.json',
      path: '/path/to/en.json',
      raw: {
        ADMIN: {
          DASHBOARD: {
            TITLE: 'Dashboard',
            EMPTY_FIELD: '',
          },
        },
      },
      keys: {
        'ADMIN.DASHBOARD.TITLE': 'Dashboard',
        'ADMIN.DASHBOARD.EMPTY_FIELD': '',
      },
      keyCount: 2,
    },
    {
      filename: 'uk.json',
      path: '/path/to/uk.json',
      raw: {
        ADMIN: {
          DASHBOARD: {
            TITLE: 'Панель керування',
            EMPTY_FIELD: '',
          },
        },
      },
      keys: {
        'ADMIN.DASHBOARD.TITLE': 'Панель керування',
        'ADMIN.DASHBOARD.EMPTY_FIELD': '',
      },
      keyCount: 2,
    },
    {
      filename: 'de.json',
      path: '/path/to/de.json',
      raw: {
        ADMIN: {
          DASHBOARD: {
            TITLE: '',
          },
        },
      },
      keys: {
        'ADMIN.DASHBOARD.TITLE': '',
      },
      keyCount: 1,
    },
    {
      filename: 'fr.json',
      path: '/path/to/fr.json',
      raw: {},
      keys: {},
      keyCount: 0,
    },
  ]

  it('returns null for null, empty or whitespace keys or empty files', () => {
    expect(inspectTranslationKey(null, mockFiles)).toBeNull()
    expect(inspectTranslationKey('', mockFiles)).toBeNull()
    expect(inspectTranslationKey('   ', mockFiles)).toBeNull()
    expect(inspectTranslationKey('ADMIN.DASHBOARD.TITLE', [])).toBeNull()
  })

  it('accurately inspects a key with mixed statuses across files', () => {
    const res = inspectTranslationKey('ADMIN.DASHBOARD.TITLE', mockFiles)
    expect(res).not.toBeNull()
    if (!res) return

    expect(res.key).toBe('ADMIN.DASHBOARD.TITLE')
    expect(res.totalLanguages).toBe(4)
    expect(res.translatedCount).toBe(2) // en, uk
    expect(res.emptyCount).toBe(1) // de
    expect(res.missingCount).toBe(1) // fr
    expect(res.coveragePercentage).toBe(50) // 2 / 4 = 50%

    // Reference language check
    expect(res.referenceLanguage).not.toBeNull()
    expect(res.referenceLanguage?.languageCode).toBe('en')
    expect(res.referenceLanguage?.languageName).toBe('English')
    expect(res.referenceLanguage?.value).toBe('Dashboard')
    expect(res.referenceLanguage?.status).toBe('translated')

    // Per-language status verification
    const enLang = res.languages.find((l) => l.filename === 'en.json')
    expect(enLang?.status).toBe('translated')
    expect(enLang?.value).toBe('Dashboard')
    expect(enLang?.isReference).toBe(true)

    const ukLang = res.languages.find((l) => l.filename === 'uk.json')
    expect(ukLang?.status).toBe('translated')
    expect(ukLang?.value).toBe('Панель керування')
    expect(ukLang?.isReference).toBe(false)

    const deLang = res.languages.find((l) => l.filename === 'de.json')
    expect(deLang?.status).toBe('empty')
    expect(deLang?.value).toBe('')

    const frLang = res.languages.find((l) => l.filename === 'fr.json')
    expect(frLang?.status).toBe('missing')
    expect(frLang?.value).toBeNull()
  })

  it('identifies an empty key in reference file', () => {
    const res = inspectTranslationKey('ADMIN.DASHBOARD.EMPTY_FIELD', mockFiles)
    expect(res).not.toBeNull()
    if (!res) return

    expect(res.referenceLanguage?.status).toBe('empty')
    expect(res.referenceLanguage?.value).toBe('')
  })

  it('identifies when key is completely missing in reference file', () => {
    const customFiles: ParsedLocalizationFile[] = [
      mockFiles[0], // en.json
      {
        filename: 'uk.json',
        path: '/path/to/uk.json',
        raw: { EXTRA_KEY: 'Тільки в УК' },
        keys: { EXTRA_KEY: 'Тільки в УК' },
        keyCount: 1,
      },
    ]

    const res = inspectTranslationKey('EXTRA_KEY', customFiles)
    expect(res).not.toBeNull()
    if (!res) return

    expect(res.referenceLanguage?.status).toBe('missing')
    expect(res.referenceLanguage?.value).toBeNull()

    const ukLang = res.languages.find((l) => l.filename === 'uk.json')
    expect(ukLang?.status).toBe('translated')
    expect(ukLang?.value).toBe('Тільки в УК')
  })

  it('formats JsonValues properly via formatKeyValue', () => {
    expect(formatKeyValue(undefined)).toBeNull()
    expect(formatKeyValue('Hello')).toBe('Hello')
    expect(formatKeyValue('')).toBe('')
    expect(formatKeyValue(null)).toBe('')
    expect(formatKeyValue(42)).toBe('42')
    expect(formatKeyValue(true)).toBe('true')
    expect(formatKeyValue(['a', 'b'])).toBe('["a","b"]')
    expect(formatKeyValue({ foo: 'bar' })).toBe('{...}')
  })

  it('evaluates isValueEmpty correctly', () => {
    expect(isValueEmpty('')).toBe(true)
    expect(isValueEmpty(null)).toBe(true)
    expect(isValueEmpty(undefined)).toBe(true)
    expect(isValueEmpty('Text')).toBe(false)
    expect(isValueEmpty(0)).toBe(false)
    expect(isValueEmpty(false)).toBe(false)
  })
})
