import React, { useState, useEffect } from 'react'
import type { GitRemoteInfo } from '../../types/git'
import { useTranslation } from '../../i18n/useTranslation'
import { validateBranchNameInput } from '../../services/git/gitService'

interface SetUpstreamModalProps {
  isOpen: boolean
  isPushing: boolean
  currentBranch: string
  remotes: GitRemoteInfo[]
  selectedRemote?: string
  error?: string | null
  onClose: () => void
  onConfirm: (remote: string, branch: string) => Promise<void> | void
}

export const SetUpstreamModal: React.FC<SetUpstreamModalProps> = ({
  isOpen,
  isPushing,
  currentBranch,
  remotes,
  selectedRemote,
  error,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation()
  const [remoteName, setRemoteName] = useState<string>('')
  const [remoteBranch, setRemoteBranch] = useState<string>('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [hasInteracted, setHasInteracted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const defaultRemote =
        selectedRemote ||
        (remotes.some((r) => r.name === 'origin') ? 'origin' : remotes[0]?.name || '')
      setRemoteName(defaultRemote)
      setRemoteBranch(currentBranch || 'main')
      setValidationError(null)
      setHasInteracted(false)
    }
  }, [isOpen, currentBranch, remotes, selectedRemote])

  if (!isOpen) return null

  const handleBranchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setRemoteBranch(val)
    setHasInteracted(true)

    const result = validateBranchNameInput(val)
    if (!result.valid && result.errorKey) {
      setValidationError(t(result.errorKey))
    } else {
      setValidationError(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setHasInteracted(true)

    const result = validateBranchNameInput(remoteBranch)
    if (!result.valid && result.errorKey) {
      setValidationError(t(result.errorKey))
      return
    }

    if (!remoteName.trim()) {
      return
    }

    onConfirm(remoteName.trim(), remoteBranch.trim())
  }

  const isSubmitDisabled =
    isPushing ||
    !remoteName.trim() ||
    !remoteBranch.trim() ||
    (hasInteracted && !!validationError)

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-upstream-modal-title"
      data-testid="set-upstream-modal"
    >
      <div
        className="modal-container git-branch-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="set-upstream-modal-title" className="modal-title">
              🚀 {t('git.setUpstreamModalTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('git.cancel')}
            disabled={isPushing}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body git-branch-modal-body">
            {remotes.length > 1 ? (
              <div className="git-branch-form-group">
                <label htmlFor="git-upstream-remote-select" className="git-branch-label">
                  {t('git.remote')}
                </label>
                <select
                  id="git-upstream-remote-select"
                  className="app-select git-branch-input"
                  value={remoteName}
                  onChange={(e) => setRemoteName(e.target.value)}
                  disabled={isPushing}
                  data-testid="set-upstream-remote-select"
                >
                  {remotes.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name} {r.fetchUrl ? `(${r.fetchUrl})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : remotes.length === 1 ? (
              <div className="git-dirty-target-badge" style={{ marginBottom: '12px' }}>
                <span className="git-dirty-target-label">{t('git.remote')}:</span>
                <span className="git-dirty-target-name">{remotes[0].name}</span>
                {remotes[0].fetchUrl && (
                  <span className="git-filter-count" style={{ marginLeft: '8px' }}>
                    {remotes[0].fetchUrl}
                  </span>
                )}
              </div>
            ) : null}

            <div className="git-branch-form-group">
              <label htmlFor="git-upstream-branch-input" className="git-branch-label">
                {t('git.setUpstreamBranchName')}
              </label>
              <input
                id="git-upstream-branch-input"
                type="text"
                className={`app-input git-branch-input ${hasInteracted && validationError ? 'is-invalid' : ''}`}
                value={remoteBranch}
                onChange={handleBranchChange}
                placeholder={t('git.branchNamePlaceholder')}
                autoFocus
                disabled={isPushing}
                data-testid="set-upstream-branch-input"
              />
              {hasInteracted && validationError && (
                <div
                  className="git-branch-input-error"
                  role="alert"
                  data-testid="upstream-input-validation-error"
                >
                  {validationError}
                </div>
              )}
            </div>

            {error && (
              <div className="git-branch-server-error" role="alert" data-testid="set-upstream-error">
                ⚠️ {error}
              </div>
            )}
          </div>

          <div className="modal-footer git-branch-modal-footer">
            <button
              type="button"
              className="app-btn app-btn-secondary"
              onClick={onClose}
              disabled={isPushing}
              data-testid="set-upstream-cancel-btn"
            >
              {t('git.cancel')}
            </button>
            <button
              type="submit"
              className="app-btn app-btn-primary"
              disabled={isSubmitDisabled}
              data-testid="set-upstream-submit-btn"
            >
              {isPushing ? t('git.pushing') : t('git.pushAndSetUpstream')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
