import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LocalizationContextMenu } from './LocalizationContextMenu'
import type { LocalizationTreeNode } from '../../types/localization'

describe('LocalizationContextMenu', () => {
  const sampleLeafNode: LocalizationTreeNode = {
    id: 'AUTH.LOGIN',
    segment: 'LOGIN',
    fullKey: 'AUTH.LOGIN',
    type: 'leaf',
    children: [],
    isPresent: true,
    isMissing: false,
    isEmpty: false,
    isConflict: false,
    value: 'Log In',
    missingInFiles: [],
    presentInFiles: ['en.json'],
  }

  const sampleFolderNode: LocalizationTreeNode = {
    id: 'AUTH',
    segment: 'AUTH',
    fullKey: 'AUTH',
    type: 'folder',
    children: [sampleLeafNode],
    isPresent: true,
    isMissing: false,
    isEmpty: false,
    isConflict: false,
    missingInFiles: [],
    presentInFiles: ['en.json'],
  }

  it('renders nothing when state is null', () => {
    const { container } = render(
      <LocalizationContextMenu
        state={null}
        canUndo={false}
        canRedo={false}
        onDeleteKey={vi.fn()}
        onDeleteSection={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders Delete Entry action for leaf nodes', () => {
    const onDeleteKey = vi.fn()
    const onClose = vi.fn()

    render(
      <LocalizationContextMenu
        state={{
          x: 100,
          y: 100,
          node: sampleLeafNode,
          targetFilename: 'en.json',
        }}
        canUndo={true}
        canRedo={false}
        onDeleteKey={onDeleteKey}
        onDeleteSection={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClose={onClose}
      />
    )

    const deleteBtn = screen.getByRole('menuitem', { name: /delete entry/i })
    expect(deleteBtn).toBeInTheDocument()

    fireEvent.click(deleteBtn)
    expect(onDeleteKey).toHaveBeenCalledWith('AUTH.LOGIN')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders Delete Section action with count for folder nodes', () => {
    const onDeleteSection = vi.fn()
    const onClose = vi.fn()

    render(
      <LocalizationContextMenu
        state={{
          x: 100,
          y: 100,
          node: sampleFolderNode,
          targetFilename: 'en.json',
        }}
        canUndo={false}
        canRedo={true}
        onDeleteKey={vi.fn()}
        onDeleteSection={onDeleteSection}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClose={onClose}
      />
    )

    const deleteSectionBtn = screen.getByRole('menuitem', { name: /delete section \(1 keys\)/i })
    expect(deleteSectionBtn).toBeInTheDocument()

    fireEvent.click(deleteSectionBtn)
    expect(onDeleteSection).toHaveBeenCalledWith('AUTH', sampleFolderNode)
    expect(onClose).toHaveBeenCalled()
  })

  it('handles Undo and Redo actions correctly', () => {
    const onUndo = vi.fn()
    const onRedo = vi.fn()

    render(
      <LocalizationContextMenu
        state={{
          x: 100,
          y: 100,
          node: sampleLeafNode,
          targetFilename: 'en.json',
        }}
        canUndo={true}
        canRedo={true}
        onDeleteKey={vi.fn()}
        onDeleteSection={vi.fn()}
        onUndo={onUndo}
        onRedo={onRedo}
        onClose={vi.fn()}
      />
    )

    const undoBtn = screen.getByRole('menuitem', { name: /undo/i })
    expect(undoBtn).not.toBeDisabled()
    fireEvent.click(undoBtn)
    expect(onUndo).toHaveBeenCalled()

    const redoBtn = screen.getByRole('menuitem', { name: /redo/i })
    expect(redoBtn).not.toBeDisabled()
    fireEvent.click(redoBtn)
    expect(onRedo).toHaveBeenCalled()
  })

  it('renders Rename Key action for present leaf nodes and triggers callback', () => {
    const onRenameKey = vi.fn()
    const onClose = vi.fn()

    render(
      <LocalizationContextMenu
        state={{
          x: 100,
          y: 100,
          node: sampleLeafNode,
          targetFilename: 'en.json',
        }}
        canUndo={false}
        canRedo={false}
        onRenameKey={onRenameKey}
        onDeleteKey={vi.fn()}
        onDeleteSection={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClose={onClose}
      />
    )

    const renameBtn = screen.getByRole('menuitem', { name: /rename key/i })
    expect(renameBtn).toBeInTheDocument()
    expect(renameBtn).not.toBeDisabled()

    fireEvent.click(renameBtn)
    expect(onRenameKey).toHaveBeenCalledWith('AUTH.LOGIN')
    expect(onClose).toHaveBeenCalled()
  })

  it('disables Delete and Rename actions for missing nodes', () => {
    const missingLeafNode: LocalizationTreeNode = {
      ...sampleLeafNode,
      isPresent: false,
      isMissing: true,
      value: undefined,
    }

    render(
      <LocalizationContextMenu
        state={{
          x: 100,
          y: 100,
          node: missingLeafNode,
          targetFilename: 'ru.json',
        }}
        canUndo={false}
        canRedo={false}
        onRenameKey={vi.fn()}
        onDeleteKey={vi.fn()}
        onDeleteSection={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const deleteBtn = screen.getByRole('menuitem', { name: /delete entry/i })
    expect(deleteBtn).toBeDisabled()
    const renameBtn = screen.getByRole('menuitem', { name: /rename key/i })
    expect(renameBtn).toBeDisabled()
  })
})
