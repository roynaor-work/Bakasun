# ספריית תנועה לכדורגל v2

19 קליפים מקוריים ב־30 הרץ על שלד 18 העצמות הקנוני של [soccer-header-v1](../soccer-header-v1/README.md): שלוש עמידות רגועות, הליכה, ריצה קלה, ריצה, ספרינט, האצה והאטה בטווח 0.3–0.5 שניות, פניות 45/90/180 מעלות לשני הכיוונים, צעדי צד, ריצה לאחור וריצה עם כדור.

[תצוגת תלת־ממד](preview.html) · [דוח וטבלת תוצאות](REPORT.md) · [לוח QA](verification/qa/report.html) · [רישיונות](LICENSES.md)

הזרועות נעות נגד הרגליים, המרפקים כפופים, והטיית הגו עולה עם המהירות. כפות הרגליים נבנות ממגעי תמיכה קבועים בעולם. פניות כוללות נטייה פנימה ותזמון נגדי של האגן והחזה; קליפי ימין הם השתקפות אנטומית של קליפי שמאל. מסלול הכדור עצמאי ומכיל מגעי נעל מוצהרים.

## קבצים ומערכת צירים

| נתיב | תוכן |
|---|---|
| `runtime/clips/*.glb` | קליפ עצמאי עם הדמות, 18 ערוצי סיבוב וערוץ הזזת Hips; ללא דחיסה |
| `runtime/motions.json` | אותן פוזות מלאות: `clips[].frames[]` עם `time`, `hips`, `rotations` |
| `runtime/catalog.json` | זמנים, מהירות ייחוס, תמיכות, אירועים, מסלולי הדגמה, SHA-256 ונתיב כל GLB |
| `runtime/player.mjs` | דגימת פוזות וגשר C1 בין קליפים, כולל קטיעת גשר פעיל |
| `verification/sheets/*.png` | שמונה פריימים שונים לכל קליפ, מרונדרים מה־GLB האמיתי |
| `verification/requirements.json` | אימות קצב, שלד, שורש קבוע, מדדי QA, החלקת סוליות ו־ATHLETE_STANDARD |

מטרים ושניות; Y למעלה, Z קדימה, X לשמאל האנטומי. `hips` הוא מיקום מקומי מוחלט של Hips. לממשק `athletes-core.mjs` מחסרים ממנו את מיקום המנוחה `[0, .86, 0]`. סיבובים הם קווטרניונים `xyzw`, באינטרפולציית glTF LINEAR / slerp.

Root נשאר בראשית ובסיבוב זהות בכל פריים. `referenceTravel.samples` מכיל מיקום וכיוון חיצוניים של השחקן בתרחיש ייחוס; הם משמשים להדגמת כיוון הפנייה ולמדידת מגעים בעולם ואינם נאפים לתנועת השורש. יש להפעילם פעם אחת בלבד בקבוצת השחקן או בסימולציה. `ball.samples` נמצא במערכת המקומית של השחקן; הכדור אינו ילד של הרגל.

## מעבר בין קליפים

יש לבחור שלב יעד ולהפעיל את הגשר עם הפוזה ומהירותה המוצגות בפועל. שלב היעד מוקפא בזמן הגשר, וממשיך מאותו זמן כשהגשר מסתיים. הצרכן מנהל מיקום בעולם, כיוון, תמיכות ואירועים.

```js
import {makeClipBridge, sampleMotion, interruptBridge} from './runtime/player.mjs';
const transition = makeClipBridge({
  fromMotion: run,
  toMotion: strafeLeft,
  fromTime: currentPhase,
  toTime: 0,
  duration: .4,
});
const pose = transition.sample(elapsed);
// בסיום: sampleMotion(strafeLeft, transition.toTime + elapsedAfterBridge).
// לקטיעה רציפה: interruptBridge({active: transition, elapsed, toMotion: idle}).
```

הגשר משמר פוזה ומהירות בכניסה וביציאה במערכת המקומית של השחקן. מגבלת החלקת 2 הס״מ נמדדת בחלונות התמיכה המוצהרים של הקליפים, עם מסלול הייחוס. ערבוב שרירותי תוך תנועה בעולם דורש גם IK השומר עוגני תמיכה עד שחרורם; גשר פוזות C1 לבדו אינו נועל סוליה בעולם. הדוח מפריד בין המדידות האלה.

## שחזור וצפייה

Node 24 ומעלה ו־Git מספיקים לאפייה ולמדידה, ללא התקנת npm במאגר:

```sh
node workout/island/design/soccer-locomotion-v2/source/author.mjs
node workout/island/design/soccer-locomotion-v2/source/bake.mjs
node workout/island/design/soccer-locomotion-v2/measure.mjs
node workout/island/design/soccer-locomotion-v2/source/measure-transitions.mjs
node workout/island/design/soccer-locomotion-v2/source/capture.mjs
node workout/island/design/soccer-locomotion-v2/source/report.mjs
```

צילום דורש Playwright ו־Chromium מחוץ למאגר; `source/capture.mjs` מפעיל שרת מקומי זמני. הוא תומך ב־`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` ו־`SOCCER_LOCOMOTION_PREVIEW_URL` לפי סביבת הצילום. לצפייה ידנית הריצו משורש המאגר:

```sh
python3 -m http.server 8765
```

פתחו [תצוגה מקומית](http://localhost:8765/workout/island/design/soccer-locomotion-v2/preview.html), בחרו קליפ ובדקו את הפוזות בזמן אמת, בהאטה, ובמבט מלפנים ומהצד.

כלי `motion-qa-v1/run.mjs` אינו נמצא ב־main שעליו מבוססת החבילה. בדומה לחבילת הנגיחה, `measure.mjs` מחלץ אותו ואת תלויותיו ללא שינוי לקובץ זמני מתוך הקומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24`; אם חסר, Git מושך את הקומיט. Node hook מחליף רק את רשימת הספריות הסגורה במתאם לחבילה החדשה. הנוסחאות, הספים, המשקלים וקורא ה־GLB המקוריים נשארים ללא שינוי. המדידה ב־120 הרץ; הנכסים עצמם ב־30 הרץ.
