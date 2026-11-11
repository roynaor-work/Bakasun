import {readFile} from 'node:fs/promises';
import {createChaseEngine6, driveChase6, DRIVING6} from '/home/user/Bakasun/workout/island/minigames/catch-chase6.mjs';
const config = JSON.parse(await readFile('/home/user/Bakasun/workout/island/data/config.json', 'utf8'));
const balance = config.minigames.catchCriminal;
let total = 0, skipped = 0, kinds = {}, byStage = {}, examples = [];
for (let stage = 1; stage <= 10; stage++) for (let seed = 1; seed <= 8; seed++) {
  const ch = createChaseEngine6({balance, stage, seed, equipment: {}}); const st = ch.state, obs = ch.obstacles;
  let x = seed * 9301 + 49297; const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  const orig = ch.step;
  ch.step = dt => {
    if (st.phase === 'run') { total++; let broke = false;
      for (const o of obs) { const os = o.kind === 'traffic' ? o.s + o.v * st.t : o.s;
        if (!broke) { if (os < st.s - 12 && os < st.crim.s - 12) continue; if (os > st.crim.s + 20 && os > st.s + 20) broke = true; else continue; }
        if (Math.abs(os - st.s) < 4 && o.kind !== "traffic" && Math.abs(st.d - o.d) < ch.C.hitLateral) { skipped++; kinds[o.kind] = (kinds[o.kind] || 0) + 1; byStage[stage] = (byStage[stage] || 0) + 1; if (examples.length < 6) examples.push({stage, seed, t: +st.t.toFixed(1), s: Math.round(st.s), crimS: Math.round(st.crim.s), kind: o.kind, os: Math.round(os), d: o.d, carD: +st.d.toFixed(1)}); } } }
    return orig(dt);
  };
  driveChase6(ch, DRIVING6.good, rnd);
}
console.log('run frames', total, 'frames with a static obstacle within 6 m of the officer after the loop break', skipped, 'kinds', JSON.stringify(kinds), 'byStage', JSON.stringify(byStage));
console.log('examples', JSON.stringify(examples));
