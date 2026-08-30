import React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../i18n/useTranslation'

interface DeleteSectionModalProps {
  sectionPath: string
  targetFilename: string
  entryCount: number
  isDeleting: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const DeleteSectionModal: React.FC<DeleteSectionModalProps> = ({
  sectionPath,
  targetFilename,
  entryCount,
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation()

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="modal-overlay"
      onClick={isDeleting ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-section-modal-title"
    >
      <div
        className="modal-container delete-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="delete-section-modal-title" className="modal-title">
              {t('contextMenu.deleteSectionTitle')}
            </h2>
            <p className="modal-subtitle">
              {t('contextMenu.deleteSectionSubtitle')}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        <div className="delete-modal-body">
          <div className="delete-warning-banner" role="alert">
            <span className="warning-icon">⚠️</span>
            <div className="warning-text">
              <p className="warning-main-msg">
                {t('contextMenu.deleteSectionMessage', {
                  section: sectionPath,
                  count: entryCount,
                  file: targetFilename,
                })}
              </p>
              <p className="warning-sub-msg">
                {t('contextMenu.deleteUndoNote')}
              </p>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="modal-cancel-btn"
            onClick={onCancel}
            disabled={isDeleting}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="modal-confirm-btn delete-confirm-btn"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? t('tree.saving') : t('contextMenu.confirmDeleteSectionBtn')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
