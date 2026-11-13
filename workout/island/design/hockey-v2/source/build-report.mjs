// SPDX-License-Identifier: CC0-1.0
// Report from measured evidence; readiness cannot be asserted without final input hashes.
import {readFileSync, writeFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const v = read('evidence/validation.json');
const before = read('../hockey-v1-fix/evidence/after/codex-qa/report.json').libraries[0].clips;
const original = read('../hockey-v1/evidence/codex-qa/report.json').libraries[0].clips;
const after = read('evidence/qa/report.json').libraries[0].clips;
const legacy = read('evidence/legacy/report.json').libraries[0].clips;
const targeted = original.filter(c=>c.score<88).map(c=>c.id);
const n = x => Number(x.toFixed(6));
const rows = targeted.map(id=>`| \`${id}\` | ${before.find(c=>c.id===id).score} | ${legacy.find(c=>c.id===id).score} | ${after.find(c=>c.id===id).score} | ${Object.entries(after.find(c=>c.id===id).metrics).filter(([,m])=>m.status==='red').map(([k])=>k).join(', ')||'אין'} | [השוואה](sheets/comparison/${id}.png) |`).join('\n');
const preserved = v.preserved.map(c=>{
  const a=after.find(x=>x.id===c.id), b=original.find(x=>x.id===c.id);
  if(JSON.stringify(a.metrics)!==JSON.stringify(b.metrics)||a.score!==b.score)throw Error('Previously passing metrics changed: '+c.id);
  return `| \`${c.id}\` | ${b.score} | ${a.score} | זהים |`;
}).join('\n');
const maxPlane = Math.max(...v.states.map(s=>s.maxPlaneErrorMeters));
const maxTilt = Math.max(...v.states.map(s=>s.maxNormalTiltDegrees));
const redAll = after.reduce((count,c)=>count+Object.values(c.metrics).filter(m=>m.status==='red').length,0);
const status = v.ready?'היעד הושלם תחת מודל ההחלקה: 15 מתוך 15 בציון 88 ומעלה, ללא מדד אדום.':'היעד לא הושלם; יש לקרוא את הכשלים בראיות האימות.';
const report = `# הוקי v2 — בנייה מחדש ומודל מגע להב

תאריך: 13/11/2026. ענף: \`codex/hockey-fix-v2\`, מתוך \`codex/hockey-fix-v1\` ([PR #419](https://github.com/roynaor-work/Bakasun/pull/419), קומיט \`d45575a8ac7f3f054aa9ddf80ad4593d7b5e6cee\`).

**${status}** טווח 15 הקליפים המחודשים: ${Math.min(...v.targetedScores.map(c=>c.score))}–${Math.max(...v.targetedScores.map(c=>c.score))}. כלל 30 הקליפים: מינימום ${Math.min(...after.map(c=>c.score))}, ${redAll} מדדים אדומים. כיסוי המדדים החלים הוא 100%; מדדים שאינם חלים, כגון מגע בכדור בקליפ ללא כדור ומהירות גוף בפעולה נייחת, מסומנים בנפרד.

[תצוגה אינטראקטיבית](preview.html) · [גלריית לפני/אחרי](preview/gallery.png) · [דוח CLI מלא](evidence/qa/report.html) · [אימות עצמאי](evidence/validation.json) · [רישיונות](LICENSES.md) · [מניפסט](manifest.json).

## מה השתנה

כל 15 המצבים שנכשלו במקור נוצרו מחדש ממסלולי קרסול ולהב אנליטיים ב־120Hz, עם פריימים נוספים בדיוק בזמני מגע. לא נעשה שימוש בפריימים הכושלים כבסיס לתיקון. פתרון שתי עצמות בעולם מכוון ירך וברך ליעד הקרסול; סיבוב כף הרגל מחושב מול כל שרשרת Root/Hips/רגל, כך שמישור הסוליה וקצות הלהב נעולים לקרח לאורך חלון המגע, גם בין פריימים.

דחיפות כוללות הארכה והחזרה עם הרמת להב; חציות מעבירות רגל מורמת מעבר לרגל התומכת; פניות משנות כיוון גוף ומסלול יחד; בלימה מסובבת את הלהבים לרוחב ומאטה עד עצירה; תנועות השוער כוללות החלפת תמיכה; החגיגה היא פירואט סביב להב שמאל ורגל ימין מורמת. משך ומהירות 14 ההחלקות נשמרו; אורכי המסלולים נשארו לפחות 90% מהמקור (בפועל תואמים למסלולים המתוכננים). החגיגה, כמו התיקון שעבר ב־v1-fix, היא סיבוב מקומי ולא מסלול גלישה מעגלי.

מודל QA חדש מפורש מופעל רק כשמצב מצהיר \`skating.contactModel='blade'\`. \`footSliding\` מודד את המרבי מבין שגיאת גובה קצות הלהב, שגיאת נורמל מישור הסוליה, הצטברות סטייה צדית לא מתוכננת וסחיפת ציר בפירואט. גלישה אורכית מותרת. חלון בלימה מחייב עקומת מהירות מגע מתוכננת מלאה, שמולה נמדד הרכיב הצדדי. \`bodySliding\` משווה וקטור מהירות שורש בפועל למסלול הייחוס הנפרד בכל דגימה. רציפות הפנייה נמדדת במערכת כיוון הגוף, ושומרת את תנוחת הגפיים וגובה הגוף. משקלות וספי הצבע נשארו זהים למקור. [פירוט הכלי והבדיקות](../motion-qa-v1/README.md).

## תוצאות 15 הקליפים

עמודת ״v2 במדד המקורי״ משתמשת באותן תנועות חדשות ובנוסחאות הסוליה הנטועה המקוריות. היא נשמרת כדי להראות במפורש שהעמידה ביעד דורשת מודל החלקה. הציונים החדשים אינם בני השוואה ישירה לציון הישן כאילו נוסחת המדידה לא השתנתה.

| קליפ | v1-fix במדד המקורי | v2 במדד המקורי | v2 במודל להב | מדדים אדומים במודל להב | 8 רגעים לפני ואחרי |
|---|---:|---:|---:|---|---|
${rows}

## אימות

- דגימה עצמאית של 15 המחודשים ב־240Hz: שגיאת מישור להב מרבית ${n(maxPlane*1000)} מ״מ, נטיית נורמל מרבית ${n(maxTilt)} מעלות. נבדקו גם אורכי חלונות מגע, מגע שהושמט, כיסוי המסלול, תקינות קווטרניונים ואורכי המסלולים.
- כל 14 ההחלקות עוברות ATHLETE_STANDARD; מרפקים נבדקו בכל דגימת 240Hz בתחום 40–100°, בנוסף למדידת התקן המקורית ב־120 דגימות לאורך כל קליפ. [הנתונים](evidence/validation.json).
- כל קודקודי גוף ומקל משוקללים מתוך GLB ב־60Hz, לכל 30 הקליפים: אפס חדירות מעבר לסבילות 5 מ״מ. [ראיות](evidence/mesh-contact.json).
- 45 גיליונות PNG (לפני, אחרי והשוואה) ל־15 הקליפים, שמונה רגעים בכל גרסה ושני מבטים בגיליונות נפרדים; אפס שגיאות דפדפן. חתימות הקלט לפני ואחרי הרנדר תואמות לקובץ שנמדד. [ראיות הדפדפן](preview/browser-evidence.json).
- בדיקות הבודק כוללות מקרים פגומים במכוון: להב מורם או מוטה, סחיפה צדית, חלונות מגע חסרים/קצרים, סטיית מהירות/כיוון, רפרנס חסר/אפס, בלימה ללא רפרנס או עם רפרנס שגוי, סחיפת ציר ופער תנוחה בכניסה. בדיקת נסיגה משווה את כל 30 מצבי המקור לנוסחאות המקור ולמדדים שפורסמו. [תוצאות](evidence/qa-tests.log).
- 15 בדיקות QA ו־11 בדיקות השלד המשותף עברו. ב־\`npm test\`: 3,596 עברו, 63 דולגו וכשל סביבתי אחד — קובץ Chromium של Playwright חסר בבדיקת אנימציות האימון, וכשל ההפעלה השאיר שרת פתוח. לאחר אבחון ועצירת העובד התקוע, כל חמש בדיקות הקובץ עברו בהרצה נפרדת עם \`/usr/bin/chromium\`, ללא שינוי בבדיקות המאגר. [מצב הבדיקות ופקודות](evidence/test-status.json) · [לוג המאגר](evidence/repository-tests.log) · [הרצת הדפדפן החוזרת](evidence/workout-browser-tests.log).

## 15 המצבים שכבר עברו

נתוני המצבים, ציוניהם וכל אובייקטי המדדים זהים למקור. הם אינם מפעילים את מודל הלהב החדש.

| קליפ | לפני | אחרי | נתוני מצב וכל המדדים |
|---|---:|---:|---|
${preserved}

## גבולות התוצאה

זהו ציון QA קינמטי שניתן לשחזר, ולא ציון תפיסה אנושי. מסלול הייחוס ועקומות הבלימה נגזרים מתכנון המחבר, ולא ממדידת מעבדה פיזיקלית; בדיקות המוטציה משנות את התנועה בפועל ומשאירות את הרפרנס קבוע. בדיקת הרשת בוחנת חדירה למישור הקרח בלבד. לא נבדקו התנגשויות מלאות בין איברים או הרצה בתוך משחק ההוקי. הבדיקה החזותית בוצעה בגיליונות ההשוואה ובדפדפן, ללא בדיקת טלפון.

גם לאחר הבנייה מחדש, המדד המקורי נותן פחות מ־88 ל־${targeted.filter(id=>legacy.find(c=>c.id===id).score<88).length} קליפי ההחלקה: הוא עדיין דורש רגל נטועה. זה מתועד ב־[דוח המקור על אותם קליפים](evidence/legacy/report.json). ההשלמה כאן היא לפי מודל הלהב שהתבקש, עם ספים ומשקלות מקוריים. אין שינוי בקוד משחק, בגרסה או בפרסום האתר.

## שחזור

נדרשים Node; להפקת גיליונות נדרשים Playwright ו־Chromium. משורש המאגר:

\`\`\`sh
node workout/island/design/hockey-v2/source/build-clips.mjs
node --test workout/island/design/motion-qa-v1/skating.test.mjs
node workout/island/design/motion-qa-v1/run.mjs --library hockey-v2 --out workout/island/design/hockey-v2/evidence/qa
node workout/island/design/motion-qa-v1/run.mjs --library hockey-v2 --legacy --out workout/island/design/hockey-v2/evidence/legacy
node workout/island/design/hockey-v2/source/mesh-contact-audit.mjs
node workout/island/design/hockey-v2/source/render-sheets.mjs
node workout/island/design/hockey-v2/source/validate.mjs
node workout/island/design/hockey-v2/source/build-report.mjs
node workout/island/design/hockey-v2/source/build-manifest.mjs
\`\`\`

SHA-256 של הקליפים שנמדדו ורונדרו: \`${v.clipsSha256}\`.
`;
writeFileSync(new URL('REPORT-fix.md',root),report);
console.log(JSON.stringify({ready:v.ready,targeted:targeted.length,minTargetScore:Math.min(...v.targetedScores.map(c=>c.score)),redAll}));
