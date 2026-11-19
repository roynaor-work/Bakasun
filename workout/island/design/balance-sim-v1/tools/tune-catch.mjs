#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname, join} from 'node:path';
import {createSnapshot} from './snapshot.mjs';
import {profiles} from './profiles.mjs';
import {runTrial} from './adapters/criminal.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const snapshot = await createSnapshot(repoRoot);
try {
  const sourceConfig = JSON.parse(await readFile(join(snapshot.sourceRoot, 'workout/island/data/config.json'), 'utf8'));
  const experiments = [
    {id: 'baseline', parameters: []},
    {id: 'perfect-region-11', parameters: [
      {path: 'minigames.catchCriminal.tools.narrow.perfectY', before: 1.5, after: 1.1},
      {path: 'minigames.catchCriminal.tools.narrow.perfectX', before: .5, after: .75}]},
    {id: 'perfect-region-09', parameters: [
      {path: 'minigames.catchCriminal.tools.narrow.perfectY', before: 1.5, after: .9},
      {path: 'minigames.catchCriminal.tools.narrow.perfectX', before: .5, after: .75}]}
  ];
  const stages = [1, 5, 10], seeds = Array.from({length: 16}, (_,i) => 1701 + i), rows = [];
  for (const experiment of experiments) {
    const config = structuredClone(sourceConfig);
    for (const p of experiment.parameters) {
      const parts = p.path.split('.'); let target = config;
      for (const key of parts.slice(0, -1)) target = target[key];
      if (target[parts.at(-1)] !== p.before) throw Error('Unexpected source parameter: ' + p.path);
      target[parts.at(-1)] = p.after;
    }
    for (const stage of stages) for (const profile of profiles) {
      const trials = [];
      for (const seed of seeds) {
        const r = await runTrial({sourceRoot: snapshot.sourceRoot, config, stage, profile, seed});
        trials.push({seed, outcome: r.outcome, seconds: r.seconds, stars: r.stars,
          perfect: r.diagnostics.rawResult.perfect, performance: r.diagnostics.performance});
      }
      const wins = trials.filter(r => r.outcome === 'win').length;
      rows.push({experiment: experiment.id, stage, profile: profile.id, n: seeds.length, wins,
        winRate: wins / seeds.length, threeStarWins: trials.filter(r => r.stars === 3).length,
        meanStars: trials.reduce((n,r) => n + r.stars, 0) / seeds.length, trials});
      console.log(JSON.stringify(rows.at(-1), (key,value) => key === 'trials' ? undefined : value));
    }
  }
  const originalsUnchanged = await snapshot.verify();
  const output = {schemaVersion: 1, baseCommit: snapshot.manifest.baseCommit,
    sourceDigest: snapshot.manifest.sourceDigest, originalsUnchanged, experiments, stages, seeds,
    hypothesis: 'Assist aims at chest height 1.0 while perfect shots require narrow.perfectY=1.5 and perfectX=.5. Test reward recognition around the existing assisted hit; physics and hit probability stay unchanged.',
    limitation: 'Three-star reward reachability for these synthetic lead-marker controllers; not proof that a human cannot obtain three stars by aiming elsewhere.', rows};
  await writeFile(join(here, '../data/tuning-catch.json'), JSON.stringify(output, null, 2) + '\n');
} finally {
  await snapshot.cleanup();
}
