// Verification only: stage new motion data against an unchanged copy of the
// existing viewer. No repository input, viewer code or acceptance limit is edited.
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareFixtureSources } from './verify-evidence.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packRoot = resolve(here, '..');
const island = resolve(packRoot, '../../..');
const repo = resolve(island, '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const out = resolve(option('--out', here));
const executable = option('--executable', process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium');
const characters = option('--character', null) ? [option('--character')] : ['soccer-player', 'goalkeeper'];
if (characters.some(name => !['soccer-player', 'goalkeeper'].includes(name))) throw Error('Only soccer-player and goalkeeper are supported by this verification fixture.');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = async (name, value) => writeFile(resolve(out, name), JSON.stringify(value, null, 2) + '\n');

async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'verification') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}
const inputFiles = [];
for (const directory of ['design/viewer', 'design/characters', 'design/motion', 'vendor']) inputFiles.push(...await filesIn(resolve(island, directory)));
const sourceHashes = async () => Object.fromEntries(await Promise.all(inputFiles.map(async path => [relative(island, path), sha256(await readFile(path))])));
const originalHashes = await sourceHashes();
await mkdir(out, { recursive: true });
const staged = await mkdtemp(resolve(tmpdir(), 'bakasun-motion2-soccer-'));
for (const directory of ['design/viewer', 'design/characters', 'design/motion', 'vendor']) {
  await cp(resolve(island, directory), resolve(staged, directory), { recursive: true, filter: path => !path.split('/').includes('verification') });
}
const baseline = await json(resolve(island, 'design/motion/soccer.json'));
const data = structuredClone(baseline);
const packs = [];
const authored = new Set();
for (const name of (await readdir(packRoot)).filter(name => name.endsWith('.json')).sort()) {
  const path = resolve(packRoot, name);
  const pack = await json(path);
  if (!pack.states) continue; // A manifest is metadata, never an animation input.
  if (JSON.stringify(pack.skeleton) !== JSON.stringify(baseline.skeleton)) throw Error(`${name}: skeleton differs from existing soccer source`);
  const states = Object.keys(pack.states);
  for (const state of states) {
    if (state in data.states) throw Error(`${name}: duplicate state ${state}`);
    authored.add(state);
  }
  Object.assign(data.states, pack.states);
  data.transitions.push(...pack.transitions);
  data.eventInputs = [...new Set([...data.eventInputs, ...pack.eventInputs])];
  packs.push({ path: relative(repo, path), sha256: sha256(await readFile(path)), states });
}
if (!packs.length) throw Error('No motion packs with states were found.');
for (const transition of data.transitions) {
  if (transition.source !== '*' && !data.states[transition.source]) throw Error(`Unknown transition source ${transition.source}`);
  if (!data.states[transition.target]) throw Error(`Unknown transition target ${transition.target}`);
}
const stagedData = JSON.stringify(data, null, 2) + '\n';
await writeFile(resolve(staged, 'design/motion/soccer.json'), stagedData);
const provenance = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  repositoryHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  mainAtRun: execFileSync('git', ['rev-parse', 'origin/main'], { cwd: repo, encoding: 'utf8' }).trim(),
  method: 'Copy existing viewer, characters, vendor and motion into an isolated temporary directory; merge baseline soccer states/transitions with unmodified new pack states/transitions only in the temporary soccer.json; run the unchanged test-viewer.mjs. Baseline idle/run/kick remain available for its negative controls, CPU probe and screenshot. Every new state is enumerated by its existing runChecks.',
  fixture: { transientDirectory: staged, baselineSoccerSha256: originalHashes['design/motion/soccer.json'], mergedSoccerSha256: sha256(stagedData), baselineStates: Object.keys(baseline.states), authoredStates: [...authored], stateCount: Object.keys(data.states).length, transitionCountBeforeWildcardExpansion: data.transitions.length },
  packs, originalSourceSha256: originalHashes, invocations: [], pass: false,
};
await save('provenance.json', provenance);

async function command(argv) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, argv, { cwd: repo, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('exit', (code, signal) => accept({ argv: [process.execPath, ...argv], exitCode: code, signal, stdout, stderr }));
  });
}
const reports = [];
if (!args.includes('--measure-only')) {
  for (const character of characters) {
    const argv = [resolve(staged, 'design/viewer/test-viewer.mjs'), '--character', character, '--game', 'soccer', '--executable', executable, '--out', resolve(out, character)];
    provenance.invocations.push(await command(argv));
    const report = await json(resolve(out, character, 'report.json'));
    report.fixtureSourceIntegrity = compareFixtureSources(provenance, report);
    if (!report.fixtureSourceIntegrity.pass) report.pass = false;
    for (const result of report.cases) {
      const tested = new Set(result.report?.checks?.support?.clips?.map(item => item.clip));
      result.authoredCoverage = { expected: authored.size, tested: [...authored].filter(name => tested.has(name)).length, missing: [...authored].filter(name => !tested.has(name)) };
      if (result.authoredCoverage.missing.length) report.pass = false;
    }
    reports.push(report);
    await save(`${character}/report.json`, report);
    await save('provenance.json', provenance);
  }
}

// The existing runner reports one global mesh-floor minimum. Supplement it with
// per-clip minima and exposed correction magnitudes using the exact same sampler,
// retargeter, contact windows and 120 Hz + key/contact-boundary sample set.
async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) {
    let path = resolve(process.env.PLAYWRIGHT_MODULE);
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.mjs');
    return import(pathToFileURL(path).href);
  }
  try { return await import('playwright'); }
  catch { return import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href); }
}
const server = spawn(process.execPath, [resolve(staged, 'design/viewer/test-viewer.mjs'), '--serve', '--out', resolve(staged, 'serve-output')], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
let supplemental;
try {
  const origin = await new Promise((accept, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(Error('Temporary viewer server did not start')), 10000);
    server.on('error', reject);
    server.on('exit', code => reject(Error(`Temporary viewer server exited ${code}`)));
    server.stdout.on('data', chunk => { output += chunk; const match = output.match(/Viewer: (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timeout); accept(match[1]); } });
    server.stderr.on('data', chunk => process.stderr.write(chunk));
  });
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true, executablePath: executable, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  supplemental = { schemaVersion: 1, generatedAt: new Date().toISOString(), scope: 'Supplemental per-clip metrics using unchanged viewer modules; does not replace test-viewer.mjs acceptance results.', samplePolicy: '120 Hz plus all keyframe times and support-contact start/end times, including endpoints', cases: [], pass: true };
  for (const character of characters) {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, serviceWorkers: 'block' });
    const diagnostics = [];
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (!url.startsWith('blob:') && !url.startsWith('data:') && new URL(url).origin !== origin) { diagnostics.push(`Nonlocal request: ${url}`); await route.abort('blockedbyclient'); }
      else await route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => diagnostics.push(error.message));
    await page.goto(`${origin}/design/viewer/viewer.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.viewerTest));
    await page.evaluate(async character => { await window.viewerTest.ready; window.viewerTest.pause(); await window.viewerTest.selectCharacter(character); }, character);
    for (const name of authored) {
      const metrics = await page.evaluate(async name => {
        const { sample } = await import('/design/viewer/animation.js');
        const { limits } = await import('/design/viewer/checks.js');
        const { rig, player } = window.viewerTest;
        const clip = player.data.states[name];
        const times = new Set([0, clip.durationSeconds, ...clip.keyframes.map(key => key.time * clip.durationSeconds), ...clip.supportContacts.flatMap(c => [c.startTime, c.endTime].map(t => t * clip.durationSeconds))]);
        for (let t = 0; t < clip.durationSeconds; t += 1 / 120) times.add(t);
        let minY = Infinity, maxFloorCorrectionMeters = 0, maxSwingFloorCorrectionMeters = 0, maxPelvisCorrectionMeters = 0, maxAnchorErrorMeters = 0, maxSlipMeters = 0;
        const anchors = new Map();
        for (const t of [...times].sort((a, b) => a - b)) {
          const pose = sample(clip, t, false);
          const s = rig.apply(pose, { referenceRoot: pose.referenceRootTranslationMeters, contacts: pose.contacts, floor: true });
          minY = Math.min(minY, s.minY);
          maxFloorCorrectionMeters = Math.max(maxFloorCorrectionMeters, s.floorCorrectionMeters);
          maxSwingFloorCorrectionMeters = Math.max(maxSwingFloorCorrectionMeters, ...Object.values(s.swingFloorCorrectionMeters));
          maxPelvisCorrectionMeters = Math.max(maxPelvisCorrectionMeters, Math.hypot(...s.pelvisCorrectionMeters));
          maxAnchorErrorMeters = Math.max(maxAnchorErrorMeters, s.maxSupportErrorMeters);
          for (const c of pose.contacts) {
            if (c.weight < 1 - 1e-9) continue;
            const id = c.contactKey || `${c.bone}:${c.startTime}`;
            const p = s.feet[c.bone];
            if (!anchors.has(id)) anchors.set(id, p);
            const first = anchors.get(id);
            const drift = c.mode === 'ski-slide' ? Math.abs(p[1] - first[1]) : Math.hypot(...p.map((value, i) => value - first[i]));
            maxSlipMeters = Math.max(maxSlipMeters, drift);
          }
        }
        return { clip: name, samples: times.size, durationSeconds: clip.durationSeconds, loop: clip.loop, minY, maxFloorCorrectionMeters, maxSwingFloorCorrectionMeters, maxPelvisCorrectionMeters, maxAnchorErrorMeters, maxSlipMeters, floorPass: minY >= -limits.floorMeters, supportPass: maxAnchorErrorMeters <= limits.supportMeters && maxSlipMeters <= limits.supportMeters };
      }, name);
      supplemental.cases.push({ character, ...metrics });
      if (!metrics.floorPass || !metrics.supportPass) supplemental.pass = false;
      console.log(`${metrics.floorPass && metrics.supportPass ? 'PASS' : 'FAIL'} per-clip ${character}/${name}: slip=${metrics.maxSlipMeters.toExponential(3)}m floor=${metrics.minY.toExponential(3)}m`);
    }
    if (diagnostics.length) { supplemental.pass = false; supplemental.cases.push({ character, diagnostics }); }
    await context.close();
  }
  await save('clip-metrics.json', supplemental);
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
const finalHashes = await sourceHashes();
provenance.changedOriginalInputs = Object.keys(originalHashes).filter(name => originalHashes[name] !== finalHashes[name]);
provenance.changedPacksDuringRun = [];
for (const pack of packs) if (sha256(await readFile(resolve(repo, pack.path))) !== pack.sha256) provenance.changedPacksDuringRun.push(pack.path);
provenance.sourceInputsUnchanged = provenance.changedOriginalInputs.length === 0 && provenance.changedPacksDuringRun.length === 0;
provenance.acceptanceSkipped = args.includes('--measure-only');
provenance.pass = !provenance.acceptanceSkipped && reports.length === characters.length && reports.every(report => report.pass) && supplemental.pass && provenance.sourceInputsUnchanged && provenance.invocations.every(invocation => invocation.exitCode === 0);
await save('provenance.json', provenance);
const label = provenance.acceptanceSkipped ? `MEASUREMENTS ${supplemental.pass && provenance.sourceInputsUnchanged ? 'PASS' : 'FAIL'} (acceptance skipped)` : provenance.pass ? 'PASS' : 'FAIL';
console.log(`${label} motion2 soccer: ${authored.size} authored clips, ${reports.reduce((n, report) => n + report.cases.length, 0)} unchanged-runner cases; ${out}`);
process.exitCode = provenance.pass || args.includes('--measure-only') && supplemental.pass && provenance.sourceInputsUnchanged ? 0 : 1;
