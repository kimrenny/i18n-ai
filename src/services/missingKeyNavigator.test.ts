import { describe, it, expect } from 'vitest'
import { getMissingKeysForFile, getParentPaths } from './missingKeyNavigator'
import { compareLocalizationFiles } from './localizationComparator'
import type { ParsedLocalizationFile } from '../types/localization'

describe('missingKeyNavigator service', () => {
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

  describe('getMissingKeysForFile', () => {
    it('returns missing keys in stable alphabetical order for target file', () => {
      const en = createFile('en.json', {
        'ZEBRA.TITLE': 'Zebra',
        'AUTH.LOGOUT': 'Logout',
        'ADMIN.PANEL.SAVE': 'Save',
        'AUTH.LOGIN': 'Login',
      })
      const ru = createFile('ru.json', {
        'AUTH.LOGIN': 'Войти',
      })

      const comp = compareLocalizationFiles([en, ru])
      const missingInRu = getMissingKeysForFile('ru.json', comp)

      expect(missingInRu).toEqual([
        'ADMIN.PANEL.SAVE',
        'AUTH.LOGOUT',
        'ZEBRA.TITLE',
      ])
    })

    it('returns empty array when file has zero missing keys', () => {
      const en = createFile('en.json', { A: '1', B: '2' })
      const ru = createFile('ru.json', { A: '1', B: '2' })
      const comp = compareLocalizationFiles([en, ru])

      const missing = getMissingKeysForFile('en.json', comp)
      expect(missing).toEqual([])
    })

    it('isolates missing keys per file across three files', () => {
      const en = createFile('en.json', { A: '1', B: '2', C: '3' })
      const ru = createFile('ru.json', { A: '1', B: '2' })
      const uk = createFile('uk.json', { A: '1', C: '3', D: '4' })
      const comp = compareLocalizationFiles([en, ru, uk])

      expect(getMissingKeysForFile('en.json', comp)).toEqual(['D'])
      expect(getMissingKeysForFile('ru.json', comp)).toEqual(['C', 'D'])
      expect(getMissingKeysForFile('uk.json', comp)).toEqual(['B'])
    })
  })

  describe('getParentPaths', () => {
    it('returns empty array for top-level key', () => {
      expect(getParentPaths('TITLE')).toEqual([])
      expect(getParentPaths('')).toEqual([])
    })

    it('returns single parent for 2-level key', () => {
      expect(getParentPaths('AUTH.LOGIN')).toEqual(['AUTH'])
    })

    it('returns all ancestor segments for deeply nested key', () => {
      expect(getParentPaths('ADMIN.PANEL.BUTTON.SAVE')).toEqual([
        'ADMIN',
        'ADMIN.PANEL',
        'ADMIN.PANEL.BUTTON',
      ])
    })
  })
})
