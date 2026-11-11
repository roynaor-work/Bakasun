/** Alpine league season simulation (model, no browser): rival race times come from the measured engine times per stage
 * (tools/alpine-air-sim.mjs: best rival 72-82 s), scaled by each fixed driver's rating and the season; the player's time is the
 * stage pace times (1 + gap), faster with wax upgrades. Reports points, rank, coins and cups for several skill levels over 3 seasons.
 * node workout/island/tools/alpine-league-sim.mjs [--json out.json] */
import {writeFile} from 'node:fs/promises';
import * as L from '../minigames/alpine-league-core.mjs';
const BASE = {1: 73000, 2: 75500, 3: 82500}; // ms, best rival per stage at rating 1.0 (measured)
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
function run(gap, buyOrder) {
  const s = L.createLeague(), out = [];
  for (let season = 1; season <= 3; season++) {
    for (let r = 0; r < L.ROUNDS_PER_SEASON; r++) {
      const set = L.roundSetup(s), eq = set.equipment;
      const times = set.drivers.map(d => ({ id: d.id, t: BASE[set.stage] / d.rating * (1 + .012 * gauss()) }));
      const player = BASE[set.stage] * (1 + gap) / eq.wax * (1 + .02 * gauss());
      const order = [{ id: 'player', t: player }, ...times].sort((a, b) => a.t - b.t).map(x => x.id === 'player' ? 'player' : 'rival-' + (L.RIVAL_IDS.indexOf(x.id) + 1));
      L.applyRound(s, { order, elapsedMs: Math.round(player) });
      for (const name of buyOrder) { if (L.buyUpgrade(s, name).ok) break; }
    }
    out.push({ season, rank: s.seasonRank[season], points: s.table.player, coins: s.coins, cups: s.cups, upgrades: { ...s.upgrades } });
    if (!L.nextSeason(s).ok) break;
  }
  return out;
}
const skills = { 'מתחיל (+10%)': .10, 'ילד בן 7 רגיל (+6%)': .06, 'טוב (+3%)': .03, 'חזק (0%)': 0 };
const result = {};
for (const [name, gap] of Object.entries(skills)) {
  const runs = Array.from({ length: 200 }, () => run(gap, ['skis', 'boost']));
  result[name] = [1, 2, 3].map(sn => { const rs = runs.map(r => r[sn - 1]).filter(Boolean); return { season: sn, reached: rs.length / 200, avgRank: +(rs.reduce((a, r) => a + r.rank, 0) / (rs.length || 1)).toFixed(2), cupRate: +(rs.filter(r => r.rank === 1).length / (rs.length || 1)).toFixed(2), avgPoints: +(rs.reduce((a, r) => a + r.points, 0) / (rs.length || 1)).toFixed(1) }; });
}
const json = JSON.stringify(result, null, 1);
if (process.argv.includes('--json')) await writeFile(process.argv[process.argv.indexOf('--json') + 1], json); else console.log(json);
