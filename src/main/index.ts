import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  clipboard,
  nativeImage,
  NativeImage,
  Tray,
  Menu
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// @ts-ignore
import icon from '../../resources/icon.png?asset'
import { exec } from 'child_process'
import Tesseract from 'tesseract.js'
import { initUpdater } from './updater'

const APP_NAME = 'FastTranslate AI'
// עלייה עם Windows מוסיפה את הדגל הזה (ראו setLoginItemSettings): פותחים ישר למגש המערכת
const startHidden = process.argv.includes('--hidden')

process.on('uncaughtException', (error) => {
  console.error("שגיאת מערכת נתפסה:", error);
});

const gotLock = is.dev ? true : app.requestSingleInstanceLock()
if (!gotLock) {
  console.log('Another instance is already running - exiting')
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let snipping = false
let workerPromise: Promise<Tesseract.Worker> | null = null

app.on('before-quit', () => {
  quitting = true
})

const showMainWindow = (): void => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

app.on('second-instance', showMainWindow)

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip(`${APP_NAME} - Alt+T תרגום, Alt+S צילום מסך`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `פתיחת ${APP_NAME}`, click: showMainWindow },
      {
        label: 'אודות',
        click: () => {
          showMainWindow()
          mainWindow?.webContents.send('show-about')
        }
      },
      { type: 'separator' },
      { label: 'יציאה', click: () => app.quit() }
    ])
  )
  tray.on('click', () => {
    if (mainWindow?.isVisible() && mainWindow.isFocused()) mainWindow.hide()
    else showMainWindow()
  })
}

const getWorker = () => {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker(['eng', 'heb'], 1, {
      cachePath: app.getPath('userData')
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1'
      })
      return worker
    }).catch((err) => {
      workerPromise = null
      throw err
    })
  }
  return workerPromise
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1000,
    height: 640,
    minWidth: 560, // מונע הקטנה שתשבור את העיצוב
    minHeight: 420,
    alwaysOnTop: true,
    show: false, // מוצג ב-ready-to-show כדי שלא יהבהב חלון ריק
    // חלון בלי מסגרת אבל לא שקוף: ב-Windows 11 הוא מקבל פינות מעוגלות, צל ושינוי גודל רגיל
    frame: false,
    backgroundColor: '#F4F6F8',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow?.hide();
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('window-all-closed', () => {})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.whenReady().then(() => {
  if (!gotLock) return

  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  // הפעלה אוטומטית בעליית המחשב (רק בגרסה המותקנת הסופית, לא בפיתוח)
  if (!is.dev) {
    app.setLoginItemSettings({
      openAtLogin: true,
      args: ['--hidden'] // עולה בשקט למגש המערכת בלי לפתוח חלון
    });
  }

  createWindow()
  createTray()
  initUpdater()

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:hide', () => mainWindow?.hide())
  ipcMain.on('app:quit', () => app.quit())
  ipcMain.handle('app:get-info', () => ({ name: APP_NAME, version: app.getVersion() }))

  ipcMain.handle('translate', async (_event, text: string, targetLang: string) => {
    try {
      const base = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t`;
      const response = text.length < 1500
        ? await fetch(`${base}&q=${encodeURIComponent(text)}`)
        : await fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ q: text })
          });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data[0].map((item: any) => item[0]).join('');
    } catch (error) {
      console.error(error);
      return "שגיאה בתרגום.";
    }
  });

  // שורה אחת = שורה אחת: מאחדים רווחים, לא הופכים אותם לירידת שורה
  const cleanOcrText = (text: string) => {
    return text
      .replace(/[^\u0590-\u05FFa-zA-Z0-9.,!?'"():;\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const OCR_MIN_CONFIDENCE = 45

  // טקסט קטן מזוהה גרוע -> מגדילים את התמונה עד פי 3 לפני ה-OCR
  const prepareForOcr = (image: NativeImage) => {
    const { width, height } = image.getSize()
    const wanted = Math.min(3, Math.max(1, 2200 / Math.max(width, height)))
    if (wanted <= 1.05) return { buffer: image.toPNG(), scale: 1 }
    const resized = image.resize({
      width: Math.round(width * wanted),
      height: Math.round(height * wanted),
      quality: 'best'
    })
    return { buffer: resized.toPNG(), scale: resized.getSize().width / width }
  }

  const processImageToUI = async (image: NativeImage, window: BrowserWindow) => {
    const dataUrl = image.toDataURL();
    window.webContents.send('translate-image-start', dataUrl);

    try {
      const worker = await getWorker();
      const { buffer, scale } = prepareForOcr(image);
      const { data } = await worker.recognize(buffer, {}, { blocks: true });
      const rawLines: any[] =
        (data as any).lines ??
        ((data as any).blocks ?? []).flatMap((block: any) =>
          block.paragraphs.flatMap((paragraph: any) => paragraph.lines)
        );

      const lines = rawLines
        // זורקים שורות שה-OCR לא בטוח בהן (זה בדיוק ה"זבל" כמו "unneTed tufouvuti")
        .filter((line: any) => (line.confidence ?? 100) >= OCR_MIN_CONFIDENCE)
        .map((line: any) => ({
          text: cleanOcrText(line.text),
          // מחזירים את הקואורדינטות לגודל התמונה המקורית
          bbox: {
            x0: line.bbox.x0 / scale,
            y0: line.bbox.y0 / scale,
            x1: line.bbox.x1 / scale,
            y1: line.bbox.y1 / scale
          }
        }))
        .filter((line: any) => (line.text.match(/[\u0590-\u05FFa-zA-Z0-9]/g) || []).length >= 2);

      window.webContents.send('translate-image-result', { image: dataUrl, lines });
    } catch (err) {
      console.error(err);
      window.webContents.send('translate-image-result', { image: dataUrl, lines: [] });
    }
  };

  const forceWindowToFront = (win: BrowserWindow) => {
    if (win.isMinimized()) win.restore();
    win.setAlwaysOnTop(true, 'screen-saver'); 
    win.show();
    win.focus();
    win.setAlwaysOnTop(true); 
  };

  // מ-Electron 44 אין clipboard.readImage(): קוראים את הלוח דרך clipboard.read() ומחפשים פריט image/*
  const readClipboardImage = async (): Promise<NativeImage | null> => {
    const items = await clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (!type) continue;
      const data = await item.getType(type);
      if (!('arrayBuffer' in data)) continue;
      const image = nativeImage.createFromBuffer(Buffer.from(await data.arrayBuffer()));
      if (!image.isEmpty()) return image;
    }
    return null;
  };

  globalShortcut.register('Alt+T', () => {
    setTimeout(async () => {
      try {
        const text = (await clipboard.readText()).trim();
        const image = text ? null : await readClipboardImage();
        if (!mainWindow) return;

        if (text) {
          forceWindowToFront(mainWindow);
          setTimeout(() => mainWindow?.webContents.send('translate-text', text), 50);
        } else if (image) {
          forceWindowToFront(mainWindow);
          processImageToUI(image, mainWindow);
        }
      } catch (err) {
        console.error(err);
      }
    }, 50);
  });

  globalShortcut.register('Alt+S', () => {
    if (snipping) return;
    snipping = true;
    clipboard.clear(); 
    exec('start ms-screenclip:'); 

    // הקריאה מהלוח אסינכרונית, ולכן בודקים שוב רק אחרי שהבדיקה הקודמת הסתיימה (לא setInterval)
    let attempts = 0;
    const checkClipboard = async (): Promise<void> => {
      attempts++;
      let newImage: NativeImage | null = null;
      try {
        newImage = await readClipboardImage();
      } catch (err) {
        console.error(err);
      }

      if (newImage) {
        snipping = false;
        if (mainWindow) {
          forceWindowToFront(mainWindow);
          processImageToUI(newImage, mainWindow);
        }
      } else if (attempts >= 30) {
        snipping = false;
      } else {
        setTimeout(checkClipboard, 500);
      }
    };
    setTimeout(checkClipboard, 500);
  });
})