#!/usr/bin/env node
// Builds store/www: the web folder the store apps (Capacitor) package.
//  1. runs .github/scripts/stage-pages.py (public runtime files only) and takes workout/island from its output;
//  2. fixes every read of the URL query to one constant (STORE_SEARCH) in the COPY, so no experiment flag can switch anything;
//  3. applies the listed transforms (offline worker off);
//  4. checks the result and writes store/FLAGS.md (what was removed, what stays, why).
// The live site and the source files are never changed.
//
// Usage: node store/scripts/build-web.mjs [--slim]   (run from anywhere)
//   --slim keeps only the files listed in offline-manifest.json (111 MB instead of about 194 MB). Default: everything stage-pages.py publishes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanFlags, classify, defaultOf, walk, SKIP_DIRS, DESIGN_PAGES } from './flags.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.resolve(HERE, '..');
const REPO = path.resolve(STORE, '..');
const WWW = path.join(STORE, 'www');
const policy = JSON.parse(fs.readFileSync(path.join(STORE, 'flag-policy.json'), 'utf8'));

const pin = new URLSearchParams(policy.pin || {}).toString();
const STORE_SEARCH = pin ? `?${pin}` : '';
// every way the code reaches the page query: globalThis.location?.search, location.search, win?.location?.search, doc.defaultView?.location?.search
const SEARCH_READ = /(?:[A-Za-z_$][\w$]*(?:\(\))?\s*(?:\?\.|\.)\s*)*location\s*(?:\?\.|\.)\s*search\b/g;
const LOCATION_REF = /\blocationRef\s*\.\s*search\b/g;
const keepQuery = (rel) => (policy.keepQueryDirs || []).some((d) => rel.startsWith(d));

function stage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-stage-'));
  const dest = path.join(tmp, 'pages');
  execFileSync('python3', [path.join(REPO, '.github/scripts/stage-pages.py'), dest], { cwd: REPO, stdio: 'inherit' });
  return { tmp, island: path.join(dest, 'workout/island') };
}

function rewrite(root) {
  let files = 0;
  let reads = 0;
  const changed = [];
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel.startsWith('vendor/') || keepQuery(rel)) continue;
    let text = fs.readFileSync(file, 'utf8');
    let n = 0;
    const constant = JSON.stringify(STORE_SEARCH).replace(/"/g, "'");
    const next = text.replace(SEARCH_READ, () => { n++; return constant; }).replace(LOCATION_REF, () => { n++; return constant; });
    if (n) {
      fs.writeFileSync(file, next);
      files++;
      reads += n;
      changed.push(file);
    }
  }
  return { files, reads, changed };
}

function transforms(root) {
  const done = [];
  for (const t of policy.transforms) {
    const file = path.join(root, t.file);
    const text = fs.readFileSync(file, 'utf8');
    const count = text.split(t.from).length - 1;
    if (count !== t.count) throw new Error(`transform ${t.id}: expected ${t.count} match in ${t.file}, found ${count}`);
    fs.writeFileSync(file, text.split(t.from).join(t.to));
    done.push(t);
  }
  return done;
}

// Links that leave the app (GitHub, creativecommons.org) are not allowed in a children's app without a parent gate.
// In the copy they become plain text; the address stays visible as text so the credit is complete.
function plainExternalLinks(root) {
  let n = 0;
  for (const file of walk(root)) {
    if (!file.endsWith('.html')) continue;
    const text = fs.readFileSync(file, 'utf8');
    const next = text.replace(/<a\b[^>]*\bhref=(["'])https?:\/\/([^"']*)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, _q, url, inner) => { n++; return `<span>${inner} (<bdi dir="ltr">${url}</bdi>)</span>`; });
    if (next !== text) fs.writeFileSync(file, next);
  }
  return n;
}

// --slim: keep only what offline-manifest.json lists (the island's own list of what it needs), plus licence notices and credits.
const NOTICE_NAME = /^(licen[cs]es?|licen[cs]e\..*|licen[cs]es\..*|notice.*|ofl.*|copying.*|dedication.*)$/i;
function slim(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'offline-manifest.json'), 'utf8'));
  const keep = new Set([...manifest.core, ...manifest.shell, ...Object.values(manifest.games).flat()].filter(Boolean));
  for (const extra of ['index.html', 'manifest.webmanifest', 'release.json', 'release.mjs', 'offline-manifest.json', 'credits.html']) keep.add(extra);
  const dirs = new Set();
  for (const rel of keep) { let d = path.posix.dirname(rel); while (d && d !== '.') { dirs.add(d); d = path.posix.dirname(d); } }
  let removed = 0;
  let removedBytes = 0;
  for (const entry of fs.readdirSync(root, { recursive: true })) {
    const rel = String(entry).split(path.sep).join('/');
    const full = path.join(root, rel);
    if (!fs.statSync(full).isFile()) continue;
    if (keep.has(rel)) continue;
    if (NOTICE_NAME.test(path.posix.basename(rel)) && dirs.has(path.posix.dirname(rel))) continue;
    removedBytes += fs.statSync(full).size;
    fs.rmSync(full);
    removed++;
  }
  // drop empty folders
  const prune = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) { prune(path.join(dir, e.name)); if (!fs.readdirSync(path.join(dir, e.name)).length) fs.rmdirSync(path.join(dir, e.name)); } };
  prune(root);
  return { removed, removedBytes };
}

// every module the build touched must still parse (a replaced expression inside a string or a template breaks the file)
function syntaxCheck(files) {
  const bad = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-syntax-'));
  for (const file of files) {
    if (/\.html$/.test(file)) continue;
    const copy = path.join(tmp, 'check.mjs');
    fs.copyFileSync(file, copy);
    try { execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' }); } catch (error) { bad.push(`${path.relative(WWW, file)}: ${String(error.stderr).split('\n').find((l) => /Error/.test(l)) || 'syntax error'}`); }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return bad;
}

function verify(root, flags) {
  const problems = [];
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel.startsWith('vendor/') || rel === 'offline-sw.js' || keepQuery(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/location\s*(?:\?\.|\.)\s*search\b/.test(text) || /\blocationRef\s*\.\s*search\b/.test(text)) problems.push(`${rel}: still reads location.search`);
    if (/location\s*(?:\?\.|\.)\s*hash\b/.test(text) && !DESIGN_PAGES.test(rel)) problems.push(`${rel}: reads location.hash (check by hand)`);
    if (!DESIGN_PAGES.test(rel) && /document\s*\.\s*URL\b|location\s*\.\s*href[^;\n]{0,40}searchParams|new URL\(\s*(?:globalThis\.|window\.)?location(?:\.href)?\s*\)\s*\.\s*searchParams/.test(text)) problems.push(`${rel}: reads the query through location.href`);
    if (/server\s*:\s*\{[^}]*url/.test(text) && rel.endsWith('capacitor.config.json')) problems.push(`${rel}: server.url`);
  }
  for (const [key] of flags) {
    const c = classify(key, flags.get(key).ops, policy);
    if (c.auto && c.group === 'review') continue; // listed in the table for reading
  }
  return problems;
}

function table(flags) {
  const rows = [];
  for (const [key, info] of [...flags].sort(([a], [b]) => a.localeCompare(b))) {
    const c = [...info.files].every(keepQuery) ? policy.internal : classify(key, info.ops, policy);
    rows.push({ key, def: defaultOf(info.ops), files: info.files.size, ...c });
  }
  return rows;
}

function writeFlags(rows, reads, done, flagsInDesign) {
  const groups = {};
  for (const r of rows) (groups[r.group] ||= []).push(r);
  const order = ['internal', 'guard', 'privacy', 'kidux', 'rollback', 'optin', 'optin-product', 'dev', 'tuning', 'review'];
  const names = {
    internal: 'פרוטוקול פנימי של חלון המשחק (נשאר)',
    guard: 'שומרי בטיחות והתאוששות: נשארים כברירת מחדל קבועה',
    privacy: 'פרטיות',
    kidux: 'ממשק ילדים',
    rollback: 'חזרה לגרסה קודמת (ברירת מחדל דלוקה): הוסרו',
    optin: 'מתגי התנהגות ישנה או הצטרפות (ברירת מחדל כבויה): הוסרו',
    'optin-product': 'תכונות הצטרפות שהן החלטת מוצר: הוסרו, נשארות כבויות',
    dev: 'פיתוח ובדיקות: הוסרו',
    tuning: 'כוונון ומדידה: הוסרו',
    review: 'נקראו ביד לפי הקוד: הוסרו',
  };
  const lines = [];
  lines.push('# דגלי URL בבנייה לחנות', '');
  lines.push('נוצר אוטומטית על ידי `store/scripts/build-web.mjs` לפי `store/flag-policy.json`. לא לערוך ידנית.', '');
  lines.push('## איך זה עובד', '');
  lines.push(`בעותק הבנייה (\`store/www\`) כל קריאה ל-\`location.search\` מוחלפת בקבוע \`'${STORE_SEARCH}'\` (${reads.reads} קריאות ב-${reads.files} קבצים). לכן כל דגל מקבל את ברירת המחדל שכבר כתובה בקוד. האתר החי והקוד במקור לא משתנים. הקוד של נתיבי החזרה לא נמחק: הוא נשאר כנתיב מת, כי מחיקה היא שינוי בקוד המשחק.`, '');
  lines.push('| שינוי נוסף בעותק | קובץ | למה |', '|---|---|---|');
  for (const t of done) lines.push(`| ${t.id} | \`${t.file}\` | ${t.why} |`);
  lines.push('', `סה"כ ${rows.length} מפתחות נמצאו בקוד הריצה (בלי בדיקות, כלים ועמודי תצוגה של design/).`, '');
  lines.push('| קבוצה | כמות |', '|---|---:|');
  for (const g of order) if (groups[g]) lines.push(`| ${names[g]} | ${groups[g].length} |`);
  lines.push('');
  for (const g of order) {
    if (!groups[g]) continue;
    lines.push(`## ${names[g]}`, '', `החלטה: ${groups[g][0].decision}. ${groups[g][0].why}`, '');
    lines.push('| דגל | ברירת מחדל בקוד | קבצים |', '|---|---|---:|');
    const defText = { on: 'דלוק', off: 'כבוי', mixed: 'לפי ערך', value: 'ערך או דלוק' };
    for (const r of groups[g]) lines.push(`| \`${r.key}\` | ${defText[r.def]} | ${r.files} |`);
    lines.push('');
  }
  lines.push('## עמודי תצוגה בתוך design/', '', `${flagsInDesign} קבצי תצוגה וסקירה בתוך design/ קוראים גם הם דגלים. הם לא נטענים מהמשחק, והקריאה בהם מוחלפת באותו קבוע.`, '');
  fs.writeFileSync(path.join(STORE, 'FLAGS.md'), lines.join('\n'));
}

function countDesignPages(root) {
  let n = 0;
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (DESIGN_PAGES.test(rel) && /location\s*(?:\?\.|\.)\s*search/.test(fs.readFileSync(file, 'utf8'))) n++;
  }
  return n;
}

const { tmp, island } = stage();
try {
  // scan the staged original before rewriting
  const flags = scanFlags(island);
  const inDesign = countDesignPages(island);
  fs.rmSync(WWW, { recursive: true, force: true });
  fs.cpSync(island, WWW, { recursive: true });
  const slimmed = process.argv.includes('--slim') ? slim(WWW) : null;
  const reads = rewrite(WWW);
  const done = transforms(WWW);
  const links = plainExternalLinks(WWW);
  const problems = verify(WWW, flags).concat(syntaxCheck([...reads.changed, ...done.map((t) => path.join(WWW, t.file))]));
  const rows = table(flags);
  writeFlags(rows, reads, done, inDesign);
  const bytes = (dir) => { let s = 0; for (const f of fs.readdirSync(dir, { recursive: true })) { const p = path.join(dir, f); if (fs.statSync(p).isFile()) s += fs.statSync(p).size; } return s; };
  if (slimmed) console.log(`slim: ${slimmed.removed} files not in the island offline list removed (${(slimmed.removedBytes / 1048576).toFixed(1)} MB)`);
  console.log(`${links} external links turned into plain text`);
  console.log(`store/www: ${(bytes(WWW) / 1048576).toFixed(1)} MB, ${reads.reads} query reads fixed in ${reads.files} files, ${rows.length} flags classified`);
  if (problems.length) {
    console.error('FAILED:\n' + problems.join('\n'));
    process.exitCode = 1;
  } else console.log('verify: no location.search read left');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
