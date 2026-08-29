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
  readJsonFile: (filePath: string) => Promise<unknown>
  writeJsonFiles: (files: { path: string; content: string }[]) => Promise<{ success: boolean }>
  getSettings: () => Promise<AppSettings>
  updateAiTranslationSettings: (settings: Partial<AiTranslationSettings>) => Promise<AppSettings>
  translateWithAi: (
    request: AiTranslationRequest,
    settings: AiTranslationSettings
  ) => Promise<AiTranslationResult>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
