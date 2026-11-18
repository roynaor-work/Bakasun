#!/usr/bin/env node
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {availableParallelism, tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {Worker} from 'node:worker_threads';
import {profiles} from '../../balance-sim-v1/tools/profiles.mjs';
import {copyTools, createSnapshot, git, sha256} from '../../balance-sim-v1/tools/snapshot.mjs';
import {experiments} from './experiments.mjs';

const {values} = parseArgs({options: {
  output: {type: 'string'},
  samples: {type: 'string', default: '16'},
  jobs: {type: 'string', default: String(Math.min(4, availableParallelism()))},
}});
const samples = Number(values.samples), jobs = Number(values.jobs);
if (!values.output || !Number.isInteger(samples) || samples < 1 || samples > 256 ||
    !Number.isInteger(jobs) || jobs < 1 || jobs > 32) {
  throw new Error('Usage: node sim/run.mjs --output /path/to/new.json [--samples 1..256] [--jobs 1..32]');
}

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(packageDir, '../../../..');
const packagePath = 'workout/island/design/balance-patches-v1/';
const sourceAudit = 'workout/island/design/balance-sim-v1/data/source-manifest.json';
const trackedPatchNames = (await readdir(join(packageDir, 'patches'))).filter(name => name.endsWith('.patch')).sort();
assert.equal(trackedPatchNames.length, 8, 'Expected all eight runtime patches');
const patches = trackedPatchNames.map(name => join(packageDir, 'patches', name));
const patchHashes = Object.fromEntries(await Promise.all(patches.map(async (path, i) => [
  trackedPatchNames[i], sha256(await readFile(path)),
])));
const plan = experiments.flatMap(experiment => experiment.stages.flatMap(stage => profiles.map(profile => ({
  ...experiment, stage, profile, seeds: Array.from({length: samples}, (_, i) => experiment.seedStart + i),
}))));

function runJob(sourceRoot, job, search) {
  return new Promise((res, rej) => {
    const worker = new Worker(new URL('./trial-worker.mjs', import.meta.url), {workerData: {sourceRoot, job, search}});
    worker.once('message', res);
    worker.once('error', rej);
    worker.once('exit', code => rej(new Error(`${job.id} stage ${job.stage} worker exited with code ${code}`)));
  });
}

function summarize(experiment, profile, rows) {
  const count = predicate => rows.filter(predicate).length;
  const sum = metric => rows.reduce((total, result) => total + metric(result), 0);
  const mean = metric => Number((sum(metric) / rows.length).toFixed(4));
  const summary = {
    wins: count(r => r.outcome === 'win'),
    timeouts: count(r => r.outcome === 'timeout'),
    meanSeconds: mean(r => r.seconds),
    meanStars: mean(r => r.stars),
    threeStars: count(r => r.stars === 3),
    withinPatience: count(r => r.seconds <= profile.patienceSeconds),
  };
  if (experiment.adapter === 'fire') {
    summary.threeCertificateStars = count(r => r.diagnostics.certificateStars === 3);
    summary.meanCertificateStars = mean(r => r.diagnostics.certificateStars ?? 0);
  }
  if (experiment.adapter === 'soccer') {
    summary.objective = rows[0].objectives[0].id;
    summary.objectiveTarget = rows[0].objectives[0].target;
    summary.objectiveCompleted = count(r => r.objectives.every(o => o.complete));
    summary.lofts = sum(r => r.diagnostics.campaignStats.lofts);
    summary.headers = sum(r => r.diagnostics.campaignStats.headers);
  }
  if (experiment.adapter === 'hoops') {
    summary.gameSecondsMin = Math.min(...rows.map(r => r.diagnostics.gameSeconds));
    summary.gameSecondsMax = Math.max(...rows.map(r => r.diagnostics.gameSeconds));
  }
  if (experiment.adapter === 'aliens') summary.maxLives = rows[0].diagnostics.maxLives;
  if (experiment.adapter === 'alpine') {
    summary.targetMs = rows[0].objectives.time.target;
    summary.timeGoalMet = count(r => r.objectives.time.met);
  }
  return summary;
}

function compare(job, original, off, on) {
  assert.deepStrictEqual(off, original, `Flags off changed trials: ${job.id}/${job.stage}/${job.profile.id}`);
  if (['catch', 'fire-certificate', 'alpine', 'alpine-gear'].includes(job.id)) {
    const gameplay = r => [r.outcome, r.seconds, r.falls];
    assert.deepStrictEqual(on.map(gameplay), original.map(gameplay), `Reward flag altered timing or outcome: ${job.id}/${job.stage}/${job.profile.id}`);
  }
  if (job.id === 'fire-certificate') {
    assert.deepStrictEqual(on.map(r => r.stars), original.map(r => r.stars), 'Certificate flag changed gameplay stars');
  }
  const before = summarize(job, job.profile, original);
  const after = summarize(job, job.profile, on);
  const gainedWins = on.filter((r, i) => r.outcome === 'win' && original[i].outcome !== 'win').length;
  const lostWins = on.filter((r, i) => r.outcome !== 'win' && original[i].outcome === 'win').length;
  return {experiment: job.id, stage: job.stage, profile: job.profile.id, pairs: job.seeds.length, before, after, gainedWins, lostWins};
}

assert.equal(git(repo, 'status', '--porcelain=v1', '--untracked-files=no'), '', 'Start with a clean source checkout');
const snapshot = await createSnapshot(repo);
const scratch = await mkdtemp(join(tmpdir(), 'bakasun-balance-patches-'));
try {
  const originalHashes = Object.fromEntries(Object.entries(snapshot.manifest.hashes).filter(([path]) => !path.startsWith(packagePath)));
  const sourceDigest = sha256(JSON.stringify(originalHashes));
  const audit = JSON.parse(await readFile(join(repo, sourceAudit), 'utf8'));
  assert.equal(sourceDigest, audit.sourceDigest, 'Game source differs from the balance-sim-v1 audit snapshot');
  const toolHashes = await copyTools(repo, snapshot.sourceRoot);
  const patchedRoot = join(scratch, 'patched');
  await cp(snapshot.sourceRoot, patchedRoot, {recursive: true});
  execFileSync('git', ['apply', '--whitespace=error-all', '--', ...patches], {cwd: patchedRoot, stdio: 'inherit'});

  const cells = new Array(plan.length);
  let next = 0, completed = 0, failure;
  await Promise.all(Array.from({length: Math.min(jobs, plan.length)}, async () => {
    while (!failure && next < plan.length) {
      const index = next++, job = plan[index];
      try {
        const original = await runJob(snapshot.sourceRoot, job, '');
        const off = await runJob(patchedRoot, job, '');
        const on = await runJob(patchedRoot, job, `?${job.flag}=1`);
        cells[index] = compare(job, original, off, on);
        process.stderr.write(`${++completed}/${plan.length} ${job.id}/${job.stage}/${job.profile.id}\n`);
      } catch (error) {
        failure ??= error;
      }
    }
  }));
  if (failure) throw failure;
  await snapshot.verify();

  const result = {
    schemaVersion: 1,
    auditedGameCommit: audit.baseCommit,
    sourceDigest,
    node: process.version,
    samplesPerCell: samples,
    flagOffTrialsEqual: plan.length * samples,
    pairedTrials: plan.length * samples,
    totalTrials: plan.length * samples * 3,
    patches: patchHashes,
    adapters: Object.fromEntries([...new Set(plan.map(job => job.adapter))].map(name => [name, toolHashes[`adapters/${name}.mjs`]])),
    profiles,
    experiments,
    cells,
  };
  const output = resolve(values.output);
  await mkdir(dirname(output), {recursive: true});
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
  console.log(`Wrote ${cells.length} cells and ${result.totalTrials} trials to ${output}`);
} finally {
  await snapshot.cleanup();
  await rm(scratch, {recursive: true, force: true});
}
