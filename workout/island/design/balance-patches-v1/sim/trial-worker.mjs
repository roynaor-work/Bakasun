import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parentPort, workerData} from 'node:worker_threads';

const {sourceRoot, job, search} = workerData;
globalThis.location = new URL(`https://example.invalid/workout/island/${search}`);
const island = join(sourceRoot, 'workout/island');
const load = file => import(pathToFileURL(join(island, file)).href);
const {runTrial} = await load(`design/balance-sim-v1/tools/adapters/${job.adapter}.mjs`);
let config = JSON.parse(await readFile(join(island, 'data/config.json'), 'utf8'));
if (job.adapter === 'hoops' && search) {
  // The v1 controller reads JSON directly. Apply the same transform as loadData.
  const {applyHoopsBalance} = await load('engine/load-data.mjs');
  config = applyHoopsBalance(config);
}

const rows = [];
for (const seed of job.seeds) {
  const result = await runTrial({
    sourceRoot, config: structuredClone(config), stage: job.stage, profile: job.profile, seed,
    variant: job.variant ?? {},
  });
  assert.ok(['win', 'lose', 'timeout'].includes(result.outcome), `No natural result at ${job.id}/${job.stage}/${job.profile.id}/${seed}: ${result.outcome}`);
  assert.ok(Number.isFinite(result.seconds) && result.seconds >= 0);
  assert.ok(Number.isInteger(result.stars) && result.stars >= 0 && result.stars <= 3);
  rows.push(result);
}
parentPort.postMessage(rows);
