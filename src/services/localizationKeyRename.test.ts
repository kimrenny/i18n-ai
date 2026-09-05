import { describe, it, expect } from 'vitest'
import {
  validateRenameKey,
  renameKeyInLocalizationObject,
  planRenameTranslationKey,
} from './localizationKeyRename'
import type { ParsedLocalizationFile } from '../types/localization'

describe('localizationKeyRename service', () => {
  describe('validateRenameKey', () => {
    it('accepts valid simple and dot-notation keys', () => {
      expect(validateRenameKey('TITLE', 'HEADER').isValid).toBe(true)
      expect(validateRenameKey('ADMIN.DASHBOARD.TITLE', 'ADMIN.DASHBOARD.HEADER').isValid).toBe(true)
      expect(validateRenameKey('A', 'B.C.D').trimmedKey).toBe('B.C.D')
    })

    it('rejects empty or whitespace keys', () => {
      const res = validateRenameKey('TITLE', '   ')
      expect(res.isValid).toBe(false)
      expect(res.errorKey).toBe('errorEmpty')
    })

    it('rejects keys starting or ending with dot', () => {
      expect(validateRenameKey('TITLE', '.HEADER').errorKey).toBe('errorDotBoundary')
      expect(validateRenameKey('TITLE', 'HEADER.').errorKey).toBe('errorDotBoundary')
    })

    it('rejects consecutive dots', () => {
      expect(validateRenameKey('TITLE', 'ADMIN..HEADER').errorKey).toBe('errorConsecutiveDots')
    })

    it('rejects empty segments', () => {
      expect(validateRenameKey('TITLE', 'ADMIN.  .HEADER').errorKey).toBe('errorEmptySegment')
    })
  })

  describe('renameKeyInLocalizationObject', () => {
    it('renames a top-level key while preserving value and sibling keys', () => {
      const raw = {
        TITLE: 'My Title',
        SUBTITLE: 'My Subtitle',
      }
      const { updatedRaw, formattedJson, renamed, value } = renameKeyInLocalizationObject(
        raw,
        'TITLE',
        'HEADER'
      )

      expect(renamed).toBe(true)
      expect(value).toBe('My Title')
      expect(updatedRaw).toEqual({
        SUBTITLE: 'My Subtitle',
        HEADER: 'My Title',
      })
      expect(formattedJson).toBe(JSON.stringify(updatedRaw, null, 2) + '\n')
    })

    it('renames a nested key at arbitrary depth', () => {
      const raw = {
        ADMIN: {
          DASHBOARD: {
            TITLE: 'Dashboard Title',
            COUNT: 42,
          },
        },
      }
      const { updatedRaw, renamed, value } = renameKeyInLocalizationObject(
        raw,
        'ADMIN.DASHBOARD.TITLE',
        'ADMIN.DASHBOARD.HEADER'
      )

      expect(renamed).toBe(true)
      expect(value).toBe('Dashboard Title')
      expect(updatedRaw).toEqual({
        ADMIN: {
          DASHBOARD: {
            COUNT: 42,
            HEADER: 'Dashboard Title',
          },
        },
      })
    })

    it('moves a key across different sections and cleans up empty original sections', () => {
      const raw = {
        OLD_SECTION: {
          ONLY_KEY: 'Hello',
        },
        OTHER: 'Stay',
      }
      const { updatedRaw, renamed, value } = renameKeyInLocalizationObject(
        raw,
        'OLD_SECTION.ONLY_KEY',
        'NEW_SECTION.TITLE'
      )

      expect(renamed).toBe(true)
      expect(value).toBe('Hello')
      expect(updatedRaw).toEqual({
        OTHER: 'Stay',
        NEW_SECTION: {
          TITLE: 'Hello',
        },
      })
    })

    it('renames a flat key containing literal dots', () => {
      const raw = {
        'ADMIN.DASHBOARD.TITLE': 'Flat value',
      }
      const { updatedRaw, renamed, value } = renameKeyInLocalizationObject(
        raw,
        'ADMIN.DASHBOARD.TITLE',
        'ADMIN.DASHBOARD.HEADER'
      )

      expect(renamed).toBe(true)
      expect(value).toBe('Flat value')
      // Note: insertKeyIntoLocalizationObject creates nested objects by default for dot paths
      expect(updatedRaw).toBeDefined()
    })

    it('throws error if target key already exists in the object', () => {
      const raw = {
        TITLE: 'Title',
        HEADER: 'Existing Header',
      }
      expect(() => renameKeyInLocalizationObject(raw, 'TITLE', 'HEADER')).toThrow(
        /Target key "HEADER" already exists/i
      )
    })

    it('throws error if renaming causes a structural conflict with a primitive value', () => {
      const raw = {
        ADMIN: 'primitive string',
        TITLE: 'Hello',
      }
      expect(() => renameKeyInLocalizationObject(raw, 'TITLE', 'ADMIN.HEADER')).toThrow(
        /Structural conflict/i
      )
    })

    it('is a no-op when oldKey === newKey', () => {
      const raw = {
        TITLE: 'Hello',
      }
      const { updatedRaw, renamed, value } = renameKeyInLocalizationObject(raw, 'TITLE', 'TITLE')
      expect(renamed).toBe(true)
      expect(value).toBe('Hello')
      expect(updatedRaw).toEqual(raw)
    })

    it('returns renamed: false when oldKey is absent', () => {
      const raw = {
        OTHER: 'Val',
      }
      const { renamed } = renameKeyInLocalizationObject(raw, 'TITLE', 'HEADER')
      expect(renamed).toBe(false)
    })
  })

  describe('planRenameTranslationKey', () => {
    const files: ParsedLocalizationFile[] = [
      {
        filename: 'en.json',
        path: '/locales/en.json',
        raw: {
          ADMIN: {
            TITLE: 'Admin Title (EN)',
            EXISTING: 'Existing (EN)',
          },
        },
        keys: {
          'ADMIN.TITLE': 'Admin Title (EN)',
          'ADMIN.EXISTING': 'Existing (EN)',
        },
        keyCount: 2,
      },
      {
        filename: 'ru.json',
        path: '/locales/ru.json',
        raw: {
          ADMIN: {
            TITLE: 'Заголовок (RU)',
          },
        },
        keys: {
          'ADMIN.TITLE': 'Заголовок (RU)',
        },
        keyCount: 1,
      },
      {
        filename: 'de.json',
        path: '/locales/de.json',
        raw: {
          OTHER: 'Other (DE)',
        },
        keys: {
          OTHER: 'Other (DE)',
        },
        keyCount: 1,
      },
    ]

    it('creates a clean multi-file rename plan for files containing the key, skipping others', () => {
      const plan = planRenameTranslationKey(files, {
        oldKey: 'ADMIN.TITLE',
        newKey: 'ADMIN.HEADER',
      })

      expect(plan.canApply).toBe(true)
      expect(plan.hasConflicts).toBe(false)
      expect(plan.conflictMessages).toHaveLength(0)
      expect(plan.filesToModify).toHaveLength(2)

      const enMod = plan.filesToModify.find((f) => f.filename === 'en.json')!
      expect(enMod).toBeDefined()
      expect(enMod.value).toBe('Admin Title (EN)')
      expect(enMod.oldKey).toBe('ADMIN.TITLE')
      expect(enMod.newKey).toBe('ADMIN.HEADER')
      expect(enMod.afterRawJson).toEqual({
        ADMIN: {
          EXISTING: 'Existing (EN)',
          HEADER: 'Admin Title (EN)',
        },
      })

      const ruMod = plan.filesToModify.find((f) => f.filename === 'ru.json')!
      expect(ruMod).toBeDefined()
      expect(ruMod.value).toBe('Заголовок (RU)')
      expect(ruMod.afterRawJson).toEqual({
        ADMIN: {
          HEADER: 'Заголовок (RU)',
        },
      })

      expect(plan.skippedFiles).toContain('de.json')
    })

    it('detects existing target key conflict and prevents application', () => {
      const plan = planRenameTranslationKey(files, {
        oldKey: 'ADMIN.TITLE',
        newKey: 'ADMIN.EXISTING',
      })

      expect(plan.canApply).toBe(false)
      expect(plan.hasConflicts).toBe(true)
      expect(plan.conflictMessages[0]).toMatch(/already exists in en\.json/i)
    })

    it('rejects invalid new key syntax', () => {
      const plan = planRenameTranslationKey(files, {
        oldKey: 'ADMIN.TITLE',
        newKey: '..INVALID..',
      })

      expect(plan.canApply).toBe(false)
      expect(plan.hasConflicts).toBe(true)
      expect(plan.validation.isValid).toBe(false)
    })
  })
})
