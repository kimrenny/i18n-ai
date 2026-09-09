import type { AppSettings, AiTranslationSettings } from './settings'
import type { AiTranslationRequest, AiTranslationResult } from '../services/aiTranslation'

export interface JsonFileInfo {
  name: string
  path: string
}

export interface ElectronAPI {
  isElectron: boolean
  platform: string
  selectDirectory: () => Promise<string | null>
  getJsonFiles: (directoryPath: string) => Promise<JsonFileInfo[]>
  readDirectoryTree?: (
    directoryPath: string
  ) => Promise<import('./explorer').DirectoryTreeResult>
  readJsonFile: (filePath: string) => Promise<unknown>
  readFileText?: (filePath: string) => Promise<{
    success: boolean
    isBinary?: boolean
    content?: string
    size?: number
    error?: string
  }>
  writeJsonFiles: (files: { path: string; content: string }[]) => Promise<{ success: boolean }>
  getLastWorkspace?: () => Promise<string | null>
  setLastWorkspace?: (dirPath: string) => Promise<void>
  clearLastWorkspace?: () => Promise<void>
  getSettings: () => Promise<AppSettings>
  updateAiTranslationSettings: (settings: Partial<AiTranslationSettings>) => Promise<AppSettings>
  updateTranslationSettings?: (settings: Partial<AppSettings>) => Promise<AppSettings>
  translateWithAi: (
    request: AiTranslationRequest,
    settings: AiTranslationSettings | AppSettings
  ) => Promise<AiTranslationResult>
  translateBatchWithAi: (
    request: import('../services/aiTranslation').BatchAiTranslationRequest,
    settings: AiTranslationSettings | AppSettings
  ) => Promise<import('../services/aiTranslation').BatchAiTranslationResult>
  gitGetRepositoryInfo?: (
    directoryPath: string
  ) => Promise<import('./git').GitRepositoryInfo>
  gitGetStatus?: (
    directoryPath: string,
    localizationOnly?: boolean
  ) => Promise<import('./git').GitStatusSummary>
  gitGetLog?: (
    directoryPath: string,
    limit?: number,
    localizationOnly?: boolean
  ) => Promise<import('./git').GitCommitSummary[]>
  gitGetCommitDetails?: (
    directoryPath: string,
    commitHash: string
  ) => Promise<import('./git').GitCommitDetails>
  gitGetFileDiff?: (
    directoryPath: string,
    filePath: string,
    commitHash?: string,
    staged?: boolean
  ) => Promise<import('./git').GitFileDiff>
  gitGetBranches?: (
    directoryPath: string
  ) => Promise<import('./git').GitBranchListResult>
  gitSwitchBranch?: (
    directoryPath: string,
    branchName: string
  ) => Promise<import('./git').GitBranchSwitchResult>
  gitCreateBranch?: (
    directoryPath: string,
    branchName: string
  ) => Promise<import('./git').GitBranchCreateResult>
  gitCommitSelected?: (
    directoryPath: string,
    filePaths: string[],
    message: string
  ) => Promise<import('./git').GitCommitSelectedResult>
  gitGetRemotes?: (
    directoryPath: string
  ) => Promise<import('./git').GitRemoteInfo[]>
  gitGetSyncStatus?: (
    directoryPath: string
  ) => Promise<import('./git').GitSyncStatus>
  gitFetch?: (
    directoryPath: string,
    remote?: string
  ) => Promise<import('./git').GitFetchResult>
  gitPull?: (
    directoryPath: string,
    remote?: string,
    branch?: string
  ) => Promise<import('./git').GitPullResult>
  gitPush?: (
    directoryPath: string,
    remote?: string,
    branch?: string,
    setUpstream?: boolean
  ) => Promise<import('./git').GitPushResult>
  keyUsageScanWorkspace?: (
    directoryPath: string,
    options?: { maxDepth?: number; maxFileSize?: number }
  ) => Promise<{
    fileScanResults: import('../services/keyUsageScanner').FileScanResult[]
    totalSourceFiles: number
    totalScannedFiles: number
    totalSkippedFiles: number
    error?: string
  }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
