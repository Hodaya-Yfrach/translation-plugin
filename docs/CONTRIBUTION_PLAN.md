<div dir="rtl">

# תוכנית תיקונים ל-translation-plugin

המסמך מתאר את סדר העבודה, מה משתנה בכל שלב ואיך כל שלב נבדק.
העבודה נעשית ב-Fork‏ `imreykodesh/translation-plugin`, בענפים נפרדים. בסיום כל שלב הענף נדחף ל-GitHub.

## מצב התחלתי (נבדק על `main`, קומיט `93f37de`)

| בדיקה | תוצאה |
|---|---|
| `npm ci` | עובר |
| `npm run typecheck` | עובר |
| `npm run lint` | נכשל: `eslint` וחבילות התצורה שלו לא מופיעים ב-`package.json` |
| `npm audit` | ‏12 פגיעויות (5 חמורות, 7 בינוניות) |

הפגיעויות לפי מקור:
- **electron 39.8.10** (חמורה) ו-**extract-zip** (חמורה, תלוי ב-Electron): נפתרות בשדרוג ל-Electron 45.
- **vite 7.3.6**, **undici 6.29.0**, **source-map-js 1.2.1** (חמורות) ו-**fast-uri 3.1.8** (בינונית): נפתרות בעדכוני patch. אלה העדכונים שב-PR #2 של Dependabot.
- **electron-builder** ותלויות שלו (`app-builder-lib`, `dmg-builder`, `@electron/universal`, `minimatch`), כולן בינוניות: ‏`npm audit` מציע רק "תיקון" שמוריד את electron-builder לגרסה 24, וזה לא פתרון סביר. אלה כלי בנייה שלא נכנסים לאפליקציה המותקנת.

## שלב 1: שדרוג Electron מ-39 ל-45

**ענף:** `chore/upgrade-electron-45`

בדקתי את [רשימת השינויים השוברים של Electron](https://github.com/electron/electron/blob/main/docs/breaking-changes.md) בגרסאות 40 עד 45 מול הקוד ב-`src/main/index.ts`. שני שינויים שוברים פוגעים באפליקציה:

1. **Electron 44: מודול `clipboard` נכתב מחדש.**
   - `clipboard.readText()` מחזיר עכשיו `Promise<string>`.
   - `clipboard.readImage()` הוסר. במקומו קוראים ל-`clipboard.read()`, מחפשים פריט מסוג `image/*` וממירים את ה-`Blob` ל-`NativeImage`.
   - הקוד הנוכחי משתמש בשתי הפונקציות האלה בקיצור `Alt+T` ובלולאת הבדיקה של `Alt+S`. אם מעדכנים רק את הגרסה, כמו ב-PR #2, שני הקיצורים יפסיקו לעבוד.
2. **Electron 44: האפשרות `openAsHidden` הוסרה מ-`app.setLoginItemSettings()`.** היא עבדה רק ב-macOS 12 ומטה, וב-Windows מעולם לא הייתה לה השפעה. מסירים אותה מהקוד בלי לשנות את ההתנהגות.

שינויים שבדקתי ולא משפיעים על הפרויקט:
- Electron 42: הקובץ הבינארי של Electron כבר לא יורד ב-`postinstall`, אלא בפעם הראשונה שמריצים אותו. ‏`electron-vite dev` ו-`electron-builder` ממשיכים לעבוד.
- Electron 45: הוסרו shims של Node ב-preload שרץ ב-sandbox. כאן `sandbox: false`, אז זה לא רלוונטי.
- Electron 45: חלונות שנפתחים ב-`window.open()` מקבלים תהליך נפרד. האפליקציה חוסמת את כל החלונות האלה דרך `setWindowOpenHandler`.

**מה משתנה:**
- `package.json` ו-`package-lock.json`: ‏`electron` לגרסה `^45.2.3`.
- `src/main/index.ts`:
  - פונקציית עזר אסינכרונית שקוראת תמונה מהלוח (`clipboard.read()`, אחר כך `Blob`, אחר כך `nativeImage.createFromBuffer`).
  - `Alt+T` ו-`Alt+S` עוברים לקריאה אסינכרונית. בלולאת הבדיקה של `Alt+S` יש להיזהר מבדיקות שרצות במקביל.
  - הסרת `openAsHidden`.
- `SECURITY.md`: עדכון סטטוס הפגיעויות.

**בדיקה:** `npm run typecheck`, `npm run build` (בדיקת טיפוסים ובניית electron-vite), `npm audit`.

## שלב 2: עדכוני Dependabot (PR #2)

**ענף:** אותו ענף כמו שלב 1, בקומיט נפרד. ‏PR #2 משנה את אותם קבצים (`package.json`, `package-lock.json`) ואת אותה גרסת Electron, ולכן ענף נפרד היה יוצר קונפליקט.

**מה משתנה:** `vite` לגרסה 7.3.7, ‏`undici` לגרסה 6.29.1, ‏`source-map-js` לגרסה 1.2.2, ‏`fast-uri` לגרסה 3.1.9, דרך `npm audit fix` (בלי `--force`).

**בדיקה:** `npm run typecheck`, `npm run build`, `npm audit`. צפוי שיישארו רק הממצאים הבינוניים של electron-builder.

אחרי המיזוג אפשר לסגור את PR #2, כי הענף הזה מכיל את כל מה שיש בו ואת תיקוני הקוד שהוא היה צריך.

## שלב 3: סידור קבצי הפרויקט

**ענף:** `chore/project-metadata-cleanup` (נפתח מ-`main`, בלי תלות בשלבים 1 ו-2)

**מה משתנה:**
- `package.json`: ‏`description` ו-`author` מקבלים ערכים אמיתיים במקום ערכי התבנית (`"An Electron application with React and TypeScript"`, ‏`"example.com"`). ‏`homepage` מפנה למאגר.
- `package.json`: הוספת `eslint` וחבילות התצורה ש-`eslint.config.mjs` מייבא, כדי ש-`npm run lint` יעבוד.
- `README.md`: הסרת החלק באנגלית שמשכפל את הוראות ההתקנה, ההרצה והבנייה מהחלק בעברית. מה שאין לו מקבילה בעברית (הגדרת IDE מומלצת) עובר לחלק העברי.

**בדיקה:** `npm run lint`, `npm run typecheck`.

## מחוץ לתוכנית

- **שינויים בהתנהגות האפליקציה:** הענפים האלה מתקנים תאימות ומסדרים קבצים בלבד. אין בהם תכונות חדשות.
- **בדיקה ידנית ב-Windows:** האפליקציה משתמשת ב-`ms-screenclip:` ובחלון שקוף. אי אפשר להריץ אותה בסביבה שבה הענפים נבנו (Linux בלי מסך). את `Alt+T` ו-`Alt+S` צריך לבדוק ידנית ב-Windows לפני המיזוג.
- **Pull Requests למאגר המקורי:** ייפתחו רק אחרי אישור של בעל ה-Fork.

</div>
