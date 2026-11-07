import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// מחליף מאזין קודם לאותו ערוץ (React StrictMode רושם פעמיים)
const listen = <T>(channel: string, callback: (value: T) => void): void => {
  ipcRenderer.removeAllListeners(channel)
  ipcRenderer.on(channel, (_event, value: T) => callback(value))
}

const api = {
  onTranslateText: (callback: (text: string) => void) => listen('translate-text', callback),
  onTranslateImageStart: (callback: (imageUrl: string) => void) =>
    listen('translate-image-start', callback),
  onTranslateImageResult: (callback: (data: unknown) => void) =>
    listen('translate-image-result', callback),
  onShowAbout: (callback: () => void) => listen('show-about', callback),
  translate: (text: string, targetLang: string) =>
    ipcRenderer.invoke('translate', text, targetLang),

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  hideWindow: () => ipcRenderer.send('window:hide'),
  quitApp: () => ipcRenderer.send('app:quit'),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),

  updates: {
    getStatus: () => ipcRenderer.invoke('updates:get-status'),
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (callback: (status: unknown) => void) => listen('updates:status', callback)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
