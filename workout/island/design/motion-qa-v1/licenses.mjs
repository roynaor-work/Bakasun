// SPDX-License-Identifier: CC0-1.0 — original per-file provenance inventory.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import path, {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const base=dirname(fileURLToPath(import.meta.url));
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='.cache')continue;const p=join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
export async function writeLicenses(report=undefined){
report??=JSON.parse(await readFile(join(base,'output/report.json'),'utf8'));
const byPath=new Map();for(const l of report.libraries)for(const c of l.clips)for(const key of ['htmlPath','jsonPath','sheetPath'])byPath.set(`output/${c[key]}`,l);
const sourceUrl=l=>`https://github.com/roynaor-work/Bakasun/tree/${l.source.commit}/${l.source.path}`;
const rows=(await walk(base)).map(p=>relative(base,p)).concat('LICENSES.md').filter((p,i,a)=>a.indexOf(p)===i).sort().map(p=>{
 const l=byPath.get(p);const source=l?`תוצר אבחוני מקורי, מחושב מ־[${l.id} @ ${l.source.commit.slice(0,12)}](${sourceUrl(l)})`:'יצירה מקורית למשימה זו; קוד, תיעוד או מדידות של כלי QA';
 return `| ${p} | CC0-1.0 | ${source} |`;
});
await writeFile(join(base,'LICENSES.md'),`# רישיונות ומקור לכל קובץ\n\nכל קובץ חדש בחבילה זו נוצר במיוחד למשימה ומשוחרר לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). במידה המותרת בחוק, המחבר מוותר על זכויות היוצרים והזכויות הנלוות בקבצים המקוריים האלה. אין מותגים, תמונות אנשים אמיתיים או נכסי מדיה חיצוניים.\n\nנתוני המקור המקוריים של ספריות התנועה הם CC0-1.0 לפי רישיונות הספריות. הם נקראים מהקומיטים הנעולים ואינם מועתקים לחבילת המסירה. המטמון המקומי, שאינו ב־Git, שומר אותם כפי שהם. מודול ההתאמה של הדמויות הגבוהות נשאר במטמון עם רישיון המקור שלו. תוצרים מחושבים משמרים את מקורם בטבלה וב־output/report.json, הכולל SHA-256 וגודל לכל קובץ קלט.\n\nתלות קיימת בלבד: [three.js המקומי](../soccer-motion-v8/runtime/vendor/three.module.js), רישיון [MIT הקיים](../soccer-motion-v8/runtime/vendor/LICENSE.three), מקור [three.js r160](https://github.com/mrdoob/three.js/tree/r160). הקובץ לא נוסף, שונה, הועתק או נטען מ־CDN; הזכויות נשארות של מחבריו. אין בחבילה קובץ חדש ברישיון MIT.\n\nPlaywright ו־Chromium שימשו מחוץ למאגר לאימות בלבד ואינם תלות בכלי או קבצים חדשים בחבילה. תמונות גיליונות הפריימים הן SVG מקורי מהשלד הנמדד, ללא צילום רשת או מרקם מוגן.\n\nלשחזור הרישום לאחר הפקה:\n\n\`\`\`sh\nnode workout/island/design/motion-qa-v1/licenses.mjs\n\`\`\`\n\n| קובץ | רישיון | מקור |\n|---|---|---|\n${rows.join('\n')}\n`);
return rows.length;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Licensed ${await writeLicenses()} individual files`);
