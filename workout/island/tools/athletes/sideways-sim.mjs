/** "Walks sideways" measurement on the real basketball engine (no browser): AI vs AI on autopilot, every tick and every player on court.
 * For each moving player that plays a forward gait (not defending-slide, not acting) it measures the angle between the visible body front and the
 * travel direction, before (the simulation's face, what ships today) and after (stepHeading, the unified layer).
 * node workout/island/tools/athletes/sideways-sim.mjs [games=6] [out.json] */
import {readFileSync, writeFileSync} from 'node:fs';
import {createHoopsEngine, NO_INPUT} from '../../minigames/hoops-engine.mjs';
import {initialHoops, matchTeams} from '../../minigames/hoops-franchise.mjs';
import {compileHoopsTactics} from '../../minigames/hoops-tactics.mjs';
import {createHeading, stepHeading, sidewaysDeg, HEADING} from '../../minigames/athletes-gait.mjs';
const cfg = JSON.parse(readFileSync(new URL('../../data/config.json', import.meta.url), 'utf8')).minigames.streetSlam;
const tactics = compileHoopsTactics(JSON.parse(readFileSync(new URL('../../design/tactics/basketball.json', import.meta.url), 'utf8')));
export function measure({games = 6, seedBase = 4400, seconds = 150} = {}) {
  const buckets = {before: {n: 0, over45: 0, over60: 0, over90: 0}, after: {n: 0, over45: 0, over60: 0, over90: 0}};
  const dt = 1 / 60;
  for (let g = 0; g < games; g++) {
    const config = structuredClone(cfg), clubs = matchTeams(config, initialHoops(config), {stage: 1});
    const e = createHoopsEngine({config, seed: seedBase + g * 37, teams: clubs.teams, userTeam: 0, profile: 'quick', difficulty: 'normal', autopilot: true, aiVersion: 'v2'});
    e.setTacticsData(tactics);
    const S = e.debug.state, heads = new Map();
    for (let i = 0; i < 60 * seconds && S.phase !== 'final'; i++) {
      e.step(NO_INPUT); e.drainEvents();
      if (S.phase !== 'live') continue;
      for (const p of S.teams.flatMap(t => t.roster)) {
        if (!p.onCourt) continue;
        const speed = Math.hypot(p.vx, p.vz), defending = S.possession !== p.team && S.ball.state === 'held';
        let h = heads.get(p.id); if (!h) { h = createHeading(p.face); heads.set(p.id, h); }
        const yaw = stepHeading(h, p, {defending, hasBall: p.hasBall}, dt);
        const forwardGait = speed >= HEADING.minSpeed && !p.act && !p.stumble && !(defending && !p.hasBall && speed < 4.2);
        if (!forwardGait) continue;
        for (const [k, y] of [['before', p.face], ['after', yaw]]) {
          const a = sidewaysDeg(y, p.vx, p.vz), b = buckets[k]; b.n++; if (a > 45) b.over45++; if (a > 60) b.over60++; if (a > 90) b.over90++;
        }
      }
    }
  }
  const pct = (a, n) => n ? +(100 * a / n).toFixed(2) : 0, out = {games, seconds};
  for (const k of ['before', 'after']) { const b = buckets[k]; out[k] = {playerTicksMoving: b.n, over45Pct: pct(b.over45, b.n), over60Pct: pct(b.over60, b.n), over90Pct: pct(b.over90, b.n)}; }
  return out;
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const r = measure({games: +process.argv[2] || 6});
  console.log(JSON.stringify(r, null, 1));
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(r, null, 1));
}
