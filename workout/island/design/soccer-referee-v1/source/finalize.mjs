// SPDX-License-Identifier: CC0-1.0
// Generate a reviewable manifest/report only after the independent checks pass.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../../..');
const baseCommit='19d9cdc5e3718236df5a2fc4d8b8c26c72007575';
const relative='workout/island/design/soccer-referee-v1/';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const catalog=await read('runtime/catalog.json'),qa=await read('qa/summary.json');
const nativeQa=await read('qa/report.json');
const assets=await read('verification/assets.json'),gltf=await read('verification/gltf.json');
const browser=await read('verification/browser.json'),tests=await read('verification/repo-tests.json');
assert(qa.pass&&assets.pass&&gltf.pass&&browser.passed,'Delivery checks must pass');
assert(tests.allFailuresResolved&&tests.failed===0,'All repository test failures must be resolved');
const status=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{cwd:repo,encoding:'utf8'});
const changed=status.trimEnd().split('\n').filter(Boolean).map(line=>({status:line.slice(0,2),path:line.slice(3)}));
assert(changed.every(f=>f.path.startsWith(relative)&&['??','A ','AM',' A'].includes(f.status)),
  'Only new files inside the requested folder may be changed');
const diff=execFileSync('git',['diff','--name-status',baseCommit],{cwd:repo,encoding:'utf8'});
assert(diff.trim().split('\n').filter(Boolean).every(line=>line.startsWith('A\t'+relative)),
  'The branch must only add files in the requested folder');
await fs.writeFile(path.join(root,'verification','scope.json'),JSON.stringify({baseCommit,
  branch:'codex/soccer-referee-v1',allowedDirectory:relative,onlyNewFiles:true,
  existingFilesChanged:0,changes:changed},null,2)+'\n');
for(const record of [...catalog.models,...catalog.clips]) {
  assert.equal(hash(await fs.readFile(path.join(root,record.asset))),record.sha256,`Stale catalog: ${record.asset}`);
}
for(const library of nativeQa.libraries)for(const record of library.sources??[]) {
  const local=record.path.slice(relative.length);
  assert(record.path.startsWith(relative),'QA input outside this delivery');
  assert.equal(hash(await fs.readFile(path.join(root,local))),record.sha256,`Stale QA input: ${local}`);
}
for(const record of assets.models)assert.equal(hash(await fs.readFile(path.join(root,record.asset))),record.sha256,`Stale asset audit: ${record.asset}`);
for(const [file,record]of Object.entries(browser.files))assert.equal(hash(await fs.readFile(path.join(root,file))),record.sha256,`Stale browser evidence: ${file}`);
for(const record of gltf.records)assert.equal(hash(await fs.readFile(path.join(root,record.file))),record.sha256,`Stale glTF evidence: ${record.file}`);
const manifest={schemaVersion:1,id:'soccer-referee-v1',kind:'soccer-11v11-officials',license:'CC0-1.0',
  baseCommit,branch:'codex/soccer-referee-v1',units:'meters',axes:catalog.axes,sampleHz:30,
  canonicalSkeleton:{name:'Motion2Canonical18',boneCount:18,bones:catalog.skeleton,
    localRotationFormat:'quaternion-xyzw',restRotations:'identity',source:'../motion2/soccer.json'},
  models:catalog.models.map(m=>({...m,role:m.id==='referee'?'referee':'assistant',
    triangles:assets.models.find(a=>a.id===m.id).triangles,texture:{embedded:true,width:512,height:512},
    shirtMaterial:'shirt',shirtVariants:{yellow:[1,.75,.035,1],black:'#20262d'}})),
  clips:catalog.clips.map(c=>({...c,qaScore:qa.clips.find(q=>q.id===c.id).score})),
  attachments:{YellowCard:{parent:'RightHand',separateNode:true,visibleIn:['yellow_card']},
    RedCard:{parent:'RightHand',separateNode:true,visibleIn:['red_card']},
    Whistle:{parent:'RightHand',separateNode:true,visibleIn:['whistle']},
    Flag:{parent:'RightHand',separateNode:true,models:['assistant-left','assistant-right']}},
  playback:{rootMotion:false,rootTranslation:'host controlled',
    hipsTranslation:'absolute parent-local translation; do not add canonical rest twice',
    props:'Native STEP scale tracks; hidden scale zero, exposed scale one; never extra skin joints',
    referenceSpeedMps:{jog:1,assistant_run:1.15},
    gameplay:'Presentation only. The host authorizes whistles, discipline, penalties, offside and goals.'},
  preview:{file:'preview.html',primaryViewport:{width:844,height:390},secondaryViewport:{width:390,height:844},
    entryScreenshot:'verification/844x390-yellow_card.png',network:'same-origin local files only'},
  verification:{motionQa:{tool:'motion-qa-v1',commit:qa.qaCommit,measurementHz:120,minimumScore:qa.minimumScore,
      requirement:'Every clip strictly above 88',coverage:1,redMetrics:0,report:'qa/report.html',data:'qa/report.json'},
    assetChecks:assets.checks,assetReport:'verification/assets.json',
    gltf:{files:gltf.files,errors:gltf.errors,warnings:gltf.warnings,report:'verification/gltf.json'},
    browser:{passed:browser.passed,samples:browser.samples.length,captures:browser.captures.length,report:'verification/browser.json'},
    repositoryTests:tests,scope:'verification/scope.json'},
  sources:'source/model-provenance.json',licenses:'LICENSES.md',report:'REPORT.md'};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const rows=manifest.models.map(m=>`| ${m.id} | ${m.triangles.toLocaleString('en')} | ${m.bytes.toLocaleString('en')} | ${m.clips.length} |`).join('\n');
const clipRows=manifest.clips.map(c=>`| ${c.labelHe} | \`${c.id}\` | ${c.durationSeconds} | ${c.frameCount} | ${c.qaScore} |`).join('\n');
const report=`# שופט כדורגל 11 על 11 · soccer-referee-v1

חבילת הנכסים הושלמה בענף **codex/soccer-referee-v1**. נוצרה תיקייה חדשה אחת בלבד: \`${relative}\`. כל עשרת הקליפים עברו את motion-qa-v1 בציון **${qa.minimumScore}–100**, מעל הדרישה 88. אין שינוי בקבצים קיימים או בקוד המשחק.

[תצוגה אינטראקטיבית](preview.html) · [manifest](manifest.json) · [דוח QA](qa/report.html) · [רישיונות](LICENSES.md)

![כרטיס צהוב, תצוגת נייד 844×390](verification/844x390-yellow_card.png)

## הנכסים

| דמות | משולשים, כולל אביזרים | גודל GLB בבתים | קליפים מוטמעים |
|---|---:|---:|---:|
${rows}

בכל דמות skin עם בדיוק 18 העצמות הקנוניות, אותם שמות/הורים/תרגומי מנוחה ו־inverse bind matrices, משקלים מנורמלים ואטלס מוטמע יחיד 512×512. הגוף והפנים מבוססים על השופט הבדיוני הקיים ב־soccer-v6; הלבוש הרציף, הכרטיסים, המשרוקית, הדגלונים והתנועות הותאמו לחבילה החסכונית. לכל נכס SHA-256 במניפסט.

YellowCard ו־RedCard הם אובייקטים נפרדים, ילדים של RightHand; tracks מסוג STEP חושפים את הכרטיס המתאים בלבד ומאפסים אותו במעבר לקליפ אחר. Whistle נפרד באותו צומת; Flag נפרד אצל שני הקוונים, עם מוט ודגל צהוב־כתום משובץ. החלפת חולצה לצהוב/שחור משנה את החומר shirt בתצוגה.

## קליפים וציוני תנועה

כל הנתונים נאפו ב־30Hz; מספר הפריימים כולל את שני קצות הקליפ. שמונת הקליפים הראשונים שייכים לשופט. שני הקוונים מקבלים idle ושתי הפעולות האחרונות.

| פעולה | מזהה | משך בשניות | פריימים | ציון QA |
|---|---|---:|---:|---:|
${clipRows}

כלי המדידה המקורי מקומיט [${qa.qaCommit.slice(0,8)}](https://github.com/roynaor-work/Bakasun/tree/${qa.qaCommit}/workout/island/design/motion-qa-v1) חולץ ל־tmp והופעל ללא שינוי בנוסחאות, בספים או במשקלות. מתאם מחליף רק את רשימת הקלט. קורא ה־GLB המקורי דגם ב־120Hz את הערוצים שנמסרו, כולל זמני תמיכה ואירועים. חתימות שמונת קובצי הכלי נבדקו לפני ואחרי. מקור הקלט המדויק מזוהה בחתימות הקבצים; commit הבסיס אינו מוצג כקומיט שמכיל את הנכסים החדשים.

הכיסוי של כל המדדים החלים הוא 100%, ללא מדדים אדומים. בשני קליפי הריצה רציפות מול idle צהובה: תנוחת ריצה דורשת blend בזמן חיבור למשחק. נתוני התמיכה והמסלול החיצוני מפורשים: jog ב־1 מ׳/שנייה, assistant_run ב־1.15 מ׳/שנייה. המסלול הוחל פעם אחת בלבד בבדיקה. אין כדור בפעולות שיפוט ולכן מדד מגע בכדור אינו חל. ציון הכלי הוא מדד הנדסי, ולא ביקורת תפיסתית חיצונית.

## אימות

- בדיקה עצמאית: **${assets.checks.toLocaleString('en')} בדיקות**, ללא כישלונות; שלד, bind, משקלים, דגימות קווטרניונים, 30Hz, התאמה בין הקליפים העצמאיים למודלים, גוף מול רצפה ומשמעות המחוות. כל קודקודי העור נבדקו ב־CPU בכל פריים של 30Hz; מרווח הרצפה המינימלי 2 מ״מ. [נתונים](verification/assets.json).
- Khronos glTF Validator: **${gltf.files} GLB**, אפס שגיאות ואפס אזהרות, כולל המודלים, קובצי הבסיס והקליפים העצמאיים. [נתונים](verification/gltf.json).
- Chromium: **${browser.samples.length} דגימות**, **${browser.captures.length} צילומים**; 844×390 ובדיקה נוספת ב־390×844, כל הפעולות, מגע, גרירה בזמן, ניגון/השהיה, החזרת הזמן לאחור, צבעי חולצה, 22 שחקנים ברקע והעדפת תנועה מופחתת. אין שגיאות דף או בקשות חיצוניות. [נתונים וחתימות](verification/browser.json).
- בדיקות הריפו: **${tests.passed} בדיקות שונות אומתו, ${tests.failed} כשלים שנותרו, ${tests.skipped} דולגו**. בהרצת npm test הראשונית עברו 4,017 בדיקות; בדיקת הדפדפן הקיימת של רועיקי נכשלה בשיגור Chromium שלא הותקן במטמון Playwright, והשאירה שרת פתוח. התהליך התקוע הופסק, והקובץ שנכשל הורץ מחדש עם Chromium המערכתי דרך ISLAND_PLAYWRIGHT: כל חמש הבדיקות עברו, כולל הבדיקה החסרה. אין שינוי בקבצי הבדיקות או בקוד קיים. [תוצאות שתי ההרצות](verification/repo-tests.json) · [פלט מסכם](verification/repo-tests.txt).
- [בדיקת ההיקף](verification/scope.json): בסיס \`${baseCommit}\`, קבצים חדשים בתיקייה המבוקשת בלבד; אפס קבצים קיימים שונו.

## צפייה וחיבור

1. משורש הריפו מריצים \`python3 -m http.server 8765\` ופותחים [את התצוגה המקומית](http://localhost:8765/${relative}preview.html).
2. בוחרים מחווה, מנסים השהיה וגרירה בזמן, ומחליפים צבע חולצה. בריצת הקוונים יש תזוזה חיצונית לאורך קו החוץ; ההדגמה נעצרת בסוף המחזור, והפעלה מחדש מתחילה מסלול חדש בלי קפיצה אוטומטית.
3. לחיבור טוענים models/referee.glb ושני models/assistant-*.glb. משתמשים בקליפים המוטמעים; clips/ מכיל עותק עצמאי זהה לכל פעולה לצורכי בדיקה ושימוש נפרד. Root נשאר זהות, המשחק מספק מיקום וכיוון. Hips.translation הוא ערך מקומי מוחלט; אין להוסיף שוב את ערך המנוחה. הפעולות מסמנות החלטה שכבר התקבלה במשחק; זמן הקליפ אינו משנה תוצאה או חוקים.

זו חבילת נכסים עצמאית לצפייה ולחיבור בהמשך. ביצועי טלפון פיזי ואינטגרציה במשחק 11 על 11 לא נמדדו במסגרת התיקייה החדשה.

## שחזור

Node 24+, Blender 4.3.2 עם NumPy/Pillow, ותלויות source/package.json לצילומים ולבדיקת Khronos. build-model.py קורא את מקורות soccer-v6 הקיימים בלבד; קובצי הבסיס כבר כלולים, ולכן לבניית האנימציות מחדש אין צורך ב־Blender. הרצת QA הראשונה עשויה למשוך את קומיט הכלי המוצמד מ־GitHub.

\`\`\`sh
blender --background --factory-startup --python ${relative}source/build-model.py
node ${relative}source/bake.mjs
node ${relative}source/run-qa.mjs
node ${relative}source/validate.mjs
node ${relative}source/check-gltf.mjs
node ${relative}source/capture.mjs
npm test
\`\`\`

תלויות כלי הבנייה יכולות להיות מותקנות מחוץ לריפו; GLTF_VALIDATOR_MODULE ו־PLAYWRIGHT_MODULE מאפשרים לציין נתיב התקנה. התצוגה עצמה משתמשת בקובצי Three הקיימים בריפו, ללא npm או CDN.
`;
await fs.writeFile(path.join(root,'REPORT.md'),report);
console.log(JSON.stringify({manifest:'manifest.json',report:'REPORT.md',minimumScore:qa.minimumScore,
  models:manifest.models.map(({id,triangles,bytes})=>({id,triangles,bytes})),newFiles:changed.length}));
