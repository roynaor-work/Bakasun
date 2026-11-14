// SPDX-License-Identifier: CC0-1.0
// Materialize and run the pinned QA CLI unchanged outside the checkout.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {readFile, writeFile, mkdir, mkdtemp, symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../../../..');
const commit = '5eb4f093bc22523ee417a7f2345c3b813bffba24';
const prefix = 'workout/island/design/motion-qa-v1/';
const workspace = await mkdtemp(path.join(tmpdir(), 'bakasun-tackle-keeper-qa-'));
const qaRoot = path.join(workspace, prefix), output = path.join(root, 'qa');
await mkdir(qaRoot, {recursive: true}); await mkdir(output, {recursive: true});
try { execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {cwd: repo, stdio: 'pipe'}); }
catch { execFileSync('git', ['fetch', '--depth=1', '--filter=blob:none', '--no-tags', 'origin', commit], {cwd: repo, stdio: 'inherit'}); }
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, prefix], {cwd: repo, encoding: 'utf8'})
  .trim().split('\n').filter(file => !file.slice(prefix.length).includes('/') && /\.(mjs|json|css)$/.test(file));
const toolFiles = [];
for (const file of files) {
  const bytes = execFileSync('git', ['show', `${commit}:${file}`], {cwd: repo, maxBuffer: 8 * 1024 * 1024});
  await writeFile(path.join(workspace, file), bytes);
  toolFiles.push({path: file, commit, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
}
await symlink(path.join(repo, 'workout/island/design/soccer-motion-v8'), path.join(qaRoot, '../soccer-motion-v8'), 'dir');
// The original HTML uses ../style.css relative to qa/report.html.
await writeFile(path.join(root, 'style.css'), await readFile(path.join(qaRoot, 'style.css')));
const cli = path.join(qaRoot, 'run.mjs'), cliURL = pathToFileURL(cli).href;
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
const env = {...process.env, SOCCER_TACKLE_QA_CLI: cliURL, SOCCER_TACKLE_SOURCE_COMMIT: sourceCommit};
const args = ['--import', pathToFileURL(path.join(root, 'source/register-qa.mjs')).href,
  cli, '--library', 'soccer-tackle-keeper-v2', '--fps', '60', '--out', output];
const child = spawnSync(process.execPath, args, {cwd: workspace, env, stdio: 'inherit'});
if (child.status !== 0) throw new Error(`Unchanged QA CLI failed with exit ${child.status}`);
process.env.SOCCER_TACKLE_QA_CLI = cliURL;
process.env.SOCCER_TACKLE_SOURCE_COMMIT = sourceCommit;
const {loadAssets, measureSeam} = await import('./qa-sources.mjs');
const {analyzeClip} = await import(pathToFileURL(path.join(qaRoot, 'metrics.mjs')));
const {rawClips, idle, run, records, byId} = await loadAssets({fps: 60});
const contextual = [];
const endpointReference = (clip, end) => ({...clip, frames: end ? clip.frames.slice(-2) : clip.frames.slice(0, 2)});
const gate = result => result.score >= 88 && result.coverage === 1 &&
  !Object.values(result.metrics).some(metric => metric.status === 'red' || metric.status === 'insufficient-data');
for (const clip of rawClips) {
  const precedingIds = rawClips.filter(candidate => candidate.entry.next === clip.id).map(candidate => candidate.id);
  const precedingId = clip.entry.preceding ?? precedingIds[0];
  const before = precedingId ? byId.get(precedingId) : idle;
  const after = clip.entry.next ? byId.get(clip.entry.next) : idle;
  assert(before && after, `${clip.id}: contextual predecessor or successor missing`);
  const entryReference = precedingId ? endpointReference(before, true).frames : idle.frames;
  const exitReference = clip.entry.next ? endpointReference(after, false).frames : idle.frames;
  const mirrorId = clip.id.includes('_left') ? clip.id.replace('_left', '_right') :
    clip.id.includes('_right') ? clip.id.replace('_right', '_left') : null;
  const mirror = mirrorId ? byId.get(mirrorId) : null;
  const metadata = {...clip.metadata, ...(mirror ? {mirrorFrames: mirror.frames} : {})};
  const result = analyzeClip({frames: clip.frames, duration: clip.duration, height: clip.height,
    metadata, idleFrames: {entry: entryReference, exit: exitReference}, clipId: clip.id, sport: 'soccer'});
  const entrySeams = precedingIds.map(id => measureSeam(byId.get(id), clip));
  if (precedingId && !precedingIds.includes(precedingId)) entrySeams.push(measureSeam(before, clip));
  const exitSeam = clip.entry.next ? measureSeam(clip, after) : null;
  contextual.push({id: clip.id, duration: clip.duration, sourceAsset: clip.asset, ...result, pass: gate(result),
    scoringScope: 'Raw serialized clip through unchanged analyzeClip API with actual preceding/next seam endpoints; not the raw-clip idle-only CLI score.',
    entryReference: precedingId ?? idle.id, exitReference: clip.entry.next ?? idle.id,
    symmetryReference: mirror?.id ?? null, entrySeams, exitSeam});
}
const report = JSON.parse(await readFile(path.join(output, 'report.json')));
const sequences = report.libraries.flatMap(library => library.clips).filter(clip => !clip.id.startsWith('idle_relaxed_reference_'));
const rawReport = {schemaVersion: 1, qaCommit: commit, sourceCommit, fps: 60,
  method: 'Unchanged pinned metrics.mjs analyzeClip API. Contextual endpoints use actual serialized neighboring clips; standalone action ends use the actual idle reference.',
  clips: contextual};
await writeFile(path.join(output, 'raw-contextual.json'), JSON.stringify(rawReport, null, 2) + '\n');
const seams = contextual.flatMap(clip => [...clip.entrySeams, ...(clip.exitSeam ? [clip.exitSeam] : [])]);
const adapterFiles = [];
for (const file of ['run-qa.mjs', 'qa-loader.mjs', 'qa-sources.mjs', 'register-qa.mjs']) {
  const bytes = await readFile(path.join(root, 'source', file));
  adapterFiles.push({path: `workout/island/design/soccer-tackle-keeper-v2/source/${file}`,
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), license: 'CC0-1.0'});
}
const dependencyFiles = [];
for (const file of ['three.module.js', 'LICENSE.three']) {
  const relative = `workout/island/design/soccer-motion-v8/runtime/vendor/${file}`;
  const bytes = await readFile(path.join(repo, relative));
  dependencyFiles.push({path: relative, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), license: 'MIT (existing repository dependency)'});
}
const summary = {schemaVersion: 1, qaCommit: commit, sourceCommit, toolFiles, adapterFiles, dependencyFiles, inputFiles: records,
  command: [process.execPath, ...args], adapter: 'Only the CLI source inventory is replaced; every scoring, parsing and reporting tool file is byte-identical to the pinned commit.',
  threshold: {minimumScore: 88, noRedMetrics: true, coverage: 1},
  pass: contextual.every(gate) && sequences.every(gate) && seams.every(seam => seam.maxMarkerMeters < .001 && seam.maxRotationDegrees < .1),
  rawContextual: contextual.map(({metrics, reasons, ...clip}) => ({...clip, metrics, reasons})),
  cliSequences: sequences.map(clip => ({id: clip.id, score: clip.score, coverage: clip.coverage, pass: gate(clip),
    sequence: clip.metadata.sequence, metrics: clip.metrics, reasons: clip.reasons})),
  referenceAssets: {idle: {id: idle.id, asset: idle.asset}, run: {id: run.id, asset: run.asset}},
  limitations: ['The CLI measures complete action/recovery sequences against idle; raw split clips use contextual API references.',
    'The original CLI does not measure transitions to run. Run is loaded for separate playback/transition verification.',
    'Skeleton and declared sole/contact probes are measured, not the full skinned mesh.',
    'No simulation movement is invented. Body-speed scoring is not applicable to these non-locomotion actions.',
    'A presentation contact event alone is not a measured ball interaction; only supplied independent ball trajectories enable ball-contact scoring.']};
for (const file of toolFiles) {
  const current = await readFile(path.join(workspace, file.path));
  assert.equal(createHash('sha256').update(current).digest('hex'), file.sha256, `Pinned tool modified: ${file.path}`);
}
await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({pass: summary.pass, rawClips: contextual.map(clip => ({id: clip.id, score: clip.score, pass: clip.pass})),
  sequences: summary.cliSequences.map(clip => ({id: clip.id, score: clip.score, pass: clip.pass}))}, null, 2));
if (!summary.pass) process.exitCode = 1;
