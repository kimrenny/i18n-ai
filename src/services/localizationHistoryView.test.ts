import { describe, it, expect } from 'vitest'
import {
  mapHistoryActionToViewItem,
  formatRelativeTimestamp,
  filterHistoryItems,
  computeRevertFileChanges,
  computeRedoFileChanges,
} from './localizationHistoryView'
import type { HistoryAction } from './localizationHistory'
import type { TranslationHistoryItem } from '../types/localizationHistoryView'

describe('localizationHistoryView service', () => {
  const baseAction: HistoryAction = {
    id: 'act-1',
    timestamp: 1700000000000,
    targetFile: 'uk.json',
    targetFilePath: '/workspace/locales/uk.json',
    type: 'edit_key',
    description: 'Edit ADMIN.DASHBOARD.TITLE',
    key: 'ADMIN.DASHBOARD.TITLE',
    previousValue: 'Панель',
    newValue: 'Панель керування',
    beforeRawJson: { ADMIN: { DASHBOARD: { TITLE: 'Панель' } } },
    afterRawJson: { ADMIN: { DASHBOARD: { TITLE: 'Панель керування' } } },
  }

  describe('mapHistoryActionToViewItem', () => {
    it('maps edit action correctly', () => {
      const item = mapHistoryActionToViewItem(baseAction)
      expect(item.id).toBe('act-1')
      expect(item.type).toBe('edit')
      expect(item.targetFile).toBe('uk.json')
      expect(item.key).toBe('ADMIN.DASHBOARD.TITLE')
      expect(item.previousValue).toBe('Панель')
      expect(item.newValue).toBe('Панель керування')
      expect(item.affectedFiles).toEqual(['uk.json'])
      expect(item.affectedFilesCount).toBe(1)
      expect(item.summary).toContain('ADMIN.DASHBOARD.TITLE')
    })

    it('maps batch add keys action with multiple files', () => {
      const batchAction: HistoryAction = {
        ...baseAction,
        id: 'act-2',
        type: 'add_key',
        batchChanges: [
          {
            targetFile: 'en.json',
            targetFilePath: '/workspace/locales/en.json',
            beforeRawJson: {},
            afterRawJson: { NEW_KEY: 'Hello' },
          },
          {
            targetFile: 'uk.json',
            targetFilePath: '/workspace/locales/uk.json',
            beforeRawJson: {},
            afterRawJson: { NEW_KEY: 'Привіт' },
          },
        ],
      }

      const item = mapHistoryActionToViewItem(batchAction)
      expect(item.type).toBe('add_key')
      expect(item.affectedFiles).toEqual(['en.json', 'uk.json'])
      expect(item.affectedFilesCount).toBe(2)
    })

    it('maps AI and Free translation types', () => {
      const aiAction: HistoryAction = { ...baseAction, type: 'ai_translate', engine: 'ai' }
      const freeAction: HistoryAction = { ...baseAction, type: 'free_translate', engine: 'free' }

      expect(mapHistoryActionToViewItem(aiAction).type).toBe('ai_translate')
      expect(mapHistoryActionToViewItem(freeAction).type).toBe('free_translate')
    })

    it('maps rename and delete actions', () => {
      const renameAction: HistoryAction = {
        ...baseAction,
        type: 'rename_key',
        oldKey: 'OLD.KEY',
        newKey: 'NEW.KEY',
      }
      const deleteAction: HistoryAction = {
        ...baseAction,
        type: 'delete_key',
        key: 'OLD.KEY',
      }
      const sectionAction: HistoryAction = {
        ...baseAction,
        type: 'delete_section',
        sectionPath: 'ADMIN.SETTINGS',
        count: 5,
      }

      const renameItem = mapHistoryActionToViewItem(renameAction)
      expect(renameItem.type).toBe('rename_key')
      expect(renameItem.oldKey).toBe('OLD.KEY')
      expect(renameItem.newKey).toBe('NEW.KEY')

      const deleteItem = mapHistoryActionToViewItem(deleteAction)
      expect(deleteItem.type).toBe('delete_key')

      const sectionItem = mapHistoryActionToViewItem(sectionAction)
      expect(sectionItem.type).toBe('delete_section')
      expect(sectionItem.sectionPath).toBe('ADMIN.SETTINGS')
    })
  })

  describe('formatRelativeTimestamp', () => {
    const now = 1700000000000

    it('formats just now for < 60s', () => {
      expect(formatRelativeTimestamp(now - 10000, now)).toBe('Just now')
      expect(formatRelativeTimestamp(now - 59000, now)).toBe('Just now')
    })

    it('formats minutes ago for 1-59m', () => {
      expect(formatRelativeTimestamp(now - 60000, now)).toBe('1m ago')
      expect(formatRelativeTimestamp(now - 120000, now)).toBe('2m ago')
      expect(formatRelativeTimestamp(now - 1800000, now)).toBe('30m ago')
    })

    it('formats hours ago for 1-23h', () => {
      expect(formatRelativeTimestamp(now - 3600000, now)).toBe('1h ago')
      expect(formatRelativeTimestamp(now - 7200000, now)).toBe('2h ago')
    })

    it('formats days ago for >= 24h', () => {
      expect(formatRelativeTimestamp(now - 86400000, now)).toBe('1d ago')
      expect(formatRelativeTimestamp(now - 172800000, now)).toBe('2d ago')
    })
  })

  describe('filterHistoryItems', () => {
    const items: TranslationHistoryItem[] = [
      { ...mapHistoryActionToViewItem(baseAction), id: '1', type: 'edit' },
      { ...mapHistoryActionToViewItem(baseAction), id: '2', type: 'ai_translate' },
      { ...mapHistoryActionToViewItem(baseAction), id: '3', type: 'free_translate' },
      { ...mapHistoryActionToViewItem(baseAction), id: '4', type: 'add_key' },
      { ...mapHistoryActionToViewItem(baseAction), id: '5', type: 'add_missing_keys' },
      { ...mapHistoryActionToViewItem(baseAction), id: '6', type: 'rename_key' },
      { ...mapHistoryActionToViewItem(baseAction), id: '7', type: 'delete_key' },
      { ...mapHistoryActionToViewItem(baseAction), id: '8', type: 'delete_section' },
    ]

    it('returns all items when filter is all', () => {
      expect(filterHistoryItems(items, 'all')).toHaveLength(8)
    })

    it('filters edits only', () => {
      const filtered = filterHistoryItems(items, 'edits')
      expect(filtered.map((i) => i.id)).toEqual(['1'])
    })

    it('filters keys operations (add, add_missing, rename)', () => {
      const filtered = filterHistoryItems(items, 'keys')
      expect(filtered.map((i) => i.id)).toEqual(['4', '5', '6'])
    })

    it('filters deletions (delete_key, delete_section)', () => {
      const filtered = filterHistoryItems(items, 'deletions')
      expect(filtered.map((i) => i.id)).toEqual(['7', '8'])
    })

    it('filters AI and Free translation', () => {
      const filtered = filterHistoryItems(items, 'ai')
      expect(filtered.map((i) => i.id)).toEqual(['2', '3'])
    })
  })

  describe('computeRevertFileChanges & computeRedoFileChanges', () => {
    const parsedFiles: import('../types/localization').ParsedLocalizationFile[] = [
      {
        filename: 'en.json',
        path: '/workspace/locales/en.json',
        raw: {
          COMMON: { SAVE: 'Save', CANCEL: 'Cancel' },
          NEWER_KEY: 'Preserved New Value',
        },
        keys: {
          'COMMON.SAVE': 'Save',
          'COMMON.CANCEL': 'Cancel',
          NEWER_KEY: 'Preserved New Value',
        },
        keyCount: 3,
      },
      {
        filename: 'uk.json',
        path: '/workspace/locales/uk.json',
        raw: {
          COMMON: { SAVE: 'Зберегти' },
          NEWER_KEY: 'Збережене нове значення',
        },
        keys: {
          'COMMON.SAVE': 'Зберегти',
          NEWER_KEY: 'Збережене нове значення',
        },
        keyCount: 2,
      },
    ]

    it('safely reverts an AI translation without wiping newer keys', () => {
      const aiAction: HistoryAction = {
        id: 'ai-1',
        timestamp: Date.now(),
        targetFile: 'uk.json',
        targetFilePath: '/workspace/locales/uk.json',
        type: 'ai_translate',
        description: 'AI translate COMMON.CANCEL',
        key: 'COMMON.CANCEL',
        previousValue: undefined, // was previously missing
        newValue: 'Скасувати',
        beforeRawJson: { COMMON: { SAVE: 'Зберегти' } },
        afterRawJson: { COMMON: { SAVE: 'Зберегти', CANCEL: 'Скасувати' } },
      }

      const files = [
        ...parsedFiles.slice(0, 1),
        {
          filename: 'uk.json',
          path: '/workspace/locales/uk.json',
          raw: {
            COMMON: { SAVE: 'Зберегти', CANCEL: 'Скасувати' },
            NEWER_KEY: 'Збережене нове значення',
          },
          keys: {
            'COMMON.SAVE': 'Зберегти',
            'COMMON.CANCEL': 'Скасувати',
            NEWER_KEY: 'Збережене нове значення',
          },
          keyCount: 3,
        },
      ]

      const revertChanges = computeRevertFileChanges(aiAction, files)
      expect(revertChanges).toHaveLength(1)
      expect(revertChanges[0].path).toBe('/workspace/locales/uk.json')

      const parsedJson = JSON.parse(revertChanges[0].content)
      // CANCEL was deleted
      expect(parsedJson.COMMON.CANCEL).toBeUndefined()
      // SAVE is still there
      expect(parsedJson.COMMON.SAVE).toBe('Зберегти')
      // Newer key is completely preserved!
      expect(parsedJson.NEWER_KEY).toBe('Збережене нове значення')
    })

    it('safely redoes an AI translation', () => {
      const aiAction: HistoryAction = {
        id: 'ai-1',
        timestamp: Date.now(),
        targetFile: 'uk.json',
        targetFilePath: '/workspace/locales/uk.json',
        type: 'ai_translate',
        description: 'AI translate COMMON.CANCEL',
        key: 'COMMON.CANCEL',
        previousValue: undefined,
        newValue: 'Скасувати',
        beforeRawJson: { COMMON: { SAVE: 'Зберегти' } },
        afterRawJson: { COMMON: { SAVE: 'Зберегти', CANCEL: 'Скасувати' } },
      }

      const redoChanges = computeRedoFileChanges(aiAction, parsedFiles)
      expect(redoChanges).toHaveLength(1)
      const parsedJson = JSON.parse(redoChanges[0].content)
      expect(parsedJson.COMMON.CANCEL).toBe('Скасувати')
      expect(parsedJson.NEWER_KEY).toBe('Збережене нове значення')
    })

    it('reverts and redoes rename_key accurately across multiple files', () => {
      const renameAction: HistoryAction = {
        id: 'ren-1',
        timestamp: Date.now(),
        targetFile: 'en.json',
        targetFilePath: '/workspace/locales/en.json',
        type: 'rename_key',
        description: 'Rename COMMON.SAVE to COMMON.STORE',
        oldKey: 'COMMON.SAVE',
        newKey: 'COMMON.STORE',
        key: 'COMMON.STORE',
        beforeRawJson: {},
        afterRawJson: {},
        batchChanges: [
          {
            targetFile: 'en.json',
            targetFilePath: '/workspace/locales/en.json',
            beforeRawJson: {},
            afterRawJson: {},
          },
          {
            targetFile: 'uk.json',
            targetFilePath: '/workspace/locales/uk.json',
            beforeRawJson: {},
            afterRawJson: {},
          },
        ],
      }

      // Live state has COMMON.STORE
      const currentFiles = [
        {
          filename: 'en.json',
          path: '/workspace/locales/en.json',
          raw: { COMMON: { STORE: 'Save' } },
          keys: { 'COMMON.STORE': 'Save' },
          keyCount: 1,
        },
        {
          filename: 'uk.json',
          path: '/workspace/locales/uk.json',
          raw: { COMMON: { STORE: 'Зберегти' } },
          keys: { 'COMMON.STORE': 'Зберегти' },
          keyCount: 1,
        },
      ]

      const revertChanges = computeRevertFileChanges(renameAction, currentFiles)
      expect(revertChanges).toHaveLength(2)
      const enReverted = JSON.parse(revertChanges.find((c) => c.path.includes('en.json'))!.content)
      const ukReverted = JSON.parse(revertChanges.find((c) => c.path.includes('uk.json'))!.content)

      expect(enReverted.COMMON.SAVE).toBe('Save')
      expect(enReverted.COMMON.STORE).toBeUndefined()
      expect(ukReverted.COMMON.SAVE).toBe('Зберегти')
      expect(ukReverted.COMMON.STORE).toBeUndefined()
    })

    it('reverts and redoes delete_section accurately', () => {
      const deleteSectionAction: HistoryAction = {
        id: 'del-sec-1',
        timestamp: Date.now(),
        targetFile: 'en.json',
        targetFilePath: '/workspace/locales/en.json',
        type: 'delete_section',
        description: 'Delete section COMMON',
        sectionPath: 'COMMON',
        beforeRawJson: { COMMON: { SAVE: 'Save', CANCEL: 'Cancel' } },
        afterRawJson: {},
      }

      const fileWithoutCommon = [
        {
          filename: 'en.json',
          path: '/workspace/locales/en.json',
          raw: { OTHER: { HELLO: 'Hello' } },
          keys: { 'OTHER.HELLO': 'Hello' },
          keyCount: 1,
        },
      ]

      const revertChanges = computeRevertFileChanges(deleteSectionAction, fileWithoutCommon)
      expect(revertChanges).toHaveLength(1)
      const parsedJson = JSON.parse(revertChanges[0].content)
      expect(parsedJson.COMMON.SAVE).toBe('Save')
      expect(parsedJson.COMMON.CANCEL).toBe('Cancel')
      expect(parsedJson.OTHER.HELLO).toBe('Hello')
    })
  })
})
