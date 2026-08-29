import React, { useState } from 'react'
import type {
  AppSettings,
  AiTranslationSettings,
  AiProviderId,
  TranslationEngine,
  FreeProviderId,
} from '../../types/settings'
import {
  DEFAULT_FREE_TRANSLATION_SETTINGS,
} from '../../types/settings'
import {
  AI_PROVIDERS,
  getProviderDefinition,
} from '../../services/aiProviderRegistry'
import {
  FREE_PROVIDERS,
  getFreeProviderDefinition,
} from '../../services/freeProviderRegistry'

interface SettingsModalProps {
  settings: AppSettings
  isSaving: boolean
  saveError: string | null
  onUpdateAiSettings: (update: Partial<AiTranslationSettings>) => void
  onUpdateTranslationSettings?: (update: Partial<AppSettings>) => void
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isSaving,
  saveError,
  onUpdateAiSettings,
  onUpdateTranslationSettings,
  onClose,
}) => {
  const [selectedEngine, setSelectedEngine] = useState<TranslationEngine>(
    settings.engine || 'ai'
  )
  const [selectedAiProvider, setSelectedAiProvider] = useState<AiProviderId>(
    settings.aiTranslation?.provider || 'mock'
  )
  const [selectedFreeProvider, setSelectedFreeProvider] = useState<FreeProviderId>(
    settings.freeTranslation?.provider || 'libretranslate'
  )

  const currentEngine: TranslationEngine = selectedEngine
  const currentAiProviderId: AiProviderId = selectedAiProvider
  const currentAiConfig =
    settings.aiTranslation?.providers?.[currentAiProviderId] || {
      model: getProviderDefinition(currentAiProviderId).defaultModel,
    }

  const currentFreeProviderId: FreeProviderId = selectedFreeProvider
  const currentFreeConfig =
    settings.freeTranslation?.providers?.[currentFreeProviderId] ||
    DEFAULT_FREE_TRANSLATION_SETTINGS.providers[currentFreeProviderId]

  const requireConfirmation =
    settings.aiTranslation?.requireEditConfirmation ?? true

  const [showAiApiKey, setShowAiApiKey] = useState(false)
  const [showFreeApiKey, setShowFreeApiKey] = useState(false)

  const aiProviderDef = getProviderDefinition(currentAiProviderId)
  const freeProviderDef = getFreeProviderDefinition(currentFreeProviderId)

  const handleEngineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newEngine = e.target.value as TranslationEngine
    setSelectedEngine(newEngine)
    if (onUpdateTranslationSettings) {
      onUpdateTranslationSettings({ engine: newEngine })
    }
  }

  const handleAiProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as AiProviderId
    setSelectedAiProvider(newProvider)
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

  const handleAiModelChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const newModel = e.target.value
    onUpdateAiSettings({
      providers: {
        ...settings.aiTranslation.providers,
        [currentAiProviderId]: {
          ...currentAiConfig,
          model: newModel,
        },
      },
    })
  }

  const handleAiApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newApiKey = e.target.value
    onUpdateAiSettings({
      providers: {
        ...settings.aiTranslation.providers,
        [currentAiProviderId]: {
          ...currentAiConfig,
          apiKey: newApiKey,
        },
      },
    })
  }

  const handleAiBaseUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBaseUrl = e.target.value
    onUpdateAiSettings({
      providers: {
        ...settings.aiTranslation.providers,
        [currentAiProviderId]: {
          ...currentAiConfig,
          baseUrl: newBaseUrl,
        },
      },
    })
  }

  const handleFreeProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as FreeProviderId
    setSelectedFreeProvider(newProvider)
    const newDef = getFreeProviderDefinition(newProvider)
    const existingConfig = settings.freeTranslation?.providers?.[newProvider] || {
      baseUrl: newDef.defaultBaseUrl,
      apiKey: '',
      email: '',
    }

    if (onUpdateTranslationSettings) {
      onUpdateTranslationSettings({
        freeTranslation: {
          provider: newProvider,
          providers: {
            ...(settings.freeTranslation?.providers || DEFAULT_FREE_TRANSLATION_SETTINGS.providers),
            [newProvider]: existingConfig,
          },
        },
      })
    }
  }

  const handleFreeBaseUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    if (onUpdateTranslationSettings) {
      onUpdateTranslationSettings({
        freeTranslation: {
          provider: currentFreeProviderId,
          providers: {
            ...(settings.freeTranslation?.providers || DEFAULT_FREE_TRANSLATION_SETTINGS.providers),
            [currentFreeProviderId]: {
              ...currentFreeConfig,
              baseUrl: newUrl,
            },
          },
        },
      })
    }
  }

  const handleFreeApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value
    if (onUpdateTranslationSettings) {
      onUpdateTranslationSettings({
        freeTranslation: {
          provider: currentFreeProviderId,
          providers: {
            ...(settings.freeTranslation?.providers || DEFAULT_FREE_TRANSLATION_SETTINGS.providers),
            [currentFreeProviderId]: {
              ...currentFreeConfig,
              apiKey: newKey,
            },
          },
        },
      })
    }
  }

  const handleFreeEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value
    if (onUpdateTranslationSettings) {
      onUpdateTranslationSettings({
        freeTranslation: {
          provider: currentFreeProviderId,
          providers: {
            ...(settings.freeTranslation?.providers || DEFAULT_FREE_TRANSLATION_SETTINGS.providers),
            [currentFreeProviderId]: {
              ...currentFreeConfig,
              email: newEmail,
            },
          },
        },
      })
    }
  }

  const handleToggleConfirmation = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateAiSettings({
      requireEditConfirmation: e.target.checked,
    })
    if (onUpdateTranslationSettings) {
      onUpdateTranslationSettings({
        aiTranslation: {
          ...settings.aiTranslation,
          requireEditConfirmation: e.target.checked,
        },
      })
    }
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
              Configure translation engines, provider credentials, and review policies.
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
          {/* Engine Selection Section */}
          <section className="settings-section" aria-labelledby="engine-settings-heading">
            <h3 id="engine-settings-heading" className="settings-section-title">
              Translation Engine
            </h3>

            <div className="setting-field-group">
              <label htmlFor="translation-engine-select" className="setting-field-label">
                Engine:
              </label>
              <select
                id="translation-engine-select"
                className="setting-select"
                value={currentEngine}
                onChange={handleEngineChange}
                disabled={isSaving}
                aria-label="Select Translation Engine"
              >
                <option value="ai">AI Translation (OpenAI, Gemini, Claude, Mistral, Ollama...)</option>
                <option value="free">Free Translator (LibreTranslate, MyMemory)</option>
              </select>
              <span className="setting-field-hint">
                {currentEngine === 'ai'
                  ? 'Uses generative AI models for context-aware localization.'
                  : 'Uses free public translation services or self-hosted servers without AI API costs.'}
              </span>
            </div>
          </section>

          {/* AI Settings Section */}
          {currentEngine === 'ai' && (
            <section className="settings-section" aria-labelledby="ai-settings-heading">
              <h3 id="ai-settings-heading" className="settings-section-title">
                AI Translation Provider
              </h3>

              <div className="setting-field-group">
                <label htmlFor="ai-provider-select" className="setting-field-label">
                  AI Provider:
                </label>
                <select
                  id="ai-provider-select"
                  className="setting-select"
                  value={currentAiProviderId}
                  onChange={handleAiProviderChange}
                  disabled={isSaving}
                  aria-label="Select AI Provider"
                >
                  {AI_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="setting-field-hint">{aiProviderDef.description}</span>
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
                    value={currentAiConfig.model || aiProviderDef.defaultModel}
                    onChange={handleAiModelChange}
                    disabled={isSaving}
                    list="popular-models-list"
                    placeholder={aiProviderDef.defaultModel}
                    aria-label="AI Model"
                  />
                  <datalist id="popular-models-list">
                    {aiProviderDef.popularModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              </div>

              {aiProviderDef.requiresApiKey && (
                <div className="setting-field-group">
                  <label htmlFor="ai-api-key-input" className="setting-field-label">
                    API Key:
                  </label>
                  <div className="setting-input-wrapper with-toggle">
                    <input
                      id="ai-api-key-input"
                      type={showAiApiKey ? 'text' : 'password'}
                      className="setting-text-input"
                      value={currentAiConfig.apiKey || ''}
                      onChange={handleAiApiKeyChange}
                      disabled={isSaving}
                      placeholder={`Enter ${aiProviderDef.name} API key...`}
                      aria-label={`${aiProviderDef.name} API Key`}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="toggle-api-key-btn"
                      onClick={() => setShowAiApiKey((v) => !v)}
                      tabIndex={-1}
                    >
                      {showAiApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <span className="setting-field-hint">
                    Stored securely in local application settings. Never shared elsewhere.
                  </span>
                </div>
              )}

              {currentAiProviderId === 'ollama' && (
                <div className="setting-field-group">
                  <label htmlFor="ai-base-url-input" className="setting-field-label">
                    Ollama Base URL:
                  </label>
                  <input
                    id="ai-base-url-input"
                    type="text"
                    className="setting-text-input"
                    value={currentAiConfig.baseUrl || 'http://localhost:11434'}
                    onChange={handleAiBaseUrlChange}
                    disabled={isSaving}
                    placeholder="http://localhost:11434"
                    aria-label="Ollama Base URL"
                  />
                </div>
              )}
            </section>
          )}

          {/* Free Translation Settings Section */}
          {currentEngine === 'free' && (
            <section className="settings-section" aria-labelledby="free-settings-heading">
              <h3 id="free-settings-heading" className="settings-section-title">
                Free Translation Configuration
              </h3>

              <div className="setting-field-group">
                <label htmlFor="free-provider-select" className="setting-field-label">
                  Free Provider:
                </label>
                <select
                  id="free-provider-select"
                  className="setting-select"
                  value={currentFreeProviderId}
                  onChange={handleFreeProviderChange}
                  disabled={isSaving}
                  aria-label="Select Free Provider"
                >
                  {FREE_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="setting-field-hint">{freeProviderDef.description}</span>
              </div>

              {currentFreeProviderId === 'libretranslate' && (
                <>
                  <div className="setting-field-group">
                    <label htmlFor="libre-base-url-input" className="setting-field-label">
                      LibreTranslate Server URL:
                    </label>
                    <input
                      id="libre-base-url-input"
                      type="text"
                      className="setting-text-input"
                      value={currentFreeConfig.baseUrl || 'http://localhost:5000'}
                      onChange={handleFreeBaseUrlChange}
                      disabled={isSaving}
                      placeholder="http://localhost:5000"
                      aria-label="LibreTranslate Server URL"
                    />
                    <span className="setting-field-hint">
                      Connects to your local or self-hosted LibreTranslate instance.
                    </span>
                  </div>

                  <div className="setting-field-group">
                    <label htmlFor="libre-api-key-input" className="setting-field-label">
                      API Key (Optional):
                    </label>
                    <div className="setting-input-wrapper with-toggle">
                      <input
                        id="libre-api-key-input"
                        type={showFreeApiKey ? 'text' : 'password'}
                        className="setting-text-input"
                        value={currentFreeConfig.apiKey || ''}
                        onChange={handleFreeApiKeyChange}
                        disabled={isSaving}
                        placeholder="Leave empty if self-hosted without API key..."
                        aria-label="LibreTranslate API Key"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="toggle-api-key-btn"
                        onClick={() => setShowFreeApiKey((v) => !v)}
                        tabIndex={-1}
                      >
                        {showFreeApiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {currentFreeProviderId === 'mymemory' && (
                <>
                  <div className="setting-field-group">
                    <label htmlFor="mymemory-email-input" className="setting-field-label">
                      Contact Email (Optional):
                    </label>
                    <input
                      id="mymemory-email-input"
                      type="email"
                      className="setting-text-input"
                      value={currentFreeConfig.email || ''}
                      onChange={handleFreeEmailChange}
                      disabled={isSaving}
                      placeholder="e.g. user@example.com"
                      aria-label="MyMemory Email"
                    />
                    <span className="setting-field-hint">
                      Providing an email raises MyMemory daily rate limits from 5,000 to 10,000 characters.
                    </span>
                  </div>

                  <div className="setting-field-group">
                    <label htmlFor="mymemory-api-key-input" className="setting-field-label">
                      API Key (Optional):
                    </label>
                    <div className="setting-input-wrapper with-toggle">
                      <input
                        id="mymemory-api-key-input"
                        type={showFreeApiKey ? 'text' : 'password'}
                        className="setting-text-input"
                        value={currentFreeConfig.apiKey || ''}
                        onChange={handleFreeApiKeyChange}
                        disabled={isSaving}
                        placeholder="Optional MyMemory API key..."
                        aria-label="MyMemory API Key"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="toggle-api-key-btn"
                        onClick={() => setShowFreeApiKey((v) => !v)}
                        tabIndex={-1}
                      >
                        {showFreeApiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {/* General Confirmation Policy Section */}
          <section className="settings-section" aria-labelledby="confirmation-settings-heading">
            <h3 id="confirmation-settings-heading" className="settings-section-title">
              Confirmation Policy
            </h3>

            <div className="setting-control-group">
              <label className="setting-checkbox-label">
                <input
                  type="checkbox"
                  className="setting-checkbox"
                  checked={requireConfirmation}
                  onChange={handleToggleConfirmation}
                  disabled={isSaving}
                  aria-describedby="confirmation-desc"
                />
                <span className="setting-label-text">
                  Ask for confirmation before applying generated translations
                </span>
              </label>

              <p id="confirmation-desc" className="setting-description">
                {requireConfirmation
                  ? 'When enabled, generated translations must be reviewed and confirmed in the review modal before they are written to localization files.'
                  : 'Generated translations are validated and applied automatically without an intermediate review modal.'}
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
