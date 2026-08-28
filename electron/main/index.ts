import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'

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
