/** Original CC0-1.0. Generate measured report and a per-file source/license inventory. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
const [rig,metrics,validation,browser,catalog]=await Promise.all(['rig.json','verification/metrics.json','verification/gltf-validation.json','verification/browser.json','catalog.json'].map(read));
const fmt=(n,d=3)=>Number(n).toFixed(d),mib=n=>fmt(n/1048576,2);
let rows='';
for(const p of rig.profiles){
  const measurement=metrics.measurements.find(m=>m.profile===p.id);
  for(const d of measurement.dunks)rows+=`| ${p.label} | ${fmt(p.heightMeters,2)} | ${fmt(p.armLengthMeters)} | ${fmt(p.armRatio,2)} | \`${d.clip}\` | ${fmt(d.requiredJump)} | ${fmt(d.physicalPalm.minimumHeight)} | ${fmt((d.physicalPalm.minimumHeight-3.05)*100,1)} |\n`;
}
const allSurface=metrics.measurements.flatMap(m=>m.surface),plain=metrics.models.filter(m=>m.format==='plain'),packed=metrics.models.filter(m=>m.format==='draco');
const report=`# דוח מסירה — דמויות כדורסל גבוהות v1

שלוש הדמויות נטענות ומנגנות את 83 קליפי v9 ואת 15 קליפי v8. בכל שש בדיקות ההטבעה כף היד הפיזית ברשת עוברת את שפת הטבעת ב־25 ס״מ לפחות, ועליית האגן המרבית נמוכה ממטר. בהטבעה בשתי ידיים נמדדת הנמוכה מבין שתי כפות הידיים באותו פריים.

**הבחנה הכרחית:** בקובצי v9 המקוריים כבר מוטמעת עליית אגן של 1.548686 מ׳. שינוי דמות בלבד לא יכול להקטין ערוץ הזזה זה. קובצי הקליפים נשמרו בבתים זהים; מתאם חדש מכייל במפורש את עוצמת העלייה החיובית. סיבובי המפרקים, אורכי העצמות של כל דמות, תנוחת הכיווץ ותזמון המקור נשמרים. מצב ״ניתור המקור״ בתצוגה מציג את העלייה המקורית. הפעלה ישירה של כל ערוצי ה־GLB במערבל אנימציה, בלי התאמת אגן, אינה עומדת בדרישת המטר.

## מידות ותוצאות ההטבעה

מטרים, למעט עמודת המרווח בס״מ. גובה נמדד מגאומטריית הריצה מהסוליה עד קצה הראש במנוחה. אורך הזרוע הוא אורך זרוע עליונה + אמה + רכיב האורך המקומי עד מרכז כף היד, ללא אצבעות. תוספת אורך הזרוע לקיצוני ולסנטר נמדדת יחסית לרכז לאחר נרמול לפי גובה: 8% ו־12%.

| דמות | גובה | אורך זרוע | יחס זרוע לפי גובה | קליפ | עליית אגן מרבית נדרשת | גובה כף יד פיזית | מרווח מעל הטבעת בס״מ |
|---|---:|---:|---:|---|---:|---:|---:|
${rows}
ב־v8 אין קליפ הטבעה; שני קליפי ההטבעה לעיל הם כל קליפי ההטבעה ב־v9. שיא המדידה נמצא בזמן מנורמל 0.5694444444, כלומר 1.366667 שניות. תנועת השחקן בעולם אינה מוסיפה גובה למדידה.

## שיטת המדידה

1. קוראים את ששת קובצי ה־GLB שנמסרו ומפענחים בפועל גם את עותקי Draco בכלי הפיתוח. מאמתים שמות והורים של 18 עצמות, סיבובי קשירה זהות, מטריצות קשירה הפוכות, משקולות, גבהים וטקסטורות.
2. קוראים ומפענחים את כל 98 קובצי gzip, ומאמתים SHA-256 מול הקטלוג. העותקים נלקחו ישירות מקומיטי המקור הקפואים בעזרת Git. דוגמים את הסיבובים המקוריים ב־FK עצמאי, ללא שימוש בקוד ה־FK של המתאם.
3. בכל פריים מועמד של ההטבעה מחשבים את גובה כף היד ללא הרכיב החיובי של הזזת האגן. מחפשים את מכפיל מעטפת הניתור המקורית הנמוך ביותר המביא את כף היד ל־3.305 מ׳; בהטבעה כפולה משתמשים בשתי הידיים. מכפיל זה מוחל על כל העלייה החיובית, ולא על פריים בודד. גובה האגן המדווח הוא השינוי ממצב המנוחה, ולא הגובה המוחלט שלו מעל הרצפה.
4. נקודת כף היד נבחרה מקודקוד עור ממשי במרכז כף היד ומזוהה ב־\`rig.json\`. מאמתים גם את מיקומו אחרי skinning של הרשת בפועל. גובה כף היד הפיזית הנמוך ביותר הוא ${fmt(Math.min(...metrics.measurements.flatMap(m=>m.dunks.map(d=>d.physicalPalm.minimumHeight))),8)} מ׳.

## תקציב הנכסים

| דמות | משולשים | GLB ריצה ללא דחיסה, בתים | GLB עם Draco, בתים | טקסטורה |
|---|---:|---:|---:|---|
${rig.profiles.map(p=>`| ${p.label} | ${p.triangles.toLocaleString('en-US')} | ${plain.find(m=>m.profile===p.id).bytes.toLocaleString('en-US')} | ${packed.find(m=>m.profile===p.id).bytes.toLocaleString('en-US')} | 1024×1024 |`).join('\n')}

פריסת UV, סדר הפרימיטיבים והטופולוגיה זהים בדיוק בין שלוש דמויות הריצה. שני מערכי הצבעים הם לגונה וגחלת; שלושת חומרי המדים נצבעים לפי הצבעים המתועדים ב־\`rig.json\`. אין לוגואים, סמלים או דיוקנאות של אנשים אמיתיים. הגוף והעיניים הם ליבת MakeHuman ברישיון CC0; גזרת הגופייה היא גאומטריה מקורית של המאגר שהותאמה לגוף החדש. שיער, נעליים ומדים חיצוניים לא מאומתים הוסרו. [LICENSES.md](LICENSES.md) מפרט מקור ורישיון לכל קובץ.

## בדיקות שבוצעו

- \`node --test workout/island/design/hoops-tall-v1/tests/*.mjs\`: שבע בדיקות עוברות. כל קובץ בחבילה נקרא; כל ששת ה־GLB וכל 98 הקליפים נטענים ומפוענחים.
- אימות glTF: ${validation.files.reduce((s,f)=>s+f.errors,0)} שגיאות ו־${validation.files.reduce((s,f)=>s+f.warnings,0)} אזהרות בששת קובצי ה־GLB.
- ${metrics.allFrameCount.toLocaleString('en-US')} הערכות FK על כל פריימי המקור בכל שלוש הדמויות. שגיאת אורך עצם מרבית ${metrics.maximumBoneLengthError.toExponential(2)} מ׳; ההפרש המרבי מול המתאם ${metrics.maximumRuntimeFKError.toExponential(2)} מ׳. האינטרפולציה תואמת LINEAR/SLERP של המקור.
- skinning ממשי בשישה קליפי v9: כדרור, צעד וחצי, שתי הטבעות, הגנה וריבאונד, בכל שלוש הדמויות ובשישה זמנים לכל קליפ. כל הקודקודים סופיים. אחוזון 99 המרבי של יחס אורך צלע הוא ${fmt(Math.max(...allSurface.map(s=>s.p99EdgeStretch)))}; יחס הצלע המרבי ${fmt(Math.max(...allSurface.map(s=>s.maximumEdgeStretch)))}. ספי איתור כשל גס נקבעו מראש ל־3 ו־8; צלעות מנוחה קטנות מ־5 מ״מ אינן נכללות במדד.
- דפדפן Chromium ${browser.engine}: ${browser.actorClipLoads} טעינות דמות/קליפ ו־${browser.poseSamples.toLocaleString('en-US')} דגימות תצוגה. אפס שגיאות JavaScript/טעינה, ללא בקשות חיצוניות וללא בקשת WASM. ה־API של WebAssembly הוסר מראש, וב־CSP אין היתר ל־wasm-unsafe-eval.
- תצוגת מחשב 1440×1100 וטלפון 390×844; ללא גלילה אופקית. שתי התלבושות ומצב ניתור המקור נבדקו.

פלטים: [metrics.json](verification/metrics.json), [gltf-validation.json](verification/gltf-validation.json), [browser.json](verification/browser.json). [הוראות שחזור](source/README.md).

## צילומי סקירה

![שלוש דמויות בהטבעה כפולה](verification/dunk_two_hands.png)
![כדרור](verification/dribble_forward.png)
![צעד וחצי](verification/layup_right.png)
![הגנה](verification/defensive_stance.png)
![ריבאונד](verification/rebound_jump.png)

## גבולות האימות

שמירת אורכי עצמות, בדיקות צלעות וצפייה בפוזות שנדגמו אינן הוכחה להיעדר כל חדירת עור/בגד בכל רצף אפשרי. המתאם אינו פותר נעילת רגליים, מגעי כדור או שילובי קליפים במשחק. כדור התצוגה הוא מדריך כף יד; תנועתו אינה מסלול פיזיקלי מאומת. כיול הניתור הוא התאמת מעטפת תצוגה ושומר את משך הקליפ, ואינו פותר בליסטיקה. בדיקת הדפדפן משתמשת ב־SwiftShader; לא נמדדו ביצועי GPU או טלפון פיזי.

כל קובצי השינוי חדשים בתוך \`workout/island/design/hoops-tall-v1/\`. אין שינוי באפליקציה, בקבצים קיימים, בבדיקות קיימות, ב־ops או בגרסאות. ענף הבסיס הוא main בקומיט \`bd4d3600692b14be8881d2ba50a2b96485f3119e\`; מקור v9 הוא \`6dd1675ded8ef2c9d361821aa1642ab75de90541\` (PR #336). החבילה כוללת את הקליפים הנדרשים בלי לכלול את תיקיית v9 בענף המסירה.
`;
await fs.writeFile(path.join(root,'REPORT.md'),report);
await fs.writeFile(path.join(root,'LICENSES.md'),'');
async function files(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else out.push(path.relative(root,p));}return out.sort();}
let inventory='';
for(const f of await files(root)){
  const clip=catalog.clips.find(c=>c.path===f);
  let source='יצירה מקורית למסירה זו',license='CC0-1.0';
  if(clip)source=`[${clip.library} / ${clip.id}](https://github.com/roynaor-work/Bakasun/blob/${clip.sourceCommit}/${clip.source}) — העתק זהה; SHA-256 בקטלוג`;
  else if(/^(runtime|models)\/.*\.glb$/.test(f))source='ליבת MakeHuman CC0 + גזרת גופייה מקורית של המאגר + התאמות וציוד מקוריים; source/build-models.mjs, rig.json';
  else if(f==='textures/athlete-atlas.png')source='אטלס עור/פנים/עיניים מליבת MakeHuman CC0 דרך v7; אריג ואזורים אחרים נוצרו מחדש ללא סמלים';
  else if(f.startsWith('verification/')&&f.endsWith('.png'))source='רינדור מקומי של הנכסים בחבילה באמצעות preview.mjs ו־source/capture.mjs';
  else if(f.startsWith('verification/'))source='מדידות מקוריות של הנכסים שנמסרו; source/verify.mjs או source/capture.mjs';
  else if(f==='catalog.json')source='רשימת 98 קליפים מקוריים CC0 מהקומיטים הרשומים בכל שורה; source/package-clips.mjs';
  else if(f==='rig.json')source='מידות ומפת שלד מקוריות; ליבת MakeHuman CC0 וגזרת גופייה מקורית במאגר; source/build-models.mjs';
  inventory+=`| [${f}](${f}) | ${source} | ${license} |\n`;
}
const licenses=`# מקורות ורישיונות — כל קובצי החבילה

כל היצירה החדשה במסירה זו מוקדשת לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). הדמויות בדויות; אין מותגים, סמלי קבוצות או אנשים אמיתיים.

## מקור האנטומיה והגופייה

- גוף, פנים, עור ועיניים: נכסי הליבה של MakeHuman/MPFB. [דף הרישיון הרשמי](https://static.makehumancommunity.org/about/license.html) קובע: “All core assets are shared under Creative Commons, CC0”. המקור המקומי הוא [pg-lod1.glb](../hoops-v7/characters/models/pg-lod1.glb) ב־v7, גיבוב SHA-256 \`${rig.source.sha256}\`. הייחוס הקודם רשום ב־[LICENSES.md של v7](../hoops-v7/characters/LICENSES.md) וב־[ASSETS.md](../../../ASSETS.md).
- גזרת הגופייה והצנרת: יצירה מקורית קודמת של המאגר, \`authored-sewn-jersey\`/\`team_trim\` בתוך אותו מקור v7, שנוצרה ב־\`characters/source/build_characters.mjs\` ו־\`model_helpers_garments.mjs\`. היא הותאמה מחדש לגופים ולמשקולות החדשים. זו אינה גופייה מחבילת ביגוד חיצונית. ההתאמות והפלטים החדשים נמסרים כאן כ־CC0; אין כאן שינוי גורף לרישיון קובצי v7 הקיימים.
- כל השיער והנעליים מהמקור, בגדים חיצוניים והאנימציות המוטמעות הוסרו. השיער, הנעליים, המכנסיים, צבעי התלבושות והאזורים החדשים באטלס נוצרו בקוד המקורי המצורף.
- תנועה: 83 קליפי v9 ו־15 קליפי v8, יצירה מקורית של המאגר ב־CC0; [רישיון v9](https://github.com/roynaor-work/Bakasun/blob/6dd1675ded8ef2c9d361821aa1642ab75de90541/workout/island/design/hoops-motion-v9/LICENSES.md) ו־[מקור v8](../hoops-motion-v8/LICENSES.md). נתיבי המקור והקומיטים הקפואים מפורטים לכל קובץ בטבלה וב־\`catalog.json\`. עותקי התנועה אינם משתנים.

## ספריות וכלי פיתוח

לא נוספו עותקי ספריות צד שלישי לתיקייה זו. התצוגה מייבאת את Three.js r160 ואת GLTFLoader שכבר קיימים ב־\`../hoops-motion-v8/runtime/vendor/\`, ברישיון [MIT הקיים](../hoops-motion-v8/runtime/vendor/LICENSE.three). כלי glTF Transform, Draco, meshoptimizer, Sharp, glTF Validator ו־Playwright מותקנים מחוץ למאגר; הם אינם חלק מהנכסים המופצים. תוצרי Draco כאן כוללים תמיד עותק ריצה ללא Draco, Meshopt או WASM.

## רישיון ומקור לכל קובץ

| קובץ | מקור | רישיון |
|---|---|---|
${inventory}`;
await fs.writeFile(path.join(root,'LICENSES.md'),licenses);
console.log(`Report and per-file licenses generated (${inventory.split('\n').length-1} files)`);
