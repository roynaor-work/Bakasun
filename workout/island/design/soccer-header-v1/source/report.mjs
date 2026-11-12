// SPDX-License-Identifier: CC0-1.0
// Generate the delivery report and explicit source/license inventory.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../',import.meta.url);
const json=async p=>JSON.parse(await fs.readFile(new URL(p,base),'utf8'));
const requirements=await json('verification/requirements.json'),catalog=await json('runtime/catalog.json');
const transitions=await json('verification/transitions.json'),browser=await json('verification/browser.json');
if(!requirements.passed||!transitions.summary.allPassed||!browser.passed)throw new Error('Delivery measurements must pass before reporting.');
const v10='57c536e1291803161e069eff97987295c6194466';
const originalMain='51f4faab';
const tree=`https://github.com/roynaor-work/Bakasun/tree/${v10}/workout/island/design/soccer-motion-v10`;
const sourceLink=p=>`${tree}/${p}`;
const hash=b=>createHash('sha256').update(b).digest('hex');
const provenance={schemaVersion:1,baseMain:originalMain,referenceCommit:v10,qaCommit:requirements.qaCommit,sources:[]};
for(const id of ['idle_relaxed','run']){
  const file=`runtime/reference/${id}.glb`,bytes=await fs.readFile(new URL(file,base));
  provenance.sources.push({file,license:'CC0-1.0',source:`workout/island/design/soccer-motion-v10/runtime/clips/${id}.glb`,commit:v10,url:sourceLink(`runtime/clips/${id}.glb`),sha256:hash(bytes),bytes:bytes.length,method:'Byte-identical final v10 runtime clip, including its fictional CC0 geometry. These are the final edited v10 clips, not the older v9 references in its runtime/reference directory.'});
}
for(const name of ['rig.mjs','glb.mjs']){
  const file=`source/${name}`,bytes=await fs.readFile(new URL(file,base));
  provenance.sources.push({file,license:'CC0-1.0',source:`workout/island/design/soccer-motion-v10/source/${name}`,commit:v10,url:sourceLink(`source/${name}`),sha256:hash(bytes),bytes:bytes.length,method:'Byte-identical CC0 canonical math/binary utility.'});
}
await fs.writeFile(new URL('verification/provenance.json',base),JSON.stringify(provenance,null,2)+'\n');
const cm=n=>(n*100).toFixed(3),f=n=>Number(n.toFixed(4));
const rows=requirements.checks.map(c=>{
  const meta=catalog.clips.find(m=>m.id===c.id),events=meta.events.map(e=>`${e.type} ${e.time.toFixed(3)}`).join('; ');
  return `| ${c.id} | ${c.score} | ${meta.duration.toFixed(2)} | ${c.coreDuration.toFixed(2)} | ${events} | ${c.contact.ballCenter[1].toFixed(3)} | ${cm(c.contact.shoulderMarginMeters)} | ${cm(Math.max(0,...c.landing.map(w=>w.maxDriftMeters)))} |`;
}).join('\n');
const maxSlide=Math.max(...requirements.checks.flatMap(c=>c.landing.map(w=>w.maxDriftMeters)));
const maxPalm=Math.max(...requirements.checks.flatMap(c=>(c.palms??[]).map(w=>w.maxDriftMeters)));
const idleContinuity=Math.max(...requirements.checks.map(c=>c.continuityToIdle.value));
const runContinuity=Math.max(...requirements.checks.map(c=>c.continuityToRun.value));
const files=await walk(base);
const clipBytes=catalog.clips.reduce((sum,c)=>sum+c.bytes,0);
const report=`# דוח מסירה · נגיחות כדורגל v1

נוספו שישה קליפי נגיחה מקוריים ומדידים. ציון מינימלי **${requirements.minimumScore}**, **${requirements.redMetrics} מדדים אדומים**, וכל המדדים הרלוונטיים ירוקים עם כיסוי 100%. נמדדו קובצי ה־GLB המיועדים לצריכה, ולא רק פוזות המקור.

[תצוגת תלת־ממד](preview.html) · [לוח המדידות](verification/qa/report.html) · [אימות כל הדרישות](verification/requirements.json) · [מקור ורישוי](LICENSES.md)

## הקליפים והמדדים

כל הזמנים בשניות. גובה כדור הוא גובה המרכז מעל Y=0 בזמן contact; פער כתפיים והחלקה בס״מ. בקליפים נטועים ללא land מוצגת החלקת נחיתה 0; מדד התמיכה הרשמי בודק גם את חלונותיהם המלאים.

| קליפ | ציון QA | משך | coreRange | אירועים | גובה כדור מ׳ | מעל כתפיים ס״מ | החלקה מרבית בנחיתה ס״מ |
|---|---:|---:|---:|---|---:|---:|---:|
${rows}

טווח הליבה בקפיצות הוא 0.333–1.133 שנ׳, ובצלילה 0.400–1.200 שנ׳: **0.800 שנ׳**. ההכנה וההתאוששות נשמרות מחוץ לליבה; הן כלולות במדידת הקליפ המלא. שלוש נגיחות הקפיצה נוחתות על שתי רגליים יחד ב־1.000 שנ׳. שתי כפות הידיים נושאות את נחיתת הצלילה ב־1.200 שנ׳; הרגליים תומכות בהמשך ההתאוששות.

החלקת נחיתה תלת־ממדית מרבית: **${cm(maxSlide)} ס״מ**, לעומת גבול 2 ס״מ. סטיית תמיכת כף יד מרבית בצלילה: **${cm(maxPalm)} ס״מ**. חלונות התמיכה נבדקו ב־120Hz, כולל זמנים מדויקים ואינטרפולציה בין פריימי ה־30Hz. שגיאת הרצפה לכל תמיכה נשמרת בנפרד ב־requirements.json.

כל ששת הקליפים מכילים את 18 העצמות, ההיררכיה ומידות המנוחה של design/motion/soccer.json. בכל דגימת מקור נשמרת פוזה מלאה; הקליפים הקצרים מכילים 49 פריימים והצלילה 97. Root נשאר [0,0,0] עם סיבוב זהות. Hips מכיל את התנועה החזותית המקומית. אין מסלול שורש ואין תוספת למיקום השחקן.

מגע המצח משתמש בנקודה מקומית ${JSON.stringify(catalog.clips[0].event.local.map(f))} ורדיוס כדור 0.11 מ׳. הנקודה מכוילת למשטח העור האמיתי מעל העיניים של המודל; שלושת קודקודי משולש העור קשורים ב־100% ל־Head. [ראיות הכיול](verification/contact-surface.json) כוללות משולש, משקלים, קואורדינטות בריצנטריות ו־SHA של המודל. נתיב כדור עצמאי נאפה כדגימות זמן ומכויל פעם אחת לאירוע; בזמן ניגון אין הצמדה לראש. במגע נבדקו גם מרכז הכדור וגם נקודת המצח מעל שתי הכתפיים. הצלילה נמוכה ביחס לשאר הנגיחות, עם מגע לפני המשך הגו למצב אופקי.

## מדידת motion-qa-v1

כלי ה־QA והחבילות v10/v12 נמצאים ב־PRs פתוחים ואינם ב־main שעליו מבוססת המסירה (${originalMain}). לכן פקודת השחזור היא:

\`\`\`sh
node workout/island/design/soccer-header-v1/measure.mjs
\`\`\`

הפקודה מחלצת ל־/tmp את run.mjs ואת תלותיו מקומיט QA **${requirements.qaCommit}** ([PR #371](https://github.com/roynaor-work/Bakasun/pull/371)), ומפעילה את ה־CLI המקורי:

\`\`\`text
node --import <soccer-header-v1/qa-register.mjs> <temporary>/workout/island/design/motion-qa-v1/run.mjs --library soccer-header-v1 --fps 120 --out <soccer-header-v1/verification/qa>
\`\`\`

הכלי המקורי מקבל רשימת ספריות סגורה. ה־hook מחליף רק את sources.mjs בטוען הקליפים החדשים; run.mjs, metrics.mjs, glb.mjs והספים נשארים זהים בתים למקור. SHA-256 וגודל כל קובץ QA נשמרים ב־verification/requirements.json. קובצי REPORT/LICENSE שהכלי כותב נשארים ב־/tmp. דוח JSON המדדים אינו משתנה; HTML מקורי עצמאי מציג אותו בתוך החבילה.

מדד bodySliding אינו חל על פעולות נייחות אלו, כפי שקובע הכלי המקורי. שבע שורות מוצגות: שש נגיחות ושורת idle_relaxed כייחוס לבחירת עמידה ב־CLI. סף המסירה מחושב על שש הנגיחות בלבד. מקור הפוזות, גובה הדמות ושיטת המדידה זהים בכל הקליפים. QA בודק מפרקי שלד ונקודות תמיכה מוצהרות; אינו בודק חדירת כל קודקודי הרשת. הציון הוא מדד הנדסי, אינו אישור תפיסתי או בדיקת המשחק.

## רציפות מול עמידה וריצה

פוזות הקצה תואמות לקליפ העמידה הסופי של v10. יחס הרציפות הרשמי מול העמידה הוא לכל היותר **${f(idleContinuity)}**, ירוק. השוואה ישירה לריצה היא **${f(runContinuity)}**, צהובה: פוזת ריצה אינה פוזת עמידה. לכן מסופק גשר C1 ממשי ב־runtime/player.mjs, ונתוני המעבר בקטלוג מפנים אליו, עם משכים 0.20 שנ׳ לעמידה ו־0.30 שנ׳ לריצה.

נבדקו **${transitions.summary.passed}/${transitions.summary.bridges} מעברים**, כניסה ויציאה לכל קליפ מול עמידה וריצה, בשלב 0 ובשלב פנימי. הדגימה ב־240Hz משתמשת בערוצי ה־GLB הסופיים ובנגזרות הריצה המחזורית, כולל מהירות שאינה אפס בתחילת המחזור. שגיאת סיבוב בקצה לכל היותר ${transitions.summary.maxEndpointRotationDegrees.toExponential(3)} מעלות; שגיאת מהירות זוויתית מרבית ${transitions.summary.maxEndpointVelocityRadiansPerSecond.toExponential(3)} רדיאן/שנ׳. [הראיות והספים](verification/transitions.json) כוללים SHA-256 של כל הקליפים והייחוסים.

הגשר ממתין בשלב היעד שנבחר, ואז ממשיך ממנו. הצרכן אחראי לשמירת עוגני רגליים בעולם ול־IK בזמן ערבוב, ולמהירות ותנועת השחקן. ההחלקה המוגבלת ל־2 ס״מ נבדקה על חלונות הנחיתה בקליפים. מעברי C1 נבדקו על הגשר המסופק, ולא על מערבל המשחק שטרם חובר.

## בדיקה חזותית ומסירה

Chromium טען את כל ששת קובצי ה־GLB דרך GLTFLoader מקומי, ניגון/עצירה, קפיצה לאירועים ותמונות צד במגע ובנחיתת הצלילה. נבדקו 1280×900 ו־390×844, ללא שגיאות דף, ללא גלישה אופקית בנייד, ועם WebAssembly חסום. לא התבקש decoder או קובץ WASM. [תוצאות הדפדפן](verification/browser.json), [מחשב](verification/preview-desktop.png), [נייד](verification/preview-mobile.png).

ששת קובצי הקליפים שוקלים ${clipBytes.toLocaleString('en-US')} בתים יחד. כל קובץ הוא GLB עצמאי עם הדמות הבדיונית הקיימת; נתוני הפוזות זמינים גם בנפרד ב־motions.json. אין Draco, Meshopt או נכסי רשת חדשים.

מקורות: [v10 @ ${v10.slice(0,12)}](${tree}) ([PR #361](https://github.com/roynaor-work/Bakasun/pull/361)); [motion-fix-v12](https://github.com/roynaor-work/Bakasun/pull/377) נבדק לצורכי מבנה בלבד ולא הועתקו ממנו נכסים. עותקי הייחוס הם runtime/clips הסופיים של v10; אינם עותקי ה־v9 הישנים שבתיקיית reference שלו. הגאומטריה והחומרים בדיוניים ו־CC0, ותועד מקורם ב־LICENSES.md וב־verification/provenance.json.

כל שינויי Git הם הוספות תחת workout/island/design/soccer-header-v1 בלבד. אין שינוי בקוד משחק, release.json, תגי גרסה, CLAUDE.md, ops או בדיקות קיימות. אין חיבור למשחק, מיזוג או פרסום. בדיקות האפליקציה הכלליות לא נדרשו לשינוי נכסים מבודד זה; כלי המדידה ובדיקת התצוגה הם האימות שבוצע.
`;
await fs.writeFile(new URL('REPORT.md',base),report);
async function walk(url){let result=[];for(const e of await fs.readdir(url,{withFileTypes:true})){const child=new URL(e.name+(e.isDirectory()?'/':''),url);if(e.isDirectory())result.push(...await walk(child));else result.push(child.pathname.slice(base.pathname.length));}return result.sort();}
const listing=[...new Set([...files,'LICENSES.md','REPORT.md','verification/provenance.json'])].sort();
function origin(p){
  const source=provenance.sources.find(s=>s.file===p);
  if(source)return `[${source.source} @ ${v10.slice(0,12)}](${source.url}); SHA-256 ${source.sha256}`;
  if(p.startsWith('runtime/clips/'))return 'תנועת נגיחה מקורית מ־source/author.mjs + source/bake.mjs; גאומטריה וחומרים מהייחוס idle_relaxed של v10 (CC0), כמפורט להלן';
  if(p==='runtime/motions.json'||p==='runtime/catalog.json')return 'פוזות ומטא־דאטה מקוריים למשימה, נאפו בכלי author/bake; פוזות הגבול מייחוס העמידה CC0 של v10';
  if(p.endsWith('.png'))return 'צילום מקורי ב־Chromium של תצוגת החבילה והדמות הבדיונית CC0; source/capture.mjs, ללא צילום אדם או נכס אינטרנט';
  if(p.startsWith('verification/qa/'))return `תוצר מדידה מקורי של קובצי החבילה, באמצעות QA @ ${requirements.qaCommit.slice(0,12)} (CC0); HTML מאת qa-report.mjs, SVG מאת sheets.mjs של QA`;
  if(p.startsWith('verification/'))return 'ראיות מקוריות ממדידת הנכסים והגשרים של החבילה; SHA-256 ומקורות בגוף הקובץ';
  return 'קוד, תיעוד או עיצוב מקוריים שנוצרו למשימה זו';
}
const license=`# רישיונות ומקור לכל קובץ

כל הקבצים החדשים בחבילה הם מקוריים או נגזרים ממקורות **CC0-1.0**. כל התרומות המקוריות מוקדשות לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode); במידה המותרת בחוק, מוותרים על זכויות היוצרים והזכויות הנלוות. אין מותגים, לוגואים, צילום אנשים אמיתיים, תנועות של ספורטאי מסוים או נתוני motion capture חיצוניים.

## מקורות מדויקים

נגיחות, מסלולי ההדגמה, תצוגה, גשרים ותיעוד נוצרו למשימה. שתי תלויות הנתונים והגאומטריה מגיעות מהקליפים הסופיים של [soccer-motion-v10 @ ${v10}](${tree}), לפי [LICENSES.md שלו](${sourceLink('LICENSES.md')}). מקור הגאומטריה הוא שחקן בדיוני מבוסס MakeHuman hm08 ונכסי מערכת CC0 מ־soccer-motion-v8; [רישיון ה־v8 הקיים](../soccer-motion-v8/LICENSE.md). אותו mesh/skin/materials מופיע בקליפים החדשים, עם תנועות חדשות וללא דחיסה. הייחוסים ושני כלי המתמטיקה/GLB הועתקו ללא שינוי; נתיב מדויק ו־SHA-256 נרשמים בכל שורה וב־[provenance.json](verification/provenance.json).

כלי QA נקרא בקומיט **${requirements.qaCommit}**, לפי [הרישיון שלו](https://github.com/roynaor-work/Bakasun/blob/${requirements.qaCommit}/workout/island/design/motion-qa-v1/LICENSES.md). קוד QA אינו מועתק לחבילה; הוא מחולץ זמנית מ־Git. נתוני המדדים ו־SVG הם תוצרים של הנכסים החדשים עם נוסחאות CC0. שינויים בכלי או בתלויות הקיימות לא נדרשו.

תלויות תוכנה **קיימות בלבד**, שאינן מתווספות לחבילה: [three.js r160 המקומי](../soccer-motion-v8/runtime/vendor/three.module.js) ו־[GLTFLoader](../soccer-motion-v8/runtime/vendor/GLTFLoader.js), ברישיון [MIT הקיים](../soccer-motion-v8/runtime/vendor/LICENSE.three), Copyright Three.js authors; [מקור upstream](https://github.com/mrdoob/three.js/tree/r160). התנאים שלהם נשארים בתוקף. Playwright ו־Chromium רצים מחוץ למאגר לצילום בלבד; אינם נכסי המסירה. אין ספריית צד שלישי חדשה, decoder, Draco, Meshopt או WASM.

## מלאי פרטני

| קובץ | רישיון | מקור / אופן יצירה |
|---|---|---|
${listing.map(p=>`| [${p}](${p}) | CC0-1.0 | ${origin(p)} |`).join('\n')}

שחזור המלאי והדוח: node workout/island/design/soccer-header-v1/source/report.mjs, לאחר הפקת המדידות. הקבצים בשורות runtime/reference ו־source/rig.mjs, source/glb.mjs מקורם ב־v10; שאר המקורות הם המקוריים המוצהרים בטבלה.
`;
await fs.writeFile(new URL('LICENSES.md',base),license);
console.log(`Reported ${catalog.clips.length} clips, ${listing.length} individually licensed files.`);
