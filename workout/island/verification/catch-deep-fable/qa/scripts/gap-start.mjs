// Why does the reticle lock within a second of the start? Gap, speeds and lock state over the first 8 seconds (stages 1, 2, 5, 10), model driver.
import {readFile} from 'node:fs/promises';
import {createChaseEngine6, DRIVING6} from '../../../../minigames/catch-chase6.mjs';
import {seededRandom} from '../../../../minigames/catch-track.mjs';
const config = JSON.parse(await readFile(new URL('../../../../data/config.json', import.meta.url), 'utf8')), balance = config.minigames.catchCriminal;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
for (const stage of [1, 2, 5, 10]) {
  const chase = createChaseEngine6({balance, stage, seed: 3}), st = chase.state, C = chase.C, rnd = seededRandom(7);
  const crimTop = Math.max(chase.spec.crimSpeed, C.baseSpeed + C.crimLead + (stage - 1) * C.crimLeadPerStage);
  console.log(`stage ${stage}: start gap ${chase.spec.gap} m, lock range ${chase.gun.state.range.toFixed(1)} m, officer base ${C.baseSpeed} boost ${C.baseSpeed + C.boostSpeed}, thief top ${crimTop.toFixed(1)} minus rubber up to ${C.rubberSlow} when gap > ${C.rubberFrom} m`);
  let locked = null; const dt = 1 / 60; let want = 0, timer = 0;
  while (st.t < 8) {
    if (st.phase === 'run') { timer -= dt; if (timer <= 0) { timer = .25; want = clamp(st.crim.d, -3.3, 3.3); } const wantVel = clamp((want - st.d) * 2.2, -C.steerSpeed, C.steerSpeed); chase.setSteer(clamp((wantVel - st.slide * .9) / C.steerSpeed, -1, 1)); chase.setBoost(st.tank > .12 && st.gap > 4 && Math.abs(chase.track.curvatureAt(st.s + 25)) < 1 / 110); }
    chase.step(dt); for (const e of chase.drainEvents()) if (e.type === 'lock' && e.on && locked === null) locked = st.t;
    if (st.phase === 'run' && Math.abs(st.t * 60 - Math.round(st.t * 60)) < 1e-6 && Math.round(st.t * 60) % 30 === 0) console.log(`  t=${st.t.toFixed(1)} s=${st.s.toFixed(0)} v=${st.v.toFixed(1)} thief v=${st.crim.v.toFixed(1)} gap=${st.gap.toFixed(1)} locked=${chase.gun.state.locked} chance=${chase.gun.state.hitChance.toFixed(2)}`);
  }
  console.log(`  first lock at t=${locked?.toFixed(2)} s`);
}
