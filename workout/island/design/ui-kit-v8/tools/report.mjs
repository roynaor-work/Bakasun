import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { root } from './server.mjs';
import { SIZES, touchMap, intersects } from '../runtime/layout.mjs';

const mapRows = [];
const latestRound = (await readdir(resolve(root, 'iterations'))).filter(name => /^\d{2}$/.test(name)).sort().at(-1);
for (const [width, height] of SIZES) {
  const map = touchMap(width, height);
  for (const target of map.targets) {
    const others = map.targets.filter(other => other.id !== target.id);
    if (others.some(other => intersects(target, other))) throw new Error('Touch map overlap');
    const values = ['x', 'y', 'width', 'height'].map(key => target[key].toFixed(2));
    mapRows.push(`| ${width}×${height} | ${target.id} | ${values.join(' | ')} | ללא חפיפה |`);
  }
}
await writeFile(resolve(root, 'TOUCH-MAP.md'), `# מפת אזורי המגע\n\nנוצרה ישירות מ־runtime/layout.mjs. קואורדינטות פיזיות ב־CSS pixels, ראשית בפינה השמאלית העליונה של תוכן הבמה. כאן safe-area אפס; בדיקות הדפדפן מכסות גם insets אסימטריים. המלבנים הם מעטפות שמרניות גם למטרות המעוגלות. כל מלבן נבדק מול כל האחרים, כולל תחום ההפעלה המלא של הג׳ויסטיק וההשהיה.\n\n| מסך | מטרה | x | y | רוחב | גובה | בדיקה |\n|---|---|---:|---:|---:|---:|---|\n${mapRows.join('\n')}\n\nהמפה החזותית זמינה בכפתור ״מפת מגע״ ב־index.html ובצילומי \`iterations/${latestRound}/*-map.png\`. ההוכחה לרווח המרכזי הרציף נמצאת ב־DESIGN.md; \`node --test\` מחשב מחדש את הגאומטריה.\n`);

const entries = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (relative(root, path) !== 'DELIVERY.md') entries.push({ path: relative(root, path), bytes: (await stat(path)).size });
  }
}
await walk(root);
const runtime = entries.filter(entry => entry.path.startsWith('runtime/'));
const hashes = await Promise.all(runtime.map(async entry => ({ ...entry, hash: createHash('sha256').update(await readFile(resolve(root, entry.path))).digest('hex') })));
const largest = [...entries].sort((a, b) => b.bytes - a.bytes).slice(0, 10);
const otherBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const runtimeBytes = runtime.reduce((sum, entry) => sum + entry.bytes, 0);
const israelTime = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
const build = ownBytes => `# מסירת החבילה ומשקלה\n\nעודכן: ${israelTime}, שעון ישראל. הסכום כולל את הדוח הזה וכל התוצרים, ללא צורך בארכיון.\n\n- סך החבילה: **${otherBytes + ownBytes} בתים** (${((otherBytes + ownBytes) / 1e6).toFixed(3)} MB מתוך 60 MB).\n- runtime לשימוש ישיר: **${runtimeBytes} בתים**, ${runtime.length} קבצים.\n- סך הקבצים: ${entries.length + 1}.\n- HTML התצוגה: ${entries.find(entry => entry.path === 'index.html').bytes} בתים.\n\n## הקבצים הגדולים\n\n| קובץ | בתים | KiB |\n|---|---:|---:|\n${largest.map(entry => `| [${entry.path}](${entry.path}) | ${entry.bytes} | ${(entry.bytes / 1024).toFixed(1)} |`).join('\n')}\n\n## קובצי הריצה\n\n| קובץ | בתים | SHA-256 |\n|---|---:|---|\n${hashes.map(entry => `| [${entry.path}](${entry.path}) | ${entry.bytes} | \`${entry.hash}\` |`).join('\n')}\n\nלשחזור: \`node tools/report.mjs\`. יש להפיק דוח סופי אחרי סיום בדיקת העמידות, כשהקבצים אינם מתעדכנים עוד. דוח בדיקות הקבלה והציונים נמצא ב־ACCEPTANCE.md.\n`;
let ownBytes = 0;
for (let pass = 0; pass < 8; pass++) {
  const actual = Buffer.byteLength(build(ownBytes));
  if (actual === ownBytes) break;
  ownBytes = actual;
}
await writeFile(resolve(root, 'DELIVERY.md'), build(ownBytes));
if (otherBytes + ownBytes > 60_000_000) throw new Error('Package exceeds 60 MB');
console.log(`Package: ${otherBytes + ownBytes} bytes; runtime: ${runtimeBytes} bytes; largest: ${largest[0].path} (${largest[0].bytes} bytes)`);
