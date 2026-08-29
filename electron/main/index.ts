import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  performAiTranslation,
  type AiTranslationRequestPayload,
  type AiTranslationSettingsPayload,
} from './aiService'

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

interface AppSettings {
  aiTranslation: {
    provider: string
    requireEditConfirmation: boolean
    providers: Record<
      string,
      {
        model: string
        apiKey?: string
        baseUrl?: string
      }
    >
  }
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  aiTranslation: {
    provider: 'mock',
    requireEditConfirmation: true,
    providers: {
      mock: { model: 'mock-v1' },
      openai: { model: 'gpt-4o-mini', apiKey: '' },
      gemini: { model: 'gemini-3.6-flash', apiKey: '' },
      anthropic: { model: 'claude-3-5-sonnet-20241022', apiKey: '' },
      mistral: { model: 'mistral-large-latest', apiKey: '' },
      xai: { model: 'grok-2-latest', apiKey: '' },
      deepseek: { model: 'deepseek-chat', apiKey: '' },
      ollama: { model: 'llama3.1', baseUrl: 'http://localhost:11434' },
    },
  },
}

const DEPRECATED_GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-2.0-pro-exp-02-05',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
  'gemini-1.0-pro',
  'gemini-pro',
])

function getSettingsFilePath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

async function loadPersistedSettings(): Promise<AppSettings> {
  try {
    const settingsPath = getSettingsFilePath()
    const content = await fs.readFile(settingsPath, 'utf-8')
    const parsed = JSON.parse(content)

    // Gracefully merge with defaults for backward compatibility
    const aiTrans = parsed?.aiTranslation || {}
    const providers = {
      ...DEFAULT_APP_SETTINGS.aiTranslation.providers,
      ...(aiTrans.providers || {}),
    }

    // Automatically migrate obsolete Gemini models
    if (
      providers.gemini?.model &&
      DEPRECATED_GEMINI_MODELS.has(providers.gemini.model.toLowerCase().trim())
    ) {
      console.log(
        `[main] Migrating deprecated Gemini model "${providers.gemini.model}" -> "gemini-3.6-flash"`
      )
      providers.gemini.model = 'gemini-3.6-flash'
    }

    return {
      aiTranslation: {
        provider: typeof aiTrans.provider === 'string' ? aiTrans.provider : 'mock',
        requireEditConfirmation:
          typeof aiTrans.requireEditConfirmation === 'boolean'
            ? aiTrans.requireEditConfirmation
            : true,
        providers,
      },
    }
  } catch {
    // If file does not exist or cannot be parsed, safely fallback to defaults
    return { ...DEFAULT_APP_SETTINGS }
  }
}

async function persistSettings(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsFilePath()
  const dir = path.dirname(settingsPath)
  await fs.mkdir(dir, { recursive: true })

  const tempPath = `${settingsPath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`
  await fs.writeFile(tempPath, JSON.stringify(settings, null, 2), 'utf-8')
  await fs.rename(tempPath, settingsPath)
}

function createWindow() {
  console.log('[main] Creating window with preload path:', preload)

  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'Localization AI',
    show: false,
  })

  win.webContents.on('console-message', (_, level, message, line, sourceId) => {
    console.log(`[renderer console ${level}] ${message} (${sourceId}:${line})`)
  })

  win.once('ready-to-show', () => {
    win?.show()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('dialog:selectDirectory', async () => {
    console.log('[main] dialog:selectDirectory invoked')
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
        })

    console.log('[main] dialog result:', result)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('fs:getJsonFiles', async (_, directoryPath: string) => {
    console.log('[main] fs:getJsonFiles invoked for:', directoryPath)
    if (!directoryPath || typeof directoryPath !== 'string') {
      throw new Error('Invalid directory path')
    }

    const entries = await fs.readdir(directoryPath, { withFileTypes: true })
    const jsonFiles: { name: string; path: string }[] = []

    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        jsonFiles.push({
          name: entry.name,
          path: path.join(directoryPath, entry.name),
        })
      }
    }

    console.log('[main] found JSON files:', jsonFiles.length)
    return jsonFiles
  })

  ipcMain.handle('fs:readJsonFile', async (_, filePath: string) => {
    console.log('[main] fs:readJsonFile invoked for:', filePath)
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path')
    }

    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  })

  ipcMain.handle(
    'fs:writeJsonFiles',
    async (_, files: { path: string; content: string }[]) => {
      console.log('[main] fs:writeJsonFiles invoked for', files?.length, 'files')
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('No files provided for writing')
      }

      // Perform atomic writes: write to temporary files first, then rename
      const tempFiles: { tempPath: string; finalPath: string }[] = []
      try {
        for (const file of files) {
          if (!file.path || typeof file.path !== 'string') {
            throw new Error('Invalid file path')
          }
          if (typeof file.content !== 'string') {
            throw new Error(`Invalid file content for ${file.path}`)
          }
          const tempPath = `${file.path}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`
          await fs.writeFile(tempPath, file.content, 'utf-8')
          tempFiles.push({ tempPath, finalPath: file.path })
        }

        // Rename all temp files to target paths
        for (const { tempPath, finalPath } of tempFiles) {
          await fs.rename(tempPath, finalPath)
        }

        return { success: true }
      } catch (err) {
        // Clean up any remaining temp files
        for (const { tempPath } of tempFiles) {
          try {
            await fs.unlink(tempPath)
          } catch {
            // ignore cleanup error
          }
        }
        throw err
      }
    }
  )

  // Settings IPC Handlers
  ipcMain.handle('settings:get', async () => {
    console.log('[main] settings:get invoked')
    return await loadPersistedSettings()
  })

  ipcMain.handle(
    'settings:updateAiTranslation',
    async (_, update: Partial<AppSettings['aiTranslation']>) => {
      console.log('[main] settings:updateAiTranslation invoked with:', {
        ...update,
        providers: update.providers ? Object.keys(update.providers) : undefined,
      })
      const current = await loadPersistedSettings()
      const updated: AppSettings = {
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
      await persistSettings(updated)
      return updated
    }
  )

  // AI Translation IPC Handler
  ipcMain.handle(
    'ai:translate',
    async (
      _,
      payload: {
        request: AiTranslationRequestPayload
        settings: AiTranslationSettingsPayload
      }
    ) => {
      console.log(
        `[main] ai:translate invoked for key "${payload?.request?.key}" with provider "${payload?.settings?.provider}"`
      )
      return await performAiTranslation(payload.request, payload.settings)
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
    win = null
  }
})
