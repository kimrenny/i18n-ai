import { describe, it, expect } from 'vitest'
import { planMissingKeysAddition } from './localizationWriter'
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
    // Must NOT mutate A into an object and lose the primitive string!
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

    expect(ruPlan.formattedJson).toBe(
      '{\n  "A": {\n    "B": ""\n  }\n}\n'
    )
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
