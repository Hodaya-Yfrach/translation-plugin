import { useState, useEffect, useRef, useCallback } from 'react'

declare global {
  interface Window {
    api: any;
  }
}

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

function App() {
  const [viewMode, setViewMode] = useState<'text' | 'image'>('text');
  const [englishText, setEnglishText] = useState<string>('')
  const [hebrewText, setHebrewText] = useState<string>('')
  const [copyStatus, setCopyStatus] = useState<{ eng: boolean; heb: boolean; all: boolean }>({
    eng: false, heb: false, all: false
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLines, setImageLines] = useState<OcrLine[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [resultView, setResultView] = useState<'text' | 'map'>('map');
  const [showTranslation, setShowTranslation] = useState(true);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const overlayAreaRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const update = (): void => setAreaSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    observerRef.current = ro;
  }, []);
  const translationRun = useRef(0);
  
  const [splitRatio, setSplitRatio] = useState(50);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!contentRef.current) return;
    const rect = contentRef.current.getBoundingClientRect();
    let newRatio = ((e.clientY - rect.top) / rect.height) * 100;
    if (newRatio < 20) newRatio = 20;
    if (newRatio > 80) newRatio = 80;
    setSplitRatio(newRatio);
  };

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    window.api.onTranslateText(async (text: string) => {
      setViewMode('text');
      if (text === 'מפענח תמונה...') {
        setEnglishText('מפענח...');
        setHebrewText('מפענח...');
        return;
      }
      
      const isHebrew = /[\u0590-\u05FF]/.test(text);
      if (isHebrew) {
        setHebrewText(text); 
        setEnglishText('מתרגם...');
        const result = await window.api.translate(text, 'en');
        setEnglishText(result); 
      } else {
        setEnglishText(text); 
        setHebrewText('מתרגם...');
        const result = await window.api.translate(text, 'he');
        setHebrewText(result); 
      }
    });

    window.api.onTranslateImageStart((url: string) => {
      setViewMode('image');
      setImageUrl(url);
      const probe = new Image();
      probe.onload = () => setNatural({ w: probe.naturalWidth, h: probe.naturalHeight });
      probe.src = url;
      setImageLines([]);
      translationRun.current++;
      setIsAnalyzing(true);
    });

    window.api.onTranslateImageResult(async (data: { image: string, lines: OcrLine[] }) => {
      const runId = ++translationRun.current;
      setViewMode('image');
      setImageUrl(data.image);
      setIsAnalyzing(false);
      const lines = groupIntoParagraphs(data.lines);
      setImageLines(lines.map(l => (isTranslatable(l.text) ? l : { ...l, translatedText: l.text })));

      // תרגום במקביל (5 בקשות בו-זמנית) במקום שורה אחרי שורה
      let next = 0;
      const runner = async () => {
        while (next < lines.length) {
          const i = next++;
          const line = lines[i];
          if (!isTranslatable(line.text)) continue;
          const translated = await window.api.translate(line.text, pickTarget(line.text));
          if (translationRun.current !== runId) return; // הגיעה תמונה חדשה - זורקים תוצאה ישנה
          setImageLines(prev => prev.map((l, idx) => (idx === i ? { ...l, translatedText: translated } : l)));
        }
      };
      await Promise.all(Array.from({ length: 5 }, runner));
    });
  }, [])

  const hideWindow = () => window.close();
  const quitApp = () => window.close(); 

  const handleCopy = (text: string, type: 'eng' | 'heb' | 'all') => {
    if (text && !text.includes('מתרגם...')) {
      navigator.clipboard.writeText(text);
      setCopyStatus(prev => ({ ...prev, [type]: true }));
      setTimeout(() => setCopyStatus(prev => ({ ...prev, [type]: false })), 2000);
    }
  }

  const translateEngToHeb = async () => {
    if (!englishText || englishText.includes('מתרגם...')) return;
    setHebrewText('מתרגם...');
    const result = await window.api.translate(englishText, 'he');
    setHebrewText(result);
  }

  const translateHebToEng = async () => {
    if (!hebrewText || hebrewText.includes('מתרגם...')) return;
    setEnglishText('מתרגם...');
    const result = await window.api.translate(hebrewText, 'en');
    setEnglishText(result);
  }

  const clearPage = () => {
    setEnglishText('');
    setHebrewText('');
    translationRun.current++;
    setImageUrl(null);
    setImageLines([]);
    setIsAnalyzing(false);
    setViewMode('text');
    setCopyStatus({ eng: false, heb: false, all: false });
  }

  // התמונה מותאמת לשטח הפנוי (אפשר גם להגדיל תמונות קטנות)
  const fitScale =
    natural && areaSize.w > 0 && areaSize.h > 0
      ? Math.min((areaSize.w - 16) / natural.w, (areaSize.h - 16) / natural.h, 5)
      : 0;

  const fullTranslatedText = imageLines.map(l => l.translatedText || l.text).join('\n');

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&display=swap');
        
        html, body, #root {
          margin: 0 !important;
          padding: 0 !important;
          background-color: transparent !important;
          overflow: hidden !important;
          font-family: 'Heebo', system-ui, -apple-system, sans-serif;
          height: 100vh;
        }
        * { box-sizing: border-box; }
        textarea:focus { outline: none; }
        
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(20, 184, 166, 0.2); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(20, 184, 166, 0.5); }
        
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-text {
          background: linear-gradient(90deg, #111827 25%, #0D9488 50%, #111827 75%);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: shimmer 2s linear infinite;
          font-weight: 600;
        }

        .resizer-line {
          width: 40px;
          height: 4px;
          background-color: rgba(20, 184, 166, 0.3);
          border-radius: 4px;
          transition: background-color 0.2s, transform 0.2s;
        }
        .resizer-handle:hover .resizer-line {
          background-color: rgba(20, 184, 166, 0.8);
          transform: scaleY(1.5);
        }
        
        .translated-block:hover {
          background-color: rgba(20, 184, 166, 0.1) !important;
          border: 1px solid rgba(20, 184, 166, 0.5) !important;
          transform: scale(1.02);
        }
      `}</style>
      
      <div style={styles.appWrapper}>
        <div style={styles.container}>
          
          <div style={styles.dragBar}>
            <div style={styles.logo}>
              FastTranslate <span style={styles.badge}>AI</span>
            </div>
            <div style={styles.windowControls}>
              <button onClick={quitApp} style={styles.quitBtn} title="סגור תוכנה לחלוטין">התנתקות</button>
              <div style={styles.divider}></div>
              <button onClick={hideWindow} style={styles.closeBtn} title="הסתר חלון">✕</button>
            </div>
          </div>
          
          <div style={styles.content} ref={contentRef}>
            
            {viewMode === 'text' ? (
              <div style={styles.textModeWrapper}>
                <div style={styles.splitLayout}>
                  <div style={{ ...styles.pane, height: `calc(${splitRatio}% - 10px)`, flex: 'none' }}>
                    <div style={styles.paneHeader}>
                      <span style={styles.label}>English</span>
                      <div style={styles.buttonGroup}>
                        <button onClick={translateEngToHeb} style={styles.outlineActionBtn}>
                          תרגום לעברית ↤
                        </button>
                        <button 
                          onClick={() => handleCopy(englishText, 'eng')} 
                          style={copyStatus.eng ? styles.copyBtnSuccess : styles.copyBtn}
                        >
                          {copyStatus.eng ? '✓ הועתק' : 'העתקה'}
                        </button>
                      </div>
                    </div>
                    <textarea 
                      value={englishText} 
                      onChange={(e) => setEnglishText(forceEnglish(e.target.value))}
                      style={{ ...styles.textArea, direction: 'ltr', textAlign: 'left' }}
                      placeholder="English text..."
                    />
                  </div>

                  <div className="resizer-handle" onMouseDown={handleMouseDown} style={styles.resizerHandle}>
                    <div className="resizer-line"></div>
                  </div>

                  <div style={{ ...styles.pane, flex: 1, minHeight: 0 }}>
                    <div style={styles.paneHeader}>
                      <span style={styles.label}>עברית</span>
                      <div style={styles.buttonGroup}>
                        <button onClick={translateHebToEng} style={styles.outlineActionBtn}>
                          ↦ תרגום לאנגלית
                        </button>
                        <button 
                          onClick={() => handleCopy(hebrewText, 'heb')} 
                          style={copyStatus.heb ? styles.copyBtnSuccess : styles.copyBtn}
                        >
                          {copyStatus.heb ? '✓ הועתק' : 'העתקה'}
                        </button>
                      </div>
                    </div>
                    <textarea 
                      value={hebrewText} 
                      onChange={(e) => setHebrewText(forceHebrew(e.target.value))}
                      style={{ ...styles.textArea, direction: 'rtl', textAlign: 'right' }}
                      placeholder="טקסט בעברית..."
                    />
                  </div>
                </div>

                <button onClick={clearPage} style={styles.dictionaryBtn}>
                  + מעבר למילון ופיצול מילים
                </button>
              </div>
            ) : (
              <div style={styles.textModeWrapper}>
                <div style={styles.splitLayout}>
                  {isAnalyzing && (
                    <div style={{...styles.loader, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20}}>
                      <span className="shimmer-text">מפענח טקסט מהתמונה, אנא המתן...</span>
                    </div>
                  )}

                  {imageUrl && (resultView !== 'map' || isAnalyzing) && (
                    <div style={{ ...styles.imageTopPane, height: `calc(${splitRatio}% - 10px)`, flex: 'none' }}>
                      <img src={imageUrl} alt="Captured" style={styles.image} />
                    </div>
                  )}

                  {(resultView !== 'map' || isAnalyzing) && (
                    <div className="resizer-handle" onMouseDown={handleMouseDown} style={styles.resizerHandle}>
                      <div className="resizer-line"></div>
                    </div>
                  )}

                  {(!isAnalyzing || imageLines.length > 0) && (
                    <div style={{ ...styles.pane, flex: 1, minHeight: 0 }}>
                      <div style={styles.paneHeader}>
                        <span style={styles.label}>תרגום התמונה (לחיצה להעתקה)</span>
                        <div style={styles.buttonGroup}>
                          {resultView === 'map' && (
                            <button onClick={() => setShowTranslation(v => !v)} style={styles.outlineActionBtn}>
                              {showTranslation ? 'הצג מקור' : 'הצג תרגום'}
                            </button>
                          )}
                          <button
                            onClick={() => setResultView(v => (v === 'map' ? 'text' : 'map'))}
                            style={styles.outlineActionBtn}
                          >
                            {resultView === 'map' ? 'תצוגת טקסט' : 'תצוגה על התמונה'}
                          </button>
                          <button
                            onClick={() => handleCopy(fullTranslatedText, 'all')}
                            style={copyStatus.all ? styles.copyBtnSuccess : styles.copyBtn}
                          >
                            {copyStatus.all ? '✓ הועתק' : 'העתק הכל ברצף'}
                          </button>
                        </div>
                      </div>

                      {!isAnalyzing && imageLines.length === 0 && (
                        <div style={{ ...styles.loader, color: '#64748B' }}>לא זוהה טקסט בתמונה</div>
                      )}

                      {resultView === 'map' ? (
                        <div ref={overlayAreaRef} style={styles.overlayArea}>
                          {imageUrl && natural && fitScale > 0 && (
                            <div style={{ position: 'relative', width: natural.w * fitScale, height: natural.h * fitScale, flex: 'none' }}>
                              <img src={imageUrl} alt="Captured" style={{ width: '100%', height: '100%', display: 'block', borderRadius: 6 }} />
                              {showTranslation && imageLines.map((block, idx) => {
                                const out = block.translatedText;
                                if (!out || out === block.text) return null;
                                const bw = (block.bbox.x1 - block.bbox.x0) * fitScale;
                                const bh = (block.bbox.y1 - block.bbox.y0) * fitScale;
                                const lineH = (block.lineH ?? (block.bbox.y1 - block.bbox.y0)) * fitScale;
                                const outHeb = /[\u0590-\u05FF]/.test(out);
                                const srcHeb = /[\u0590-\u05FF]/.test(block.text);
                                return (
                                  <div
                                    key={idx}
                                    title={block.text}
                                    onClick={() => navigator.clipboard.writeText(out)}
                                    style={{
                                      position: 'absolute',
                                      left: block.bbox.x0 * fitScale - 2,
                                      top: block.bbox.y0 * fitScale - 1,
                                      width: bw + 4,
                                      minHeight: bh + 2,
                                      padding: '0 2px',
                                      backgroundColor: 'rgba(255, 255, 255, 0.94)',
                                      color: '#0F172A',
                                      fontSize: `${fitFont(out, bw, bh, lineH * 0.85)}px`,
                                      lineHeight: 1.2,
                                      fontWeight: 500,
                                      wordBreak: 'break-word',
                                      cursor: 'pointer',
                                      borderRadius: 2,
                                      direction: outHeb ? 'rtl' : 'ltr',
                                      textAlign: srcHeb ? 'right' : 'left'
                                    }}
                                  >
                                    {out}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={styles.readerWrapper}>
                          {imageLines.map((block, idx) => {
                            const out = block.translatedText || '...';
                            const outHeb = /[\u0590-\u05FF]/.test(out);
                            return (
                              <p
                                key={idx}
                                className="translated-block"
                                onClick={() => navigator.clipboard.writeText(out)}
                                style={{ ...styles.readerPara, direction: outHeb ? 'rtl' : 'ltr', textAlign: outHeb ? 'right' : 'left' }}
                              >
                                {out}
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button onClick={clearPage} style={styles.dictionaryBtn}>
                  + מעבר למילון ופיצול מילים
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

const styles: any = {
  appWrapper: {
    padding: '8px', 
    height: '100vh',
    width: '100vw', 
    display: 'flex',
    boxSizing: 'border-box',
    WebkitAppRegion: 'no-drag' 
  },
  container: {
    flex: 1,
    direction: 'rtl',
    display: 'flex', 
    flexDirection: 'column', 
    backgroundColor: 'rgba(253, 251, 247, 0.90)', 
    backdropFilter: 'blur(20px)', 
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: '16px', 
    boxShadow: '0 0 0 1px rgba(20, 184, 166, 0.3), 0 20px 40px -10px rgba(0, 0, 0, 0.15)', 
    overflow: 'hidden'
  },
  dragBar: {
    WebkitAppRegion: 'drag',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255, 255, 255, 0.5)',
    padding: '12px 24px',
    borderBottom: '1px solid rgba(20, 184, 166, 0.1)'
  },
  logo: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  badge: {
    background: 'linear-gradient(135deg, #0D9488, #14B8A6)', 
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: '0.5px',
    boxShadow: '0 2px 8px rgba(20, 184, 166, 0.3)'
  },
  windowControls: {
    WebkitAppRegion: 'no-drag',
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  quitBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748B',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'color 0.2s',
  },
  divider: {
    width: '1px',
    height: '16px',
    backgroundColor: 'rgba(15, 23, 42, 0.1)'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#111827',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: '400',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.2s',
  },
  content: {
    flex: 1,
    display: 'flex',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden' 
  },
  textModeWrapper: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    gap: '16px'
  },
  splitLayout: {
    display: 'flex',
    flexDirection: 'column', 
    width: '100%',
    flex: 1,
    minHeight: 0
  },
  resizerHandle: {
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'row-resize', 
    zIndex: 10,
    WebkitUserSelect: 'none',
    userSelect: 'none'
  },
  pane: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255, 255, 255, 0.6)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.8)',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)',
    overflow: 'hidden'
  },
  imageTopPane: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.6)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.8)',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.02)',
    padding: '8px',
    overflow: 'hidden'
  },
  image: {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '100%', 
    objectFit: 'contain',
    borderRadius: '8px'
  },
  paneHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(20, 184, 166, 0.1)'
  },
  label: {
    color: '#0F766E', 
    fontWeight: '600',
    fontSize: '14px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center'
  },
  outlineActionBtn: {
    background: 'transparent',
    border: '1px solid rgba(13, 148, 136, 0.4)',
    color: '#0D9488',
    padding: '5px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  copyBtn: {
    background: 'rgba(255,255,255,0.8)',
    border: '1px solid rgba(20, 184, 166, 0.3)',
    color: '#0D9488',
    padding: '6px 16px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  copyBtnSuccess: {
    background: '#14B8A6',
    border: '1px solid #14B8A6',
    color: '#FFFFFF',
    padding: '6px 16px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  textArea: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#111827',
    padding: '20px',
    fontSize: '17px',
    lineHeight: '1.6',
    resize: 'none',
  },
  spatialMapWrapper: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
    position: 'relative'
  },
  overlayArea: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
    overflow: 'hidden',
    background: 'rgba(15, 23, 42, 0.03)'
  },
  readerWrapper: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  readerPara: {
    margin: 0,
    fontSize: '16px',
    lineHeight: 1.7,
    color: '#111827',
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  listRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 10px',
    marginBottom: '6px',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  listOriginal: {
    fontSize: '12px',
    color: '#64748B',
    lineHeight: 1.4
  },
  listTranslated: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#0F766E',
    lineHeight: 1.5
  },
  loader: {
    textAlign: 'center',
    fontSize: '16px',
    padding: '10px'
  },
  dictionaryBtn: {
    background: 'linear-gradient(135deg, #111827, #1F2937)', 
    color: '#FFFFFF',
    border: 'none',
    padding: '14px 24px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(17, 24, 39, 0.15)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    letterSpacing: '0.5px'
  }
};

export default App