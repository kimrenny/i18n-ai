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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
