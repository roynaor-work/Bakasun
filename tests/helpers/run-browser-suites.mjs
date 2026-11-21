import {spawn} from 'node:child_process';
import {mkdtemp, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const groups = {
  alpine: [
    'tests/island-alpine-ctrl-ski.test.mjs',
    'tests/island-alpine-env.test.mjs',
    'tests/island-alpine-ski-assets.test.mjs',
    'tests/island-alpine-v7.test.mjs',
  ],
  soccer: [
    'tests/island-soccer-design-controls-browser.test.mjs',
    'tests/island-soccer-look-v10.test.mjs',
    'tests/island-soccer-motion2-browser.test.mjs',
    'tests/island-soccer-reopen-browser.test.mjs',
    'tests/island-soccer-v3-offline-browser.test.mjs',
    'tests/island-soccer-v4-turf.test.mjs',
    'tests/island-soccer-v5-characters.test.mjs',
    'tests/island-soccer-v7-characters.test.mjs',
    'tests/island-soccer-v8-connect.test.mjs',
  ],
  other: [
    'tests/bakasun-a11y-browser.mjs',
    'tests/island-city-preview.test.mjs',
    'tests/island-defense-v7.test.mjs',
    'tests/island-load-rescue-browser.test.mjs',
    'tests/island-naval-v7.test.mjs',
    'tests/island-racing-v7-browser.test.mjs',
    'tests/island-tennis-session-browser.test.mjs',
    'tests/island-tennis-v7-browser.test.mjs',
    'tests/island-upgrade-offer-browser.test.mjs',
    'tests/north-browser.mjs',
    'tests/workout-royiki.test.mjs',
    'tests/island-v24-default-browser.test.mjs',
    'tests/island-racing-v24-render-browser.test.mjs',
  ],
  offline: [
    'tests/island-offline-browser.test.mjs',
    'tests/island-offline-v25-browser.test.mjs',
  ],
  csp: ['tests/island-browser-csp.test.mjs'],
  v24: [
    'workout/island/tests/aliens-naval-v24-browser.mjs',
    'workout/island/tests/fire-v24-browser.mjs',
    'workout/island/tests/naval-v241-browser.mjs',
    'workout/island/tests/boar-fx-v241-browser.mjs',
    'workout/island/tests/boar-aim-v24-browser.mjs',
    'workout/island/tests/tennis-aliens-v24-1-browser.mjs',
    'workout/island/tests/racing-v24-touch-browser.mjs',
  ],
};

const group = process.argv[2] || 'all';
if (group !== 'all' && !Object.hasOwn(groups, group)) throw Error('Unknown browser group: ' + group);
const registered = group === 'all'
  ? Object.entries(groups).filter(([name]) => name !== 'v24').flatMap(([, files]) => files)
  : groups[group];
const requested = process.argv.slice(3);
for (const file of requested) {
  if (!registered.includes(file)) throw Error(`${file} is not registered in ${group}`);
}
const files = requested.length ? requested : registered;
const playwright = process.env.ISLAND_PLAYWRIGHT || fileURLToPath(import.meta.resolve('playwright'));
const base = process.env.ISLAND_CSP_AUDIT_DIR
  ? path.resolve(process.env.ISLAND_CSP_AUDIT_DIR)
  : await mkdtemp(path.join(tmpdir(), 'bakasun-browser-'));
console.log('Browser artifacts:', base);

const interrupts = new AbortController();
process.once('SIGINT', () => interrupts.abort('SIGINT'));
process.once('SIGTERM', () => interrupts.abort('SIGTERM'));
const minute = 60_000;
const isolation = Number(process.versions.node.split('.')[0]) < 23
  ? '--experimental-test-isolation=none'
  : '--test-isolation=none';

async function run(file, env) {
  // Running node:test in this child lets Playwright shut Chromium down on SIGTERM.
  const args = group === 'v24' ? [file] : ['--test', isolation, '--test-concurrency=1', file];
  const groupSignals = process.platform !== 'win32';
  const child = spawn(process.execPath, args, {cwd: root, env, stdio: 'inherit', detached: groupSignals});
  const signal = name => {
    if (!child.pid) return;
    try {
      if (groupSignals) process.kill(-child.pid, name);
      else child.kill(name);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  let stopped = false;
  let hardStop;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal('SIGTERM');
    hardStop = setTimeout(() => signal('SIGKILL'), 5000);
  };
  const timeout = (group === 'offline' || groups.offline.includes(file) ? 45 : group === 'v24' ? 35 : 30) * minute;
  const deadline = setTimeout(() => {
    console.error(`Browser suite exceeded ${timeout / minute} minutes: ${file}`);
    stop();
  }, timeout);
  interrupts.signal.addEventListener('abort', stop, {once:true});
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    return !stopped && code === 0;
  } finally {
    clearTimeout(deadline);
    clearTimeout(hardStop);
    interrupts.signal.removeEventListener('abort', stop);
    // Reap any same-group helper left after the test process and its cleanup exited.
    signal('SIGKILL');
  }
}

let failed = false;
for (const file of files) {
  if (interrupts.signal.aborted) break;
  const artifacts = path.join(base, path.basename(file, '.mjs'));
  await mkdir(artifacts, {recursive:true});
  console.log(file);
  const env = {
    ...process.env,
    ISLAND_PLAYWRIGHT: playwright,
    ISLAND_CSP_BROWSER: '1',
    ISLAND_SOCCER_BROWSER: '1',
    ISLAND_CITY_PREVIEW_BROWSER: '1',
    ISLAND_WORKOUT_BROWSER: '1',
    ISLAND_CSP_AUDIT_DIR: artifacts,
    ISLAND_SOCCER_AUDIT_DIR: artifacts,
    ISLAND_SOCCER_RESTART_DIR: artifacts,
    NORTH_PERF_OUT: path.join(artifacts, 'north-perf.json'),
  };
  if (!await run(file, env)) {
    failed = true;
    console.error('FAILED:', file);
  }
}
process.exitCode = interrupts.signal.aborted ? (interrupts.signal.reason === 'SIGINT' ? 130 : 143) : Number(failed);
