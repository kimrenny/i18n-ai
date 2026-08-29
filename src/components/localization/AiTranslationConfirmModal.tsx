import React, { useState } from 'react'
import { getProviderDefinition } from '../../services/aiProviderRegistry'
import type { AiProviderId } from '../../types/settings'

export interface AiTranslationProposal {
  key: string
  targetFile: string
  targetLanguage?: string
  sourceFile: string
  sourceLanguage?: string
  sourceValue: string
  translatedText: string
  provider: AiProviderId
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
  const [editedText, setEditedText] = useState(proposal.translatedText)
  const providerDef = getProviderDefinition(proposal.provider)

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
              Review AI Translation
            </h2>
            <p className="modal-subtitle">
              Verify the AI-generated translation before applying it to your localization file.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            disabled={isApplying}
            aria-label="Close review"
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
                <span className="ai-meta-label">Key:</span>
                <span className="ai-meta-value key-highlight">{proposal.key}</span>
              </div>
              <div className="ai-meta-item">
                <span className="ai-meta-label">Target:</span>
                <span className="ai-meta-value">{proposal.targetFile}</span>
              </div>
              <div className="ai-meta-item">
                <span className="ai-meta-label">Engine:</span>
                <span className="ai-meta-value ai-engine-badge">
                  {providerDef.name} · {proposal.model}
                </span>
              </div>
            </div>

            <div className="ai-preview-card source-card">
              <div className="ai-card-header">
                <span className="ai-card-title">
                  Source Reference ({proposal.sourceFile}
                  {proposal.sourceLanguage ? ` · ${proposal.sourceLanguage}` : ''})
                </span>
              </div>
              <div className="ai-card-content source-text-box">
                {proposal.sourceValue ? (
                  <span>{proposal.sourceValue}</span>
                ) : (
                  <span className="empty-source-italic">(empty value)</span>
                )}
              </div>
            </div>

            <div className="ai-preview-card target-card">
              <div className="ai-card-header">
                <span className="ai-card-title">
                  Proposed Translation ({proposal.targetFile}
                  {proposal.targetLanguage ? ` · ${proposal.targetLanguage}` : ''})
                </span>
                <span className="ai-badge">AI Proposal</span>
              </div>
              <div className="ai-card-content">
                <textarea
                  className="ai-translation-textarea"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  disabled={isApplying}
                  rows={3}
                  placeholder="Enter or adjust translation..."
                  autoFocus
                  aria-label="AI proposed translation"
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
              Cancel
            </button>
            <button
              type="submit"
              className="modal-confirm-btn"
              disabled={isApplying}
            >
              {isApplying ? 'Applying...' : 'Apply Translation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
