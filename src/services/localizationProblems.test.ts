import { describe, it, expect } from 'vitest'
import {
  calculateWorkspaceProblems,
  filterProblems,
  groupProblemsByLanguage,
} from './localizationProblems'
import type { ParsedLocalizationFile } from '../types/localization'

describe('localizationProblems service', () => {
  const mockEnFile: ParsedLocalizationFile = {
    filename: 'en.json',
    path: '/locales/en.json',
    raw: {},
    keys: {
      'app.title': 'My App',
      'app.description': 'Description',
      'actions.save': 'Save',
      'actions.cancel': 'Cancel',
      'actions.delete': 'Delete',
    },
    keyCount: 5,
  }

  const mockDeFile: ParsedLocalizationFile = {
    filename: 'de.json',
    path: '/locales/de.json',
    raw: {},
    keys: {
      'app.title': 'Meine App',
      'app.description': '', // empty
      'actions.save': 'Speichern',
      // actions.cancel: missing
      // actions.delete: missing
    },
    keyCount: 3,
  }

  const mockUaFile: ParsedLocalizationFile = {
    filename: 'ua.json',
    path: '/locales/ua.json',
    raw: {},
    keys: {
      'app.title': 'Мій додаток',
      'app.description': 'Опис',
      'actions.save': 'Зберегти',
      'actions.cancel': 'Скасувати',
      'actions.delete': 'Видалити',
    },
    keyCount: 5,
  }

  it('handles empty or null files array', () => {
    const summary = calculateWorkspaceProblems([])
    expect(summary.totalProblems).toBe(0)
    expect(summary.totalMissing).toBe(0)
    expect(summary.totalEmpty).toBe(0)
    expect(summary.problems).toEqual([])
    expect(summary.groups).toEqual([])
  })

  it('detects missing and empty keys and separates them correctly', () => {
    const files = [mockEnFile, mockDeFile]
    const summary = calculateWorkspaceProblems(files)

    expect(summary.totalProblems).toBe(3) // 2 missing + 1 empty in de.json
    expect(summary.totalMissing).toBe(2)
    expect(summary.totalEmpty).toBe(1)

    const deGroup = summary.groups.find((g) => g.filename === 'de.json')
    expect(deGroup).toBeDefined()
    expect(deGroup?.missingCount).toBe(2)
    expect(deGroup?.emptyCount).toBe(1)
    expect(deGroup?.totalCount).toBe(3)

    // Missing keys
    const missingKeys = deGroup?.problems.filter((p) => p.type === 'missing').map((p) => p.key)
    expect(missingKeys).toEqual(['actions.cancel', 'actions.delete'])

    // Empty keys
    const emptyKeys = deGroup?.problems.filter((p) => p.type === 'empty').map((p) => p.key)
    expect(emptyKeys).toEqual(['app.description'])
  })

  it('does not report reference language as missing from itself', () => {
    const files = [mockEnFile, mockDeFile]
    const summary = calculateWorkspaceProblems(files)

    const enGroup = summary.groups.find((g) => g.filename === 'en.json')
    expect(enGroup).toBeDefined()
    expect(enGroup?.missingCount).toBe(0)
    expect(enGroup?.emptyCount).toBe(0)
    expect(enGroup?.totalCount).toBe(0)
  })

  it('produces deterministic ordering: language order, missing before empty, alphabetical by key', () => {
    const mockFrFile: ParsedLocalizationFile = {
      filename: 'fr.json',
      path: '/locales/fr.json',
      raw: {},
      keys: {
        'actions.save': '', // empty
        'app.title': 'Mon App',
        // actions.cancel, actions.delete, app.description missing
      },
      keyCount: 2,
    }

    const files = [mockEnFile, mockDeFile, mockFrFile]
    const summary = calculateWorkspaceProblems(files)

    // Check de.json problems order: missing (cancel, delete) then empty (description)
    const deProblems = summary.problems.filter((p) => p.filename === 'de.json')
    expect(deProblems.map((p) => `${p.type}:${p.key}`)).toEqual([
      'missing:actions.cancel',
      'missing:actions.delete',
      'empty:app.description',
    ])

    // Check fr.json problems order: missing (cancel, delete, description) then empty (save)
    const frProblems = summary.problems.filter((p) => p.filename === 'fr.json')
    expect(frProblems.map((p) => `${p.type}:${p.key}`)).toEqual([
      'missing:actions.cancel',
      'missing:actions.delete',
      'missing:app.description',
      'empty:actions.save',
    ])
  })

  it('correctly maps ua.json to Ukrainian language code and display name', () => {
    const mockUaIncomplete: ParsedLocalizationFile = {
      filename: 'ua.json',
      path: '/locales/ua.json',
      raw: {},
      keys: {
        'app.title': 'Мій додаток',
        // missing other keys
      },
      keyCount: 1,
    }

    const files = [mockEnFile, mockUaIncomplete]
    const summary = calculateWorkspaceProblems(files)

    const uaGroup = summary.groups.find((g) => g.filename === 'ua.json')
    expect(uaGroup).toBeDefined()
    expect(uaGroup?.languageCode).toBe('uk')
    expect(uaGroup?.languageName).toBe('Ukrainian')
    expect(uaGroup?.problems[0].languageName).toBe('Ukrainian')
  })

  it('returns 0 problems for a completely translated workspace', () => {
    const files = [mockEnFile, mockUaFile]
    const summary = calculateWorkspaceProblems(files)

    expect(summary.totalProblems).toBe(0)
    expect(summary.totalMissing).toBe(0)
    expect(summary.totalEmpty).toBe(0)
    expect(summary.problems).toEqual([])
  })

  describe('filterProblems', () => {
    const files = [mockEnFile, mockDeFile]
    const summary = calculateWorkspaceProblems(files)

    it('returns all problems when filter is "all"', () => {
      const filtered = filterProblems(summary.problems, 'all', 'all')
      expect(filtered.length).toBe(3)
    })

    it('filters by language code or filename', () => {
      const filteredDe = filterProblems(summary.problems, 'de', 'all')
      expect(filteredDe.length).toBe(3)

      const filteredEn = filterProblems(summary.problems, 'en', 'all')
      expect(filteredEn.length).toBe(0)
    })

    it('filters by problem type (missing vs empty)', () => {
      const missingOnly = filterProblems(summary.problems, 'all', 'missing')
      expect(missingOnly.length).toBe(2)
      expect(missingOnly.every((p) => p.type === 'missing')).toBe(true)

      const emptyOnly = filterProblems(summary.problems, 'all', 'empty')
      expect(emptyOnly.length).toBe(1)
      expect(emptyOnly.every((p) => p.type === 'empty')).toBe(true)
    })

    it('combines language and type filters', () => {
      const deMissing = filterProblems(summary.problems, 'de', 'missing')
      expect(deMissing.length).toBe(2)
      expect(deMissing.map((p) => p.key)).toEqual(['actions.cancel', 'actions.delete'])
    })
  })

  describe('groupProblemsByLanguage', () => {
    it('groups flat problems array by language preserving order and counts', () => {
      const files = [mockEnFile, mockDeFile]
      const summary = calculateWorkspaceProblems(files)
      const groups = groupProblemsByLanguage(summary.problems)

      expect(groups.length).toBe(1) // only de.json has problems
      expect(groups[0].filename).toBe('de.json')
      expect(groups[0].missingCount).toBe(2)
      expect(groups[0].emptyCount).toBe(1)
      expect(groups[0].totalCount).toBe(3)
    })
  })
})
