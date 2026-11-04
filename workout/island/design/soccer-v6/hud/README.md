# על הקו · ממשק שידור כדורגל 06

חבילת HUD עצמאית לשש מול שש: לוח תוצאות ושעון, כרטיס החלפה, אפקט שער, ממשק חזרה מהירה, רדאר של 12 שחקנים, מד ספרינט וארבעה כפתורי פעולה עגולים. שתי ערכות צבע לקבוצות דמיוניות, עם הפרדה בין אזור הפעולות מימין לג׳ויסטיק משמאל.

כל הקבצים במסירה חדשים ובתיקייה זו בלבד. דף התצוגה עובד בלי build, בלי שירותים חיצוניים ובלי תלות בקוד המשחק. אין מותגים, סמלי מועדונים, שחקנים אמיתיים או נתונים אישיים.

## צפייה

1. הפעילו משורש המאגר שרת שמגיש את התיקייה הזו בלבד:

   ```sh
   python3 -m http.server 8765 --bind 127.0.0.1 --directory workout/island/design/soccer-v6/hud
   ```

   הפקודה מיועדת להרצה משורש המאגר, ומגישה רק את חבילת ה־HUD.

2. פתחו את [דף התצוגה](http://localhost:8765/preview.html) במידות 390×844 ו־844×390. כפתור **תצוגות** בתחתית פותח בחירת מצב, ערכת צבע והקפאת שעון. [אוסף הרכיבים](http://localhost:8765/assets.html) מאפשר צפייה והורדת SVG נפרדים.
3. גררו את הג׳ויסטיק, לחצו מסירה/עומק/בעיטה, והחזיקו ספרינט. אפשר לגרור ולהחזיק ספרינט בשתי אצבעות. בדקו שהאנרגיה יורדת ומתאוששת, שכרטיס ההחלפה נסגר, ושאפשר לדלג מחזרה מהירה למשחק. במקלדת: חיצים כשהג׳ויסטיק ממוקד; Enter בכפתור הספרינט מפעיל/מפסיק אותו.

מצבים ישירים: [החלפה](http://localhost:8765/preview.html?state=substitution&freeze=1), [שער](http://localhost:8765/preview.html?state=goal&freeze=1), [חזרה מהירה](http://localhost:8765/preview.html?state=replay&freeze=1), [ערכת אופק/חול](http://localhost:8765/preview.html?theme=dusk&freeze=1). פרמטר `freeze=1` מקפיא את שעון התצוגה; בחזרה מהירה הוא מציג פריים קבוע של סרגל ההתקדמות.

## נכסים

| קובץ | שימוש |
| --- | --- |
| [scoreboard.svg](assets/scoreboard.svg) | לוח תוצאות ושעון שידור |
| [substitution.svg](assets/substitution.svg) | כרטיס נכנס/יוצא עם חולצה ומספר, בלי דיוקן |
| [quick-replay.svg](assets/quick-replay.svg) | תג REPLAY, התקדמות וחזרה למשחק |
| [goal.svg](assets/goal.svg) | הכרזת שער, כובש ותוצאה |
| [radar.svg](assets/radar.svg) | שישה סמנים לכל קבוצה, כדור ושחקן נבחר |
| [sprint-meter.svg](assets/sprint-meter.svg) | מד אנרגיה בעל ארבעה מקטעים |
| [action-buttons.svg](assets/action-buttons.svg) | בעיטה, עומק, מסירה וספרינט |
| [hud-symbols.svg](assets/hud-symbols.svg) | ספרייט אייקונים משותף; צבע באמצעות `currentColor` |
| [palettes.json](palettes.json) | שתי ערכות צבע ותוויות קבוצות דמיוניות |
| [pitch-backdrop.webp](assets/pitch-backdrop.webp) | רקע מגרש קבוע לתצוגה, 1024×1024 |

כל SVG וכל WebP קטנים מ־100,000 בתים. קובצי SVG נפרדים הם ייצוא חזותי של הרכיבים; `hud.js` בונה את הגרסה החיה עם טקסט ונתונים מתעדכנים. להחלפת צבע ב־SVG שמוטמע inline משתמשים ב־`--home`, `--away`, `--home-ink`; בטעינת SVG כתמונה חיצונית נשמרת פלטת ברירת המחדל. אין פונטים להורדה. ערכות הצבע משנות את רכיבי הממשק; רקע המגרש האפוי שומר על צבעי המקור.

## ממשק לשילוב עתידי

`hud.js` מייצא `SoccerHUD` ו־`themes`. הדף הקיים לא חובר לחבילה. במעטפת DOM נפרדת מעל קנבס המשחק ניתן להשתמש כך:

```js
import {SoccerHUD} from './hud.js';
const hud = new SoccerHUD(mountElement, {theme: 'coast'});
hud.setScore(2, 1);
hud.setClock(2788, 'מחצית 2');
hud.setStamina(82);
hud.setPlayer({number: 9, name: 'שחקן 09', position: 'קשר התקפי'});
mountElement.addEventListener('soccer-hud:action', ({detail}) => {
  // Host adapter consumes {action, phase, x?, y?, paused?}.
});
```

שיטות נוספות: `updateRadar({home, away, ball, active})`, `showSubstitution(...)`, `showGoal(...)`, `showReplay(...)`, `setTheme('dusk')`, `setPaused(...)`, `destroy()`. מיקומי רדאר מנורמלים לטווח 0–1; `active` הוא אינדקס 0–11. נשמרים שישה מקומות נפרדים לכל קבוצה. החלפה נסגרת אוטומטית אחרי 5.5 שניות כברירת מחדל; `duration: 0` משאיר אותה לסקירה. חזרה מהירה מסתיימת אחרי ארבע שניות וכוללת דילוג. משחקיות, הכרעה על שער וקטעי צילום חוזר מסופקים בידי המשחק.

האירוע `soccer-hud:action` מספק `shoot/pass/through` בהפעלה, `sprint` עם `start/end`, `move` עם ציר x/y מנורמל, וגם pause/continue/replay/replay-end. אין כתיבה לאחסון או לרשת. שינוי מצב, השהיה, ביטול מגע, אובדן מיקוד והסתרת הדף משחררים שליטה. `destroy()` מבטל מאזינים, טיימרים ואנימציית חזרה.

הפריסה מתחשבת ב־safe-area ובכיוון המסך. כפתורי המגע הם 44px ומעלה. במצבי שער וחזרה מהירה פקדי המשחק מוסתרים והופכים `inert`. תנועה מופחתת מכובדת, וקיימים שמות נגישים והכרזות לאירועים. שכבת ה־HUD מבוססת DOM/SVG, ולכן אינה מוסיפה משולשים או draw calls ל־Three.js r160 המקומי.

## מסירה ואימות

[REPORT.md](REPORT.md) מרכז גדלים, תקציב משולשים, תוצאות הבדיקה וגבולות המדידה. [asset-manifest.json](asset-manifest.json) מכיל מידות, בתים ו־SHA-256. [מקורות ורישוי](LICENSES.md).

| מצב | לאורך · 390×844 | לרוחב · 844×390 |
| --- | --- | --- |
| שידור חי | [צילום מלא](previews/live-390x844.webp) | [צילום מלא](previews/live-844x390.webp) |
| החלפה | [צילום מלא](previews/substitution-390x844.webp) | [צילום מלא](previews/substitution-844x390.webp) |
| שער | [צילום מלא](previews/goal-390x844.webp) | [צילום מלא](previews/goal-844x390.webp) |
| חזרה מהירה | [צילום מלא](previews/replay-390x844.webp) | [צילום מלא](previews/replay-844x390.webp) |
| ערכת אופק/חול | [צילום מלא](previews/dusk-390x844.webp) | [צילום מלא](previews/dusk-844x390.webp) |
