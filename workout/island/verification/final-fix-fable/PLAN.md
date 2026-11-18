# תיקון סופי ומעמיק (Fable), 11/11/2026

ענף `claude/final-fix-fable` מ-`main` אחרי v20 (קומיט ea92c3a1). לא נוגעים ב-`release.json`, בתגי `?v=` ובגרסה. כל תיקון מאחורי דגל כיבוי. השמירה לא משתנה.

## למה רועי לא ראה את התיקונים של v20
הבדיקות של v20 הוכיחו את התיקון בדרך שלא דומה לטלפון: הזרקה ישירה למודל (`mm.update(dt,{firing:true})`), סימולציה בלי דפדפן, או פתיחת המשחק בנתיב אחר מזה של האי. בסבב הזה כל תלונה משוחזרת דרך האי האמיתי (`index.html?dev=1` → `games.start(id)`), במגע אמיתי (Chromium, `hasTouch`, `isMobile`, 844x390, אירועי `Input.dispatchTouchEvent` על הפקדים שעל המסך), לפני התיקון ואחריו.

## חלוקה
| משחק | מזהה באי | קבצים | סוכן תיקון | סוכן QA עצמאי |
|---|---|---|---|---|
| חזירים | `boarDefense` (iframe `minigames/boar-island/index.html`) | `boar-island/game.js`, `style.css` | A1 | Q1 |
| חלליות | `alienDefense` | `alien-flight-input*.mjs`, `alien-flight-model.mjs`, `alien-v14.mjs`, `alien-session.mjs` | A2 | Q2 |
| כיבוי אש | `fireRescue` | `fire-*.mjs`, `g2n-audio.mjs` | A3 | Q3 |
| ספינות | `navalDuel` | `naval-controls.mjs`, `naval-aim-flag.mjs`, `naval-air*.mjs`, `naval-hud.mjs` | A4 | Q4 |
| טניס | `tennis` | `tennis.mjs`, `tennis-session.mjs`, `tennis-ui.mjs`, `tennis-controls.mjs` | A5 | Q5 |

## קריטריון סיום לכל תלונה
1. בדיקת קבלה אוטומטית בדפדפן עם מגע ב-`workout/island/tests/final-<game>-browser.mjs`, שנכשלת על הקוד של v20 (עם דגל הכיבוי) ועוברת אחרי התיקון.
2. הוכחה: יומן מספרי, צילום מסך או מדידה בתיקייה הזאת.
3. שורה בטבלה ב-`REPORT.md`: הערה (ציטוט), הוכחה, תוצאה (עבר / לא עבר).
4. `npm test` ירוק.
5. דיווח לסשן הריכוז עם PR והוראות בדיקה לטלפון.
