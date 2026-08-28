import { describe, it, expect } from 'vitest'
import { compareLocalizationFiles } from './localizationComparator'
import type { ParsedLocalizationFile } from '../types/localization'

describe('localizationComparator', () => {
  const createFile = (
    filename: string,
    keys: Record<string, string>
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
    expect(result.keys).toEqual([
      {
        key: 'COMMON.CANCEL',
        isComplete: true,
        presentInFiles: ['en.json', 'ru.json'],
        missingInFiles: [],
        values: { 'en.json': 'Cancel', 'ru.json': 'Отмена' },
      },
      {
        key: 'COMMON.OK',
        isComplete: true,
        presentInFiles: ['en.json', 'ru.json'],
        missingInFiles: [],
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

    const keyC = result.keys.find((k) => k.key === 'C')
    expect(keyC).toBeDefined()
    expect(keyC?.isComplete).toBe(false)
    expect(keyC?.presentInFiles).toEqual(['en.json'])
    expect(keyC?.missingInFiles).toEqual(['ru.json'])
  })

  it('handles different unique keys across multiple files without a canonical language', () => {
    const en = createFile('en.json', { A: '1', B: '2' })
    const ru = createFile('ru.json', { A: '1', C: '3' })

    const result = compareLocalizationFiles([en, ru])

    expect(result.totalUniqueKeys).toBe(3)
    expect(result.completeKeysCount).toBe(1)
    expect(result.incompleteKeysCount).toBe(2)

    expect(result.keys[0]).toEqual({
      key: 'A',
      isComplete: true,
      presentInFiles: ['en.json', 'ru.json'],
      missingInFiles: [],
      values: { 'en.json': '1', 'ru.json': '1' },
    })

    expect(result.keys[1]).toEqual({
      key: 'B',
      isComplete: false,
      presentInFiles: ['en.json'],
      missingInFiles: ['ru.json'],
      values: { 'en.json': '2' },
    })

    expect(result.keys[2]).toEqual({
      key: 'C',
      isComplete: false,
      presentInFiles: ['ru.json'],
      missingInFiles: ['en.json'],
      values: { 'ru.json': '3' },
    })
  })

  it('compares across three files with independent presence per file', () => {
    const en = createFile('en.json', {
      'AUTH.LOGIN': 'Login',
      'AUTH.LOGOUT': 'Logout',
      'ADMIN.PANEL.TITLE': 'Admin Panel',
    })
    const ru = createFile('ru.json', {
      'AUTH.LOGIN': 'Войти',
      'ADMIN.PANEL.TITLE': 'Панель администратора',
    })
    const uk = createFile('uk.json', {
      'AUTH.LOGIN': 'Увійти',
    })

    const result = compareLocalizationFiles([en, ru, uk])

    expect(result.comparedFileCount).toBe(3)
    expect(result.totalUniqueKeys).toBe(3)
    expect(result.completeKeysCount).toBe(1) // AUTH.LOGIN
    expect(result.incompleteKeysCount).toBe(2) // ADMIN.PANEL.TITLE, AUTH.LOGOUT

    const adminKey = result.keys.find((k) => k.key === 'ADMIN.PANEL.TITLE')
    expect(adminKey?.isComplete).toBe(false)
    expect(adminKey?.presentInFiles).toEqual(['en.json', 'ru.json'])
    expect(adminKey?.missingInFiles).toEqual(['uk.json'])

    const logoutKey = result.keys.find((k) => k.key === 'AUTH.LOGOUT')
    expect(logoutKey?.isComplete).toBe(false)
    expect(logoutKey?.presentInFiles).toEqual(['en.json'])
    expect(logoutKey?.missingInFiles).toEqual(['ru.json', 'uk.json'])
  })

  it('constructs union when first file does not have keys present in later files', () => {
    const first = createFile('file1.json', { X: 'x' })
    const second = createFile('file2.json', { Y: 'y', Z: 'z' })

    const result = compareLocalizationFiles([first, second])

    expect(result.keys.map((k) => k.key)).toEqual(['X', 'Y', 'Z'])
    const yKey = result.keys.find((k) => k.key === 'Y')
    expect(yKey?.presentInFiles).toEqual(['file2.json'])
    expect(yKey?.missingInFiles).toEqual(['file1.json'])
  })

  it('participates empty valid JSON as a file with 0 keys', () => {
    const normal = createFile('en.json', { 'APP.TITLE': 'App' })
    const empty = createFile('empty.json', {})

    const result = compareLocalizationFiles([normal, empty])

    expect(result.comparedFileCount).toBe(2)
    expect(result.totalUniqueKeys).toBe(1)
    expect(result.completeKeysCount).toBe(0)
    expect(result.incompleteKeysCount).toBe(1)

    const key = result.keys[0]
    expect(key.key === 'APP.TITLE').toBe(true)
    expect(key.presentInFiles).toEqual(['en.json'])
    expect(key.missingInFiles).toEqual(['empty.json'])
  })

  it('safely handles edge cases: 0 files and 1 file', () => {
    const emptyResult = compareLocalizationFiles([])
    expect(emptyResult.comparedFileCount).toBe(0)
    expect(emptyResult.totalUniqueKeys).toBe(0)
    expect(emptyResult.keys).toEqual([])

    const oneFileResult = compareLocalizationFiles([
      createFile('en.json', { A: '1', B: '2' }),
    ])
    expect(oneFileResult.comparedFileCount).toBe(1)
    expect(oneFileResult.totalUniqueKeys).toBe(2)
    expect(oneFileResult.completeKeysCount).toBe(2)
    expect(oneFileResult.incompleteKeysCount).toBe(0)
    expect(oneFileResult.keys[0].missingInFiles).toEqual([])
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
