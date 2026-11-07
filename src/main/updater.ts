import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

// תשתית לעדכונים אוטומטיים (electron-updater).
// כבוי כרגע: כדי להפעיל, משנים ל-true ומפרסמים גרסאות ב-GitHub Releases
// (ההגדרה נמצאת ב-publish בקובץ electron-builder.yml).
const UPDATES_ENABLED = false

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export type UpdateStatus =
  | { state: 'disabled' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

let status: UpdateStatus = { state: 'disabled' }

const broadcast = (next: UpdateStatus): void => {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updates:status', status)
  }
}

const check = (): void => {
  autoUpdater.checkForUpdates().catch((err: Error) => {
    broadcast({ state: 'error', message: err.message })
  })
}

export function initUpdater(): void {
  ipcMain.handle('updates:get-status', () => status)
  ipcMain.handle('updates:check', () => {
    if (status.state !== 'disabled') check()
    return status
  })
  ipcMain.handle('updates:install', () => {
    if (status.state === 'downloaded') autoUpdater.quitAndInstall(true, true)
  })

  // בפיתוח אין קובץ app-update.yml, ולכן מפעילים רק בגרסה מותקנת
  if (!UPDATES_ENABLED || !app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => broadcast({ state: 'not-available' }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) => broadcast({ state: 'error', message: err.message }))

  broadcast({ state: 'idle' })
  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
