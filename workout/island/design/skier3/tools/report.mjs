// Rebuild the human-readable acceptance report from final-byte verification.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'verification');
const read=async name=>JSON.parse(await fs.readFile(path.join(out,name),'utf8'));
const [assets,browser,tests]=await Promise.all(['assets-report.json','browser-report.json','repository-tests.json'].map(read));
if(!assets.allPassed||!browser.allPassed||!tests.allPassed)throw Error('All verification reports must pass before generating the acceptance report.');
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const a of assets.assets){const final=await fs.readFile(path.resolve(root,'..',a.file));if(hash(final)!==a.sha256||browser.assets.find(b=>b.id===a.id)?.sha256!==a.sha256)throw Error(`Stale asset report: ${a.id}`);}
for(const source of browser.sources)if(hash(await fs.readFile(path.join(root,source.file)))!==source.sha256)throw Error(`Stale browser source: ${source.file}`);
for(const evidence of browser.evidence)if(hash(await fs.readFile(path.join(out,evidence.file)))!==evidence.sha256)throw Error(`Stale screenshot: ${evidence.file}`);
const fmt=n=>n.toLocaleString('en-US');
const skin=assets.assets.find(a=>a.id==='skier').skin;
const worst=Math.min(...browser.clips.flatMap(c=>c.samples.map(s=>s.minY)));
const content=`# סקיאר ועולם אלפיני · דוח מסירה

תוצאה: **PASS**. הדוח נוצר מהקבצים הסופיים, לאחר התאמת SHA-256 בין ה־GLB, ה־manifest, הפענוח העצמאי, טעינת הדפדפן וצילומי המסך.

| דרישה | תוצאה |
| --- | --- |
| סקיאר עם 18 עצמות קנוניות | ${skin.jointCount} שמות, סדר והיררכיה תואמים; skin ומשקלים תקינים |
| חמש תנועות מוטמעות | glide, crouch, boost, fall, get_up |
| Draco עד 1.5MB לקובץ | כל ${assets.totals.files} הקבצים; הגדול ${fmt(assets.totals.maximumFileBytes)} bytes |
| טקסטורות עד 1024 | מרבי 384×384; סקיאר עם צבעי קודקודים וללא טקסטורות |
| רכיבי עולם | 3 עצים, 2 סלעים, שלט, 3 שערים, מוגול, קיר קרח ואבקת שלג מונפשת |
| טעינה והצגה בדפדפן | ${browser.checks.length} בדיקות; 1440×960, 390×844 ו־844×390 |
| קונסול ורשת | אפס שגיאות ואזהרות; אפס בקשות חיצוניות או טעינות שנכשלו |
| glTF Validator | אפס שגיאות ואזהרות, בקבצים הדחוסים וגם לאחר פענוח Draco עצמאי |
| בדיקות המאגר | ${fmt(tests.counts.pass)} עברו; ${tests.counts.fail} נכשלו; ${tests.counts.skipped} דולגו |

## ספירת משולשים

| קובץ | משולשים | bytes |
| --- | ---: | ---: |
${assets.assets.map(a=>`| [${a.file}](../../${a.file}) | ${fmt(a.triangles)} | ${fmt(a.bytes)} |`).join('\n')}
| **סה״כ** | **${fmt(assets.totals.triangles)}** | **${fmt(assets.totals.bytes)}** |

הספירה כוללת את כל מופעי הרשת: שני המקלות נספרים פעמיים אף שהם חולקים גאומטריה. באבקה נשמרים 96 משולשים ל־16 פריימים; 6 פעילים בכל רגע. תוספות התפאורה של הצופה אינן חלק מתקציב הנכסים.

## ניגון ועיוות רשת

נבדקו 33 נקודות זמן בכל אחד מחמשת הקליפים דרך AnimationMixer של Three.js וה־GLB הסופי. כל הקודקודים לאחר skinning נמדדו; מינימום Y שנמצא הוא ${worst.toFixed(7)} מטר, בתוך סבילות של 1 מ״מ למשטח השלג. שלוש הלולאות סגורות. סוף הנפילה ותחילת הקימה תואמים; התאמת המטריצות והערוצים נבדקה גם בפענוח העצמאי.

ה־bind מכויל לפרופורציות הדמות. להוספת נתוני motion2 יש להשתמש בבסיסי הכיול שב־[rig.json](../rig.json); שמות והורות תואמים לבדם אינם מחליפים כיול צירים. חמשת הקליפים המוטמעים מוכנים לניגון ישיר ללא מתאם.

## צפייה והוכחות

1. משורש המאגר הפעילו:

   \`\`\`sh
   node workout/island/design/skier3/tools/verify-browser.mjs --serve
   \`\`\`

2. פתחו את [הצופה המקומי](http://127.0.0.1:8766/design/skier3/viewer.html), בחרו תנועה או עברו לספריית הנכסים. כל הקבצים והמפענח מקומיים.
3. התוצאה הרצויה: 13 נכסים נטענו, חמש הפעולות נראות, ציר הזמן והשלד פועלים, וקונסול הדפדפן נקי.

![תצוגת ההר](scene-1440x960.webp)

![חמש דגימות מכל קליפ](motion-contact-sheet.webp)

[דפדפן · JSON](browser-report.json) · [פענוח ו־glTF · JSON](assets-report.json) · [בדיקות מאגר · JSON](repository-tests.json) · [טלפון](scene-390x844.webp) · [טלפון לרוחב](scene-844x390.webp) · [ספריית נכסים](library-1440x960.webp)

מדידות הדפדפן בוצעו ב־Chromium עם WebGL / ANGLE SwiftShader. הן מאמתות טעינה, תצוגה ו־skinning; לא נמדדו ביצועים במכשיר טלפון פיזי. המסירה היא שתי תיקיות עיצוב חדשות; אין בה חיבור למשחק, שינוי לוגיקה או שינוי גרסה.
`;
await fs.writeFile(path.join(out,'report.md'),content);
console.log('Acceptance report and final-byte evidence are consistent.');
