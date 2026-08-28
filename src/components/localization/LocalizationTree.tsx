import React, { useState } from 'react'
import type { LocalizationTreeNode as TreeNodeType } from '../../types/localization'
import { LocalizationTreeNode } from './LocalizationTreeNode'

interface LocalizationTreeProps {
  rootNodes: TreeNodeType[]
}

function collectFolderIds(nodes: TreeNodeType[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.type === 'folder' || node.children.length > 0) {
      ids.push(node.id)
      ids.push(...collectFolderIds(node.children))
    }
  }
  return ids
}

export const LocalizationTree: React.FC<LocalizationTreeProps> = ({ rootNodes }) => {
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())

  const handleToggleCollapse = (id: string) => {
    setCollapsedSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleExpandAll = () => {
    setCollapsedSet(new Set())
  }

  const handleCollapseAll = () => {
    const allFolderIds = collectFolderIds(rootNodes)
    setCollapsedSet(new Set(allFolderIds))
  }

  return (
    <div className="tree-container" aria-label="Localization Tree">
      <div className="tree-toolbar">
        <span className="toolbar-title">Explorer View</span>
        <div className="toolbar-actions">
          <button
            type="button"
            className="tree-tool-btn"
            onClick={handleExpandAll}
            title="Expand all nodes"
          >
            Expand All
          </button>
          <button
            type="button"
            className="tree-tool-btn"
            onClick={handleCollapseAll}
            title="Collapse all nodes"
          >
            Collapse All
          </button>
        </div>
      </div>

      <div className="tree-body">
        {rootNodes.length > 0 ? (
          rootNodes.map((node) => (
            <LocalizationTreeNode
              key={node.id}
              node={node}
              depth={0}
              collapsedSet={collapsedSet}
              onToggleCollapse={handleToggleCollapse}
            />
          ))
        ) : (
          <div className="empty-tree-message">No keys in this file.</div>
        )}
      </div>
    </div>
  )
}
