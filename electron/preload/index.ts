import { contextBridge, ipcRenderer } from 'electron'

export interface JsonFileInfo {
  name: string
  path: string
}

console.log('[preload] Initializing Electron preload bridge...')

// Custom APIs for renderer
export const electronAPI = {
  isElectron: true,
  platform: process.platform,
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory'),
  getJsonFiles: (directoryPath: string): Promise<JsonFileInfo[]> =>
    ipcRenderer.invoke('fs:getJsonFiles', directoryPath),
  readDirectoryTree: (directoryPath: string): Promise<unknown> =>
    ipcRenderer.invoke('fs:readDirectoryTree', directoryPath),
  readJsonFile: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke('fs:readJsonFile', filePath),
  readFileText: (filePath: string): Promise<{ success: boolean; isBinary?: boolean; content?: string; size?: number; error?: string }> =>
    ipcRenderer.invoke('fs:readFileText', filePath),
  writeJsonFiles: (files: { path: string; content: string }[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('fs:writeJsonFiles', files),
  getLastWorkspace: (): Promise<string | null> =>
    ipcRenderer.invoke('workspace:getLast'),
  setLastWorkspace: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('workspace:setLast', dirPath),
  clearLastWorkspace: (): Promise<void> =>
    ipcRenderer.invoke('workspace:clear'),
  getSettings: (): Promise<unknown> =>
    ipcRenderer.invoke('settings:get'),
  updateAiTranslationSettings: (settings: unknown): Promise<unknown> =>
    ipcRenderer.invoke('settings:updateAiTranslation', settings),
  updateTranslationSettings: (settings: unknown): Promise<unknown> =>
    ipcRenderer.invoke('settings:updateTranslation', settings),
  translateWithAi: (request: unknown, settings: unknown): Promise<unknown> =>
    ipcRenderer.invoke('ai:translate', { request, settings }),
  translateBatchWithAi: (request: unknown, settings: unknown): Promise<unknown> =>
    ipcRenderer.invoke('ai:translateBatch', { request, settings }),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

console.log('[preload] Electron preload bridge exposed successfully on window.electronAPI')
