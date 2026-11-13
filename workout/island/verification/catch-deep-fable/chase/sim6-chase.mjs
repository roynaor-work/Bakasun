// Chase-only table for the v6 model driver: N chases per stage, three driver skills.
//   node workout/island/verification/catch-deep-fable/chase/sim6-chase.mjs [games=50] [--only=good] [--old] [--json out.json]
// Columns: stopped by tyres %, roadblock %, mean gap at the end (m), mean kerb seconds, mean crashes, mean seconds.
import {readFile, writeFile} from 'node:fs/promises';
import {createChaseEngine6, driveChase6, DRIVING6} from '../../../minigames/catch-chase6.mjs';
import {seededRandom} from '../../../minigames/catch-track.mjs';
const balance = JSON.parse(await readFile(new URL('../../../data/config.json', import.meta.url), 'utf8')).minigames.catchCriminal;
const args = process.argv.slice(2), games = Number(args[0]) || 50, only = (args.find(a => a.startsWith('--only=')) || '--only=expert,good,casual').slice(7).split(',');
// --old: the 10 m road of the first v6 build (three lanes of 3.3 m, shoulder at 4.3), for before/after comparisons
if (args.includes('--old')) balance.chase6 = {...(balance.chase6 || {}), roadHalf: 5, shoulder: 4.3, laneWidth: 3.3, lanes: [-3.3, 0, 3.3], parkedD: 3.9};
export function table(games, drivers) {
  const out = {};
  for (const name of drivers) {
    out[name] = [];
    for (let stage = 1; stage <= 10; stage++) {
      let tyres = 0, block = 0, gap = 0, scrape = 0, crashes = 0, secs = 0, rams = 0;
      for (let g = 1; g <= games; g++) {
        const ch = createChaseEngine6({balance, stage, seed: g}), r = driveChase6(ch, DRIVING6[name], seededRandom(g * 13 + stage));
        if (r.byTyres) tyres++; if (r.how === 'roadblock') block++; gap += Math.abs(r.gap); scrape += r.scrape; crashes += r.hits; secs += r.seconds; rams += ch.state.rams;
      }
      out[name].push({stage, tyres: tyres / games, roadblock: block / games, gap: gap / games, scrape: scrape / games, crashes: crashes / games, seconds: secs / games, rams: rams / games});
    }
  }
  return out;
}
const res = table(games, only);
for (const [name, rows] of Object.entries(res)) {
  console.log(`\n[${name}] stage  tyres%  roadblock%  gap m  kerb s  crashes  secs`);
  for (const r of rows) console.log(`         ${String(r.stage).padStart(2)}  ${(r.tyres * 100).toFixed(0).padStart(6)}  ${(r.roadblock * 100).toFixed(0).padStart(10)}  ${r.gap.toFixed(1).padStart(5)}  ${r.scrape.toFixed(2).padStart(6)}  ${r.crashes.toFixed(2).padStart(7)}  ${r.seconds.toFixed(1).padStart(4)}`);
}
const j = args.indexOf('--json'); if (j >= 0) await writeFile(args[j + 1], JSON.stringify({games, res}, null, 1));
