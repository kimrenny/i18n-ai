import React from 'react'
import type { LocalizationTreeNode as TreeNodeType, JsonValue } from '../../types/localization'

interface LocalizationTreeNodeProps {
  node: TreeNodeType
  depth?: number
  collapsedSet: Set<string>
  activeMissingKey: string | null
  onToggleCollapse: (id: string) => void
  onSelectRow: (fullKey: string, isMissing: boolean) => void
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
  onToggleCollapse,
  onSelectRow,
}) => {
  const isFolder = node.type === 'folder' || node.children.length > 0
  const isCollapsed = collapsedSet.has(node.id)
  const isActiveMissing = node.isMissing && node.fullKey === activeMissingKey

  const handleRowClick = () => {
    if (!isFolder) {
      onSelectRow(node.fullKey, node.isMissing)
    }
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isFolder) {
      onToggleCollapse(node.id)
    }
  }

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-row ${node.isMissing ? 'row-missing' : ''} ${
          isActiveMissing ? 'row-active-missing' : ''
        } ${node.isConflict ? 'row-conflict' : ''}`}
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
              <span className={`missing-pill ${isActiveMissing ? 'active-pill' : ''}`} role="status">
                [ MISSING ]
              </span>
            ) : node.isConflict ? (
              <div className="conflict-box">
                <span className="conflict-val">{formatJsonValue(node.value)}</span>
                <span className="conflict-pill">[ STRUCTURE CONFLICT ]</span>
              </div>
            ) : (
              <span className="leaf-value">{formatJsonValue(node.value)}</span>
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
              onToggleCollapse={onToggleCollapse}
              onSelectRow={onSelectRow}
            />
          ))}
        </div>
      )}
    </div>
  )
}
