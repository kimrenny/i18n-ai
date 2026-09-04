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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
