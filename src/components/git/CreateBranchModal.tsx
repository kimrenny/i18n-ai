import React, { useState, useEffect } from 'react'
import { useTranslation } from '../../i18n/useTranslation'
import { validateBranchNameInput } from '../../services/git/gitService'

interface CreateBranchModalProps {
  isOpen: boolean
  isCreating: boolean
  error: string | null
  onClose: () => void
  onCreate: (branchName: string) => Promise<void> | void
}

export const CreateBranchModal: React.FC<CreateBranchModalProps> = ({
  isOpen,
  isCreating,
  error,
  onClose,
  onCreate,
}) => {
  const { t } = useTranslation()
  const [branchName, setBranchName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [hasInteracted, setHasInteracted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setBranchName('')
      setValidationError(null)
      setHasInteracted(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setBranchName(val)
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

    const result = validateBranchNameInput(branchName)
    if (!result.valid && result.errorKey) {
      setValidationError(t(result.errorKey))
      return
    }

    onCreate(branchName.trim())
  }

  const isSubmitDisabled = isCreating || (hasInteracted && !!validationError) || !branchName.trim()

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-branch-modal-title"
      data-testid="create-branch-modal"
    >
      <div
        className="modal-container git-branch-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="create-branch-modal-title" className="modal-title">
              🌿 {t('git.createNewBranch')}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('git.cancel')}
            disabled={isCreating}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body git-branch-modal-body">
            <div className="git-branch-form-group">
              <label htmlFor="git-branch-name-input" className="git-branch-label">
                {t('git.branchName')}
              </label>
              <input
                id="git-branch-name-input"
                type="text"
                className={`app-input git-branch-input ${hasInteracted && validationError ? 'is-invalid' : ''}`}
                value={branchName}
                onChange={handleInputChange}
                placeholder={t('git.branchNamePlaceholder')}
                autoFocus
                disabled={isCreating}
                data-testid="create-branch-name-input"
              />
              {hasInteracted && validationError && (
                <div className="git-branch-input-error" role="alert" data-testid="branch-input-validation-error">
                  {validationError}
                </div>
              )}
            </div>

            {error && (
              <div className="git-branch-server-error" role="alert" data-testid="branch-server-error">
                ⚠️ {error}
              </div>
            )}
          </div>

          <div className="modal-footer git-branch-modal-footer">
            <button
              type="button"
              className="app-btn app-btn-secondary"
              onClick={onClose}
              disabled={isCreating}
              data-testid="create-branch-cancel-btn"
            >
              {t('git.cancel')}
            </button>
            <button
              type="submit"
              className="app-btn app-btn-primary"
              disabled={isSubmitDisabled}
              data-testid="create-branch-submit-btn"
            >
              {isCreating ? t('git.creatingBranch') : t('git.createAndSwitch')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
