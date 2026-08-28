import React, { useState, useCallback } from 'react'
import type { JsonFileInfo } from './types/electron'
import type {
  FileParseResult,
  LocalizationComparisonResult,
} from './types/localization'
import { parseLocalizationData } from './services/localizationParser'
import { compareLocalizationFiles } from './services/localizationComparator'
import { LocalizationDiffViewer } from './components/localization/LocalizationDiffViewer'
import './App.css'

export const App: React.FC = () => {
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [jsonFiles, setJsonFiles] = useState<JsonFileInfo[]>([])
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set())
  const [parseResults, setParseResults] = useState<FileParseResult[] | null>(null)
  const [comparisonResult, setComparisonResult] =
    useState<LocalizationComparisonResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [noSelectionWarning, setNoSelectionWarning] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)

  const handleSelectFolder = async () => {
    if (!window.electronAPI?.selectDirectory) {
      setErrorMessage('Unable to open folder selection dialog: Electron API is unavailable.')
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
            // By default, check all discovered JSON files
            setCheckedPaths(new Set(files.map((f) => f.path)))
          } catch (err) {
            setJsonFiles([])
            setCheckedPaths(new Set())
            setErrorMessage(
              err instanceof Error ? err.message : 'Failed to read directory.'
            )
          }
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to open folder selection dialog.'
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
      setNoSelectionWarning('No files selected for parsing')
      return
    }

    if (!window.electronAPI?.readJsonFile) {
      setErrorMessage('Unable to read JSON files: Electron API is unavailable.')
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
          error: err instanceof Error ? err.message : 'Invalid JSON',
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
          error: err instanceof Error ? err.message : 'Invalid JSON',
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
  }, [jsonFiles, checkedPaths])

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
      <div className="badge">Desktop Preview</div>
      <h1 className="title">Localization AI</h1>
      <p className="description">
        Application is currently under development.
      </p>

      <div className="folder-selection-section">
        <button
          type="button"
          className="select-button"
          onClick={handleSelectFolder}
        >
          Select Folder
        </button>
        <div
          className="selected-path-container"
          data-testid="selected-path-display"
        >
          {selectedDirectory ? (
            <div className="selected-path-info">
              <span className="path-label">Selected folder:</span>
              <span className="selected-path-text">{selectedDirectory}</span>
            </div>
          ) : (
            <span className="empty-path-text">No folder selected</span>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="error-message" role="alert">
          {errorMessage}
        </div>
      )}

      {selectedDirectory && !errorMessage && (
        <section className="files-section" aria-label="Discovered JSON files">
          <h2 className="files-title">JSON files:</h2>

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
                          aria-label={`Select ${file.name}`}
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
                  {isParsing ? 'Parsing...' : 'Parse JSON Files'}
                </button>
              </div>

              {noSelectionWarning && (
                <div className="warning-message" role="status">
                  {noSelectionWarning}
                </div>
              )}
            </>
          ) : (
            <div className="empty-files-message">No JSON files found</div>
          )}
        </section>
      )}

      {parseResults && parseResults.length > 0 && (
        <section className="parse-results-section" aria-label="Parse Results">
          <h2 className="results-title">Parse Results:</h2>
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
                    <span className="status-badge success-badge">✓ Parsed</span>
                    <span className="key-count">{res.data.keyCount} keys</span>
                  </div>
                ) : (
                  <div className="result-details">
                    <span className="status-badge error-badge">✕ Invalid JSON</span>
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
              Compare Selected Files
            </button>
            {!canCompare && parseResults.length > 0 && (
              <span className="compare-hint">
                At least 2 successfully parsed files required to compare
              </span>
            )}
          </div>
        </section>
      )}

      {comparisonResult && (
        <LocalizationDiffViewer
          comparisonResult={comparisonResult}
          parsedFiles={successfulParsedFiles}
          onRefreshFiles={handleRefreshFiles}
        />
      )}

      <div className="status-box">
        Basic Electron + React + TypeScript + Vite foundation initialized.
      </div>
    </main>
  )
}

export default App
