import React, { useState, useEffect } from 'react'
import type {
  AppSettings,
  AiTranslationSettings,
  AiProviderId,
  TranslationEngine,
  FreeProviderId,
  AppLanguage,
} from '../../types/settings'
import {
  DEFAULT_FREE_TRANSLATION_SETTINGS,
  DEFAULT_APP_SETTINGS,
  SUPPORTED_LANGUAGES,
} from '../../types/settings'
import {
  type FeatureId,
  type FeatureToggleState,
  getAllFeatureDefinitions,
  getAllFeatureCategories,
  isFeatureEnabled,
} from '../../types/features'
import {
  AI_PROVIDERS,
  getProviderDefinition,
} from '../../services/aiProviderRegistry'
import {
  FREE_PROVIDERS,
  getFreeProviderDefinition,
} from '../../services/freeProviderRegistry'
import { useTranslation } from '../../i18n/useTranslation'

export type SettingsTab = 'translation' | 'features'

interface SettingsModalProps {
  settings: AppSettings
  isSaving: boolean
  saveError: string | null
  initialTab?: SettingsTab
  onUpdateAiSettings: (update: Partial<AiTranslationSettings>) => void
  onUpdateTranslationSettings?: (update: Partial<AppSettings>) => void
  onUpdateFeatureSettings?: (update: Partial<FeatureToggleState>) => void
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isSaving,
  saveError,
  initialTab = 'translation',
  onUpdateAiSettings,
  onUpdateTranslationSettings,
  onUpdateFeatureSettings,
  onClose,
}) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)

  const isAiEnabled = isFeatureEnabled(settings.features, 'ai_translation')
  const isFreeEnabled = isFeatureEnabled(settings.features, 'free_translation')

  const [selectedEngine, setSelectedEngine] = useState<TranslationEngine>(
    settings.engine || 'ai'
  )

  useEffect(() => {
    if (settings.engine) {
      setSelectedEngine(settings.engine)
    }
  }, [settings.engine])

  const effectiveEngine: TranslationEngine | null =
    (selectedEngine === 'free'
      ? (isFreeEnabled ? 'free' : (isAiEnabled ? 'ai' : null))
      : (isAiEnabled ? 'ai' : (isFreeEnabled ? 'free' : null)))

  const [selectedAiProvider, setSelectedAiProvider] = useState<AiProviderId>(
    settings.aiTranslation?.provider || 'mock'
  )
  const [selectedFreeProvider, setSelectedFreeProvider] = useState<FreeProviderId>(
    settings.freeTranslation?.provider || 'libretranslate'
  )

  const currentEngine: TranslationEngine | null = effectiveEngine
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

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value as AppLanguage
    if (onUpdateTranslationSettings) {
      onUpdateTranslationSettings({ language: newLang })
    }
  }

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
    if (onUpdateAiSettings) {
      onUpdateAiSettings({
        requireEditConfirmation: e.target.checked,
      })
    } else if (onUpdateTranslationSettings) {
      onUpdateTranslationSettings({
        aiTranslation: {
          ...settings.aiTranslation,
          requireEditConfirmation: e.target.checked,
        },
      })
    }
  }

  const handleFeatureToggle = (id: FeatureId, enabled: boolean) => {
    const currentFeatures = settings.features || DEFAULT_APP_SETTINGS.features
    const updatedFeatures = {
      ...currentFeatures,
      [id]: enabled,
    }

    // Check if toggling an engine feature affects the active engine
    let engineUpdate: TranslationEngine | undefined = undefined
    if (id === 'ai_translation' && !enabled && (settings.engine || 'ai') === 'ai') {
      const freeOn = isFeatureEnabled(updatedFeatures, 'free_translation')
      if (freeOn) {
        engineUpdate = 'free'
      }
    } else if (id === 'free_translation' && !enabled && settings.engine === 'free') {
      const aiOn = isFeatureEnabled(updatedFeatures, 'ai_translation')
      if (aiOn) {
        engineUpdate = 'ai'
      }
    }

    if (engineUpdate && onUpdateTranslationSettings) {
      onUpdateTranslationSettings({
        engine: engineUpdate,
        features: updatedFeatures,
      })
    } else if (onUpdateFeatureSettings) {
      onUpdateFeatureSettings({ [id]: enabled })
    } else if (onUpdateTranslationSettings) {
      onUpdateTranslationSettings({
        features: updatedFeatures,
      })
    }
  }

  const featureCategories = getAllFeatureCategories()
  const allFeatureDefinitions = getAllFeatureDefinitions()

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
              {t('settings.title')}
            </h2>
            <p className="modal-subtitle">
              {t('settings.subtitle')}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('settings.closeAria')}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          className="settings-tabs-bar"
          role="tablist"
          aria-label={t('settings.title')}
        >
          <button
            type="button"
            role="tab"
            id="settings-tab-translation"
            aria-controls="settings-panel-translation"
            aria-selected={activeTab === 'translation'}
            className={`settings-tab-btn ${activeTab === 'translation' ? 'active' : ''}`}
            onClick={() => setActiveTab('translation')}
          >
            {t('settings.tabTranslation')}
          </button>
          <button
            type="button"
            role="tab"
            id="settings-tab-features"
            aria-controls="settings-panel-features"
            aria-selected={activeTab === 'features'}
            className={`settings-tab-btn ${activeTab === 'features' ? 'active' : ''}`}
            onClick={() => setActiveTab('features')}
          >
            {t('settings.tabFeatures')}
          </button>
        </div>

        {saveError && (
          <div className="error-message settings-error-banner" role="alert">
            {saveError}
          </div>
        )}

        <div className="settings-modal-body">
          {activeTab === 'translation' && (
            <div
              id="settings-panel-translation"
              role="tabpanel"
              aria-labelledby="settings-tab-translation"
            >
              {/* Application Language Section */}
              <section className="settings-section" aria-labelledby="language-settings-heading">
                <h3 id="language-settings-heading" className="settings-section-title">
                  {t('settings.appLanguage')}
                </h3>

                <div className="setting-field-group">
                  <label htmlFor="app-language-select" className="setting-field-label">
                    {t('settings.languageLabel')}
                  </label>
                  <select
                    id="app-language-select"
                    className="setting-select"
                    value={settings.language || 'en'}
                    onChange={handleLanguageChange}
                    disabled={isSaving}
                    aria-label={t('settings.selectLanguageAria')}
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.nativeName} ({lang.englishName})
                      </option>
                    ))}
                  </select>
                  <span className="setting-field-hint">
                    {t('settings.appLanguageHelp')}
                  </span>
                </div>
              </section>

              {/* Engine Selection Section */}
              <section className="settings-section" aria-labelledby="engine-settings-heading">
                <h3 id="engine-settings-heading" className="settings-section-title">
                  {t('settings.translationEngine')}
                </h3>

                {!isAiEnabled && !isFreeEnabled ? (
                  <div className="setting-field-group">
                    <p className="setting-field-hint" style={{ color: 'var(--text-muted)' }}>
                      {t('settings.featuresDescription')}
                    </p>
                  </div>
                ) : (
                  <div className="setting-field-group">
                    <label htmlFor="translation-engine-select" className="setting-field-label">
                      {t('settings.engineLabel')}
                    </label>
                    <select
                      id="translation-engine-select"
                      className="setting-select"
                      value={effectiveEngine || ''}
                      onChange={handleEngineChange}
                      disabled={isSaving || (isAiEnabled ? !isFreeEnabled : !isAiEnabled)}
                      aria-label={t('settings.selectEngineAria')}
                    >
                      {isAiEnabled && <option value="ai">{t('settings.engineAi')}</option>}
                      {isFreeEnabled && <option value="free">{t('settings.engineFree')}</option>}
                    </select>
                    <span className="setting-field-hint">
                      {effectiveEngine === 'ai'
                        ? t('settings.engineAiDesc')
                        : effectiveEngine === 'free'
                        ? t('settings.engineFreeDesc')
                        : ''}
                    </span>
                  </div>
                )}
              </section>

              {/* AI Settings Section */}
              {isAiEnabled && currentEngine === 'ai' && (
                <section className="settings-section" aria-labelledby="ai-settings-heading">
                  <h3 id="ai-settings-heading" className="settings-section-title">
                    {t('settings.aiSettingsHeader')}
                  </h3>

                  <div className="setting-field-group">
                    <label htmlFor="ai-provider-select" className="setting-field-label">
                      {t('settings.aiProvider')}:
                    </label>
                    <select
                      id="ai-provider-select"
                      className="setting-select"
                      value={currentAiProviderId}
                      onChange={handleAiProviderChange}
                      disabled={isSaving}
                      aria-label={t('settings.selectAiProviderAria')}
                    >
                      {AI_PROVIDERS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {t(`providers.${provider.id}.name`)}
                        </option>
                      ))}
                    </select>
                    <span className="setting-field-hint">
                      {t(`providers.${currentAiProviderId}.description`)}
                    </span>
                  </div>

                  {currentAiProviderId !== 'mock' && (
                    <>
                      <div className="setting-field-group">
                        <label htmlFor="ai-model-input" className="setting-field-label">
                          {t('settings.model')}:
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
                            aria-label={t('settings.aiModelAria')}
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
                            {t('settings.apiKey')}:
                          </label>
                          <div className="setting-input-wrapper with-toggle">
                            <input
                              id="ai-api-key-input"
                              type={showAiApiKey ? 'text' : 'password'}
                              className="setting-text-input"
                              value={currentAiConfig.apiKey || ''}
                              onChange={handleAiApiKeyChange}
                              disabled={isSaving}
                              placeholder={t('settings.apiKeyPlaceholder')}
                              aria-label={t('settings.apiKeyAria', { name: aiProviderDef.name })}
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <button
                              type="button"
                              className="toggle-api-key-btn"
                              onClick={() => setShowAiApiKey((v) => !v)}
                              tabIndex={-1}
                            >
                              {showAiApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
                            </button>
                          </div>
                          <span className="setting-field-hint">
                            {t('settings.apiKeyStorageHint')}
                          </span>
                        </div>
                      )}

                      {currentAiProviderId === 'ollama' && (
                        <div className="setting-field-group">
                          <label htmlFor="ai-base-url-input" className="setting-field-label">
                            {t('settings.ollamaBaseUrl')}
                          </label>
                          <input
                            id="ai-base-url-input"
                            type="text"
                            className="setting-text-input"
                            value={currentAiConfig.baseUrl || 'http://localhost:11434'}
                            onChange={handleAiBaseUrlChange}
                            disabled={isSaving}
                            placeholder="http://localhost:11434"
                            aria-label={t('settings.ollamaBaseUrlAria')}
                          />
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}

              {/* Free Settings Section */}
              {isFreeEnabled && currentEngine === 'free' && (
                <section className="settings-section" aria-labelledby="free-settings-heading">
                  <h3 id="free-settings-heading" className="settings-section-title">
                    {t('settings.freeSettingsHeader')}
                  </h3>

                  <div className="setting-field-group">
                    <label htmlFor="free-provider-select" className="setting-field-label">
                      {t('settings.freeProvider')}:
                    </label>
                    <select
                      id="free-provider-select"
                      className="setting-select"
                      value={currentFreeProviderId}
                      onChange={handleFreeProviderChange}
                      disabled={isSaving}
                      aria-label={t('settings.selectFreeProviderAria')}
                    >
                      {FREE_PROVIDERS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {t(`providers.${provider.id}.name`)}
                        </option>
                      ))}
                    </select>
                    <span className="setting-field-hint">
                      {t(`providers.${currentFreeProviderId}.description`)}
                    </span>
                  </div>

                  {currentFreeProviderId === 'libretranslate' && (
                    <>
                      <div className="setting-field-group">
                        <label htmlFor="libre-base-url-input" className="setting-field-label">
                          {t('settings.serverUrl')}
                        </label>
                        <input
                          id="libre-base-url-input"
                          type="text"
                          className="setting-text-input"
                          value={currentFreeConfig.baseUrl || freeProviderDef.defaultBaseUrl || ''}
                          onChange={handleFreeBaseUrlChange}
                          disabled={isSaving}
                          placeholder={freeProviderDef.defaultBaseUrl}
                          aria-label={t('settings.libreServerUrlAria')}
                        />
                        <span className="setting-field-hint">
                          {t('settings.libreServerHint')}
                        </span>
                      </div>

                      <div className="setting-field-group">
                        <label htmlFor="libre-api-key-input" className="setting-field-label">
                          {t('settings.apiKeyOptional')}
                        </label>
                        <div className="setting-input-wrapper with-toggle">
                          <input
                            id="libre-api-key-input"
                            type={showFreeApiKey ? 'text' : 'password'}
                            className="setting-text-input"
                            value={currentFreeConfig.apiKey || ''}
                            onChange={handleFreeApiKeyChange}
                            disabled={isSaving}
                            placeholder={t('settings.libreApiKeyPlaceholder')}
                            aria-label={t('settings.libreApiKeyAria')}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <button
                            type="button"
                            className="toggle-api-key-btn"
                            onClick={() => setShowFreeApiKey((v) => !v)}
                            tabIndex={-1}
                          >
                            {showFreeApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {currentFreeProviderId === 'mymemory' && (
                    <>
                      <div className="setting-field-group">
                        <label htmlFor="mymemory-email-input" className="setting-field-label">
                          {t('settings.email')}
                        </label>
                        <input
                          id="mymemory-email-input"
                          type="email"
                          className="setting-text-input"
                          value={currentFreeConfig.email || ''}
                          onChange={handleFreeEmailChange}
                          disabled={isSaving}
                          placeholder="e.g. user@example.com"
                          aria-label={t('settings.mymemoryEmailAria')}
                        />
                        <span className="setting-field-hint">
                          {t('settings.mymemoryEmailHint')}
                        </span>
                      </div>

                      <div className="setting-field-group">
                        <label htmlFor="mymemory-api-key-input" className="setting-field-label">
                          {t('settings.apiKeyOptional')}
                        </label>
                        <div className="setting-input-wrapper with-toggle">
                          <input
                            id="mymemory-api-key-input"
                            type={showFreeApiKey ? 'text' : 'password'}
                            className="setting-text-input"
                            value={currentFreeConfig.apiKey || ''}
                            onChange={handleFreeApiKeyChange}
                            disabled={isSaving}
                            placeholder={t('settings.mymemoryApiKeyPlaceholder')}
                            aria-label={t('settings.mymemoryApiKeyAria')}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <button
                            type="button"
                            className="toggle-api-key-btn"
                            onClick={() => setShowFreeApiKey((v) => !v)}
                            tabIndex={-1}
                          >
                            {showFreeApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
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
                  {t('settings.confirmationSectionTitle')}
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
                      {t('settings.confirmationLabel')}
                    </span>
                  </label>

                  <p id="confirmation-desc" className="setting-description">
                    {t('settings.confirmationHelp')}
                  </p>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'features' && (
            <div
              id="settings-panel-features"
              role="tabpanel"
              aria-labelledby="settings-tab-features"
              className="settings-features-panel"
            >
              <div className="features-intro-banner">
                <h3 className="settings-section-title">
                  {t('settings.featuresHeader')}
                </h3>
                <p className="setting-description features-intro-desc">
                  {t('settings.featuresDescription')}
                </p>
              </div>

              {featureCategories.map((cat) => {
                const catFeatures = allFeatureDefinitions.filter(
                  (def) => def.category === cat.id
                )
                if (catFeatures.length === 0) return null

                return (
                  <section
                    key={cat.id}
                    className="settings-section feature-category-section"
                    aria-labelledby={`feature-cat-${cat.id}`}
                  >
                    <div className="feature-category-header">
                      <h4 id={`feature-cat-${cat.id}`} className="feature-category-title">
                        {cat.name}
                      </h4>
                      {cat.description && (
                        <span className="feature-category-desc">{cat.description}</span>
                      )}
                    </div>

                    <div className="feature-list">
                      {catFeatures.map((def) => {
                        const isEnabled = isFeatureEnabled(settings.features, def.id)
                        const inputId = `feature-toggle-${def.id}`

                        return (
                          <div key={def.id} className="feature-item-row">
                            <div className="feature-item-info">
                              <label htmlFor={inputId} className="feature-item-name">
                                {def.name}
                              </label>
                              {def.description && (
                                <p className="feature-item-description">
                                  {def.description}
                                </p>
                              )}
                            </div>

                            <div className="feature-item-toggle">
                              <label
                                className="feature-switch-label"
                                htmlFor={inputId}
                              >
                                <input
                                  id={inputId}
                                  data-testid={inputId}
                                  type="checkbox"
                                  className="feature-switch-input"
                                  checked={isEnabled}
                                  onChange={(e) =>
                                    handleFeatureToggle(def.id, e.target.checked)
                                  }
                                  disabled={isSaving}
                                  aria-label={`Toggle ${def.name}`}
                                />
                                <span
                                  className={`feature-switch-slider ${
                                    isEnabled ? 'checked' : ''
                                  }`}
                                  aria-hidden="true"
                                >
                                  <span className="feature-switch-thumb" />
                                </span>
                                <span
                                  className={`feature-switch-badge ${
                                    isEnabled ? 'on' : 'off'
                                  }`}
                                >
                                  {isEnabled
                                    ? t('settings.featureOn')
                                    : t('settings.featureOff')}
                                </span>
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="modal-confirm-btn settings-done-btn"
            onClick={onClose}
          >
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
