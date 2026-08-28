import React from 'react'
import type { LocalizationTreeNode as TreeNodeType, JsonValue } from '../../types/localization'

interface LocalizationTreeNodeProps {
  node: TreeNodeType
  depth?: number
  collapsedSet: Set<string>
  onToggleCollapse: (id: string) => void
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
  onToggleCollapse,
}) => {
  const isFolder = node.type === 'folder' || node.children.length > 0
  const isCollapsed = collapsedSet.has(node.id)

  const handleToggle = () => {
    if (isFolder) {
      onToggleCollapse(node.id)
    }
  }

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-row ${node.isMissing ? 'row-missing' : ''} ${node.isConflict ? 'row-conflict' : ''}`}
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
        data-testid={`tree-node-${node.fullKey}`}
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
              <span className="missing-pill" role="status">
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
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </div>
      )}
    </div>
  )
}
