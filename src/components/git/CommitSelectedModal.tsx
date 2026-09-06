import React, { useState, useEffect } from 'react'
import type { GitFileStatus, GitFileDiff } from '../../types/git'
import type { WorkspacePreflightReport, PreflightValidationStatus } from '../../types/localizationValidation'
import type { LocalizationQualityIssue } from '../../types/localizationQuality'
import { useTranslation } from '../../i18n/useTranslation'
import { validateCommitMessage, parseDiffContent, fetchFileDiff } from '../../services/git/gitService'

interface CommitSelectedModalProps {
  isOpen: boolean
  workspacePath: string
  selectedFiles: GitFileStatus[]
  preflightReport?: WorkspacePreflightReport | null
  isCommitting: boolean
  commitError: string | null
  unrelatedStagedFiles?: string[]
  isHookFailed?: boolean
  onClose: () => void
  onCommit: (message: string) => Promise<void> | void
  onNavigateToIssue?: (issue: LocalizationQualityIssue) => void
}

export const CommitSelectedModal: React.FC<CommitSelectedModalProps> = ({
  isOpen,
  workspacePath,
  selectedFiles,
  preflightReport,
  isCommitting,
  commitError,
  unrelatedStagedFiles,
  isHookFailed,
  onClose,
  onCommit,
  onNavigateToIssue,
}) => {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const [hasInteracted, setHasInteracted] = useState(false)
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false)
  const [previewFile, setPreviewFile] = useState<GitFileStatus | null>(null)
  const [diff, setDiff] = useState<GitFileDiff | null>(null)
  const [isLoadingDiff, setIsLoadingDiff] = useState(false)

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setMessage('')
      setHasInteracted(false)
      setAcknowledgeWarnings(false)
      setPreviewFile(selectedFiles.length > 0 ? selectedFiles[0] : null)
      setDiff(null)
    }
  }, [isOpen, selectedFiles])

  // Load diff for preview file
  useEffect(() => {
    let isCancelled = false
    if (!isOpen || !workspacePath || !previewFile) {
      setDiff(null)
      return
    }

    async function loadDiff() {
      setIsLoadingDiff(true)
      try {
        const fileDiff = await fetchFileDiff(
          workspacePath,
          previewFile!.path,
          undefined,
          previewFile!.stagingStatus === 'staged'
        )
        if (!isCancelled) {
          setDiff(fileDiff)
        }
      } catch (err) {
        if (!isCancelled) {
          setDiff({
            filePath: previewFile!.path,
            diff: '',
            isBinary: false,
            additions: 0,
            deletions: 0,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingDiff(false)
        }
      }
    }

    loadDiff()
    return () => {
      isCancelled = true
    }
  }, [isOpen, workspacePath, previewFile])

  if (!isOpen) return null

  const validation = validateCommitMessage(message)
  const isMessageValid = validation.valid

  // Pre-flight status analysis
  const preflightStatus: PreflightValidationStatus = preflightReport?.status || 'PASS'
  const isPreflightFailed = preflightStatus === 'FAILED'
  const isPreflightWarnings = preflightStatus === 'WARNINGS'
  const canCommitPreflight =
    preflightStatus === 'PASS' || (isPreflightWarnings && acknowledgeWarnings)

  const isSubmitDisabled =
    isCommitting ||
    !isMessageValid ||
    selectedFiles.length === 0 ||
    !canCommitPreflight

  const totalAdditions = selectedFiles.reduce((acc, f) => acc + (f.additions || 0), 0)
  const totalDeletions = selectedFiles.reduce((acc, f) => acc + (f.deletions || 0), 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setHasInteracted(true)

    if (!isMessageValid || isSubmitDisabled) return
    onCommit(message.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!isSubmitDisabled) {
        onCommit(message.trim())
      }
    }
  }

  const diffLines = diff ? parseDiffContent(diff.diff) : []
  const blockingIssues = preflightReport
    ? preflightReport.checks.flatMap((c) => c.issues).filter((i) => i.severity === 'error')
    : []

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="commit-modal-title"
      data-testid="commit-selected-modal"
    >
      <div
        className="modal-container git-commit-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="git-commit-modal-title-area">
            <h2 id="commit-modal-title" className="modal-title">
              💾 {t('git.commitModalTitle')} ({selectedFiles.length})
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('git.cancel')}
            disabled={isCommitting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="git-commit-modal-form">
          <div className="modal-body git-commit-modal-body">
            {/* Commit Message Section */}
            <div className="git-commit-form-group">
              <label htmlFor="git-commit-message-input" className="git-commit-label">
                {t('git.commitMessage')} <span className="git-required">*</span>
              </label>
              <textarea
                id="git-commit-message-input"
                className={`app-input git-commit-textarea ${hasInteracted && !isMessageValid ? 'is-invalid' : ''}`}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value)
                  setHasInteracted(true)
                }}
                onKeyDown={handleKeyDown}
                placeholder={t('git.commitMessagePlaceholder')}
                rows={3}
                autoFocus
                disabled={isCommitting}
                data-testid="commit-message-input"
              />
              {hasInteracted && !isMessageValid && validation.errorKey && (
                <div className="git-branch-input-error" role="alert" data-testid="commit-message-error">
                  {t(validation.errorKey)}
                </div>
              )}
            </div>

            {/* Pre-flight Validator Integration Card */}
            {preflightReport && (
              <div
                className={`git-commit-preflight-card preflight-card-${preflightStatus.toLowerCase()}`}
                data-testid={`commit-preflight-${preflightStatus.toLowerCase()}`}
              >
                <div className="git-commit-preflight-header">
                  <span className="git-commit-preflight-badge">
                    {preflightStatus === 'PASS' && '✓ PASS'}
                    {preflightStatus === 'WARNINGS' && '⚠️ WARNINGS'}
                    {preflightStatus === 'FAILED' && '✕ FAILED'}
                  </span>
                  <span className="git-commit-preflight-title">
                    {preflightStatus === 'PASS' && t('git.preflightPass')}
                    {preflightStatus === 'WARNINGS' && t('git.preflightWarnings')}
                    {preflightStatus === 'FAILED' && t('git.preflightFailed')}
                  </span>
                </div>

                {isPreflightWarnings && (
                  <div className="git-commit-preflight-body">
                    <p className="git-commit-preflight-desc">
                      {t('git.preflightWarningsDesc', { count: preflightReport.totalWarnings })}
                    </p>
                    <label className="git-commit-acknowledge-label">
                      <input
                        type="checkbox"
                        checked={acknowledgeWarnings}
                        onChange={(e) => setAcknowledgeWarnings(e.target.checked)}
                        data-testid="commit-acknowledge-warnings-checkbox"
                      />
                      <span>{t('git.preflightAcknowledge')}</span>
                    </label>
                  </div>
                )}

                {isPreflightFailed && (
                  <div className="git-commit-preflight-body">
                    <p className="git-commit-preflight-desc">
                      {t('git.preflightFailedDesc', { count: preflightReport.totalErrors })}
                    </p>
                    {blockingIssues.length > 0 && (
                      <div className="git-commit-blocking-issues">
                        {blockingIssues.slice(0, 5).map((issue, idx) => (
                          <div key={idx} className="git-commit-blocking-item">
                            <span className="git-blocking-key">
                              {issue.filename}: {issue.key}
                            </span>
                            {onNavigateToIssue && (
                              <button
                                type="button"
                                className="git-link-btn"
                                onClick={() => {
                                  onClose()
                                  onNavigateToIssue(issue)
                                }}
                              >
                                {t('git.inspectIssue')} →
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Selected Files & Diff Layout */}
            <div className="git-commit-files-section">
              <div className="git-commit-files-header">
                <span className="git-commit-files-title">{t('git.selectedFiles')}</span>
                <span className="git-commit-files-stats">
                  {selectedFiles.length} {t('git.files')} (+{totalAdditions} -{totalDeletions})
                </span>
              </div>

              <div className="git-commit-files-grid">
                {/* File chips list */}
                <div className="git-commit-chips-list" role="listbox">
                  {selectedFiles.map((file) => {
                    const isSelected = previewFile?.path === file.path
                    return (
                      <button
                        key={file.path}
                        type="button"
                        className={`git-commit-file-item ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setPreviewFile(file)}
                        data-testid={`commit-file-chip-${file.filename}`}
                      >
                        <span className={`git-status-code-badge status-${file.status}`}>
                          {file.status === 'modified' ? 'M' : file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : file.status === 'renamed' ? 'R' : '?'}
                        </span>
                        <span className="git-commit-file-name" title={file.path}>
                          {file.filename}
                        </span>
                        {file.isLocalization && (
                          <span className="git-chip-loc-badge">
                            {file.languageCode?.toUpperCase() || 'i18n'}
                          </span>
                        )}
                        <span className="git-chip-stats">
                          {file.additions > 0 && `+${file.additions}`}
                          {file.deletions > 0 && ` -${file.deletions}`}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Diff preview box */}
                <div className="git-commit-diff-preview">
                  {isLoadingDiff ? (
                    <div className="git-diff-loading">
                      <span className="git-spinner"></span>
                    </div>
                  ) : previewFile && diff ? (
                    <div className="git-commit-mini-diff">
                      <div className="git-mini-diff-header">
                        <span className="git-mini-diff-path" title={previewFile.path}>
                          {previewFile.path}
                        </span>
                        <div className="git-diff-stat-badges">
                          {diff.additions > 0 && (
                            <span className="git-stat-add">+{diff.additions}</span>
                          )}
                          {diff.deletions > 0 && (
                            <span className="git-stat-del">-{diff.deletions}</span>
                          )}
                        </div>
                      </div>
                      <div className="git-mini-diff-content">
                        {diffLines.length === 0 ? (
                          <div className="git-diff-empty-msg">{t('git.noChangesDetected')}</div>
                        ) : (
                          <table className="git-diff-table">
                            <tbody>
                              {diffLines.map((line, idx) => (
                                <tr key={idx} className={`git-diff-line git-diff-line-${line.type}`}>
                                  <td className="git-diff-marker">
                                    {line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' '}
                                  </td>
                                  <td className="git-diff-text">
                                    <pre>{line.text.replace(/^[+-]/, '')}</pre>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="git-diff-empty-msg">{t('git.noFileSelected')}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Error alerts */}
            {commitError && (
              <div className="git-branch-server-error" role="alert" data-testid="commit-server-error">
                {isHookFailed ? (
                  <span>🪝 {t('git.errorHookFailed', { error: commitError })}</span>
                ) : unrelatedStagedFiles && unrelatedStagedFiles.length > 0 ? (
                  <div>
                    <div className="git-error-title">⚠️ {t('git.errorUnrelatedStaged')}</div>
                    <ul className="git-unrelated-list">
                      {unrelatedStagedFiles.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <span>⚠️ {commitError}</span>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer git-commit-modal-footer">
            <button
              type="button"
              className="app-btn app-btn-secondary"
              onClick={onClose}
              disabled={isCommitting}
              data-testid="commit-cancel-btn"
            >
              {t('git.cancel')}
            </button>
            <button
              type="submit"
              className="app-btn app-btn-primary git-commit-submit-btn"
              disabled={isSubmitDisabled}
              data-testid="commit-submit-btn"
            >
              {isCommitting ? t('git.committing') : t('git.commitBtn', { count: selectedFiles.length })}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
