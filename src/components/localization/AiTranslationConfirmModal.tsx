import React, { useState } from 'react'
import { getProviderDefinition } from '../../services/aiProviderRegistry'
import { getFreeProviderDefinition } from '../../services/freeProviderRegistry'
import type { AiProviderId, FreeProviderId } from '../../types/settings'
import { useTranslation } from '../../i18n/useTranslation'

export interface AiTranslationProposal {
  key: string
  targetFile: string
  targetLanguage?: string
  sourceFile: string
  sourceLanguage?: string
  sourceValue: string
  translatedText: string
  provider: AiProviderId | FreeProviderId | string
  model: string
}

interface AiTranslationConfirmModalProps {
  proposal: AiTranslationProposal
  isApplying: boolean
  error: string | null
  onConfirm: (finalText: string) => void
  onCancel: () => void
}

export const AiTranslationConfirmModal: React.FC<AiTranslationConfirmModalProps> = ({
  proposal,
  isApplying,
  error,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation()
  const [editedText, setEditedText] = useState(proposal.translatedText)

  const isFree =
    proposal.provider === 'libretranslate' || proposal.provider === 'mymemory'

  const engineDisplay = isFree
    ? `${getFreeProviderDefinition(proposal.provider as FreeProviderId).name} · Free`
    : `${getProviderDefinition(proposal.provider as AiProviderId).name} · ${proposal.model}`

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirm(editedText)
  }

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-confirm-title"
    >
      <div
        className="modal-container ai-confirm-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="ai-confirm-title" className="modal-title">
              {isFree ? t('translation.translateWithFreeTitle') : t('translation.translateWithAiTitle')}
            </h2>
            <p className="modal-subtitle">
              {t('translation.reviewInstructions')}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            disabled={isApplying}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="error-message ai-modal-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="ai-confirm-body">
            <div className="ai-meta-grid">
              <div className="ai-meta-item">
                <span className="ai-meta-label">{t('translation.key')}:</span>
                <span className="ai-meta-value key-highlight" title={proposal.key}>
                  {proposal.key}
                </span>
              </div>
              <div className="ai-meta-item">
                <span className="ai-meta-label">{t('translation.targetFile')}:</span>
                <span className="ai-meta-value" title={proposal.targetFile}>
                  {proposal.targetFile}
                </span>
              </div>
              <div className="ai-meta-item ai-meta-engine-item">
                <span className="ai-meta-label">{t('translation.engine')}:</span>
                <span className="ai-meta-value ai-engine-badge" title={engineDisplay}>
                  {engineDisplay}
                </span>
              </div>
              <div className="ai-meta-item">
                <span className="ai-meta-label">{t('translation.sourceFile')}:</span>
                <span className="ai-meta-value" title={proposal.sourceFile}>
                  {proposal.sourceFile}
                </span>
              </div>
            </div>

            <div className="ai-preview-card source-card">
              <div className="ai-card-header">
                <span className="ai-card-title">
                  {t('translation.sourceReference', {
                    file: proposal.sourceFile,
                    lang: proposal.sourceLanguage ? ` · ${proposal.sourceLanguage}` : '',
                  })}
                </span>
                <span className="modal-file-badge">
                  {proposal.sourceLanguage || proposal.sourceFile}
                </span>
              </div>
              <div className="ai-card-content">
                <div className="source-text-box">
                  {proposal.sourceValue || (
                    <span className="empty-source-italic">(empty)</span>
                  )}
                </div>
              </div>
            </div>

            <div className="ai-preview-card target-card">
              <div className="ai-card-header">
                <label htmlFor="ai-confirm-textarea" className="ai-card-title">
                  {isFree ? t('translation.proposedTranslation') : t('translation.aiProposedTranslation')}
                  {proposal.targetLanguage ? ` (${proposal.targetLanguage})` : ''}
                </label>
                <span className="ai-badge">
                  {isFree ? 'FREE' : 'AI'}
                </span>
              </div>
              <div className="ai-card-content">
                <textarea
                  id="ai-confirm-textarea"
                  className="ai-translation-textarea"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={3}
                  placeholder={t('tree.placeholderEnterTranslation')}
                  disabled={isApplying}
                  autoFocus
                  aria-label={isFree ? t('translation.proposedTranslation') : t('translation.aiProposedTranslation')}
                />
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={onCancel}
              disabled={isApplying}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="modal-confirm-btn"
              disabled={isApplying}
            >
              {isApplying ? t('tree.saving') : t('translation.applyTranslation')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
