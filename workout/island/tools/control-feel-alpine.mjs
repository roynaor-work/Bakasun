/** Alpine Rush control feel, measured deterministically at 60 Hz (simulation time, no GPU).
 * Usage: node tools/control-feel-alpine.mjs [--root <island dir>] [--label before|after] [--json out.json]
 * --root points at any checkout of workout/island, so the same script measures an old and a new tree.
 *
 * "Visible turn" = displayed lean >= VISIBLE (0.2: the threshold the character itself calls a carve; about 2.7 degrees of
 * root yaw plus the body tilt). Times count from the tick in which the stick value is set; add at most one frame (16.7 ms)
 * for the rAF that samples the stick and one frame for the display to get the end-to-end worst case on a 60 Hz phone.
 * Everything here is the same physics the race uses: createAlpineEngine with the tree's own config.json. */
import {readFile, writeFile, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const root = path.resolve(arg('--root', fileURLToPath(new URL('..', import.meta.url))));
const label = arg('--label', path.basename(root));
const mod = file => import(pathToFileURL(path.join(root, file)).href);
const {createAlpineEngine} = await mod('minigames/alpine-engine.mjs');
const config = JSON.parse(await readFile(path.join(root, 'data/config.json'), 'utf8'));
const balance = config.minigames.alpineRush, P = balance.physics, DT = 1 / 60, MS = 1000 * DT, VISIBLE = .2;
// --set key=value (repeatable): experiment with one physics value without editing config.json.
process.argv.forEach((a, i) => { if (a === '--set') { const [k, v] = process.argv[i + 1].split('='); P[k] = Number(v); } });
const only = arg('--only', null);

// Body model: the tree's own steer module when it has one, else the old character (lean smoothed at 7/s from the real lean).
let steer = null; try { await access(path.join(root, 'minigames/alpine-steer.mjs')); steer = await mod('minigames/alpine-steer.mjs'); } catch {}
const bodyFollow = steer ? steer.followBody : (cur, target, dt) => cur + (target - cur) * (1 - Math.exp(-7 * dt));
const bodyOf = steer ? steer.bodyTarget : f => f.lean;
const yawOf = steer ? steer.carvePose : tilt => ({yaw: tilt * .24, roll: 0});

/** Straight, empty course: a clean test bench with the real physics. */
function bench(objects = [], {warm = 8} = {}) {
  const b = structuredClone(balance); b.physics.grid = [{s: 0, x: 0}, ...Array.from({length: 5}, (_, i) => ({s: -200 - i * 5, x: i * 2 - 4}))];
  const course = {id: 'bench', length: 2400, objects: objects.map((o, i) => ({id: `o-${i}`, ...o})), rows: [], path: null, coins: 0};
  const e = createAlpineEngine({balance: b, stage: 1, seed: 9, course}); e.command({type: 'start'});
  while (e.phase === 'countdown') e.step(DT); e.drainEvents();
  for (let i = 0; i < warm * 60; i++) { e.command({type: 'steer', value: 0}); e.step(DT); }
  return e;
}
const player = e => e.snapshot().player;
const heading = (e, p = e.debug()[0]) => Math.atan2(p.vx, p.speed) * 180 / Math.PI;
const round = (v, d = 0) => v === null ? null : Math.round(v * 10 ** d) / 10 ** d;

/** Run until `until` returns true; returns the elapsed ms from the first tick (1 = the tick the command was applied). */
function timeTo(e, drive, until, limit = 120) {
  const track = {body: 0};
  for (let n = 1; n <= limit; n++) {
    drive(n); e.step(DT); const f = player(e); track.body = bodyFollow(track.body, bodyOf(f), DT);
    if (until(f, track, n)) return n * MS;
  }
  return null;
}

const out = {label, root, config: {lateralResponse: P.lateralResponse, steerExpo: P.steerExpo, steerAttack: P.steerAttack, steerRelease: P.steerRelease, turnPush: P.turnPush, steerBoostExpo: P.steerBoostExpo ?? 0, steerBoostSoften: P.steerBoostSoften ?? 0, lateralBoostDamp: P.lateralBoostDamp ?? 0}, metrics: {}};
const M = out.metrics;

if (only !== 'pilot') {
// 1. Stick deflected fully right on a straight run at cruising speed.
{
  const e = bench(), cmd = () => e.command({type: 'steer', value: 1}), t0 = e.debug()[0].x;
  M.engineLeanMs = timeTo(e, cmd, f => f.lean >= VISIBLE);
  const e2 = bench(); M.bodyLeanMs = timeTo(e2, () => e2.command({type: 'steer', value: 1}), (f, t) => Math.abs(t.body) >= VISIBLE);
  const e3 = bench(); M.yawVisibleMs = timeTo(e3, () => e3.command({type: 'steer', value: 1}), (f, t) => Math.abs(yawOf(t.body).yaw) * 180 / Math.PI >= 3 || Math.abs(t.body) >= VISIBLE * 1.4);
  // First sideways movement the eye can see: 0.15 m of track position.
  const e4 = bench(); const x4 = e4.debug()[0].x; M.trackMovesMs = timeTo(e4, () => e4.command({type: 'steer', value: 1}), () => Math.abs(e4.debug()[0].x - x4) >= .15);
  // Turn rate: heading after 100 / 250 ms, and the best average rate over the first 300 ms.
  const e5 = bench(); const h = [];
  for (let n = 1; n <= 30; n++) { e5.command({type: 'steer', value: 1}); e5.step(DT); h.push(heading(e5)); }
  M.heading100 = round(h[5], 1); M.heading250 = round(h[14], 1); M.turnRate300 = round(h[17] / .3, 0); M.peakHeading = round(Math.max(...h), 1);
  void cmd; void t0;
}

// 2. Stick-to-turn ratio at steady state (lateral speed share and heading) for a ladder of deflections.
M.ratio = [.25, .5, .75, 1].map(v => { const e = bench(); for (let i = 0; i < 30; i++) { e.command({type: 'steer', value: v}); e.step(DT); } const p = e.debug()[0]; return {stick: v, lean: round(player(e).lean, 3), headingDeg: round(heading(e, p), 1), lateral: round(p.vx, 2)}; });

// 3. Release: full deflection held 1 s, then centred. Time until straight (heading <= 1.5 deg) and to lean <= .1.
{
  const e = bench(); for (let i = 0; i < 60; i++) { e.command({type: 'steer', value: 1}); e.step(DT); }
  M.straightMs = timeTo(e, () => e.command({type: 'steer', value: 0}), () => Math.abs(heading(e)) <= 1.5);
  const e2 = bench(); for (let i = 0; i < 60; i++) { e2.command({type: 'steer', value: 1}); e2.step(DT); }
  const body = {v: bodyOf(player(e2))};
  M.bodyUprightMs = (() => { for (let n = 1; n <= 120; n++) { e2.command({type: 'steer', value: 0}); e2.step(DT); body.v = bodyFollow(body.v, bodyOf(player(e2)), DT); if (Math.abs(body.v) <= .1) return n * MS; } return null; })();
  // Reversal: right held, then full left. Time until the board moves left (heading < 0).
  const e3 = bench(); for (let i = 0; i < 60; i++) { e3.command({type: 'steer', value: 1}); e3.step(DT); }
  M.reverseMs = timeTo(e3, () => e3.command({type: 'steer', value: -1}), () => heading(e3) <= -2);
}

// 4. Boost: tap at cruising speed. Ticks to start, time to +10% speed, and steering response while boosting.
{
  const e = bench(); const v0 = e.debug()[0].speed; let startedAt = null, plus10 = null;
  e.command({type: 'boost'});
  for (let n = 1; n <= 120; n++) { e.command({type: 'steer', value: 0}); e.step(DT); const p = e.debug()[0]; if (startedAt === null && player(e).boosting) startedAt = n * MS; if (plus10 === null && p.speed >= v0 * 1.1) plus10 = n * MS; }
  M.boostStartMs = startedAt; M.boostPlus10Ms = plus10; M.boostBaseKmh = round(v0 * 3.6, 1);
  const eb = bench(); eb.command({type: 'boost'}); for (let i = 0; i < 120; i++) { eb.command({type: 'steer', value: 0}); eb.step(DT); }
  M.boostSpeedKmh = round(eb.debug()[0].speed * 3.6, 1);
  M.boostLeanMs = timeTo(eb, () => eb.command({type: 'steer', value: 1}), f => f.lean >= VISIBLE);
  const ebb = bench(); ebb.command({type: 'boost'}); for (let i = 0; i < 120; i++) { ebb.command({type: 'steer', value: 0}); ebb.step(DT); }
  M.boostBodyMs = timeTo(ebb, () => ebb.command({type: 'steer', value: 1}), (f, t) => Math.abs(t.body) >= VISIBLE);
  // Gentle input at boost speed (stick .3): heading reached after 250 ms.
  const eg = bench(); eg.command({type: 'boost'}); for (let i = 0; i < 120; i++) { eg.command({type: 'steer', value: 0}); eg.step(DT); }
  for (let i = 0; i < 15; i++) { eg.command({type: 'steer', value: .3}); eg.step(DT); } M.boostHeadingSmallStick = round(heading(eg), 2);
  const en = bench(); for (let i = 0; i < 15; i++) { en.command({type: 'steer', value: .3}); en.step(DT); } M.cruiseHeadingSmallStick = round(heading(en), 2);
}

// 5. Jump and trick: ramp at 30 m. Ticks from the trick request in the air to the trick starting; steering in the air.
{
  const e = bench([{type: 'ramp', x: 0, s: 60}]); let airAt = null, trickMs = null, n = 0;
  for (; n < 600 && airAt === null; n++) { e.command({type: 'steer', value: 0}); e.step(DT); if (player(e).airborne) airAt = n; }
  if (airAt !== null) {
    e.command({type: 'trick', id: 'grab'});
    for (let k = 1; k <= 30; k++) { e.step(DT); if (player(e).trick) { trickMs = k * MS; break; } }
    M.trickStartMs = trickMs;
    const ea = bench([{type: 'ramp', x: 0, s: 60}]); for (let i = 0; i < 600 && !player(ea).airborne; i++) { ea.command({type: 'steer', value: 0}); ea.step(DT); }
    M.airLeanMs = timeTo(ea, () => ea.command({type: 'steer', value: 1}), f => f.lean >= VISIBLE, 40);
  }
}

// 6. Fall: a rock dead ahead. Time from the hit to the first visible turn when the stick is pushed all the way.
{
  const e = bench([{type: 'rock', x: 0, s: 90, radius: .8}], {warm: 1}); let hit = null;
  for (let n = 0; n < 900 && hit === null; n++) { e.command({type: 'steer', value: 0}); e.step(DT); if (e.drainEvents().some(ev => ev.type === 'collision' && ev.riderId === 'player')) hit = n; }
  if (hit !== null) {
    const body = {v: 0}; let ms = null;
    for (let n = 1; n <= 200 && ms === null; n++) { e.command({type: 'steer', value: 1}); e.step(DT); body.v = bodyFollow(body.v, bodyOf(player(e)), DT); if (Math.abs(body.v) >= VISIBLE) ms = n * MS; }
    M.fallControlMs = ms; M.fallLockSeconds = P.crashSeconds;
  }
}

}
// 7. Rails: the numbers that must not move. A scripted lane pilot's finish time on three courses (calibration band 64-95 s).
{
  const times = [];
  for (const stage of [1, 2, 3]) {
    const e = createAlpineEngine({balance, stage, seed: 11}); e.command({type: 'start'});
    for (let n = 0; n < 30000 && e.phase !== 'finished'; n++) {
      if (e.phase === 'racing') {
        const d = e.debug()[0], objs = e.course.objects.filter(o => o.s > d.s + 1 && o.s < d.s + 40); let best = d.x, bc = Infinity;
        for (let cx = -8; cx <= 8; cx += .4) { let c = Math.abs(cx - d.x) * .12; for (const o of objs) { const near = 1 / (1 + (o.s - d.s) / 18);
          if (o.type === 'rock' && Math.abs(cx - o.x) < o.radius * P.rockHitScale + P.board.halfWidth + .25) c += 100 * near;
          if (o.type === 'gate' && Math.abs(Math.abs(cx - o.x) - P.gateHalfWidth) < 1.2) c += 100 * near;
          if (o.type === 'ramp') { const off = Math.abs(cx - o.x); if (off >= 1.6 && off < 2.5) c += 60 * near; }
          if (o.type === 'boost' && Math.abs(cx - o.x) < 1.3) c -= 4 * near; } if (c < bc) { bc = c; best = cx; } }
        e.command({type: 'steer', value: Math.max(-1, Math.min(1, (best - d.x) * .7))}); if (e.snapshot().boostReady) e.command({type: 'boost'});
      }
      e.step(DT);
    }
    const r = e.snapshot().result; times.push({stage, seconds: round(r.elapsedMs / 1000, 1), rank: r.rank, won: r.won});
  }
  M.pilotRaces = times;
}

for (const k of Object.keys(M)) if (typeof M[k] === 'number') M[k] = round(M[k], 1);
const json = arg('--json', null); if (json) await writeFile(json, JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
