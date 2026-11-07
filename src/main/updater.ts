import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

// עדכונים אוטומטיים מאתר אמרי קודש (electron-updater, ספק generic).
// הכתובת מוגדרת ב-publish בקובץ electron-builder.yml, ו-scripts/publish-update.ps1 מפרסם לשם גרסאות.
// התהליך: בדיקה ברקע -> הורדה ברקע (עם אימות SHA-512) -> לחיצה על "הפעלה מחדש ועדכון"
// מתקינה בשקט ומפעילה מחדש. אם לא לוחצים, העדכון מותקן בשקט ביציאה הבאה מהתוכנה.

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
// אחרי עלייה עם Windows הרשת לפעמים עוד לא מוכנה: מחכים קצת, ובשגיאה מנסים שוב
const FIRST_CHECK_MS = 15 * 1000
const RETRY_MS = 60 * 1000
const MAX_RETRIES = 10

export type UpdateStatus =
  | { state: 'disabled' }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string; notes: string | null }
  | { state: 'error'; message: string }

let status: UpdateStatus = { state: 'disabled' }
let retries = 0
let retryTimer: NodeJS.Timeout | null = null
const listeners: Array<(status: UpdateStatus) => void> = []

/** מאזין לשינויי מצב בתהליך הראשי (למשל תפריט המגש). */
export const onUpdateStatus = (listener: (status: UpdateStatus) => void): void => {
  listeners.push(listener)
}

export const getUpdateStatus = (): UpdateStatus => status

const broadcast = (next: UpdateStatus): void => {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updates:status', status)
  }
  for (const listener of listeners) listener(status)
}

const notesText = (notes: unknown): string | null => {
  if (typeof notes === 'string') return notes.trim() || null
  if (Array.isArray(notes)) {
    const text = notes
      .map((n) => (typeof n?.note === 'string' ? n.note : ''))
      .filter(Boolean)
      .join('\n')
    return text || null
  }
  return null
}

const friendlyError = (err: Error): string => {
  const msg = err.message || ''
  if (/404|Cannot find channel/i.test(msg)) return 'עדיין לא פורסמה גרסה באתר'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::/i.test(msg))
    return 'אין חיבור לאתר העדכונים'
  if (/sha512|checksum/i.test(msg)) return 'הקובץ שהורד לא עבר אימות, ינסה שוב בבדיקה הבאה'
  return 'בדיקת העדכון נכשלה'
}

const check = (): void => {
  // אחרי שעדכון ירד אין סיבה לבדוק שוב (הוא כבר מחכה להתקנה)
  if (status.state === 'downloaded' || status.state === 'downloading') return
  autoUpdater.checkForUpdates().catch(() => {
    // השגיאה עצמה מגיעה גם לאירוע 'error' שלמטה
  })
}

/** מתקין את העדכון שירד, בשקט, ומפעיל את התוכנה מחדש. */
export const installUpdate = (): void => {
  if (status.state === 'downloaded') autoUpdater.quitAndInstall(true, true)
}

export function initUpdater(): void {
  ipcMain.handle('updates:get-status', () => status)
  ipcMain.handle('updates:check', () => {
    if (status.state !== 'disabled') {
      retries = 0
      check()
    }
    return status
  })
  ipcMain.handle('updates:install', installUpdate)

  // בפיתוח (npm run dev) אין התקנה אמיתית להחליף, ולכן העדכונים פעילים רק בגרסה מותקנת
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => {
    retries = 0
    broadcast({ state: 'not-available' })
  })
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ state: 'downloaded', version: info.version, notes: notesText(info.releaseNotes) })
  )
  autoUpdater.on('error', (err) => {
    console.error('updater:', err)
    broadcast({ state: 'error', message: friendlyError(err) })
    if (retries < MAX_RETRIES && !retryTimer) {
      retries++
      retryTimer = setTimeout(() => {
        retryTimer = null
        check()
      }, RETRY_MS)
    }
  })

  broadcast({ state: 'idle' })
  setTimeout(check, FIRST_CHECK_MS)
  setInterval(() => {
    retries = 0
    check()
  }, CHECK_INTERVAL_MS)
}
