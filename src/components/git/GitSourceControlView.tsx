import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  GitRepositoryInfo,
  GitStatusSummary,
  GitCommitSummary,
  GitCommitDetails,
  GitFileStatus,
  GitCommitFileChange,
  GitFileDiff,
} from '../../types/git'
import {
  fetchRepositoryInfo,
  fetchGitStatus,
  fetchGitLog,
  fetchCommitDetails,
  fetchFileDiff,
  formatGitCommitDate,
  parseDiffContent,
} from '../../services/git/gitService'
import { useTranslation } from '../../i18n/useTranslation'
import './GitSourceControlView.css'

interface GitSourceControlViewProps {
  workspacePath: string
  onNavigateToLocalizationFile?: (filename: string, fullPath: string) => void
  onRefreshWorkspace?: () => void
}

type GitViewSubTab = 'working' | 'history'

export const GitSourceControlView: React.FC<GitSourceControlViewProps> = ({
  workspacePath,
  onNavigateToLocalizationFile,
  onRefreshWorkspace,
}) => {
  const { t, language } = useTranslation()

  // Primary Git State
  const [subTab, setSubTab] = useState<GitViewSubTab>('working')
  const [repoInfo, setRepoInfo] = useState<GitRepositoryInfo | null>(null)
  const [statusSummary, setStatusSummary] = useState<GitStatusSummary | null>(null)
  const [commits, setCommits] = useState<GitCommitSummary[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [workingLocOnly, setWorkingLocOnly] = useState<boolean>(false)
  const [historyLocOnly, setHistoryLocOnly] = useState<boolean>(false)

  // Working Changes State
  const [selectedWorkingFile, setSelectedWorkingFile] = useState<GitFileStatus | null>(null)
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())
  const [workingDiff, setWorkingDiff] = useState<GitFileDiff | null>(null)
  const [isLoadingWorkingDiff, setIsLoadingWorkingDiff] = useState<boolean>(false)

  // History State
  const [selectedCommit, setSelectedCommit] = useState<GitCommitSummary | null>(null)
  const [commitDetails, setCommitDetails] = useState<GitCommitDetails | null>(null)
  const [selectedCommitFile, setSelectedCommitFile] = useState<GitCommitFileChange | null>(null)
  const [commitDiff, setCommitDiff] = useState<GitFileDiff | null>(null)
  const [isLoadingHistoryDiff, setIsLoadingHistoryDiff] = useState<boolean>(false)

  // Refresh entire Git data
  const refreshGitData = useCallback(async () => {
    if (!workspacePath) return
    setIsLoading(true)
    setError(null)

    try {
      const info = await fetchRepositoryInfo(workspacePath)
      setRepoInfo(info)

      if (!info.isGitAvailable) {
        setError(info.error || t('git.gitNotInstalled'))
        setIsLoading(false)
        return
      }

      if (!info.isRepository) {
        setIsLoading(false)
        return
      }

      const status = await fetchGitStatus(workspacePath)
      setStatusSummary(status)

      // Auto-select first changed file if none selected or selected is gone
      if (status.files.length > 0) {
        setSelectedWorkingFile((prev) => {
          if (prev && status.files.some((f) => f.path === prev.path)) {
            return prev
          }
          return status.files[0]
        })
      } else {
        setSelectedWorkingFile(null)
        setWorkingDiff(null)
      }

      const log = await fetchGitLog(workspacePath, 50)
      setCommits(log)

      if (log.length > 0) {
        setSelectedCommit((prev) => {
          if (prev && log.some((c) => c.hash === prev.hash)) {
            return prev
          }
          return log[0]
        })
      } else {
        setSelectedCommit(null)
        setCommitDetails(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [workspacePath, t])

  // Initial load and workspacePath change
  useEffect(() => {
    refreshGitData()
  }, [refreshGitData])

  // Load working diff when selectedWorkingFile changes
  useEffect(() => {
    let isCancelled = false
    if (!workspacePath || !selectedWorkingFile) {
      setWorkingDiff(null)
      return
    }

    async function loadDiff() {
      setIsLoadingWorkingDiff(true)
      try {
        const diff = await fetchFileDiff(
          workspacePath,
          selectedWorkingFile!.path,
          undefined,
          selectedWorkingFile!.stagingStatus === 'staged'
        )
        if (!isCancelled) {
          setWorkingDiff(diff)
        }
      } catch (err) {
        if (!isCancelled) {
          setWorkingDiff({
            filePath: selectedWorkingFile!.path,
            diff: '',
            isBinary: false,
            additions: 0,
            deletions: 0,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingWorkingDiff(false)
        }
      }
    }

    loadDiff()
    return () => {
      isCancelled = true
    }
  }, [workspacePath, selectedWorkingFile])

  // Load commit details and first file diff when selectedCommit changes
  useEffect(() => {
    let isCancelled = false
    if (!workspacePath || !selectedCommit) {
      setCommitDetails(null)
      setSelectedCommitFile(null)
      setCommitDiff(null)
      return
    }

    async function loadDetails() {
      try {
        const details = await fetchCommitDetails(workspacePath, selectedCommit!.hash)
        if (!isCancelled && details) {
          setCommitDetails(details)
          if (details.changedFiles.length > 0) {
            setSelectedCommitFile(details.changedFiles[0])
          } else {
            setSelectedCommitFile(null)
            setCommitDiff(null)
          }
        }
      } catch {
        if (!isCancelled) {
          setCommitDetails(null)
          setSelectedCommitFile(null)
        }
      }
    }

    loadDetails()
    return () => {
      isCancelled = true
    }
  }, [workspacePath, selectedCommit])

  // Load commit diff when selectedCommitFile changes
  useEffect(() => {
    let isCancelled = false
    if (!workspacePath || !selectedCommit || !selectedCommitFile) {
      setCommitDiff(null)
      return
    }

    async function loadDiff() {
      setIsLoadingHistoryDiff(true)
      try {
        const diff = await fetchFileDiff(
          workspacePath,
          selectedCommitFile!.path,
          selectedCommit!.hash
        )
        if (!isCancelled) {
          setCommitDiff(diff)
        }
      } catch (err) {
        if (!isCancelled) {
          setCommitDiff({
            filePath: selectedCommitFile!.path,
            diff: '',
            isBinary: false,
            additions: 0,
            deletions: 0,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingHistoryDiff(false)
        }
      }
    }

    loadDiff()
    return () => {
      isCancelled = true
    }
  }, [workspacePath, selectedCommit, selectedCommitFile])

  // Filtered working files
  const displayedWorkingFiles = useMemo(() => {
    if (!statusSummary?.files) return []
    if (workingLocOnly) {
      return statusSummary.files.filter((f) => f.isLocalization)
    }
    return statusSummary.files
  }, [statusSummary, workingLocOnly])

  // Filtered commits
  const displayedCommits = useMemo(() => {
    if (!commits) return []
    if (historyLocOnly) {
      return commits.filter((c) => c.isLocalizationCommit)
    }
    return commits
  }, [commits, historyLocOnly])

  // Selection toggle (Application selection for future commit/operations, NOT staging)
  const handleToggleSelectFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedFileIds((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleSelectAllFiles = () => {
    setSelectedFileIds(new Set(displayedWorkingFiles.map((f) => f.path)))
  }

  const handleClearSelection = () => {
    setSelectedFileIds(new Set())
  }

  // Get staging status badge class and label
  const getStagingBadge = (status: GitFileStatus) => {
    switch (status.stagingStatus) {
      case 'staged':
        return {
          label: t('git.staged'),
          className: 'git-badge-staged',
        }
      case 'partially_staged':
        return {
          label: t('git.partiallyStaged'),
          className: 'git-badge-partially-staged',
        }
      case 'untracked':
        return {
          label: t('git.untracked'),
          className: 'git-badge-untracked',
        }
      default:
        return {
          label: t('git.unstaged'),
          className: 'git-badge-unstaged',
        }
    }
  }

  // Render Diff View helper
  const renderDiffViewer = (
    diff: GitFileDiff | null,
    isLoadingDiff: boolean,
    title: string,
    extraAction?: React.ReactNode
  ) => {
    if (isLoadingDiff) {
      return (
        <div className="git-diff-loading">
          <span className="git-spinner"></span>
          <span>{t('git.loadingDiff')}</span>
        </div>
      )
    }

    if (!diff) {
      return (
        <div className="git-diff-empty">
          <span>{t('git.selectFileToViewDiff')}</span>
        </div>
      )
    }

    if (diff.error) {
      return (
        <div className="git-diff-error">
          <span className="git-diff-error-icon">⚠️</span>
          <span>{diff.error}</span>
        </div>
      )
    }

    if (diff.isBinary) {
      return (
        <div className="git-diff-binary">
          <span>{t('git.binaryFileNotice')}</span>
        </div>
      )
    }

    const lines = parseDiffContent(diff.diff)

    return (
      <div className="git-diff-container">
        <div className="git-diff-header">
          <div className="git-diff-title-area">
            <span className="git-diff-title" title={title}>
              {title}
            </span>
            <div className="git-diff-stat-badges">
              {diff.additions > 0 && (
                <span className="git-stat-add" title={t('git.additions')}>
                  +{diff.additions}
                </span>
              )}
              {diff.deletions > 0 && (
                <span className="git-stat-del" title={t('git.deletions')}>
                  -{diff.deletions}
                </span>
              )}
            </div>
          </div>
          {extraAction && <div className="git-diff-actions">{extraAction}</div>}
        </div>

        <div className="git-diff-content">
          {lines.length === 0 ? (
            <div className="git-diff-empty-msg">{t('git.noChangesDetected')}</div>
          ) : (
            <table className="git-diff-table">
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className={`git-diff-line git-diff-line-${line.type}`}>
                    <td className="git-diff-lineno git-diff-lineno-old">
                      {line.oldLineNumber !== undefined ? line.oldLineNumber : ''}
                    </td>
                    <td className="git-diff-lineno git-diff-lineno-new">
                      {line.newLineNumber !== undefined ? line.newLineNumber : ''}
                    </td>
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
    )
  }

  // Unavailable / Not repository view
  if (!isLoading && repoInfo && !repoInfo.isGitAvailable) {
    return (
      <div className="git-view git-view-unavailable">
        <div className="git-unavailable-card">
          <div className="git-unavailable-icon">⚠️</div>
          <h2 className="git-unavailable-title">{t('git.gitNotAvailableTitle')}</h2>
          <p className="git-unavailable-desc">
            {repoInfo.error || t('git.gitNotAvailableDescription')}
          </p>
          <button
            type="button"
            className="app-btn app-btn-primary git-retry-btn"
            onClick={refreshGitData}
          >
            🔄 {t('git.refresh')}
          </button>
        </div>
      </div>
    )
  }

  if (!isLoading && repoInfo && !repoInfo.isRepository) {
    return (
      <div className="git-view git-view-not-repo">
        <div className="git-not-repo-card">
          <div className="git-not-repo-icon">📁</div>
          <h2 className="git-not-repo-title">{t('git.notAGitRepositoryTitle')}</h2>
          <p className="git-not-repo-desc">
            {t('git.notAGitRepositoryDescription')}
          </p>
          <div className="git-not-repo-path" title={workspacePath}>
            {workspacePath}
          </div>
          <button
            type="button"
            className="app-btn app-btn-secondary git-retry-btn"
            onClick={refreshGitData}
          >
            🔄 {t('git.refresh')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="git-view" data-testid="git-source-control-view">
      {/* Top Source Control Toolbar */}
      <header className="git-toolbar">
        <div className="git-toolbar-left">
          <div className="git-repo-badge" title={repoInfo?.rootPath || workspacePath}>
            <span className="git-icon">🌿</span>
            <span className="git-branch-name">
              {repoInfo?.isDetachedHead
                ? t('git.detachedHead', { branch: repoInfo.currentBranch || 'HEAD' })
                : repoInfo?.currentBranch || 'main'}
            </span>
          </div>

          <div className="git-subtabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'working'}
              className={`git-subtab-btn ${subTab === 'working' ? 'is-active' : ''}`}
              onClick={() => setSubTab('working')}
              data-testid="git-working-tab-btn"
            >
              📝 {t('git.workingChanges')}
              {statusSummary && statusSummary.totalChanges > 0 && (
                <span className="git-tab-count-badge">
                  {statusSummary.totalChanges}
                </span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'history'}
              className={`git-subtab-btn ${subTab === 'history' ? 'is-active' : ''}`}
              onClick={() => setSubTab('history')}
              data-testid="git-history-tab-btn"
            >
              📜 {t('git.history')}
              {commits.length > 0 && (
                <span className="git-tab-count-badge">{commits.length}</span>
              )}
            </button>
          </div>
        </div>

        <div className="git-toolbar-right">
          {subTab === 'working' ? (
            <label className="git-filter-checkbox" title={t('git.localizationOnlyTooltip')}>
              <input
                type="checkbox"
                checked={workingLocOnly}
                onChange={(e) => setWorkingLocOnly(e.target.checked)}
                data-testid="git-working-loc-filter"
              />
              <span>{t('git.localizationFilesOnly')}</span>
              {statusSummary && (
                <span className="git-filter-count">
                  ({statusSummary.localizationFilesCount}/{statusSummary.allFilesCount})
                </span>
              )}
            </label>
          ) : (
            <label className="git-filter-checkbox" title={t('git.localizationCommitsOnlyTooltip')}>
              <input
                type="checkbox"
                checked={historyLocOnly}
                onChange={(e) => setHistoryLocOnly(e.target.checked)}
                data-testid="git-history-loc-filter"
              />
              <span>{t('git.localizationCommitsOnly')}</span>
            </label>
          )}

          <button
            type="button"
            className="app-btn app-btn-sm git-refresh-btn"
            onClick={() => {
              refreshGitData()
              onRefreshWorkspace?.()
            }}
            disabled={isLoading}
            title={t('git.refreshTooltip')}
            data-testid="git-refresh-btn"
          >
            🔄 {t('git.refresh')}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="git-body">
        {isLoading && !statusSummary ? (
          <div className="git-loading-state">
            <span className="git-spinner"></span>
            <span>{t('git.loadingRepository')}</span>
          </div>
        ) : error ? (
          <div className="git-error-banner" role="alert">
            <span>⚠️ {error}</span>
          </div>
        ) : subTab === 'working' ? (
          /* ================= Working Changes Layout ================= */
          <div className="git-working-layout">
            {/* Left Column: Changed Files List */}
            <div className="git-files-panel">
              <div className="git-panel-header">
                <div className="git-panel-title">
                  <span>{t('git.changedFiles')}</span>
                  <span className="git-panel-count">({displayedWorkingFiles.length})</span>
                </div>
                {displayedWorkingFiles.length > 0 && (
                  <div className="git-panel-actions">
                    <button
                      type="button"
                      className="git-link-btn"
                      onClick={handleSelectAllFiles}
                      title={t('git.selectAllTooltip')}
                    >
                      {t('git.selectAll')}
                    </button>
                    <span className="git-action-sep">/</span>
                    <button
                      type="button"
                      className="git-link-btn"
                      onClick={handleClearSelection}
                      title={t('git.clearSelectionTooltip')}
                    >
                      {t('git.clearSelection')}
                    </button>
                  </div>
                )}
              </div>

              {/* Status breakdown pills */}
              {statusSummary && statusSummary.totalChanges > 0 && (
                <div className="git-status-summary-bar">
                  {statusSummary.totalStaged > 0 && (
                    <span className="git-summary-pill git-summary-staged">
                      {statusSummary.totalStaged} {t('git.staged')}
                    </span>
                  )}
                  {statusSummary.totalUnstaged > 0 && (
                    <span className="git-summary-pill git-summary-unstaged">
                      {statusSummary.totalUnstaged} {t('git.unstaged')}
                    </span>
                  )}
                  {statusSummary.totalPartiallyStaged > 0 && (
                    <span className="git-summary-pill git-summary-partially-staged">
                      {statusSummary.totalPartiallyStaged} {t('git.partiallyStaged')}
                    </span>
                  )}
                  {statusSummary.totalUntracked > 0 && (
                    <span className="git-summary-pill git-summary-untracked">
                      {statusSummary.totalUntracked} {t('git.untracked')}
                    </span>
                  )}
                </div>
              )}

              {/* Files List */}
              <div className="git-files-list">
                {displayedWorkingFiles.length === 0 ? (
                  <div className="git-clean-state" data-testid="git-clean-state">
                    <div className="git-clean-icon">✓</div>
                    <div className="git-clean-title">{t('git.workingTreeCleanTitle')}</div>
                    <div className="git-clean-desc">
                      {workingLocOnly
                        ? t('git.noLocalizationWorkingChanges')
                        : t('git.workingTreeCleanDescription')}
                    </div>
                  </div>
                ) : (
                  displayedWorkingFiles.map((file) => {
                    const isSelected = selectedWorkingFile?.path === file.path
                    const isChecked = selectedFileIds.has(file.path)
                    const staging = getStagingBadge(file)

                    return (
                      <div
                        key={file.path}
                        className={`git-file-row ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedWorkingFile(file)}
                        data-testid={`git-file-${file.filename}`}
                      >
                        {/* Application-level Selection Checkbox (NOT staging) */}
                        <label
                          className="git-file-checkbox-label"
                          title={t('git.selectionCheckboxTooltip')}
                          onClick={(e) => handleToggleSelectFile(file.path, e)}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            aria-label={`${t('git.selected')}: ${file.filename}`}
                          />
                        </label>

                        <div className="git-file-info">
                          <div className="git-file-main-line">
                            <span className="git-file-name" title={file.path}>
                              {file.filename}
                            </span>
                            {file.isLocalization && (
                              <span
                                className="git-loc-badge"
                                title={file.languageName || file.languageCode}
                              >
                                {file.languageCode?.toUpperCase() || 'i18n'}
                              </span>
                            )}
                          </div>
                          <div className="git-file-sub-line">
                            <span className="git-file-relpath" title={file.path}>
                              {file.path}
                            </span>
                          </div>
                        </div>

                        <div className="git-file-badges">
                          <span className={`git-badge ${staging.className}`} title={staging.label}>
                            {file.statusCode}
                          </span>
                          <div className="git-file-stats">
                            {file.additions > 0 && (
                              <span className="git-stat-add">+{file.additions}</span>
                            )}
                            {file.deletions > 0 && (
                              <span className="git-stat-del">-{file.deletions}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right Column: Diff & Editor Navigation */}
            <div className="git-diff-panel">
              {renderDiffViewer(
                workingDiff,
                isLoadingWorkingDiff,
                selectedWorkingFile
                  ? `${selectedWorkingFile.path} (${getStagingBadge(selectedWorkingFile).label})`
                  : t('git.noFileSelected'),
                selectedWorkingFile?.isLocalization && onNavigateToLocalizationFile ? (
                  <button
                    type="button"
                    className="app-btn app-btn-sm app-btn-secondary git-open-editor-btn"
                    onClick={() =>
                      onNavigateToLocalizationFile(
                        selectedWorkingFile.filename,
                        selectedWorkingFile.path
                      )
                    }
                    title={t('git.openInLocalizationEditorTooltip')}
                    data-testid="git-open-editor-btn"
                  >
                    🌐 {t('git.openInLocalizationEditor')}
                  </button>
                ) : null
              )}
            </div>
          </div>
        ) : (
          /* ================= Git History Layout ================= */
          <div className="git-history-layout">
            {/* Left Column: Commit List */}
            <div className="git-commits-panel">
              <div className="git-panel-header">
                <div className="git-panel-title">
                  <span>{t('git.commitHistory')}</span>
                  <span className="git-panel-count">({displayedCommits.length})</span>
                </div>
              </div>

              <div className="git-commits-list">
                {displayedCommits.length === 0 ? (
                  <div className="git-clean-state" data-testid="git-no-commits-state">
                    <div className="git-clean-icon">📜</div>
                    <div className="git-clean-title">
                      {historyLocOnly
                        ? t('git.noLocalizationCommitsFound')
                        : t('git.noCommitsFound')}
                    </div>
                  </div>
                ) : (
                  displayedCommits.map((c) => {
                    const isSelected = selectedCommit?.hash === c.hash
                    return (
                      <div
                        key={c.hash}
                        className={`git-commit-row ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedCommit(c)}
                        data-testid={`git-commit-${c.shortHash}`}
                      >
                        <div className="git-commit-header">
                          <span className="git-commit-hash">{c.shortHash}</span>
                          <span className="git-commit-date">
                            {formatGitCommitDate(c.timestamp, language)}
                          </span>
                        </div>

                        <div className="git-commit-subject" title={c.subject}>
                          {c.subject}
                        </div>

                        <div className="git-commit-footer">
                          <span className="git-commit-author" title={c.authorEmail}>
                            👤 {c.authorName}
                          </span>
                          <div className="git-commit-meta-badges">
                            {c.isLocalizationCommit && (
                              <span
                                className="git-loc-commit-badge"
                                title={t('git.localizationFilesCount', {
                                  count: c.localizationFilesCount,
                                })}
                              >
                                i18n ({c.localizationFilesCount})
                              </span>
                            )}
                            <span className="git-files-count-badge">
                              {c.totalFilesCount} {t('git.files')}
                            </span>
                            {c.totalAdditions > 0 && (
                              <span className="git-stat-add">+{c.totalAdditions}</span>
                            )}
                            {c.totalDeletions > 0 && (
                              <span className="git-stat-del">-{c.totalDeletions}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Middle/Right Column: Selected Commit Details & Diff */}
            <div className="git-commit-details-panel">
              {selectedCommit && commitDetails ? (
                <div className="git-commit-detail-container">
                  {/* Commit Metadata Card */}
                  <div className="git-commit-meta-card">
                    <div className="git-commit-detail-header">
                      <h3 className="git-commit-detail-subject">{commitDetails.subject}</h3>
                      <span className="git-commit-full-hash" title={t('git.fullHash')}>
                        {commitDetails.hash}
                      </span>
                    </div>

                    <div className="git-commit-detail-meta-grid">
                      <div className="git-meta-item">
                        <span className="git-meta-label">{t('git.author')}:</span>
                        <span className="git-meta-val">
                          {commitDetails.authorName}{' '}
                          {commitDetails.authorEmail ? `<${commitDetails.authorEmail}>` : ''}
                        </span>
                      </div>
                      <div className="git-meta-item">
                        <span className="git-meta-label">{t('git.date')}:</span>
                        <span className="git-meta-val">
                          {formatGitCommitDate(commitDetails.timestamp, language)}
                        </span>
                      </div>
                    </div>

                    {commitDetails.body && (
                      <div className="git-commit-body-text">
                        <pre>{commitDetails.body}</pre>
                      </div>
                    )}

                    {/* Changed files list in commit */}
                    <div className="git-commit-files-header">
                      <span>{t('git.changedFilesInCommit')}</span>
                      <span className="git-commit-files-count">
                        ({commitDetails.changedFiles.length})
                      </span>
                    </div>
                    <div className="git-commit-files-list">
                      {commitDetails.changedFiles.map((file) => {
                        const isSelectedFile = selectedCommitFile?.path === file.path
                        return (
                          <div
                            key={file.path}
                            className={`git-commit-file-chip ${
                              isSelectedFile ? 'is-selected' : ''
                            }`}
                            onClick={() => setSelectedCommitFile(file)}
                            data-testid={`git-commit-file-${file.filename}`}
                          >
                            <span className="git-chip-name">{file.filename}</span>
                            {file.isLocalization && (
                              <span className="git-chip-loc-badge">
                                {file.languageCode?.toUpperCase() || 'i18n'}
                              </span>
                            )}
                            <span className="git-chip-stats">
                              {file.additions > 0 && `+${file.additions}`}
                              {file.deletions > 0 && ` -${file.deletions}`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Diff for selected file in commit */}
                  <div className="git-commit-diff-wrapper">
                    {renderDiffViewer(
                      commitDiff,
                      isLoadingHistoryDiff,
                      selectedCommitFile
                        ? `${selectedCommitFile.path} @ ${commitDetails.shortHash}`
                        : t('git.noFileSelected')
                    )}
                  </div>
                </div>
              ) : (
                <div className="git-no-commit-selected">
                  <span>{t('git.selectCommitToViewDetails')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
