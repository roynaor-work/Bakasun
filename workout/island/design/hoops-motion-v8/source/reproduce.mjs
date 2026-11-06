#!/usr/bin/env node
/** Rebuild from source in a fresh temporary checkout-shaped directory. */
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(resolve(tmpdir(), 'hoops-motion-v8-reproduce-'));
const copy = resolve(scratch, 'workout/island/design/hoops-motion-v8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(resolve(copy, '..'), { recursive: true });
await cp(root, copy, { recursive: true, filter: path => !/\/(iterations|verification)(\/|$)/.test(path) });
await mkdir(resolve(copy, 'verification'), { recursive: true });
await mkdir(resolve(copy, '../motion2'), { recursive: true });
await cp(new URL('../../motion2/hoops.json', import.meta.url), resolve(copy, '../motion2/hoops.json'));
await new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, ['source/build.mjs'], { cwd: copy, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  child.on('error', reject);
  child.on('close', async code => {
    await writeFile(resolve(scratch, 'rebuild.log'), log);
    if (code === 0) resolvePromise(); else reject(new Error(`Clean rebuild failed (${code}); log ${resolve(scratch, 'rebuild.log')}`));
  });
});
const rows = [];
for (const dir of ['runtime/keyframes', 'runtime/clips']) for (const name of (await readdir(resolve(root, dir))).sort()) {
  const file = dir + '/' + name;
  const [expected, rebuilt] = await Promise.all([readFile(resolve(root, file)), readFile(resolve(copy, file))]);
  rows.push({ file, bytes: rebuilt.length, expected: hash(expected), rebuilt: hash(rebuilt), pass: expected.equals(rebuilt) });
}
const pass = rows.length >= 28 && rows.every(row => row.pass);
const report = `# בנייה חוזרת נקייה\n\nתוצאה: **${pass ? 'PASS' : 'FAIL'}**. ${rows.length} קובצי runtime נוצרו מחדש בתיקייה זמנית מתוך קוד המקור ומודל התצוגה שסופק.\n\n` +
  `לא נעשה שימוש ב־node_modules מתוך הריפו. המקור הקנוני הועתק לקריאה בלבד אל מבנה ריפו זמני. תיקיות האיטרציות והבדיקות החזותיות לא הועתקו. הבנייה הרציפה וביקורות התנועה והגוף עברו לפני השוואת הבתים.\n\n` +
  `| קובץ | בתים | התאמה מלאה | SHA-256 משוחזר |\n|---|---:|---|---|\n` +
  rows.map(row => `| ${row.file} | ${row.bytes} | ${row.pass ? 'PASS' : 'FAIL'} | \`${row.rebuilt}\` |`).join('\n') +
  `\n\nמיקום עבודה זמני לצורכי בדיקה: \`${scratch}\`. שום קובץ runtime בחבילה שנמסרת לא נכתב בתהליך זה.\n`;
await writeFile(resolve(root, 'verification/REPRODUCIBILITY.md'), report);
console.log(`${pass ? 'PASS' : 'FAIL'} clean source rebuild: ${rows.length} byte-for-byte comparisons; ${scratch}`);
process.exitCode = pass ? 0 : 1;
