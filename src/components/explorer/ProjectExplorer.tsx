import React, { useState, useMemo, useCallback } from 'react'
import type { ProjectFileEntry } from '../../types/explorer'
import { isLocalizationFile } from '../../services/localizationDetector'
import { useTranslation } from '../../i18n/useTranslation'
import { ResizeHandle, type ResizeHandleProps } from '../common/ResizeHandle'
import './ProjectExplorer.css'

export interface ProjectExplorerProps {
  rootPath: string | null
  rootName: string | null
  treeEntries: ProjectFileEntry[]
  flatJsonFiles: Array<{ name: string; path: string }>
  checkedPaths: Set<string>
  activeFilePath?: string | null
  onToggleCheckFile: (filePath: string) => void
  onSelectAllJson: () => void
  onUnselectAllJson: () => void
  onSelectFile?: (filePath: string, fileName?: string, isLocCandidate?: boolean) => void
  onOpenFolder: () => void
  onRefreshTree?: () => void
  isCollapsed?: boolean
  onToggleCollapseSidebar?: () => void
  width?: number
  isResizing?: boolean
  resizeHandleProps?: Partial<ResizeHandleProps>
}

interface TreeNodeProps {
  node: ProjectFileEntry
  level: number
  checkedPaths: Set<string>
  activeFilePath?: string | null
  searchQuery: string
  expandedDirs: Set<string>
  onToggleDir: (dirPath: string) => void
  onToggleCheckFile: (filePath: string) => void
  onSelectFile?: (filePath: string, fileName?: string, isLocCandidate?: boolean) => void
}

function getFileIcon(name: string, isLocalizationCandidate?: boolean): { icon: string; className: string } {
  if (isLocalizationCandidate) {
    return { icon: '{ }', className: 'file-icon-json file-icon-i18n' }
  }
  if (name.endsWith('.json')) {
    return { icon: '{ }', className: 'file-icon-json' }
  }
  if (name.endsWith('.ts') || name.endsWith('.tsx')) {
    return { icon: 'TS', className: 'file-icon-ts' }
  }
  if (name.endsWith('.js') || name.endsWith('.jsx')) {
    return { icon: 'JS', className: 'file-icon-js' }
  }
  if (name.endsWith('.md')) {
    return { icon: 'MD', className: 'file-icon-md' }
  }
  if (name.endsWith('.css') || name.endsWith('.scss')) {
    return { icon: '#', className: 'file-icon-css' }
  }
  return { icon: '📄', className: 'file-icon-default' }
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(({
  node,
  level,
  checkedPaths,
  activeFilePath,
  searchQuery,
  expandedDirs,
  onToggleDir,
  onToggleCheckFile,
  onSelectFile,
}) => {
  const { t } = useTranslation()
  const isExpanded = expandedDirs.has(node.path)

  // Determine if node matches search query
  const matchesSearch = useMemo(() => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    if (node.name.toLowerCase().includes(q)) return true
    if (node.isDirectory && node.children) {
      const hasMatchingChild = (children: ProjectFileEntry[]): boolean => {
        return children.some(
          (c) => c.name.toLowerCase().includes(q) || (c.isDirectory && c.children && hasMatchingChild(c.children))
        )
      }
      return hasMatchingChild(node.children)
    }
    return false
  }, [node, searchQuery])

  if (!matchesSearch) {
    return null
  }

  if (node.isDirectory) {
    const childLocCandidates = (node.children || []).filter((c) => {
      if (c.isDirectory) return false
      return c.isLocalizationCandidate !== undefined
        ? c.isLocalizationCandidate
        : isLocalizationFile(c.relativePath || c.name)
    }).length

    return (
      <div className="explorer-tree-branch">
        <div
          className={`explorer-tree-row directory-row ${isExpanded ? 'is-expanded' : ''}`}
          style={{ paddingLeft: `${Math.max(8, level * 16)}px` }}
          onClick={() => onToggleDir(node.path)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggleDir(node.path)
            }
          }}
          title={node.path}
          aria-expanded={isExpanded}
        >
          <span className="explorer-chevron" aria-hidden="true">
            {isExpanded ? '▾' : '▸'}
          </span>
          <span className="explorer-icon folder-icon" aria-hidden="true">
            {isExpanded ? '📂' : '📁'}
          </span>
          <span className="explorer-node-name">{node.name}</span>
          {childLocCandidates > 0 && (
            <span className="explorer-badge-loc-count" title={`${childLocCandidates} translation files`}>
              {childLocCandidates}
            </span>
          )}
        </div>
        {isExpanded && node.children && (
          <div className="explorer-tree-children">
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                level={level + 1}
                checkedPaths={checkedPaths}
                activeFilePath={activeFilePath}
                searchQuery={searchQuery}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                onToggleCheckFile={onToggleCheckFile}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File node: strictly distinguish translation files from other files
  const isCandidate = node.isLocalizationCandidate !== undefined
    ? Boolean(node.isLocalizationCandidate)
    : isLocalizationFile(node.relativePath || node.name)

  const isChecked = checkedPaths.has(node.path)
  const isActive = activeFilePath === node.path
  const { icon, className: iconClass } = getFileIcon(node.name, isCandidate)

  return (
    <div
      className={`explorer-tree-row file-row ${isActive ? 'is-active' : ''} ${isCandidate ? 'is-localization' : 'is-non-localization'}`}
      style={{ paddingLeft: `${Math.max(8, level * 16)}px` }}
      onClick={() => onSelectFile?.(node.path, node.name, isCandidate)}
      title={node.path}
      data-testid={`explorer-file-${node.name}`}
    >
      {isCandidate ? (
        <label
          className="explorer-checkbox-label"
          onClick={(e) => e.stopPropagation()}
          title={isChecked ? t('explorer.unselectFile') : t('explorer.selectFile')}
        >
          <input
            type="checkbox"
            className="explorer-checkbox file-checkbox"
            checked={isChecked}
            onChange={() => onToggleCheckFile(node.path)}
            aria-label={t('app.selectFileAria', { name: node.name })}
          />
        </label>
      ) : (
        <span className="explorer-checkbox-placeholder" aria-hidden="true" />
      )}

      <span className={`explorer-icon ${iconClass}`} aria-hidden="true">
        {icon}
      </span>

      <span className="explorer-node-name file-name">{node.name}</span>

      {isCandidate && (
        <span className="explorer-file-badge json-badge" title="Localization File">
          i18n
        </span>
      )}
    </div>
  )
})

TreeNode.displayName = 'TreeNode'

export const ProjectExplorer: React.FC<ProjectExplorerProps> = ({
  rootPath,
  rootName,
  treeEntries,
  flatJsonFiles,
  checkedPaths,
  activeFilePath,
  onToggleCheckFile,
  onSelectAllJson,
  onUnselectAllJson,
  onSelectFile,
  onOpenFolder,
  onRefreshTree,
  isCollapsed = false,
  onToggleCollapseSidebar,
  width,
  isResizing = false,
  resizeHandleProps,
}) => {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [isRootExpanded, setIsRootExpanded] = useState(true)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (rootPath) initial.add(rootPath)
    return initial
  })

  // Collect all folder paths for "expand all" / "collapse all"
  const allDirPaths = useMemo(() => {
    const dirs: string[] = []
    const traverse = (entries: ProjectFileEntry[]) => {
      for (const entry of entries) {
        if (entry.isDirectory) {
          dirs.push(entry.path)
          if (entry.children) traverse(entry.children)
        }
      }
    }
    traverse(treeEntries)
    return dirs
  }, [treeEntries])

  // Automatically expand root and nested dirs if new tree loads
  React.useEffect(() => {
    if (treeEntries.length > 0 && expandedDirs.size === 0 && rootPath) {
      setExpandedDirs(new Set([rootPath]))
    }
  }, [treeEntries, rootPath, expandedDirs.size])

  const handleToggleDir = useCallback((dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(dirPath)) {
        next.delete(dirPath)
      } else {
        next.add(dirPath)
      }
      return next
    })
  }, [])

  const handleCollapseAll = () => {
    setExpandedDirs(new Set())
  }

  const handleExpandAll = () => {
    setExpandedDirs(new Set(allDirPaths))
  }

  // Count total localization candidate files strictly
  const totalJsonCount = useMemo(() => {
    if (treeEntries.length > 0) {
      let count = 0
      const traverse = (entries: ProjectFileEntry[]) => {
        for (const entry of entries) {
          const isLoc = entry.isLocalizationCandidate !== undefined
            ? Boolean(entry.isLocalizationCandidate)
            : isLocalizationFile(entry.relativePath || entry.name)
          if (!entry.isDirectory && isLoc) {
            count++
          } else if (entry.isDirectory && entry.children) {
            traverse(entry.children)
          }
        }
      }
      traverse(treeEntries)
      return count
    }
    return flatJsonFiles.filter((f) => isLocalizationFile(f.name)).length
  }, [treeEntries, flatJsonFiles])

  // Fallback flat entries if treeEntries is empty (e.g. test environment)
  const renderedTree = useMemo(() => {
    if (treeEntries.length > 0) {
      return treeEntries
    }
    return flatJsonFiles.map((file) => ({
      name: file.name,
      path: file.path,
      relativePath: file.name,
      isDirectory: false,
      isLocalizationCandidate: isLocalizationFile(file.name),
    }))
  }, [treeEntries, flatJsonFiles])

  const allChecked = totalJsonCount > 0 && checkedPaths.size >= totalJsonCount
  const noneChecked = checkedPaths.size === 0

  if (isCollapsed) {
    return (
      <aside className="project-explorer is-collapsed" data-testid="project-explorer" aria-label={t('explorer.title')}>
        <button
          type="button"
          className="explorer-toggle-btn collapsed-bar-btn"
          onClick={onToggleCollapseSidebar}
          title={t('explorer.expandSidebar')}
          aria-label={t('explorer.expandSidebar')}
        >
          📂
        </button>
      </aside>
    )
  }

  const displayRootName = rootName || (rootPath ? rootPath.split(/[/|\\]/).filter(Boolean).pop() || rootPath : null)

  return (
    <aside
      className={`project-explorer ${isResizing ? 'is-resizing' : ''}`}
      data-testid="project-explorer"
      style={
        width !== undefined
          ? {
              width: `${width}px`,
              minWidth: '180px',
              maxWidth: '600px',
              transition: isResizing ? 'none' : undefined,
            }
          : undefined
      }
      aria-label={t('explorer.title')}
    >
      {/* Header bar */}
      <div className="explorer-header">
        <div className="explorer-header-left">
          <span className="explorer-header-title">{t('explorer.title')}</span>
          {displayRootName && (
            <span className="explorer-root-name" title={rootPath || ''}>
              {displayRootName}
            </span>
          )}
        </div>

        <div className="explorer-header-actions">
          {onRefreshTree && (
            <button
              type="button"
              className="explorer-action-btn"
              onClick={onRefreshTree}
              title={t('explorer.refresh')}
              aria-label={t('explorer.refresh')}
            >
              🔄
            </button>
          )}
          {allDirPaths.length > 0 && (
            <>
              <button
                type="button"
                className="explorer-action-btn"
                onClick={handleCollapseAll}
                title={t('explorer.collapseAll')}
                aria-label={t('explorer.collapseAll')}
              >
                ⊟
              </button>
              <button
                type="button"
                className="explorer-action-btn"
                onClick={handleExpandAll}
                title={t('explorer.expandAll')}
                aria-label={t('explorer.expandAll')}
              >
                ⊞
              </button>
            </>
          )}
          {onToggleCollapseSidebar && (
            <button
              type="button"
              className="explorer-action-btn"
              onClick={onToggleCollapseSidebar}
              title={t('explorer.collapseSidebar')}
              aria-label={t('explorer.collapseSidebar')}
            >
              ◀
            </button>
          )}
        </div>
      </div>

      {/* Search and Selection Toolbar */}
      {rootPath && (
        <div className="explorer-toolbar">
          <div className="explorer-search-wrapper">
            <input
              type="search"
              role="searchbox"
              className="explorer-search-input"
              placeholder={t('explorer.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('explorer.searchFiles')}
            />
            {searchQuery && (
              <button
                type="button"
                className="explorer-search-clear"
                onClick={() => setSearchQuery('')}
                title={t('explorer.clearSearch')}
                aria-label={t('explorer.clearSearch')}
              >
                ✕
              </button>
            )}
          </div>

          {totalJsonCount > 0 && (
            <div className="explorer-selection-controls">
              <span className="explorer-selection-count">
                {t('explorer.selectedCount', {
                  count: checkedPaths.size,
                  total: totalJsonCount,
                })}
              </span>
              <div className="explorer-selection-btn-group">
                <button
                  type="button"
                  className="explorer-pill-btn"
                  onClick={onSelectAllJson}
                  disabled={allChecked}
                  title={t('explorer.selectAll')}
                >
                  {t('explorer.selectAll')}
                </button>
                <button
                  type="button"
                  className="explorer-pill-btn"
                  onClick={onUnselectAllJson}
                  disabled={noneChecked}
                  title={t('explorer.unselectAll')}
                >
                  {t('explorer.unselectAll')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Tree Scroll Container */}
      <div className="explorer-tree-container">
        {!rootPath ? (
          <div className="explorer-empty-state">
            <div className="explorer-empty-icon">📁</div>
            <div className="explorer-empty-title">{t('explorer.noFolderOpened')}</div>
            <p className="explorer-empty-desc">{t('explorer.noFolderHint')}</p>
            <button
              type="button"
              className="app-btn app-btn-sm explorer-open-btn select-button"
              onClick={onOpenFolder}
            >
              {t('explorer.openFolder')}
            </button>
          </div>
        ) : renderedTree.length === 0 ? (
          <div className="explorer-empty-state">
            <div className="explorer-empty-icon">🔍</div>
            <div className="explorer-empty-title">{t('explorer.noFilesFound')}</div>
          </div>
        ) : (
          <div className="explorer-tree-list" role="tree">
            {/* Opened project root shown as the top-level tree node */}
            <div className="explorer-tree-branch root-branch" data-testid="explorer-root-folder">
              <div
                className={`explorer-tree-row directory-row root-directory-row ${isRootExpanded ? 'is-expanded' : ''}`}
                style={{ paddingLeft: '8px' }}
                onClick={() => setIsRootExpanded((prev) => !prev)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setIsRootExpanded((prev) => !prev)
                  }
                }}
                title={rootPath}
                aria-expanded={isRootExpanded}
              >
                <span className="explorer-chevron" aria-hidden="true">
                  {isRootExpanded ? '▾' : '▸'}
                </span>
                <span className="explorer-icon folder-icon root-folder-icon" aria-hidden="true">
                  {isRootExpanded ? '📂' : '📁'}
                </span>
                <span className="explorer-node-name root-folder-name">
                  {displayRootName}
                </span>
                {totalJsonCount > 0 && (
                  <span className="explorer-badge-loc-count" title={`${totalJsonCount} translation files`}>
                    {totalJsonCount}
                  </span>
                )}
              </div>

              {isRootExpanded && (
                <div className="explorer-tree-children root-children">
                  {renderedTree.map((entry) => (
                    <TreeNode
                      key={entry.path}
                      node={entry}
                      level={1}
                      checkedPaths={checkedPaths}
                      activeFilePath={activeFilePath}
                      searchQuery={searchQuery}
                      expandedDirs={expandedDirs}
                      onToggleDir={handleToggleDir}
                      onToggleCheckFile={onToggleCheckFile}
                      onSelectFile={onSelectFile}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {resizeHandleProps?.onPointerDown && (
        <ResizeHandle
          direction="horizontal"
          onPointerDown={resizeHandleProps.onPointerDown}
          onPointerMove={resizeHandleProps.onPointerMove}
          onPointerUp={resizeHandleProps.onPointerUp}
          onKeyDown={resizeHandleProps.onKeyDown}
          isResizing={isResizing}
          valueNow={resizeHandleProps.valueNow ?? width}
          valueMin={resizeHandleProps.valueMin ?? 180}
          valueMax={resizeHandleProps.valueMax ?? 600}
        />
      )}
    </aside>
  )
}
