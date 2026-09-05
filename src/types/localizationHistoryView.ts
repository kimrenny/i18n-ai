import type { HistoryAction } from '../services/localizationHistory'

export type HistoryOperationType =
  | 'edit'
  | 'ai_translate'
  | 'free_translate'
  | 'add_key'
  | 'rename_key'
  | 'delete_key'
  | 'delete_section'
  | 'add_missing_keys'

export type HistoryFilterCategory = 'all' | 'edits' | 'keys' | 'deletions' | 'ai'

export interface TranslationHistoryItem {
  id: string
  timestamp: number
  type: HistoryOperationType
  targetFile: string
  targetFilePath: string
  key?: string
  oldKey?: string
  newKey?: string
  sectionPath?: string
  previousValue?: string
  newValue?: string
  engine?: string
  summary: string
  affectedFilesCount: number
  affectedFiles: string[]
  canRevert: boolean
  action: HistoryAction
}
