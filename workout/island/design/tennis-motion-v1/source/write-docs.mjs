// SPDX-License-Identifier: CC0-1.0
// Original documentation generator. Reports contain measured values only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const pack=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseSha='ae09529bc8fc9ff42f6aa76b8e79e7f760992f62';
const rigBlob='15bbadb76e2cb227238c492433bac40c22f735c9';
const packPath='workout/island/design/tennis-motion-v1';
const sourceBase=`https://github.com/roynaor-work/Bakasun/blob/codex%2Ftennis-motion-v1/${packPath}/`;
const read=async file=>JSON.parse(await fs.readFile(path.join(pack,file),'utf8'));
const optional=async file=>{try{return await read(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const catalog=await read('runtime/catalog.json');
const motions=await read('runtime/motions.json');
const metrics=await optional('verification/metrics.json');
const validator=await optional('verification/validator.json');
const transitions=await optional('verification/transitions.json');
const browser=await optional('verification/browser.json');
const files=await optional('verification/files.json');
const status=x=>x===null?'ממתין למדידה':x.pass?'עבר':'נכשל — ראו פירוט בקובץ המדידה';
const number=(v,d=3)=>Number.isFinite(v)?v.toFixed(d):'—';
const point=v=>Array.isArray(v)?`(${v.map(x=>number(x,3)).join(', ')})`:'—';
const sum=(values)=>values.reduce((n,v)=>n+v,0);
const max=(values)=>values.length?Math.max(...values):null;
const link=(file,label=file)=>`[${label}](${file})`;
const counts={};for(const clip of catalog.clips)counts[clip.category]=(counts[clip.category]||0)+1;
const labels={ready:'מוכנות וספליט סטפ',locomotion:'ריצה, צעדי צד, האטה וחזרה למרכז',groundstroke:'פורהנד ובקהנד — flat, topspin, slice',serve:'שלבי הגשה והגשות מלאות',special:'וולי, סמאש, drop shot ולוב',net:'וולי, סמאש, drop shot ולוב',reaction:'תגובות וחגיגות'};
const categoryTable=Object.entries(counts).map(([k,n])=>`| ${labels[k]||k} | ${n} |`).join('\n');
const metricMap=new Map((metrics?.clips||[]).map(m=>[m.id,m]));
const table=catalog.clips.map(c=>{
 const m=metricMap.get(c.id),events=m?.events||[];
 const contact=events.find(e=>e.name==='racket_contact'),release=events.find(e=>e.name==='ball_release'),ground=events.find(e=>e.name==='racket_ground_contact');
 const eventText=[contact?`מגע ${contact.frame} / ${number(contact.atSeconds)}`:null,release?`שחרור ${release.frame} / ${number(release.atSeconds)}`:null,ground?`מחבט–קרקע ${ground.frame} / ${number(ground.atSeconds)}`:null].filter(Boolean).join('<br>')||'לא חל';
 const world=[contact?`מגע ${point(contact.worldPointMeters)}`:null,release?`שחרור ${point(release.worldPointMeters)}`:null,ground?`קרקע ${point(ground.worldPointMeters)}`:null].filter(Boolean).join('<br>')||'—';
 return `| \`${c.id}\` — ${c.labelHe} | ${number(c.durationSeconds,2)} | ${m?.frames??motions.states[c.id]?.keyframes.length??'—'} | ${number(m?.maxPlantSlipMeters*100,4)} | ${eventText} | ${world} | ${number(contact?.racketHeadSpeedMps)} | ${number(contact?.slerpDerivativeSpeedMps)} | ${c.speedBandMps?.join('–')||'—'} | ${number(contact?.contactSwingPathMeters)} |`;
}).join('\n');
const allContacts=(metrics?.clips||[]).flatMap(c=>c.events||[]).filter(e=>Number.isFinite(e.racketHeadSpeedMps));
const totalBytes=sum(catalog.clips.map(c=>c.bytes||0));
const validatorErrors=sum((validator?.files||[]).map(f=>f.errors||0));
const validatorWarnings=sum((validator?.files||[]).map(f=>f.warnings||0));
const transitionTable=transitions?.cases?.map(c=>`| \`${c.source}\` → \`${c.target}\` | ${number(c.sourceTime)} | ${number(c.blendSeconds)} | ${number(Math.max(c.startPositionDiscontinuityMeters,c.endPositionDiscontinuityMeters)*100,4)} | ${number(Math.max(c.startRootVelocityChangeMps,c.endRootVelocityChangeMps),5)} | ${number(Math.max(c.startTransitionAddedJointVelocityMps??c.startMaxJointVelocityChangeMps,c.endTransitionAddedJointVelocityMps??c.endMaxJointVelocityChangeMps),4)} | ${number(c.maxCarriedPlantSlipMeters*100,4)} |`).join('\n');
const transitionDetails=transitions?`מצב: **${status(transitions)}**. נבדקו ${transitions.cases?.length??0} מסירות תנועה. הערכים נמדדו ב־FK עצמאי על פלט מתאם \`runtime/player.mjs\`, כולל כניסה משלוש פאזות ריצה ויציאה ממכה לריצה. השורש הבא מקבל היסט קבוע בסיום הערבוב; העוגן נישא עד המוקדם מבין שחרור הנטיעה המקורי ו־55% ממשך הערבוב, ואז משתחרר בהדרגה. IK מופעל אחרי ערבוב התנוחות.

| רצף | זמן יציאה מהמקור שנ׳ | ערבוב שנ׳ | אי־רציפות מיקום מרבית ס״מ | שינוי מהירות שורש מ׳/ש׳ | תוספת שינוי מהירות מפרק מ׳/ש׳ | החלקת עוגן נישא ס״מ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${transitionTable||'| אין מקרי מדידה בקובץ | — | — | — | — | — | — |'}

ספי המעבר נקראים מקובץ המדידה: מיקום ${number(transitions.thresholds?.jointPositionDiscontinuityMeters*100)} ס״מ; שינוי מהירות שורש ${number(transitions.thresholds?.rootVelocityChangeMps)} מ׳/ש׳; תוספת שינוי מהירות מפרק ${number(transitions.thresholds?.maxTransitionAddedJointVelocityMps??transitions.thresholds?.maxJointVelocityChangeMps)} מ׳/ש׳; החלקה ${number(transitions.thresholds?.carriedPlantSlipMeters*100)} ס״מ. תוספת המהירות מושווית למרווח הטבעי של אותו קליפ, כדי להפריד את תוספת המתאם מפינות המהירות שקיימות בדגימת 30Hz. הנתונים הגולמיים, כולל שינויי המהירות החד־צדדיים, נשמרים ב־${link('verification/transitions.json')}.
${transitions.failures?.length?`\nכשלים שנמדדו:\n\n${transitions.failures.map(s=>`- ${s}`).join('\n')}\n`:''}`:'בדיקת המעברים ממתינה. אין טענת PASS עד שיתקבל verification/transitions.json עם pass=true.';
const browserDetails=browser?`מצב: **${status(browser)}**. הדפדפן טען ${browser.clipCount??0} קליפים, עם WebAssembly מושבת בכוונה. מספר ניסיונות הגישה ל־WebAssembly: **${browser.wasmAttempts??'לא נמדד'}**. שגיאות דפדפן: **${browser.consoleErrors?.length??'לא נמדד'}**; בקשות שנכשלו: **${browser.failedRequests?.length??'לא נמדד'}**. בדיקת כל קליפ בוחרת אותו ב־preview, מבצעת seek ומאמתת מיקום סופי תקין של ראש המחבט ומסלול שאינו ריק.

צילומי ההוכחה: ${(browser.screenshots||[]).map(f=>link(`verification/${f}`,f)).join(' · ')||'אין קבצי צילום בקובץ התוצאה'}.
${browser.failures?.length?`\nכשלים שנמדדו:\n\n${browser.failures.map(s=>`- ${s}`).join('\n')}\n`:''}`:'בדיקת הדפדפן ממתינה. צילומים קיימים כשלעצמם אינם אישור שכל הקליפים נטענו; תוצאת הטעינה תופיע ב־verification/browser.json.';

const readme=`# טניס · ספריית תנועה v1

${catalog.clips.length} קליפים מקוריים לשחקן טניס בדיוני יחיד, על השלד הקנוני של motion2: ‏18 עצמות, מטרים ו־30Hz. כל GLB כולל דמות עם skin, מחבט, אנימציה ואירועי תצוגה. קובצי הריצה נמצאים ב־runtime/clips/ ונטענים ללא Draco, ללא meshopt וללא WebAssembly.

| משפחה | מספר קליפים |
| --- | ---: |
${categoryTable}

1. הפעילו שרת HTTP משורש המאגר ופתחו את ${link('preview.html','התצוגה המקדימה')} בנתיב שלמטה.
2. בחרו קליפ, לחצו על ניגון או על ״לרגע המגע״, ובדקו את מסלול מרכז המיתרים, את נקודת המגע ואת עוגני הרגליים. אפשר לסובב את המצלמה ולשנות את קצב הניגון.
3. בדקו את ${link('REPORT.md','דוח המדידות')} ואת התוצאות הממוכנות בתיקיית verification. טעינה מוצלחת, תוצאות pass=true והחלקת נטיעה עד 2 ס״מ הן קריטריוני הבדיקה.

\`\`\`sh
python3 -m http.server 8765
\`\`\`

\`\`\`text
http://localhost:8765/${packPath}/preview.html
\`\`\`

## שימוש בנתונים

${link('runtime/catalog.json')} הוא הקטלוג ללא פריימי האנימציה; ${link('runtime/motions.json')} כולל states עם כל הפריימים. כל פריים מכיל quaternion מקומי מוחלט xyzw לכל עצם, hipsOffsetMeters ומסלול שורש referenceRootTranslationMeters. זמן הפריים ב־JSON מנורמל ל־0..1; ב־GLB הוא בשניות, במרווחי 1/30 שנייה. צירים: ‎+Y למעלה, ‎+Z קדימה, ‎+X שמאל אנטומי.

rootMotion=true: תרגום השורש אפוי ומנוגן ב־GLB. אין להוסיף שוב את המסלול לשחקן. מתאם למשחק יכול להסיר את המסלול האפוי ולמסור את הדלתא לסימולציה במפורש. מעבר מומלץ נמצא ב־${link('runtime/player.mjs')}: פלט sample/fk/transitionFrame, המשך תנועה, היסט שורש, נשיאת עוגני נטיעה ו־IK לאחר ערבוב. המתאם אינו מחובר למשחק החי.

RightHand מחזיק את צומת Racket בטרנספורמציה יחסית קבועה וזהות, עם נקודת אחיזה [0,0,0]. ‏RacketHandle ו־RacketHead הם ילדיו; מרכז הראש הוא [0,0.50,0] מקומי למחבט, והאורך הכולל 0.685 מ׳. נקודת סוליה מקומית היא [0,-0.08,0] ביחס לעצם Foot. תיאור מלא נמצא ב־racket וב־equipmentContacts.

אירוע racket_contact מציין פריים, שניות, צומת RacketHead, נקודה מקומית [0,0,0] ומיקום עולם. ball_release יוצא מ־LeftHand בהטלה. אירועים מופיעים רק כשיש מגע או שחרור בפועל בקליפ; ריצה, עמידה, trophy ותגובות ללא מגע מכילים מערך events ריק עם contactApplicability מפורש. בנעיצת מחבט מופיע racket_ground_contact בפריים 30 עם נקודת קצה [0,0.685,0] מקומית ל־Racket וגובה עולם אפס. אלו סמני תצוגה, ללא הכרעה על ניקוד, בעלות או התנגשות פיזיקלית.

מכות הקרקע כוללות מסלול ארוך לכדור נמוך ומסלול קצר למגע מאוחר מאחורי כתף ההכאה, בפורהנד ובבקהנד ובשלוש צורות ספין. long/short מתארים הכנה ומסלול הנפה; המגע בכדור הוא אירוע רגעי. מסלול הכדור הוא המחשה חזותית לשילוב עתידי, ללא סימולציית כדור או גמישות מיתרים.

## שחזור ובדיקות

מחולל הנכסים משתמש ב־Node בלבד. גרסאות כלי האימות שנבדקו: gltf-validator@2.0.0-dev.3.10 ו־playwright@1.56.1, עם Chromium מקומי. glTF Validator ו־Playwright הם כלי בדיקה חיצוניים, ואינם מועתקים לחבילה. התקינו אותם בתיקיית כלי עבודה נפרדת והצביעו למודולים באמצעות GLTF_VALIDATOR_MODULE ו־PLAYWRIGHT_MODULE; דפדפן Chromium נבחר באמצעות CHROMIUM_EXECUTABLE כשנדרש.

\`\`\`sh
node ${packPath}/source/bake.mjs
node ${packPath}/verification/check.mjs
node ${packPath}/verification/check.mjs --transitions
node ${packPath}/verification/browser-check.mjs
node ${packPath}/source/write-docs.mjs
node ${packPath}/verification/check.mjs --files-only
\`\`\`

הריצו את מחולל התיעוד אחרי יצירת כל קובצי ההוכחה, ואז את בדיקת הקבצים אחרונה כדי שסכומי SHA-256 יתייחסו לתוכן הסופי. בדיקת הקבצים קוראת ומפענחת כל קובץ בחבילה; קובץ התוצאה העצמי verification/files.json מוחרג מהגיבוב העצמי.

הדף משתמש בעותקי Three.js ו־GLTFLoader הקיימים במאגר ב־../../vendor/ ברישיון MIT, ללא העתקתם לחבילה. הנכסים, קוד החבילה והתוצרים החדשים מקוריים ומוקדשים ל־CC0-1.0; פירוט מקור ורישיון לכל קובץ ב־${link('LICENSES.md')}.
`;

const report=`# דוח טניס · tennis-motion-v1

נבנו **${catalog.clips.length} קליפים ב־30Hz** על שלד motion2 בן 18 עצמות, עם מחבט מחובר לכף היד, אירועי מגע ושחרור, תנועת שורש אפויה ועוגני נטיעה. זו כוריאוגרפיה פרוצדורלית מקורית עם IK אנליטי, ללא motion capture וללא דמות המבוססת על אדם אמיתי. כל הקבצים החדשים בחבילה מוקדשים ל־CC0-1.0.

| בדיקה | תוצאה נמדדת |
| --- | --- |
| מדידות קליפים ונתונים | ${status(metrics)} — ${metrics?.clipCount??'אין מדידה'} קליפים |
| החלקת נטיעה מרבית | ${number(metrics?.maxPlantSlipMeters*100,4)} ס״מ; סף 2 ס״מ |
| מהירות ראש מחבט במגע, 30Hz | ${allContacts.length?`${number(Math.min(...allContacts.map(e=>e.racketHeadSpeedMps)))}–${number(Math.max(...allContacts.map(e=>e.racketHeadSpeedMps)))} מ׳/ש׳ ב־${allContacts.length} אירועי מגע`:'ממתין למדידה'} |
| glTF Validator | ${status(validator)} — ${validator?.files?.length??0} קובצי GLB, ${validatorErrors} שגיאות, ${validatorWarnings} אזהרות; גרסה ${validator?.validatorVersion??'לא נמדדה'} |
| ריצה → מכה → ריצה | ${status(transitions)} |
| טעינה בדפדפן ללא WASM | ${status(browser)} |
| GLB ללא Draco/meshopt | ${metrics?.pass?'אומת בכל קובצי runtime/clips/':'בדיקת הרחבות וערוצי GLB מופיעה ב־verification/metrics.json'} |
| משקל ${catalog.clips.length} קובצי GLB | ${totalBytes.toLocaleString('en-US')} בתים (${number(totalBytes/1048576,2)} MiB), כל קובץ עצמאי |

בסיס הענף: main ‏\`${baseSha}\`. חוזה השלד זהה ל־\`workout/island/design/motion2/hoops.json\` ב־git blob ‏\`${rigBlob}\`. ענפי codex/hoops-tall-v1 ו־codex/soccer-motion-v10 נבדקו כרפרנס לפורמט ולארגון; נכסיהם וקודיהם לא הועתקו לחבילה. קוד האפליקציה, release.json, release.mjs, תגי גרסה, CLAUDE.md, ops והבדיקות הקיימות לא נערכו.

## מה נמסר

| משפחה | מספר קליפים |
| --- | ---: |
${categoryTable}

מכות הקרקע כוללות פורהנד ובקהנד flat/topspin/slice, עם הנפה ארוכה לכדור נמוך והנפה קומפקטית למגע מאוחר מאחורי כתף ההכאה. בבקהנד flat ו־topspin היד השמאלית תומכת באחיזת המחבט ומסתובבת עם הידית. ההגשות כוללות הטלה, trophy, מגע ו־follow-through בנפרד, וכן הגשה ראשונה ושנייה מלאות. ״מגע ארוך/קצר״ מתואר באמצעות מסלול ההנפה וההכנה; אין מגע ממושך מלאכותי בין הכדור למיתרים.

המחבט מחובר ב־RightHand → Racket → RacketHandle/RacketHead. נקודת האחיזה [0,0,0] מקומית לכף היד; מרכז ראש המחבט [0,0.50,0] מקומי למחבט; ראש ומיתרים הם גאומטריה גלויה. כל GLB מכיל 18 joints ב־skin, סיבובים מקומיים מלאים ותרגומי Root/Hips. ה־root motion אפוי במטרים. אין להפעיל את המסלול פעמיים.

## שיטת המדידה

קצב הדגימה הוא 30Hz, כולל פריים התחלה ופריים סיום. ה־JSON וה־GLB מושווים מספרית לכל ערוץ ולכל זמן; נבדקים ערכים סופיים, נרמול quaternions, אורכי עצמות, מבנה השלד, קישור המחבט, פריימי האירוע ונקודות המגע. ה־FK של הבודק כתוב בנפרד ממחולל הכוריאוגרפיה.

החלקת נטיעה נמדדת במערכת העולם בנקודת הסוליה [0,-0.08,0] ביחס ל־Foot, כולל תרגום השורש וכל שרשרת העצמות. לכל חלון נטיעה נדגמים פריימים ותתי־פריימים ב־120Hz באמצעות shortest-arc SLERP, מול anchorWorldMeters קבוע. נמדדים הסטייה התלת־ממדית מהעוגן והגובה מעל/מתחת לרצפה; אין נטיעה מוצהרת בזמן התעופה. זו מדידת נקודת הסוליה הקנונית, ללא טענת סימולציית עיוות של נעל.

מהירות המגע היא מהירות **מרכז מיטת המיתרים בעולם**, מתוך FK של האנימציה: מרחק בין מיקומיו בפריים שלפני המגע ובפריים שאחריו, חלקי 2/30 שנייה. עמודת SLERP היא אבחון נוסף בהפרש מרכזי של ±1/3000 שנייה סביב המגע. גם מהירות 30Hz וגם נגזרת SLERP חייבות לעבור את טווח הקבלה. הדגימה הגסה עשויה להמעיט במהירות לעומת נגזרת הביניים; שתי התוצאות מפורסמות. זו מהירות מחבט, ללא הסקה של מהירות הכדור.

טווחי הקבלה נבחרו כספי סינון הנדסיים רחבים לכוריאוגרפיית משחק: קרקע 12–30, הגשה ראשונה/סמאש 22–40, הגשה שנייה 18–34, וולי 3–14, drop ‏3–10, לוב 7–20 מ׳/ש׳. אלו אינם נתוני motion capture, מחקר קליני, אישור ביומכני או אישור לאימון מקצועי. כל מכה חייבת להימצא בטווח שנרשם אצלה ב־speedBandMps.

## טבלת מדידות לכל קליפ

זמני האירועים בשניות, פריימים ממוספרים מ־0. מיקום העולם מוצג כ־(X,Y,Z) במטרים. אורך מסלול ההנפה נמדד ב־120Hz בחלון של ±0.30 שנייה מהמגע; לכל ששת זוגות הקרקע אורך short נדרש להיות קטן מ־long. לכל אירוע racket_contact הנקודה המקומית היא [0,0,0] בצומת RacketHead; ל־ball_release הנקודה המקומית היא [0,0,0] ב־LeftHand. בנעיצת המחבט מופיע מגע קרקע בקצה [0,0.685,0] של Racket. ״לא חל״ מציין שאין בקליפ מגע או שחרור; events ריק הוא תיאור מכוון ולא אירוע חסר. בהגשות מלאות מופיעים שני האירועים.

| קליפ | משך שנ׳ | פריימים | החלקה מרבית ס״מ | אירוע: פריים / שניות | מיקום עולם מ׳ | מהירות 30Hz מ׳/ש׳ | אבחון SLERP מ׳/ש׳ | טווח קבלה מ׳/ש׳ | אורך הנפה סביב מגע מ׳ |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |
${table}

התוצאות המלאות, חלונות הנטיעה ושגיאות ההתאמה שמורות ב־${link('verification/metrics.json')}; תוצאות Khronos glTF Validator לכל קובץ ב־${link('verification/validator.json')}.
${metrics?.failures?.length?`\nכשלים שנמדדו:\n\n${metrics.failures.map(s=>`- ${s}`).join('\n')}\n`:''}
## רציפות המעברים

${transitionDetails}

## בדיקת דפדפן וטעינת הקבצים

${browserDetails}

התצוגה משתמשת ב־GLTFLoader ללא DRACOLoader וללא MeshoptDecoder, תחת CSP שאין בו wasm-unsafe-eval. קובצי runtime/ נכתבו מלכתחילה ללא הרחבות דחיסה, ולכן אינם תלויים בעותק Draco חלופי. קו המסלול נדגם מראש המחבט של ה־GLB הטעון בפועל.

${files?`בדיקת קריאת הקבצים האחרונה: **${status(files)}**, ‏${files.fileCount??0} קבצים נבדקו. `:'בדיקת קריאת כל הקבצים נכתבת לאחר סיום התיעוד. '}הבדיקה \`check.mjs --files-only\` קוראת כל קובץ בחבילה ומפענחת GLB, JSON, PNG ו־UTF-8 לפי הסוג. ${link('verification/files.json')} כולל גדלים ו־SHA-256; הוא מוחרג מהגיבוב העצמי ונקרא ומפוענח מחדש לאחר הכתיבה. יש להריץ אותו אחרון לאחר כל שינוי בתיעוד או בצילומים.

## גבולות המסירה

זו ספריית נכסים ומתאם תנועה שניתן לבחון ב־preview.html; אין חיבור למשחק הטניס החי. מסלול הכדור הוא המחשה ואירועי המגע הם סמני תצוגה, ללא בדיקת התנגשות פיזיקלית, ספין או גמישות מיתרים. מודל השחקן מקורי ומסוגנן ונועד להמחיש את השלד; הוא אינו סריקה של אדם. בדיקות Chromium בתוכנה אינן מדידת ביצועי GPU או טלפון, ולא נבדקה תחושת משחק במכשיר של רועי. תוצאות הנעילה והמעברים מתייחסות לשלד הקנוני; retarget לשלד אחר דורש בדיקה חוזרת.

המקור, הרישיון ומחוללי התוצרים מפורטים לכל קובץ ב־${link('LICENSES.md')}; הוראות הרצה ושחזור ב־${link('README.md')}.
`;

await fs.writeFile(path.join(pack,'README.md'),readme);
await fs.writeFile(path.join(pack,'REPORT.md'),report);

async function walk(dir){const result=[];for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await walk(file));else if(entry.isFile())result.push(path.relative(pack,file).split(path.sep).join('/'));}return result;}
function sourceFor(file){
 const src=(f,label=f)=>`[${label}](${sourceBase+f})`;
 if(file.endsWith('.glb'))return `נכס מקורי: ${src('source/author.mjs','כוריאוגרפיה')}, ${src('source/glb.mjs','גאומטריה וכתיבת GLB')}, ${src('source/bake.mjs','מחולל')}`;
 if(file==='runtime/motions.json')return `תנועה מקורית אפויה: ${src('source/author.mjs')}, ${src('source/bake.mjs')}; חוזה שלד CC0 מקורי מהמאגר, ראו להלן`;
 if(file==='runtime/catalog.json')return `קטלוג מקורי: ${src('source/bake.mjs')}; נתונים מתוך ${src('source/author.mjs')}`;
 if(file.endsWith('.png'))return `צילום מקורי של התצוגה והנכסים המקוריים: ${src('verification/browser-check.mjs')}, ${src('preview.mjs')}`;
 if(file==='verification/browser.json')return `פלט מדידה מקורי: ${src('verification/browser-check.mjs')}`;
 if(file.startsWith('verification/')&&file.endsWith('.json'))return `פלט מדידה מקורי: ${src('verification/check.mjs')}`;
 if(file.endsWith('.md'))return `תיעוד מקורי: ${src('source/write-docs.mjs')}`;
 return `קוד מקורי שנכתב לחבילה: ${src(file)}`;
}
const listed=[...new Set([...(await walk(pack)),'LICENSES.md'])].sort();
const licenses=`# רישיונות ומקורות · tennis-motion-v1

כל ${listed.length} הקבצים החדשים המנויים בטבלה הם יצירה מקורית לחבילה זו או תוצר אפייה/מדידה/צילום של היצירה המקורית, ומוקדשים ל־**CC0-1.0**. אין נכסי מותגים, חיקוי של אדם אמיתי, motion capture מועתק, תמונות חיצוניות, מרקמים חיצוניים או קוד צד שלישי מועתק בחבילה.

היוצרים מוותרים על זכויות היוצרים והזכויות הנלוות ביצירות אלה ככל שהדין מאפשר, בהתאם ל־[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) ול־[הנוסח המשפטי המלא](https://creativecommons.org/publicdomain/zero/1.0/legalcode). מותר להעתיק, לשנות ולהפיץ את התוצרים, לרבות שימוש מסחרי, ללא דרישת ייחוס. אין אחריות על התוצרים. מזהה SPDX: \`CC0-1.0\`.

מקור השלד הקנוני: [motion2/hoops.json ב־main](https://github.com/roynaor-work/Bakasun/blob/${baseSha}/workout/island/design/motion2/hoops.json), git blob ‏\`${rigBlob}\`, בחבילת motion2 שמצהירה על נתוני תנועה מקוריים ברישיון CC0-1.0. החבילה שומרת את שמות העצמות, היררכייתן, הצירים ותרגומי המנוחה כחוזה תאימות. תנועות הטניס, הדמות והמחבט נוצרו מחדש במקור, ואין שימוש באנימציות מהקובץ ההוא. ענפי הכדורגל והכדורסל נקראו כרפרנס בלבד, ללא העתקת קבצים לתוצר.

ה־preview מייבא את Three.js ואת GLTFLoader הקיימים מחוץ לחבילה, ב־[../../vendor/three.module.js](../../vendor/three.module.js) וב־[../../vendor/GLTFLoader.js](../../vendor/GLTFLoader.js), ברישיון MIT של Three.js. קבצים אלה אינם כלולים בטבלה ואינם מועתקים לחבילה. Playwright ו־Khronos glTF Validator הם כלי בדיקה המותקנים בנפרד, ללא הפצת קוד הכלים בחבילה. פלטי המדידה בטבלה מקוריים.

כל שורה מציינת את מקורו של קובץ מסוים. קישורי המקור מפנים לענף המסירה \`codex/tennis-motion-v1\`; לקבצים שנוצרו אוטומטית נרשם גם המחולל המתאים. צילומים הם רנדר מקורי של הדמות, המחבט, המגרש והממשק שנוצרו בחבילה. התיעוד נוצר באמצעות source/write-docs.mjs; לאחר הוספת קבצים יש להריץ אותו שוב כדי לחדש את הטבלה.

| קובץ | מקור | רישיון |
| --- | --- | --- |
${listed.map(file=>`| [\`${file}\`](${file}) | ${sourceFor(file)} | CC0-1.0 |`).join('\n')}
`;
await fs.writeFile(path.join(pack,'LICENSES.md'),licenses);
console.log(`Wrote README.md, REPORT.md (${catalog.clips.length} measured clip rows), LICENSES.md (${listed.length} files).`);
