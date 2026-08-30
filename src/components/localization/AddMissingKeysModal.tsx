import React, { useState } from 'react'
import type { MissingKeysAdditionPlan } from '../../types/localization'
import { useTranslation } from '../../i18n/useTranslation'

interface AddMissingKeysModalProps {
  plan: MissingKeysAdditionPlan
  isWriting: boolean
  onConfirm: () => void
  onClose: () => void
}

export const AddMissingKeysModal: React.FC<AddMissingKeysModalProps> = ({
  plan,
  isWriting,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation()
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(plan.filesToModify.map((f) => f.filename))
  )

  const toggleFileExpanded = (filename: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) {
        next.delete(filename)
      } else {
        next.add(filename)
      }
      return next
    })
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t('addMissing.dialogAria')}>
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 className="modal-title">{t('addMissing.title')}</h2>
            <p className="modal-subtitle">
              {t('addMissing.subtitle')}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isWriting}
            aria-label={t('addMissing.closeAria')}
          >
            ✕
          </button>
        </div>

        <div className="modal-stats-bar">
          <div className="modal-stat">
            <span className="modal-stat-label">{t('addMissing.filesToModify')}</span>
            <span className="modal-stat-value">{plan.filesToModify.length}</span>
          </div>
          <div className="modal-stat">
            <span className="modal-stat-label">{t('addMissing.totalKeysToAdd')}</span>
            <span className="modal-stat-value modal-stat-highlight">
              {plan.totalKeysToAdd}
            </span>
          </div>
        </div>

        {plan.hasConflicts && (
          <div className="modal-conflicts-box" role="alert">
            <div className="conflict-header">
              <span className="conflict-icon">⚠️</span>
              <strong>{t('addMissing.conflictsDetected')}</strong>
            </div>
            <ul className="conflict-list">
              {plan.conflictMessages.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
            <p className="conflict-note">
              {t('addMissing.conflictNote')}
            </p>
          </div>
        )}

        <div className="modal-files-list">
          {plan.filesToModify.map((file) => {
            const isExpanded = expandedFiles.has(file.filename)
            return (
              <div key={file.path} className="modal-file-card" data-testid={`preview-file-${file.filename}`}>
                <button
                  type="button"
                  className="modal-file-header"
                  onClick={() => toggleFileExpanded(file.filename)}
                  aria-expanded={isExpanded}
                >
                  <div className="modal-file-info">
                    <span className="modal-file-arrow">{isExpanded ? '▼' : '▶'}</span>
                    <span className="modal-file-name">{file.filename}</span>
                    <span className="modal-file-path">{file.path}</span>
                  </div>
                  <span className="modal-file-badge">
                    {t('addMissing.keysBadge', { count: file.keysToAdd.length })}
                  </span>
                </button>

                {isExpanded && (
                  <div className="modal-keys-table">
                    {file.keysToAdd.map((k) => (
                      <div key={k.key} className="modal-key-row">
                        <span className="modal-key-name">{k.key}</span>
                        <span className="modal-key-arrow">→</span>
                        <span className="modal-key-val"><code>""</code></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="modal-cancel-btn"
            onClick={onClose}
            disabled={isWriting}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="modal-confirm-btn"
            onClick={onConfirm}
            disabled={isWriting || plan.totalKeysToAdd === 0}
          >
            {isWriting ? t('addMissing.writing') : t('addMissing.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
