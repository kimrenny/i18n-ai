import React, { useState } from 'react'
import type {
  BatchTranslationPlan,
  BatchProgress,
} from '../../services/aiBatchTranslation'

interface BatchTranslationModalProps {
  plan: BatchTranslationPlan
  progress: BatchProgress | null
  isTranslating: boolean
  isWriting: boolean
  error: string | null
  onUpdateProposedTranslation: (id: string, newText: string) => void
  onCancelTranslate: () => void
  onRetryFailed?: () => void
  onConfirmApplyAll: () => void
  onClose: () => void
}

export const BatchTranslationModal: React.FC<BatchTranslationModalProps> = ({
  plan,
  progress,
  isTranslating,
  isWriting,
  error,
  onUpdateProposedTranslation,
  onCancelTranslate,
  onRetryFailed,
  onConfirmApplyAll,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'ready' | 'error'>('all')

  const readyCount = plan.items.filter((i) => i.status === 'translated').length
  const errorCount = plan.items.filter((i) => i.status === 'error').length
  const skippedCount = plan.items.filter((i) => i.status === 'skipped').length

  const filteredItems = plan.items.filter((item) => {
    if (filter === 'ready') return item.status === 'translated'
    if (filter === 'error') return item.status === 'error'
    return true
  })

  const progressPercent = progress && plan.totalCount > 0
    ? Math.min(100, Math.round((progress.successCount / plan.totalCount) * 100))
    : 0

  return (
    <div
      className="modal-overlay"
      onClick={isWriting || isTranslating ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
    >
      <div
        className="modal-container batch-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="batch-modal-title" className="modal-title">
              {isTranslating ? 'Translating All Untranslated Keys' : 'Review Batch Translations'}
            </h2>
            <p className="modal-subtitle">
              {isTranslating
                ? 'Generating optimized batch translations with rate-limit protection across all compared files...'
                : 'Review, edit, and apply generated translations to your localization files.'}
            </p>
          </div>
          {!isTranslating && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              disabled={isWriting}
              aria-label="Close batch review"
            >
              ✕
            </button>
          )}
        </div>

        {error && (
          <div className="error-message batch-modal-error" role="alert">
            {error}
          </div>
        )}

        {isTranslating ? (
          <div className="batch-progress-body">
            <div className="batch-progress-header">
              <span className="batch-progress-count">
                Translated {progress ? `${progress.successCount} / ${plan.totalCount}` : `0 / ${plan.totalCount}`}
              </span>
              <span className="batch-progress-batches">
                Batches: {progress ? `${progress.currentBatch} / ${progress.totalBatches}` : '1 / 1'}
              </span>
              <span className="batch-progress-pct">{progressPercent}%</span>
            </div>

            <div className="batch-progress-bar-container">
              <div
                className="batch-progress-bar-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {progress && (
              <div className="batch-progress-details">
                {progress.isRetrying && (
                  <div className="batch-retry-banner" role="status">
                    <span className="retry-spinner">⏳</span>
                    <span>
                      {progress.statusMessage ||
                        `Rate limit reached — retrying attempt ${progress.retryAttempt || 1}...`}
                    </span>
                  </div>
                )}

                <div className="batch-detail-row">
                  <span className="batch-detail-label">Status:</span>
                  <span className="batch-detail-val">
                    {progress.statusMessage ||
                      `Translating batch ${progress.currentBatch} / ${progress.totalBatches} (${progress.keysInBatch} keys)...`}
                  </span>
                </div>

                <div className="batch-detail-row">
                  <span className="batch-detail-label">Current File:</span>
                  <span className="batch-detail-val">{progress.targetFile || '...'}</span>
                </div>

                <div className="batch-detail-row">
                  <span className="batch-detail-label">Current Key:</span>
                  <span className="batch-detail-val key-highlight">
                    {progress.currentKey || '...'}
                  </span>
                </div>

                <div className="batch-detail-stats">
                  <span className="batch-success-count">
                    ✓ {progress.successCount} translated
                  </span>
                  {progress.errorCount > 0 && (
                    <span className="batch-error-count">
                      ✕ {progress.errorCount} failed
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="modal-actions batch-translating-actions">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={onCancelTranslate}
              >
                Cancel Translation
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="batch-stats-toolbar">
              <div className="batch-filter-tabs">
                <button
                  type="button"
                  className={`batch-filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All ({plan.totalCount})
                </button>
                <button
                  type="button"
                  className={`batch-filter-btn ${filter === 'ready' ? 'active' : ''}`}
                  onClick={() => setFilter('ready')}
                >
                  Ready to Apply ({readyCount})
                </button>
                {errorCount > 0 && (
                  <button
                    type="button"
                    className={`batch-filter-btn error-tab ${filter === 'error' ? 'active' : ''}`}
                    onClick={() => setFilter('error')}
                  >
                    Errors ({errorCount})
                  </button>
                )}
              </div>

              <div className="batch-summary-counts">
                {errorCount > 0 && onRetryFailed && (
                  <button
                    type="button"
                    className="batch-retry-failed-btn"
                    onClick={onRetryFailed}
                    disabled={isWriting}
                  >
                    ↻ Retry Failed ({errorCount})
                  </button>
                )}
                {skippedCount > 0 && (
                  <span className="batch-count-pill skipped-pill">
                    {skippedCount} skipped
                  </span>
                )}
              </div>
            </div>

            <div className="batch-items-list-container">
              {filteredItems.length > 0 ? (
                <div className="batch-items-table">
                  <div className="batch-table-header">
                    <span className="col-status">Status</span>
                    <span className="col-file">File</span>
                    <span className="col-key">Key</span>
                    <span className="col-source">Source Text</span>
                    <span className="col-translation">Proposed Translation</span>
                  </div>

                  <div className="batch-table-body">
                    {filteredItems.map((item) => (
                      <div
                        key={item.id}
                        className={`batch-table-row status-${item.status}`}
                        data-testid={`batch-row-${item.targetFile}-${item.key}`}
                      >
                        <div className="col-status">
                          {item.status === 'translated' && (
                            <span className="status-pill status-ready" title="Ready to apply">
                              ✓ Ready
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span
                              className="status-pill status-failed"
                              title={item.errorMessage || 'Translation failed'}
                            >
                              ✕ Error
                            </span>
                          )}
                          {item.status === 'skipped' && (
                            <span className="status-pill status-skipped" title="Skipped">
                              ↷ Skipped
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="status-pill status-pending">Pending</span>
                          )}
                        </div>

                        <div className="col-file">
                          <span className="batch-filename">{item.targetFile}</span>
                        </div>

                        <div className="col-key" title={item.key}>
                          <span className="batch-key">{item.key}</span>
                        </div>

                        <div className="col-source" title={item.sourceValue}>
                          <span className="batch-source-text">
                            {item.sourceValue || <em>(empty)</em>}
                          </span>
                        </div>

                        <div className="col-translation">
                          {item.status === 'translated' ? (
                            <input
                              type="text"
                              className="batch-translation-input"
                              value={item.proposedTranslation}
                              onChange={(e) =>
                                onUpdateProposedTranslation(item.id, e.target.value)
                              }
                              disabled={isWriting}
                              aria-label={`Translation for ${item.key}`}
                            />
                          ) : (
                            <span className="batch-error-msg">
                              {item.errorMessage || 'No translation'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="batch-empty-message">
                  No translation items found in this view.
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={onClose}
                disabled={isWriting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-confirm-btn"
                onClick={onConfirmApplyAll}
                disabled={isWriting || readyCount === 0}
              >
                {isWriting
                  ? 'Applying...'
                  : `✓ Apply All (${readyCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
