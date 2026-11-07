import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  onTranslateText: (callback: (text: string) => void) => {
    ipcRenderer.removeAllListeners('translate-text');
    ipcRenderer.on('translate-text', (_event, value) => callback(value));
  },
  onTranslateImageStart: (callback: (imageUrl: string) => void) => {
    ipcRenderer.removeAllListeners('translate-image-start');
    ipcRenderer.on('translate-image-start', (_event, value) => callback(value));
  },
  onTranslateImageResult: (callback: (data: { image: string, lines: any[] }) => void) => {
    ipcRenderer.removeAllListeners('translate-image-result');
    ipcRenderer.on('translate-image-result', (_event, value) => callback(value));
  },
  translate: (text: string, targetLang: string) => ipcRenderer.invoke('translate', text, targetLang)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}