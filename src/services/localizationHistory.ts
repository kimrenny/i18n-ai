import type { JsonValue } from '../types/localization'

export type LocalizationMutationType =
  | 'delete_key'
  | 'delete_section'
  | 'edit_key'
  | 'add_keys'
  | 'add_key'

export interface HistoryFileChange {
  targetFile: string
  targetFilePath: string
  beforeRawJson: Record<string, JsonValue>
  afterRawJson: Record<string, JsonValue>
}

export interface HistoryAction {
  id: string
  timestamp: number
  targetFile: string
  targetFilePath: string
  type: LocalizationMutationType
  description: string
  key?: string
  sectionPath?: string
  count?: number
  beforeRawJson: Record<string, JsonValue>
  afterRawJson: Record<string, JsonValue>
  batchChanges?: HistoryFileChange[]
}

function isActionMatchingFile(action: HistoryAction, targetFile: string): boolean {
  if (action.targetFile === targetFile) return true
  if (action.batchChanges && action.batchChanges.some((c) => c.targetFile === targetFile)) {
    return true
  }
  return false
}

export class LocalizationHistoryManager {
  private undoStack: HistoryAction[] = []
  private redoStack: HistoryAction[] = []
  private readonly maxHistorySize: number

  constructor(maxHistorySize = 50) {
    this.maxHistorySize = maxHistorySize
  }

  /**
   * Pushes a new mutation action onto the undo stack and clears the redo branch.
   */
  push(action: Omit<HistoryAction, 'id' | 'timestamp'>): HistoryAction {
    const fullAction: HistoryAction = {
      ...action,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    }

    this.undoStack.push(fullAction)
    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift()
    }

    // New mutation always clears redo branch
    this.redoStack = []

    return fullAction
  }

  /**
   * Checks if an undo operation is available (optionally scoped to a specific file).
   */
  canUndo(targetFile?: string): boolean {
    if (!targetFile) {
      return this.undoStack.length > 0
    }
    return this.undoStack.some((a) => isActionMatchingFile(a, targetFile))
  }

  /**
   * Checks if a redo operation is available (optionally scoped to a specific file).
   */
  canRedo(targetFile?: string): boolean {
    if (!targetFile) {
      return this.redoStack.length > 0
    }
    return this.redoStack.some((a) => isActionMatchingFile(a, targetFile))
  }

  /**
   * Undoes the last mutation (or the last mutation matching targetFile if specified),
   * moves it onto the redo stack, and returns the action to revert.
   */
  undo(targetFile?: string): HistoryAction | null {
    if (this.undoStack.length === 0) return null

    if (!targetFile) {
      const action = this.undoStack.pop()!
      this.redoStack.push(action)
      return action
    }

    // Find last action matching targetFile
    const idx = findLastIndex(this.undoStack, (a) => isActionMatchingFile(a, targetFile))
    if (idx === -1) return null

    const [action] = this.undoStack.splice(idx, 1)
    this.redoStack.push(action)
    return action
  }

  /**
   * Redoes the last undone mutation, moves it onto the undo stack, and returns the action to re-apply.
   */
  redo(targetFile?: string): HistoryAction | null {
    if (this.redoStack.length === 0) return null

    if (!targetFile) {
      const action = this.redoStack.pop()!
      this.undoStack.push(action)
      return action
    }

    const idx = findLastIndex(this.redoStack, (a) => isActionMatchingFile(a, targetFile))
    if (idx === -1) return null

    const [action] = this.redoStack.splice(idx, 1)
    this.undoStack.push(action)
    return action
  }

  /**
   * Inspects the top action of the undo stack without popping.
   */
  peekUndo(targetFile?: string): HistoryAction | null {
    if (this.undoStack.length === 0) return null
    if (!targetFile) {
      return this.undoStack[this.undoStack.length - 1]
    }
    const idx = findLastIndex(this.undoStack, (a) => isActionMatchingFile(a, targetFile))
    return idx !== -1 ? this.undoStack[idx] : null
  }

  /**
   * Inspects the top action of the redo stack without popping.
   */
  peekRedo(targetFile?: string): HistoryAction | null {
    if (this.redoStack.length === 0) return null
    if (!targetFile) {
      return this.redoStack[this.redoStack.length - 1]
    }
    const idx = findLastIndex(this.redoStack, (a) => isActionMatchingFile(a, targetFile))
    return idx !== -1 ? this.redoStack[idx] : null
  }

  /**
   * Returns current counts for status displays.
   */
  getCounts(targetFile?: string): { undoCount: number; redoCount: number } {
    if (!targetFile) {
      return {
        undoCount: this.undoStack.length,
        redoCount: this.redoStack.length,
      }
    }
    return {
      undoCount: this.undoStack.filter((a) => isActionMatchingFile(a, targetFile)).length,
      redoCount: this.redoStack.filter((a) => isActionMatchingFile(a, targetFile)).length,
    }
  }

  /**
   * Clears the entire history stack.
   */
  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}

function findLastIndex<T>(array: T[], predicate: (item: T) => boolean): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) return i
  }
  return -1
}
