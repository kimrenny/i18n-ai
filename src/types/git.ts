export type GitFileChangeType =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'

export type GitStagingStatus =
  | 'staged'
  | 'unstaged'
  | 'partially_staged'
  | 'untracked'

export interface GitFileStatus {
  path: string
  filename: string
  oldPath?: string
  status: GitFileChangeType
  stagingStatus: GitStagingStatus
  statusCode: string
  hasStagedChanges: boolean
  hasUnstagedChanges: boolean
  additions: number
  deletions: number
  isLocalization: boolean
  languageCode?: string
  languageName?: string
}

export interface GitRepositoryInfo {
  isGitAvailable: boolean
  isRepository: boolean
  rootPath?: string
  currentBranch?: string
  isDetachedHead?: boolean
  error?: string
}

export interface GitStatusSummary {
  isRepository: boolean
  rootPath: string
  branch: string
  isDetachedHead: boolean
  files: GitFileStatus[]
  totalChanges: number
  totalModified: number
  totalAdded: number
  totalDeleted: number
  totalRenamed: number
  totalUntracked: number
  totalStaged: number
  totalUnstaged: number
  totalPartiallyStaged: number
  localizationFilesCount: number
  allFilesCount: number
  error?: string
}

export interface GitCommitFileChange {
  path: string
  filename: string
  oldPath?: string
  status?: GitFileChangeType
  additions: number
  deletions: number
  isLocalization: boolean
  languageCode?: string
  languageName?: string
}

export interface GitCommitSummary {
  hash: string
  shortHash: string
  authorName: string
  authorEmail: string
  timestamp: number
  subject: string
  isLocalizationCommit: boolean
  localizationFilesCount: number
  totalFilesCount: number
  totalAdditions: number
  totalDeletions: number
}

export interface GitCommitDetails extends GitCommitSummary {
  body: string
  changedFiles: GitCommitFileChange[]
}

export interface GitFileDiff {
  filePath: string
  oldPath?: string
  diff: string
  isBinary: boolean
  additions: number
  deletions: number
  error?: string
}

export interface GitBranchInfo {
  name: string
  isCurrent: boolean
  isDetached?: boolean
  commitHash?: string
  upstream?: string
}

export interface GitBranchListResult {
  currentBranch: string
  isDetachedHead: boolean
  branches: GitBranchInfo[]
  error?: string
}

export interface GitBranchSwitchResult {
  success: boolean
  currentBranch: string
  isDetachedHead: boolean
  error?: string
  blockedByWorkingChanges?: boolean
}

export interface GitBranchCreateResult {
  success: boolean
  branchName: string
  error?: string
}

export interface GitCommitSelectedResult {
  success: boolean
  commitHash?: string
  shortHash?: string
  committedFiles?: string[]
  additions?: number
  deletions?: number
  error?: string
  blockedByUnrelatedStaged?: boolean
  unrelatedStagedFiles?: string[]
  hookFailed?: boolean
  staleSelection?: boolean
}

export type GitSyncErrorCode =
  | 'auth_failed'
  | 'network_failed'
  | 'no_remote'
  | 'no_upstream'
  | 'detached_head'
  | 'unfinished_operation'
  | 'conflict'
  | 'push_rejected'
  | 'blocked_by_changes'
  | 'generic'

export interface GitRemoteInfo {
  name: string
  fetchUrl?: string
  pushUrl?: string
}

export interface GitSyncStatus {
  hasRemote: boolean
  remotes: GitRemoteInfo[]
  currentBranch: string
  isDetachedHead: boolean
  hasUpstream: boolean
  upstream?: string
  upstreamRemote?: string
  upstreamBranch?: string
  ahead: number
  behind: number
  isDiverged: boolean
  isSynchronized: boolean
  unfinishedOperation?: {
    type: 'merge' | 'rebase' | 'cherry-pick' | 'revert'
  }
  error?: string
}

export interface GitFetchResult {
  success: boolean
  remote?: string
  error?: string
  errorCode?: GitSyncErrorCode
}

export interface GitPullResult {
  success: boolean
  remote?: string
  branch?: string
  error?: string
  errorCode?: GitSyncErrorCode
  hasConflicts?: boolean
  conflictFiles?: string[]
  noUpstream?: boolean
  blockedByWorkingChanges?: boolean
  unfinishedOperation?: {
    type: 'merge' | 'rebase' | 'cherry-pick' | 'revert'
  }
}

export interface GitPushResult {
  success: boolean
  remote?: string
  branch?: string
  error?: string
  errorCode?: GitSyncErrorCode
  rejected?: boolean
  noUpstream?: boolean
}
