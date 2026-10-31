import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const validation=JSON.parse(await fs.readFile(path.join(root,'validation.json'),'utf8'));
const browser=JSON.parse(await fs.readFile(path.join(root,'browser-validation.json'),'utf8'));
const repository=JSON.parse(await fs.readFile(path.join(root,'validation/repository-checks.json'),'utf8'));
const rows=validation.assets.map(x=>`| [${x.asset}.glb](${x.asset}.glb) | ${x.bytes.toLocaleString('en-US')} | ${x.triangles.toLocaleString('en-US')} | ${x.drawCallsEstimate} | ${x.compressedErrors} / ${x.decodedErrors} |`).join('\n');
const md=`# אימות · מודלי סביבה 02

כל ${validation.assets.length} קובצי ה־GLB עברו glTF Validator ${validation.validator} ללא שגיאות או אזהרות, גם כקובץ Draco וגם אחרי פענוח עצמאי. [דוח נכסים](validation.json) · [פלט דחוס](validation/compressed/) · [פלט מפוענח](validation/decoded/) · [דוח דפדפן](browser-validation.json).

## משקל וגאומטריה

KB/MB עשרוניים. התקרות הן 400,000 bytes לכל מודל גדול ו־2,500,000 bytes לכל התיקייה, לרבות מודלים, חוזים, תצוגות, כלים ודוחות. בפועל כל 18 המודלים קטנים גם מתקרת המודל הגדול. משקל כל ה־GLB: **${validation.glbBytes.toLocaleString('en-US')} bytes**. סיכום כל הקבצים, גיבובים ותקציב כולל: [package-budget.json](package-budget.json).

| מודל | bytes | משולשים | draw calls משוערים | שגיאות דחוס / מפוענח |
| --- | ---: | ---: | ---: | ---: |
${rows}

draw calls הם מספר ה־primitives המופיעים בסצנה, מעבר צבע יחיד, כל הרשתות גלויות, ללא צללים בזמן ריצה. דוח הדפדפן משווה אותם ואת מספר המשולשים ל־renderer.info של Three.js. culling עשוי להפחית קריאות; מעברי צל או חומרים נוספים בזמן שילוב עשויים להוסיף. אין מכך הבטחה לקצב פריימים בטלפון.

אין images/textures או משאבי URI חיצוניים ב־GLB. כל primitive דורש KHR_draco_mesh_compression. צבעים ו־AO אפוי ב־COLOR_0, כך שתקציב מרקמים עד 512px מתקיים ללא תמונות משטח. צילומי התצוגה אינם טקסטורות משחק.

## חוזים ובדיקות טלפון

- לכל נכס בעל מקבילה ב־models/ נבדקו כל שמות הרכיבים וכל מיקומי העוגנים בעולם מול authoring.json המקורי, בסבילות 0.00002 מ׳. השורש בראשית, ללא סיבוב ובקנה מידה 1.
- ${browser.results.length} בדיקות רינדור: שלוש הסביבות ב־390×844 וב־844×390, וכל 15 האביזרים בנפרד. ללא שגיאות דף/טעינה, גלישה אופקית או בקשות חיצוניות.
- ששת מבטי הטלפון בודקים גם סיבוב בגרירה שמשנה את תמונת הקנבס, ואיפוס שמחזיר את התמונה המקורית. צילום של כל כיוון נשמר ב־previews/; גיליון האביזרים ב־previews/props.webp.
- התצוגות משתמשות ב־GLB הסופי ובמפענח Draco המקומי של המאגר, עם תאורה זהה בשני כיווני הטלפון. נבדקו חזותית הפרקט והסימונים, לוח התוצאה התלוי, שתי קומות היציע, שערים, שולי השלג והאביזרים.
- בדיקת הדפדפן נעשתה ב־Chromium/SwiftShader עם deviceScaleFactor=1. זו אמולציית מידות מסך, ללא בדיקת מכשיר פיזי או FPS.

ה־Validator מציג הודעות מידע צפויות: unsupported extension עבור Draco בגרסת Validator זו, ו־empty node לעוגנים. לכן נוסף פענוח Draco עצמאי עם glTF Transform + Draco 1.5.7 ואימות מלא של ה־GLB המפוענח. לא הוסתרו אזהרות או שגיאות; הדוחות הגולמיים נשמרו.

## בדיקות המאגר

תוצאות npm test: עברו ${repository.fullSuite.pass}, נכשלו ${repository.fullSuite.fail}, דולגו ${repository.fullSuite.skipped}. הכשל שנותר שוחזר גם ב־checkout נקי ונפרד של main באותו קומיט; אין שינויים בקבצים שהבדיקות קוראות. [פירוט ההשוואה](validation/repository-checks.json):

${repository.baselineComparisons.map(x=>`- ${x.file}: קוד יציאה ${x.branch.exitCode} בענף ו־${x.main.exitCode} ב־main; ${x.summary}`).join('\n')}

הבדיקה מול Git מאשרת שכל קובצי ה־PR חדשים ותחת workout/island/design/models2/. אין שינוי בקבצים קיימים או בקוד המשחק. קובצי HTML/JS בתיקייה זו הם כלי תצוגת נכסים בלבד.
`;
await fs.writeFile(path.join(root,'VALIDATION.md'),md);
async function walk(folder){let files=[];for(const entry of await fs.readdir(folder,{withFileTypes:true})){
 const p=path.join(folder,entry.name);
 if(entry.isDirectory())files.push(...await walk(p));else if(p!==path.join(root,'package-budget.json')){
 const bytes=await fs.readFile(p);files.push({path:path.relative(root,p),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }}return files.sort((a,b)=>a.path.localeCompare(b.path));}
const files=await walk(root),subtotal=files.reduce((n,f)=>n+f.bytes,0);
const budget={allPassed:validation.allPassed&&browser.allPassed,limits:{largeModelBytes:400000,totalPackageBytes:2500000,maxRuntimeTexturePixels:512},glbBytes:validation.glbBytes,bytesExcludingThisReport:subtotal,thisReportBytes:0,totalPackageBytes:0,fileCountIncludingThisReport:files.length+1,files};
let output;
for(let i=0;i<10;i++){
 budget.totalPackageBytes=subtotal+budget.thisReportBytes;output=JSON.stringify(budget,null,2)+'\n';
 if(Buffer.byteLength(output)===budget.thisReportBytes)break;budget.thisReportBytes=Buffer.byteLength(output);
}
if(budget.totalPackageBytes>budget.limits.totalPackageBytes||validation.assets.some(x=>x.bytes>400000))throw Error('Package budget exceeded');
await fs.writeFile(path.join(root,'package-budget.json'),output);
console.log('PASS',budget.totalPackageBytes,'bytes including all',budget.fileCountIncludingThisReport,'files');
