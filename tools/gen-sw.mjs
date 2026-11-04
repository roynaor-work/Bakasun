/* Rewrites the file lists in sw.js: CORE = what the first screen needs (the static import graph of js/app.js and the two
   stylesheets of index.html), REST = every other app file, cached in the background so every screen works with no network.
   Run: node tools/gen-sw.mjs        Check only (used by tests/bakasun-perf.mjs): node tools/gen-sw.mjs --check */
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rel = f => './' + path.relative(root, f).split(path.sep).join('/');
function deps(f) {
  const s = fs.readFileSync(f, 'utf8'); const out = []; let m;
  const re = /(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  while ((m = re.exec(s))) { const p = m[1] || m[2]; if (p.startsWith('.')) out.push(path.resolve(path.dirname(f), p)); }
  return out;
}
const core = new Set();
(function walk(f) { if (core.has(f)) return; core.add(f); deps(f).forEach(walk); })(path.join(root, 'js/app.js'));
core.add(path.join(root, 'js/theme-boot.js')); core.add(path.join(root, 'js/lazycss.js'));
const all = []; (function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? w(p) : all.push(p); } })(path.join(root, 'js'));
const css = fs.readdirSync(path.join(root, 'css')).filter(f => f.endsWith('.css')).map(f => path.join(root, 'css', f));
const CORE_CSS = ['app.css', 'desktop.css'].map(f => path.join(root, 'css', f));
const shell = ['./', './index.html', './manifest.json', './icons/icon.svg', './icons/icon-192.png'];
const CORE = [...shell, ...CORE_CSS.map(rel), ...[...core].map(rel).sort()];
const REST = [...all, ...css].map(rel).filter(f => !CORE.includes(f)).sort();
export const lists = { CORE, REST };
const fmt = a => '[\n  ' + a.map(x => "'" + x + "'").join(',\n  ') + '\n]';
const block = `/*GEN-START (node tools/gen-sw.mjs)*/\nconst CORE = ${fmt(CORE)};\nconst REST = ${fmt(REST)};\n/*GEN-END*/`;
const swPath = path.join(root, 'sw.js'); const sw = fs.readFileSync(swPath, 'utf8');
const next = sw.replace(/\/\*GEN-START[\s\S]*?\/\*GEN-END\*\//, () => block);
if (process.argv.includes('--check')) { if (next !== sw) { console.error('sw.js file lists are out of date: run node tools/gen-sw.mjs'); process.exit(1); } }
else if (process.argv[1] && process.argv[1].endsWith('gen-sw.mjs')) { fs.writeFileSync(swPath, next); console.log('CORE', CORE.length, 'REST', REST.length); }
