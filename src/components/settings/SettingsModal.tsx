import React from 'react'
import type { AppSettings, AiTranslationSettings } from '../../types/settings'

interface SettingsModalProps {
  settings: AppSettings
  isSaving: boolean
  saveError: string | null
  onUpdateAiSettings: (update: Partial<AiTranslationSettings>) => void
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isSaving,
  saveError,
  onUpdateAiSettings,
  onClose,
}) => {
  const requireConfirmation =
    settings.aiTranslation?.requireEditConfirmation ?? true

  const handleToggleConfirmation = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateAiSettings({
      requireEditConfirmation: e.target.checked,
    })
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="modal-container settings-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="settings-modal-title" className="modal-title">
              Settings
            </h2>
            <p className="modal-subtitle">
              Configure application preferences and AI translation permissions.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {saveError && (
          <div className="error-message settings-error-banner" role="alert">
            {saveError}
          </div>
        )}

        <div className="settings-modal-body">
          <section className="settings-section" aria-labelledby="ai-settings-heading">
            <h3 id="ai-settings-heading" className="settings-section-title">
              AI Translation
            </h3>

            <div className="setting-control-group">
              <label className="setting-checkbox-label">
                <input
                  type="checkbox"
                  className="setting-checkbox"
                  checked={requireConfirmation}
                  onChange={handleToggleConfirmation}
                  disabled={isSaving}
                  aria-describedby="ai-confirmation-desc"
                />
                <span className="setting-label-text">
                  Ask for confirmation before applying AI translations
                </span>
              </label>

              <p id="ai-confirmation-desc" className="setting-description">
                {requireConfirmation
                  ? 'When enabled, AI-generated translations must be reviewed and confirmed before they are written to localization files.'
                  : 'AI-generated translations can be applied automatically without confirmation.'}
              </p>
            </div>
          </section>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="modal-confirm-btn settings-done-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
