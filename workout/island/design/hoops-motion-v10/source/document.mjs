/** Original CC0-1.0. Derive review tables and per-file provenance from delivered QA. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const qa=await read('verification/measurements.json'),browser=await read('verification/browser.json'),catalog=await read('runtime/catalog.json');
if(!qa.summary.allPass||!browser.pass)throw Error('Cannot document a failed package as ready');
const cm=v=>(v*100).toFixed(3),m=v=>v.toFixed(3),rows=qa.measurements;
const by=(id,p)=>rows.find(r=>r.id===id&&r.profile===p);
async function inventory(dir){let result=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())result.push(...await inventory(p));else result.push(path.relative(root,p));}return result.sort();}
let report=`# דוח מסירה — תנועות כדורסל v10

נמסרו 18 מהלכים מקוריים × שלוש דמויות גבוהות = 54 ביצועים ב־30Hz, כל אחד כנתוני JSON וכ־GLB של אנימציה. בסיס הענף הוא main בקומיט e8145727d343adfa6bfa06f0c1a3287ab2ac6c1b. כל הקבצים חדשים תחת workout/island/design/hoops-motion-v10/ בלבד. הדמויות נכללות בחבילה; התצוגה משתמשת בספריות Three שכבר נמצאות ב־v8. לא חובר קוד משחק.

## תוצאה מדודה

| בדיקה | תוצאה | סף |
|---|---|---|
| החלקת סוליה מרבית בעולם, כולל בין פריימים | ${cm(qa.summary.maximumPlantedAnchorDistanceMeters)} ס״מ | עד 2 ס״מ |
| שגיאת מגע כף יד מול מעטפת הכדור בדגימות האפויות | ${cm(qa.summary.maximumHandBallSurfaceErrorMeters)} ס״מ | עד 2 ס״מ |
| קבצים שעברו glTF Validator | ${qa.summary.gltfFiles} | כל 54 האנימציות ו־3 הדמויות |
| שגיאות / אזהרות glTF | ${qa.summary.gltfErrors} / ${qa.summary.gltfWarnings} | 0 / 0 |
| סטיית ערוץ GLB מול JSON | ${qa.summary.maximumGLBValueError.toExponential(3)} | עד 0.00002 |
| טעינה וניגון בדפדפן | ${browser.assetLoads.animations} אנימציות, ${browser.assetLoads.keyframes} קובצי נתונים, ${browser.assetLoads.models} דמויות | הכול נטען |
| שגיאות HTTP / עמוד / בקשות | ${browser.httpErrors.length} / ${browser.pageErrors.length} / ${browser.requestErrors.length} | 0 |
| הוכחת חסימת WASM | WebAssembly.compile נחסם בפועל על ידי CSP | התצוגה והאנימציות ממשיכות לעבוד |

![שישה מהלכים על שלוש הדמויות](verification/contact-sheet.png)

## הטבעות מול טבעת 3.05 מטר

שתי עוצמות הניתור משתמשות באותה טבעת תקנית. המדידה מוגבלת לזמן שבו היד הפעילה נוגעת בכדור, לפני השחרור. בנוסף לסמן כף היד, נמדדה נקודת המשטח האמיתית בעלת משקל היד ב־mesh של כל דמות. עליית האגן נמדדת ביחס לאגן המנוחה של הפרופיל, ולא לתחתית הכריעה.

| קליפ | דמות | עליית אגן (מ׳) | כף יד (מ׳) | מעל הטבעת (ס״מ) | כף יד במשטח (מ׳) | מרחק אופקי מהטבעת (מ׳) |
|---|---|---:|---:|---:|---:|---:|
`;
for(const r of rows.filter(r=>r.dunk))report+=`| \`${r.id}\` | ${r.profile} | ${m(r.dunk.peakHipsLiftMeters)} | ${m(r.dunk.peakPalm.height)} | ${cm(r.dunk.clearanceMeters)} | ${m(r.dunk.physicalPalm.height)} | ${m(r.dunk.peakPalm.horizontalDistanceToRimMeters)} |\n`;
report+=`
הכדור עולה מול פתח הטבעת, נשאר בתוך המרווח האופקי, ומשתחרר למטה בזמן 1.20 שניות. אין הרמה של כל הדמות בתצוגה לצורך מעבר הבדיקה: הרמת האגן נמצאת בנתונים ובערוץ האנימציה שנמסרו.

## צעד וחצי אמיתי

בכל שלוש הדמויות האיסוף הוא בזמן 0.167 שניות; הנטיעות שאחריו בזמן 0.300 ו־0.600 שניות מתחלפות בין הרגליים. אחר כך ניתוק מהקרקע, הרמת הכדור ביד הסיום ושחרור ב־1.100 שניות. הגו נוטה קדימה בגישה. המהלך כולל גם מסלול עולם קדימה, ולכן הוא מובחן מזריקה בעמידה.

| קליפ | דמות | שתי הנטיעות אחרי האיסוף | זמן שחרור (ש׳) |
|---|---|---|---:|
`;
for(const r of rows.filter(r=>r.layup))report+=`| \`${r.id}\` | ${r.profile} | ${r.layup.stepsAfterGather.map(s=>`${s.foot} ${s.timeSeconds.toFixed(3)}`).join(' → ')} | ${r.layup.releaseTimeSeconds.toFixed(3)} |\n`;
report+=`
![רצף איסוף, שני צעדים, הרמה ושחרור](verification/layup-sequence.png)

## נטיעה, קצב צעדים ותנועה בעולם

כל ערך בטבלה הוא שגיאת העוגן המרבית בס״מ, בחישוב תלת־ממדי. החישוב כולל תנועת שורש וסיבוב עולם פעם אחת. קצב הצעדים נמדד מהתחלות מגע, ללא ספירת נחיתה בו־זמנית בשתי רגליים כשני צעדים עוקבים. בספרינט חלון הגישה הוא 0–0.8 שניות והיעד 3.75 צעדים לשנייה. בשאר הפעולות זה קצב המגעים לאורך המהלך, ולא יעד ריצה אחיד.

| קליפ | משך (ש׳) | רכז | קיצוני | סנטר | קצב מגעים מדוד (צעדים/ש׳) | מסלול שורש (מ׳) |
|---|---:|---:|---:|---:|---:|---:|
`;
for(const c of catalog.clips){const a=by(c.id,'guard');report+=`| \`${c.id}\` | ${c.durationSeconds.toFixed(2)} | ${cm(a.maximumPlantedAnchorDistanceMeters)} | ${cm(by(c.id,'wing').maximumPlantedAnchorDistanceMeters)} | ${cm(by(c.id,'center').maximumPlantedAnchorDistanceMeters)} | ${a.cadence.observedStepsPerSecond?.toFixed(3)??'—'} | ${m(a.rootDistanceMeters)} |\n`;}
report+=`
פניות 90° ו־180° מכילות שלב נטיעה ארוך בזמן הסיבוב. הציר המוגן מסובב את האגן סביב עוגן רגל שמאל. צעדי ההגנה נמוכים: גובה הנפת הסוליה עד 4 ס״מ, עם בסיס רחב וללא הצלבת רגליים. חסימת ההגנה מושיטה יד גבוהה מתוך בסיס נמוך. ב־stop_two_feet שתי הרגליים נוחתות יחד לאחר האיסוף, ונשארות נעולות בסיום.

## שלד, מגעים ושחרור

בכל פרופיל נשמרו 18 העצמות וההיררכיה הקנוניות, אורכי האיברים המקוריים, סיבובי קשירה בזהות וסקאלה 1. לא הונפשה סקאלה ולא הוחלפו אורכי מפרקים. האגן בלבד מקבל היסט מהמנוחה. נבדקו קווטרניונים מנורמלים, אורך כל מקטע, ונתוני GLB בפועל מול JSON. שגיאת אורך העצם המרבית היא ${Math.max(...rows.map(r=>r.maximumBoneLengthError)).toExponential(3)} מטר.

מגעי הרגליים כוללים מצב נטיעה ועוגן בעולם בכל דגימה. לכל יד שדה touching מפורש; מגע אמיתי נבדק מול רדיוס הכדור 0.12 מטר. אירועי hand_ball_contact ו־hand_ball_release מציינים שינויי מגע; ball_gather ו־ball_release מציינים איסוף ושחרור קליעה. זמן שחרור הוא null בקליפ ללא שחרור קליעה. לא נשאר מגע מדווח אחרי שחרור. כל האירועים הם לצורך המחשה; סמכות בעלות בכדור ותוצאת זריקה נשארת אצל המשחק.

השורש הקנוני Root נשאר בזהות. רק קבוצת Motion נעה ומסתובבת בעולם; JSON מכיל שדות translation ו־quaternion נפרדים ותיאור applyExactlyOnce. הגוף והכדור נמסרים במרחב המקומי של אותה קבוצה. ערוצי GLB משתמשים בזמן בשניות; JSON בזמן מנורמל. כל הדגימות כוללות נקודת סיום ב־30Hz ומשתמשות ב־LINEAR/SLERP ללא easing נוסף בזמן הניגון.

## טעינה, משטח ומדיניות תוכן

כל 57 קובצי GLB נמסרים ללא Draco וללא meshopt; אין צורך במפענח, worker או WebAssembly. המודלים זהים בבתים לעותקי runtime של hoops-tall-v1, קומיט cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa. 54 האנימציות מפנות לפרופורציות של הדמות המתאימה, והגאומטריה המשותפת נטענת פעם אחת לכל פרופיל.

בדיקת המשטח הפעילה את משקולות העור של המודלים בפועל בתשע פוזות לכל ביצוע. כל הקואורדינטות נשארו סופיות. יחס מתיחת הקצה באחוזון 99 המרבי היה ${Math.max(...rows.map(r=>r.surface.p99EdgeStretch)).toFixed(3)}, והקצה המרבי ${Math.max(...rows.map(r=>r.surface.maximumEdgeStretch)).toFixed(3)}; ספי זיהוי השחתה היו 3 ו־8. אלו ספי השחתה רחבים של ה־mesh, ולא מדידה של אנטומיה או הוכחה להעדר כל חדירה עצמית. בדיקות המפרקים עצמן מחמירות בנפרד לגבי אורכים, סקאלה וסיבובים.

בדיקת Chromium מפעילה בפועל את ה־GLB שנמסר על שלוש הדמויות בחמישה זמנים לכל קליפ וגם בניגון מתקדם. שולחן העבודה נבדק ב־1440×1000 והטלפון ב־390×844, ללא גלילה אופקית. החסימה של WASM נבדקה באמצעות ניסיון קומפילציה אמיתי תחת script-src 'self'. הרינדור משתמש ב־SwiftShader; אין כאן טענה לקצב פריימים על חומרת טלפון.

## שחזור וגבולות

הוראות ב־[source/README.md](source/README.md). source/verify.mjs קורא כל קובץ בחבילה, מפענח JSON ותמונות, בודק תחביר JavaScript, קורא ערוצי GLB ומריץ glTF Validator. המדידה העצמאית אינה מייבאת את המחולל. מגעי רגל נמדדים גם בין פריימים ב־120Hz רק כאשר שתי הדגימות השכנות מצהירות על אותו עוגן; מגעי יד נבדקים בדגימות האפויות ב־30Hz.

האימות מתייחס לקליפים שנמסרו. חיבור שרירותי בין קליפים דורש יישור שורש ושימור עוגן פעיל, ולעיתים IK אחרי ערבוב. זו חבילת נכסים, ללא שינוי מנוע המשחק או בדיקות המאגר הקיימות. רוב הקליפים חד־פעמיים; החזרה בתצוגה היא איפוס סקירה, לא לולאת תנועה רציפה. עמדת ההגנה בלבד מסומנת loop.

תוצאות מלאות: [measurements.json](verification/measurements.json), [gltf-validation.json](verification/gltf-validation.json), [browser.json](verification/browser.json). [LICENSES.md](LICENSES.md) מונה רישיון ומקור לכל קובץ.
`;
await fs.writeFile(path.join(root,'REPORT.md'),report);
// Enumerate all outputs, including this inventory itself, without circular self-hashes.
await fs.writeFile(path.join(root,'LICENSES.md'),'');
const paths=await inventory(root);
let licenses=`# רישיונות ומקורות — v10

כל הקבצים החדשים במסירה זו מוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). התנועות, קוד המקור, התצוגה, המדידות והתיעוד הם יצירה מקורית למסירה זו. הדמויות בדויות ואין מותגים, סמלי קבוצות או אנשים אמיתיים.

## מקור קפוא של הדמויות

שלושת המודלים ונתוני הקשירה מועתקים ללא שינוי מ־[hoops-tall-v1 בקומיט cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa](https://github.com/roynaor-work/Bakasun/tree/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1). הגיבובים של המודלים מופיעים ב־runtime/rig.json וב־verification/measurements.json. [רישיון המקור המלא](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/LICENSES.md).

אנטומיה, פנים, עור ועיניים: נכסי הליבה של MakeHuman/MPFB ב־CC0 לפי [המקור הרשמי](https://static.makehumancommunity.org/about/license.html). מקור הביניים במאגר: hoops-v7/characters/models/pg-lod1.glb, SHA-256 4f9ee0fc5b7d08836981483d279dc7025b417501486268797995478b8a9dd651. גזרת הגופייה מבוססת על authored-sewn-jersey המקורי של המאגר; הנעליים, השיער, המכנסיים והתאמות המידות והמשקולות הם היצירה המקורית של hoops-tall-v1 ונמסרו שם ב־CC0. לא נוספו נכסי ביגוד מסחריים.

השלד משתמש בשמות ובהיררכיה הקנוניים של motion2; הפרופורציות ממקור tall הקפוא. כל התנועות נכתבו כאן מחדש כמטרות ואילוצים ונפתרו ב־IK; לא הועתקו דגימות אנימציה מ־v8 או v9 ואין שימוש במוקאפ של אדם אמיתי.

## תלות בכלים קיימים

לא נוספו ספריות צד שלישי לתיקייה. preview.mjs מפנה לעותקי Three.js r160 ו־GLTFLoader שכבר ב־hoops-motion-v8/runtime/vendor, עם [רישיון MIT הקיים](../hoops-motion-v8/runtime/vendor/LICENSE.three). ספריות אלו אינן מוצגות כ־CC0 ואינן מועתקות או משנות רישיון. כלי glTF Transform, glTF Validator, Sharp ו־Playwright מותקנים ב־/tmp בלבד; קוד הכלים אינו חלק מהנכסים המופצים. אין נכסים חיצוניים נטענים מהרשת בזמן התצוגה.

## רישיון ומקור לכל קובץ

| קובץ | מקור | רישיון |
|---|---|---|
`;
for(const p of paths){let source='יצירה מקורית למסירה זו';
 if(p.startsWith('runtime/models/'))source=`[עותק runtime מקורי מ־tall](https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/runtime/${path.basename(p)}) — MakeHuman CC0 ותוספות tall מקוריות כמתואר לעיל`;
 else if(p==='runtime/rig.json')source='עותק rig.json מקומיט tall הקפוא; מידות ומפת שלד CC0';
 else if(p.startsWith('runtime/keyframes/'))source='מטרות תנועה מקוריות ופתרון IK נפרד למידות הפרופיל — source/author.mjs';
 else if(p.startsWith('runtime/clips/'))source='ייצוא נתוני התנועה המקוריים — source/export-glb.mjs; ללא גאומטריה או אנימציה חיצונית';
 else if(p.startsWith('verification/'))source=p.endsWith('.png')?'צילום מקורי של התצוגה והדמויות הבדויות — source/verify-browser.mjs':'מדידה מקורית של הקבצים שנמסרו — source/verify.mjs או source/verify-browser.mjs';
 else if(p==='runtime/catalog.json')source='קטלוג מקורי — source/author.mjs; נתוני פרופילים מ־tall CC0';
 licenses+=`| [${p}](${p}) | ${source} | CC0-1.0 |\n`;
}
await fs.writeFile(path.join(root,'LICENSES.md'),licenses);
console.log(`Documented ${paths.length} files; QA and browser both pass.`);
