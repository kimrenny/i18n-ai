import { describe, it, expect, beforeEach } from 'vitest'
import { LocalizationHistoryManager } from './localizationHistory'

describe('LocalizationHistoryManager', () => {
  let manager: LocalizationHistoryManager

  beforeEach(() => {
    manager = new LocalizationHistoryManager()
  })

  it('starts with empty undo and redo stacks', () => {
    expect(manager.canUndo()).toBe(false)
    expect(manager.canRedo()).toBe(false)
    expect(manager.undo()).toBeNull()
    expect(manager.redo()).toBeNull()
  })

  it('pushes an action and allows undoing it', () => {
    const action = manager.push({
      targetFile: 'ru.json',
      targetFilePath: '/path/ru.json',
      type: 'delete_key',
      description: 'Delete key AUTH.LOGIN',
      key: 'AUTH.LOGIN',
      beforeRawJson: { AUTH: { LOGIN: 'Войти' } },
      afterRawJson: { AUTH: {} },
    })

    expect(manager.canUndo()).toBe(true)
    expect(manager.canRedo()).toBe(false)
    expect(manager.canUndo('ru.json')).toBe(true)
    expect(manager.canUndo('en.json')).toBe(false)

    const undone = manager.undo()
    expect(undone?.id).toBe(action.id)
    expect(undone?.beforeRawJson).toEqual({ AUTH: { LOGIN: 'Войти' } })

    expect(manager.canUndo()).toBe(false)
    expect(manager.canRedo()).toBe(true)
  })

  it('supports redoing an undone action', () => {
    const action = manager.push({
      targetFile: 'ru.json',
      targetFilePath: '/path/ru.json',
      type: 'delete_key',
      description: 'Delete key AUTH.LOGIN',
      key: 'AUTH.LOGIN',
      beforeRawJson: { AUTH: { LOGIN: 'Войти' } },
      afterRawJson: { AUTH: {} },
    })

    manager.undo()
    expect(manager.canRedo()).toBe(true)

    const redone = manager.redo()
    expect(redone?.id).toBe(action.id)
    expect(redone?.afterRawJson).toEqual({ AUTH: {} })

    expect(manager.canUndo()).toBe(true)
    expect(manager.canRedo()).toBe(false)
  })

  it('clears redo stack when a new mutation is pushed after undo', () => {
    manager.push({
      targetFile: 'ru.json',
      targetFilePath: '/path/ru.json',
      type: 'delete_key',
      description: 'Action 1',
      beforeRawJson: { A: '1' },
      afterRawJson: {},
    })

    manager.undo()
    expect(manager.canRedo()).toBe(true)

    // New mutation
    manager.push({
      targetFile: 'ru.json',
      targetFilePath: '/path/ru.json',
      type: 'delete_key',
      description: 'Action 2',
      beforeRawJson: { B: '2' },
      afterRawJson: {},
    })

    expect(manager.canRedo()).toBe(false)
    expect(manager.canUndo()).toBe(true)
  })

  it('handles multiple consecutive deletions and undos in LIFO sequence', () => {
    manager.push({
      targetFile: 'ru.json',
      targetFilePath: '/path/ru.json',
      type: 'delete_key',
      description: 'Delete A',
      key: 'A',
      beforeRawJson: { A: '1', B: '2' },
      afterRawJson: { B: '2' },
    })

    manager.push({
      targetFile: 'ru.json',
      targetFilePath: '/path/ru.json',
      type: 'delete_key',
      description: 'Delete B',
      key: 'B',
      beforeRawJson: { B: '2' },
      afterRawJson: {},
    })

    expect(manager.getCounts().undoCount).toBe(2)

    const firstUndo = manager.undo()
    expect(firstUndo?.key).toBe('B')

    const secondUndo = manager.undo()
    expect(secondUndo?.key).toBe('A')

    expect(manager.canUndo()).toBe(false)
    expect(manager.getCounts().redoCount).toBe(2)
  })

  it('scopes actions properly by targetFile', () => {
    manager.push({
      targetFile: 'ru.json',
      targetFilePath: '/path/ru.json',
      type: 'delete_key',
      description: 'Delete in RU',
      key: 'RU.KEY',
      beforeRawJson: {},
      afterRawJson: {},
    })

    manager.push({
      targetFile: 'de.json',
      targetFilePath: '/path/de.json',
      type: 'delete_key',
      description: 'Delete in DE',
      key: 'DE.KEY',
      beforeRawJson: {},
      afterRawJson: {},
    })

    expect(manager.canUndo('ru.json')).toBe(true)
    expect(manager.canUndo('de.json')).toBe(true)
    expect(manager.canUndo('fr.json')).toBe(false)

    const undoneRu = manager.undo('ru.json')
    expect(undoneRu?.targetFile).toBe('ru.json')
    expect(undoneRu?.key).toBe('RU.KEY')

    // de.json should still be available in undo
    expect(manager.canUndo('de.json')).toBe(true)
    expect(manager.canUndo('ru.json')).toBe(false)
  })
})
