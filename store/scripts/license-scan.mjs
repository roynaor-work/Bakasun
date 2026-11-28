#!/usr/bin/env node
// Licence scan for the store build.
// Walks store/www (run build-web.mjs first), matches every asset file to the nearest licence notice above it
// (LICENSE*, LICENCE*, LICENSES*, NOTICE*, OFL*, COPYING*), reads the licence identifiers from the notice,
// and writes:
//   store/LICENSES-REPORT.md      table of packages without a documented licence or with a licence that does not fit a store
//   store/credits/credits.md      credits for the app (attribution, MIT notices)
//   store/credits/credits.html    the same as a standalone page (copied to www/credits.html; linking it from the game screen is a game-code change)
//   store/credits/scan.json       machine readable result
// Exit code 1 when a package is blocked (no notice, non-commercial, share-alike, copyleft).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.resolve(HERE, '..');
const WWW = path.join(STORE, 'www');
const OUT = path.join(STORE, 'credits');
if (!fs.existsSync(WWW)) throw new Error('store/www is missing: run node scripts/build-web.mjs first');

const ASSET_EXT = /\.(glb|gltf|fbx|png|jpe?g|webp|avif|gif|svg|ico|ogg|mp3|wav|opus|m4a|mp4|webm|woff2?|ttf|ktx2|bin)$/i;
const NOTICE = /^(licen[cs]es?|licen[cs]e\..*|licen[cs]es\..*|notice.*|ofl.*|copying.*|dedication.*)$/i;
const PROVENANCE = /^(provenance|sources?|source|assets|credits|attribution)\.(json|md|txt)$/i;

const manifest = JSON.parse(fs.readFileSync(path.join(WWW, 'offline-manifest.json'), 'utf8'));
const inManifest = new Set([...manifest.core, ...manifest.shell, ...Object.values(manifest.games).flat()].filter(Boolean));

// --- identifiers -----------------------------------------------------------------------------------------------
const RULES = [
  // [id, regex, class]  class: ok | credit | review | block
  ['CC-BY-NC', /CC[- ]BY[- ]NC|BY-NC|Attribution[- ]NonCommercial|Creative Commons[^\n]{0,40}NonCommercial/i, 'block'],
  ['CC-BY-SA', /CC[- ]BY[- ]SA|BY-SA|ShareAlike/i, 'block'],
  ['GPL', /\b(?:A|L)?GPL(?:-|v|\s)?[0-9.]*|GNU General Public License/, 'block'],
  ['CC-BY-4.0', /CC[- ]BY(?:[- ]4\.0|[- ]3\.0)?(?![-\w])|creativecommons\.org\/licenses\/by\/|Attribution 4\.0/i, 'credit'],
  ['LicenseRef-Mixed-Provenance', /LicenseRef-Mixed-Provenance/, 'review'],
  ['LicenseRef-Repository-Terms', /LicenseRef-Repository-Terms/, 'review'],
  ['LicenseRef-Existing-Repository-Rights', /LicenseRef-Existing-Repository-Rights/, 'review'],
  ['LicenseRef-other', /LicenseRef-(?!Mixed-Provenance|Repository-Terms|Existing-Repository-Rights)[\w.-]+/, 'review'],
  ['CC0-1.0', /CC0[- ]?1\.0|CC0 1\.0 Universal|Creative Commons Zero|CC0\b/i, 'ok'],
  ['MIT', /\bMIT\b|Permission is hereby granted, free of charge/, 'credit'],
  ['OFL-1.1', /SIL Open Font License|\bOFL(?:-1\.1)?\b/, 'credit'],
  ['Apache-2.0', /Apache License|Apache-2\.0/, 'credit'],
  ['BSD', /\bBSD[- ]?[23]?/, 'credit'],
  ['Public-domain', /public domain|נחלת הכלל/i, 'ok'],
];
const RANK = { ok: 0, credit: 1, review: 2, block: 3 };

const TOOL_LINE = /Blender|FFmpeg|LAME|Opus|glTF Transform|sharp|כלי|tool|build only|QA/i;
function identify(text) {
  const found = [];
  for (const [id, re, cls] of RULES) {
    // GPL, MIT and Apache are often named for production tools (Blender, glTF Transform, sharp); the output of a tool is not covered, so tool lines are skipped
    const subject = ['GPL', 'MIT', 'Apache-2.0', 'BSD'].includes(id) ? text.split('\n').filter((l) => !TOOL_LINE.test(l)).join('\n') : text;
    if (re.test(subject)) found.push({ id, cls });
  }
  // the CC0 legal text explains "non-commercial" use in general words; only explicit CC-BY-NC identifiers block
  return found;
}

// --- walk ------------------------------------------------------------------------------------------------------
function walkFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

const all = walkFiles(WWW).map((f) => path.relative(WWW, f).split(path.sep).join('/'));
const dirsWithNotice = new Map(); // dir -> [notice files]
for (const rel of all) {
  const name = path.posix.basename(rel);
  if (NOTICE.test(name) || /-sources\.txt$/i.test(name)) {
    const dir = path.posix.dirname(rel);
    if (!dirsWithNotice.has(dir)) dirsWithNotice.set(dir, []);
    dirsWithNotice.get(dir).push(rel);
  }
}

function noticeFor(rel) {
  let dir = path.posix.dirname(rel);
  while (dir && dir !== '.') {
    if (dirsWithNotice.has(dir)) return { dir, files: dirsWithNotice.get(dir) };
    dir = path.posix.dirname(dir);
  }
  return null;
}

// A package is the directory that owns the notice; files with no notice are grouped by their top two folders.
const packages = new Map();
const topKey = (rel) => rel.split('/').slice(0, rel.startsWith('assets/') || rel.startsWith('design/') ? 2 : 1).join('/');
let assetFiles = 0;
for (const rel of all) {
  if (!ASSET_EXT.test(rel)) continue;
  if (rel.startsWith('vendor/')) continue; // libraries are covered by the code notices below
  assetFiles++;
  const n = noticeFor(rel);
  const key = n ? n.dir : `(בלי רישיון) ${topKey(rel)}`;
  if (!packages.has(key)) packages.set(key, { key, notice: n?.files ?? [], files: 0, bytes: 0, manifest: 0, samples: [] });
  const pkg = packages.get(key);
  pkg.files++;
  pkg.bytes += fs.statSync(path.join(WWW, rel)).size;
  if (inManifest.has(rel)) pkg.manifest++;
  if (pkg.samples.length < 3) pkg.samples.push(rel);
}

function readNotice(pkg) {
  let text = '';
  for (const f of pkg.notice) text += '\n' + fs.readFileSync(path.join(WWW, f), 'utf8');
  return text;
}

// a sibling provenance file lets us tell "no notice" from "no documentation at all"
function provenanceNear(dir) {
  const hits = [];
  let d = dir;
  for (let i = 0; i < 3 && d && d !== '.'; i++) {
    for (const rel of all) if (path.posix.dirname(rel) === d && PROVENANCE.test(path.posix.basename(rel))) hits.push(rel);
    d = path.posix.dirname(d);
  }
  return hits;
}

// central documentation: workout/island/ASSETS.md names packages and licences in prose
const REPO = path.resolve(STORE, '..');
const assetsMd = fs.readFileSync(path.join(REPO, 'workout/island/ASSETS.md'), 'utf8').split('\n');
function documentedIn(key) {
  const name = key.replace(/^\(בלי רישיון\) /, '');
  const lines = assetsMd.filter((l) => l.includes(name + '/') || l.includes('`' + name + '`') || l.includes(name + ' ') || l.includes(name + '`'));
  return lines.join('\n');
}

const rows = [];
for (const pkg of packages.values()) {
  let ids = [];
  let status;
  let reason = '';
  if (!pkg.notice.length) {
    const prov = provenanceNear(pkg.key.replace(/^\(בלי רישיון\) /, ''));
    const doc = documentedIn(pkg.key);
    const found = doc ? identify(doc) : [];
    ids = found.map((f) => f.id);
    const note = prov.length ? `קובץ מקור: ${prov[0]}` : '';
    if (found.length) {
      status = found.some((f) => f.cls === 'block') ? 'block' : 'review';
      reason = `אין קובץ רישיון בתיקייה; מתועד ב-ASSETS.md (${ids.join(', ')}). ${note}`.trim();
    } else {
      status = 'block';
      const mentions = doc ? doc.split('\n').length : 0;
      reason = prov.length ? `אין קובץ רישיון ואין רישיון ב-ASSETS.md (${note})` : mentions ? `אין קובץ רישיון; מוזכר ב-ASSETS.md (${mentions} שורות) בלי מזהה רישיון: נגזרת של נכס בריפו או יצירה פנימית, רועי מאשר מקור` : 'אין קובץ רישיון ואין תיעוד מקור';
    }
  } else {
    const found = identify(readNotice(pkg));
    ids = found.map((f) => f.id);
    if (!found.length) { status = 'review'; reason = 'קובץ הרישיון לא מכיל מזהה מוכר'; }
    else {
      // a CC0 notice that also names MIT or Apache is naming a library or a tool, not licensing the assets under it
      const cc0Only = found.some((f) => f.id === 'CC0-1.0') && !found.some((f) => ['CC-BY-4.0', 'OFL-1.1'].includes(f.id));
      const counted = found.filter((f) => !(cc0Only && ['MIT', 'Apache-2.0', 'BSD'].includes(f.id)));
      status = counted.reduce((worst, f) => (RANK[f.cls] > RANK[worst] ? f.cls : worst), 'ok');
      if (status === 'block') reason = 'רישיון לא מתיר לחנות: ' + found.filter((f) => f.cls === 'block').map((f) => f.id).join(', ');
      else if (status === 'review') reason = 'רישיון מותאם: לקרוא ולאשר';
      else if (status === 'credit') reason = 'דורש קרדיט באפליקציה';
    }
  }
  rows.push({ ...pkg, ids, status, reason });
}
rows.sort((a, b) => RANK[b.status] - RANK[a.status] || b.bytes - a.bytes);

const mb = (b) => (b / 1048576).toFixed(1);
const count = (s) => rows.filter((r) => r.status === s).length;
const statusHe = { ok: 'תקין', credit: 'קרדיט', review: 'לבדיקה', block: 'חסום' };

// --- report ----------------------------------------------------------------------------------------------------
const lines = [];
lines.push('# סריקת רישוי נכסים לחנות', '');
lines.push('נוצר אוטומטית על ידי `store/scripts/license-scan.mjs` מתוך `store/www` (העותק שנארז באפליקציה). הסריקה היא עזר: היא קוראת קובצי רישיון ומחפשת מזהים, ולא מחליפה קריאה של החריגים. לא עברה עורך דין.', '');
lines.push('| תוצאה | חבילות | משמעות |', '|---|---:|---|');
lines.push(`| תקין | ${count('ok')} | CC0, נחלת הכלל או מקביל, בלי חובת קרדיט |`);
lines.push(`| קרדיט | ${count('credit')} | CC-BY, MIT, OFL, Apache, BSD: מותר, וחובה להציג קרדיט (נכנס ל-credits) |`);
lines.push(`| לבדיקה | ${count('review')} | רישיון מותאם (LicenseRef) או שלא זוהה: רועי מאשר או שהנכס יוצא |`);
lines.push(`| חסום | ${count('block')} | אין רישיון, או NC, או שיתוף-זהה, או העתק חופשי (GPL): לא נכנס לחנות עד פתרון |`);
lines.push('', `סה"כ ${assetFiles} קבצי נכסים ב-${rows.length} חבילות. "במניפסט" = כמה מהקבצים נטענים בוודאות (הרשימה של האי לאופליין); השאר נארזו כי הפרסום הציבורי כולל אותם, ואפשר לגזום (ראו README).`, '');
const section = (title, status) => {
  const list = rows.filter((r) => r.status === status);
  if (!list.length) return;
  lines.push(`## ${title}`, '', '| חבילה | רישיון | קבצים | MB | במניפסט | הערה |', '|---|---|---:|---:|---:|---|');
  for (const r of list) lines.push(`| \`${r.key}\` | ${r.ids.join(', ') || '-'} | ${r.files} | ${mb(r.bytes)} | ${r.manifest} | ${r.reason} |`);
  lines.push('');
};
section('חסום', 'block');
section('לבדיקה', 'review');
section('קרדיט', 'credit');
lines.push('## תקין', '', `${count('ok')} חבילות ללא חובת קרדיט, המפורטות ב-\`credits/scan.json\`.`, '');
lines.push('## מה הסריקה לא יודעת', '', '- חבילה עם קובץ רישיון אחד על כמה מקורות (טבלה של קבצים) מקבלת את הרישיון החמור ביותר שבה.', '- קובץ שנוצר מחדש (דחיסה, המרה) נחשב לפי החבילה שלו.', '- לא נבדק שתוכן הקובץ תואם את הנאמר בקובץ הרישיון.', '- הקלטות הקול של רועי (`*-rec/`) דורשות הסכמה בכתב לשימוש מסחרי; ראו STORE-READINESS.md.', '');
fs.writeFileSync(path.join(STORE, 'LICENSES-REPORT.md'), lines.join('\n'));

// --- credits ---------------------------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const credits = [];
for (const r of rows.filter((x) => x.status === 'credit')) {
  const text = readNotice(r);
  const keep = text.split('\n').map((l) => l.trim()).filter((l) => /created by|by \*\*|author|source:|license:|©|copyright|creator|\bby\b.*(?:CC|Creative)/i.test(l)).slice(0, 6);
  credits.push({ package: r.key, licenses: r.ids, status: r.status, notice: r.notice, lines: keep });
}
// code libraries shipped in vendor/
const libs = [];
for (const rel of all) {
  if (/^vendor\/(?:.*\/)?(LICENSE[\w.-]*|license[\w.-]*)$/.test(rel)) libs.push(rel);
}
const libText = libs.map((f) => ({ file: f, text: fs.readFileSync(path.join(WWW, f), 'utf8').trim().slice(0, 1500) }));

const md = ['# קרדיטים', '', 'העיר שלי משתמשת בנכסים וספריות של אחרים. תודה ליוצרים.', ''];
md.push('## נכסים עם חובת ייחוס', '');
if (!credits.length) md.push('אין.', '');
for (const c of credits) {
  md.push(`### ${c.package}`, '', `רישיון: ${c.licenses.join(', ') || 'לא זוהה'}`, '');
  for (const l of c.lines) md.push(`- ${l}`);
  md.push('');
}
md.push('## ספריות', '');
for (const l of libText) md.push(`### ${l.file}`, '', '```', l.text, '```', '');
fs.writeFileSync(path.join(OUT, 'credits.md'), md.join('\n'));

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const html = [`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>קרדיטים</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#edf7f5;color:#17323a}main{max-width:760px;margin:auto}h1{font-size:1.5rem}h2{font-size:1.15rem;margin-top:1.6em}h3{font-size:1rem;direction:ltr;text-align:right}pre{white-space:pre-wrap;direction:ltr;text-align:left;background:#fff;padding:8px;border-radius:8px;font-size:.8rem}ul{padding-inline-start:1.2em}</style></head><body><main>`];
html.push('<h1>קרדיטים</h1><p>העיר שלי משתמשת בנכסים וספריות של אחרים. תודה ליוצרים.</p><h2>נכסים עם חובת ייחוס</h2>');
if (!credits.length) html.push('<p>אין.</p>');
for (const c of credits) {
  html.push(`<h3>${esc(c.package)}</h3><p>רישיון: ${esc(c.licenses.join(', ') || 'לא זוהה')}</p><ul>${c.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`);
}
html.push('<h2>ספריות</h2>');
for (const l of libText) html.push(`<h3>${esc(l.file)}</h3><pre>${esc(l.text)}</pre>`);
html.push('</main></body></html>');
fs.writeFileSync(path.join(OUT, 'credits.html'), html.join(''));
fs.writeFileSync(path.join(OUT, 'scan.json'), JSON.stringify({ assetFiles, packages: rows.map(({ key, ids, status, reason, files, bytes, manifest, notice }) => ({ key, ids, status, reason, files, bytes, manifest, notice })) }, null, 1));

fs.copyFileSync(path.join(OUT, 'credits.html'), path.join(WWW, 'credits.html')); // standalone page inside the app package
console.log(`${assetFiles} asset files, ${rows.length} packages: ok ${count('ok')}, credit ${count('credit')}, review ${count('review')}, block ${count('block')}`);
if (count('block')) process.exitCode = 1;
