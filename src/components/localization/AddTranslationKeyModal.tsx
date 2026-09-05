import React, { useState, useMemo, useEffect, useRef } from 'react'
import type { ParsedLocalizationFile } from '../../types/localization'
import type { AddKeyTargetMode } from '../../types/localizationKeyInsertion'
import { planAddTranslationKey } from '../../services/localizationKeyInsertion'
import { resolveLanguageFromFilename } from '../../services/aiTranslation'
import { getLanguageDisplayName } from '../../services/localizationCoverage'
import { useTranslation } from '../../i18n/useTranslation'
import './AddTranslationKeyModal.css'

export interface AddTranslationKeyModalProps {
  isOpen: boolean
  parsedFiles: readonly ParsedLocalizationFile[]
  initialActiveFilename?: string
  onClose: () => void
  onConfirmAddKey: (params: {
    key: string
    mode: AddKeyTargetMode
    singleTargetFile?: string
    translationsByFile: Record<string, string>
  }) => Promise<void>
}

export const AddTranslationKeyModal: React.FC<AddTranslationKeyModalProps> = ({
  isOpen,
  parsedFiles,
  initialActiveFilename,
  onClose,
  onConfirmAddKey,
}) => {
  const { t } = useTranslation()
  const [keyInput, setKeyInput] = useState('')
  const [targetMode, setTargetMode] = useState<AddKeyTargetMode>('all')
  const [selectedSingleFile, setSelectedSingleFile] = useState<string>(
    initialActiveFilename || parsedFiles[0]?.filename || ''
  )
  const [translationsByFile, setTranslationsByFile] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const keyInputRef = useRef<HTMLInputElement | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setKeyInput('')
      setTranslationsByFile({})
      setIsSubmitting(false)
      setSubmitError(null)
      if (initialActiveFilename) {
        setSelectedSingleFile(initialActiveFilename)
      } else if (parsedFiles.length > 0) {
        setSelectedSingleFile(parsedFiles[0].filename)
      }
      setTimeout(() => {
        keyInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen, initialActiveFilename, parsedFiles])

  // Pure single-source-of-truth plan
  const plan = useMemo(() => {
    return planAddTranslationKey(parsedFiles, {
      key: keyInput,
      mode: targetMode,
      singleTargetFile: selectedSingleFile,
      translationsByFile,
    })
  }, [parsedFiles, keyInput, targetMode, selectedSingleFile, translationsByFile])

  // Handle keyboard events (Escape to close, Enter on key input to submit if valid)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleTranslationChange = (filename: string, val: string) => {
    setTranslationsByFile((prev) => ({
      ...prev,
      [filename]: val,
    }))
  }

  const handleKeyInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && plan.canApply && !isSubmitting) {
      e.preventDefault()
      handleConfirm()
    }
  }

  const handleConfirm = async () => {
    if (!plan.canApply || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await onConfirmAddKey({
        key: plan.key,
        mode: targetMode,
        singleTargetFile: selectedSingleFile,
        translationsByFile,
      })
      onClose()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t('common.error')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="add-key-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-key-modal-title"
      data-testid="add-key-modal"
    >
      <div className="add-key-modal-content">
        <header className="add-key-modal-header">
          <div className="add-key-modal-title-group">
            <span className="add-key-modal-icon">➕</span>
            <h2 id="add-key-modal-title" className="add-key-modal-title">
              {t('addKey.title')}
            </h2>
          </div>
          <button
            type="button"
            className="add-key-modal-close-btn"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </header>

        <div className="add-key-modal-body">
          {submitError && (
            <div className="add-key-error-banner" role="alert">
              ⚠️ {submitError}
            </div>
          )}

          {/* Key Input Section */}
          <div className="add-key-form-group">
            <label htmlFor="add-key-input" className="add-key-label">
              {t('addKey.keyLabel')}
            </label>
            <input
              id="add-key-input"
              ref={keyInputRef}
              type="text"
              className={`add-key-text-input ${
                keyInput.trim() && !plan.validation.isValid ? 'input-error' : ''
              }`}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={handleKeyInputKeyDown}
              placeholder={t('addKey.keyPlaceholder')}
              autoComplete="off"
              spellCheck="false"
              data-testid="add-key-input"
            />
            {keyInput.trim() && !plan.validation.isValid && plan.validation.errorKey && (
              <span className="add-key-field-error">
                {t(`addKey.${plan.validation.errorKey}`)}
              </span>
            )}
          </div>

          {/* Mode Selector */}
          <div className="add-key-form-group">
            <label className="add-key-label">{t('addKey.modeLabel')}</label>
            <div className="add-key-mode-toggle" role="radiogroup" aria-label={t('addKey.modeLabel')}>
              <button
                type="button"
                className={`add-key-mode-btn ${targetMode === 'all' ? 'active' : ''}`}
                onClick={() => setTargetMode('all')}
                data-testid="mode-all-btn"
              >
                {t('addKey.modeAll')}
              </button>
              <button
                type="button"
                className={`add-key-mode-btn ${targetMode === 'single' ? 'active' : ''}`}
                onClick={() => setTargetMode('single')}
                data-testid="mode-single-btn"
              >
                {t('addKey.modeSingle')}
              </button>
            </div>
          </div>

          {/* Single Language Selector & Translation Input */}
          {targetMode === 'single' && (
            <div className="add-key-single-mode-container">
              <div className="add-key-form-group">
                <label htmlFor="add-key-single-lang-select" className="add-key-label">
                  {t('addKey.targetLanguage')}
                </label>
                <select
                  id="add-key-single-lang-select"
                  className="add-key-select-input"
                  value={selectedSingleFile}
                  onChange={(e) => setSelectedSingleFile(e.target.value)}
                  data-testid="single-lang-select"
                >
                  {parsedFiles.map((file) => {
                    const langCode = resolveLanguageFromFilename(file.filename)
                    const langName = getLanguageDisplayName(langCode)
                    return (
                      <option key={file.filename} value={file.filename}>
                        {langName} ({file.filename})
                      </option>
                    )
                  })}
                </select>
              </div>

              {plan.hasConflicts && plan.conflictMessages.length > 0 ? (
                <div className="add-key-warning-pill" role="status">
                  ⚠️ {t('addKey.alreadyExistsSingle')}
                </div>
              ) : (
                <div className="add-key-form-group">
                  <label htmlFor="add-key-single-translation" className="add-key-label">
                    {t('addKey.translationLabel')}
                  </label>
                  <input
                    id="add-key-single-translation"
                    type="text"
                    className="add-key-text-input"
                    value={translationsByFile[selectedSingleFile] ?? ''}
                    onChange={(e) => handleTranslationChange(selectedSingleFile, e.target.value)}
                    placeholder={t('addKey.translationPlaceholder')}
                    data-testid="single-translation-input"
                  />
                </div>
              )}
            </div>
          )}

          {/* All Languages Grid */}
          {targetMode === 'all' && (
            <div className="add-key-all-languages-container">
              <label className="add-key-label">{t('addKey.translationLabel')}</label>
              <div className="add-key-lang-grid" data-testid="all-languages-grid">
                {parsedFiles.map((file) => {
                  const langCode = resolveLanguageFromFilename(file.filename)
                  const langName = getLanguageDisplayName(langCode)
                  const existingInfo = plan.alreadyExistingFiles.find(
                    (f) => f.filename === file.filename
                  )

                  return (
                    <div
                      key={file.filename}
                      className={`add-key-lang-row ${existingInfo ? 'lang-exists' : ''}`}
                    >
                      <div className="add-key-lang-info">
                        <span className="add-key-lang-name">{langName}</span>
                        <span className="add-key-lang-file">{file.filename}</span>
                      </div>

                      {existingInfo ? (
                        <div className="add-key-existing-badge" title={t('addKey.alreadyExistsWarning', { language: langName })}>
                          <span className="badge-icon">✓</span>
                          <span className="badge-text">
                            {typeof existingInfo.existingValue === 'string' && existingInfo.existingValue
                              ? `"${existingInfo.existingValue}"`
                              : t('addKey.emptyBadge')}
                          </span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="add-key-text-input add-key-grid-input"
                          value={translationsByFile[file.filename] ?? ''}
                          onChange={(e) => handleTranslationChange(file.filename, e.target.value)}
                          placeholder={t('addKey.translationPlaceholder')}
                          data-testid={`translation-input-${file.filename}`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Planned Changes Preview */}
          <div className="add-key-preview-card" data-testid="add-key-preview">
            <div className="add-key-preview-header">
              <span className="add-key-preview-title">{t('addKey.previewTitle')}</span>
              {plan.filesToModify.length > 0 && (
                <span className="add-key-preview-count">
                  {t('addKey.willModifyCount', { count: plan.filesToModify.length })}
                </span>
              )}
            </div>

            <div className="add-key-preview-body">
              {plan.hasConflicts && (
                <div className="add-key-preview-conflicts">
                  {plan.conflictMessages.map((msg, idx) => (
                    <div key={idx} className="preview-conflict-item">
                      ⚠️ {msg}
                    </div>
                  ))}
                </div>
              )}

              {plan.filesToModify.length > 0 && (
                <ul className="add-key-preview-list">
                  {plan.filesToModify.map((f) => (
                    <li key={f.filename} className="preview-modify-item">
                      <span className="preview-item-action">+</span>
                      <span className="preview-item-lang">{f.languageName}:</span>
                      <span className="preview-item-value">
                        {f.value ? `"${f.value}"` : t('addKey.emptyBadge')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {plan.alreadyExistingFiles.length > 0 && targetMode === 'all' && (
                <div className="add-key-preview-existing-list">
                  {plan.alreadyExistingFiles.map((f) => (
                    <div key={f.filename} className="preview-existing-item">
                      <span className="preview-existing-dot">•</span>
                      <span className="preview-existing-text">
                        {t('addKey.alreadyExistsWarning', { language: f.languageName })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {plan.filesToModify.length === 0 && !plan.hasConflicts && keyInput.trim() && (
                <div className="add-key-preview-no-changes">
                  {t('addKey.noChanges')}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="add-key-modal-footer">
          <button
            type="button"
            className="add-key-btn add-key-btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t('addKey.cancelBtn')}
          </button>
          <button
            type="button"
            className="add-key-btn add-key-btn-primary"
            onClick={handleConfirm}
            disabled={!plan.canApply || isSubmitting}
            data-testid="add-key-confirm-btn"
          >
            {isSubmitting ? t('common.loading') : t('addKey.confirmBtn')}
          </button>
        </footer>
      </div>
    </div>
  )
}
