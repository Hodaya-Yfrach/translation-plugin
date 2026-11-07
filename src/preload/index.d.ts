import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onTranslateText: (callback: (text: string) => void) => void
      onTranslateImageStart: (callback: (imageUrl: string) => void) => void
      onTranslateImageResult: (callback: (data: { 
        image: string, 
        lines: Array<{text: string, bbox: {x0: number, y0: number, x1: number, y1: number}}> 
      }) => void) => void
      translate: (text: string, targetLang: string) => Promise<string>
    }
  }
}