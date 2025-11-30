const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectFolder: async () => {
    const result = await ipcRenderer.invoke("select-folder");
    return result;
  },
  getSavedFolder: async () => {
    const result = await ipcRenderer.invoke("get-saved-folder");
    return result;
  },
  validateFolder: async (folderPath) => {
    const result = await ipcRenderer.invoke("validate-folder", folderPath);
    return result;
  },
  saveFolder: async (folderPath) => {
    const result = await ipcRenderer.invoke("save-folder", folderPath);
    return result;
  }
});
