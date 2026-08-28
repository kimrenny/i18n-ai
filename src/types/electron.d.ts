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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
