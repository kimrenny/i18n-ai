import React from 'react'
import type { LocalizationTreeNode as TreeNodeType } from '../../types/localization'
import type { TranslationEngine } from '../../types/settings'
import { LocalizationTreeNode } from './LocalizationTreeNode'
import { useTranslation } from '../../i18n/useTranslation'

interface LocalizationTreeProps {
  rootNodes: TreeNodeType[]
  collapsedSet: Set<string>
  activeMissingKey: string | null
  selectedKey?: string | null
  isInspectorOpen?: boolean
  editingKey?: string | null
  editValue?: string
  isSavingKey?: boolean
  translatingKey?: string | null
  engine?: TranslationEngine
  canUndo?: boolean
  canRedo?: boolean
  treeBodyRef: React.RefObject<HTMLDivElement | null>
  onToggleCollapse: (id: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onToggleInspector?: () => void
  onSelectRow: (fullKey: string, isMissing: boolean, isEmpty: boolean) => void
  onStartEdit?: (fullKey: string, currentValue: string) => void
  onEditValueChange?: (value: string) => void
  onSaveEdit?: () => void
  onCancelEdit?: () => void
  onAiTranslate?: (fullKey: string) => void
  onUndo?: () => void
  onRedo?: () => void
  onContextMenu?: (e: React.MouseEvent, node: TreeNodeType) => void
}

export const LocalizationTree: React.FC<LocalizationTreeProps> = ({
  rootNodes,
  collapsedSet,
  activeMissingKey,
  selectedKey,
  isInspectorOpen = false,
  editingKey,
  editValue,
  isSavingKey,
  translatingKey,
  engine = 'ai',
  canUndo = false,
  canRedo = false,
  treeBodyRef,
  onToggleCollapse,
  onExpandAll,
  onCollapseAll,
  onToggleInspector,
  onSelectRow,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
  onAiTranslate,
  onUndo,
  onRedo,
  onContextMenu,
}) => {
  const { t } = useTranslation()

  return (
    <div className="tree-container" aria-label={t('tree.treeAria')}>
      <div className="tree-toolbar">
        <span className="toolbar-title">{t('tree.explorerView')}</span>
        <div className="toolbar-actions">
          {onToggleInspector && (
            <button
              type="button"
              className={`tree-tool-btn inspector-toggle-btn ${
                isInspectorOpen ? 'is-active' : ''
              }`}
              onClick={onToggleInspector}
              title={t('inspector.title')}
              aria-label={t('inspector.title')}
              aria-pressed={isInspectorOpen}
              data-testid="toggle-inspector-btn"
            >
              🔍 {t('inspector.title')}
            </button>
          )}
          {onUndo && (
            <button
              type="button"
              className="tree-tool-btn history-btn undo-btn"
              onClick={onUndo}
              disabled={!canUndo}
              title={t('tree.undoTooltip', { shortcut: 'Ctrl+Z' })}
              aria-label={t('tree.undo')}
            >
              ↶ {t('tree.undo')}
            </button>
          )}
          {onRedo && (
            <button
              type="button"
              className="tree-tool-btn history-btn redo-btn"
              onClick={onRedo}
              disabled={!canRedo}
              title={t('tree.redoTooltip', { shortcut: 'Ctrl+Y' })}
              aria-label={t('tree.redo')}
            >
              ↷ {t('tree.redo')}
            </button>
          )}
          <span className="toolbar-divider" />
          <button
            type="button"
            className="tree-tool-btn"
            onClick={onExpandAll}
            title={t('tree.expandAll')}
          >
            {t('tree.expandAll')}
          </button>
          <button
            type="button"
            className="tree-tool-btn"
            onClick={onCollapseAll}
            title={t('tree.collapseAll')}
          >
            {t('tree.collapseAll')}
          </button>
        </div>
      </div>

      <div className="tree-body" ref={treeBodyRef}>
        {rootNodes.length > 0 ? (
          rootNodes.map((node) => (
            <LocalizationTreeNode
              key={node.id}
              node={node}
              depth={0}
              collapsedSet={collapsedSet}
              activeMissingKey={activeMissingKey}
              selectedKey={selectedKey}
              editingKey={editingKey}
              editValue={editValue}
              isSavingKey={isSavingKey}
              translatingKey={translatingKey}
              engine={engine}
              onToggleCollapse={onToggleCollapse}
              onSelectRow={onSelectRow}
              onStartEdit={onStartEdit}
              onEditValueChange={onEditValueChange}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onAiTranslate={onAiTranslate}
              onContextMenu={onContextMenu}
            />
          ))
        ) : (
          <div className="empty-tree-message">{t('tree.noKeys')}</div>
        )}
      </div>
    </div>
  )
}
