import { describe, it, expect } from 'vitest'
import {
  calculateWorkspaceCoverage,
  determineReferenceLanguage,
  getLanguageDisplayName,
  getFirstProblemKeyForFile,
} from './localizationCoverage'
import { compareLocalizationFiles } from './localizationComparator'
import type { ParsedLocalizationFile } from '../types/localization'

describe('localizationCoverage service', () => {
  const enFile: ParsedLocalizationFile = {
    filename: 'en.json',
    path: '/project/locales/en.json',
    raw: {
      app: { title: 'App', desc: 'Description' },
      actions: { save: 'Save', cancel: 'Cancel', delete: 'Delete' },
    },
    keys: {
      'app.title': 'App',
      'app.desc': 'Description',
      'actions.save': 'Save',
      'actions.cancel': 'Cancel',
      'actions.delete': 'Delete',
    },
    keyCount: 5,
  }

  const deFile: ParsedLocalizationFile = {
    filename: 'de.json',
    path: '/project/locales/de.json',
    raw: {
      app: { title: 'Anwendung', desc: '' },
      actions: { save: 'Speichern', cancel: 'Abbrechen' },
    },
    keys: {
      'app.title': 'Anwendung',
      'app.desc': '', // empty
      'actions.save': 'Speichern',
      'actions.cancel': 'Abbrechen',
      // actions.delete is missing
    },
    keyCount: 4,
  }

  const uaFile: ParsedLocalizationFile = {
    filename: 'ua.json',
    path: '/project/locales/ua.json',
    raw: {
      app: { title: 'Додаток', desc: 'Опис' },
      actions: { save: 'Зберегти', cancel: 'Скасувати', delete: 'Видалити' },
    },
    keys: {
      'app.title': 'Додаток',
      'app.desc': 'Опис',
      'actions.save': 'Зберегти',
      'actions.cancel': 'Скасувати',
      'actions.delete': 'Видалити',
    },
    keyCount: 5,
  }

  const frFile: ParsedLocalizationFile = {
    filename: 'fr.json',
    path: '/project/locales/fr.json',
    raw: {
      app: { title: 'Application' },
    },
    keys: {
      'app.title': 'Application',
    },
    keyCount: 1,
  }

  it('1. correctly identifies reference language (prefers English)', () => {
    const ref = determineReferenceLanguage([deFile, enFile, uaFile])
    expect(ref?.filename).toBe('en.json')
  })

  it('2. falls back to first valid file if English is not present', () => {
    const ref = determineReferenceLanguage([deFile, uaFile])
    expect(ref?.filename).toBe('de.json')
  })

  it('3. normalizes language names (including ua.json -> Ukrainian)', () => {
    expect(getLanguageDisplayName('en')).toBe('English')
    expect(getLanguageDisplayName('ua')).toBe('Ukrainian')
    expect(getLanguageDisplayName('uk')).toBe('Ukrainian')
    expect(getLanguageDisplayName('de')).toBe('German')
    expect(getLanguageDisplayName('fr')).toBe('French')
  })

  it('4. calculates 100% coverage for complete language files', () => {
    const summary = calculateWorkspaceCoverage([enFile, uaFile])
    const uaItem = summary.items.find((i) => i.filename === 'ua.json')
    expect(uaItem?.coveragePercentage).toBe(100)
    expect(uaItem?.translatedKeysCount).toBe(5)
    expect(uaItem?.missingKeysCount).toBe(0)
    expect(uaItem?.emptyKeysCount).toBe(0)
    expect(uaItem?.issuesCount).toBe(0)
  })

  it('5. calculates partial coverage, distinguishing missing from empty keys', () => {
    // en has 5 keys
    // de has 3 translated, 1 empty ('app.desc'), 1 missing ('actions.delete')
    const summary = calculateWorkspaceCoverage([enFile, deFile])
    const deItem = summary.items.find((i) => i.filename === 'de.json')
    expect(deItem?.totalExpectedKeys).toBe(5)
    expect(deItem?.translatedKeysCount).toBe(3)
    expect(deItem?.emptyKeysCount).toBe(1)
    expect(deItem?.missingKeysCount).toBe(1)
    expect(deItem?.coveragePercentage).toBe(60) // 3 / 5 = 60%
    expect(deItem?.issuesCount).toBe(2)
  })

  it('6. calculates realistic 82% coverage scenario (820 translated, 150 missing, 30 empty / 1000)', () => {
    const bigEnKeys: Record<string, string> = {}
    const bigDeKeys: Record<string, string> = {}
    for (let i = 1; i <= 1000; i++) {
      bigEnKeys[`key_${i}`] = `Value ${i}`
      if (i <= 820) {
        bigDeKeys[`key_${i}`] = `Wert ${i}`
      } else if (i <= 850) {
        bigDeKeys[`key_${i}`] = '' // 30 empty keys
      }
      // keys 851..1000 are missing (150 missing)
    }

    const bigEnFile: ParsedLocalizationFile = {
      filename: 'en.json',
      path: '/proj/en.json',
      raw: {},
      keys: bigEnKeys,
      keyCount: 1000,
    }
    const bigDeFile: ParsedLocalizationFile = {
      filename: 'de.json',
      path: '/proj/de.json',
      raw: {},
      keys: bigDeKeys,
      keyCount: 850,
    }

    const summary = calculateWorkspaceCoverage([bigEnFile, bigDeFile])
    const deItem = summary.items.find((i) => i.filename === 'de.json')
    expect(deItem?.totalExpectedKeys).toBe(1000)
    expect(deItem?.translatedKeysCount).toBe(820)
    expect(deItem?.emptyKeysCount).toBe(30)
    expect(deItem?.missingKeysCount).toBe(150)
    expect(deItem?.coveragePercentage).toBe(82)
    expect(deItem?.issuesCount).toBe(180)
  })

  it('7. displays reference language as 100% coverage', () => {
    const summary = calculateWorkspaceCoverage([enFile, deFile])
    const enItem = summary.items.find((i) => i.filename === 'en.json')
    expect(enItem?.isReference).toBe(true)
    expect(enItem?.coveragePercentage).toBe(100)
    expect(enItem?.missingKeysCount).toBe(0)
    expect(enItem?.emptyKeysCount).toBe(0)
  })

  it('8. calculates average coverage as mean of non-reference languages only', () => {
    // de: 60% (3/5)
    // ua: 100% (5/5)
    // fr: 20% (1/5)
    // non-ref average = (60 + 100 + 20) / 3 = 180 / 3 = 60%
    const summary = calculateWorkspaceCoverage([enFile, deFile, uaFile, frFile])
    expect(summary.totalLanguages).toBe(4)
    expect(summary.totalFiles).toBe(4)
    expect(summary.totalReferenceKeys).toBe(5)
    expect(summary.averageCoverage).toBe(60)
  })

  it('9. returns null averageCoverage when workspace only has 1 reference language', () => {
    const summary = calculateWorkspaceCoverage([enFile])
    expect(summary.totalFiles).toBe(1)
    expect(summary.totalLanguages).toBe(1)
    expect(summary.averageCoverage).toBeNull()
    expect(summary.totalMissingKeys).toBe(0)
    expect(summary.totalEmptyKeys).toBe(0)
  })

  it('10. sorts leastCompleteLanguages by lowest coverage %, then highest issues', () => {
    const summary = calculateWorkspaceCoverage([enFile, uaFile, deFile, frFile])
    // fr is 20% (4 issues)
    // de is 60% (2 issues)
    // ua is 100% (0 issues)
    expect(summary.leastCompleteLanguages.map((l) => l.filename)).toEqual([
      'fr.json',
      'de.json',
      'ua.json',
    ])
  })

  it('11. handles empty files array and 0-key files gracefully', () => {
    const emptySummary = calculateWorkspaceCoverage([])
    expect(emptySummary.totalFiles).toBe(0)
    expect(emptySummary.averageCoverage).toBeNull()

    const zeroKeyFile: ParsedLocalizationFile = {
      filename: 'en.json',
      path: '/proj/en.json',
      raw: {},
      keys: {},
      keyCount: 0,
    }
    const zeroSummary = calculateWorkspaceCoverage([zeroKeyFile])
    expect(zeroSummary.totalReferenceKeys).toBe(0)
    expect(zeroSummary.items[0].coveragePercentage).toBe(100)
  })

  it('12. getFirstProblemKeyForFile prioritizes missing keys alphabetically, then empty keys', () => {
    const comparison = compareLocalizationFiles([enFile, deFile])
    // In deFile, missing is 'actions.delete', empty is 'app.desc'
    const target = getFirstProblemKeyForFile('de.json', comparison)
    expect(target).toEqual({
      key: 'actions.delete',
      mode: 'missing',
    })
  })

  it('13. getFirstProblemKeyForFile prioritizes empty keys alphabetically when 0 missing keys', () => {
    const fileWithOnlyEmpty: ParsedLocalizationFile = {
      filename: 'de.json',
      path: '/project/locales/de.json',
      raw: {},
      keys: {
        'app.title': 'Anwendung',
        'app.desc': '', // empty
        'actions.save': 'Speichern',
        'actions.cancel': '', // empty
        'actions.delete': 'Löschen',
      },
      keyCount: 5,
    }
    const comparison = compareLocalizationFiles([enFile, fileWithOnlyEmpty])
    // In fileWithOnlyEmpty, missing is empty, empty keys are 'actions.cancel' and 'app.desc'
    // Alphabetical first empty is 'actions.cancel'
    const target = getFirstProblemKeyForFile('de.json', comparison)
    expect(target).toEqual({
      key: 'actions.cancel',
      mode: 'empty',
    })
  })

  it('14. getFirstProblemKeyForFile returns null if file is 100% complete', () => {
    const comparison = compareLocalizationFiles([enFile, uaFile])
    const target = getFirstProblemKeyForFile('ua.json', comparison)
    expect(target).toBeNull()
  })
})
