import React from 'react'
import { useTranslation } from '../../i18n/useTranslation'

interface DirtyPullModalProps {
  isOpen: boolean
  isPulling: boolean
  uncommittedCount: number
  error?: string | null
  onClose: () => void
  onConfirm: () => Promise<void> | void
}

export const DirtyPullModal: React.FC<DirtyPullModalProps> = ({
  isOpen,
  isPulling,
  uncommittedCount,
  error,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation()

  if (!isOpen) return null

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dirty-pull-modal-title"
      data-testid="dirty-pull-modal"
    >
      <div
        className="modal-container git-dirty-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="dirty-pull-modal-title" className="modal-title">
              ⚠️ {t('git.dirtyPullWarningTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('git.cancel')}
            disabled={isPulling}
          >
            ✕
          </button>
        </div>

        <div className="modal-body git-dirty-modal-body">
          <p className="git-dirty-warning-text">
            {t('git.dirtyPullWarningDesc')}
          </p>

          <div className="git-dirty-target-badge">
            <span className="git-dirty-target-label">{t('git.changedFiles')}:</span>
            <span className="git-dirty-target-name">{uncommittedCount}</span>
          </div>

          {error && (
            <div className="git-branch-server-error" role="alert" data-testid="dirty-pull-error">
              ⚠️ {error}
            </div>
          )}
        </div>

        <div className="modal-footer git-dirty-modal-footer">
          <button
            type="button"
            className="app-btn app-btn-secondary"
            onClick={onClose}
            disabled={isPulling}
            data-testid="dirty-pull-cancel-btn"
          >
            {t('git.cancel')}
          </button>
          <button
            type="button"
            className="app-btn app-btn-primary"
            onClick={onConfirm}
            disabled={isPulling}
            data-testid="dirty-pull-confirm-btn"
          >
            {isPulling ? t('git.pulling') : t('git.proceedPull')}
          </button>
        </div>
      </div>
    </div>
  )
}
