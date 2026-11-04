import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Deep round 1 (04/11/2026), finding 08: the first load ships the shell and "today" only; every other screen and its stylesheet load on demand;
   the service worker caches the shell first and the rest in the background, so every screen also opens with no network. */
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = f => readFileSync(path.join(root, f), 'utf8');
const app = read('js/app.js');

test('app.js statically imports no screen but "today"', () => {
  const screens = [...app.matchAll(/^import\s[^;]*from\s*'\.\/screens\/([\w]+)\.js'/gm)].map(m => m[1]);
  assert.deepEqual(screens, ['today']);
  assert.doesNotMatch(app, /^import\s*'\.\/screens\//m);
  assert.doesNotMatch(app, /^import[^;]*from\s*'\.\/notes\.js'/m);
});
test('every route of the old table is still routed, to an existing module and stylesheet', () => {
  const names = ['lead', 'cases', 'case', 'clients', 'client', 'calls', 'tasks', 'search', 'settings', 'more', 'suppliers', 'supplier', 'quotes', 'quote', 'groups', 'money', 'notes', 'assist', 'portal', 'receipts', 'help', 'share', 'dashboard', 'calendar', 'participants', 'contracts', 'contract', 'budget', 'runsheet', 'files', 'notifications', 'board', 'templates', 'import'];
  const lazy = app.slice(app.indexOf('const LAZY = {'), app.indexOf('const ROUTES'));
  for (const n of names) assert.match(lazy, new RegExp("(^|[\\s,{])(" + n + "|'" + n + "'):\\s*\\["), 'route ' + n);
  for (const m of lazy.matchAll(/S\('(\w+)'\)/g)) assert.ok(existsSync(path.join(root, 'js/screens', m[1] + '.js')), m[1]);
  const cssNames = new Set([...lazy.matchAll(/\[((?:'[a-z0-9]+'(?:, )?)+)\]/g)].flatMap(m => m[1].match(/[a-z0-9]+/g)));
  for (const c of cssNames) if (!['workgroup'].includes(c) && !existsSync(path.join(root, 'js/screens', c + '.js'))) assert.ok(existsSync(path.join(root, 'css', c + '.css')), 'css ' + c);
});
test('index.html links only the shell stylesheets; the rest come from lazycss', () => {
  const links = [...read('index.html').matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(links, ['css/app.css', 'css/desktop.css']);
  assert.ok(readdirSync(path.join(root, 'css')).length > 2);
});
test('the nav badge look lives in the shell sheet, not in a screen sheet', () => {
  assert.match(read('css/desktop.css'), /nav\.bottom \.nbadge/);
  assert.doesNotMatch(read('css/rules.css'), /nav\.bottom \.nbadge/);
});
test('sw.js lists are generated from the module graph and up to date', () => {
  execFileSync(process.execPath, ['tools/gen-sw.mjs', '--check'], { cwd: root, stdio: 'pipe' });
  const sw = read('sw.js');
  assert.match(sw, /const CORE = \[/); assert.match(sw, /const REST = \[/);
  assert.match(sw, /'\.\/js\/screens\/today\.js'/);       // the first screen is in the shell
  assert.match(sw, /'\.\/js\/screens\/board\.js'/);       // the rest is cached too (REST)
  assert.match(sw, /e\.data === 'precache'/);
});
test('the worker installs CORE only and caches REST on a message', async () => {
  const { runInNewContext } = await import('node:vm');
  const handlers = {}, added = [], store = new Set();
  const cache = { addAll: async l => l.forEach(x => added.push(x)), match: async f => store.has(f), add: async f => { store.add(f); added.push(f); } };
  runInNewContext(read('sw.js'), { self: { addEventListener: (n, fn) => { handlers[n] = fn; }, skipWaiting() {}, clients: { claim: async () => {} } }, caches: { open: async () => cache, keys: async () => [], delete: async () => true }, Response: class {} });
  let p; handlers.install({ waitUntil(x) { p = x; } }); await p;
  assert.ok(added.includes('./js/app.js') && !added.includes('./js/screens/board.js'));
  handlers.message({ data: 'precache', waitUntil(x) { p = x; } }); await p;
  assert.ok(added.includes('./js/screens/board.js') && added.includes('./css/board.css'));
});
