// SPDX-License-Identifier: CC0-1.0
// Generate delivery documentation and a complete, content-addressed CC0 inventory.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(base,'../../../..');
const read=async file=>JSON.parse(await fs.readFile(path.join(base,file),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalog=await read('runtime/catalog.json'),requirements=await read('verification/requirements.json');
const transitions=await read('verification/transitions.json'),sheets=await read('sheets/manifest.json'),browser=await read('verification/browser.json');
const tests=await read('verification/repository-tests.json');
if(!requirements.passed||!transitions.summary.allPassed||!browser.passed)throw new Error('Delivery gates have not passed.');
const baseCommit=execFileSync('git',['merge-base','HEAD','origin/main'],{cwd:repo,encoding:'utf8'}).trim();
const qa=await read('verification/qa/report.json');
for(const source of qa.libraries.flatMap(l=>l.sources??[])){
 const bytes=await fs.readFile(path.join(repo,source.path));
 if(hash(bytes)!==source.sha256||bytes.length!==source.bytes)throw new Error(`Stale QA source: ${source.path}`);
}
for(const source of [...transitions.sourceFiles,...transitions.helperFiles]){
 const bytes=await fs.readFile(path.join(base,source.path));
 if(hash(bytes)!==source.sha256)throw new Error(`Stale transition source: ${source.path}`);
}
const results=qa.libraries[0].clips.filter(c=>catalog.clips.some(d=>d.id===c.id));
for(const clip of catalog.clips){
 const sheet=sheets.clips.find(s=>s.id===clip.id);
 if(!sheet||sheet.frames.length!==8||sheet.sourceAssetSha256!==clip.sha256)throw new Error(`${clip.id}: stale or missing eight-frame sheet`);
 if(hash(await fs.readFile(path.join(base,'runtime',clip.asset)))!==clip.sha256)throw new Error(`${clip.id}: GLB hash mismatch`);
 if(hash(await fs.readFile(path.join(base,sheet.sheet)))!==sheet.sha256)throw new Error(`${clip.id}: sheet hash mismatch`);
}
const mm=n=>(n*1000).toFixed(3),f=n=>n.toFixed(3);
const rows=catalog.clips.map(c=>{
 const r=results.find(r=>r.id===c.id),check=requirements.checks.find(r=>r.id===c.id),event=name=>c.events.find(e=>e.type===name).time;
 const slide=Math.max(...check.supportWindows.filter(w=>w.bone.endsWith('Foot')).map(w=>w.maxDriftMeters3D));
 return `| [${c.id}](runtime/${c.asset}) | ${c.label} | ${r.score} | ${f(c.duration)} | ${f(event('back'))} / ${f(event('contact'))} | ${check.bodyRotationRangeDegrees.toFixed(1)}° | ${mm(slide)} | [8 פריימים](sheets/${c.id}.webp) |`;
}).join('\n');
const yellow=results.flatMap(c=>Object.entries(c.metrics).filter(([,m])=>m.status==='yellow').map(([name])=>`${c.id}: ${name}`));
const minimumFootRms=Math.min(...requirements.distinctPairs.map(p=>p.footRmsMeters)),minimumBodyRms=Math.min(...requirements.distinctPairs.map(p=>p.bodyRmsDegrees));
const report=`# דוח מסירה · בעיטות ומסירות כדורגל v2

נוספו **14 קליפים**, על שלד קנוני של **18 עצמות**, בקצב מקור **30Hz**, עם אירועי **back** ו־**contact**. כל הקליפים עברו motion-qa-v1 בציון **${requirements.minimumScore} ומעלה**, עם **0 מדדים אדומים** וכיסוי מלא של המדדים החלים. החלקת סוליה תלת־ממדית מרבית בחלונות התמיכה: **${mm(requirements.maximumFootSlideMeters3D)} מ״מ**, מול רף 20 מ״מ.

[תצוגת תלת־ממד](preview.html) · [לוח QA](verification/qa/report.html) · [אימות דרישות](verification/requirements.json) · [רישיונות](LICENSES.md)

## הקליפים

back הוא שיא ההכנה לאחור, לפני contact. סיבוב גוף הוא המרחק הזוויתי המרבי של האגן מפוזת הכניסה; הטבלה אינה מציגה סכום של סיבובי אגן וחזה. כל הזמנים בשניות, וכל החלקות הרגליים במ״מ.

| קליפ GLB | פעולה | QA | משך | back / contact | סיבוב אגן | החלקה מרבית | גיליון |
|---|---|---:|---:|---|---:|---:|---|
${rows}

## טיפול בהערה של רועי

לכל קליפ כוריאוגרפיה עצמאית: הכנה, סיבוב ירך, פיתול גו, כיוון ברך, זווית קרסול, מסלול רגל, ידיים מאזנות והתאוששות. בעיטות הקרקע משתמשות בקשת מרחבית קובית עם משיק רציף דרך המגע; אין הקטנה של אותה בעיטה לכל המסירות. מסירות קצרות משתמשות בפנים פתוחות ובתנועה נמוכה, מסירה ארוכה בטעינת ירך ובהמשך גבוה, מסירת עומק בהטעיית כתף, lift_pass בהרמה אלכסונית, והגבהה מהאגף בסיבוב ובסחיפה רחבים במיוחד. רגל חלשה נכתבה בנפרד, עם תמיכה נגדית וטווחים משלה.

volley פוגש כדור באוויר בעוד רגל התמיכה נשארת נטועה. מספריים מצלב את הרגליים באוויר, מאריך את הרגל הפוגעת מעל הראש, מטה ומסובב את הגו, יורד לנחיתת כפות ידיים וקם. power_landing נוחת על רגל התמיכה לפני פריקת הירך. running_kick שומר על מחזור ריצה ועל מהירות תנועה חיצונית קבועה **4.5 מ׳/שנייה**, פוגש כדור נייח בעולם, וממשיך בריצה ללא עצירה; פאזת היציאה היא run ב־0.4 שנ׳.

נבדקו כל **91 זוגות הקליפים**: מרחק RMS המזערי בין קשתות המגע הוא **${(minimumFootRms*100).toFixed(2)} ס״מ**, ובין סיבובי האגן **${minimumBodyRms.toFixed(2)}°**. ההשוואה מנרמלת את שלב ההכנה עד המשך התנועה ומשווה נקודת מגע יחסית לאגן; היא ראיה להבדלי נתונים, לצד סקירת גיליונות הפריימים.

![בעיטת קשת מבפנים](sheets/inside_curve.webp)

![מספריים](sheets/scissors.webp)

## רציפות, רצפה ותמיכות

**${transitions.summary.passed}/${transitions.summary.bridges} גשרים** מול run ו־idle עברו בדיקת C0/C1 ב־240Hz, בשני הכיוונים ובפאזות הקטלוג ובפאזות פנימיות. כל גשר נמשך לפי הקטלוג; פאזת היעד מוחזקת במהלכו ומתחדשת בסופו. הגשר מתחיל מהפוזה המוצגת ומהמהירות שלה, כך שאפשר להפסיק ריצה גם בפאזה פנימית.

runtime/player.mjs מוסיף תיקון רצפה מקומי ב־IK תוך שמירת כיוון כף הרגל ומישור הברך. התיקון נכנס ויוצא במשקל בעל ערך ונגזרת אפס בקצותיו. סטיית מהירות זוויתית מרבית בקצות הגשרים: **${transitions.summary.maxEndpointVelocityRadiansPerSecond.toExponential(3)} רד׳/שנייה**. החלקת תמיכות idle משותפות: **${mm(transitions.summary.maxStationaryIdleSoleDriftMeters)} מ״מ**; חדירת סוליה מרבית בגשר: **${mm(-transitions.summary.minimumGroundedBridgeSoleYMeters)} מ״מ**. [המדידות והספים](verification/transitions.json).

Root נשאר קבוע; Hips נושא את התנועה החזותית המקומית. מסלול referenceRootMotion בבעיטת הריצה מתאר תרגום שחקן חיצוני ואינו מוזרק ל־GLB כ־root motion. צרכן במשחק מיישם אותו, או את תנועת הפיזיקה שלו, פעם אחת בלבד. נעילת עוגני תמיכה תחת טרנספורמציית השחקן המלאה באחריות הצרכן; הגשרים בחבילה מודדים רציפות ופינוי רצפה מקומי. אירועים והכדור אינם משוגרים בידי גשר הפוזות.

## כלי QA ושחזור

בסיס הענף הוא main בקומיט **${baseCommit}**. motion-qa-v1 אינו ב־main הזה; הקורא המקורי נלקח מקומיט **${requirements.qaCommit}**, מתוך [PR #371](https://github.com/roynaor-work/Bakasun/pull/371). measure.mjs מחלץ את קובצי הכלי ל־/tmp ומפעיל את run.mjs המקורי עם --fps 120. ה־hook מחליף רק את טוען הספריות, ומציג את הנכסים החדשים בלי לשנות נוסחאות, משקלים או ספים. SHA-256 לכל קובצי הכלי שמור בדוח הדרישות. קובצי REPORT/LICENSE זמניים שה־CLI כותב נשארים ב־/tmp.

ה־CLI מחפש שורת idle לפי שם ו־profile; לכן שורת idle_run_reference מכילה במפורש את run.glb האמיתי ואת התמיכות/מסלול התנועה שלו. שתי שורות הייחוס מוצגות בדוח ומופרדות מ־14 קליפי המסירה. metadata של מקור ה־QA מציין working-tree עם קומיט הבסיס; זהות קובצי המסירה נקבעת לפי חתימות התוכן, ללא ייחוס מטעה לקומיט הבסיס.

נמדדו ה־GLB הסופיים, כולל ערכי FLOAT ואינטרפולציה ביניהם, ונבדקה התאמה לפוזות המקור, היררכיית ומידות 18 העצמות, ערוצי 30Hz, אירועי back/contact, נקודות מגע כדור ורצפה, כל חלונות התמיכה והמשך הריצה. קיימים מדדים צהובים בלבד ב־**${yellow.join('; ')}**; אלו תנועות מהירות יותר ביחס למדד posePops המקורי, וכולן מעל רף 88. המדד בודק מפרקי שלד ונקודות סוליה מוצהרות, ואינו בדיקת התנגשות של כל משטח הרשת או אישור תפיסתי לאנימציה.

צילום תלת־ממד אמיתי הניב 14 גיליונות × 8 פריימים, עם SHA של ה־GLB ושל הגיליון. בדיקת דפדפן עברית במסכים 1280×900 ו־390×844: ללא שגיאות, ללא גלילה אופקית, ללא בקשות חיצוניות ל־Draco/WASM, עם WebAssembly חסום במכוון. [ראיות דפדפן](verification/browser.json).

בדיקות המאגר הקיימות: **${tests.status}**. ${tests.summary}

~~~sh
node workout/island/design/soccer-kicks-v2/source/author.mjs
node workout/island/design/soccer-kicks-v2/source/bake.mjs
node workout/island/design/soccer-kicks-v2/measure.mjs
node workout/island/design/soccer-kicks-v2/source/measure-transitions.mjs
node workout/island/design/soccer-kicks-v2/source/capture.mjs
node workout/island/design/soccer-kicks-v2/source/report.mjs
~~~

כל הקבצים החדשים נמצאים רק ב־workout/island/design/soccer-kicks-v2/. קוד המשחק, release.json, תגי גרסה, CLAUDE.md, ops וקובצי בדיקות נשארו ללא שינוי. לא בוצע חיבור למשחק או פרסום ל־main.
`;
await fs.writeFile(path.join(base,'REPORT.md'),report);
await fs.writeFile(path.join(base,'README.md'),`# Soccer kicks v2

14 קליפי בעיטות ומסירות מקוריים, CC0-1.0, שלד קנוני18, 30Hz, GLB ללא דחיסה.

- [תצוגת תלת־ממד](preview.html): בחירת קליפ, ניגון, האטה, אירועים, מסלול רגל וארבע זוויות מבט.
- [דוח מסירה ו־14 גיליונות פריימים](REPORT.md).
- [קטלוג קליפים ואירועים](runtime/catalog.json), [פוזות מקור מלאות](runtime/motions.json).
- [API דגימה וגשר C1 עם תיקון רצפה](runtime/player.mjs).
- [דוח כלי QA המקורי](verification/qa/report.html), [מעברים](verification/transitions.json).
- [רישיונות ומקורות](LICENSES.md), [מלאי חתום](verification/inventory.json).

לצפייה מקומית, משורש המאגר:

~~~sh
python3 -m http.server 8765
~~~

פתחו [את התצוגה המקומית](http://localhost:8765/workout/island/design/soccer-kicks-v2/preview.html). אין צורך בהתקנת חבילות, רשת חיצונית או Draco. לצילום אוטומטי נדרשים Node24+, Python/Pillow, Playwright ו־Chromium; נתיבי הסביבה ניתנים להחלפה ב־PLAYWRIGHT_MODULE ו־CHROMIUM_PATH.

יחידות: מטרים ושניות, +Y למעלה, +Z קדימה, +X שמאל אנטומי, קווטרניונים xyzw מקומיים להורה. Root קבוע, hips בכל פריים הוא מיקום Hips מקומי ל־Root. back לפני contact; רדיוס הכדור .11מ׳, ball.samples במרחב השחקן המקומי. ב־running_kick יש להוסיף referenceRootMotion פעם אחת בלבד כדי להציג את התנועה בעולם. הגאומטריה הפיקטיבית וייחוסי idle/run הם CC0 קיימים, שהועתקו ללא שינוי מ־soccer-header-v1.

makeBridge({from,to,fromTime,toTime,duration}) מקבל דוגמי פוזה וקושר פוזה ומהירות בשני הקצוות. מחזיקים את זמן היעד קבוע בזמן הגשר ואז ממשיכים מ־resumeTargetTime. ברירת המחדל מפעילה תיקון רצפה מקומי; grounding:false מיועד להשוואה למעבר Hermite הגולמי. אירועים, מסלול הכדור ותרגום השחקן מטופלים בנפרד בידי הצרכן. אין בחבילה שינוי לקוד המשחק הקיים.
`);
const dependencies=[
 ['../soccer-header-v1/source/rig.mjs','CC0-1.0','Canonical18 IK mathematics; originally from soccer-motion-v10/v9.'],
 ['../soccer-header-v1/source/glb.mjs','CC0-1.0','Uncompressed binary glTF read/write helpers.'],
 ['../soccer-header-v1/runtime/player.mjs','CC0-1.0','Canonical sampleMotion and Hermite C1 mathematics.'],
 ['../soccer-motion-v8/runtime/vendor/three.module.js','MIT','Existing three.js r160; Three.js authors.'],
 ['../soccer-motion-v8/runtime/vendor/GLTFLoader.js','MIT','Existing three.js r160 GLTFLoader; Three.js authors.'],
 ['../soccer-motion-v8/runtime/vendor/BufferGeometryUtils.js','MIT','Existing GLTFLoader transitive utility; Three.js authors.'],
 ['../soccer-motion-v8/runtime/vendor/LICENSE.three','MIT','Existing dependency license, retained unchanged.'],
];
const dependencyRecords=[];
for(const [file,license,origin] of dependencies){const bytes=await fs.readFile(path.join(base,file));dependencyRecords.push({path:file,license,origin,sha256:hash(bytes),bytes:bytes.length});}
const provenance={schemaVersion:1,baseCommit,branch:'codex/soccer-kicks-v2',authorship:'Original choreography, ball paths, review UI, bridge floor projection and documentation dedicated under CC0-1.0.',
 references:await Promise.all(['idle_relaxed','run'].map(async id=>{const file=`runtime/reference/${id}.glb`,source=`../soccer-header-v1/${file}`,a=await fs.readFile(path.join(base,file)),b=await fs.readFile(path.join(base,source));if(!a.equals(b))throw new Error(`Reference ${id} changed`);return {path:file,source,sha256:hash(a),bytes:a.length,license:'CC0-1.0',copiedUnchanged:true};})),
 geometry:'Uncompressed fictional CC0 MakeHuman hm08 athlete and system assets, via soccer-motion-v8 -> soccer-motion-v10 -> soccer-header-v1; full source license chain linked in LICENSES.md.',dependencies:dependencyRecords,
 qa:{commit:requirements.qaCommit,files:requirements.qaFiles,loader:'qa-register.mjs replaces only sources.mjs; original sampler/formulas/thresholds unchanged.'}};
await fs.writeFile(path.join(base,'verification/provenance.json'),JSON.stringify(provenance,null,2)+'\n');
await fs.writeFile(path.join(base,'LICENSES.md'),`# רישוי ומקורות · soccer-kicks-v2

כל הקבצים החדשים בחבילה מוקדשים לנחלת הכלל לפי **[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode)**. במידה המותרת בחוק, היוצרים מוותרים על זכויות היוצרים והזכויות הנלוות; כשוויתור אינו תקף חל רישיון הגיבוי הרחב שב־CC0. אין אחריות. ההקדשה כוללת את הכוריאוגרפיה המקורית, הפוזות, המסלולים, קוד המקור, תיעוד, דוחות המדידה, הגרפיקה והצילומים שנוצרו למשימה.

## גאומטריה וייחוסי תנועה קיימים · CC0

runtime/reference/idle_relaxed.glb ו־run.glb הועתקו ללא שינוי מ־[soccer-header-v1](../soccer-header-v1/LICENSES.md). החתימות מאמתות העתקה זהה בתים. כל GLB חדש משתמש באותה גאומטריה, skin וחומרים בלתי דחוסים; התנועה חדשה. השרשרת מתועדת ב־[מקור header-v1](../soccer-header-v1/verification/provenance.json), ב־[soccer-motion-v10 @57c536e](https://github.com/roynaor-work/Bakasun/blob/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/LICENSES.md), וב־[soccer-motion-v8/LICENSE.md](../soccer-motion-v8/LICENSE.md). מקור הדמות הוא אדם בדיוני המבוסס על MakeHuman hm08 ונכסי מערכת CC0. אין motion capture חיצוני או שימוש בזהותו של ספורטאי מסוים.

source/author.mjs ו־source/bake.mjs משתמשים בכלי המתמטיקה, GLB ו־Hermite הקיימים של header-v1 ברישיון CC0, בלי לערוך אותם. הקשתות, 14 הכוריאוגרפיות ותיקון הרצפה בגשר הם תרומה מקורית בחבילה זו.

## תוכנה קיימת · MIT

[three.js r160](../soccer-motion-v8/runtime/vendor/three.module.js), [GLTFLoader](../soccer-motion-v8/runtime/vendor/GLTFLoader.js) ו־[BufferGeometryUtils](../soccer-motion-v8/runtime/vendor/BufferGeometryUtils.js), Copyright Three.js authors, תחת [רישיון MIT הקיים](../soccer-motion-v8/runtime/vendor/LICENSE.three). הקבצים נטענים מהמאגר הקיים; הם אינם מועתקים או משונים בחבילה. רישיון CC0 אינו מחליף את תנאי MIT של התלויות. כלי הצילום Playwright/Chromium ו־Python/Pillow רצים מחוץ לחבילת הנכסים ואינם נמסרים בתוכה. אין decoder, Draco, Meshopt או WASM בנכסים החדשים.

## מדידה ומלאי

קוד motion-qa-v1 נקרא מקומיט [${requirements.qaCommit}](https://github.com/roynaor-work/Bakasun/blob/${requirements.qaCommit}/workout/island/design/motion-qa-v1/LICENSES.md), CC0, ומחולץ ל־/tmp בלבד. מדדים ו־SVG הם תוצאות הרצה מקוריות על הנכסים החדשים. דוח JSON המקורי נשמר; HTML מקומי רק מציג את ערכיו.

[provenance.json](verification/provenance.json) מכיל נתיבים, רישיונות, מקורות ו־SHA-256 לתלויות ולייחוסים. [inventory.json](verification/inventory.json) מונה **כל קובץ חדש** בחבילה, רישיונו, אופן יצירתו, גודלו וחתימתו. קובץ המלאי עצמו מופיע ללא חתימה עצמית כדי למנוע תלות מעגלית. כך גם REPORT.md, כל 14 גיליונות הפריימים וכל קובצי ה־GLB מכוסים במלאי.
`);
async function walk(dir,prefix=''){const files=[];for(const d of await fs.readdir(dir,{withFileTypes:true})){const relative=path.posix.join(prefix,d.name);if(d.isDirectory())files.push(...await walk(path.join(dir,d.name),relative));else files.push(relative);}return files.sort();}
const inventory=[];
for(const file of await walk(base)){
 if(file==='verification/inventory.json')continue;
 const bytes=await fs.readFile(path.join(base,file));
 let origin='Original CC0 source, documentation or review design created for this task.';
 if(file.startsWith('runtime/clips/'))origin='Original choreography baked by source/author.mjs and source/bake.mjs with inherited fictional CC0 geometry.';
 else if(file.startsWith('runtime/reference/'))origin='Byte-identical CC0 reference GLB copied from soccer-header-v1; see provenance.';
 else if(file.startsWith('runtime/'))origin='Original authored canonical18 poses, event catalog or transition helper; reused CC0 mathematics identified in provenance.';
 else if(file.startsWith('sheets/')||file.startsWith('verification/'))origin='Generated measurement, actual GLB rendering or content provenance for this delivery; source method recorded in the file/report.';
 inventory.push({path:file,license:'CC0-1.0',origin,bytes:bytes.length,sha256:hash(bytes)});
}
inventory.push({path:'verification/inventory.json',license:'CC0-1.0',origin:'Original generated inventory; its own hash is intentionally omitted.'});
await fs.writeFile(path.join(base,'verification/inventory.json'),JSON.stringify({schemaVersion:1,baseCommit,files:inventory},null,2)+'\n');
console.log(JSON.stringify({inventoryFiles:inventory.length,clips:catalog.clips.length,minimumScore:requirements.minimumScore,bridges:transitions.summary.passed,sheets:sheets.clips.length}));
