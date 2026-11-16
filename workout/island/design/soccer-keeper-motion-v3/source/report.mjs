// SPDX-License-Identifier: CC0-1.0
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base=new URL('../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,base),'utf8'));
const [catalog,qa,transitions,assets,browser,actions]=await Promise.all(['catalog.json','verification/requirements.json','verification/transitions.json','verification/assets.json','verification/browser.json','verification/actions.json'].map(read));
if(!qa.passed||!transitions.summary.allPassed||!assets.summary.allPassed||!browser.passed||!actions.summary.allPassed)throw Error('A required validation has not passed.');
const sha=b=>createHash('sha256').update(b).digest('hex'),rows=[];
for(const c of catalog.clips){const q=qa.checks.find(v=>v.id===c.id),s=browser.clips.find(v=>v.id===c.id),a=assets.clips.find(v=>v.id===c.id),hash=sha(await fs.readFile(new URL(c.asset,base)));if(hash!==c.sha256||hash!==a.sha256||hash!==q.sha256||hash!==s.glbSha256)throw Error('Stale evidence '+c.id);if(sha(await fs.readFile(new URL(s.sheet,base)))!==s.sheetSha256)throw Error('Stale sheet '+c.id);rows.push(`| [${c.id}](${c.asset}) | ${c.label} | ${c.duration.toFixed(2)} | ${c.frameCount} | ${q.score} | [8 פריימים](${c.sheet}) |`);}
const test=await fs.readFile(new URL('verification/repository-tests.json',base),'utf8').then(JSON.parse).catch(()=>({status:'לא הורץ'}));
const minY=Math.min(...assets.clips.map(c=>c.skinnedFloor.minimumYMeters));
const text=`# דוח מסירה · שוערים ושחקני שדה בכדורגל

נמסרו **14 קליפים חדשים**, בקצב **30Hz**, על **18 העצמות הקנוניות**. ציון motion-qa-v1 מינימלי **${qa.minimumScore}**, ללא מדדים אדומים וכיסוי מלא לכל המדדים הרלוונטיים. כל קובצי המסירה הם הוספות בתיקייה זו בלבד.

[תצוגת תלת־ממד](preview.html) · [לוח QA](verification/qa/report.html) · [קטלוג](catalog.json) · [מקורות ורישוי](LICENSES.md)

## הקליפים

הפריימים כוללים את שתי נקודות הקצה. גיליון כל קליפ מציג שמונה פריימים מקוריים של ה־GLB, לרבות אירועי המגע והשחרור.

| קליפ | תנועה | שניות | פריימים | ציון QA | גיליון |
|---|---|---:|---:|---:|---|
${rows.join('\n')}

תנועות השוער משתמשות בדמות השוער הקיימת עם כפפות; ארבע תנועות השדה בדמות השדה הקיימת. החגיגה הקבוצתית מדגימה שלושה מופעים בעלי skin עצמאי, עם היסטי מיקום וזמן מפורשים בקטלוג. הקליפ המשותף ניתן לניגון בכל שחקן של הקבוצה.

## שלד, מסלולים וצריכה

כל GLB עצמאי, כולל גאומטריה, חומרים, skin ואנימציה אחת: 18 ערוצי סיבוב וערוץ תרגום של Hips. אין דחיסה ואין צורך ב־WASM. Root קבוע; תרגום Hips הוא מקומי מוחלט, עם גובה מנוחה 0.86 מ׳. +Y למעלה, +Z קדימה, +X שמאל אנטומי. מידות המנוחה, ההיררכיה וה־inverse binds נשמרו.

catalog.json מספק משכים, אירועים, חלונות תמיכה, חתימות, מסלולי כדור וגשרים; motions.json כולל פוזה מלאה לכל דגימת 30Hz. referenceTravel הוא תרחיש תנועה חיצוני שבבעלות הסימולציה, ואינו מסלול Root המוטמע באנימציה. התצוגה מיישמת אותו פעם אחת בלבד. שיקוף הזינוקים וההזזה לצד השני נתון לצרכן; בחבילה יש קליפ אחד לכל פעולה מבוקשת.

שמיטת הבעיטה ונתיבי הכדור אחרי הטלה, אגרוף והדיפה משתמשים בכבידה 9.81 מ׳/שנ׳², עם מהירויות שחרור/פגיעה מפורשות. מסלול ההטלה לפני השחרור מוגדר באופן עצמאי והיד נפתרת מולו; אין הצמדת כדור חיה ליד בניגון. מסלולי הזינוק מחושבים בעולם ואז נשמרים ביחס לתרחיש השחקן כדי למנוע תוספת תנועת שחקן לכדור. לאחר מגע ברצפה התצוגה שומרת את מרכז הכדור בגובה הרדיוס; קפיצות, חיכוך, בעלות ומסירה למשחק דורשים מנוע כדור. בתפיסה, possession_transfer ב־2.7 שנ׳ מסמן העברת החזקה לצרכן לפני איפוס הפוזה; טווח הנראות מונע כדור תלוי אחרי פתיחת הידיים.

## אימות

- כלי motion-qa-v1 המקורי מקומיט 5eb4f093bc22523ee417a7f2345c3b813bffba24 הורץ ב־120Hz. נוסחאות, ספים ומשקלים לא שונו. המתאם מוסיף רק את הספרייה החדשה לרשימת מקורות סגורה. בדוח 15 שורות: 14 קליפים חדשים ועמידת שדה נלווית; עמידת השוער נמדדת מול keeper_ready. חתימות הכלי ודרישות המסירה ב־[requirements.json](verification/requirements.json). הציון הוא מדד הנדסי של שלד ומגעים, ולא ציון תפיסתי.
- **${transitions.summary.passed}/${transitions.summary.bridges} גשרי C1 עברו**, ב־240Hz, לעמידה ולריצה של soccer-locomotion-v2 בשני הכיוונים, בשלושה שלבים ובקטיעת גשר פעיל. שגיאת קצה מרבית ${transitions.summary.maxEndpointRotationDegrees.toExponential(3)} מעלות; שארית מהירות זוויתית ${transitions.summary.maxEndpointVelocityRadiansPerSecond.toExponential(3)} רדיאן/שנ׳. [ראיות](verification/transitions.json).
- **14/14 GLB עברו**, עם **אפס שגיאות Khronos**. נרשמו **${assets.summary.warnings} אזהרות קיימות** על חישוב tangent בזמן ריצה: חמש לכל דמות, עקב מפות normal ללא TANGENT מפורש. [תוצאות מלאות](verification/assets.json).
- כל קודקודי הרשת נבדקו לאחר skinning ב־60Hz לאורך הקליפים: **אפס חדירה לרצפה**, מרווח מינימלי ${(minY*1000).toFixed(3)} מ״מ. זו דגימה סופית של רצפה; אינה בדיקת התנגשויות גוף/בגד בכל זמן אפשרי. תמיכות, צעדי התאוששות ובליסטיקת כדור נבדקו גם ב־[actions.json](verification/actions.json).
- Chromium טען את כל 14 הקליפים וצילם **112 פריימים**. ${browser.viewports[0].width}×${browser.viewports[0].height} ללא גלילה, ו־390×844 ללא גלילה אופקית; ניגון, עצירה, גרירה ומצלמות עברו. בדיקת שתי טעינות מתחרות אימתה שחרור משאבים ללא שחרור כפול ושמירת הקליפ האחרון. WebAssembly חסום בבדיקה; אין שגיאות דף או בקשות חיצוניות. [ראיות וחתימות](verification/browser.json), [844×390](verification/preview-844x390.png), [390×844](verification/preview-390x844.png).
- בדיקות המאגר: ${(test.description??test.status).replace(/[.]+$/,'')}. סיכום ההרצה ב־[repository-tests.json](verification/repository-tests.json).

## גשרי כניסה ויציאה

runtime/player.mjs מספק sampleMotion, makeClipBridge ו־interruptBridge. ברירת המחדל בקטלוג היא 0.4 שנ׳, עם התאמת פוזה ומהירות בשני הקצוות מתוך נתוני ה־GLB הסופיים. קליפ היעד ממשיך מהשלב שנבחר אחרי הגשר. הצרכן אחראי לעוגני תמיכה בעולם ול־IK בזמן ערבוב; רציפות C1 אינה מבטיחה נעילת כף רגל או הימנעות מהתנגשויות במעבר שרירותי. קובצי הייחוס נלווים ל־14 הקליפים ונשמרו זהים בתים למקור המוצמד.

## שחזור

מתיקיית הריפו, Node 22 ומעלה:

\x60\x60\x60sh
node workout/island/design/soccer-keeper-motion-v3/source/prepare-keeper.mjs
node workout/island/design/soccer-keeper-motion-v3/source/author.mjs
node workout/island/design/soccer-keeper-motion-v3/source/bake.mjs
node workout/island/design/soccer-keeper-motion-v3/source/run-qa.mjs
node workout/island/design/soccer-keeper-motion-v3/source/validate-assets.mjs
node workout/island/design/soccer-keeper-motion-v3/source/measure-transitions.mjs
node workout/island/design/soccer-keeper-motion-v3/source/verify-actions.mjs
node workout/island/design/soccer-keeper-motion-v3/source/capture.mjs
node workout/island/design/soccer-keeper-motion-v3/source/report.mjs
\x60\x60\x60

כלי פענוח/אימות מותקנים זמנית ב־/tmp/keeper-tools, וניתן לשנות את הנתיב באמצעות KEEPER_TOOLS_DIR. להתקנה בסביבה חדשה: npm install --prefix /tmp/keeper-tools @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 draco3dgltf@1.5.9 gltf-validator@2.0.0-dev.3.10. צילום משתמש ב־Playwright וב־Chromium הזמינים בסביבה; אפשר להגדיר PLAYWRIGHT_MODULE ו־CHROMIUM_PATH. לצפייה מקומית יש להגיש את שורש הריפו בשרת HTTP ולפתוח את preview.html; התלויות המקומיות הקיימות נמצאות בריפו.

החבילה לא חוברה ללוגיקת המשחק. לא בוצעו מיזוג, העלאת גרסה או בדיקה בטלפון פיזי. הדוח והקבצים הוכנו לביקורת בענף codex/soccer-keeper-motion-v3.
`;
await fs.writeFile(new URL('REPORT.md',base),text);
const repo=new URL('../../../../',base),files=[];
async function walk(dir,prefix=''){for(const e of await fs.readdir(dir,{withFileTypes:true})){const path=prefix+e.name;if(e.isDirectory())await walk(new URL(e.name+'/',dir),path+'/');else if(path!=='verification/provenance.json'){const bytes=await fs.readFile(new URL(e.name,dir));files.push({path,bytes:bytes.length,sha256:sha(bytes)});}}}
await walk(base);
const dependencies=[];for(const p of ['workout/island/design/soccer-header-v1/source/rig.mjs','workout/island/design/soccer-header-v1/source/glb.mjs','workout/island/design/soccer-motion-v8/runtime/keeper.glb','workout/island/design/soccer-motion-v8/runtime/vendor/three.module.js','workout/island/design/soccer-motion-v8/runtime/vendor/GLTFLoader.js','workout/island/design/soccer-motion-v8/runtime/vendor/SkeletonUtils.js']){const bytes=await fs.readFile(new URL(p,repo));dependencies.push({path:p,bytes:bytes.length,sha256:sha(bytes)});}
await fs.writeFile(new URL('verification/provenance.json',base),JSON.stringify({schemaVersion:1,baseCommit:execFileSync('git',['merge-base','HEAD','origin/main'],{cwd:repo,encoding:'utf8'}).trim(),locomotionCommit:'ec6c73949fb5820826b4c082972f5d4f1136641f',qaCommit:qa.qaCommit,dependencyFiles:dependencies,files:files.sort((a,b)=>a.path.localeCompare(b.path)),totalBytes:files.reduce((s,f)=>s+f.bytes,0)},null,2)+'\n');
console.log(JSON.stringify({clips:14,minimumQaScore:qa.minimumScore,bridges:transitions.summary.passed,totalBytes:files.reduce((s,f)=>s+f.bytes,0),report:'REPORT.md'}));
