import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(root,'../../../..'),prefix=path.relative(repo,root).replaceAll(path.sep,'/')+'/';
const json=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const manifest=await json('manifest.json'),assets=await json('verification/assets.json'),runtime=await json('verification/runtime.json'),browser=await json('verification/browser.json'),tests=await json('verification/repository-tests.json');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const preview=await fs.readFile(path.join(root,'preview.html'));
assert(assets.passed&&runtime.passed&&browser.passed&&tests.passed);
assert.equal(browser.previewSha256,sha(preview),'Browser evidence must match the final standalone HTML');
assert.equal(assets.summary.models,37);assert.equal(assets.summary.khronosErrors,0);assert.equal(assets.summary.khronosWarnings,0);
assert.deepEqual([...new Set(assets.models.flatMap(m=>m.khronos.messages.map(m=>m.code)))],['NODE_EMPTY']);
const branch=execFileSync('git',['branch','--show-current'],{cwd:repo,encoding:'utf8'}).trim();
assert.equal(branch,'codex/racing-customize-v1');
const statuses=execFileSync('git',['status','--porcelain=v1','-uall'],{cwd:repo,encoding:'utf8'}).trimEnd().split('\n').filter(Boolean);
for(const status of statuses){assert(status.slice(3).startsWith(prefix),`Out-of-scope change: ${status}`);assert(!/^.[MD]|^[MD]/.test(status),`Existing file modified: ${status}`);}
const base=execFileSync('git',['merge-base','HEAD','origin/main'],{cwd:repo,encoding:'utf8'}).trim();
const diff=execFileSync('git',['diff','--name-status',base],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const entry of diff){const [kind,name]=entry.split('\t');assert.equal(kind,'A');assert(name.startsWith(prefix));}
async function walk(dir){let out=[];for(const item of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);out.push(...(item.isDirectory()?await walk(p):[p]));}return out.sort();}
const upgrades=assets.models.filter(m=>!m.file.includes('/base/'));
const maxUpgrade=Math.max(...upgrades.map(m=>m.bytes)),minTris=Math.min(...upgrades.map(m=>m.triangles)),maxTris=Math.max(...upgrades.map(m=>m.triangles));
const description=`# חנות שדרוגי פורמולה — דוח מסירה

הושלמה חבילת 58 פריטי עיצוב לרכב הפורמולה הקיים, עם תצוגת חנות אינטראקטיבית, התקנה על הרכב, שתי שכבות צבע, שמירה מקומית והורדה לאופליין.

תאריך מסירה: 17.11.2026. ענף: \`${branch}\`. בסיס העבודה: \`${base}\`.

כל הקבצים חדשים ורק בתוך \`workout/island/design/racing-customize-v1/\`. לא נערכו קובצי משחק, שמירה, גרסה או חדר בקרה קיימים. ההנחיה במשימה להגבלת התיקייה גוברת כאן על נוהל עדכון קובץ חדר הבקרה. קריטריון הסיום: כל 58 הפריטים, חיבור מדויק לרכב, אייקונים, תצוגה מקומית, רישיונות, נפח מתחת ל־8MB, אימות נקי ודחיפת הענף.

## פתיחה ובדיקה

1. פתחו את [preview.html](preview.html), שמכיל את כל משאבי התצוגה. בחרו קטגוריה ופריט; השינוי נראה מייד על הרכב. גרירה מסובבת את המבט; גלילה מקרבת.
2. בקטגוריית הצבעים בחרו גוף או פסים. כל אחת מעשר הדוגמיות זמינה לכל שכבה, ובסך הכול 100 שילובים עצמאיים.
3. לחצו על ״שמור עיצוב״ לשמירת הבחירה במכשיר, או על ״הורדה לאופליין״ לקבלת קובץ תצוגה עצמאי אחד.

תוצאה רצויה: החלפת פריט אחד אינה מכפילה חלקים, הפס נשאר עצמאי מצבע הגוף, והקובץ שהורד ממשיך לפעול ללא רשת. זו חנות קטלוג מבודדת; חיבור לרכישת פריטים בכסף המשחק נותר לשלב החיבור, בלי מחירים או חיובים מומצאים.

![תצוגת 844×390](verification/preview-844x390.jpg)

## מה נמסר

| קטגוריה | כמות | תוצר |
| --- | ---: | --- |
| כנפיים קדמיות | 8 | דגמי GLB בעלי פרופילי כנף, שכבות, הטיות ולוחות קצה שונים |
| כנפיים אחוריות | 8 | כנף נמוכה, גבוהה, מסגרת, תמיכות ברבור, כנף חצויה ועוד |
| גלגלים | 6 | חמישה חישורים, טורבינה, רשת, דיסק אוויר, חישורים כפולים, מסלול רטוב |
| מדבקות | 12 | 4 פסים, 4 כוכבים, 4 להבות; SVG שקוף 512×512, בלי כיתוב |
| צבעי רכב | 10 | גוף ופסים נפרדים; דוגמיות צבע וערכי חומר במניפסט |
| אביזרי אפקט | 6 | שני סוגי להבה, שני סוגי ניצוצות ושני סוגי עשן צבעוני; GLB עם שני פולטים ונתוני אפקט |
| קסדות | 8 | מעטפת ומשקף, עם הבדלי צבע, סנפיר, רכס, אוורור וצורה |

לכל פריט קובץ SVG נפרד בגודל 96×96 ושיוך קטגוריה במניפסט; בנוסף שבעה אייקוני קטגוריות. בסך הכול 37 קובצי GLB: ‏36 שדרוגים והעתק רכב בסיס מקומי עם ארבעה צמתי חיבור נוספים. המקור נשאר ללא שינוי. טווח השדרוגים: ${minTris.toLocaleString('en-US')}–${maxTris.toLocaleString('en-US')} משולשים לדגם; הרכב המקורי עצמו כולל 11,868 משולשים.

## נפח ותלויות

| רכיב | בתים |
| --- | ---: |
| כל החבילה, כולל מקור, בדיקות וצילומים | **TOTAL_BYTES** |
| תצוגה עצמאית יחידה | ${preview.length.toLocaleString('en-US')} |
| כל 37 קובצי ה־GLB | ${assets.summary.modelBytes.toLocaleString('en-US')} |
| GLB שדרוג הגדול ביותר | ${maxUpgrade.toLocaleString('en-US')} |
| רכב הבסיס עם צמתי חיבור | ${assets.models.find(m=>m.file.includes('/base/')).bytes.toLocaleString('en-US')} |

המגבלה היא 8,000,000 בתים, לפי MB עשרוני. אין WASM, ‏Draco, ‏meshopt, ‏KTX2, שרת נכסים, CDN, גופנים חיצוניים או שירות ענן. כל גאומטריית ה־GLB בלתי דחוסה; הצבעים הם חומרי PBR. רישיון Three המלא משובץ גם בקובץ התצוגה שמורידים. מדיניות התצוגה חוסמת תקשורת רשת.

## התאמה לרכב

התאימות נבדקה מול רכב השחקן המקורי שבענף הראשי, באמצעות חתימת מקור ומיקומי הצמתים. [manifest.json](manifest.json) מגדיר את החיבורים, ההחלפות, צירי הגלגלים, הגדלת הגלגלים האחוריים והקרנת המדבקות. [INTEGRATION.md](INTEGRATION.md) כולל דוגמה מעשית עם המודולים המקומיים.

יש להשתמש בסצנה המקורית לפני \`mergeFormula\` במשחק: המיזוג הקיים מאחד חלקים סטטיים, מוחק את שמות הכנפיים והקסדה ועובר גם על חלקים מוסתרים. בעת החיבור יש לדלג עליו עבור הרכב המותאם, או להחריג ממנו חלקים מתחלפים ומקורות מוסתרים. מתאם החבילה מזהה את הסצנה המקורית, מסתיר רק את החלק המוחלף ומשחזר אותו בסיום. המודלים הקלים של היריבים, הקופה והרכב החלופי אינם מסומנים כתואמים. אין שינוי בפיזיקה, בסרנים, במטבעות או בשמירות המשחק.

## אימות

| בדיקה | תוצאה | ראיות |
| --- | --- | --- |
| מאמת Khronos | 37 דגמים, **0 שגיאות, 0 אזהרות** | [assets.json](verification/assets.json) |
| בדיקות נכסים | ${assets.checks} בדיקות: ספירות, חתימות, SVG, גבולות, נורמלים, משולשים וצמתים | אותו דוח |
| טעינה וחיבור | ${runtime.checks} בדיקות, כולל GLTFLoader רגיל ללא מפענחים | [runtime.json](verification/runtime.json) |
| ממשק ודפדפן | ${browser.checks} בדיקות ועוד 100 שילובי צבעים | [browser.json](verification/browser.json) |
| רשת | 0 בקשות נכסים, 0 בקשות חיצוניות; 0 בקשות HTTP בהעתק שהורד | אותו דוח |
| החלפות חוזרות | 60 החלפות נוספות; שמונה מופעי שדרוג מחוברים לאורך כל הבדיקה | אותו דוח |
| בדיקות המאגר | ${tests.tests.toLocaleString('en-US')} בדיקות; ${tests.pass.toLocaleString('en-US')} עברו, ${tests.fail} נכשלו, ${tests.skipped} דולגו | [repository-tests.json](verification/repository-tests.json) |
| היקף Git | כל השינויים הם הוספות בתיקייה החדשה בלבד | [delivery.json](verification/delivery.json) |

הודעות המידע היחידות של Khronos הן \`NODE_EMPTY\`: צמתי חיבור ופליטה ריקים במכוון. אין חומר לא בשימוש. טעינה בפועל נבדקה גם עם GLTFLoader של Three, ללא התקנת מפענח כלשהו.

בדיקות הממשק כוללות כל פריט, שתי שכבות הצבע, שמירה וטעינה מחדש, התאוששות משמירה פגומה, ניווט מקלדת, סיבוב מבט, כיבוי אפקטים, תנועה מופחתת, שתי אוריינטציות והורדה. מסמך ההורדה נפתח מחדש בהקשר אופליין נקי עם שבע קטגוריות ובלי שכפול ממשק.

## ביקורת חזותית

התצוגה נבדקה במידות 844×390 ו־390×844. לוחות ההשוואה מציגים כל דגם מורכב על הרכב בפועל; לא רק את האייקונים. נבדקו חזית, אחור, צמיגים, קסדות ואביזרי אפקט. הלהבה כוללת ליבה רציפה ושכבה חיצונית, הניצוצות הם קווים קצרים, והעשן משתמש בחלקיקים רכים וצבעוניים. הגימור האחרון נבדק שוב בדפדפן.

- [8 כנפיים קדמיות](verification/sheet-front-wings.jpg)
- [8 כנפיים אחוריות](verification/sheet-rear-wings.jpg)
- [6 גלגלים](verification/sheet-wheels.jpg)
- [8 קסדות](verification/sheet-helmets.jpg)
- [6 אביזרי אפקט](verification/sheet-effects.jpg)
- [מדבקות](verification/category-decals.jpg), [צבעים](verification/category-paints.jpg), [תצוגת אורך](verification/preview-390x844.jpg)

## גבולות האימות

סביבת הבדיקה היא Chromium עם SwiftShader במחשב Linux, ולא טלפון פיזי; אין הצהרת קצב פריימים לטלפון. מדיניות הדפדפן במכונה חוסמת ניווט ישיר לכתובות \`file://\`. לכן נבדקו התוכן המדויק של הקובץ העצמאי והקובץ שהורד במסמך מבודד כשכל הרשת מנותקת; ניווט קובץ ישיר לא מסומן כבדיקה שעברה.

רישיונות ומקורות ב־[LICENSES.md](LICENSES.md); הוראות שחזור ב־[source/README.md](source/README.md). מלאי SHA-256 ב־[verification/files.csv](verification/files.csv), למעט קובץ המלאי עצמו ודוח המסירה שמכיל את חתימתו.
`;
let total=0;
for(let pass=0;pass<8;pass++){
  await fs.writeFile(path.join(root,'REPORT.md'),description.replace('TOTAL_BYTES',total.toLocaleString('en-US')));
  const paths=await walk(root),records=[];
  for(const file of paths){const relative=path.relative(root,file).replaceAll(path.sep,'/');if(['verification/files.csv','verification/delivery.json'].includes(relative))continue;
    const blob=await fs.readFile(file);records.push({file:relative,bytes:blob.length,sha256:sha(blob)});}
  const csv='file,bytes,sha256\n'+records.map(r=>`${r.file},${r.bytes},${r.sha256}`).join('\n')+'\n';
  await fs.writeFile(path.join(root,'verification/files.csv'),csv);
  const delivery={passed:true,branch,baseCommit:base,allowedDirectory:prefix,additionsOnly:true,
    allFileCount:records.length+2,totalBytes:total,maxBytes:8000000,
    manifestSha256:sha(await fs.readFile(path.join(root,'manifest.json'))),previewSha256:sha(preview),inventorySha256:sha(csv),
    excludedFromInventory:['verification/files.csv','verification/delivery.json'],
    evidence:{khronosModels:37,khronosErrors:0,khronosWarnings:0,assetChecks:assets.checks,runtimeChecks:runtime.checks,browserChecks:browser.checks,
      colourCombinations:100,repositoryTests:tests.tests,repositoryFailures:tests.fail}};
  await fs.writeFile(path.join(root,'verification/delivery.json'),JSON.stringify(delivery,null,2)+'\n');
  const all=await walk(root),next=(await Promise.all(all.map(async p=>(await fs.stat(p)).size))).reduce((a,b)=>a+b,0);
  assert(next<8000000);
  assert(!all.some(p=>/\.(?:wasm|ktx2|drc)$/.test(p)));
  if(next===total){console.log(JSON.stringify({passed:true,files:all.length,totalBytes:total,branch}));break;}
  total=next;assert(pass<7,'Size inventory failed to converge');
}
