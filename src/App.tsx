import React, { useState, useEffect, useCallback } from 'react'
import type {
  AppSettings,
  AiTranslationSettings,
} from './types/settings'
import { DEFAULT_APP_SETTINGS } from './types/settings'
import { SettingsModal } from './components/settings/SettingsModal'
import { LocalizationDiffViewer } from './components/localization/LocalizationDiffViewer'
import { parseLocalizationData } from './services/localizationParser'
import { compareLocalizationFiles } from './services/localizationComparator'
import type {
  ParsedLocalizationFile,
  LocalizationComparisonResult,
} from './types/localization'
import { I18nProvider } from './i18n/I18nContext'
import { useTranslation } from './i18n/useTranslation'
import './App.css'

interface DiscoveredFile {
  name: string
  path: string
}

interface FileParseResult {
  filename: string
  path: string
  success: boolean
  data?: ParsedLocalizationFile
  error?: string
}

interface AppContentProps {
  settings: AppSettings
  isSettingsSaving: boolean
  settingsSaveError: string | null
  onUpdateAiSettings: (update: Partial<AiTranslationSettings>) => Promise<void>
  onUpdateTranslationSettings: (update: Partial<AppSettings>) => Promise<void>
}

const AppContent: React.FC<AppContentProps> = ({
  settings,
  isSettingsSaving,
  settingsSaveError,
  onUpdateAiSettings,
  onUpdateTranslationSettings,
}) => {
  const { t } = useTranslation()
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [jsonFiles, setJsonFiles] = useState<DiscoveredFile[]>([])
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [, setSettingsSaveError] = useState<string | null>(null)

  // Parsing & Comparison State
  const [isParsing, setIsParsing] = useState(false)
  const [parseResults, setParseResults] = useState<FileParseResult[] | null>(null)
  const [noSelectionWarning, setNoSelectionWarning] = useState<string | null>(null)
  const [comparisonResult, setComparisonResult] = useState<LocalizationComparisonResult | null>(null)

  const handleSelectFolder = async () => {
    if (!window.electronAPI?.selectDirectory) {
      setErrorMessage(t('app.electronUnavailable'))
      return
    }

    try {
      const directory = await window.electronAPI.selectDirectory()
      if (directory !== null) {
        setSelectedDirectory(directory)
        setErrorMessage(null)
        setParseResults(null)
        setComparisonResult(null)
        setNoSelectionWarning(null)

        if (window.electronAPI.getJsonFiles) {
          try {
            const files = await window.electronAPI.getJsonFiles(directory)
            setJsonFiles(files)
            setCheckedPaths(new Set(files.map((f) => f.path)))
          } catch (err) {
            setJsonFiles([])
            setCheckedPaths(new Set())
            setErrorMessage(
              err instanceof Error ? err.message : t('app.failedToReadDirectory')
            )
          }
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : t('app.electronUnavailable')
      )
    }
  }

  const handleToggleFile = (path: string) => {
    setNoSelectionWarning(null)
    setCheckedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleParseFiles = async () => {
    if (checkedPaths.size === 0) {
      setNoSelectionWarning(t('app.noFilesSelectedWarning'))
      return
    }

    if (!window.electronAPI?.readJsonFile) {
      setErrorMessage(t('app.unableToReadJsonFiles'))
      return
    }

    setNoSelectionWarning(null)
    setComparisonResult(null)
    setIsParsing(true)

    const filesToParse = jsonFiles.filter((f) => checkedPaths.has(f.path))
    const results: FileParseResult[] = []

    for (const file of filesToParse) {
      try {
        const rawJson = await window.electronAPI.readJsonFile(file.path)
        const parsed = parseLocalizationData(file.name, file.path, rawJson)
        results.push({
          filename: file.name,
          path: file.path,
          success: true,
          data: parsed,
        })
      } catch (err) {
        results.push({
          filename: file.name,
          path: file.path,
          success: false,
          error: err instanceof Error ? err.message : t('app.invalidJsonBadge'),
        })
      }
    }

    setParseResults(results)
    setIsParsing(false)
  }

  const handleRefreshFiles = useCallback(async () => {
    if (!window.electronAPI?.readJsonFile) {
      return
    }

    const filesToParse = jsonFiles.filter((f) => checkedPaths.has(f.path))
    const results: FileParseResult[] = []

    for (const file of filesToParse) {
      try {
        const rawJson = await window.electronAPI.readJsonFile(file.path)
        const parsed = parseLocalizationData(file.name, file.path, rawJson)
        results.push({
          filename: file.name,
          path: file.path,
          success: true,
          data: parsed,
        })
      } catch (err) {
        results.push({
          filename: file.name,
          path: file.path,
          success: false,
          error: err instanceof Error ? err.message : t('app.invalidJsonBadge'),
        })
      }
    }

    setParseResults(results)

    const validFiles = results
      .filter(
        (r): r is FileParseResult & { data: NonNullable<FileParseResult['data']> } =>
          r.success && !!r.data
      )
      .map((r) => r.data)

    if (validFiles.length >= 2) {
      const newComparison = compareLocalizationFiles(validFiles)
      setComparisonResult(newComparison)
    }
  }, [jsonFiles, checkedPaths, t])

  const successfulParsedFiles = parseResults
    ? parseResults
        .filter(
          (r): r is FileParseResult & { data: NonNullable<FileParseResult['data']> } =>
            r.success && !!r.data
        )
        .map((r) => r.data)
    : []

  const canCompare = successfulParsedFiles.length >= 2

  const handleCompareFiles = () => {
    if (!canCompare) {
      return
    }
    const result = compareLocalizationFiles(successfulParsedFiles)
    setComparisonResult(result)
  }

  return (
    <main className="app-container">
      <div className="app-header-bar">
        <div className="badge">{t('app.badge')}</div>
        <button
          type="button"
          className="settings-open-btn"
          onClick={() => {
            setSettingsSaveError(null)
            setIsSettingsOpen(true)
          }}
          aria-label={t('app.openSettings')}
          title={t('app.openSettings')}
        >
          ⚙ {t('settings.title')}
        </button>
      </div>

      <h1 className="title">{t('app.title')}</h1>
      <p className="description">
        {t('app.subtitle')}
      </p>

      <div className="folder-selection-section">
        <button
          type="button"
          className="select-button"
          onClick={handleSelectFolder}
        >
          {t('app.selectFolder')}
        </button>
        <div
          className="selected-path-container"
          data-testid="selected-path-display"
        >
          {selectedDirectory ? (
            <div className="selected-path-info">
              <span className="path-label">{t('app.selectedFolder')}</span>
              <span className="selected-path-text">{selectedDirectory}</span>
            </div>
          ) : (
            <span className="empty-path-text">{t('app.noFolderSelected')}</span>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="error-message" role="alert">
          {errorMessage}
        </div>
      )}

      {selectedDirectory && !errorMessage && (
        <section className="files-section" aria-label={t('app.discoveredFilesAria')}>
          <h2 className="files-title">{t('app.jsonFilesTitle')}</h2>

          {jsonFiles.length > 0 ? (
            <>
              <ul className="files-list">
                {jsonFiles.map((file) => {
                  const isChecked = checkedPaths.has(file.path)
                  return (
                    <li key={file.path} className="file-item">
                      <label className="file-label">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleFile(file.path)}
                          className="file-checkbox"
                          aria-label={t('app.selectFileAria', { name: file.name })}
                        />
                        <span className="file-name">{file.name}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>

              <div className="action-row">
                <button
                  type="button"
                  className="parse-button"
                  onClick={handleParseFiles}
                  disabled={isParsing}
                >
                  {isParsing ? t('app.parsing') : t('app.parseJsonFiles')}
                </button>
              </div>

              {noSelectionWarning && (
                <div className="warning-message" role="status">
                  {noSelectionWarning}
                </div>
              )}
            </>
          ) : (
            <div className="empty-files-message">{t('app.noFilesFound')}</div>
          )}
        </section>
      )}

      {parseResults && parseResults.length > 0 && (
        <section className="parse-results-section" aria-label={t('app.parseResultsAria')}>
          <h2 className="results-title">{t('app.parseResultsTitle')}</h2>
          <div className="results-grid">
            {parseResults.map((res) => (
              <div
                key={res.path}
                className={`result-card ${res.success ? 'result-success' : 'result-error'}`}
                data-testid={`parse-result-${res.filename}`}
              >
                <div className="result-filename">{res.filename}</div>
                {res.success && res.data ? (
                  <div className="result-details">
                    <span className="status-badge success-badge">{t('app.parsedBadge')}</span>
                    <span className="key-count">{t('app.keyCount', { count: res.data.keyCount })}</span>
                  </div>
                ) : (
                  <div className="result-details">
                    <span className="status-badge error-badge">{t('app.invalidJsonBadge')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="action-row comparison-action-row">
            <button
              type="button"
              className="compare-button"
              onClick={handleCompareFiles}
              disabled={!canCompare}
            >
              {t('app.compareFiles')}
            </button>
            {!canCompare && parseResults.length > 0 && (
              <span className="compare-hint">
                {t('app.compareHint')}
              </span>
            )}
          </div>
        </section>
      )}

      {comparisonResult && (
        <LocalizationDiffViewer
          comparisonResult={comparisonResult}
          parsedFiles={successfulParsedFiles}
          settings={settings}
          onRefreshFiles={handleRefreshFiles}
        />
      )}

      <div className="status-box">
        {t('app.statusFoundation')}
      </div>

      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          isSaving={isSettingsSaving}
          saveError={settingsSaveError}
          onUpdateAiSettings={onUpdateAiSettings}
          onUpdateTranslationSettings={onUpdateTranslationSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </main>
  )
}

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [isSettingsSaving, setIsSettingsSaving] = useState(false)
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null)

  // Load persisted settings on application mount
  useEffect(() => {
    async function loadSettings() {
      if (window.electronAPI?.getSettings) {
        try {
          const loaded = await window.electronAPI.getSettings()
          if (loaded && typeof loaded === 'object') {
            setSettings(loaded)
          }
        } catch {
          setSettings(DEFAULT_APP_SETTINGS)
        }
      }
    }
    loadSettings()
  }, [])

  const handleUpdateAiSettings = async (update: Partial<AiTranslationSettings>) => {
    setIsSettingsSaving(true)
    setSettingsSaveError(null)

    if (!window.electronAPI?.updateAiTranslationSettings) {
      setSettings((prev) => ({
        ...prev,
        aiTranslation: {
          ...prev.aiTranslation,
          ...update,
          providers: {
            ...prev.aiTranslation.providers,
            ...(update.providers || {}),
          },
        },
      }))
      setIsSettingsSaving(false)
      return
    }

    try {
      const updated = await window.electronAPI.updateAiTranslationSettings(update)
      setSettings(updated)
    } catch (err) {
      setSettingsSaveError(
        err instanceof Error ? err.message : 'Failed to save settings.'
      )
    } finally {
      setIsSettingsSaving(false)
    }
  }

  const handleUpdateTranslationSettings = async (update: Partial<AppSettings>) => {
    setIsSettingsSaving(true)
    setSettingsSaveError(null)

    if (!window.electronAPI?.updateTranslationSettings) {
      setSettings((prev) => ({
        ...prev,
        ...update,
        aiTranslation: update.aiTranslation
          ? {
              ...prev.aiTranslation,
              ...update.aiTranslation,
              providers: {
                ...(prev.aiTranslation?.providers || {}),
                ...(update.aiTranslation.providers || {}),
              },
            }
          : prev.aiTranslation,
        freeTranslation: update.freeTranslation
          ? {
              ...prev.freeTranslation,
              ...update.freeTranslation,
              providers: {
                ...(prev.freeTranslation?.providers || {}),
                ...(update.freeTranslation.providers || {}),
              },
            }
          : prev.freeTranslation,
      }))
      setIsSettingsSaving(false)
      return
    }

    try {
      const updated = await window.electronAPI.updateTranslationSettings(update)
      setSettings(updated)
    } catch (err) {
      setSettingsSaveError(
        err instanceof Error ? err.message : 'Failed to save translation settings.'
      )
    } finally {
      setIsSettingsSaving(false)
    }
  }

  return (
    <I18nProvider language={settings.language || 'en'}>
      <AppContent
        settings={settings}
        isSettingsSaving={isSettingsSaving}
        settingsSaveError={settingsSaveError}
        onUpdateAiSettings={handleUpdateAiSettings}
        onUpdateTranslationSettings={handleUpdateTranslationSettings}
      />
    </I18nProvider>
  )
}

export default App
