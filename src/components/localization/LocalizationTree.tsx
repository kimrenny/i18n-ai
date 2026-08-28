import React from 'react'
import type { LocalizationTreeNode as TreeNodeType } from '../../types/localization'
import { LocalizationTreeNode } from './LocalizationTreeNode'

interface LocalizationTreeProps {
  rootNodes: TreeNodeType[]
  collapsedSet: Set<string>
  activeMissingKey: string | null
  treeBodyRef: React.RefObject<HTMLDivElement | null>
  onToggleCollapse: (id: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onSelectRow: (fullKey: string, isMissing: boolean) => void
}

export const LocalizationTree: React.FC<LocalizationTreeProps> = ({
  rootNodes,
  collapsedSet,
  activeMissingKey,
  treeBodyRef,
  onToggleCollapse,
  onExpandAll,
  onCollapseAll,
  onSelectRow,
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
              onToggleCollapse={onToggleCollapse}
              onSelectRow={onSelectRow}
            />
          ))
        ) : (
          <div className="empty-tree-message">No keys in this file.</div>
        )}
      </div>
    </div>
  )
}
