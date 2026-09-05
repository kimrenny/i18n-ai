import React, { useState, useMemo, useCallback } from 'react'
import type {
  HistoryFilterCategory,
  TranslationHistoryItem,
} from '../../types/localizationHistoryView'
import {
  formatRelativeTimestamp,
  filterHistoryItems,
} from '../../services/localizationHistoryView'
import { useTranslation } from '../../i18n/useTranslation'
import './TranslationHistory.css'

interface TranslationHistoryProps {
  items: TranslationHistoryItem[]
  selectedItemId?: string | null
  onSelectItem?: (item: TranslationHistoryItem | null) => void
  onNavigateKey?: (item: TranslationHistoryItem) => void
  onRevertItem?: (item: TranslationHistoryItem) => void
  onClearHistory?: () => void
  onClose?: () => void
  isReverting?: boolean
}

const OPERATION_ICONS: Record<string, string> = {
  edit: '✏️',
  ai_translate: '✨',
  free_translate: '🌐',
  add_key: '➕',
  add_missing_keys: '📑',
  rename_key: '🏷️',
  delete_key: '🗑️',
  delete_section: '📁',
}

export const TranslationHistory: React.FC<TranslationHistoryProps> = ({
  items,
  selectedItemId,
  onSelectItem,
  onNavigateKey,
  onRevertItem,
  onClearHistory,
  onClose,
  isReverting = false,
}) => {
  const { t } = useTranslation()
  const [activeFilter, setActiveFilter] = useState<HistoryFilterCategory>('all')
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  const [isConfirmingRevert, setIsConfirmingRevert] = useState<string | null>(null)

  const filteredItems = useMemo(() => {
    return filterHistoryItems(items, activeFilter)
  }, [items, activeFilter])

  const selectedItem = useMemo(() => {
    if (!selectedItemId) {
      return filteredItems.length > 0 ? filteredItems[0] : null
    }
    return items.find((i) => i.id === selectedItemId) || (filteredItems.length > 0 ? filteredItems[0] : null)
  }, [items, filteredItems, selectedItemId])

  const handleRowClick = useCallback(
    (item: TranslationHistoryItem) => {
      onSelectItem?.(item)
    },
    [onSelectItem]
  )

  const handleConfirmClear = useCallback(() => {
    onClearHistory?.()
    setIsConfirmingClear(false)
    onSelectItem?.(null)
  }, [onClearHistory, onSelectItem])

  const handleExecuteRevert = useCallback(
    (item: TranslationHistoryItem) => {
      onRevertItem?.(item)
      setIsConfirmingRevert(null)
    },
    [onRevertItem]
  )

  const getOpBadgeLabel = useCallback(
    (type: string) => {
      switch (type) {
        case 'edit':
          return t('history.opEdit')
        case 'ai_translate':
          return t('history.opAiTranslate')
        case 'free_translate':
          return t('history.opFreeTranslate')
        case 'add_key':
          return t('history.opAddKey')
        case 'add_missing_keys':
          return t('history.opAddMissingKeys')
        case 'rename_key':
          return t('history.opRenameKey')
        case 'delete_key':
          return t('history.opDeleteKey')
        case 'delete_section':
          return t('history.opDeleteSection')
        default:
          return type
      }
    },
    [t]
  )

  return (
    <div
      className="translation-history-panel"
      data-testid="translation-history-panel"
      aria-label={t('history.title')}
    >
      {/* Panel Header */}
      <div className="history-header">
        <div className="history-header-title-group">
          <span className="history-header-icon">📜</span>
          <h3 className="history-header-title">{t('history.title')}</h3>
          <span className="history-count-badge" data-testid="history-total-count">
            {items.length}
          </span>
        </div>

        <div className="history-header-actions">
          {items.length > 0 && onClearHistory && (
            <button
              type="button"
              className="history-btn-clear"
              onClick={() => setIsConfirmingClear(true)}
              title={t('history.clearHistory')}
              aria-label={t('history.clearHistory')}
              data-testid="clear-history-btn"
            >
              🗑️ {t('history.clearHistory')}
            </button>
          )}

          {onClose && (
            <button
              type="button"
              className="history-btn-close"
              onClick={onClose}
              title={t('common.close')}
              aria-label={t('common.close')}
              data-testid="close-history-btn"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="history-filter-bar" role="tablist" aria-label="History categories">
        {(
          [
            { id: 'all', label: t('history.filterAll') },
            { id: 'edits', label: t('history.filterEdits') },
            { id: 'keys', label: t('history.filterKeys') },
            { id: 'deletions', label: t('history.filterDeletions') },
            { id: 'ai', label: t('history.filterAi') },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === tab.id}
            className={`history-filter-tab ${activeFilter === tab.id ? 'is-active' : ''}`}
            onClick={() => setActiveFilter(tab.id)}
            data-testid={`history-filter-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="history-body">
        {filteredItems.length === 0 ? (
          <div className="history-empty-state" data-testid="history-empty-state">
            <span className="history-empty-icon">📂</span>
            <p className="history-empty-title">{t('history.emptyTitle')}</p>
            <p className="history-empty-desc">{t('history.emptyDesc')}</p>
          </div>
        ) : (
          <div className="history-split-view">
            {/* List Column */}
            <div className="history-list" role="list" data-testid="history-list">
              {filteredItems.map((item) => {
                const isSelected = selectedItem?.id === item.id
                const icon = OPERATION_ICONS[item.type] || '📝'

                return (
                  <div
                    key={item.id}
                    role="listitem"
                    tabIndex={0}
                    className={`history-list-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleRowClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleRowClick(item)
                      }
                    }}
                    data-testid={`history-item-${item.id}`}
                  >
                    <div className="history-item-top">
                      <span className="history-item-icon">{icon}</span>
                      <span className="history-item-op-badge" data-type={item.type}>
                        {getOpBadgeLabel(item.type)}
                      </span>
                      <span className="history-item-file" title={item.targetFile}>
                        {item.targetFile}
                      </span>
                      <span className="history-item-time">
                        {formatRelativeTimestamp(item.timestamp)}
                      </span>
                    </div>

                    <div className="history-item-summary">
                      {item.key && (
                        <span className="history-item-key" title={item.key}>
                          {item.key}
                        </span>
                      )}
                      {item.sectionPath && (
                        <span className="history-item-key" title={item.sectionPath}>
                          📁 {item.sectionPath}
                        </span>
                      )}
                      {item.oldKey && item.newKey && (
                        <span className="history-item-rename-flow">
                          <span className="history-key-old">{item.oldKey}</span>
                          <span className="history-arrow"> → </span>
                          <span className="history-key-new">{item.newKey}</span>
                        </span>
                      )}
                    </div>

                    {(item.previousValue !== undefined || item.newValue !== undefined) && (
                      <div className="history-item-diff-preview">
                        {item.previousValue !== undefined && (
                          <span className="history-val-old" title={item.previousValue}>
                            - {item.previousValue || '""'}
                          </span>
                        )}
                        {item.newValue !== undefined && (
                          <span className="history-val-new" title={item.newValue}>
                            + {item.newValue || '""'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Selected Entry Detail Pane */}
            {selectedItem && (
              <div className="history-detail-pane" data-testid="history-detail-pane">
                <div className="history-detail-header">
                  <div className="history-detail-title-group">
                    <span className="history-detail-op-icon">
                      {OPERATION_ICONS[selectedItem.type] || '📝'}
                    </span>
                    <div className="history-detail-op-info">
                      <span className="history-detail-op-name">
                        {getOpBadgeLabel(selectedItem.type)}
                      </span>
                      <span className="history-detail-timestamp">
                        {new Date(selectedItem.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="history-detail-actions">
                    {onNavigateKey && selectedItem.key && (
                      <button
                        type="button"
                        className="history-action-btn history-navigate-btn"
                        onClick={() => onNavigateKey(selectedItem)}
                        title={t('history.navigate')}
                        data-testid="history-navigate-btn"
                      >
                        🧭 {t('history.navigate')}
                      </button>
                    )}

                    {onRevertItem && selectedItem.canRevert && (
                      <button
                        type="button"
                        className="history-action-btn history-revert-btn"
                        onClick={() => setIsConfirmingRevert(selectedItem.id)}
                        disabled={isReverting}
                        title={t('history.revert')}
                        data-testid="history-revert-btn"
                      >
                        ↶ {t('history.revert')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="history-detail-card">
                  <div className="history-detail-field">
                    <span className="history-field-label">{t('history.affectedFiles')}</span>
                    <div className="history-field-file-list">
                      {selectedItem.affectedFiles.map((file) => (
                        <span key={file} className="history-file-tag">
                          📄 {file}
                        </span>
                      ))}
                    </div>
                  </div>

                  {(selectedItem.key || selectedItem.newKey) && (
                    <div className="history-detail-field">
                      <span className="history-field-label">{t('history.affectedKey')}</span>
                      <code className="history-field-code">
                        {selectedItem.newKey || selectedItem.key}
                      </code>
                    </div>
                  )}

                  {selectedItem.oldKey && selectedItem.newKey && (
                    <div className="history-detail-field">
                      <span className="history-field-label">{t('history.opRenameKey')}</span>
                      <div className="history-rename-detail">
                        <code className="history-field-code is-old">{selectedItem.oldKey}</code>
                        <span className="history-arrow"> → </span>
                        <code className="history-field-code is-new">{selectedItem.newKey}</code>
                      </div>
                    </div>
                  )}

                  {selectedItem.sectionPath && (
                    <div className="history-detail-field">
                      <span className="history-field-label">{t('history.opDeleteSection')}</span>
                      <code className="history-field-code">📁 {selectedItem.sectionPath}</code>
                    </div>
                  )}

                  {selectedItem.previousValue !== undefined && (
                    <div className="history-detail-field">
                      <span className="history-field-label">{t('history.previousValue')}</span>
                      <div className="history-value-box is-prev" data-testid="detail-prev-value">
                        {selectedItem.previousValue || <em className="history-empty-val">(empty)</em>}
                      </div>
                    </div>
                  )}

                  {selectedItem.newValue !== undefined && (
                    <div className="history-detail-field">
                      <span className="history-field-label">{t('history.newValue')}</span>
                      <div className="history-value-box is-next" data-testid="detail-new-value">
                        {selectedItem.newValue || <em className="history-empty-val">(empty)</em>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {isConfirmingClear && (
        <div
          className="history-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-history-title"
          data-testid="clear-history-modal"
        >
          <div className="history-modal-card">
            <div className="history-modal-icon">⚠️</div>
            <h4 id="clear-history-title" className="history-modal-title">
              {t('history.clearConfirmTitle')}
            </h4>
            <p className="history-modal-desc">{t('history.clearConfirmMessage')}</p>
            <div className="history-modal-actions">
              <button
                type="button"
                className="history-modal-btn is-cancel"
                onClick={() => setIsConfirmingClear(false)}
                data-testid="clear-history-cancel"
              >
                {t('history.clearCancel')}
              </button>
              <button
                type="button"
                className="history-modal-btn is-danger"
                onClick={handleConfirmClear}
                data-testid="clear-history-confirm"
              >
                {t('history.clearConfirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert Confirmation Modal */}
      {isConfirmingRevert && selectedItem && (
        <div
          className="history-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revert-history-title"
          data-testid="revert-history-modal"
        >
          <div className="history-modal-card">
            <div className="history-modal-icon">↶</div>
            <h4 id="revert-history-title" className="history-modal-title">
              {t('history.revertConfirm')}
            </h4>
            <p className="history-modal-desc">
              {selectedItem.summary} ({selectedItem.targetFile})
            </p>
            <div className="history-modal-actions">
              <button
                type="button"
                className="history-modal-btn is-cancel"
                onClick={() => setIsConfirmingRevert(null)}
                data-testid="revert-history-cancel"
              >
                {t('history.clearCancel')}
              </button>
              <button
                type="button"
                className="history-modal-btn is-primary"
                onClick={() => handleExecuteRevert(selectedItem)}
                disabled={isReverting}
                data-testid="revert-history-confirm"
              >
                {t('history.revert')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
