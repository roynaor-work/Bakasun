// Sequential replay of the shipped browser proofs. Does not alter either source tree.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const [base, target, outputArgument] = process.argv.slice(2);
if (!base || !target) throw Error('Usage: node tests/browser.mjs /base-copy /applied-copy [/evidence-output]');
const output = path.resolve(outputArgument || path.join(directory, '../evidence/replay'));
mkdirSync(output, { recursive: true });
let modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) {
  try { modulePath = path.dirname(createRequire(import.meta.url).resolve('playwright/package.json')); }
  catch { modulePath = '/opt/codex/cua_node/lib/node_modules/playwright'; }
}
const moduleDirectory = modulePath.endsWith('.mjs') || modulePath.endsWith('.js') ? path.dirname(modulePath) : modulePath;
const moduleEntry = path.join(moduleDirectory, 'index.mjs');
if (!existsSync(moduleEntry)) throw Error('Set PLAYWRIGHT_MODULE to your installed playwright package directory.');
const chromium = process.env.CHROMIUM_PATH || process.env.ISLAND_BROWSER || '/usr/bin/chromium';
const selected = new Set((process.env.PHONE_FIX_ONLY || 'A,B,C,D,E,F').split(','));
const results = [];
function run(name, file, root, args = [], extra = {}, expectedExit = 0) {
  const result = spawnSync(process.execPath, [path.join(directory, file), ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PHONE_FIX_ROOT: path.resolve(root), PHONE_FIX_BASE_ROOT: path.resolve(base),
      PHONE_FIX_EVIDENCE: output, PHONE_FIX_OUTPUT: output,
      PLAYWRIGHT_MODULE: /^(B|C)-browser/.test(file) ? moduleDirectory : moduleEntry,
      ISLAND_PLAYWRIGHT: moduleEntry, CHROMIUM_PATH: chromium, ISLAND_BROWSER: chromium, ...extra } });
  writeFileSync(path.join(output, `${name}.log`), `${result.stdout || ''}${result.stderr || ''}`);
  const passed = result.status === expectedExit && result.signal === null;
  results.push({ name, exit: result.status, expectedExit, passed, signal: result.signal });
  console.log(`${name}: ${passed ? 'expected result' : 'FAILED'} (${result.status})`);
  if (!passed) throw Error(`${name}: see ${output}`);
}
try {
  if (selected.has('A') || selected.has('D')) {
    run('AD-before', 'AD-browser.mjs', base, ['before']);
    run('AD-after', 'AD-browser.mjs', target, ['after']);
    run('AD-rollback', 'AD-browser.mjs', target, ['rollback']);
    run('AD-individual', 'AD-browser.mjs', target, ['individual']);
  }
  if (selected.has('B')) for (const mode of ['before', 'after', 'rollback', 'global-rollback'])
    run(`B-${mode}`, 'B-browser.mjs', mode === 'before' ? base : target, [], { PHONE_FIX_MODE: mode }, mode === 'before' ? 1 : 0);
  if (selected.has('C')) run('C-all', 'C-browser.mjs', target);
  if (selected.has('E')) for (const mode of ['before', 'after'])
    run(`E-${mode}`, 'E-browser.mjs', mode === 'before' ? base : target, [], { PHONE_FIX_LABEL: mode }, mode === 'before' ? 1 : 0);
  if (selected.has('F')) for (const mode of ['before', 'after'])
    run(`F-${mode}`, 'F-browser.mjs', mode === 'before' ? base : target, [], { PHONE_FIX_MODE: mode, PHONE_FIX_ROLLBACK: mode === 'after' ? '1' : '0' }, mode === 'before' ? 1 : 0);
} finally {
  writeFileSync(path.join(output, 'browser-replay.json'), JSON.stringify(results, null, 2) + '\n');
}
