import { ElectronAPI } from '@electron-toolkit/preload'

export type OcrBox = { x0: number; y0: number; x1: number; y1: number }

export type UpdateStatus =
  | { state: 'disabled' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onTranslateText: (callback: (text: string) => void) => void
      onTranslateImageStart: (callback: (imageUrl: string) => void) => void
      onTranslateImageResult: (
        callback: (data: { image: string; lines: Array<{ text: string; bbox: OcrBox }> }) => void
      ) => void
      onShowAbout: (callback: () => void) => void
      translate: (text: string, targetLang: string) => Promise<string>

      minimizeWindow: () => void
      hideWindow: () => void
      quitApp: () => void
      getAppInfo: () => Promise<{ name: string; version: string }>

      updates: {
        getStatus: () => Promise<UpdateStatus>
        check: () => Promise<UpdateStatus>
        install: () => Promise<void>
        onStatus: (callback: (status: UpdateStatus) => void) => void
      }
    }
  }
}
