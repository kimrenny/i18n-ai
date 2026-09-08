import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  GitRepositoryInfo,
  GitStatusSummary,
  GitCommitSummary,
  GitCommitDetails,
  GitFileStatus,
  GitCommitFileChange,
  GitFileDiff,
  GitBranchInfo,
  GitSyncStatus,
} from '../../types/git'
import {
  fetchRepositoryInfo,
  fetchGitStatus,
  fetchGitLog,
  fetchCommitDetails,
  fetchFileDiff,
  formatGitCommitDate,
  parseDiffContent,
  fetchGitBranches,
  switchGitBranch,
  createGitBranch,
  commitGitSelected,
  fetchGitSyncStatus,
  executeGitFetch,
  executeGitPull,
  executeGitPush,
} from '../../services/git/gitService'
import { BranchSelectorDropdown } from './BranchSelectorDropdown'
import { CreateBranchModal } from './CreateBranchModal'
import { DirtyCheckoutModal } from './DirtyCheckoutModal'
import { CommitSelectedModal } from './CommitSelectedModal'
import { SetUpstreamModal } from './SetUpstreamModal'
import { DirtyPullModal } from './DirtyPullModal'
import { ResizeHandle } from '../common/ResizeHandle'
import { useResizablePanel } from '../../hooks/useResizablePanel'
import type { WorkspacePreflightReport } from '../../types/localizationValidation'
import type { LocalizationQualityIssue } from '../../types/localizationQuality'
import { useTranslation } from '../../i18n/useTranslation'
import './GitSourceControlView.css'

interface GitSourceControlViewProps {
  workspacePath: string
  onNavigateToLocalizationFile?: (filename: string, fullPath: string) => void
  onRefreshWorkspace?: () => void
  preflightReport?: WorkspacePreflightReport | null
  onNavigateToIssue?: (issue: LocalizationQualityIssue) => void
}

type GitViewSubTab = 'working' | 'history'

export const GitSourceControlView: React.FC<GitSourceControlViewProps> = ({
  workspacePath,
  onNavigateToLocalizationFile,
  onRefreshWorkspace,
  preflightReport,
  onNavigateToIssue,
}) => {
  const { t, language } = useTranslation()

  // Primary Git State
  const [subTab, setSubTab] = useState<GitViewSubTab>('working')
  const [repoInfo, setRepoInfo] = useState<GitRepositoryInfo | null>(null)
  const [statusSummary, setStatusSummary] = useState<GitStatusSummary | null>(null)
  const [commits, setCommits] = useState<GitCommitSummary[]>([])
  const [branches, setBranches] = useState<GitBranchInfo[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [branchSuccessBanner, setBranchSuccessBanner] = useState<string | null>(null)

  // Remote Sync State
  const [syncStatus, setSyncStatus] = useState<GitSyncStatus | null>(null)
  const [selectedRemote, setSelectedRemote] = useState<string>('')
  const [isFetching, setIsFetching] = useState<boolean>(false)
  const [isPulling, setIsPulling] = useState<boolean>(false)
  const [isPushing, setIsPushing] = useState<boolean>(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccessBanner, setSyncSuccessBanner] = useState<string | null>(null)
  const [isDirtyPullModalOpen, setIsDirtyPullModalOpen] = useState<boolean>(false)
  const [isSetUpstreamModalOpen, setIsSetUpstreamModalOpen] = useState<boolean>(false)
  const [setUpstreamError, setSetUpstreamError] = useState<string | null>(null)

  const isSyncing = isFetching || isPulling || isPushing

  // Commit Workflow State
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [unrelatedStagedFiles, setUnrelatedStagedFiles] = useState<string[] | undefined>(undefined)
  const [isHookFailed, setIsHookFailed] = useState(false)

  // Branch Management State
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreatingBranch, setIsCreatingBranch] = useState(false)
  const [createBranchError, setCreateBranchError] = useState<string | null>(null)

  const [isDirtyModalOpen, setIsDirtyModalOpen] = useState(false)
  const [pendingSwitchBranch, setPendingSwitchBranch] = useState<string | null>(null)
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false)
  const [switchBranchError, setSwitchBranchError] = useState<string | null>(null)

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

  // Resizable Panels
  const historyDiffResize = useResizablePanel({
    direction: 'vertical',
    initialSize: 340,
    minSize: 140,
    maxSize: 700,
    reverseDelta: true,
  })

  const filesPanelResize = useResizablePanel({
    direction: 'horizontal',
    initialSize: 360,
    minSize: 280,
    maxSize: 560,
    reverseDelta: false,
  })

  const commitsPanelResize = useResizablePanel({
    direction: 'horizontal',
    initialSize: 360,
    minSize: 280,
    maxSize: 560,
    reverseDelta: false,
  })

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

      const [status, branchResult, log, sync] = await Promise.all([
        fetchGitStatus(workspacePath),
        fetchGitBranches(workspacePath),
        fetchGitLog(workspacePath, 50),
        fetchGitSyncStatus(workspacePath),
      ])

      setStatusSummary(status)
      setBranches(branchResult.branches)
      setSyncStatus(sync)

      if (sync.remotes.length > 0) {
        setSelectedRemote((prev) => {
          if (prev && sync.remotes.some((r) => r.name === prev)) {
            return prev
          }
          if (sync.upstreamRemote && sync.remotes.some((r) => r.name === sync.upstreamRemote)) {
            return sync.upstreamRemote
          }
          return sync.remotes.some((r) => r.name === 'origin') ? 'origin' : sync.remotes[0].name
        })
      } else {
        setSelectedRemote('')
      }

      if (branchResult.currentBranch) {
        setRepoInfo((prev) =>
          prev
            ? {
                ...prev,
                currentBranch: branchResult.currentBranch,
                isDetachedHead: branchResult.isDetachedHead,
              }
            : prev
        )
      }

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

  // Handle switching branch
  const performSwitchBranch = useCallback(
    async (targetBranch: string) => {
      if (!workspacePath) return
      setIsSwitchingBranch(true)
      setSwitchBranchError(null)

      try {
        const res = await switchGitBranch(workspacePath, targetBranch)
        if (res.success) {
          setIsDirtyModalOpen(false)
          setPendingSwitchBranch(null)
          setBranchSuccessBanner(t('git.switchSuccess', { branch: targetBranch }))
          setTimeout(() => setBranchSuccessBanner(null), 4000)
          await refreshGitData()
          onRefreshWorkspace?.()
        } else {
          if (res.blockedByWorkingChanges) {
            setSwitchBranchError(t('git.errorBlockedByChanges'))
          } else {
            setSwitchBranchError(
              res.error ? t('git.errorBranchOpFailed', { error: res.error }) : t('git.errorBlockedByChanges')
            )
          }
        }
      } catch (err) {
        setSwitchBranchError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsSwitchingBranch(false)
      }
    },
    [workspacePath, refreshGitData, onRefreshWorkspace, t]
  )

  const handleSelectBranch = useCallback(
    (targetBranch: string) => {
      // If working tree is dirty, prompt with warning modal
      if (statusSummary && statusSummary.totalChanges > 0) {
        setPendingSwitchBranch(targetBranch)
        setSwitchBranchError(null)
        setIsDirtyModalOpen(true)
      } else {
        performSwitchBranch(targetBranch)
      }
    },
    [statusSummary, performSwitchBranch]
  )

  // Handle creating branch
  const handleCreateBranch = useCallback(
    async (newBranchName: string) => {
      if (!workspacePath) return
      setIsCreatingBranch(true)
      setCreateBranchError(null)

      try {
        const res = await createGitBranch(workspacePath, newBranchName)
        if (res.success) {
          setIsCreateModalOpen(false)
          setBranchSuccessBanner(t('git.createSuccess', { branch: newBranchName }))
          setTimeout(() => setBranchSuccessBanner(null), 4000)
          await refreshGitData()
          onRefreshWorkspace?.()
        } else {
          setCreateBranchError(
            res.error ? t('git.errorBranchOpFailed', { error: res.error }) : 'Failed to create branch'
          )
        }
      } catch (err) {
        setCreateBranchError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsCreatingBranch(false)
      }
    },
    [workspacePath, refreshGitData, onRefreshWorkspace, t]
  )

  const selectedFilesForCommit = useMemo(() => {
    if (!statusSummary) return []
    return statusSummary.files.filter((f) => selectedFileIds.has(f.path))
  }, [statusSummary, selectedFileIds])

  // Handle selective commit
  const handleExecuteCommit = useCallback(
    async (commitMsg: string) => {
      if (!workspacePath || selectedFilesForCommit.length === 0) return
      setIsCommitting(true)
      setCommitError(null)
      setUnrelatedStagedFiles(undefined)
      setIsHookFailed(false)

      try {
        const filePaths = selectedFilesForCommit.map((f) => f.path)
        const res = await commitGitSelected(workspacePath, filePaths, commitMsg)

        if (res.success) {
          setIsCommitModalOpen(false)
          // Clear committed files from selection
          setSelectedFileIds((prev) => {
            const next = new Set(prev)
            for (const p of filePaths) {
              next.delete(p)
            }
            return next
          })
          const displayMsg = commitMsg.length > 40 ? `${commitMsg.slice(0, 37)}...` : commitMsg
          setBranchSuccessBanner(
            t('git.commitSuccess', {
              count: res.committedFiles?.length || filePaths.length,
              hash: res.shortHash || '',
              message: displayMsg,
            })
          )
          setTimeout(() => setBranchSuccessBanner(null), 5000)
          await refreshGitData()
          onRefreshWorkspace?.()
        } else {
          setCommitError(res.error || 'Commit failed')
          setUnrelatedStagedFiles(res.unrelatedStagedFiles)
          setIsHookFailed(!!res.hookFailed)
          await refreshGitData()
        }
      } catch (err) {
        setCommitError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsCommitting(false)
      }
    },
    [workspacePath, selectedFilesForCommit, refreshGitData, onRefreshWorkspace, t]
  )

  // Handle Fetch
  const handleFetch = useCallback(async () => {
    if (!workspacePath || isSyncing) return
    setIsFetching(true)
    setSyncError(null)

    try {
      const res = await executeGitFetch(workspacePath, selectedRemote || undefined)
      if (res.success) {
        setSyncSuccessBanner(t('git.fetchSuccess', { remote: res.remote || selectedRemote || 'origin' }))
        setTimeout(() => setSyncSuccessBanner(null), 4000)
        const [updatedSync, updatedBranches, updatedLog] = await Promise.all([
          fetchGitSyncStatus(workspacePath),
          fetchGitBranches(workspacePath),
          fetchGitLog(workspacePath, 50),
        ])
        setSyncStatus(updatedSync)
        setBranches(updatedBranches.branches)
        setCommits(updatedLog)
      } else {
        if (res.errorCode === 'auth_failed') {
          setSyncError(t('git.errorAuthFailed'))
        } else if (res.errorCode === 'network_failed') {
          setSyncError(t('git.errorNetworkFailed'))
        } else if (res.errorCode === 'no_remote') {
          setSyncError(t('git.errorNoRemoteConfigured'))
        } else {
          setSyncError(res.error ? t('git.errorFetchFailed', { error: res.error }) : t('git.errorFetchFailed', { error: '' }))
        }
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsFetching(false)
    }
  }, [workspacePath, isSyncing, selectedRemote, t])

  // Perform Pull execution
  const performPull = useCallback(async () => {
    if (!workspacePath) return
    setIsPulling(true)
    setSyncError(null)

    try {
      const res = await executeGitPull(workspacePath, selectedRemote || undefined)
      if (res.success) {
        setIsDirtyPullModalOpen(false)
        setSyncSuccessBanner(
          t('git.pullSuccess', {
            remote: res.remote || selectedRemote || 'origin',
            branch: res.branch || syncStatus?.upstreamBranch || repoInfo?.currentBranch || 'main',
          })
        )
        setTimeout(() => setSyncSuccessBanner(null), 4000)
        await refreshGitData()
        onRefreshWorkspace?.()
      } else {
        setIsDirtyPullModalOpen(false)
        if (res.hasConflicts) {
          setSyncError(t('git.errorPullConflict', { count: res.conflictFiles?.length || 1 }))
        } else if (res.errorCode === 'unfinished_operation') {
          setSyncError(t('git.errorUnfinishedOperation', { type: res.unfinishedOperation?.type || 'merge' }))
        } else if (res.errorCode === 'auth_failed') {
          setSyncError(t('git.errorAuthFailed'))
        } else if (res.errorCode === 'network_failed') {
          setSyncError(t('git.errorNetworkFailed'))
        } else if (res.errorCode === 'no_upstream') {
          setSyncError(t('git.errorNoUpstreamConfigured'))
        } else if (res.blockedByWorkingChanges) {
          setSyncError(t('git.errorBlockedByChanges'))
        } else {
          setSyncError(res.error ? t('git.errorPullFailed', { error: res.error }) : t('git.errorPullFailed', { error: '' }))
        }
        await refreshGitData()
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsPulling(false)
    }
  }, [workspacePath, selectedRemote, syncStatus, repoInfo, refreshGitData, onRefreshWorkspace, t])

  // Handle Pull button click
  const handlePullClick = useCallback(async () => {
    if (!workspacePath || isSyncing) return
    const freshStatus = await fetchGitStatus(workspacePath)
    setStatusSummary(freshStatus)

    if (freshStatus.totalChanges > 0) {
      setIsDirtyPullModalOpen(true)
    } else {
      performPull()
    }
  }, [workspacePath, isSyncing, performPull])

  // Perform Push execution
  const performPush = useCallback(
    async (targetRemote?: string, targetBranch?: string, setUpstream = false) => {
      if (!workspacePath) return
      setIsPushing(true)
      setSyncError(null)
      setSetUpstreamError(null)

      try {
        const res = await executeGitPush(
          workspacePath,
          targetRemote || selectedRemote || undefined,
          targetBranch || undefined,
          setUpstream
        )

        if (res.success) {
          setIsSetUpstreamModalOpen(false)
          setSyncSuccessBanner(
            t('git.pushSuccess', {
              remote: res.remote || targetRemote || selectedRemote || 'origin',
              branch: res.branch || targetBranch || repoInfo?.currentBranch || 'main',
            })
          )
          setTimeout(() => setSyncSuccessBanner(null), 4000)
          await refreshGitData()
        } else {
          const errMsg = res.rejected
            ? t('git.errorPushRejected')
            : res.errorCode === 'auth_failed'
            ? t('git.errorAuthFailed')
            : res.errorCode === 'network_failed'
            ? t('git.errorNetworkFailed')
            : res.errorCode === 'unfinished_operation'
            ? t('git.errorUnfinishedOperation', { type: 'operation' })
            : res.error
            ? t('git.errorPushFailed', { error: res.error })
            : t('git.errorPushFailed', { error: '' })

          if (isSetUpstreamModalOpen) {
            setSetUpstreamError(errMsg)
          } else {
            setSyncError(errMsg)
          }
          await refreshGitData()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (isSetUpstreamModalOpen) {
          setSetUpstreamError(msg)
        } else {
          setSyncError(msg)
        }
      } finally {
        setIsPushing(false)
      }
    },
    [workspacePath, selectedRemote, repoInfo, isSetUpstreamModalOpen, refreshGitData, t]
  )

  // Handle Push button click
  const handlePushClick = useCallback(() => {
    if (!workspacePath || isSyncing) return
    if (!syncStatus?.hasUpstream) {
      setSetUpstreamError(null)
      setIsSetUpstreamModalOpen(true)
    } else {
      performPush()
    }
  }, [workspacePath, isSyncing, syncStatus, performPush])

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
          {/* Branch Selector Dropdown Container */}
          <div className="git-branch-selector-container">
            <button
              type="button"
              className={`git-branch-selector-btn ${repoInfo?.isDetachedHead ? 'is-detached' : ''}`}
              onClick={() => setIsBranchDropdownOpen((prev) => !prev)}
              title={
                repoInfo?.isDetachedHead
                  ? t('git.detachedHeadTooltip')
                  : `${t('git.currentBranch')}: ${repoInfo?.currentBranch || 'main'}`
              }
              aria-haspopup="dialog"
              aria-expanded={isBranchDropdownOpen}
              data-testid="git-branch-selector-btn"
            >
              <span className="git-icon">🌿</span>
              <span className="git-branch-name" data-testid="git-current-branch-display">
                {repoInfo?.isDetachedHead
                  ? t('git.detachedHeadTitle')
                  : repoInfo?.currentBranch || 'main'}
              </span>
              <span className="git-branch-chevron">▾</span>
            </button>

            <BranchSelectorDropdown
              branches={branches}
              currentBranch={repoInfo?.currentBranch || ''}
              isDetachedHead={!!repoInfo?.isDetachedHead}
              isOpen={isBranchDropdownOpen}
              isLoading={isLoading}
              onClose={() => setIsBranchDropdownOpen(false)}
              onSelectBranch={handleSelectBranch}
              onOpenCreateModal={() => {
                setCreateBranchError(null)
                setIsCreateModalOpen(true)
              }}
            />
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
          {/* Sync Status Badge */}
          {syncStatus && (
            <div
              className={`git-sync-status-badge ${
                repoInfo?.isDetachedHead
                  ? 'is-detached'
                  : !syncStatus.hasRemote
                  ? 'is-no-remote'
                  : !syncStatus.hasUpstream
                  ? 'is-no-upstream'
                  : syncStatus.isDiverged
                  ? 'is-diverged'
                  : syncStatus.ahead > 0
                  ? 'is-ahead'
                  : syncStatus.behind > 0
                  ? 'is-behind'
                  : 'is-synced'
              }`}
              title={
                repoInfo?.isDetachedHead
                  ? t('git.errorDetachedHeadSync')
                  : !syncStatus.hasRemote
                  ? t('git.errorNoRemoteConfigured')
                  : !syncStatus.hasUpstream
                  ? t('git.errorNoUpstreamConfigured')
                  : `${syncStatus.upstream || ''} (${syncStatus.ahead} ahead, ${syncStatus.behind} behind)`
              }
              data-testid="git-sync-status-badge"
            >
              <span className="git-sync-status-icon">
                {repoInfo?.isDetachedHead
                  ? '⚠️'
                  : !syncStatus.hasRemote
                  ? '☁️'
                  : !syncStatus.hasUpstream
                  ? '☁️'
                  : syncStatus.isDiverged
                  ? '↕️'
                  : syncStatus.ahead > 0
                  ? '⬆️'
                  : syncStatus.behind > 0
                  ? '⬇️'
                  : '✓'}
              </span>
              <span className="git-sync-status-text" data-testid="git-sync-status-text">
                {repoInfo?.isDetachedHead
                  ? t('git.detachedHeadTitle')
                  : !syncStatus.hasRemote
                  ? t('git.noRemotes')
                  : !syncStatus.hasUpstream
                  ? t('git.noUpstream')
                  : syncStatus.isDiverged
                  ? t('git.divergedCount', { ahead: syncStatus.ahead, behind: syncStatus.behind })
                  : syncStatus.ahead > 0
                  ? t('git.aheadCount', { count: syncStatus.ahead })
                  : syncStatus.behind > 0
                  ? t('git.behindCount', { count: syncStatus.behind })
                  : t('git.upToDate')}
              </span>
            </div>
          )}
          {/* Remote Sync Actions */}
          <div className="git-sync-actions">
            {syncStatus && syncStatus.remotes.length > 1 && (
              <select
                className="app-select git-remote-select-btn"
                value={selectedRemote}
                onChange={(e) => setSelectedRemote(e.target.value)}
                disabled={isSyncing || isLoading}
                title={t('git.selectRemote')}
                data-testid="git-remote-selector"
              >
                {syncStatus.remotes.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              className="app-btn app-btn-sm git-sync-btn git-fetch-btn"
              onClick={handleFetch}
              disabled={isSyncing || isLoading || !syncStatus?.hasRemote || !!repoInfo?.isDetachedHead}
              title={t('git.fetch')}
              data-testid="git-fetch-btn"
            >
              {isFetching ? '⏳' : '⬇️'} {isFetching ? t('git.fetching') : t('git.fetch')}
            </button>

            <button
              type="button"
              className="app-btn app-btn-sm git-sync-btn git-pull-btn"
              onClick={handlePullClick}
              disabled={
                isSyncing ||
                isLoading ||
                !syncStatus?.hasRemote ||
                !!repoInfo?.isDetachedHead ||
                !syncStatus?.hasUpstream
              }
              title={t('git.pull')}
              data-testid="git-pull-btn"
            >
              {isPulling ? '⏳' : '⏬'} {isPulling ? t('git.pulling') : t('git.pull')}
              {syncStatus && syncStatus.behind > 0 && (
                <span className="git-sync-count-badge" data-testid="git-pull-count-badge">
                  {syncStatus.behind}
                </span>
              )}
            </button>

            <button
              type="button"
              className="app-btn app-btn-sm git-sync-btn git-push-btn"
              onClick={handlePushClick}
              disabled={isSyncing || isLoading || !syncStatus?.hasRemote || !!repoInfo?.isDetachedHead}
              title={syncStatus?.hasUpstream ? t('git.push') : t('git.setUpstream')}
              data-testid="git-push-btn"
            >
              {isPushing ? '⏳' : '🚀'} {isPushing ? t('git.pushing') : t('git.push')}
              {syncStatus && syncStatus.ahead > 0 && (
                <span className="git-sync-count-badge" data-testid="git-push-count-badge">
                  {syncStatus.ahead}
                </span>
              )}
            </button>
          </div>

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
            disabled={isLoading || isSyncing}
            title={t('git.refreshTooltip')}
            data-testid="git-refresh-btn"
          >
            🔄 {t('git.refresh')}
          </button>
        </div>
      </header>

      {/* Branch Operation Success Banner */}
      {branchSuccessBanner && (
        <div className="git-branch-success-banner" role="status" data-testid="branch-success-banner">
          <span className="git-branch-success-text">✓ {branchSuccessBanner}</span>
          <button
            type="button"
            className="git-branch-banner-close"
            onClick={() => setBranchSuccessBanner(null)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sync Success Banner */}
      {syncSuccessBanner && (
        <div className="git-branch-success-banner" role="status" data-testid="sync-success-banner">
          <span className="git-branch-success-text">✓ {syncSuccessBanner}</span>
          <button
            type="button"
            className="git-branch-banner-close"
            onClick={() => setSyncSuccessBanner(null)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sync Error Banner */}
      {syncError && (
        <div className="git-error-banner git-sync-error-banner" role="alert" data-testid="sync-error-banner">
          <span className="git-error-text">⚠️ {syncError}</span>
          <button
            type="button"
            className="git-branch-banner-close"
            onClick={() => setSyncError(null)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

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
            <div
              className="git-files-panel"
              style={{ width: `${filesPanelResize.size}px` }}
            >
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
                    <button
                      type="button"
                      className="app-btn app-btn-sm app-btn-primary git-commit-action-btn"
                      onClick={() => setIsCommitModalOpen(true)}
                      disabled={selectedFilesForCommit.length === 0}
                      title={selectedFilesForCommit.length === 0 ? t('git.selectFilesToCommit') : t('git.commitSelectedTooltip')}
                      data-testid="git-commit-selected-btn"
                    >
                      💾 {t('git.commitSelected', { count: selectedFilesForCommit.length })}
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
                            data-testid={`git-file-checkbox-${file.filename}`}
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

            <ResizeHandle
              direction="horizontal"
              onPointerDown={filesPanelResize.handlePointerDown}
              onPointerMove={filesPanelResize.handlePointerMove}
              onPointerUp={filesPanelResize.handlePointerUp}
              onKeyDown={filesPanelResize.handleKeyDown}
              isResizing={filesPanelResize.isResizing}
              valueNow={filesPanelResize.size}
              valueMin={280}
              valueMax={560}
              ariaLabel={t('git.changedFiles')}
              testId="git-files-resize-handle"
            />

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
            <div
              className="git-commits-panel"
              style={{ width: `${commitsPanelResize.size}px` }}
            >
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

            <ResizeHandle
              direction="horizontal"
              onPointerDown={commitsPanelResize.handlePointerDown}
              onPointerMove={commitsPanelResize.handlePointerMove}
              onPointerUp={commitsPanelResize.handlePointerUp}
              onKeyDown={commitsPanelResize.handleKeyDown}
              isResizing={commitsPanelResize.isResizing}
              valueNow={commitsPanelResize.size}
              valueMin={280}
              valueMax={560}
              ariaLabel={t('git.commitHistory')}
              testId="git-commits-resize-handle"
            />

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

                  {/* Vertical Resize Handle between metadata card and diff viewer */}
                  <ResizeHandle
                    direction="vertical"
                    onPointerDown={historyDiffResize.handlePointerDown}
                    onPointerMove={historyDiffResize.handlePointerMove}
                    onPointerUp={historyDiffResize.handlePointerUp}
                    onKeyDown={historyDiffResize.handleKeyDown}
                    isResizing={historyDiffResize.isResizing}
                    valueNow={historyDiffResize.size}
                    valueMin={140}
                    valueMax={700}
                    ariaLabel={t('git.diffPreview') || 'Resize Diff Viewer'}
                    testId="git-diff-resize-handle"
                  />

                  {/* Diff for selected file in commit */}
                  <div
                    className="git-commit-diff-wrapper"
                    style={{
                      height: `${historyDiffResize.size}px`,
                      minHeight: '140px',
                      maxHeight: '700px',
                      flex: 'none',
                    }}
                  >
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

      {/* Create Branch Modal */}
      <CreateBranchModal
        isOpen={isCreateModalOpen}
        isCreating={isCreatingBranch}
        error={createBranchError}
        onClose={() => {
          setIsCreateModalOpen(false)
          setCreateBranchError(null)
        }}
        onCreate={handleCreateBranch}
      />

      {/* Dirty Working Tree Warning Modal */}
      <DirtyCheckoutModal
        isOpen={isDirtyModalOpen}
        targetBranch={pendingSwitchBranch || ''}
        isSwitching={isSwitchingBranch}
        error={switchBranchError}
        onClose={() => {
          setIsDirtyModalOpen(false)
          setPendingSwitchBranch(null)
          setSwitchBranchError(null)
        }}
        onConfirm={() => {
          if (pendingSwitchBranch) {
            performSwitchBranch(pendingSwitchBranch)
          }
        }}
      />

      {/* Commit Selected Modal */}
      <CommitSelectedModal
        isOpen={isCommitModalOpen}
        workspacePath={workspacePath}
        selectedFiles={selectedFilesForCommit}
        preflightReport={preflightReport}
        isCommitting={isCommitting}
        commitError={commitError}
        unrelatedStagedFiles={unrelatedStagedFiles}
        isHookFailed={isHookFailed}
        onClose={() => {
          setIsCommitModalOpen(false)
          setCommitError(null)
          setUnrelatedStagedFiles(undefined)
          setIsHookFailed(false)
        }}
        onCommit={handleExecuteCommit}
        onNavigateToIssue={onNavigateToIssue}
      />

      {/* Set Upstream Modal */}
      <SetUpstreamModal
        isOpen={isSetUpstreamModalOpen}
        isPushing={isPushing}
        currentBranch={repoInfo?.currentBranch || 'main'}
        remotes={syncStatus?.remotes || []}
        selectedRemote={selectedRemote}
        error={setUpstreamError}
        onClose={() => {
          setIsSetUpstreamModalOpen(false)
          setSetUpstreamError(null)
        }}
        onConfirm={(targetRemote, targetBranch) => {
          performPush(targetRemote, targetBranch, true)
        }}
      />

      {/* Dirty Pull Confirmation Modal */}
      <DirtyPullModal
        isOpen={isDirtyPullModalOpen}
        isPulling={isPulling}
        uncommittedCount={statusSummary?.totalChanges || 0}
        error={syncError}
        onClose={() => {
          setIsDirtyPullModalOpen(false)
        }}
        onConfirm={() => {
          performPull()
        }}
      />
    </div>
  )
}

