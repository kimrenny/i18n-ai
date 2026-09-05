import type { HistoryAction } from './localizationHistory'
import type {
  HistoryFilterCategory,
  HistoryOperationType,
  TranslationHistoryItem,
} from '../types/localizationHistoryView'
import type { JsonValue, ParsedLocalizationFile } from '../types/localization'
import {
  updateSingleKeyInFile,
  deleteKeyFromFile,
  deleteSectionFromFile,
} from './localizationWriter'
import { renameKeyInLocalizationObject } from './localizationKeyRename'
import { flattenLocalizationKeys } from './localizationParser'

export type TranslateFn = (
  key: string,
  options?: Record<string, string | number>
) => string

/**
 * Maps an internal HistoryAction to a consumer-facing TranslationHistoryItem.
 */
export function mapHistoryActionToViewItem(
  action: HistoryAction,
  t?: TranslateFn
): TranslationHistoryItem {
  const opType = resolveOperationType(action)
  const affectedFiles = action.batchChanges && action.batchChanges.length > 0
    ? Array.from(new Set(action.batchChanges.map((c) => c.targetFile)))
    : [action.targetFile]

  const summary = generateSummary(action, opType, t)

  return {
    id: action.id,
    timestamp: action.timestamp,
    type: opType,
    targetFile: action.targetFile,
    targetFilePath: action.targetFilePath,
    key: action.key,
    oldKey: action.oldKey,
    newKey: action.newKey,
    sectionPath: action.sectionPath,
    previousValue: action.previousValue,
    newValue: action.newValue,
    engine: action.engine,
    summary,
    affectedFilesCount: affectedFiles.length,
    affectedFiles,
    canRevert: true,
    action,
  }
}

function resolveOperationType(action: HistoryAction): HistoryOperationType {
  switch (action.type) {
    case 'edit_key':
      return 'edit'
    case 'ai_translate':
      return 'ai_translate'
    case 'free_translate':
      return 'free_translate'
    case 'add_key':
      return 'add_key'
    case 'add_keys':
      return 'add_missing_keys'
    case 'rename_key':
      return 'rename_key'
    case 'delete_key':
      return 'delete_key'
    case 'delete_section':
      return 'delete_section'
    default:
      return 'edit'
  }
}

function generateSummary(
  action: HistoryAction,
  opType: HistoryOperationType,
  t?: TranslateFn
): string {
  const key = action.key || ''
  switch (opType) {
    case 'edit':
      if (t) {
        return t('history.summaryEdit', { key })
      }
      return `Edit ${key}`

    case 'ai_translate':
      if (t) {
        return t('history.summaryAi', { key: key || `${action.count || 1} keys` })
      }
      return `AI translation: ${key || `${action.count || 1} keys`}`

    case 'free_translate':
      if (t) {
        return t('history.summaryFree', { key: key || `${action.count || 1} keys` })
      }
      return `Free translation: ${key || `${action.count || 1} keys`}`

    case 'add_key':
      if (t) {
        return t('history.summaryAddKey', { key })
      }
      return `Add key ${key}`

    case 'add_missing_keys':
      if (t) {
        return t('history.summaryAddMissingKeys', { count: action.count || 1 })
      }
      return `Add missing keys (${action.count || 1} files)`

    case 'rename_key': {
      const oldK = action.oldKey || key
      const newK = action.newKey || key
      if (t) {
        return t('history.summaryRenameKey', { oldKey: oldK, newKey: newK })
      }
      return `Rename ${oldK} → ${newK}`
    }

    case 'delete_key':
      if (t) {
        return t('history.summaryDeleteKey', { key })
      }
      return `Delete ${key}`

    case 'delete_section':
      if (t) {
        return t('history.summaryDeleteSection', {
          section: action.sectionPath || '',
          count: action.count || 0,
        })
      }
      return `Delete section ${action.sectionPath || ''} (${action.count || 0})`

    default:
      return action.description || 'Localization change'
  }
}

/**
 * Formats a timestamp into a friendly human-readable relative time string.
 */
export function formatRelativeTimestamp(
  timestamp: number,
  now = Date.now(),
  t?: TranslateFn
): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000))

  if (elapsedSeconds < 60) {
    return t ? t('history.timeJustNow') : 'Just now'
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) {
    return t
      ? t('history.timeMinutesAgo', { count: elapsedMinutes })
      : `${elapsedMinutes}m ago`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return t
      ? t('history.timeHoursAgo', { count: elapsedHours })
      : `${elapsedHours}h ago`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  return t ? t('history.timeDaysAgo', { count: elapsedDays }) : `${elapsedDays}d ago`
}

/**
 * Filters history items by selected category.
 */
export function filterHistoryItems(
  items: TranslationHistoryItem[],
  filter: HistoryFilterCategory
): TranslationHistoryItem[] {
  switch (filter) {
    case 'edits':
      return items.filter((item) => item.type === 'edit')
    case 'keys':
      return items.filter(
        (item) =>
          item.type === 'add_key' ||
          item.type === 'add_missing_keys' ||
          item.type === 'rename_key'
      )
    case 'deletions':
      return items.filter(
        (item) => item.type === 'delete_key' || item.type === 'delete_section'
      )
    case 'ai':
      return items.filter(
        (item) => item.type === 'ai_translate' || item.type === 'free_translate'
      )
    case 'all':
    default:
      return items
  }
}

/**
 * Extracts a subtree value from a raw JSON record given a dot-separated section path.
 */
function extractSubtree(
  raw: Record<string, JsonValue> | undefined,
  path: string
): JsonValue | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined
  }
  if (Object.prototype.hasOwnProperty.call(raw, path)) {
    return raw[path]
  }
  const segments = path.split('.')
  let current: JsonValue = raw
  for (const seg of segments) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      if (Object.prototype.hasOwnProperty.call(current, seg)) {
        current = (current as Record<string, JsonValue>)[seg]
      } else {
        return undefined
      }
    } else {
      return undefined
    }
  }
  return current
}

/**
 * Computes targeted file changes required to revert a history action safely,
 * applying reverse mutations against current in-memory parsed file data.
 * This guarantees that newer changes to unrelated keys are preserved.
 */
export function computeRevertFileChanges(
  action: HistoryAction,
  parsedFiles: readonly ParsedLocalizationFile[]
): { path: string; content: string }[] {
  const fileMap = new Map<string, ParsedLocalizationFile>()
  for (const f of parsedFiles) {
    fileMap.set(f.filename, f)
    fileMap.set(f.path, f)
  }

  const results: { path: string; content: string }[] = []

  switch (action.type) {
    case 'edit_key': {
      const file = fileMap.get(action.targetFile) || fileMap.get(action.targetFilePath)
      if (!file) {
        return [
          {
            path: action.targetFilePath,
            content: JSON.stringify(action.beforeRawJson, null, 2) + '\n',
          },
        ]
      }
      if (!action.key) return []

      if (action.previousValue === undefined) {
        const { formattedJson } = deleteKeyFromFile(file.raw, action.key)
        return [{ path: file.path, content: formattedJson }]
      } else {
        const { formattedJson } = updateSingleKeyInFile(
          file.raw,
          action.key,
          action.previousValue
        )
        return [{ path: file.path, content: formattedJson }]
      }
    }

    case 'ai_translate':
    case 'free_translate': {
      if (action.batchItems && action.batchItems.length > 0) {
        const changesByFile = new Map<
          string,
          { file: ParsedLocalizationFile; currentRaw: JsonValue }
        >()
        for (const item of action.batchItems) {
          const file = fileMap.get(item.targetFile) || fileMap.get(item.targetFilePath)
          if (!file) continue
          if (!changesByFile.has(file.path)) {
            changesByFile.set(file.path, {
              file,
              currentRaw: JSON.parse(JSON.stringify(file.raw)),
            })
          }
          const entry = changesByFile.get(file.path)!
          if (item.previousValue === undefined) {
            const { updatedRaw } = deleteKeyFromFile(entry.currentRaw, item.key)
            entry.currentRaw = updatedRaw
          } else {
            const { updatedRaw } = updateSingleKeyInFile(
              entry.currentRaw,
              item.key,
              item.previousValue
            )
            entry.currentRaw = updatedRaw
          }
        }
        for (const { file, currentRaw } of changesByFile.values()) {
          results.push({
            path: file.path,
            content: JSON.stringify(currentRaw, null, 2) + '\n',
          })
        }
        return results
      }

      // Single item
      const file = fileMap.get(action.targetFile) || fileMap.get(action.targetFilePath)
      if (!file) {
        return [
          {
            path: action.targetFilePath,
            content: JSON.stringify(action.beforeRawJson, null, 2) + '\n',
          },
        ]
      }
      if (!action.key) return []

      if (action.previousValue === undefined) {
        const { formattedJson } = deleteKeyFromFile(file.raw, action.key)
        return [{ path: file.path, content: formattedJson }]
      } else {
        const { formattedJson } = updateSingleKeyInFile(
          file.raw,
          action.key,
          action.previousValue
        )
        return [{ path: file.path, content: formattedJson }]
      }
    }

    case 'add_key': {
      const targetFiles =
        action.batchChanges && action.batchChanges.length > 0
          ? action.batchChanges.map((c) => ({
              filename: c.targetFile,
              path: c.targetFilePath,
            }))
          : [{ filename: action.targetFile, path: action.targetFilePath }]

      for (const target of targetFiles) {
        const file = fileMap.get(target.filename) || fileMap.get(target.path)
        if (!file) continue
        if (action.key) {
          const { formattedJson } = deleteKeyFromFile(file.raw, action.key)
          results.push({ path: file.path, content: formattedJson })
        }
      }
      return results
    }

    case 'add_keys': {
      if (action.batchItems && action.batchItems.length > 0) {
        const changesByFile = new Map<
          string,
          { file: ParsedLocalizationFile; currentRaw: JsonValue }
        >()
        for (const item of action.batchItems) {
          const file = fileMap.get(item.targetFile) || fileMap.get(item.targetFilePath)
          if (!file) continue
          if (!changesByFile.has(file.path)) {
            changesByFile.set(file.path, {
              file,
              currentRaw: JSON.parse(JSON.stringify(file.raw)),
            })
          }
          const entry = changesByFile.get(file.path)!
          const { updatedRaw } = deleteKeyFromFile(entry.currentRaw, item.key)
          entry.currentRaw = updatedRaw
        }
        for (const { file, currentRaw } of changesByFile.values()) {
          results.push({
            path: file.path,
            content: JSON.stringify(currentRaw, null, 2) + '\n',
          })
        }
        return results
      }

      if (action.batchChanges && action.batchChanges.length > 0) {
        for (const change of action.batchChanges) {
          const file = fileMap.get(change.targetFile) || fileMap.get(change.targetFilePath)
          if (!file) continue
          const beforeKeys = Object.keys(flattenLocalizationKeys(change.beforeRawJson))
          const afterKeys = Object.keys(flattenLocalizationKeys(change.afterRawJson))
          const addedKeys = afterKeys.filter((k) => !beforeKeys.includes(k))

          let currentRaw: JsonValue = JSON.parse(JSON.stringify(file.raw))
          for (const k of addedKeys) {
            const { updatedRaw } = deleteKeyFromFile(currentRaw, k)
            currentRaw = updatedRaw
          }
          results.push({
            path: file.path,
            content: JSON.stringify(currentRaw, null, 2) + '\n',
          })
        }
        return results
      }
      return []
    }

    case 'rename_key': {
      const oldK = action.oldKey
      const newK = action.newKey || action.key
      if (!oldK || !newK) return []

      const targetFiles =
        action.batchChanges && action.batchChanges.length > 0
          ? action.batchChanges.map((c) => ({
              filename: c.targetFile,
              path: c.targetFilePath,
            }))
          : [{ filename: action.targetFile, path: action.targetFilePath }]

      for (const target of targetFiles) {
        const file = fileMap.get(target.filename) || fileMap.get(target.path)
        if (!file) continue
        try {
          const { formattedJson, renamed } = renameKeyInLocalizationObject(
            file.raw,
            newK,
            oldK
          )
          if (renamed) {
            results.push({ path: file.path, content: formattedJson })
          }
        } catch {
          // If error renaming, skip
        }
      }
      return results
    }

    case 'delete_key': {
      const file = fileMap.get(action.targetFile) || fileMap.get(action.targetFilePath)
      if (!file || !action.key) {
        return [
          {
            path: action.targetFilePath,
            content: JSON.stringify(action.beforeRawJson, null, 2) + '\n',
          },
        ]
      }
      const valToRestore =
        action.previousValue !== undefined ? action.previousValue : ''
      const { formattedJson } = updateSingleKeyInFile(
        file.raw,
        action.key,
        valToRestore
      )
      return [{ path: file.path, content: formattedJson }]
    }

    case 'delete_section': {
      const file = fileMap.get(action.targetFile) || fileMap.get(action.targetFilePath)
      if (!file || !action.sectionPath) {
        return [
          {
            path: action.targetFilePath,
            content: JSON.stringify(action.beforeRawJson, null, 2) + '\n',
          },
        ]
      }
      const sectionSubtree = extractSubtree(action.beforeRawJson, action.sectionPath)
      if (sectionSubtree !== undefined) {
        const { formattedJson } = updateSingleKeyInFile(
          file.raw,
          action.sectionPath,
          sectionSubtree
        )
        return [{ path: file.path, content: formattedJson }]
      }
      // Flat keys fallback
      const prefixDot = `${action.sectionPath}.`
      let currentRaw: JsonValue = JSON.parse(JSON.stringify(file.raw))
      let anyAdded = false
      if (action.beforeRawJson && typeof action.beforeRawJson === 'object') {
        for (const [k, v] of Object.entries(action.beforeRawJson)) {
          if (k.startsWith(prefixDot) || k === action.sectionPath) {
            const { updatedRaw } = updateSingleKeyInFile(currentRaw, k, v)
            currentRaw = updatedRaw
            anyAdded = true
          }
        }
      }
      if (anyAdded) {
        return [
          {
            path: file.path,
            content: JSON.stringify(currentRaw, null, 2) + '\n',
          },
        ]
      }
      return [
        {
          path: file.path,
          content: JSON.stringify(action.beforeRawJson, null, 2) + '\n',
        },
      ]
    }

    default:
      return [
        {
          path: action.targetFilePath,
          content: JSON.stringify(action.beforeRawJson, null, 2) + '\n',
        },
      ]
  }
}

/**
 * Computes targeted file changes required to re-apply (redo) a history action safely,
 * applying forward mutations against current in-memory parsed file data.
 */
export function computeRedoFileChanges(
  action: HistoryAction,
  parsedFiles: readonly ParsedLocalizationFile[]
): { path: string; content: string }[] {
  const fileMap = new Map<string, ParsedLocalizationFile>()
  for (const f of parsedFiles) {
    fileMap.set(f.filename, f)
    fileMap.set(f.path, f)
  }

  const results: { path: string; content: string }[] = []

  switch (action.type) {
    case 'edit_key':
    case 'ai_translate':
    case 'free_translate': {
      if (action.batchItems && action.batchItems.length > 0) {
        const changesByFile = new Map<
          string,
          { file: ParsedLocalizationFile; currentRaw: JsonValue }
        >()
        for (const item of action.batchItems) {
          const file = fileMap.get(item.targetFile) || fileMap.get(item.targetFilePath)
          if (!file) continue
          if (!changesByFile.has(file.path)) {
            changesByFile.set(file.path, {
              file,
              currentRaw: JSON.parse(JSON.stringify(file.raw)),
            })
          }
          const entry = changesByFile.get(file.path)!
          const { updatedRaw } = updateSingleKeyInFile(
            entry.currentRaw,
            item.key,
            item.newValue || ''
          )
          entry.currentRaw = updatedRaw
        }
        for (const { file, currentRaw } of changesByFile.values()) {
          results.push({
            path: file.path,
            content: JSON.stringify(currentRaw, null, 2) + '\n',
          })
        }
        return results
      }

      const file = fileMap.get(action.targetFile) || fileMap.get(action.targetFilePath)
      if (!file || !action.key) {
        return [
          {
            path: action.targetFilePath,
            content: JSON.stringify(action.afterRawJson, null, 2) + '\n',
          },
        ]
      }
      const { formattedJson } = updateSingleKeyInFile(
        file.raw,
        action.key,
        action.newValue || ''
      )
      return [{ path: file.path, content: formattedJson }]
    }

    case 'add_key': {
      if (action.batchItems && action.batchItems.length > 0) {
        for (const item of action.batchItems) {
          const file = fileMap.get(item.targetFile) || fileMap.get(item.targetFilePath)
          if (!file) continue
          const { formattedJson } = updateSingleKeyInFile(
            file.raw,
            item.key,
            item.newValue || ''
          )
          results.push({ path: file.path, content: formattedJson })
        }
        return results
      }

      const targetFiles =
        action.batchChanges && action.batchChanges.length > 0
          ? action.batchChanges.map((c) => ({
              filename: c.targetFile,
              path: c.targetFilePath,
            }))
          : [{ filename: action.targetFile, path: action.targetFilePath }]

      for (const target of targetFiles) {
        const file = fileMap.get(target.filename) || fileMap.get(target.path)
        if (!file || !action.key) continue
        const { formattedJson } = updateSingleKeyInFile(
          file.raw,
          action.key,
          action.newValue || ''
        )
        results.push({ path: file.path, content: formattedJson })
      }
      return results
    }

    case 'add_keys': {
      if (action.batchItems && action.batchItems.length > 0) {
        const changesByFile = new Map<
          string,
          { file: ParsedLocalizationFile; currentRaw: JsonValue }
        >()
        for (const item of action.batchItems) {
          const file = fileMap.get(item.targetFile) || fileMap.get(item.targetFilePath)
          if (!file) continue
          if (!changesByFile.has(file.path)) {
            changesByFile.set(file.path, {
              file,
              currentRaw: JSON.parse(JSON.stringify(file.raw)),
            })
          }
          const entry = changesByFile.get(file.path)!
          const { updatedRaw } = updateSingleKeyInFile(
            entry.currentRaw,
            item.key,
            item.newValue || ''
          )
          entry.currentRaw = updatedRaw
        }
        for (const { file, currentRaw } of changesByFile.values()) {
          results.push({
            path: file.path,
            content: JSON.stringify(currentRaw, null, 2) + '\n',
          })
        }
        return results
      }

      if (action.batchChanges && action.batchChanges.length > 0) {
        return action.batchChanges.map((c) => ({
          path: c.targetFilePath,
          content: JSON.stringify(c.afterRawJson, null, 2) + '\n',
        }))
      }
      return []
    }

    case 'rename_key': {
      const oldK = action.oldKey
      const newK = action.newKey || action.key
      if (!oldK || !newK) return []

      const targetFiles =
        action.batchChanges && action.batchChanges.length > 0
          ? action.batchChanges.map((c) => ({
              filename: c.targetFile,
              path: c.targetFilePath,
            }))
          : [{ filename: action.targetFile, path: action.targetFilePath }]

      for (const target of targetFiles) {
        const file = fileMap.get(target.filename) || fileMap.get(target.path)
        if (!file) continue
        try {
          const { formattedJson, renamed } = renameKeyInLocalizationObject(
            file.raw,
            oldK,
            newK
          )
          if (renamed) {
            results.push({ path: file.path, content: formattedJson })
          }
        } catch {
          // If error renaming, skip
        }
      }
      return results
    }

    case 'delete_key': {
      const file = fileMap.get(action.targetFile) || fileMap.get(action.targetFilePath)
      if (!file || !action.key) {
        return [
          {
            path: action.targetFilePath,
            content: JSON.stringify(action.afterRawJson, null, 2) + '\n',
          },
        ]
      }
      const { formattedJson } = deleteKeyFromFile(file.raw, action.key)
      return [{ path: file.path, content: formattedJson }]
    }

    case 'delete_section': {
      const file = fileMap.get(action.targetFile) || fileMap.get(action.targetFilePath)
      if (!file || !action.sectionPath) {
        return [
          {
            path: action.targetFilePath,
            content: JSON.stringify(action.afterRawJson, null, 2) + '\n',
          },
        ]
      }
      const { formattedJson } = deleteSectionFromFile(file.raw, action.sectionPath)
      return [{ path: file.path, content: formattedJson }]
    }

    default:
      return [
        {
          path: action.targetFilePath,
          content: JSON.stringify(action.afterRawJson, null, 2) + '\n',
        },
      ]
  }
}
