import {readFile} from 'node:fs/promises';
import {createChaseEngine6, driveChase6, DRIVING6} from '/home/user/Bakasun/workout/island/minigames/catch-chase6.mjs';
const config = JSON.parse(await readFile('/home/user/Bakasun/workout/island/data/config.json', 'utf8'));
const balance = config.minigames.catchCriminal;
// (1) the oil's effect, stage 3 (the slick is on a straight): centred wheel, then full counter-steer, on the slick vs on clean road
for (const [name, onOil] of [['on oil', true], ['clean road', false]]) {
  const ch = createChaseEngine6({balance, stage: 3, seed: 3, equipment: {}}); const st = ch.state, o = ch.obstacles.find(o => o.kind === 'oil');
  while (st.phase !== 'run') ch.step(1 / 60);
  st.s = o.s - 24; st.d = onOil ? o.d : o.d - 3.6; st.steer = 0; st.v = 22; st.crim.s = st.s + 30; st.crim.d = 0; st.crim.v = 22;
  let g = 0; while (st.oil <= 0 && g++ < 120 && onOil) { ch.setSteer(0); ch.step(1 / 60); } if (!onOil) for (let i = 0; i < 58; i++) { ch.setSteer(0); ch.step(1 / 60); }
  const d0 = st.d, oilT = st.oil; const trace = [];
  for (let i = 0; i < 90; i++) { ch.setSteer(-1); ch.step(1 / 60); if (i % 15 === 14) trace.push(+(st.d - d0).toFixed(2)); }
  console.log(name, 'oil', +oilT.toFixed(2), 'steer -1 for 1.5 s, lateral change every .25 s:', trace.join(' '), 'slide', +st.slide.toFixed(2));
}
// (2) skipped obstacles in a real chase: per frame, obstacles inside the officer's crash window that sit after the loop's break point
let totalFrames = 0, skippedFrames = 0, skippedKinds = {}, byStage = {};
for (let stage = 1; stage <= 10; stage++) for (let seed = 1; seed <= 6; seed++) {
  const ch = createChaseEngine6({balance, stage, seed, equipment: {}}); const st = ch.state, obs = ch.obstacles; let rnd = (() => { let x = seed * 9301 + 49297; return () => (x = (x * 9301 + 49297) % 233280) / 233280; })();
  let frames = 0, sk = 0;
  while (st.phase !== 'end' && frames++ < 60 * 90) {
    driveChase6(ch, DRIVING6.good, rnd); ch.step(1 / 60); ch.drainEvents();
    if (st.phase !== 'run') continue; totalFrames++;
    let broke = false;
    for (const o of obs) { const os = o.kind === 'traffic' ? o.s + o.v * st.t : o.s; if (!broke) { if (os < st.s - 12 && os < st.crim.s - 12) continue; if (os > st.crim.s + 20 && os > st.s + 20) { broke = true; } else continue; }
      if (broke && Math.abs(os - st.s) < 8) { sk++; skippedKinds[o.kind] = (skippedKinds[o.kind] || 0) + 1; } }
  }
  skippedFrames += sk; byStage[stage] = (byStage[stage] || 0) + sk;
}
console.log('frames in run', totalFrames, 'frames with an obstacle within 8 m of the officer skipped by the loop break', skippedFrames, 'kinds', JSON.stringify(skippedKinds), 'byStage', JSON.stringify(byStage));
