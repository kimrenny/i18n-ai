import { describe, it, expect } from 'vitest'
import {
  planMissingKeysAddition,
  updateSingleKeyInFile,
  deleteKeyFromFile,
  deleteSectionFromFile,
} from './localizationWriter'
import { compareLocalizationFiles } from './localizationComparator'
import { parseLocalizationData } from './localizationParser'
import type { ParsedLocalizationFile } from '../types/localization'

describe('localizationWriter service', () => {
  const createParsed = (
    filename: string,
    raw: Record<string, unknown>
  ): ParsedLocalizationFile => {
    return parseLocalizationData(filename, `/locales/${filename}`, raw)
  }

  describe('planMissingKeysAddition', () => {
    it('plans addition of simple top-level missing keys with empty strings', () => {
      const en = createParsed('en.json', { OK: 'OK', CANCEL: 'Cancel' })
      const ru = createParsed('ru.json', { OK: 'ОК' })
      const comp = compareLocalizationFiles([en, ru])

      const plan = planMissingKeysAddition([en, ru], comp)

      expect(plan.totalKeysToAdd).toBe(1)
      expect(plan.filesToModify.length).toBe(1)
      expect(plan.filesToModify[0].filename).toBe('ru.json')
      expect(plan.filesToModify[0].keysToAdd).toEqual([{ key: 'CANCEL', value: '' }])
      expect(plan.filesToModify[0].newRawJson).toEqual({
        OK: 'ОК',
        CANCEL: '',
      })
    })

    it('adds deeply nested missing keys preserving tree structure', () => {
      const en = createParsed('en.json', {
        ADMIN: {
          PANEL: {
            USERS: {
              TABLE: {
                EMPTY: 'No users found',
              },
            },
          },
        },
      })
      const ru = createParsed('ru.json', {
        ADMIN: {
          TITLE: 'Панель',
        },
      })
      const comp = compareLocalizationFiles([en, ru])

      const plan = planMissingKeysAddition([en, ru], comp)

      const ruPlan = plan.filesToModify.find((f) => f.filename === 'ru.json')
      expect(ruPlan).toBeDefined()
      expect(ruPlan?.keysToAdd).toEqual([
        { key: 'ADMIN.PANEL.USERS.TABLE.EMPTY', value: '' },
      ])
      expect(ruPlan?.newRawJson).toEqual({
        ADMIN: {
          TITLE: 'Панель',
          PANEL: {
            USERS: {
              TABLE: {
                EMPTY: '',
              },
            },
          },
        },
      })

      const enPlan = plan.filesToModify.find((f) => f.filename === 'en.json')
      expect(enPlan).toBeDefined()
      expect(enPlan?.keysToAdd).toEqual([{ key: 'ADMIN.TITLE', value: '' }])
      expect(enPlan?.newRawJson).toEqual({
        ADMIN: {
          PANEL: {
            USERS: {
              TABLE: {
                EMPTY: 'No users found',
              },
            },
          },
          TITLE: '',
        },
      })
    })

    it('preserves existing values and types (strings, numbers, bools, arrays)', () => {
      const en = createParsed('en.json', {
        COUNT: 42,
        ENABLED: true,
        TAGS: ['a', 'b'],
        EXTRA: 'extra',
      })
      const ru = createParsed('ru.json', {
        COUNT: 42,
        ENABLED: false,
        TAGS: ['ru_a'],
      })
      const comp = compareLocalizationFiles([en, ru])

      const plan = planMissingKeysAddition([en, ru], comp)
      const ruPlan = plan.filesToModify.find((f) => f.filename === 'ru.json')!

      expect(ruPlan.newRawJson).toEqual({
        COUNT: 42,
        ENABLED: false,
        TAGS: ['ru_a'],
        EXTRA: '',
      })
    })

    it('safely detects structural conflict and avoids overwriting primitive values', () => {
      const en = createParsed('en.json', {
        A: {
          B: {
            C: 'Deep value',
          },
        },
      })
      const ru = createParsed('ru.json', {
        A: 'Primitive string value',
      })
      const comp = compareLocalizationFiles([en, ru])

      const plan = planMissingKeysAddition([en, ru], comp)

      expect(plan.hasConflicts).toBe(true)
      expect(plan.conflictMessages.length).toBeGreaterThan(0)
      expect(plan.conflictMessages[0]).toContain('Cannot add "A.B.C"')

      const ruPlan = plan.filesToModify.find((f) => f.filename === 'ru.json')!
      expect(ruPlan.newRawJson).toEqual({
        A: 'Primitive string value',
      })
      expect(ruPlan.keysToAdd).toEqual([])
    })

    it('returns no modifications when all files are complete', () => {
      const en = createParsed('en.json', { A: '1', B: '2' })
      const ru = createParsed('ru.json', { A: '1', B: '2' })
      const comp = compareLocalizationFiles([en, ru])

      const plan = planMissingKeysAddition([en, ru], comp)

      expect(plan.totalKeysToAdd).toBe(0)
      expect(plan.filesToModify).toEqual([])
      expect(plan.hasConflicts).toBe(false)
    })

    it('produces pretty-printed formatted JSON strings', () => {
      const en = createParsed('en.json', { A: { B: '1' } })
      const ru = createParsed('ru.json', {})
      const comp = compareLocalizationFiles([en, ru])

      const plan = planMissingKeysAddition([en, ru], comp)
      const ruPlan = plan.filesToModify.find((f) => f.filename === 'ru.json')!

      expect(ruPlan.formattedJson).toBe('{\n  "A": {\n    "B": ""\n  }\n}\n')
    })

    it('does not mutate original parsed localization files', () => {
      const en = createParsed('en.json', { A: '1', B: '2' })
      const ru = createParsed('ru.json', { A: '1' })
      const comp = compareLocalizationFiles([en, ru])

      const ruClone = JSON.parse(JSON.stringify(ru))
      planMissingKeysAddition([en, ru], comp)

      expect(ru).toEqual(ruClone)
    })
  })

  describe('updateSingleKeyInFile', () => {
    it('modifies only the requested key and preserves all other data', () => {
      const raw = {
        MENU: {
          PLAY: '',
          EXIT: 'Выход',
        },
        SETTINGS: {
          QUALITY: 'Высокое',
        },
      }

      const { updatedRaw, formattedJson } = updateSingleKeyInFile(
        raw,
        'MENU.PLAY',
        'Играть'
      )

      expect(updatedRaw).toEqual({
        MENU: {
          PLAY: 'Играть',
          EXIT: 'Выход',
        },
        SETTINGS: {
          QUALITY: 'Высокое',
        },
      })
      expect(formattedJson).toContain('"PLAY": "Играть"')
    })

    it('updates deeply nested keys correctly', () => {
      const raw = {
        ADMIN: {
          PANEL: {
            BUTTON: {
              SAVE: '',
            },
          },
        },
      }

      const { updatedRaw } = updateSingleKeyInFile(
        raw,
        'ADMIN.PANEL.BUTTON.SAVE',
        'Сохранить'
      )

      expect(updatedRaw).toEqual({
        ADMIN: {
          PANEL: {
            BUTTON: {
              SAVE: 'Сохранить',
            },
          },
        },
      })
    })

    it('preserves types and allows saving empty string ""', () => {
      const raw = {
        TAGS: ['a', 'b'],
        COUNT: 5,
        TITLE: 'Old',
      }

      const { updatedRaw } = updateSingleKeyInFile(raw, 'TITLE', '')
      expect(updatedRaw).toEqual({
        TAGS: ['a', 'b'],
        COUNT: 5,
        TITLE: '',
      })
    })

    it('does not mutate the original raw object', () => {
      const raw = { A: { B: 'Original' } }
      const rawClone = JSON.parse(JSON.stringify(raw))

      updateSingleKeyInFile(raw, 'A.B', 'New')

      expect(raw).toEqual(rawClone)
    })

    it('throws when encountering a structural conflict', () => {
      const raw = { A: 'string value' }
      expect(() => updateSingleKeyInFile(raw, 'A.B.C', 'value')).toThrow(
        /Structural conflict/i
      )
    })
  })

  describe('deleteKeyFromFile', () => {
    it('physically removes a root-level key without leaving empty string or null', () => {
      const raw = {
        welcome: 'Hello',
        goodbye: 'Goodbye',
      }
      const { updatedRaw, formattedJson, deleted } = deleteKeyFromFile(raw, 'welcome')
      expect(deleted).toBe(true)
      expect(updatedRaw).toEqual({ goodbye: 'Goodbye' })
      expect('welcome' in (updatedRaw as Record<string, unknown>)).toBe(false)
      expect(formattedJson).not.toContain('"welcome"')
      expect(formattedJson).toContain('"goodbye": "Goodbye"')
    })

    it('physically removes a nested leaf key, preserves sibling properties, and cleans up empty parents', () => {
      const raw = {
        admin: {
          dashboard: {
            title: 'Dashboard',
            subtitle: 'Overview',
          },
          users: {
            title: 'Users',
          },
        },
      }

      const { updatedRaw, formattedJson, deleted } = deleteKeyFromFile(
        raw,
        'admin.dashboard.title'
      )
      expect(deleted).toBe(true)
      expect(updatedRaw).toEqual({
        admin: {
          dashboard: {
            subtitle: 'Overview',
          },
          users: {
            title: 'Users',
          },
        },
      })
      const adminObj = (updatedRaw as Record<string, unknown>).admin as Record<string, unknown>
      const dashboardObj = adminObj.dashboard as Record<string, unknown>
      expect('title' in dashboardObj).toBe(false)
      expect(dashboardObj.subtitle).toBe('Overview')
      expect(formattedJson).not.toContain('"title": "Dashboard"')

      // Deleting the remaining sibling in dashboard cleans up the empty dashboard object
      const { updatedRaw: afterSecond } = deleteKeyFromFile(
        updatedRaw,
        'admin.dashboard.subtitle'
      )
      expect(afterSecond).toEqual({
        admin: {
          users: {
            title: 'Users',
          },
        },
      })
      const adminObjAfter = (afterSecond as Record<string, unknown>).admin as Record<string, unknown>
      expect('dashboard' in adminObjAfter).toBe(false)
    })

    it('handles non-existent keys gracefully without modifying data', () => {
      const raw = { A: { B: '1' } }
      const { updatedRaw, deleted } = deleteKeyFromFile(raw, 'A.NON_EXISTENT')
      expect(deleted).toBe(false)
      expect(updatedRaw).toEqual({ A: { B: '1' } })
    })

    it('does not mutate original object', () => {
      const raw = { A: { B: '1', C: '2' } }
      const clone = JSON.parse(JSON.stringify(raw))
      deleteKeyFromFile(raw, 'A.B')
      expect(raw).toEqual(clone)
    })
  })

  describe('deleteSectionFromFile', () => {
    it('physically removes an entire nested section and all of its descendants', () => {
      const raw = {
        admin: {
          dashboard: {
            title: 'Dashboard',
            subtitle: 'Overview',
          },
          users: {
            title: 'Users',
          },
        },
      }

      const { updatedRaw, formattedJson, deleted } = deleteSectionFromFile(
        raw,
        'admin.dashboard'
      )
      expect(deleted).toBe(true)
      expect(updatedRaw).toEqual({
        admin: {
          users: {
            title: 'Users',
          },
        },
      })
      const adminObj = (updatedRaw as Record<string, unknown>).admin as Record<string, unknown>
      expect('dashboard' in adminObj).toBe(false)
      expect(formattedJson).not.toContain('dashboard')
      expect(formattedJson).toContain('"title": "Users"')
    })

    it('deletes an entire top-level section', () => {
      const raw = {
        AUTH: {
          LOGIN: 'Log In',
          LOGOUT: 'Log Out',
        },
        SETTINGS: {
          THEME: 'Dark',
        },
      }

      const { updatedRaw, deleted } = deleteSectionFromFile(raw, 'AUTH')
      expect(deleted).toBe(true)
      expect(updatedRaw).toEqual({
        SETTINGS: {
          THEME: 'Dark',
        },
      })
      expect('AUTH' in (updatedRaw as Record<string, unknown>)).toBe(false)
    })
  })
})

