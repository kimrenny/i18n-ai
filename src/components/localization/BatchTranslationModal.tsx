import React, { useState } from 'react'
import type {
  BatchTranslationPlan,
  BatchProgress,
} from '../../services/aiBatchTranslation'
import { useTranslation } from '../../i18n/useTranslation'

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
  const { t } = useTranslation()
  const [filter, setFilter] = useState<'all' | 'ready' | 'error'>('all')

  const readyCount = plan.items.filter((i) => i.status === 'translated').length
  const errorCount = plan.items.filter((i) => i.status === 'error').length

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
              {isTranslating ? t('batch.progressTitle') : t('batch.reviewTitle')}
            </h2>
            <p className="modal-subtitle">
              {isTranslating
                ? t('batch.progressSubtitle')
                : t('translation.reviewBatchInstructions')}
            </p>
          </div>
          {!isTranslating && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              disabled={isWriting}
              aria-label={t('batch.closeAria')}
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
                {t('translation.progressTranslated', {
                  current: progress ? progress.successCount : 0,
                  total: plan.totalCount,
                })}
              </span>
              <span className="batch-progress-batches">
                {t('translation.progressBatches', {
                  current: progress ? progress.currentBatch : 1,
                  total: progress ? progress.totalBatches : 1,
                })}
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
                        t('batch.retryingBanner', { attempt: progress.retryAttempt || 1 })}
                    </span>
                  </div>
                )}

                <div className="batch-current-step">
                  <span className="batch-step-label">{t('common.file')}:</span>
                  <span className="batch-step-val">{progress.targetFile || '...'}</span>
                </div>

                <div className="batch-current-step">
                  <span className="batch-step-label">{t('batch.batchSizeLabel')}</span>
                  <span className="batch-step-val">
                    {t('translation.batchSize', { count: progress.keysInBatch || 0 })}
                  </span>
                </div>
              </div>
            )}

            <div className="modal-footer">
              <button
                type="button"
                className="modal-btn cancel-btn"
                onClick={onCancelTranslate}
                aria-label={t('batch.cancelAria')}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="batch-review-body">
            <div className="batch-filter-tabs">
              <button
                type="button"
                className={`batch-filter-tab ${filter === 'all' ? 'active-filter' : ''}`}
                onClick={() => setFilter('all')}
              >
                {t('translation.filterAll', { count: plan.totalCount })}
              </button>
              <button
                type="button"
                className={`batch-filter-tab ${filter === 'ready' ? 'active-filter' : ''}`}
                onClick={() => setFilter('ready')}
              >
                {t('translation.filterTranslated', { count: readyCount })}
              </button>
              {errorCount > 0 && (
                <button
                  type="button"
                  className={`batch-filter-tab error-filter ${filter === 'error' ? 'active-filter' : ''}`}
                  onClick={() => setFilter('error')}
                >
                  {t('translation.filterErrors', { count: errorCount })}
                </button>
              )}
            </div>

            <div className="batch-items-list">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`batch-item-card ${
                    item.status === 'translated'
                      ? 'item-ready'
                      : item.status === 'error'
                      ? 'item-error'
                      : 'item-pending'
                  }`}
                  data-testid={`batch-row-${item.targetFile}-${item.key}`}
                >
                  <div className="batch-item-header">
                    <div className="batch-item-key">
                      <span className="item-file-badge">{item.targetFile}</span>
                      <span className="item-key-text">{item.key}</span>
                    </div>
                    <div className="batch-item-status">
                      {item.status === 'translated' && (
                        <span className="status-pill ready-pill">{t('batch.statusTranslated')}</span>
                      )}
                      {item.status === 'error' && (
                        <span className="status-pill error-pill">{t('batch.statusError')}</span>
                      )}
                      {item.status === 'skipped' && (
                        <span className="status-pill skipped-pill">{t('batch.statusSkipped')}</span>
                      )}
                    </div>
                  </div>

                  <div className="batch-item-source">
                    <span className="source-label">{t('batch.sourceLabel', { lang: item.sourceLanguage })}</span>
                    <span className="source-val">{item.sourceValue}</span>
                  </div>

                  {item.status === 'error' ? (
                    <div className="batch-item-err-msg">
                      <span>{t('batch.errorPrefix', { error: item.errorMessage || '' })}</span>
                    </div>
                  ) : (
                    <div className="batch-item-target">
                      <label
                        htmlFor={`edit-input-${item.id}`}
                        className="target-label"
                      >
                        {t('batch.targetLabel', { lang: item.targetLanguage })}
                      </label>
                      <input
                        id={`edit-input-${item.id}`}
                        type="text"
                        className="batch-item-input"
                        value={item.proposedTranslation}
                        onChange={(e) =>
                          onUpdateProposedTranslation(item.id, e.target.value)
                        }
                        disabled={isWriting}
                        aria-label={t('batch.translationAria', { key: item.key })}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="modal-btn cancel-btn"
                onClick={onClose}
                disabled={isWriting}
              >
                {t('common.cancel')}
              </button>

              {errorCount > 0 && onRetryFailed && (
                <button
                  type="button"
                  className="modal-btn retry-btn"
                  onClick={onRetryFailed}
                  disabled={isWriting}
                >
                  {t('translation.retryFailed')} ({errorCount})
                </button>
              )}

              <button
                type="button"
                className="modal-btn apply-all-btn"
                onClick={onConfirmApplyAll}
                disabled={readyCount === 0 || isWriting}
              >
                {isWriting ? t('tree.saving') : `${t('translation.applyAll')} (${readyCount})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
