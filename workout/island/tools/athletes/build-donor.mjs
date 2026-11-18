/** Builds assets/athletes-v1/gait-donor.json from the shipped soccer motion packs (the quality reference).
 * node workout/island/tools/athletes/build-donor.mjs */
import {writeFileSync, mkdirSync} from 'node:fs';
import {loadLibraries} from './load-libs.mjs';
import {buildDonor} from '../../minigames/athletes-gait.mjs';
const L = loadLibraries();
const donor = buildDonor({walk: L['soccer-v9'].walk, jog: L['soccer-v9'].jog, run: L['soccer-v10'].run || L['soccer-v9'].run, sprint: L['soccer-v9'].sprint});
const out = new URL('../../assets/athletes-v1/gait-donor.json', import.meta.url);
mkdirSync(new URL('./', out), {recursive: true});
writeFileSync(out, JSON.stringify(donor));
console.log('donor', Object.entries(donor.gaits).map(([k, g]) => `${k}:${g.source} lean ${g.lean} swing ${g.swing} abd ${g.armAbdMax}`).join(' | '));
