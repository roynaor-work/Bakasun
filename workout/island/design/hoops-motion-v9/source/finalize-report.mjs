#!/usr/bin/env node
/** Summarize saved, independently measured evidence. Never invent a PASS. */
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CATALOG} from '../runtime/catalog.mjs';
import {measurementTable} from './measure.mjs';
const root=new URL('../',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const report=await read('verification/measurements.json'),browser=await read('verification/browser.json'),validation=await read('verification/gltf-validation.json'),seams=await read('verification/run-to-brake.json');
if(!seams.pass||report.passed!==CATALOG.length||!browser.pass||browser.allClipsLoaded!==CATALOG.length||validation.clips.some(c=>c.errors||c.warnings))throw Error('Evidence incomplete or failing; not ready for a final report');
const testsText=await readFile(new URL('verification/tests.txt',root),'utf8');
if(!/^(?:#|ℹ) fail 0$/m.test(testsText))throw Error('Saved node --test result is missing or failed');
const testCount=Number(testsText.match(/^(?:#|ℹ) tests (\d+)$/m)?.[1]);
const build=await read('verification/build.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [path,expected]of Object.entries(build.sourceSha256))if(sha(await readFile(new URL(path,root)))!==expected)throw Error('Source changed after asset build: '+path);
for(const c of CATALOG){const measured=report.clips.find(r=>r.id===c.id),shown=browser.clips.find(r=>r.id===c.id);const [g,j]=await Promise.all([readFile(new URL(c.glb,root)),readFile(new URL(c.json,root))]);if(measured?.glbSha256!==sha(g)||measured?.keyframeSha256!==sha(j)||shown?.sha256!==sha(g))throw Error('Stale asset measurement or screenshot evidence: '+c.id);}
const fmt=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d),max=k=>Math.max(...report.clips.map(c=>c[k]??-Infinity)),min=k=>Math.min(...report.clips.map(c=>c[k]??Infinity));
const groups=Object.fromEntries([...new Set(CATALOG.map(c=>c.group))].map(g=>[g,CATALOG.filter(c=>c.group===g).length]));
const lines=['# ספריית תנועה 3 לכדורסל — דוח קבלה v9','',
`הושלמו **${CATALOG.length} קליפים מקוריים**, כולם PASS במדידות ה־GLB המפוענח. ${groups.locomotion} תנועה חופשית וכדרור, ${groups.attack} התקפה, ${groups.actions} הגנה/ריבאונד/כדור חופשי/חגיגות. כל הקבצים חדשים תחת hoops-motion-v9 בלבד.`,
'',
'בסיס: main, commit d1af33d98b73b4763a399c260fcaa3621fc1792f. ענף codex/hoops-motion-v9. בתיקיית motion2 יש תשעה קליפים; ב־runtime של v8 יש 15. כל אלה נשארו לקריאה בלבד. אין שינוי בקוד משחק, release.json, release.mjs, תגי גרסה, CLAUDE.md, ops או בדיקות קיימות.',
'',
'![גיליון צילומים מה־GLB](contact-sheet.png)',
'',
'## תוצאות עיקריות','',
'| בדיקה | תוצאה נמדדת |','|---|---|',
`| טעינה ב־GLTFLoader עם מפענח Draco מקומי | ${browser.allClipsLoaded}/${CATALOG.length}, שגיאות דפדפן/WebGL: ${(browser.browserErrors||[]).length} |`,
`| בדיקת Khronos glTF validator | ${validation.clips.length} קבצים; 0 שגיאות ו־0 אזהרות |`,
`| גודל GLB | ${fmt(min('glbBytes')/1000,1)}–${fmt(max('glbBytes')/1000,1)} KB; תקרה 1,500 KB לקובץ |`,
`| רשת דגימה | 30Hz בדיוק בכל הערוצים; מדידה ב־120Hz וגבולות מגע |`,
`| החלקת נקודת סוליה בנטיעה | לכל היותר ${fmt(max('maxPlantedFootDriftMeters')*100)} ס״מ; תקרה 2 ס״מ |`,
`| שגיאת קצב מול מהירות | לכל היותר ${fmt(max('cadenceErrorPercent'))}%; תקרה 10% |`,
`| שגיאת כף יד לפני הכדור בזמן מגע | לכל היותר ${fmt(max('maxHoldSurfaceErrorMeters')*100)} ס״מ; תקרה 2 ס״מ |`,
`| גובה כף יד לעומת החזה בזמן נשיאה/איסוף | מקסימום ${fmt(max('carryHandChestMaxMeters')*100)} ס״מ; תקרה +15 ס״מ |`,
`| פרקי גוף | 18 עצמות מדויקות, אורך עצמות קבוע, ללא הפרות במעטפות האנטומיות המפורטות |`,
`| לולאות | כל ${CATALOG.filter(c=>c.loop).length} הלולאות נסגרות באותה פוזה בדיוק; חד־פעמיים שומרים פוזת סיום |`,
`| מקוריות | השוואת מסלולי גוף לכל 15 קליפי v8 ולתשעת קליפי motion2; אין כפילות מדודה |`,
'',
'## שיטת מדידה והיקף','',
'מדידות source/measure.mjs אינן מייבאות את מחוללי הביצוע. כל GLB נטען בפועל דרך GLTFLoader ו־Draco, ונמדד באמצעות AnimationMixer וטרנספורמציות העולם של העצמות. המדידה נפרדת מ־FK של JSON, ונבדקת גם התאמה ביניהם. נמדדות נקודת הסוליה [0,-.08,0] ומדריך כף היד [0,-.08,.025], ולא רק מיקום האגן או שורש כף היד.',
'',
'החלקה היא המרחק התלת־ממדי המרבי מעוגן תחילת כל חלון נטיעה שלם. מחברים לפוזה את referenceRootTranslationMeters, בהתאם לחוזה in-place של v8. המסלול הוא ייחוס מדידה תיאורי בלבד; המארח אחראי לתנועת העולם ול־IK אחרי ערבוב. חלונות התמיכה חייבים לכסות רגליים המגיעות לקרקע; קיטוע חלון במעבר לולאה אינו נחשב חלון קצר מלאכותי.',
'',
'זיהוי צעדים משתמש בהיסטרזיס גובה סוליה מה־GLB, ללא הסתמכות על שמות אירועים או על הצהרת מספר הצעדים. יעדי הקצב הוגדרו לפני חיבור התנועה: הליכה 1.35 מ׳/ש׳→1.8 צעדים/ש׳, ג׳וג 2.7→2.5, ריצה 4.6→3.0, ספרינט 6.8→3.6; כדרור הליכה 1.2→1.667; כדרור כיווני 1.05→1.667; החלקת הגנה .55→1.429. אורך הלולאה מעוגל למספר זוגי של פריימים כדי ששתי נטיעות חוזרות תיפולנה על רשת 30Hz. השגיאה נבדקת ביחס למהירות הייחוס שנמדדה.',
'',
'יד מול חזה נמדדת בשלבי carry/held/gather. העלאת יד מכוונת בזריקה, הטבעה וריבאונד נבדקת בנפרד כנגד המגע והיעד. בדיקות מגע אינן מסתפקות בסמן: הן בודקות את פני הכדור שנמדדו מול מדריך כף היד. זריקה מחייבת מגע רציף עם היד הראשית עד השחרור ו־follow-through אחריו.',
'',
'נטייה נבדקת כנגד תאוצה אופקית מסוננת בחלון 100ms, כאשר לפחות רגל אחת תומכת בקרקע והתאוצה מעל .4 מ׳/ש׳². נדרשת התאמה של לפחות 90% מהדגימות האלה. אין דרישת נטייה לכיוון תאוצה אופקית באוויר; מסלולי הגמר של ההתקפה נעים במהירות אופקית קבועה בזמן האוויר. בריצה נמדדות אמפליטודות סיבוב כתפיים/ירכיים ומתאם שלילי, ולא רק סיבוב גוף משותף.',
'',
'הבדיקות האנטומיות משתמשות בכיפוף גאומטרי של הברך והמרפק, ציר hinge חתום ובדיקת סיבוב מחוץ לציר, swing/twist בירך ובכתף, קרסול מול כיוון השוק, שורש כף היד ו־forearm pronation, וטווחים במפרקי עמוד השדרה והראש. מסגרת הזרוע מכוונת כך שכיפוף מרפק קדימה הוא סביב −X, לעומת +X בברך; הדבר אינו משנה את מבנה השלד או את מיקומי העצמות. מעטפות הגבול המלאות נשמרות ב־verification/measurements.json. פירוק סיבוב כתף נעשה סינגולרי ליד הושטת זרוע מלאה מעל הראש; מספר הדגימות האלה מתועד בנפרד ולא מוצג כאומדן מדויק של סיבוב צירי.',
'',
'לרשת 30Hz יש שגיאת מסלול סוליה בין מפתחות. המחולל כולל תיקון גובה נקודת סוליה של 1–16 מ״מ לפי הפעולה, בתוך רצועת המגע של 2 ס״מ; נמדדים שוב ההחלקה והגובה הממשיים לאחר SLERP. זהו תיקון דגימה מפורש, ללא שינוי סף הקבלה.',
'',
'## טבלת מדידות לכל קליפ','',
'מקף פירושו שהמדד אינו חל על הפעולה. עמודת Hip/shoulder מציגה אמפליטודות ומתאם. Crouch מציגה ירידת אגן לפני הקפיצה ואחרי הנחיתה. טבלת JSON המלאה כוללת זמני שיא והפרות, כיסוי מגעים, זוויות ציריות וגבולות לכל מפרק.',
'',measurementTable(report),'',
'## זריקות, יורו והטבעות מול יעד קבוע','',
'מיקום הטבעת נשמר ב־courtTarget לפני חישוב מסלול הכדור. התצוגה מציבה את הטבעת מהנתון הקבוע, ואינה מתאימה אותה לתוצאה. גובה הטבעת 3.05 מ׳, רדיוס .2286 מ׳ ורדיוס הכדור .12 מ׳. בדיקת הפגיעה מחייבת חצייה בירידה במרחק אופקי של עד .1086 מ׳ מהמרכז. בהטבעות נבדקת גם כף היד בעת השחרור בסביבת אותה טבעת.',
'',
'| קליפ | מרחק חציית כדור ממרכז הטבעת, ס״מ | כף יד בשחרור, מ׳ | צעדי יורו ארוך/קצר, מ׳ |','|---|---:|---:|---|',
...report.clips.filter(c=>c.rimCrossing).map(c=>`| ${c.id} | ${fmt(c.rimCrossing.rimOffsetMeters*100,3)} | ${fmt(c.dunkPalmAtReleaseMeters,3)} | ${c.euro?fmt(c.euro.longStepMeters,3)+' / '+fmt(c.euro.shortStepMeters,3):'—'} |`),
'',
'## מעבר מריצה לבלימה','',
'נמדד מעבר בפועל על סצנות GLB מפוענחות, ללא תנועת Root מובנית. בקשה בזמן אוויר ממתינה לנחיתת הרגל הבאה; הקליפ החדש מתחיל ברגל התואמת, עם ערבוב quintic C1 של עד 180ms, נעילת סוליה ו־IK, והתאמת קצב ההשמעה למהירות הכניסה. הספרינט משתמש בערבוב קצר יותר לפי זמן התמיכה. סטטוס ההמתנה ומסלול ייחוס רציף זמינים ב־controller.transition וב־referenceRootTranslationMeters.','',
'| מקור → בלימה | המתנה למגע ms | ערבוב ms | החלקה בזמן נעילה cm | שינוי מהירות אגן בכניסה m/s | אוויר חדש ms |',
'|---|---:|---:|---:|---:|---:|',
...seams.results.map(r=>`| ${r.source} → ${r.target} | ${fmt(r.waitForTouchdownSeconds*1000,1)} | ${fmt(r.blendSeconds*1000,1)} | ${fmt(r.maxLockedSoleDriftMeters*100,6)} | ${fmt(r.seamHipVelocityChangeMetersPerSecond,6)} | ${fmt(r.newAirborneSeconds*1000,1)} |`),'',
'נתונים ושיטת דגימה מלאה: [verification/run-to-brake.json](verification/run-to-brake.json).','',
'## בדיקות, תצוגה ומעברים','',
`כל ${testCount} בדיקות node --test עברו. פלט ההרצה נשמר ב־[verification/tests.txt](verification/tests.txt). בקרות שליליות משנות את ה־GLB המפוענח בפועל: החלקת אגן, כדור מחוץ ליד, רגלי ריצה קפואות, יד הפוכה, לולאה שבורה, סיבוב צירי אסור בברך עם פיצוי בכף הרגל, ומסלול קליעה שזז מהטבעת. בשתי האחרונות משנים גם את JSON כדי ששגיאת התאמה לבדה לא תוכל לחשוף את התקלה.`,
'',
'מפת 84 המצבים ומדיניות ההחזקה: [TRANSITIONS.md](TRANSITIONS.md), [runtime/transition-map.json](runtime/transition-map.json). רק epoch סמכותי חדש מהמארח משחרר נעילת כדרור. אירועי תצוגה אינם משנים החזקה, ניקוד או חוקי משחק.',
'',
'בדיקות דפדפן אמיתיות: [verification/browser.json](verification/browser.json), מסך [844×390](verification/preview-844x390.png) ומסך [390×844](verification/preview-390x844.png). גיליון [contact-sheet.png](contact-sheet.png) הוא 844×390; גיליונות לכל קליפ נמצאים ב־verification/sheets. סמני תצוגה נבדקו גם בהשמעה רציפה, חזרה של קליפ חד־פעמי וסגירת לולאה.',
'',
'## מקורות ומגבלות','',
'כל קליפ והמקור שלו מופיעים ב־[LICENSES.md](LICENSES.md). הדמות והכדור הם גאומטריה מקורית, ללא נכסי שיער/נעליים מרישוי לא מאומת. Three נשאר MIT ומפענח Draco נשאר Apache-2.0. אין נתוני אנשים אמיתיים.',
'',
'הספרייה היא ביצוע פרוצדורלי על השלד הקומפקטי הקבוע של הפרויקט, ולא צילום תנועה אנושי. גובה ההטבעה מחייב קפיצה חריגה ביחס לגובה השלד; גובה כף היד, עליית האגן וזמן האוויר נמסרים בפועל בנתוני המדידה. מדידות הטווחים הן מעטפות הנדסיות מפורשות, ולא אימות רפואי או הבטחה שכל ערבוב עתידי יישאר אנטומי. החיבור למשחק דורש שימור עוגנים, ערבוב ו־IK על פי המפה; לא נערך קוד משחק במשימה זו.',
'',
'פקודות שחזור: [source/README.md](source/README.md). SHA-256 של מקורות הבנייה והנכסים: [verification/build.json](verification/build.json), [verification/manifest.json](verification/manifest.json).',''];
await writeFile(new URL('REPORT.md',root),lines.join('\n'));
const files=[];
for(const c of CATALOG)for(const path of [c.glb,c.json]){const bytes=await readFile(new URL(path,root));files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(new URL('verification/manifest.json',root),JSON.stringify({baseCommit:'d1af33d98b73b4763a399c260fcaa3621fc1792f',branch:'codex/hoops-motion-v9',clips:CATALOG.length,files},null,2)+'\n');
await writeFile(new URL('SUMMARY.md',root),[
`83 קליפים מקוריים ב־30Hz ו־Draco על 18 העצמות הקנוניות, כולם מתחת ל־1.5MB.`,
`כל הקליפים עברו GLTFLoader, מדידות 120Hz, glTF validator ובדיקות node --test (${testCount} בדיקות).`,
`החלקת נטיעה מרבית ${fmt(max('maxPlantedFootDriftMeters')*100)} ס״מ; שגיאת קצב מרבית ${fmt(max('cadenceErrorPercent'))}%.`,
`preview.html, גיליונות 844×390, מפת מעברים, REPORT.md ו־LICENSES.md כלולים.`,
`נוספו קבצים ב־hoops-motion-v9 בלבד; קוד קיים, releases, ops ובדיקות קיימות לא נערכו.`
].join('\n')+'\n');
console.log(`REPORT.md written from ${report.passed} passing measurements, ${files.length} hashed assets`);
