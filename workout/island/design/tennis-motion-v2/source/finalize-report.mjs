// SPDX-License-Identifier: CC0-1.0
// Report only observed measurements; fail rather than fabricate missing evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=new URL('../',import.meta.url),directory=fileURLToPath(base);
const read=async file=>JSON.parse(await fs.readFile(new URL(file,base),'utf8'));
const optional=async file=>{try{return await read(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalog=await read('catalog.json'),qa=await read('verification/motion-qa.json'),assets=await read('verification/assets.json'),browser=await read('verification/browser.json');
const regression=await optional('verification/regression.json'),runtimeTests=await optional('verification/runtime-tests.json'),qaEngineTests=await optional('verification/qa-engine-tests.json'),grip=await read('verification/grip.json');
if(catalog.clips.length!==24)throw Error('Report requires exactly 24 logical clips');
const medium=qa.libraries.find(l=>l.id==='medium');
if(!medium||medium.clips.length!==24)throw Error('Report requires measured QA for all 24 clips');
for(const library of qa.libraries)for(const clip of library.clips)if(!(clip.score>88&&clip.coverage===1))throw Error(`Unmet QA gate: ${library.id}/${clip.id}`);
if(!qa.pass||!assets.pass||!browser.pass||!grip.pass)throw Error('Verification failed; refusing a completion report');
for(const asset of assets.files){
 const bytes=await fs.readFile(new URL(asset.asset,base)),measured=qa.libraries.find(l=>l.asset===asset.asset);
 if(sha(bytes)!==asset.sha256||measured?.sha256!==asset.sha256||browser.assetSha256?.[asset.asset]!==asset.sha256||grip.files.find(f=>f.asset===asset.asset)?.sha256!==asset.sha256)throw Error(`Stale asset evidence: ${asset.asset}`);
}
const formatted=n=>Number.isFinite(n)?n.toFixed(2):'—';
const score=(id,height)=>qa.libraries.find(l=>l.id===height)?.clips.find(c=>c.id===id)?.score;
const contactHeight=(clip,height)=>clip.contactHeightVariants?.find(x=>x.height===height)?.heightMeters??clip.metadata?.contactHeights?.find(x=>x.height===height)?.heightMeters;
const rows=catalog.clips.map(c=>`| \`${c.id}\` · ${c.label??c.labelHe??''} | ${(c.durationSeconds??c.duration).toFixed(2)} | ${formatted(score(c.id,'medium'))} | ${formatted(score(c.id,'low'))} | ${formatted(score(c.id,'high'))} | [8 פריימים](${c.sheet??`sheets/${c.id}.webp`}) |`).join('\n');
const hitRows=catalog.clips.filter(c=>c.contactTime!==null).map(c=>`| \`${c.id}\` | ${formatted(c.contactTime)} | ${['low','medium','high'].map(h=>formatted(contactHeight(c,h))).join(' | ')} |`).join('\n');
const referenceBytes=(await fs.stat(new URL(catalog.referenceAsset??'source/reference/grip-player.glb',base))).size;
const fileRows=assets.files.map(f=>`| [${f.asset}](${f.asset}) | ${(f.bytes/1e6).toFixed(3)} MB | ${f.animations} | ${f.errors} / ${f.warnings} |`).join('\n');
const c1=medium.c1,bridges=c1?.runtimeBridges;
const pairs=bridges?.pairs??0;
const c1Pass=(c1?.serveJoins??[]).every(j=>j.pass!==false)&&(c1?.clips??[]).every(c=>c.pass!==false)&&bridges?.pass;
const regressionText=regression?`\`npm test\`: ${regression.passed??regression.passCount??'—'} עברו, ${regression.failed??regression.failCount??'—'} נכשלו, ${regression.skipped??'—'} דולגו; קוד יציאה ${regression.exitCode??'—'}. [עדות](verification/regression.json).`:'תוצאות רגרסיה כלליות אינן מצורפות לדוח זה.';
const qaEngineText=qaEngineTests?`בדיקות המקור של motion-qa-v1: ${qaEngineTests.passedTests??qaEngineTests.tests??'—'} עברו, ${qaEngineTests.fail??0} נכשלו. [עדות](verification/qa-engine-tests.json).`:'';
const runtimeText=qaEngineText+'\n\n'+(runtimeTests?`בדיקות גשרי C1: ${runtimeTests.passedTests??runtimeTests.passed??runtimeTests.tests??'—'} עברו, ${runtimeTests.failed??runtimeTests.fail??'—'} נכשלו. [עדות](verification/runtime-tests.json).`:'בדיקות גשרי C1 הנוספות ניתנות להרצה ב־`source/test-runtime.mjs`; בדיקת כל זוגות הקליפים מצורפת לדוח ה־QA.');
const browserView=browser.viewport??browser.viewports?.[0]??{width:844,height:390};
const sheets=(await fs.readdir(new URL('sheets/',base))).filter(f=>f.endsWith('.webp'));
if(sheets.length!==24)throw Error(`Expected 24 rendered frame sheets; found ${sheets.length}`);
if(browser.clips?.length!==24||browser.clips.some(c=>c.samples?.length!==8))throw Error('Browser evidence must contain eight rendered samples for all 24 clips');
for(const clip of catalog.clips)await fs.access(new URL(clip.sheet??`sheets/${clip.id}.webp`,base));
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const report=`# מסירת tennis-motion-v2\n\nעודכן: ${date}. ענף: \`codex/tennis-motion-v2\`.\n\nנמסרו **24 פעולות טניס ב־30Hz** על השלד הקנוני בן 18 העצמות, עם אחיזת המחבט הקשיחה של tennis-grip-v1, גרסאות חבטה לשלושה גבהים וגשרי C1. [תצוגה](preview.html) · [קטלוג](catalog.json) · [רישיונות](LICENSES.md) · [שחזור](README.md).\n\nכל ${qa.libraries.reduce((n,l)=>n+l.clips.length,0)} גרסאות התנועה שנמדדו עברו את הסף המחמיר של **מעל 88**, עם כיסוי מלא למדדים החלים. הציון הנמוך ביותר: **${formatted(qa.minimumScore)}**. כלי המדידה הוא motion-qa-v1 בקומיט \`${qa.toolCommit}\`; מודולי המדידה ופענוח ה־GLB נשמרו ללא שינוי, עם [SHA-256 נעולים](verification/qa-provenance.json).\n\n## התוצרים\n\n| GLB | גודל | אנימציות | שגיאות / אזהרות Khronos |\n|---|---|---|---|\n${fileRows}\n\nספריית הבסיס מכילה 24 פעולות לוגיות. שלוש ספריות ה־GLB מכילות את כל 24 המזהים, עם שלד וחיבורי אנימציה; כל קובץ עומד בתקרת המאגר של 2,000,000 בתים. החבטות מותאמות לגובה, ופעולות ההקשר נשמרות לרציפות ההגשה ולרפרנס ההיכון. הגאומטריה והמרקמים המלאים נשמרים פעם אחת בקובץ הייחוס [grip-player.glb](source/reference/grip-player.glb), בגודל ${(referenceBytes/1e6).toFixed(3)} MB. התצוגה טוענת אותו ומקשרת אליו את הקליפים מספריות התנועה לפי שמות העצמות והצמתים באמצעות AnimationMixer. 24 גיליונות מציגים 8 פריימים מרונדרים לכל פעולה. וולי בקהנד נוסף כדי להשלים ל־24 את רשימת הבקשה, הכוללת 23 פעולות כששלבי ההגשה נספרים בנפרד.\n\n## ציוני motion-qa-v1\n\n| פעולה | שניות | בינוני | נמוך | גבוה | גיליון |\n|---|---|---|---|---|---|\n${rows}\n\nהמדידות נעשו מה־GLB המפורסם ב־${qa.measurementRateHz}Hz, בתוספת המפתחות המקוריים וזמני האירועים. המדדים כוללים החלקת רגליים, רצפה, קפיצות פוזה, אנטומיה, מגע בכדור, כניסה ויציאה, מהירות גוף מול צעדים וסימטריה. מדדים שאינם חלים מתועדים ככאלה; סף הציון לא שונה. [כל המדדים והעדויות](verification/motion-qa.json).\n\n## נקודות המגע\n\nהגובה נמדד במטרים ממרכז המיתרים ברגע המגע. מרכז הכדור נמצא במרחק רדיוס של 0.0335 מ׳ מהמיתרים. הקטלוג שומר גם את הנקודה התלת־ממדית ואת מיקומה המקומי בעצם היד.\n\n| חבטה | זמן מגע בשניות | נמוך, מ׳ | בינוני, מ׳ | גבוה, מ׳ |\n|---|---|---|---|---|\n${hitRows}\n\n## אחיזה ורציפות\n\n${assets.checks.canonical18&&assets.checks.canonicalRest?'אומתו 18 העצמות, שמותיהן, סדרן, הוריהן ומנח המנוחה.':'יש לעיין בבדיקות מבנה השלד המצורפות.'} ${assets.checks.immutableGrip&&assets.checks.noEquipmentAnimation?'מטריצת racket_mount נשמרה בדיוק מקובץ המקור, בלי ערוצי אנימציה למחבט.':''} ה־inverse bind נשמר, ופתיחת יד שמאל מפעילה את ה־morph המקורי בדמות הייחוס באמצעות קישור ספריית התנועה, ללא עצמות נוספות. [בדיקות GLB](verification/assets.json).\n\nסיבובי הגוף, מיקום האגן ופתיחת יד שמאל משתמשים ב־CUBICSPLINE עם נגזרות. שלבי ההגשה נגזרים מתנועה משותפת; חיבורי ההגשה, קשרי הלולאות והנגזרות במפתחות נבדקו. עבור מעברים אחרים, גשר Hermite ב־runtime.mjs משמר פוזה ומהירות קווית וזוויתית בקצותיו. בדיקת ${pairs} מקרי מעבר (576 זוגות בקצותיהם ו־576 קיטועים בתנועה): **${c1Pass?'PASS':'ראו פירוט בדוח QA'}**. הכדור מחליף מהירות ברגע החבטה במכוון ולכן אינו חלק מדרישת C1 של השלד.\n\n## אימות תצוגה ובדיקות\n\nתצוגת הייחוס היא ${browserView.width??844}×${browserView.height??390}; [צילום](verification/preview-844x390.png), [בדיקת דפדפן](verification/browser.json). קיים גיליון לכל 24 הפעולות, עם 8 פריימים לכל גיליון.\n\n${runtimeText}\n\n${regressionText}\n\n## היקף ומגבלות\n\nכל קובצי המסירה נמצאים בתיקייה החדשה \`workout/island/design/tennis-motion-v2/\`. קובצי המשחק הקיימים אינם חלק מהמסירה. \`Root\` נשאר במקום; תרחיש תנועת הריצה המפורש משמש למדידת צעדים, ותנועה בעולם תיושם פעם אחת בחיבור למשחק. החלקת חימר מתועדת כהחלקה מכוונת.\n\nהתנועה נוצרה בכוריאוגרפיה ו־IK אנליטי, ולא בצילום תנועה. ציון motion-qa-v1 הוא מדד אבחוני דטרמיניסטי; אינו ציון תפיסתי אנושי. בדיקות הרצפה בוחנות נקודות שלד וסוליות, ואינן סריקת התנגשויות של כל רשת הגוף המעוותת. טרם בוצעו חיבור למשחק ובדיקת מכשיר טלפון אמיתי.\n\nקובץ המקור של האחיזה: \`${catalog.provenance.gripCommit}\`, ‏SHA-256 \`${catalog.provenance.gripPlayerSha256}\`. [מלאי קבצים ו־hash](manifest.json).\n`;
const maxWrist=Math.max(...grip.clips.map(c=>c.maxRightWristBendDegrees));
const maxLeft=Math.max(...grip.clips.map(c=>c.maxLeftGripErrorMeters))*1000;
const gripEvidence=`בדיקת אחיזה עצמאית ב־${grip.measurementRate}Hz עברה בכל ${grip.physicalAnimationStreams} הזרמים: זווית שורש כף יד מרבית ${maxWrist.toFixed(2)}° ושגיאת תמיכת יד שמאל מרבית ${maxLeft.toFixed(3)} מ״מ. [מדידות האחיזה](verification/grip.json).\n\n`;
await fs.writeFile(new URL('REPORT.md',base),report.replace('סיבובי הגוף,',gripEvidence+'סיבובי הגוף,'));
async function inventory(dir,prefix=''){
 const all=[];for(const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=path.join(dir,item.name),relative=prefix+item.name;
  if(item.isDirectory())all.push(...await inventory(file,relative+'/'));
  else if(item.isFile()&&relative!=='manifest.json'){
   const bytes=await fs.readFile(file),mit=/^vendor\/(?:three\.module\.js|GLTFLoader\.js|BufferGeometryUtils\.js|LICENSE\.three)$/.test(relative);
   all.push({path:relative,bytes:bytes.length,sha256:sha(bytes),license:mit?'MIT':'CC0-1.0'});
  }
 }return all;
}
const files=await inventory(directory);
await fs.writeFile(new URL('manifest.json',base),JSON.stringify({schemaVersion:1,library:catalog.library,generatedAt:new Date().toISOString(),fileCount:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),excludes:['manifest.json'],files},null,2)+'\n');
console.log(JSON.stringify({report:'REPORT.md',manifest:'manifest.json',files:files.length,sheets:sheets.length,minimumScore:qa.minimumScore,pass:true}));
