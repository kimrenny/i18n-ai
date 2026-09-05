import { describe, it, expect } from 'vitest'
import {
  searchWorkspaceLocalization,
  splitMatchRanges,
} from './localizationSearch'
import type { ParsedLocalizationFile } from '../types/localization'

describe('localizationSearch service', () => {
  const mockFiles: ParsedLocalizationFile[] = [
    {
      filename: 'en.json',
      path: 'C:/Projects/locales/en.json',
      raw: {},
      keys: {
        'app.title': 'Admin Dashboard',
        'app.description': 'Manage workspace users and permissions',
        'actions.save': 'Save',
        'actions.cancel': 'Cancel',
        'actions.delete': 'Delete user',
        'empty.field': '',
      },
      keyCount: 6,
    },
    {
      filename: 'de.json',
      path: 'C:/Projects/locales/de.json',
      raw: {},
      keys: {
        'app.title': 'Admin-Übersicht',
        'app.description': 'Verwalten von Benutzern',
        'actions.save': 'Speichern',
        'actions.cancel': 'Abbrechen',
        'actions.delete': 'Benutzer löschen',
        'empty.field': '',
      },
      keyCount: 6,
    },
    {
      filename: 'fr.json',
      path: 'C:/Projects/locales/fr.json',
      raw: {},
      keys: {
        'app.title': 'Tableau de bord Admin',
        'actions.save': 'Enregistrer',
      },
      keyCount: 2,
    },
  ]

  it('returns empty results when query is empty or only whitespace', () => {
    expect(searchWorkspaceLocalization(mockFiles, '').totalMatches).toBe(0)
    expect(searchWorkspaceLocalization(mockFiles, '   ').totalMatches).toBe(0)
    expect(searchWorkspaceLocalization([], 'admin').totalMatches).toBe(0)
  })

  it('searches by key substring case-insensitively', () => {
    const res = searchWorkspaceLocalization(mockFiles, 'ACTIONS')
    // actions.cancel, actions.delete, actions.save across en & de, plus actions.save in fr = 3 + 3 + 1 = 7 matches
    expect(res.totalMatches).toBe(7)
    expect(res.groups).toHaveLength(3)

    const enGroup = res.groups.find((g) => g.filename === 'en.json')
    expect(enGroup).toBeDefined()
    expect(enGroup?.results.map((r) => r.key)).toEqual([
      'actions.cancel',
      'actions.delete',
      'actions.save',
    ])
    expect(enGroup?.results[0].matchType).toBe('key')
  })

  it('searches by translation value substring case-insensitively', () => {
    const res = searchWorkspaceLocalization(mockFiles, 'dashboard')
    // matches 'Admin Dashboard' in en.json
    expect(res.totalMatches).toBe(1)
    expect(res.results[0].filename).toBe('en.json')
    expect(res.results[0].key).toBe('app.title')
    expect(res.results[0].value).toBe('Admin Dashboard')
    expect(res.results[0].matchType).toBe('value')
  })

  it('identifies matchType as "both" when query matches both key and value', () => {
    const res = searchWorkspaceLocalization(mockFiles, 'save')
    // en.json: actions.save -> "Save" (both)
    // de.json: actions.save -> "Speichern" (key)
    // fr.json: actions.save -> "Enregistrer" (key)
    const enMatch = res.results.find((r) => r.filename === 'en.json')
    expect(enMatch?.matchType).toBe('both')

    const deMatch = res.results.find((r) => r.filename === 'de.json')
    expect(deMatch?.matchType).toBe('key')
  })

  it('finds and marks empty translation values with isEmpty: true', () => {
    const res = searchWorkspaceLocalization(mockFiles, 'empty.field')
    expect(res.totalMatches).toBe(2)
    expect(res.results.every((r) => r.isEmpty)).toBe(true)
  })

  it('maintains deterministic workspace file ordering and key alphabetical sorting', () => {
    const res = searchWorkspaceLocalization(mockFiles, 'admin')
    expect(res.groups.map((g) => g.filename)).toEqual(['en.json', 'de.json', 'fr.json'])
    expect(res.groups[0].languageName).toBe('English')
    expect(res.groups[1].languageName).toBe('German')
    expect(res.groups[2].languageName).toBe('French')
  })

  describe('splitMatchRanges', () => {
    it('returns single unhighlighted segment when query is empty or does not match', () => {
      expect(splitMatchRanges('Hello World', '')).toEqual([
        { text: 'Hello World', isMatch: false },
      ])
      expect(splitMatchRanges('Hello World', 'xyz')).toEqual([
        { text: 'Hello World', isMatch: false },
      ])
    })

    it('splits text into matched and non-matched segments preserving original case', () => {
      const segments = splitMatchRanges('Admin user with ADMIN role', 'admin')
      expect(segments).toEqual([
        { text: 'Admin', isMatch: true },
        { text: ' user with ', isMatch: false },
        { text: 'ADMIN', isMatch: true },
        { text: ' role', isMatch: false },
      ])
    })
  })
})
