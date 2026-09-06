import React from 'react'
import { useTranslation } from '../../i18n/useTranslation'

interface DirtyCheckoutModalProps {
  isOpen: boolean
  targetBranch: string
  isSwitching: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => Promise<void> | void
}

export const DirtyCheckoutModal: React.FC<DirtyCheckoutModalProps> = ({
  isOpen,
  targetBranch,
  isSwitching,
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
      aria-labelledby="dirty-checkout-modal-title"
      data-testid="dirty-checkout-modal"
    >
      <div
        className="modal-container git-dirty-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="dirty-checkout-modal-title" className="modal-title">
              ⚠️ {t('git.dirtyWarningTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('git.cancel')}
            disabled={isSwitching}
          >
            ✕
          </button>
        </div>

        <div className="modal-body git-dirty-modal-body">
          <p className="git-dirty-warning-text">
            {t('git.dirtyWarningDesc')}
          </p>

          <div className="git-dirty-target-badge">
            <span className="git-dirty-target-label">{t('git.switchBranch')}:</span>
            <span className="git-dirty-target-name">{targetBranch}</span>
          </div>

          {error && (
            <div className="git-branch-server-error" role="alert" data-testid="dirty-switch-error">
              ⚠️ {error}
            </div>
          )}
        </div>

        <div className="modal-footer git-dirty-modal-footer">
          <button
            type="button"
            className="app-btn app-btn-secondary"
            onClick={onClose}
            disabled={isSwitching}
            data-testid="dirty-switch-cancel-btn"
          >
            {t('git.cancel')}
          </button>
          <button
            type="button"
            className="app-btn app-btn-primary"
            onClick={onConfirm}
            disabled={isSwitching}
            data-testid="dirty-switch-confirm-btn"
          >
            {isSwitching ? t('git.switchingBranch') : t('git.proceedSwitch')}
          </button>
        </div>
      </div>
    </div>
  )
}
