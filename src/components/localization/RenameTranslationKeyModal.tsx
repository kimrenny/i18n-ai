import React, { useState, useMemo, useEffect, useRef } from 'react'
import type { ParsedLocalizationFile } from '../../types/localization'
import type { RenameTranslationKeyPlan } from '../../types/localizationKeyRename'
import { planRenameTranslationKey } from '../../services/localizationKeyRename'
import { useTranslation } from '../../i18n/useTranslation'
import './RenameTranslationKeyModal.css'

interface RenameTranslationKeyModalProps {
  oldKey: string
  parsedFiles: readonly ParsedLocalizationFile[]
  isWriting?: boolean
  onConfirm: (plan: RenameTranslationKeyPlan) => void | Promise<void>
  onCancel: () => void
}

export const RenameTranslationKeyModal: React.FC<RenameTranslationKeyModalProps> = ({
  oldKey,
  parsedFiles,
  isWriting = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation()
  const [newKey, setNewKey] = useState<string>(oldKey)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Select input text on mount for quick editing
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isWriting) {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, isWriting])

  // Pure plan computed reactively from inputs
  const plan: RenameTranslationKeyPlan = useMemo(() => {
    return planRenameTranslationKey(parsedFiles, {
      oldKey,
      newKey,
    })
  }, [parsedFiles, oldKey, newKey])

  const isSameKey = oldKey.trim() === newKey.trim()

  const errorMessage = useMemo(() => {
    if (isSameKey) {
      return null
    }
    if (!plan.validation.isValid) {
      switch (plan.validation.errorKey) {
        case 'errorEmpty':
          return t('rename.errorEmpty')
        case 'errorDotBoundary':
          return t('rename.errorDotBoundary')
        case 'errorConsecutiveDots':
          return t('rename.errorConsecutiveDots')
        case 'errorEmptySegment':
          return t('rename.errorEmptySegment')
        default:
          return t('rename.errorInvalidKey')
      }
    }
    if (plan.hasConflicts && plan.conflictMessages.length > 0) {
      return plan.conflictMessages[0]
    }
    return null
  }, [plan, isSameKey, t])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (plan.canApply && !isSameKey && !isWriting) {
      onConfirm(plan)
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={!isWriting ? onCancel : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-key-modal-title"
    >
      <div
        className="modal-container rename-modal-container"
        onClick={(e) => e.stopPropagation()}
        data-testid="rename-translation-key-modal"
      >
        <div className="modal-header">
          <div>
            <h2 id="rename-key-modal-title" className="modal-title">
              {t('rename.title')}
            </h2>
            <p className="modal-subtitle">{t('rename.subtitle')}</p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            disabled={isWriting}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="rename-modal-body">
            {/* Current / Old Key Display */}
            <div className="rename-field-group">
              <label className="rename-field-label">{t('rename.oldKeyLabel')}</label>
              <div className="rename-old-key-box" title={oldKey} data-testid="rename-old-key-display">
                <span className="rename-key-mono">{oldKey}</span>
              </div>
            </div>

            {/* New Key Input */}
            <div className="rename-field-group">
              <label htmlFor="rename-new-key-input" className="rename-field-label">
                {t('rename.newKeyLabel')}
              </label>
              <input
                id="rename-new-key-input"
                ref={inputRef}
                type="text"
                className={`app-input rename-key-input ${errorMessage ? 'has-error' : ''}`}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder={t('rename.newKeyPlaceholder')}
                disabled={isWriting}
                autoFocus
                data-testid="rename-new-key-input"
              />
              {errorMessage && (
                <div className="rename-error-banner" role="alert" data-testid="rename-error-banner">
                  ⚠ {errorMessage}
                </div>
              )}
            </div>

            {/* Affected Languages Summary */}
            <div className="rename-summary-row">
              <span className="rename-summary-badge">
                {t('rename.affectedFilesCount', {
                  count: plan.filesToModify.length,
                  total: parsedFiles.length,
                })}
              </span>
              {plan.skippedFiles.length > 0 && (
                <span className="rename-skipped-badge">
                  {t('rename.skippedFilesCount', { count: plan.skippedFiles.length })}
                </span>
              )}
            </div>

            {/* Preview Section */}
            <div className="rename-preview-section">
              <div className="rename-preview-header">
                <span className="rename-section-label">{t('rename.previewTitle')}</span>
                <span className="rename-preview-transformation">
                  <code>{oldKey}</code> → <code>{plan.newKey || '...'}</code>
                </span>
              </div>

              <div className="rename-preview-list" role="list">
                {plan.filesToModify.length > 0 ? (
                  plan.filesToModify.map((file) => (
                    <div
                      key={file.filename}
                      className="rename-preview-item"
                      role="listitem"
                      data-testid={`rename-preview-${file.filename}`}
                    >
                      <div className="rename-preview-item-header">
                        <span className="rename-lang-name">{file.languageName}</span>
                        <span className="rename-file-tag">{file.filename}</span>
                      </div>
                      <div className="rename-preview-item-val">
                        <span className="rename-val-label">{t('rename.preservedValue')}:</span>
                        <span className="rename-val-text">
                          {typeof file.value === 'string'
                            ? `"${file.value}"`
                            : JSON.stringify(file.value)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rename-preview-empty">
                    {isSameKey
                      ? t('rename.sameKeyNotice')
                      : t('rename.noFilesMatch')}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={onCancel}
              disabled={isWriting}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="modal-confirm-btn"
              disabled={!plan.canApply || isSameKey || isWriting}
              data-testid="rename-submit-btn"
            >
              {isWriting ? t('rename.renaming') : t('rename.confirmButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
