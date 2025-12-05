const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  getSavedFolder: () => ipcRenderer.invoke("get-saved-folder"),
  validateFolder: (folderPath) => ipcRenderer.invoke("validate-folder", folderPath),
  saveFolder: (folderPath) => ipcRenderer.invoke("save-folder", folderPath),

  getFolders: () => ipcRenderer.invoke("get-folders"),
  saveFolders: (folders) => ipcRenderer.invoke("save-folders", folders)
});
