import React, { useState } from 'react'
import type { MissingKeysAdditionPlan } from '../../types/localization'
import { resolveLanguageFromFilename } from '../../services/aiTranslation'
import { getLanguageDisplayName } from '../../services/localizationCoverage'
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
  const [selectedFilename, setSelectedFilename] = useState<string>(
    plan.filesToModify[0]?.filename || ''
  )

  const activeFile =
    plan.filesToModify.find((f) => f.filename === selectedFilename) ||
    plan.filesToModify[0]

  const activeLangCode = activeFile ? resolveLanguageFromFilename(activeFile.filename) : ''
  const activeLangName = activeFile ? getLanguageDisplayName(activeLangCode) : ''

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t('addMissing.dialogAria')}>
      <div className="modal-container add-missing-modal-container">
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

        <div className="add-missing-body-layout">
          {/* Left Column: Languages to update selector */}
          <aside className="add-missing-sidebar" aria-label="Languages to update">
            <span className="add-missing-sidebar-title">
              {t('addMissing.filesToModify')}
            </span>
            <div className="add-missing-lang-list" role="tablist">
              {plan.filesToModify.map((file) => {
                const langCode = resolveLanguageFromFilename(file.filename)
                const langName = getLanguageDisplayName(langCode)
                const isSelected = activeFile && file.filename === activeFile.filename

                return (
                  <button
                    key={file.path}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`add-missing-lang-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedFilename(file.filename)}
                    data-testid={`lang-item-${file.filename}`}
                  >
                    <div className="lang-item-info">
                      <span className="lang-item-name">{langName}</span>
                      <span className="lang-item-file">{file.filename}</span>
                    </div>
                    <span className="lang-item-badge">
                      +{file.keysToAdd.length}
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          {/* Right Column: Preview of the selected language */}
          <main className="add-missing-preview-panel" data-testid={`preview-panel-${activeFile?.filename || 'none'}`}>
            {activeFile ? (
              <>
                <header className="add-missing-preview-header">
                  <div className="preview-header-left">
                    <h3 className="preview-lang-title">{activeLangName}</h3>
                    <span className="preview-file-tag">{activeFile.filename}</span>
                  </div>
                  <span className="preview-file-badge">
                    {t('addMissing.keysBadge', { count: activeFile.keysToAdd.length })}
                  </span>
                </header>

                <div className="preview-keys-scroll">
                  {activeFile.keysToAdd.map((k) => (
                    <div key={k.key} className="preview-key-entry">
                      <span className="preview-key-path" title={k.key}>{k.key}</span>
                      <div className="preview-key-val-row">
                        <span className="preview-key-arrow">→</span>
                        <span className="preview-key-val"><code>""</code></span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="preview-empty-state">
                No file selected
              </div>
            )}
          </main>
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
