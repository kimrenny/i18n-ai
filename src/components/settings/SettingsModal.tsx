import React, { useState } from 'react'
import type {
  AppSettings,
  AiTranslationSettings,
  AiProviderId,
} from '../../types/settings'
import {
  AI_PROVIDERS,
  getProviderDefinition,
} from '../../services/aiProviderRegistry'

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
  const currentProviderId: AiProviderId =
    settings.aiTranslation?.provider || 'mock'
  const currentConfig =
    settings.aiTranslation?.providers?.[currentProviderId] || {
      model: getProviderDefinition(currentProviderId).defaultModel,
    }
  const requireConfirmation =
    settings.aiTranslation?.requireEditConfirmation ?? true

  const [showApiKey, setShowApiKey] = useState(false)

  const providerDef = getProviderDefinition(currentProviderId)

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as AiProviderId
    const newDef = getProviderDefinition(newProvider)
    const existingConfig = settings.aiTranslation?.providers?.[newProvider] || {
      model: newDef.defaultModel,
      apiKey: '',
      baseUrl: newDef.defaultBaseUrl,
    }

    onUpdateAiSettings({
      provider: newProvider,
      providers: {
        ...settings.aiTranslation.providers,
        [newProvider]: existingConfig,
      },
    })
  }

  const handleModelChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const newModel = e.target.value
    onUpdateAiSettings({
      providers: {
        ...settings.aiTranslation.providers,
        [currentProviderId]: {
          ...currentConfig,
          model: newModel,
        },
      },
    })
  }

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newApiKey = e.target.value
    onUpdateAiSettings({
      providers: {
        ...settings.aiTranslation.providers,
        [currentProviderId]: {
          ...currentConfig,
          apiKey: newApiKey,
        },
      },
    })
  }

  const handleBaseUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBaseUrl = e.target.value
    onUpdateAiSettings({
      providers: {
        ...settings.aiTranslation.providers,
        [currentProviderId]: {
          ...currentConfig,
          baseUrl: newBaseUrl,
        },
      },
    })
  }

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
              Configure multi-provider AI translation models and permissions.
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
              AI Translation Provider
            </h3>

            <div className="setting-field-group">
              <label htmlFor="ai-provider-select" className="setting-field-label">
                Provider:
              </label>
              <select
                id="ai-provider-select"
                className="setting-select"
                value={currentProviderId}
                onChange={handleProviderChange}
                disabled={isSaving}
                aria-label="Select AI Provider"
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="setting-field-hint">{providerDef.description}</span>
            </div>

            <div className="setting-field-group">
              <label htmlFor="ai-model-input" className="setting-field-label">
                Model:
              </label>
              <div className="setting-input-wrapper">
                <input
                  id="ai-model-input"
                  type="text"
                  className="setting-text-input"
                  value={currentConfig.model || providerDef.defaultModel}
                  onChange={handleModelChange}
                  disabled={isSaving}
                  list="popular-models-list"
                  placeholder={providerDef.defaultModel}
                  aria-label="AI Model"
                />
                <datalist id="popular-models-list">
                  {providerDef.popularModels.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>

            {providerDef.requiresApiKey && (
              <div className="setting-field-group">
                <label htmlFor="ai-api-key-input" className="setting-field-label">
                  API Key:
                </label>
                <div className="setting-input-wrapper with-toggle">
                  <input
                    id="ai-api-key-input"
                    type={showApiKey ? 'text' : 'password'}
                    className="setting-text-input"
                    value={currentConfig.apiKey || ''}
                    onChange={handleApiKeyChange}
                    disabled={isSaving}
                    placeholder={`Enter ${providerDef.name} API key...`}
                    aria-label={`${providerDef.name} API Key`}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="toggle-api-key-btn"
                    onClick={() => setShowApiKey((v) => !v)}
                    tabIndex={-1}
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <span className="setting-field-hint">
                  Stored securely in the local application settings. Never shared or transmitted elsewhere.
                </span>
              </div>
            )}

            {currentProviderId === 'ollama' && (
              <div className="setting-field-group">
                <label htmlFor="ai-base-url-input" className="setting-field-label">
                  Ollama Base URL:
                </label>
                <input
                  id="ai-base-url-input"
                  type="text"
                  className="setting-text-input"
                  value={currentConfig.baseUrl || 'http://localhost:11434'}
                  onChange={handleBaseUrlChange}
                  disabled={isSaving}
                  placeholder="http://localhost:11434"
                  aria-label="Ollama Base URL"
                />
              </div>
            )}

            <div className="setting-control-group setting-permission-divider">
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
