// QA check 6: throwsTotal / hitsNeeded / distance / wind per stage from the engine itself (node, no browser), with the v6 overrides merged
// the way catch-session6 does, and the chase mods for the two endings: stopped by tyres (closeness 1) and the barrier (closeness 0).
import {readFile, writeFile} from 'node:fs/promises';
import {createCatchEngine} from '../../../../minigames/catch-engine.mjs';
import {CHASE6} from '../../../../minigames/catch-chase6.mjs';
const config = JSON.parse(await readFile(new URL('../../../../data/config.json', import.meta.url), 'utf8'));
const balance = config.minigames.catchCriminal;
const balance6 = {...balance, levels: balance.levels.map(l => ({...l, ...(l.v6 || {})}))};
const lerp = (a, b, u) => a + (b - a) * u;
const modsFor = closeness => ({distScale: lerp(CHASE6.farFactor, CHASE6.nearFactor, closeness), windScale: lerp(CHASE6.windFar, CHASE6.windNear, closeness), extraThrows: closeness >= CHASE6.bonusThrowAt ? 1 : 0});
const rows = [];
for (let stage = 1; stage <= 10; stage++) {
  const row = {stage};
  for (const [name, closeness] of [['tyres', 1], ['barrier', 0]]) {
    const e = createCatchEngine({balance: balance6, stage, seed: 3, equipment: {}, city: {police: 0, prison: 0}, v2: true, mods: modsFor(closeness), feel: true, arch: true});
    const c = e.criminalAt(e.clock);
    row[name] = {throwsTotal: e.throwsTotal, hitsNeeded: e.hitsNeeded, crew: e.level.crew || 1, dist: +Math.hypot(c.x, c.z).toFixed(1), wind: +e.wind.toFixed(2), flee: e.level.flee, fleeMax: e.level.fleeMax ?? null};
  }
  rows.push(row); console.log(JSON.stringify(row));
}
await writeFile(new URL('../measurements-stages-node.json', import.meta.url), JSON.stringify({mods: {tyres: modsFor(1), barrier: modsFor(0)}, rows}, null, 1));
