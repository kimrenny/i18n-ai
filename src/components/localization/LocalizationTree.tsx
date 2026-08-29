import React from 'react'
import type { LocalizationTreeNode as TreeNodeType } from '../../types/localization'
import { LocalizationTreeNode } from './LocalizationTreeNode'

interface LocalizationTreeProps {
  rootNodes: TreeNodeType[]
  collapsedSet: Set<string>
  activeMissingKey: string | null
  editingKey?: string | null
  editValue?: string
  isSavingKey?: boolean
  translatingKey?: string | null
  treeBodyRef: React.RefObject<HTMLDivElement | null>
  onToggleCollapse: (id: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onSelectRow: (fullKey: string, isMissing: boolean, isEmpty: boolean) => void
  onStartEdit?: (fullKey: string, currentValue: string) => void
  onEditValueChange?: (value: string) => void
  onSaveEdit?: () => void
  onCancelEdit?: () => void
  onAiTranslate?: (fullKey: string) => void
}

export const LocalizationTree: React.FC<LocalizationTreeProps> = ({
  rootNodes,
  collapsedSet,
  activeMissingKey,
  editingKey,
  editValue,
  isSavingKey,
  translatingKey,
  treeBodyRef,
  onToggleCollapse,
  onExpandAll,
  onCollapseAll,
  onSelectRow,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
  onAiTranslate,
}) => {
  return (
    <div className="tree-container" aria-label="Localization Tree">
      <div className="tree-toolbar">
        <span className="toolbar-title">Explorer View</span>
        <div className="toolbar-actions">
          <button
            type="button"
            className="tree-tool-btn"
            onClick={onExpandAll}
            title="Expand all nodes"
          >
            Expand All
          </button>
          <button
            type="button"
            className="tree-tool-btn"
            onClick={onCollapseAll}
            title="Collapse all nodes"
          >
            Collapse All
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
              editingKey={editingKey}
              editValue={editValue}
              isSavingKey={isSavingKey}
              translatingKey={translatingKey}
              onToggleCollapse={onToggleCollapse}
              onSelectRow={onSelectRow}
              onStartEdit={onStartEdit}
              onEditValueChange={onEditValueChange}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onAiTranslate={onAiTranslate}
            />
          ))
        ) : (
          <div className="empty-tree-message">No keys in this file.</div>
        )}
      </div>
    </div>
  )
}
