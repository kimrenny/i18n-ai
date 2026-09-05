import { describe, it, expect } from 'vitest'
import {
  validateTranslationKey,
  insertKeyIntoLocalizationObject,
  checkKeyExistsInFile,
  planAddTranslationKey,
} from './localizationKeyInsertion'
import type { ParsedLocalizationFile } from '../types/localization'

describe('localizationKeyInsertion', () => {
  describe('validateTranslationKey', () => {
    it('accepts valid dot-notation keys', () => {
      expect(validateTranslationKey('TITLE').isValid).toBe(true)
      expect(validateTranslationKey('ADMIN.DASHBOARD.TITLE').isValid).toBe(true)
      expect(validateTranslationKey('  common.buttons.save  ').isValid).toBe(true)
      expect(validateTranslationKey('  common.buttons.save  ').trimmedKey).toBe('common.buttons.save')
    })

    it('rejects empty or whitespace-only keys', () => {
      const res1 = validateTranslationKey('')
      expect(res1.isValid).toBe(false)
      expect(res1.errorKey).toBe('errorEmpty')

      const res2 = validateTranslationKey('   ')
      expect(res2.isValid).toBe(false)
      expect(res2.errorKey).toBe('errorEmpty')
    })

    it('rejects keys starting or ending with a dot', () => {
      const res1 = validateTranslationKey('.ADMIN.TITLE')
      expect(res1.isValid).toBe(false)
      expect(res1.errorKey).toBe('errorDotBoundary')

      const res2 = validateTranslationKey('ADMIN.TITLE.')
      expect(res2.isValid).toBe(false)
      expect(res2.errorKey).toBe('errorDotBoundary')
    })

    it('rejects consecutive dots', () => {
      const res = validateTranslationKey('ADMIN..TITLE')
      expect(res.isValid).toBe(false)
      expect(res.errorKey).toBe('errorConsecutiveDots')
    })

    it('rejects empty segments', () => {
      const res = validateTranslationKey('ADMIN. .TITLE')
      expect(res.isValid).toBe(false)
      expect(res.errorKey).toBe('errorEmptySegment')
    })
  })

  describe('insertKeyIntoLocalizationObject', () => {
    it('creates new nested structure from empty object', () => {
      const { updatedRaw, formattedJson } = insertKeyIntoLocalizationObject(
        {},
        'ADMIN.DASHBOARD.TITLE',
        'Admin Panel'
      )
      expect(updatedRaw).toEqual({
        ADMIN: {
          DASHBOARD: {
            TITLE: 'Admin Panel',
          },
        },
      })
      expect(formattedJson).toBe(
        JSON.stringify(
          {
            ADMIN: {
              DASHBOARD: {
                TITLE: 'Admin Panel',
              },
            },
          },
          null,
          2
        ) + '\n'
      )
    })

    it('inserts into existing nested parent objects without overwriting siblings', () => {
      const initial = {
        ADMIN: {
          DASHBOARD: {
            EXISTING: 'Existing Value',
          },
          SIDEBAR: {
            HOME: 'Home',
          },
        },
      }

      const { updatedRaw } = insertKeyIntoLocalizationObject(
        initial,
        'ADMIN.DASHBOARD.TITLE',
        'New Title'
      )

      expect(updatedRaw).toEqual({
        ADMIN: {
          DASHBOARD: {
            EXISTING: 'Existing Value',
            TITLE: 'New Title',
          },
          SIDEBAR: {
            HOME: 'Home',
          },
        },
      })
      // Ensure input wasn't mutated
      expect(initial.ADMIN.DASHBOARD).not.toHaveProperty('TITLE')
    })

    it('preserves empty strings as valid translations', () => {
      const { updatedRaw } = insertKeyIntoLocalizationObject({}, 'SETTINGS.THEME', '')
      expect(updatedRaw).toEqual({
        SETTINGS: {
          THEME: '',
        },
      })
    })

    it('throws structural conflict when intermediate segment is a primitive', () => {
      const initial = {
        ADMIN: 'A simple string',
      }

      expect(() =>
        insertKeyIntoLocalizationObject(initial, 'ADMIN.DASHBOARD.TITLE', 'Title')
      ).toThrowError(/Structural conflict/)
    })

    it('throws structural conflict when leaf is already an object', () => {
      const initial = {
        ADMIN: {
          DASHBOARD: {
            TITLE: 'Hello',
          },
        },
      }

      expect(() =>
        insertKeyIntoLocalizationObject(initial, 'ADMIN.DASHBOARD', 'Invalid string overwrite')
      ).toThrowError(/Structural conflict/)
    })
  })

  describe('checkKeyExistsInFile', () => {
    it('detects keys in flattened map and raw nested structure', () => {
      const file: ParsedLocalizationFile = {
        filename: 'en.json',
        path: '/locales/en.json',
        raw: {
          MENU: {
            HOME: 'Home',
          },
        },
        keys: {
          'MENU.HOME': 'Home',
        },
        keyCount: 1,
      }

      expect(checkKeyExistsInFile(file, 'MENU.HOME').exists).toBe(true)
      expect(checkKeyExistsInFile(file, 'MENU.HOME').existingValue).toBe('Home')
      expect(checkKeyExistsInFile(file, 'MENU.SETTINGS').exists).toBe(false)
    })
  })

  describe('planAddTranslationKey', () => {
    const fileEn: ParsedLocalizationFile = {
      filename: 'en.json',
      path: '/locales/en.json',
      raw: {
        HEADER: {
          TITLE: 'App Header',
        },
      },
      keys: {
        'HEADER.TITLE': 'App Header',
      },
      keyCount: 1,
    }

    const fileDe: ParsedLocalizationFile = {
      filename: 'de.json',
      path: '/locales/de.json',
      raw: {
        HEADER: {},
      },
      keys: {},
      keyCount: 0,
    }

    const fileFr: ParsedLocalizationFile = {
      filename: 'fr.json',
      path: '/locales/fr.json',
      raw: {},
      keys: {},
      keyCount: 0,
    }

    it('single mode: plans insertion for the target file when key is missing', () => {
      const plan = planAddTranslationKey([fileEn, fileDe, fileFr], {
        key: 'HEADER.SUBTITLE',
        mode: 'single',
        singleTargetFile: 'de.json',
        translationsByFile: { 'de.json': 'Untertitel' },
      })

      expect(plan.canApply).toBe(true)
      expect(plan.hasConflicts).toBe(false)
      expect(plan.filesToModify).toHaveLength(1)
      expect(plan.filesToModify[0].filename).toBe('de.json')
      expect(plan.filesToModify[0].value).toBe('Untertitel')
      expect(plan.filesToModify[0].afterRawJson).toEqual({
        HEADER: {
          SUBTITLE: 'Untertitel',
        },
      })
      expect(plan.skippedFiles).toContain('en.json')
      expect(plan.skippedFiles).toContain('fr.json')
    })

    it('single mode: reports conflict if key already exists in the target file', () => {
      const plan = planAddTranslationKey([fileEn, fileDe, fileFr], {
        key: 'HEADER.TITLE',
        mode: 'single',
        singleTargetFile: 'en.json',
        translationsByFile: { 'en.json': 'New Header' },
      })

      expect(plan.canApply).toBe(false)
      expect(plan.hasConflicts).toBe(true)
      expect(plan.conflictMessages[0]).toContain('already exists')
      expect(plan.filesToModify).toHaveLength(0)
    })

    it('all mode: modifies only files where the key is absent and preserves existing translations', () => {
      const plan = planAddTranslationKey([fileEn, fileDe, fileFr], {
        key: 'HEADER.TITLE',
        mode: 'all',
        translationsByFile: {
          'de.json': 'App-Kopfzeile',
          'fr.json': '',
        },
      })

      expect(plan.canApply).toBe(true)
      expect(plan.hasConflicts).toBe(false)
      expect(plan.filesToModify).toHaveLength(2)
      expect(plan.filesToModify.map((f) => f.filename)).toEqual(['de.json', 'fr.json'])
      expect(plan.alreadyExistingFiles).toHaveLength(1)
      expect(plan.alreadyExistingFiles[0].filename).toBe('en.json')
      expect(plan.alreadyExistingFiles[0].existingValue).toBe('App Header')
      expect(plan.skippedFiles).toEqual(['en.json'])
    })

    it('all mode: cannot apply if key already exists in all files', () => {
      const file1: ParsedLocalizationFile = {
        filename: 'en.json',
        path: '/locales/en.json',
        raw: { A: '1' },
        keys: { A: '1' },
        keyCount: 1,
      }
      const file2: ParsedLocalizationFile = {
        filename: 'de.json',
        path: '/locales/de.json',
        raw: { A: '1' },
        keys: { A: '1' },
        keyCount: 1,
      }

      const plan = planAddTranslationKey([file1, file2], {
        key: 'A',
        mode: 'all',
      })

      expect(plan.canApply).toBe(false)
      expect(plan.filesToModify).toHaveLength(0)
      expect(plan.alreadyExistingFiles).toHaveLength(2)
    })
  })
})
