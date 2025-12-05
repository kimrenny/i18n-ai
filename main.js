const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const configPath = path.join(__dirname, "config.json");

function readConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      return {};
    }
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch {}
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "src", "index.html"));
  win.webContents.openDevTools();
}

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("get-saved-folder", async () => {
  const config = readConfig();
  return config.translationsFolder || null;
});

ipcMain.handle("get-folders", async () => {
  const config = readConfig();
  return config.folders || [];
});

ipcMain.handle("save-folders", async (event, folders) => {
  try {
    const config = readConfig();
    config.folders = folders;
    writeConfig(config);
    return { success: true };
  } catch {
    return { success: false };
  }
});

ipcMain.handle("validate-folder", async (event, folderPath) => {
  try {
    if (!folderPath || typeof folderPath !== "string") {
      return { valid: false, error: "Path is empty or invalid" };
    }

    const normalized = path.resolve(folderPath);
    if (!fs.existsSync(normalized)) {
      return { valid: false, error: "Folder does not exist" };
    }

    const stats = fs.statSync(normalized);
    if (!stats.isDirectory()) {
      return { valid: false, error: "Path is not a directory" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Error checking folder" };
  }
});

ipcMain.handle("save-folder", async (event, folderPath) => {
  try {
    const normalized = path.resolve(folderPath);
    if (!fs.existsSync(normalized)) {
      return { success: false, error: "Folder does not exist" };
    }

    const config = readConfig();
    config.translationsFolder = normalized;

    if (!config.folders) config.folders = [];
    if (!config.folders.includes(normalized)) {
      config.folders.push(normalized);
    }

    writeConfig(config);
    return { success: true };
  } catch {
    return { success: false, error: "Error saving folder" };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
