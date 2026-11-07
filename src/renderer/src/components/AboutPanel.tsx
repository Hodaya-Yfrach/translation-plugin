import { useEffect, useState, type JSX } from 'react'
import type { UpdateStatus } from '../../../preload/index.d'
import appIcon from '../../../../resources/icon.png'
import { CloseIcon, GitHubIcon } from './Icons'

const DEVELOPER_NAME = 'Hodaya Yfrach'
const DEVELOPER_GITHUB = 'https://github.com/Hodaya-Yfrach'

const describeUpdate = (status: UpdateStatus): string => {
  switch (status.state) {
    case 'disabled':
      return 'עדכונים אוטומטיים יופעלו בגרסה עתידית'
    case 'idle':
    case 'not-available':
      return 'התוכנה מעודכנת'
    case 'checking':
      return 'בודק אם יש עדכון...'
    case 'available':
      return `נמצאה גרסה ${status.version}, מוריד...`
    case 'downloading':
      return `מוריד עדכון... ${status.percent}%`
    case 'downloaded':
      return `גרסה ${status.version} מוכנה להתקנה`
    case 'error':
      return 'בדיקת העדכון נכשלה'
  }
}

type Props = { onClose: () => void }

export default function AboutPanel({ onClose }: Props): JSX.Element {
  const [info, setInfo] = useState<{ name: string; version: string } | null>(null)
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'disabled' })

  useEffect(() => {
    window.api.getAppInfo().then(setInfo)
    window.api.updates.getStatus().then(setUpdate)
    window.api.updates.onStatus(setUpdate)

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const busy =
    update.state === 'checking' ||
    update.state === 'available' ||
    update.state === 'downloading'

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="icon-btn" onClick={onClose} title="סגירה (Esc)">
          <CloseIcon />
        </button>

        <div className="about-head">
          <img src={appIcon} alt="" />
          <div>
            <h2 id="about-title">{info?.name ?? 'FastTranslate AI'}</h2>
            {info && <span className="version">v{info.version}</span>}
          </div>
        </div>

        <div className="about-section">
          <p>תרגום מהיר בין עברית לאנגלית של טקסט מסומן ושל צילומי מסך, עם זיהוי טקסט (OCR).</p>
        </div>

        <div className="about-section">
          <h3>קיצורי מקלדת</h3>
          <ul className="shortcut-list">
            <li>
              <kbd>Alt+T</kbd>
              תרגום הטקסט או התמונה שהועתקו ללוח
            </li>
            <li>
              <kbd>Alt+S</kbd>
              צילום אזור במסך ותרגום שלו
            </li>
            <li>
              <kbd>Esc</kbd>
              סגירת החלון הזה
            </li>
          </ul>
        </div>

        <div className="about-section">
          <h3>פיתוח</h3>
          <div className="dev-row">
            <strong>{DEVELOPER_NAME}</strong>
            <a className="btn link-btn" href={DEVELOPER_GITHUB} target="_blank" rel="noreferrer">
              <GitHubIcon />
              GitHub
            </a>
          </div>
        </div>

        <div className="about-section">
          <h3>עדכונים</h3>
          <div className="update-row">
            <span>{describeUpdate(update)}</span>
            {update.state === 'downloaded' ? (
              <button className="btn primary" onClick={() => window.api.updates.install()}>
                הפעלה מחדש ועדכון
              </button>
            ) : (
              <button
                className="btn"
                disabled={update.state === 'disabled' || busy}
                onClick={() => window.api.updates.check().then(setUpdate)}
              >
                בדיקת עדכונים
              </button>
            )}
          </div>
        </div>

        <div className="about-footer">
          <button className="btn danger" onClick={() => window.api.quitApp()}>
            יציאה מהתוכנה
          </button>
        </div>
      </div>
    </div>
  )
}
