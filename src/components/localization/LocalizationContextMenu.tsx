import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { LocalizationTreeNode } from '../../types/localization'
import { countLeafDescendants, countPresentLeafDescendants } from '../../services/localizationTree'
import { useTranslation } from '../../i18n/useTranslation'

export interface ContextMenuState {
  x: number
  y: number
  node: LocalizationTreeNode
  targetFilename: string
}

interface LocalizationContextMenuProps {
  state: ContextMenuState | null
  canUndo: boolean
  canRedo: boolean
  onDeleteKey: (fullKey: string) => void
  onDeleteSection: (sectionPath: string, node: LocalizationTreeNode) => void
  onUndo: () => void
  onRedo: () => void
  onClose: () => void
}

export const LocalizationContextMenu: React.FC<LocalizationContextMenuProps> = ({
  state,
  canUndo,
  canRedo,
  onDeleteKey,
  onDeleteSection,
  onUndo,
  onRedo,
  onClose,
}) => {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [state, onClose])

  if (!state) return null
  if (typeof document === 'undefined') return null

  const isFolder = state.node.type === 'folder' || state.node.children.length > 0
  const leafCount = isFolder ? countLeafDescendants(state.node) : 1
  const presentLeafCount = isFolder ? countPresentLeafDescendants(state.node) : (state.node.isPresent ? 1 : 0)
  const canDelete = isFolder ? presentLeafCount > 0 : !state.node.isMissing && state.node.isPresent

  const menuWidth = 240
  const menuHeight = 180
  const winWidth = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1200
  const winHeight = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800

  const left = Math.max(10, Math.min(state.x, winWidth - menuWidth - 10))
  const top = Math.max(10, Math.min(state.y, winHeight - menuHeight - 10))

  return createPortal(
    <>
      <div
        className="context-menu-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        className="custom-context-menu"
        role="menu"
        aria-label={t('contextMenu.menuAria')}
        style={{ left: `${left}px`, top: `${top}px` }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <div className="context-menu-header">
          <span className="context-menu-title" title={state.node.fullKey}>
            {state.node.segment}
          </span>
          <span className="context-menu-file-badge">{state.targetFilename}</span>
        </div>

        <div className="context-menu-divider" />

        {isFolder ? (
          <button
            type="button"
            className="context-menu-item danger-item"
            role="menuitem"
            disabled={!canDelete}
            onClick={(e) => {
              if (!canDelete) return
              e.stopPropagation()
              onDeleteSection(state.node.fullKey, state.node)
              onClose()
            }}
            title={
              !canDelete
                ? t('contextMenu.sectionEmpty')
                : t('contextMenu.deleteSection', { count: presentLeafCount || leafCount })
            }
          >
            <span className="menu-icon">🗑</span>
            <span className="menu-label">
              {t('contextMenu.deleteSection', { count: presentLeafCount || leafCount })}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="context-menu-item danger-item"
            role="menuitem"
            disabled={!canDelete}
            onClick={(e) => {
              if (!canDelete) return
              e.stopPropagation()
              onDeleteKey(state.node.fullKey)
              onClose()
            }}
            title={!canDelete ? t('contextMenu.alreadyMissing') : t('contextMenu.deleteEntry')}
          >
            <span className="menu-icon">🗑</span>
            <span className="menu-label">{t('contextMenu.deleteEntry')}</span>
          </button>
        )}

        <div className="context-menu-divider" />

        <button
          type="button"
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            onUndo()
            onClose()
          }}
          disabled={!canUndo}
          title={t('tree.undo')}
        >
          <span className="menu-icon">↶</span>
          <span className="menu-label">{t('tree.undo')}</span>
          <span className="menu-shortcut">Ctrl+Z</span>
        </button>

        <button
          type="button"
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            onRedo()
            onClose()
          }}
          disabled={!canRedo}
          title={t('tree.redo')}
        >
          <span className="menu-icon">↷</span>
          <span className="menu-label">{t('tree.redo')}</span>
          <span className="menu-shortcut">Ctrl+Y</span>
        </button>
      </div>
    </>,
    document.body
  )
}
