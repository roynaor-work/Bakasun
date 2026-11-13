// SPDX-License-Identifier: CC0-1.0
// Generate delivery documentation and a complete per-file CC0 source inventory.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../',import.meta.url),header='d759582c171600dd7c7df7906c2fb38ae7f8b88a';
const read=async p=>JSON.parse(await fs.readFile(new URL(p,base),'utf8'));
const [catalog,requirements,qa,transitions,browser]=await Promise.all(['runtime/catalog.json','verification/requirements.json','verification/qa/report.json','verification/transitions.json','verification/browser.json'].map(read));
if(!requirements.passed||!transitions.summary.allPassed||!browser.passed)throw new Error('Produce passing requirements, transitions and browser evidence before publishing the report.');
const results=qa.libraries[0].clips.filter(c=>catalog.clips.some(e=>e.id===c.id));
const row=results.map(c=>{const e=catalog.clips.find(e=>e.id===c.id);return `| ${c.id} | ${c.score} | ${e.duration.toFixed(1)} | ${e.frameCount} | ${e.events.map(x=>`${x.type} ${x.time.toFixed(3)} (${x.frame})`).join('; ')} | ${(100*c.metrics.footSliding.evidence.maxDriftMeters).toFixed(3)} | [8 פריימים](verification/sheets/${c.id}.png) |`;}).join('\n');
const yellow=results.flatMap(c=>Object.entries(c.metrics).filter(([,m])=>m.status==='yellow').map(([k])=>`${c.id}: ${k}`));
const report=`# דוח מסירה · פעולות כדורגל v13

שמונת הקליפים עוברים את רף 88: ציון מינימלי **${requirements.minimumScore}**, **${requirements.redMetrics} מדדים אדומים**, כיסוי **100%** של המדדים החלים. החלקה אופקית מרבית **${(100*requirements.maxHorizontalFootDriftMeters).toFixed(3)} ס״מ**, והעתק תמיכה תלת־ממדי מרבי **${(100*requirements.maxSupportDrift3DMeters).toFixed(3)} ס״מ**, לעומת גבול 2 ס״מ.

[תצוגת תנועה](preview.html) · [תוצאות QA מלאות](verification/qa/report.html) · [אימות הדרישות](verification/requirements.json) · [רישוי ומקורות](LICENSES.md)

## ציונים וקליפים

זמנים בשניות; מספרי פריימים מבסיס אפס. המשכים כוללים הכנה והתאוששות. התיקול והקימה יחד נמשכים 1.0 שנ׳.

| קליפ | ציון QA | משך | פריימים | אירוע: זמן (פריים) | החלקה מרבית ס״מ | גיליון |
|---|---:|---:|---:|---|---:|---|
${row}

כל הקליפים מכילים שלד קנוני של 18 עצמות, אותה היררכיה ואותן מידות מנוחה כמו design/motion/soccer.json, soccer-header-v1 ו־motion-fix-v12. המדידה משווה בפועל את שלד v12 מקומיט **${requirements.compatibility.motionFixV12.commit}**. כל ערוצי הסיבוב והזזת Hips נאפו ב־30 הרץ; Root קבוע בראשית ובסיבוב זהות. שמונת קובצי ה־GLB עצמאיים, מכילים דמות בדיונית ומסתכמים ב־${catalog.clips.reduce((s,c)=>s+c.bytes,0).toLocaleString('en-US')} בתים. אין דחיסה או decoder.

## מגע ותמיכה

בעיטת השוער כוללת הורדה מהיד לדשא, התקרבות קצרה במקום, נטיעת רגל שמאל ובעיטה ארוכה מימין. הכדור נמצא על הקרקע בעת הבעיטה. זריקת השוער משחררת מעל הכתף. המסירה הגבוהה נוגעת מתחת למרכז הכדור; היעף פוגש כדור באוויר. החזה מקבל את הכדור ואז נסוג והברכיים סופגות. בזריקת החוץ שני סימוני הידיים נמדדים מול הכדור מעל הראש ושתי הרגליים תומכות לאורך כל הקליפ.

לתיקול חלון מגע **0.366667–0.466667 שנ׳**, אירוע contact ב־0.400, ואירועי קימה ב־0.600 ועמידה ב־0.900. החלון כולו נבדק ב־120 הרץ, כולל זמני הקצה. הרגל הבועטת, רגל התמיכה והיד המאזנת נעות כחלק מהפוזה המלאה; ההתקדמות בעולם נשארת אצל הסימולציה. כדורי ההדגמה נעים עצמאית אחרי השחרור או המגע וכוללים פגיעה ברצפה.

כל חלונות תמיכת הסוליות נבדקו, כולל אינטרפולציה בין פריימי המקור. נבדקו נקודות התמיכה המוצהרות ומפרקי השלד; כלי ה־QA אינו מבצע בדיקת התנגשות של כל קודקודי העור. פערי המגע, שגיאות הרצפה וחתימות הנכסים נשמרים לכל קליפ ב־requirements.json.

## כלי motion-qa-v1 המקורי

כלי ה־QA אינו קיים ב־main שעליו נוצר הענף. לפיכך פקודת השחזור היא:

\`\`\`sh
node workout/island/design/soccer-clips-v13/measure.mjs
\`\`\`

הפקודה מחלצת ל־/tmp את **motion-qa-v1/run.mjs @ ${requirements.qaCommit}** ואת תלותיו, ומפעילה:

\`\`\`text
node --import <soccer-clips-v13/qa-register.mjs> <temporary>/workout/island/design/motion-qa-v1/run.mjs --library soccer-clips-v13 --fps 120 --out <soccer-clips-v13/verification/qa>
\`\`\`

ה־hook מחליף רק את sources.mjs כדי להוסיף את הספרייה החדשה לרשימה הסגורה של ה־CLI. run.mjs, metrics.mjs, glb.mjs, הספים והמשקלים נשארו זהים למקור; SHA-256 לכל קובץ ב־requirements.json. פלט המדדים נשמר ללא שינוי. עמודי HTML מקומיים מציגים את אותו JSON. שתי שורות idle_relaxed ו־idle_keeper הן אותו קליפ עמידה לפי תפקיד, אינן חלק משמונת הקליפים החדשים ואינן נכללות בציון המינימום.

מדדי posePops צהובים בפעולות מהירות: ${yellow.join('; ')}. אין מדד אדום. bodySliding אינו חל, משום שאלו פעולות במקום ללא תרחיש התקדמות בעולם. הציון הוא אבחון הנדסי של הנכסים; התצוגה התלת־ממדית היא ראיית המראה.

## כניסה ויציאה מול עמידה וריצה

פוזות הקצה נשענות על העמידה הקיימת, כולל פריים נייח בכל קצה. מדד הרציפות הרשמי מול עמידה ירוק בכל שמונת הקליפים. גשר C1 ממשי מסופק ב־runtime/player.mjs ומופנה מקטלוג התנועות: 0.20 שנ׳ לעמידה ו־0.30 שנ׳ לריצה.

**${transitions.summary.passed}/${transitions.summary.bridges} מעברים עברו**: שמונה קליפים × עמידה/ריצה × כניסה/יציאה × שלב אפס/שלב פנימי. המדידה מפענחת את ערוצי FLOAT שב־GLB הסופי ודוגמת ב־240 הרץ. שגיאת זווית בקצה עד ${transitions.summary.maxEndpointRotationDegrees.toExponential(3)} מעלות; שגיאת מהירות זוויתית עד ${transitions.summary.maxEndpointVelocityRadiansPerSecond.toExponential(3)} רדיאן/שנ׳. [ראיות מעבר](verification/transitions.json).

הגשר מחזיק את שלב היעד עד סופו וממשיך ממנו; הוא אינו משגר אירועים. בדיקת הרציפות מתייחסת לגשר המצורף. מיקום השחקן, תנועה בעולם ונעילת רגליים במהלך ערבוב נשארים באחריות הצרכן; החלקת הקליפים נבדקה בנפרד בכל חלונות התמיכה.

## בדיקה חזותית ותחום השינוי

כל שמונת ה־GLB נטענו ב־Chromium עם WebAssembly חסום, ללא שגיאות דפדפן, ללא בקשות Draco/WASM וללא גלישה אופקית ברוחב 390. הופקו **64 פריימים תלת־ממדיים**, שמונה לכל קליפ, וכן שמונה פוזות SVG מדודות לכל פעולה. [ראיות דפדפן](verification/browser.json), [מחשב](verification/preview-desktop.png), [נייד](verification/preview-mobile.png).

כל הקבצים שנוספו נמצאים תחת workout/island/design/soccer-clips-v13/. קבצים קיימים, קוד המשחק, release.json, תגי גרסה, CLAUDE.md, ops ובדיקות לא שונו. אימות הנכסים והדפדפן נעשה בכלים המפורטים כאן; בדיקות האפליקציה הכלליות אינן חלק ממסירת נכסים מבודדת זו. הענף נוצר מ־main @ ${header}; המסירה מיועדת ל־PR טיוטה.
`;
await fs.writeFile(new URL('REPORT.md',base),report);
const direct=['source/rig.mjs','source/glb.mjs','runtime/player.mjs','runtime/reference/idle_relaxed.glb','runtime/reference/run.glb'];
const adapted=['measure.mjs','qa-register.mjs','qa-report.mjs','qa-sources.mjs','source/bake.mjs','source/measure-transitions.mjs','preview.html','preview.mjs','preview.css'];
const origin=p=>{
  if(direct.includes(p)||adapted.includes(p))return {kind:direct.includes(p)?'CC0 copy':'CC0 adaptation',commit:header,path:`workout/island/design/soccer-header-v1/${p}`};
  if(p.startsWith('runtime/clips/'))return {kind:'Original CC0 motion; CC0 fictional mesh/skin/materials from soccer-header-v1/runtime/reference/idle_relaxed.glb',generator:'source/author.mjs + source/bake.mjs'};
  if(p.startsWith('verification/qa/'))return {kind:'Original asset measurement; pinned CC0 motion-qa-v1 output',commit:requirements.qaCommit};
  if(p.endsWith('.png'))return {kind:'Original Chromium render of CC0 assets; eight frames composed without external imagery',generator:'source/capture.mjs + source/compose-sheets.py'};
  return {kind:'Original CC0 task code, documentation, motion data or measurement evidence'};
};
async function files(dir=''){let all=[];for(const f of await fs.readdir(new URL(dir,base),{withFileTypes:true})){const p=dir+f.name;if(f.isDirectory())all.push(...await files(p+'/'));else all.push(p);}return all.sort();}
// Include the two inventory outputs even on the first run, without circular hashes.
const paths=[...new Set([...(await files()),'LICENSES.md','verification/provenance.json'])].sort();
const records=[];
for(const p of paths){let bytes;try{bytes=await fs.readFile(new URL(p,base));}catch{}records.push({path:p,license:'CC0-1.0',source:origin(p),...(bytes&&!['LICENSES.md','verification/provenance.json'].includes(p)?{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}:{} )});}
await fs.writeFile(new URL('verification/provenance.json',base),JSON.stringify({schemaVersion:1,baseCommit:header,license:'CC0-1.0',files:records},null,2)+'\n');
const licenseRows=records.map(r=>{const s=r.source,link=s.path?`[${s.path} @ ${s.commit.slice(0,12)}](https://github.com/roynaor-work/Bakasun/blob/${s.commit}/${s.path})`:s.generator??s.kind;return `| [${r.path}](${r.path}) | CC0-1.0 | ${s.kind}; ${link} |`;}).join('\n');
await fs.writeFile(new URL('LICENSES.md',base),`# רישיונות ומקור לכל קובץ

כל הקבצים החדשים בחבילה הם מקוריים או ממקורות CC0-1.0. התרומות המקוריות מוקדשות לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode); במידה המותרת בחוק, מוותרים על זכויות היוצרים והזכויות הנלוות. אין נכסי motion capture חיצוניים, מותגים או אדם מצולם.

תנועות הכדורגל נוצרו למשימה ב־source/author.mjs. העמידה, הריצה, השלד והגאומטריה נלקחו מחבילת [soccer-header-v1 @ ${header}](https://github.com/roynaor-work/Bakasun/tree/${header}/workout/island/design/soccer-header-v1), תחת [רישיון CC0 שלה](../soccer-header-v1/LICENSES.md). הייחוסים שם הם הקליפים הסופיים של soccer-motion-v10 @ 57c536e1291803161e069eff97987295c6194466. מקור הדמות הבדיונית: MakeHuman hm08 ונכסי מערכת CC0 דרך [soccer-motion-v8/LICENSE.md](../soccer-motion-v8/LICENSE.md). בכל GLB חדש הגאומטריה והעור זהים לייחוס, עם תנועה מקורית. מתמטיקת השלד, כלי ה־GLB והגשר הועתקו מ־soccer-header-v1, וכלים אחרים הותאמו ממנו כמצוין בטבלה.

כלי ה־QA המקורי @ ${requirements.qaCommit} הוא CC0, לפי [LICENSES.md שלו](https://github.com/roynaor-work/Bakasun/blob/${requirements.qaCommit}/workout/island/design/motion-qa-v1/LICENSES.md). הוא מחולץ זמנית ואינו מועתק לחבילה. לצורך תאימות נקרא בלבד GLB של motion-fix-v12 @ ${requirements.compatibility.motionFixV12.commit}; לא הועתק ממנו נכס. תוצאות המדידה והגיליונות הם ראיות מקוריות של הנכסים החדשים.

תלויות קיימות בלבד שאינן מתווספות: [three.js r160](../soccer-motion-v8/runtime/vendor/three.module.js) ו־[GLTFLoader](../soccer-motion-v8/runtime/vendor/GLTFLoader.js), ברישיון [MIT הקיים](../soccer-motion-v8/runtime/vendor/LICENSE.three), Copyright Three.js authors; [upstream](https://github.com/mrdoob/three.js/tree/r160). Playwright, Chromium, Python, Pillow וגופן המערכת DejaVu משמשים לצילום בלבד מחוץ למאגר, ללא העתקת קוד או קובצי גופן למסירה. תנאי התלויות נשארים בתוקף.

## מלאי פרטני

חתימות וגודל קבצים ב־[provenance.json](verification/provenance.json). שני קובצי המלאי עצמם אינם נושאים חתימה עצמית. שחזור: node workout/island/design/soccer-clips-v13/source/report.mjs.

| קובץ | רישיון | מקור |
|---|---|---|
${licenseRows}
`);
console.log(JSON.stringify({minimumScore:requirements.minimumScore,files:records.length,license:'CC0-1.0',report:'REPORT.md'}));
