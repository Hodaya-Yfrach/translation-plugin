# FastTranslate AI - תוסף תרגום חכם

<div dir="rtl">

## תיאור הפרויקט

תוסף תרגום מתקדם ל-Windows המאפשר תרגום מהיר של טקסט ותמונות בין עברית לאנגלית. התוסף משתמש בטכנולוגיית OCR לזיהוי טקסט מתמונות ומציע תרגום אוטומטי באמצעות Google Translate API.

## תכונות עיקריות

### תרגום טקסט
- תרגום דו-כיווני בין עברית לאנגלית
- המרה אוטומטית של פריסת מקלדת (כשמקלידים עברית במקלדת אנגלית ולהפך)
- העתקה מהירה של הטקסט המתורגם

### זיהוי ותרגום תמונות
- צילום מסך מובנה (Alt+S)
- זיהוי טקסט אוטומטי מתמונות באמצעות Tesseract OCR
- תרגום הטקסט המזוהה ישירות על התמונה או בתצוגת טקסט
- תמיכה בעברית ואנגלית

### קיצורי מקלדת
- `Alt+T` - תרגום טקסט מה-clipboard
- `Alt+S` - צילום מסך ותרגום

## התקנה

### דרישות מערכת
- Node.js 18 ומעלה
- Windows 10/11

### שלבי התקנה

```bash
# שכפול המאגר
git clone https://github.com/Hodaya-Yfrach/translation-plugin.git

# מעבר לתיקיית הפרויקט
cd translation-plugin

# התקנת תלויות
npm install
```

## פיתוח

```bash
# הפעלת מצב פיתוח
npm run dev

# בדיקות קוד
npm run lint
npm run typecheck
```

סביבת עבודה מומלצת: [VSCode](https://code.visualstudio.com/) עם התוספים [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) ו-[Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

## בנייה

```bash
# בנייה ל-Windows
npm run build:win

# בנייה ל-macOS
npm run build:mac

# בנייה ל-Linux
npm run build:linux
```

## טכנולוגיות

- **Electron** - מסגרת לפיתוח אפליקציות דסקטופ
- **React** - ספריית UI
- **TypeScript** - שפת פיתוח
- **Tesseract.js** - זיהוי תווים אופטי (OCR)
- **Google Translate API** - שירות תרגום

## מבנה הפרויקט

```
translation-plugin/
├── src/
│   ├── main/          # קוד ה-Electron (backend)
│   ├── preload/       # גשר בין main ל-renderer
│   └── renderer/      # ממשק המשתמש (React)
├── resources/         # משאבים (אייקונים וכו')
└── dist/             # קבצים בנויים
```

## תרומה

מוזמנים לתרום לפרויקט! אנא פתחו Issue או Pull Request.

## רישיון

MIT License

## יוצרים

פותח על ידי Hodaya Yfrach

</div>
