#!/usr/bin/env node
/** Equivalence certificate for disabling unused presentation replay recording.
 * Full native matches on copied game source. No game-source file is rewritten.
 * node tools/probe-hoops-replay.mjs [--jobs 4] [--samples 16] [--seed-start 4701]
 */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Worker, parentPort, workerData, isMainThread} from 'node:worker_threads';
import {createSnapshot, copyTools, sha256} from './snapshot.mjs';

if (!isMainThread) {
  const {sourceRoot, jobs} = workerData;
  const config = JSON.parse(await readFile(join(sourceRoot, 'workout/island/data/config.json'), 'utf8'));
  const disabled = structuredClone(config); disabled.minigames.streetSlam.replay.hz = 0;
  const {runTrial} = await import(pathToFileURL(join(sourceRoot, 'workout/island/design/balance-sim-v1/tools/adapters/hoops-replay-observer.mjs')).href);
  for (const job of jobs) {
    const observed = {};
    // Balanced ordering limits warm-up bias in the informational timing sample.
    for (const mode of job.seed % 2 ? ['native', 'disabled'] : ['disabled', 'native']) {
      const start = performance.now();
      const result = await runTrial({...job, sourceRoot, config: mode === 'native' ? config : disabled});
      const runtimeMs = performance.now() - start;
      const nativeResult = result.__nativeResult;
      delete result.__nativeResult;
      observed[mode] = {result, nativeResult, runtimeMs,
        adapterHash: sha256(JSON.stringify(result)), nativeResultHash: sha256(JSON.stringify(nativeResult))};
    }
    const sameAdapter = observed.native.adapterHash === observed.disabled.adapterHash;
    const sameNative = observed.native.nativeResultHash === observed.disabled.nativeResultHash;
    parentPort.postMessage({stage: job.stage, profile: job.profile.id, seed: job.seed,
      sameAdapter, sameNative, nativeMs: observed.native.runtimeMs, disabledMs: observed.disabled.runtimeMs,
      nativeAdapterHash: observed.native.adapterHash, disabledAdapterHash: observed.disabled.adapterHash,
      nativeResultHash: observed.native.nativeResultHash, disabledResultHash: observed.disabled.nativeResultHash,
      outcome: observed.native.result.outcome, gameSeconds: observed.native.result.seconds,
      ...(sameAdapter && sameNative ? {} : {before: observed.native, after: observed.disabled})});
  }
} else {
  const here = dirname(fileURLToPath(import.meta.url)), repoRoot = resolve(here, '../../../../..');
  const arg = (name, fallback) => { const at = process.argv.indexOf('--' + name); return at < 0 ? fallback : process.argv[at + 1]; };
  const samples = Number(arg('samples', 16)), concurrency = Number(arg('jobs', 4)), seedStart = Number(arg('seed-start', 4701));
  if (![samples, concurrency, seedStart].every(Number.isSafeInteger) || samples < 1 || concurrency < 1 || concurrency > 8 || seedStart < 0) throw Error('Invalid arguments');
  const output = resolve(arg('output', join(here, '../data/hoops-replay-equivalence.json')));
  if (!output.startsWith(resolve(here, '..') + '/') && !output.startsWith('/tmp/')) throw Error('Output must be in this package or /tmp');
  const snapshot = await createSnapshot(repoRoot), workers = [];
  try {
    const hashes = await copyTools(repoRoot, snapshot.sourceRoot);
    const copiedTools = join(snapshot.sourceRoot, 'workout/island/design/balance-sim-v1/tools');
    const adapter = await readFile(join(copiedTools, 'adapters/hoops.mjs'), 'utf8');
    const marker = 'engine.dispose();return output;';
    if (adapter.split(marker).length !== 2) throw Error('Hoops observer anchor changed');
    // Observe the already-created native result before disposal. This changes
    // only a new harness file; neither engine source nor its commands are changed.
    const observer = adapter.replace(marker, 'output.__nativeResult=r;engine.dispose();return output;');
    await writeFile(join(copiedTools, 'adapters/hoops-replay-observer.mjs'), observer);
    const enginePath = 'workout/island/minigames/hoops-engine.mjs';
    const engineText = await readFile(join(snapshot.sourceRoot, enginePath), 'utf8');
    const references = engineText.split('\n').flatMap((line, index) => /\bhistory\b|C\.replay/.test(line) ? [{line: index + 1, text: line.trim()}] : []);
    const {profiles} = await import(pathToFileURL(join(copiedTools, 'profiles.mjs')).href);
    const selected = profiles.filter(p => ['regular', 'skilled'].includes(p.id));
    const stages = [1, 10], seeds = Array.from({length: samples}, (_,i) => seedStart + i), jobs = [];
    for (const seed of seeds) for (const stage of stages) for (const profile of selected) jobs.push({stage, profile, seed});
    const rows = [], start = performance.now();
    await Promise.all(Array.from({length: Math.min(concurrency, jobs.length)}, (_,index) => new Promise((yes,no) => {
      const assigned = jobs.filter((_,i) => i % concurrency === index);
      const worker = new Worker(new URL(import.meta.url), {workerData: {sourceRoot: snapshot.sourceRoot, jobs: assigned}});
      workers.push(worker);
      worker.on('message', row => { rows.push(row); process.stderr.write(`hoops replay ${rows.length}/${jobs.length}: stage${row.stage} ${row.profile} seed${row.seed}, identical=${row.sameAdapter && row.sameNative}\n`); });
      worker.on('error', no); worker.on('exit', code => code === 0 ? yes() : no(Error('Replay equivalence worker exit ' + code)));
    })));
    rows.sort((a,b) => a.stage-b.stage || a.profile.localeCompare(b.profile) || a.seed-b.seed);
    const originalsUnchanged = await snapshot.verify(), same = rows.every(r => r.sameAdapter && r.sameNative);
    const sum = key => rows.reduce((n,r) => n + r[key], 0), sorted = key => rows.map(r => r[key]).sort((a,b) => a-b);
    const median = values => (values[Math.floor((values.length-1)/2)] + values[Math.ceil((values.length-1)/2)]) / 2;
    const result = {schemaVersion: 1, baseCommit: snapshot.manifest.baseCommit, sourceDigest: snapshot.manifest.sourceDigest,
      sourceHashes: {[enginePath]: snapshot.manifest.hashes[enginePath]}, controllerHash: hashes['adapters/hoops.mjs'],
      observerHash: sha256(observer), originalsUnchanged, samples, stages, seeds, profiles: selected, pairs: rows.length, trialCount: rows.length * 2,
      allAdapterMetricsByteIdentical: rows.every(r => r.sameAdapter), allNativeResultsByteIdentical: rows.every(r => r.sameNative),
      parameter: {path: 'minigames.streetSlam.replay.hz', before: 30, after: 0, scope: 'temporary cloned simulator config only'},
      staticProof: {references,
        observations: ['Every recordHistory invocation follows S.tick++, so tick is a positive finite integer.',
          'hz=0 makes Math.round(60/hz)=Infinity; tick%Infinity=tick is truthy, returning before snapshot allocation.',
          'history is used only by reset, recordHistory, replay getter and disposal; physics and AI never read it.',
          'snapshot/snapshotPlayers/speedCap/eff only read state and allocate derived values; they neither draw RNG nor advance clocks.',
          'The bot adapter never calls engine.replay. Replay presentation is already excluded from the headless measurement.']},
      benchmark: {wallSeconds: (performance.now()-start)/1000, nativeTotalMs: sum('nativeMs'), disabledTotalMs: sum('disabledMs'),
        aggregateSpeedup: sum('nativeMs')/sum('disabledMs'), nativeMedianMs: median(sorted('nativeMs')), disabledMedianMs: median(sorted('disabledMs')),
        limitation: 'Balanced sequential pair ordering, concurrent workers and other repository jobs; elapsed timings are indicative, not a controlled isolated benchmark.'}, rows};
    await mkdir(dirname(output), {recursive: true}); await writeFile(output, JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({output, pairs: rows.length, same, speedup: result.benchmark.aggregateSpeedup}));
    if (!same) process.exitCode = 1;
  } finally {
    for (const worker of workers) await worker.terminate();
    await snapshot.cleanup();
  }
}
