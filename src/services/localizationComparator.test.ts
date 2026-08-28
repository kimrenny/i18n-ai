import { describe, it, expect } from 'vitest'
import { compareLocalizationFiles } from './localizationComparator'
import type { ParsedLocalizationFile, JsonValue } from '../types/localization'

describe('localizationComparator', () => {
  const createFile = (
    filename: string,
    keys: Record<string, JsonValue>
  ): ParsedLocalizationFile => ({
    filename,
    path: `/locales/${filename}`,
    raw: keys,
    keys,
    keyCount: Object.keys(keys).length,
  })

  it('handles two identical files with all keys complete', () => {
    const file1 = createFile('en.json', { 'COMMON.OK': 'OK', 'COMMON.CANCEL': 'Cancel' })
    const file2 = createFile('ru.json', { 'COMMON.OK': 'ОК', 'COMMON.CANCEL': 'Отмена' })

    const result = compareLocalizationFiles([file1, file2])

    expect(result.comparedFileCount).toBe(2)
    expect(result.totalUniqueKeys).toBe(2)
    expect(result.completeKeysCount).toBe(2)
    expect(result.incompleteKeysCount).toBe(0)
    expect(result.emptyKeysCount).toBe(0)
    expect(result.keys).toEqual([
      {
        key: 'COMMON.CANCEL',
        isComplete: true,
        presentInFiles: ['en.json', 'ru.json'],
        missingInFiles: [],
        emptyInFiles: [],
        values: { 'en.json': 'Cancel', 'ru.json': 'Отмена' },
      },
      {
        key: 'COMMON.OK',
        isComplete: true,
        presentInFiles: ['en.json', 'ru.json'],
        missingInFiles: [],
        emptyInFiles: [],
        values: { 'en.json': 'OK', 'ru.json': 'ОК' },
      },
    ])
  })

  it('correctly detects one key missing in one file', () => {
    const en = createFile('en.json', { A: '1', B: '2', C: '3' })
    const ru = createFile('ru.json', { A: '1', B: '2' })

    const result = compareLocalizationFiles([en, ru])

    expect(result.totalUniqueKeys).toBe(3)
    expect(result.completeKeysCount).toBe(2)
    expect(result.incompleteKeysCount).toBe(1)
    expect(result.emptyKeysCount).toBe(0)

    const keyC = result.keys.find((k) => k.key === 'C')
    expect(keyC).toBeDefined()
    expect(keyC?.isComplete).toBe(false)
    expect(keyC?.presentInFiles).toEqual(['en.json'])
    expect(keyC?.missingInFiles).toEqual(['ru.json'])
  })

  it('distinguishes between missing and empty keys', () => {
    const en = createFile('en.json', {
      MENU_PLAY: 'Play',
      MENU_EXIT: 'Exit',
      MENU_HELP: 'Help',
    })
    const ru = createFile('ru.json', {
      MENU_PLAY: '', // empty
      MENU_EXIT: 'Выход', // normal translated
      // MENU_HELP is missing
    })

    const result = compareLocalizationFiles([en, ru])

    expect(result.totalUniqueKeys).toBe(3)
    expect(result.completeKeysCount).toBe(1) // MENU_EXIT
    expect(result.incompleteKeysCount).toBe(1) // MENU_HELP missing in ru
    expect(result.emptyKeysCount).toBe(1) // MENU_PLAY empty in ru

    const playKey = result.keys.find((k) => k.key === 'MENU_PLAY')!
    expect(playKey.isComplete).toBe(false)
    expect(playKey.presentInFiles).toEqual(['en.json', 'ru.json'])
    expect(playKey.missingInFiles).toEqual([])
    expect(playKey.emptyInFiles).toEqual(['ru.json'])

    const helpKey = result.keys.find((k) => k.key === 'MENU_HELP')!
    expect(helpKey.isComplete).toBe(false)
    expect(helpKey.presentInFiles).toEqual(['en.json'])
    expect(helpKey.missingInFiles).toEqual(['ru.json'])
    expect(helpKey.emptyInFiles).toEqual([])
  })

  it('does NOT consider non-empty values as empty (whitespace, null, false, 0, arrays)', () => {
    const file = createFile('en.json', {
      SPACES: ' ',
      NULL_VAL: null,
      FALSE_VAL: false,
      ZERO_VAL: 0,
      EMPTY_STR: '',
    })

    const result = compareLocalizationFiles([file])

    expect(result.totalUniqueKeys).toBe(5)
    expect(result.emptyKeysCount).toBe(1)

    expect(result.keys.find((k) => k.key === 'SPACES')?.emptyInFiles).toEqual([])
    expect(result.keys.find((k) => k.key === 'NULL_VAL')?.emptyInFiles).toEqual([])
    expect(result.keys.find((k) => k.key === 'FALSE_VAL')?.emptyInFiles).toEqual([])
    expect(result.keys.find((k) => k.key === 'ZERO_VAL')?.emptyInFiles).toEqual([])
    expect(result.keys.find((k) => k.key === 'EMPTY_STR')?.emptyInFiles).toEqual(['en.json'])
  })

  it('handles different unique keys across multiple files without a canonical language', () => {
    const en = createFile('en.json', { A: '1', B: '2' })
    const ru = createFile('ru.json', { A: '1', C: '3' })

    const result = compareLocalizationFiles([en, ru])

    expect(result.totalUniqueKeys).toBe(3)
    expect(result.completeKeysCount).toBe(1)
    expect(result.incompleteKeysCount).toBe(2)
  })

  it('safely handles edge cases: 0 files and 1 file', () => {
    const emptyResult = compareLocalizationFiles([])
    expect(emptyResult.comparedFileCount).toBe(0)
    expect(emptyResult.totalUniqueKeys).toBe(0)
    expect(emptyResult.emptyKeysCount).toBe(0)
    expect(emptyResult.keys).toEqual([])

    const oneFileResult = compareLocalizationFiles([
      createFile('en.json', { A: '1', B: '' }),
    ])
    expect(oneFileResult.comparedFileCount).toBe(1)
    expect(oneFileResult.totalUniqueKeys).toBe(2)
    expect(oneFileResult.completeKeysCount).toBe(1)
    expect(oneFileResult.emptyKeysCount).toBe(1)
  })

  it('returns keys in strictly deterministic alphabetical order', () => {
    const file1 = createFile('en.json', {
      ZEBRA: '1',
      APPLE: '2',
      MANGO: '3',
      BANANA: '4',
    })
    const file2 = createFile('ru.json', {
      ORANGE: '5',
      APPLE: '6',
    })

    const result = compareLocalizationFiles([file1, file2])

    expect(result.keys.map((k) => k.key)).toEqual([
      'APPLE',
      'BANANA',
      'MANGO',
      'ORANGE',
      'ZEBRA',
    ])
  })

  it('does not mutate input parsed localization objects', () => {
    const file1 = createFile('en.json', { A: '1' })
    const file2 = createFile('ru.json', { B: '2' })

    const file1Clone = JSON.parse(JSON.stringify(file1))
    const file2Clone = JSON.parse(JSON.stringify(file2))

    compareLocalizationFiles([file1, file2])

    expect(file1).toEqual(file1Clone)
    expect(file2).toEqual(file2Clone)
  })
})
