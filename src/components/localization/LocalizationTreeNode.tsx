import React from 'react'
import type { LocalizationTreeNode as TreeNodeType, JsonValue } from '../../types/localization'

interface LocalizationTreeNodeProps {
  node: TreeNodeType
  depth?: number
  collapsedSet: Set<string>
  activeMissingKey: string | null
  editingKey?: string | null
  editValue?: string
  isSavingKey?: boolean
  onToggleCollapse: (id: string) => void
  onSelectRow: (fullKey: string, isMissing: boolean, isEmpty: boolean) => void
  onStartEdit?: (fullKey: string, currentValue: string) => void
  onEditValueChange?: (value: string) => void
  onSaveEdit?: () => void
  onCancelEdit?: () => void
}

function formatJsonValue(value: JsonValue | undefined): string {
  if (value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value)
  }
  return '{...}'
}

export const LocalizationTreeNode: React.FC<LocalizationTreeNodeProps> = ({
  node,
  depth = 0,
  collapsedSet,
  activeMissingKey,
  editingKey,
  editValue = '',
  isSavingKey = false,
  onToggleCollapse,
  onSelectRow,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
}) => {
  const isFolder = node.type === 'folder' || node.children.length > 0
  const isCollapsed = collapsedSet.has(node.id)
  const isProblemActive =
    (node.isMissing || node.isEmpty) && node.fullKey === activeMissingKey
  const isCurrentlyEditing = editingKey === node.fullKey
  const isStringValue =
    node.isPresent && (typeof node.value === 'string' || node.isEmpty)

  const handleRowClick = () => {
    if (!isFolder) {
      onSelectRow(node.fullKey, node.isMissing, node.isEmpty)
      if (isStringValue && onStartEdit && !isCurrentlyEditing) {
        onStartEdit(node.fullKey, typeof node.value === 'string' ? node.value : '')
      }
    }
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isFolder) {
      onToggleCollapse(node.id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSaveEdit?.()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancelEdit?.()
    }
  }

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-row ${node.isMissing ? 'row-missing' : ''} ${
          node.isEmpty ? 'row-empty' : ''
        } ${isProblemActive ? 'row-active-missing' : ''} ${
          node.isConflict ? 'row-conflict' : ''
        } ${isCurrentlyEditing ? 'row-editing' : ''}`}
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
        data-key={node.fullKey}
        data-testid={`tree-node-${node.fullKey}`}
        onClick={handleRowClick}
      >
        {isFolder ? (
          <button
            type="button"
            className="folder-toggle-btn"
            onClick={handleToggle}
            aria-expanded={!isCollapsed}
            aria-label={`Toggle ${node.segment}`}
          >
            <span className="folder-arrow">{isCollapsed ? '▶' : '▼'}</span>
            <span className="folder-name">{node.segment}</span>
          </button>
        ) : (
          <div className="leaf-content">
            <span className="leaf-key" title={node.fullKey}>
              {node.segment}
            </span>
            <span className="separator">:</span>

            {node.isMissing ? (
              <span
                className={`missing-pill ${isProblemActive ? 'active-pill' : ''}`}
                role="status"
              >
                [ MISSING ]
              </span>
            ) : node.isConflict ? (
              <div className="conflict-box">
                <span className="conflict-val">{formatJsonValue(node.value)}</span>
                <span className="conflict-pill">[ STRUCTURE CONFLICT ]</span>
              </div>
            ) : isCurrentlyEditing ? (
              <div
                className="inline-editor"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  className="inline-input"
                  value={editValue}
                  onChange={(e) => onEditValueChange?.(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter translation..."
                  autoFocus
                  disabled={isSavingKey}
                  aria-label={`Edit ${node.fullKey}`}
                />
                <button
                  type="button"
                  className="editor-btn save-btn"
                  onClick={onSaveEdit}
                  disabled={isSavingKey}
                >
                  {isSavingKey ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="editor-btn cancel-btn"
                  onClick={onCancelEdit}
                  disabled={isSavingKey}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="value-container">
                <span className="leaf-value">{formatJsonValue(node.value)}</span>
                {node.isEmpty && (
                  <span
                    className={`empty-pill ${isProblemActive ? 'active-empty-pill' : ''}`}
                    role="status"
                  >
                    [ EMPTY ]
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isFolder && !isCollapsed && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <LocalizationTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsedSet={collapsedSet}
              activeMissingKey={activeMissingKey}
              editingKey={editingKey}
              editValue={editValue}
              isSavingKey={isSavingKey}
              onToggleCollapse={onToggleCollapse}
              onSelectRow={onSelectRow}
              onStartEdit={onStartEdit}
              onEditValueChange={onEditValueChange}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
            />
          ))}
        </div>
      )}
    </div>
  )
}
