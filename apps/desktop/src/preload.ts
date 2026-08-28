import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  version: process.env.npm_package_version || "1.0.0",
  retryConnection: () => ipcRenderer.invoke("retry-connection"),
  getServiceStatus: () => ipcRenderer.invoke("get-service-status"),
  openDevTools: () => ipcRenderer.invoke("open-devtools"),
  onStatusUpdate: (callback: (data: { web: boolean; api: boolean; timestamp: number }) => void) => {
    ipcRenderer.on("status-update", (_event, data) => callback(data));
  },
});
