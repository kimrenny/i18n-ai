import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  performAiTranslation,
  performBatchAiTranslation,
  type AiTranslationRequestPayload,
  type BatchAiTranslationRequestPayload,
} from './aiService'
import {
  performFreeTranslation,
  performBatchFreeTranslation,
} from './freeTranslationService'
import {
  migrateAppSettings,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from '../../src/types/settings'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure:
//
// ├─┬ dist-electron
// │ ├── main
// │ │   └── index.js
// │ └── preload
// │     └── index.cjs
// ├─┬ dist
// │ └── index.html

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null

const preload = path.join(__dirname, '../preload/index.cjs')

function getSettingsFilePath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

async function loadPersistedSettings(): Promise<AppSettings> {
  try {
    const settingsPath = getSettingsFilePath()
    const content = await fs.readFile(settingsPath, 'utf-8')
    const parsed = JSON.parse(content)
    return migrateAppSettings(parsed)
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

async function persistSettings(settings: AppSettings): Promise<void> {
  try {
    const settingsPath = getSettingsFilePath()
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('[main] Failed to persist settings:', err)
  }
}

function createWindow() {
  console.log('[main] Creating window with preload path:', preload)

  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
  })

  // Test active push message to Renderer process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.whenReady().then(() => {
  // IPC: Dialog selectDirectory
  ipcMain.handle('dialog:selectDirectory', async () => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // IPC: Read directory JSON files
  ipcMain.handle('fs:getJsonFiles', async (_, directoryPath: string) => {
    try {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true })
      const jsonFiles = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => ({
          name: entry.name,
          path: path.join(directoryPath, entry.name),
        }))
      return jsonFiles
    } catch (err) {
      console.error('[main] Error reading directory:', err)
      throw new Error(`Failed to read directory: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // IPC: Read JSON file content
  ipcMain.handle('fs:readJsonFile', async (_, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      console.error(`[main] Error reading file ${filePath}:`, err)
      throw new Error(`Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // IPC: Write JSON files atomically
  ipcMain.handle(
    'fs:writeJsonFiles',
    async (_, files: { path: string; content: string }[]) => {
      console.log(`[main] fs:writeJsonFiles invoked for ${files?.length} files`)
      if (!Array.isArray(files) || files.length === 0) {
        return { success: true }
      }

      for (const file of files) {
        const tempPath = `${file.path}.${Date.now()}.tmp`
        try {
          await fs.writeFile(tempPath, file.content, 'utf-8')
          await fs.rename(tempPath, file.path)
          console.log(`[main] Successfully atomically wrote: ${file.path}`)
        } catch (err) {
          try {
            await fs.unlink(tempPath)
          } catch {
            // ignore temp cleanup error
          }
          console.error(`[main] Failed to write file ${file.path}:`, err)
          throw new Error(
            `Atomic write failed for ${path.basename(file.path)}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      }

      return { success: true }
    }
  )

  // IPC: Settings handlers
  ipcMain.handle('settings:get', async () => {
    console.log('[main] settings:get invoked')
    return await loadPersistedSettings()
  })

  ipcMain.handle(
    'settings:updateAiTranslation',
    async (_, update: Partial<AppSettings['aiTranslation']>) => {
      console.log('[main] settings:updateAiTranslation invoked with provider:', update?.provider)
      const current = await loadPersistedSettings()
      const merged = {
        ...current,
        aiTranslation: {
          ...current.aiTranslation,
          ...(update && typeof update === 'object' ? update : {}),
          providers: {
            ...current.aiTranslation.providers,
            ...(update?.providers || {}),
          },
        },
      }
      const updated = migrateAppSettings(merged)
      await persistSettings(updated)
      return updated
    }
  )

  ipcMain.handle(
    'settings:updateTranslation',
    async (_, update: Partial<AppSettings>) => {
      console.log('[main] settings:updateTranslation invoked with engine:', update?.engine)
      const current = await loadPersistedSettings()
      const merged = {
        ...current,
        ...(update && typeof update === 'object' ? update : {}),
        aiTranslation: {
          ...current.aiTranslation,
          ...(update?.aiTranslation || {}),
          providers: {
            ...current.aiTranslation.providers,
            ...(update?.aiTranslation?.providers || {}),
          },
        },
        freeTranslation: {
          ...(current.freeTranslation || DEFAULT_APP_SETTINGS.freeTranslation!),
          ...(update?.freeTranslation || {}),
          providers: {
            ...(current.freeTranslation?.providers || DEFAULT_APP_SETTINGS.freeTranslation!.providers),
            ...(update?.freeTranslation?.providers || {}),
          },
        },
      }
      const updated = migrateAppSettings(merged)
      await persistSettings(updated)
      return updated
    }
  )

  // AI & Free Translation IPC Handlers
  ipcMain.handle(
    'ai:translate',
    async (
      _,
      payload: {
        request: AiTranslationRequestPayload
        settings?: unknown
        appSettings?: unknown
      }
    ) => {
      const canonical = migrateAppSettings(payload?.settings || payload?.appSettings)

      if (canonical.engine === 'free') {
        console.log(
          `[main] free:translate invoked for key "${payload?.request?.key}" with provider "${canonical.freeTranslation?.provider || 'libretranslate'}"`
        )
        return await performFreeTranslation(payload.request, canonical.freeTranslation)
      }

      console.log(
        `[main] ai:translate invoked for key "${payload?.request?.key}" with provider "${canonical.aiTranslation.provider}"`
      )
      return await performAiTranslation(payload.request, canonical.aiTranslation)
    }
  )

  ipcMain.handle(
    'ai:translateBatch',
    async (
      _,
      payload: {
        request: BatchAiTranslationRequestPayload
        settings?: unknown
        appSettings?: unknown
      }
    ) => {
      const canonical = migrateAppSettings(payload?.settings || payload?.appSettings)

      if (canonical.engine === 'free') {
        console.log(
          `[main] free:translateBatch invoked with ${payload?.request?.entries?.length} entries for "${payload?.request?.targetFile}" with provider "${canonical.freeTranslation?.provider || 'libretranslate'}"`
        )
        return await performBatchFreeTranslation(payload.request, canonical.freeTranslation)
      }

      console.log(
        `[main] ai:translateBatch invoked with ${payload?.request?.entries?.length} entries for "${payload?.request?.targetFile}" with provider "${canonical.aiTranslation.provider}"`
      )
      return await performBatchAiTranslation(payload.request, canonical.aiTranslation)
    }
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
