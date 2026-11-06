#!/usr/bin/env node
import { readdir, readFile, lstat, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';

export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const limits = Object.freeze({ packageBytes: 60_000_000, fileBytes: 5_000_000, glbBytes: 1_500_000, htmlBytes: 25_000 });
const forbidden = new Set(['.json', '.zip', '.tar', '.mp4', '.webm', '.mov', '.avi', '.mkv']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = resolve(dir, entry.name);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic link is not a self-contained asset: ${absolute}`);
    if (stat.isDirectory()) result.push(...await walk(absolute));
    else if (stat.isFile()) result.push({ absolute, path: relative(packageRoot, absolute).replaceAll('\\', '/'), bytes: stat.size });
    else throw new Error(`Unsupported file type: ${absolute}`);
  }
  return result;
}

export async function inspectPackage() {
  const files = await walk(packageRoot);
  const errors = [];
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total > limits.packageBytes) errors.push(`Package ${total} exceeds ${limits.packageBytes} bytes`);
  const rounds = [...new Set(files.map(f => /^iterations\/(\d+)\//.exec(f.path)?.[1]).filter(Boolean))].sort();
  if (rounds.length > 2) errors.push(`Only the latest and previous render directories may remain: ${rounds.join(', ')}`);
  for (const file of files) {
    const extension = extname(file.path).toLowerCase();
    if (forbidden.has(extension)) errors.push(`Forbidden raw JSON, archive, or video: ${file.path}`);
    const cap = extension === '.glb' ? limits.glbBytes : extension === '.html' ? limits.htmlBytes : limits.fileBytes;
    if (file.bytes > cap) errors.push(`${file.path}: ${file.bytes} bytes exceeds ${cap}`);
    if (file.path.startsWith('runtime/')) {
      const bytes = await readFile(file.absolute);
      if (extension === '.glb' && (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)) errors.push(`Invalid GLB header: ${file.path}`);
      if (file.path.endsWith('.json.gz') && (bytes[0] !== 0x1f || bytes[1] !== 0x8b)) errors.push(`Invalid gzip header: ${file.path}`);
      if (extension === '.mjs' || extension === '.js') {
        const source = bytes.toString('utf8');
        if (/\b(?:import\s*(?:[^;]*?\sfrom\s*)?|export\s+[^;]*?\sfrom\s*)["']https?:\/\//.test(source)) errors.push(`Remote runtime module import: ${file.path}`);
      }
    }
  }
  const glbs = files.filter(f => /^runtime\/clips\/.+\.glb$/.test(f.path));
  const keyframes = files.filter(f => /^runtime\/keyframes\/.+\.json\.gz$/.test(f.path));
  if (glbs.length < 14 || glbs.length !== keyframes.length) errors.push(`Expected matching 14+ GLBs / keyframe files; found ${glbs.length}/${keyframes.length}`);
  const keyIds = new Set(keyframes.map(f => f.path.split('/').at(-1).replace('.json.gz', '')));
  for (const file of glbs) if (!keyIds.has(file.path.split('/').at(-1).replace('.glb', ''))) errors.push(`Missing keyframes for ${file.path}`);
  return { pass: errors.length === 0, errors, total, limits, rounds, files, glbs: glbs.length, keyframes: keyframes.length };
}

export async function inventoryMarkdown(report) {
  const runtime = report.files.filter(f => f.path.startsWith('runtime/'));
  const hashes = [];
  for (const file of runtime) hashes.push({ ...file, sha256: createHash('sha256').update(await readFile(file.absolute)).digest('hex') });
  return `# מצאי החבילה\n\nתוצאה: ${report.pass ? 'PASS' : 'FAIL'}. ${report.total.toLocaleString('en-US')} בתים בכל החבילה בזמן הבדיקה; ` +
    `${runtime.reduce((n, f) => n + f.bytes, 0).toLocaleString('en-US')} בתים בתיקיית runtime.\n\n` +
    `מגבלות בבתים עשרוניים: חבילה ≤60,000,000; קובץ רגיל ≤5,000,000; כל GLB ≤1,500,000; HTML ≤25,000.\n\n` +
    `קליפים: ${report.glbs} GLB ו־${report.keyframes} קובצי JSON דחוסים. תיקיות הרנדר השמורות: ${report.rounds.join(', ')}.\n\n` +
    `המצאי עצמו משנה מעט את גודל החבילה. בדיקת node --test קוראת את הגודל בפועל.\n\n` +
    `| קובץ | בתים | SHA-256 |\n|---|---:|---|\n` +
    hashes.map(f => `| \`${f.path}\` | ${f.bytes} | \`${f.sha256}\` |`).join('\n') + '\n' +
    (report.errors.length ? `\nכשלים:\n\n${report.errors.map(e => `- ${e}`).join('\n')}\n` : '');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const report = await inspectPackage();
  if (process.argv.includes('--write')) await writeFile(new URL('../verification/INVENTORY.md', import.meta.url), await inventoryMarkdown(report));
  console.log(`${report.pass ? 'PASS' : 'FAIL'} ${report.total} bytes; ${report.glbs} GLBs / ${report.keyframes} gzip keyframes; rounds ${report.rounds.join(', ')}`);
  for (const file of [...report.files].sort((a, b) => b.bytes - a.bytes).slice(0, 8)) console.log(`${file.bytes.toString().padStart(8)} ${file.path}`);
  for (const error of report.errors) console.error(error);
  process.exitCode = report.pass ? 0 : 1;
}
