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
