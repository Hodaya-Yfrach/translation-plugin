import { useState, useEffect, useRef, useCallback, type CSSProperties, type JSX } from 'react'
import appIcon from '../../../resources/icon.png'
import AboutPanel from './components/AboutPanel'
import { CloseIcon, InfoIcon, MinimizeIcon, NewPageIcon, PowerIcon } from './components/Icons'

type OcrLine = {
  text: string;
  bbox: { x0: number, y0: number, x1: number, y1: number };
  translatedText?: string;
  lineH?: number;
  lineCount?: number;
};

const hebrewToEnglishMap: Record<string, string> = {
  '/': 'q', "'": 'w', 'ק': 'e', 'ר': 'r', 'א': 't', 'ט': 'y', 'ו': 'u', 'ן': 'i', 'ם': 'o', 'פ': 'p',
  'ש': 'a', 'ד': 's', 'ג': 'd', 'כ': 'f', 'ע': 'g', 'י': 'h', 'ח': 'j', 'ל': 'k', 'ך': 'l', 'ף': ';',
  'ז': 'z', 'ס': 'x', 'ב': 'c', 'ה': 'v', 'נ': 'b', 'מ': 'n', 'צ': 'm', 'ת': ',', 'ץ': '.'
};

const englishToHebrewMap: Record<string, string> = {
  'q': '/', 'w': "'", 'e': 'ק', 'r': 'ר', 't': 'א', 'y': 'ט', 'u': 'ו', 'i': 'ן', 'o': 'ם', 'p': 'פ',
  'a': 'ש', 's': 'ד', 'd': 'ג', 'f': 'כ', 'g': 'ע', 'h': 'י', 'j': 'ח', 'k': 'ל', 'l': 'ך', ';': 'ף',
  'z': 'ז', 'x': 'ס', 'c': 'ב', 'v': 'ה', 'b': 'נ', 'n': 'מ', 'm': 'צ', ',': 'ת', '.': 'ץ',
  'Q': '/', 'W': "'", 'E': 'ק', 'R': 'ר', 'T': 'א', 'Y': 'ט', 'U': 'ו', 'I': 'ן', 'O': 'ם', 'P': 'פ',
  'A': 'ש', 'S': 'ד', 'D': 'ג', 'F': 'כ', 'G': 'ע', 'H': 'י', 'J': 'ח', 'K': 'ל', 'L': 'ך', ':': 'ף',
  'Z': 'ז', 'X': 'ס', 'C': 'ב', 'V': 'ה', 'B': 'נ', 'N': 'מ', 'M': 'צ', '<': 'ת', '>': 'ץ'
};

const forceEnglish = (text: string) => text.split('').map(c => hebrewToEnglishMap[c] || c).join('');
const forceHebrew = (text: string) => text.split('').map(c => englishToHebrewMap[c] || c).join('');

// יעד התרגום לפי השפה הדומיננטית בשורה (ולא "יש אות עברית אחת")
const pickTarget = (text: string): 'en' | 'he' => {
  const heb = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const lat = (text.match(/[a-zA-Z]/g) || []).length;
  return heb > lat ? 'en' : 'he';
};
// שורה שאין בה לפחות 2 אותיות (מספרים, סימנים) לא שווה תרגום
const isTranslatable = (text: string) => (text.match(/[\u0590-\u05FFa-zA-Z]/g) || []).length >= 2;

// מאחד שורות OCR סמוכות לפסקאות, כדי לתרגם משפטים שלמים ולא שורה-שורה
const groupIntoParagraphs = (lines: OcrLine[]): OcrLine[] => {
  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const groups: OcrLine[][] = [];

  for (const line of sorted) {
    const h = line.bbox.y1 - line.bbox.y0;
    let target: OcrLine[] | undefined;
    for (let g = groups.length - 1; g >= 0; g--) {
      const prev = groups[g][groups[g].length - 1];
      const prevH = prev.bbox.y1 - prev.bbox.y0;
      const gap = line.bbox.y0 - prev.bbox.y1;
      const overlapX = Math.min(line.bbox.x1, prev.bbox.x1) - Math.max(line.bbox.x0, prev.bbox.x0);
      const minW = Math.min(line.bbox.x1 - line.bbox.x0, prev.bbox.x1 - prev.bbox.x0);
      const sizeRatio = h / prevH;
      const aligned =
        Math.abs(line.bbox.x0 - prev.bbox.x0) < 2 * Math.max(h, prevH) ||
        Math.abs(line.bbox.x1 - prev.bbox.x1) < 2 * Math.max(h, prevH);
      if (
        gap >= -0.3 * Math.min(h, prevH) &&
        gap < 0.5 * Math.max(h, prevH) &&
        overlapX > 0.3 * minW &&
        sizeRatio > 0.75 && sizeRatio < 1.33 &&
        aligned
      ) {
        target = groups[g];
        break;
      }
    }
    if (target) target.push(line);
    else groups.push([line]);
  }

  return groups
    .map((g): OcrLine => ({
      text: g.map(l => l.text).join(' '),
      bbox: {
        x0: Math.min(...g.map(l => l.bbox.x0)),
        y0: Math.min(...g.map(l => l.bbox.y0)),
        x1: Math.max(...g.map(l => l.bbox.x1)),
        y1: Math.max(...g.map(l => l.bbox.y1))
      },
      lineH: g.reduce((sum, l) => sum + (l.bbox.y1 - l.bbox.y0), 0) / g.length,
      lineCount: g.length
    }))
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
};

// בוחר גודל גופן כך שהתרגום ייכנס בתוך התיבה של הטקסט המקורי
const fitFont = (label: string, w: number, h: number, maxFont: number): number => {
  for (let f = Math.max(maxFont, 9); f > 9; f -= 0.5) {
    const rows = Math.max(1, Math.ceil((label.length * f * 0.55) / Math.max(w - 4, 1)));
    if (rows * f * 1.2 <= h + 2) return f;
  }
  return 9;
};


// גודל הטקסט בחלונות הקריאה (נשמר בין הפעלות)
const FONT_KEY = 'reader-font-size'
const FONT_MIN = 14
const FONT_MAX = 28
const loadFontSize = (): number => {
  const saved = Number(localStorage.getItem(FONT_KEY))
  return saved >= FONT_MIN && saved <= FONT_MAX ? saved : 18
}

const isHebrewText = (text: string): boolean => /[\u0590-\u05FF]/.test(text)

function App(): JSX.Element {
  const [viewMode, setViewMode] = useState<'text' | 'image'>('text')
  const [englishText, setEnglishText] = useState<string>('')
  const [hebrewText, setHebrewText] = useState<string>('')
  const [copyStatus, setCopyStatus] = useState<{ eng: boolean; heb: boolean; all: boolean }>({
    eng: false,
    heb: false,
    all: false
  })
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLines, setImageLines] = useState<OcrLine[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [resultView, setResultView] = useState<'text' | 'map'>('map')
  const [showTranslation, setShowTranslation] = useState(true)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 })
  const [fontSize, setFontSize] = useState(loadFontSize)
  const [aboutOpen, setAboutOpen] = useState(false)
  const observerRef = useRef<ResizeObserver | null>(null)
  const overlayAreaRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!el) return
    const update = (): void => setAreaSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    observerRef.current = ro
  }, [])
  const translationRun = useRef(0)

  const [splitRatio, setSplitRatio] = useState(50)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: MouseEvent): void => {
    if (!contentRef.current) return
    const rect = contentRef.current.getBoundingClientRect()
    let newRatio = ((e.clientY - rect.top) / rect.height) * 100
    if (newRatio < 20) newRatio = 20
    if (newRatio > 80) newRatio = 80
    setSplitRatio(newRatio)
  }

  const handleMouseUp = (): void => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  const handleMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(fontSize))
  }, [fontSize])

  useEffect(() => {
    window.api.onShowAbout(() => setAboutOpen(true))

    window.api.onTranslateText(async (text: string) => {
      setViewMode('text')
      if (text === 'מפענח תמונה...') {
        setEnglishText('מפענח...')
        setHebrewText('מפענח...')
        return
      }

      if (isHebrewText(text)) {
        setHebrewText(text)
        setEnglishText('מתרגם...')
        const result = await window.api.translate(text, 'en')
        setEnglishText(result)
      } else {
        setEnglishText(text)
        setHebrewText('מתרגם...')
        const result = await window.api.translate(text, 'he')
        setHebrewText(result)
      }
    })

    window.api.onTranslateImageStart((url: string) => {
      setViewMode('image')
      setImageUrl(url)
      const probe = new Image()
      probe.onload = () => setNatural({ w: probe.naturalWidth, h: probe.naturalHeight })
      probe.src = url
      setImageLines([])
      translationRun.current++
      setIsAnalyzing(true)
    })

    window.api.onTranslateImageResult(async (data: { image: string; lines: OcrLine[] }) => {
      const runId = ++translationRun.current
      setViewMode('image')
      setImageUrl(data.image)
      setIsAnalyzing(false)
      const lines = groupIntoParagraphs(data.lines)
      setImageLines(lines.map((l) => (isTranslatable(l.text) ? l : { ...l, translatedText: l.text })))

      // תרגום במקביל (5 בקשות בו-זמנית) במקום שורה אחרי שורה
      let next = 0
      const runner = async (): Promise<void> => {
        while (next < lines.length) {
          const i = next++
          const line = lines[i]
          if (!isTranslatable(line.text)) continue
          const translated = await window.api.translate(line.text, pickTarget(line.text))
          if (translationRun.current !== runId) return // הגיעה תמונה חדשה - זורקים תוצאה ישנה
          setImageLines((prev) =>
            prev.map((l, idx) => (idx === i ? { ...l, translatedText: translated } : l))
          )
        }
      }
      await Promise.all(Array.from({ length: 5 }, runner))
    })
  }, [])

  const closeAbout = useCallback(() => setAboutOpen(false), [])

  const handleCopy = (text: string, type: 'eng' | 'heb' | 'all'): void => {
    if (text && !text.includes('מתרגם...')) {
      navigator.clipboard.writeText(text)
      setCopyStatus((prev) => ({ ...prev, [type]: true }))
      setTimeout(() => setCopyStatus((prev) => ({ ...prev, [type]: false })), 2000)
    }
  }

  const translateEngToHeb = async (): Promise<void> => {
    if (!englishText || englishText.includes('מתרגם...')) return
    setHebrewText('מתרגם...')
    const result = await window.api.translate(englishText, 'he')
    setHebrewText(result)
  }

  const translateHebToEng = async (): Promise<void> => {
    if (!hebrewText || hebrewText.includes('מתרגם...')) return
    setEnglishText('מתרגם...')
    const result = await window.api.translate(hebrewText, 'en')
    setEnglishText(result)
  }

  const clearPage = (): void => {
    setEnglishText('')
    setHebrewText('')
    translationRun.current++
    setImageUrl(null)
    setImageLines([])
    setIsAnalyzing(false)
    setViewMode('text')
    setCopyStatus({ eng: false, heb: false, all: false })
  }

  const changeFont = (delta: number): void =>
    setFontSize((f) => Math.min(FONT_MAX, Math.max(FONT_MIN, f + delta)))

  // התמונה מותאמת לשטח הפנוי (אפשר גם להגדיל תמונות קטנות)
  const fitScale =
    natural && areaSize.w > 0 && areaSize.h > 0
      ? Math.min((areaSize.w - 16) / natural.w, (areaSize.h - 16) / natural.h, 5)
      : 0

  const fullTranslatedText = imageLines.map((l) => l.translatedText || l.text).join('\n')
  const topPaneStyle: CSSProperties = { height: `calc(${splitRatio}% - 7px)`, flex: 'none' }

  const copyButton = (text: string, type: 'eng' | 'heb' | 'all', label = 'העתקה'): JSX.Element => (
    <button
      className={copyStatus[type] ? 'btn success' : 'btn'}
      onClick={() => handleCopy(text, type)}
      disabled={!text}
    >
      {copyStatus[type] ? '✓ הועתק' : label}
    </button>
  )

  return (
    <div className="app" style={{ '--reader-size': `${fontSize}px` } as CSSProperties}>
      <header className="titlebar">
        <div className="brand">
          <img src={appIcon} alt="" />
          FastTranslate <span className="badge">AI</span>
        </div>

        <div className="titlebar-actions">
          <button
            className="icon-btn"
            dir="ltr"
            onClick={() => changeFont(-2)}
            disabled={fontSize <= FONT_MIN}
            title="הקטנת טקסט"
          >
            A−
          </button>
          <button
            className="icon-btn"
            dir="ltr"
            onClick={() => changeFont(2)}
            disabled={fontSize >= FONT_MAX}
            title="הגדלת טקסט"
          >
            A+
          </button>
          <button className="icon-btn" onClick={clearPage} title="דף חדש (ניקוי)">
            <NewPageIcon />
          </button>
          <button className="icon-btn" onClick={() => setAboutOpen(true)} title="אודות">
            <InfoIcon />
          </button>
          <span className="tb-sep" />
          <button className="icon-btn" onClick={() => window.api.quitApp()} title="יציאה מהתוכנה">
            <PowerIcon />
          </button>
          <button className="icon-btn" onClick={() => window.api.minimizeWindow()} title="מזעור">
            <MinimizeIcon />
          </button>
          <button
            className="icon-btn close"
            onClick={() => window.api.hideWindow()}
            title="הסתרה למגש המערכת"
          >
            <CloseIcon />
          </button>
        </div>
      </header>

      <main className="content">
        <div className="split" ref={contentRef}>
          {viewMode === 'text' ? (
            <>
              <section className="pane" style={topPaneStyle}>
                <div className="pane-header">
                  <span className="lang-pill">English</span>
                  <div className="pane-actions">
                    <button className="btn primary" onClick={translateEngToHeb} disabled={!englishText}>
                      תרגום לעברית ↓
                    </button>
                    {copyButton(englishText, 'eng')}
                  </div>
                </div>
                <textarea
                  className="text-area"
                  value={englishText}
                  onChange={(e) => setEnglishText(forceEnglish(e.target.value))}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  placeholder="English text..."
                  spellCheck={false}
                />
              </section>

              <div className="resizer" onMouseDown={handleMouseDown}>
                <span />
              </div>

              <section className="pane grow">
                <div className="pane-header">
                  <span className="lang-pill">עברית</span>
                  <div className="pane-actions">
                    <button className="btn primary" onClick={translateHebToEng} disabled={!hebrewText}>
                      ↑ תרגום לאנגלית
                    </button>
                    {copyButton(hebrewText, 'heb')}
                  </div>
                </div>
                <textarea
                  className="text-area"
                  value={hebrewText}
                  onChange={(e) => setHebrewText(forceHebrew(e.target.value))}
                  style={{ direction: 'rtl', textAlign: 'right' }}
                  placeholder="טקסט בעברית..."
                  spellCheck={false}
                />
              </section>
            </>
          ) : (
            <>
              {isAnalyzing && (
                <div className="analyzing">
                  <div>
                    <span className="spinner" />
                    מזהה טקסט בתמונה...
                  </div>
                </div>
              )}

              {imageUrl && (resultView !== 'map' || isAnalyzing) && (
                <>
                  <section className="pane image-pane" style={topPaneStyle}>
                    <img src={imageUrl} alt="צילום המסך" />
                  </section>
                  <div className="resizer" onMouseDown={handleMouseDown}>
                    <span />
                  </div>
                </>
              )}

              {(!isAnalyzing || imageLines.length > 0) && (
                <section className="pane grow">
                  <div className="pane-header">
                    <span className="lang-pill">תרגום התמונה</span>
                    <div className="pane-actions">
                      {resultView === 'map' && (
                        <button className="btn" onClick={() => setShowTranslation((v) => !v)}>
                          {showTranslation ? 'הצגת המקור' : 'הצגת התרגום'}
                        </button>
                      )}
                      <button
                        className="btn"
                        onClick={() => setResultView((v) => (v === 'map' ? 'text' : 'map'))}
                      >
                        {resultView === 'map' ? 'תצוגת טקסט' : 'תצוגה על התמונה'}
                      </button>
                      {copyButton(fullTranslatedText, 'all', 'העתקת הכל')}
                    </div>
                  </div>

                  {!isAnalyzing && imageLines.length === 0 && (
                    <div className="notice">לא זוהה טקסט בתמונה</div>
                  )}

                  {resultView === 'map' ? (
                    <div ref={overlayAreaRef} className="overlay-area">
                      {imageUrl && natural && fitScale > 0 && (
                        <div
                          style={{
                            position: 'relative',
                            width: natural.w * fitScale,
                            height: natural.h * fitScale,
                            flex: 'none',
                            boxShadow: 'var(--shadow)'
                          }}
                        >
                          <img
                            src={imageUrl}
                            alt="צילום המסך"
                            style={{ width: '100%', height: '100%', display: 'block', borderRadius: 6 }}
                          />
                          {showTranslation &&
                            imageLines.map((block, idx) => {
                              const out = block.translatedText
                              if (!out || out === block.text) return null
                              const bw = (block.bbox.x1 - block.bbox.x0) * fitScale
                              const bh = (block.bbox.y1 - block.bbox.y0) * fitScale
                              const lineH = (block.lineH ?? block.bbox.y1 - block.bbox.y0) * fitScale
                              return (
                                <div
                                  key={idx}
                                  className="overlay-block"
                                  title={`${block.text}\n(לחיצה להעתקה)`}
                                  onClick={() => navigator.clipboard.writeText(out)}
                                  style={{
                                    position: 'absolute',
                                    left: block.bbox.x0 * fitScale - 2,
                                    top: block.bbox.y0 * fitScale - 1,
                                    width: bw + 4,
                                    minHeight: bh + 2,
                                    padding: '0 2px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                    color: '#0F172A',
                                    fontSize: `${fitFont(out, bw, bh, lineH * 0.85)}px`,
                                    lineHeight: 1.2,
                                    fontWeight: 500,
                                    wordBreak: 'break-word',
                                    cursor: 'pointer',
                                    borderRadius: 2,
                                    direction: isHebrewText(out) ? 'rtl' : 'ltr',
                                    textAlign: isHebrewText(block.text) ? 'right' : 'left'
                                  }}
                                >
                                  {out}
                                </div>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="reader">
                      {imageLines.map((block, idx) => {
                        const out = block.translatedText || '...'
                        const outHeb = isHebrewText(out)
                        return (
                          <p
                            key={idx}
                            title="לחיצה להעתקה"
                            onClick={() => navigator.clipboard.writeText(out)}
                            style={{ direction: outHeb ? 'rtl' : 'ltr', textAlign: outHeb ? 'right' : 'left' }}
                          >
                            {out}
                          </p>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="statusbar">
        <div className="hints">
          <span>
            <kbd>Alt+T</kbd>
            תרגום מהלוח
          </span>
          <span>
            <kbd>Alt+S</kbd>
            צילום מסך ותרגום
          </span>
        </div>
        <span>סגירת החלון משאירה את התוכנה פעילה במגש המערכת</span>
      </footer>

      {aboutOpen && <AboutPanel onClose={closeAbout} />}
    </div>
  )
}

export default App
