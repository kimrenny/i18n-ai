import React from 'react'
import type { LocalizationTreeNode as TreeNodeType, JsonValue } from '../../types/localization'
import type { TranslationEngine } from '../../types/settings'
import {
  getTranslateActionLabel,
  getTranslateShortLabel,
  getTranslateTitle,
} from '../../services/translationLabels'
import { useTranslation } from '../../i18n/useTranslation'

interface LocalizationTreeNodeProps {
  node: TreeNodeType
  depth?: number
  collapsedSet: Set<string>
  activeMissingKey: string | null
  selectedKey?: string | null
  editingKey?: string | null
  editValue?: string
  isSavingKey?: boolean
  translatingKey?: string | null
  engine?: TranslationEngine
  onToggleCollapse: (id: string) => void
  onSelectRow: (fullKey: string, isMissing: boolean, isEmpty: boolean) => void
  onStartEdit?: (fullKey: string, currentValue: string) => void
  onEditValueChange?: (value: string) => void
  onSaveEdit?: () => void
  onCancelEdit?: () => void
  onAiTranslate?: (fullKey: string) => void
  onContextMenu?: (e: React.MouseEvent, node: TreeNodeType) => void
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
  selectedKey,
  editingKey,
  editValue = '',
  isSavingKey = false,
  translatingKey,
  engine = 'ai',
  onToggleCollapse,
  onSelectRow,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
  onAiTranslate,
  onContextMenu,
}) => {
  const { t } = useTranslation()
  const isFolder = node.type === 'folder' || node.children.length > 0
  const isCollapsed = collapsedSet.has(node.id)
  const isSelected = selectedKey === node.fullKey
  const isProblemActive =
    (node.isMissing || node.isEmpty) && node.fullKey === activeMissingKey
  const isTargetActive =
    !node.isMissing && !node.isEmpty && node.fullKey === activeMissingKey
  const isCurrentlyEditing = editingKey === node.fullKey
  const isStringValue =
    node.isPresent && (typeof node.value === 'string' || node.isEmpty)
  const isThisKeyTranslating = translatingKey === node.fullKey
  const isAnyKeyTranslating = translatingKey !== null && translatingKey !== undefined

  const actionLabel = isThisKeyTranslating
    ? t('translation.translating')
    : getTranslateActionLabel(engine, t)

  const shortActionLabel = isThisKeyTranslating
    ? t('translation.translating')
    : getTranslateShortLabel(engine, t)

  const actionTitle = getTranslateTitle(engine, t)

  const actionAriaLabel =
    engine === 'free'
      ? `Translate ${node.fullKey} with Free`
      : `Translate ${node.fullKey} with AI`

  const handleRowClick = () => {
    if (!isFolder) {
      onSelectRow(node.fullKey, node.isMissing, node.isEmpty)
    }
  }

  const handleRowDoubleClick = (e: React.MouseEvent) => {
    if (!isFolder && isStringValue && onStartEdit && !isCurrentlyEditing) {
      e.stopPropagation()
      onStartEdit(node.fullKey, typeof node.value === 'string' ? node.value : '')
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu?.(e, node)
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

  const handleAiClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAiTranslate?.(node.fullKey)
  }

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-row ${node.isMissing ? 'row-missing' : ''} ${
          node.isEmpty ? 'row-empty' : ''
        } ${isSelected ? 'row-selected' : ''} ${isProblemActive ? 'row-active-missing' : ''} ${
          isTargetActive ? 'row-active-target' : ''
        } ${node.isConflict ? 'row-conflict' : ''} ${
          isCurrentlyEditing ? 'row-editing' : ''
        }`}
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
        data-key={node.fullKey}
        data-testid={`tree-node-${node.fullKey}`}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {isFolder ? (
          <button
            type="button"
            className="folder-toggle-btn"
            onClick={handleToggle}
            onContextMenu={handleContextMenu}
            aria-expanded={!isCollapsed}
            aria-label={t('tree.toggleFolderAria', { name: node.segment })}
          >
            <span className="folder-arrow">{isCollapsed ? '▶' : '▼'}</span>
            <span className="folder-name">{node.segment}</span>
          </button>
        ) : (
          <div className="leaf-content" onContextMenu={handleContextMenu}>
            <span className="leaf-key" title={node.fullKey}>
              {node.segment}
            </span>
            <span className="separator">:</span>

            {node.isMissing ? (
              <div className="missing-container">
                <span
                  className={`missing-pill ${isProblemActive ? 'active-pill' : ''}`}
                  role="status"
                >
                  {t('tree.missingBadge')}
                </span>
                {onAiTranslate && (
                  <button
                    type="button"
                    className="ai-translate-btn"
                    onClick={handleAiClick}
                    disabled={isAnyKeyTranslating}
                    title={actionTitle}
                    aria-label={actionAriaLabel}
                  >
                    {actionLabel}
                  </button>
                )}
              </div>
            ) : node.isConflict ? (
              <div className="conflict-box">
                <span className="conflict-val">{formatJsonValue(node.value)}</span>
                <span className="conflict-pill">{t('tree.conflictBadge')}</span>
              </div>
            ) : isCurrentlyEditing ? (
              <div
                className="inline-editor"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  className="inline-input"
                  value={editValue}
                  onChange={(e) => onEditValueChange?.(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('tree.placeholderEnterTranslation')}
                  autoFocus
                  disabled={isSavingKey}
                  aria-label={t('tree.editKeyAria', { key: node.fullKey })}
                />
                <button
                  type="button"
                  className="editor-btn save-btn"
                  onClick={onSaveEdit}
                  disabled={isSavingKey}
                >
                  {isSavingKey ? t('tree.saving') : t('tree.save')}
                </button>
                <button
                  type="button"
                  className="editor-btn cancel-btn"
                  onClick={onCancelEdit}
                  disabled={isSavingKey}
                >
                  {t('tree.cancel')}
                </button>
                {onAiTranslate && (
                  <button
                    type="button"
                    className="editor-btn ai-btn"
                    onClick={handleAiClick}
                    disabled={isAnyKeyTranslating || isSavingKey}
                    title={actionTitle}
                    aria-label={actionAriaLabel}
                  >
                    {shortActionLabel}
                  </button>
                )}
              </div>
            ) : (
              <div className="value-container">
                <span className="leaf-value">{formatJsonValue(node.value)}</span>
                {node.isEmpty && (
                  <>
                    <span
                      className={`empty-pill ${isProblemActive ? 'active-empty-pill' : ''}`}
                      role="status"
                    >
                      {t('tree.emptyBadge')}
                    </span>
                    {onAiTranslate && (
                      <button
                        type="button"
                        className="ai-translate-btn"
                        onClick={handleAiClick}
                        disabled={isAnyKeyTranslating}
                        title={actionTitle}
                        aria-label={actionAriaLabel}
                      >
                        {actionLabel}
                      </button>
                    )}
                  </>
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
          ))}
        </div>
      )}
    </div>
  )
}
