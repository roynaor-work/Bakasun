/** Ski v24.1 measurements: control (response, overshoot, turn distance, drift in a turn, lip launches, braking, the body pointing where
 * the skis go) and content (what a course holds, how often something new happens), in simulation time at 60 Hz, the race's own physics.
 * Usage: node workout/island/tools/alpine-v241-measure.mjs [--root <island dir>] [--off] [--label name] [--json out.json] [--races 8]
 * --root measures any checkout of workout/island (an old tree measures v24); --off measures this tree with ?alpineV241=0 (withoutV241).
 * Every number comes from createAlpineEngine with the tree's config.json; the child-like bot is tools/alpine-league-bot.mjs of the tree. */
import {readFile, writeFile, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const root = path.resolve(arg('--root', fileURLToPath(new URL('..', import.meta.url))));
const has = async f => { try { await access(path.join(root, f)); return true; } catch { return false; } };
const mod = f => import(pathToFileURL(path.join(root, f)).href);
const {createAlpineEngine} = await mod('minigames/alpine-engine.mjs');
const {generateCourse} = await mod('minigames/alpine-track.mjs');
const {leagueBalance} = await mod('minigames/alpine-league-stages.mjs');
const L = await mod('minigames/alpine-league-core.mjs');
const {createKidBot} = await mod('tools/alpine-league-bot.mjs');
const steer = await mod('minigames/alpine-steer.mjs');
const v241 = await has('minigames/alpine-v241.mjs') ? await mod('minigames/alpine-v241.mjs') : null;
const config = JSON.parse(await readFile(path.join(root, 'data/config.json'), 'utf8'));
let base = config.minigames.alpineRush;
const off = process.argv.includes('--off');
if (off && v241) base = v241.withoutV241(base);
const on = !!(v241 && base.physics.v241);
const P = base.physics, DT = 1 / 60, MS = 1000 / 60, round = (v, d = 1) => v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d;
const out = {label: arg('--label', on ? 'v24.1' : 'v24'), root, v241: on, control: {}, races: {}, content: {}};
const C = out.control;

/** A straight (or constant-curvature) empty course with the real physics; rivals parked far behind. */
function bench({objects = [], kappa = 0, turnFrom = 0, warm = 8, boost = false, fast = false} = {}) {
  const b = structuredClone(base); b.physics.grid = [{s: 0, x: 0}, ...Array.from({length: 5}, (_, i) => ({s: -400 - i * 5, x: i * 2 - 4}))];
  if (fast) b.physics.baseSpeed = b.physics.boostSpeed;   // a held boost: the turn at boost speed for its whole length
  const count = 4000, path = kappa ? {count, kappa: new Float64Array(count).fill(kappa, turnFrom)} : null;
  const course = {id: 'bench', length: 3000, objects: objects.map((o, i) => ({id: `o-${i}`, ...o})), rows: [], path, coins: 0};
  const e = createAlpineEngine({balance: b, stage: 1, seed: 9, course}); e.command({type: 'start'});
  while (e.phase === 'countdown') e.step(DT); e.drainEvents();
  if (boost) e.command({type: 'boost'});
  for (let i = 0; i < warm * 60; i++) { e.command({type: 'steer', value: 0}); e.step(DT); }
  return e;
}
const me = e => e.debug()[0];
const heading = d => Math.atan2(d.vx, Math.max(1e-6, d.speed)) * 180 / Math.PI;

// 1. Response: stick full right on a straight at cruising speed.
{
  const e = bench(), x0 = me(e).x; let lean = null, moves = null;
  for (let n = 1; n <= 60 && (lean === null || moves === null); n++) { e.command({type: 'steer', value: 1}); e.step(DT); if (lean === null && e.snapshot().player.lean >= .2) lean = n * MS; if (moves === null && Math.abs(me(e).x - x0) >= .15) moves = n * MS; }
  C.responseLeanMs = round(lean); C.responseMoveMs = round(moves);
}
// 2. Lane change like a child: full stick until the board is 3 m across, then let go. Overshoot past the lane, time to settle in it,
//    and the downhill metres the move takes (turn distance). Also a dodge: metres downhill to move one board width (1.7 m).
function laneChange({target = 3, boost = false} = {}) {
  const e = bench({boost}), s0 = me(e).s; let reached = null, n = 0;
  for (; n < 240 && reached === null; n++) { e.command({type: 'steer', value: 1}); e.step(DT); if (me(e).x >= target) reached = n; }
  const sReach = me(e).s; let peak = me(e).x, settled = null;
  for (let k = 1; k <= 240; k++) { e.command({type: 'steer', value: 0}); e.step(DT); const d = me(e); peak = Math.max(peak, d.x); if (settled === null && Math.abs(d.vx) < .3) settled = k; }
  return {overshootM: round(peak - target, 2), settleMs: round(settled * MS), turnDistanceM: round(sReach - s0, 1), settleDistanceM: null};
}
C.laneChange = laneChange(); C.laneChangeBoost = laneChange({boost: true});
// The same 3 m move with the stick pulled down first (0.6 s of brake, then down-and-across): the turn distance when the child slows down.
{
  const e = bench(); for (let n = 0; n < 36; n++) { e.command({type: 'steer', value: 0}); e.command({type: 'brake', value: 1}); e.step(DT); }
  const s0 = me(e).s; for (let n = 0; n < 240 && me(e).x < 3; n++) { e.command({type: 'steer', value: 1}); e.command({type: 'brake', value: 1}); e.step(DT); }
  C.brakingTurnDistanceM = round(me(e).s - s0, 1);
}
{ const e = bench(), s0 = me(e).s; for (let n = 0; n < 240 && me(e).x < 1.7; n++) { e.command({type: 'steer', value: 1}); e.step(DT); } C.dodgeDistanceM = round(me(e).s - s0, 1); }
// 3. The bot's proportional steering (gain .7) to a lane 3 m across: overshoot and time inside +-0.25 m.
{
  const e = bench(); let peak = 0, inside = null;
  for (let n = 1; n <= 300; n++) { const d = me(e); e.command({type: 'steer', value: Math.max(-1, Math.min(1, (3 - d.x) * .7))}); e.step(DT); peak = Math.max(peak, me(e).x); if (inside === null && Math.abs(me(e).x - 3) < .25 && Math.abs(me(e).vx) < .4) inside = n; }
  C.pilotOvershootM = round(peak - 3, 2); C.pilotSettleMs = round(inside * MS);
}
// 4. A turn (radius 90 m) with the stick centred: how far the rider drifts toward the outer wall in 1.5 s, at cruise and boosted.
function drift(boost) {
  // Up to speed on a straight (the turn starts at 260 m), then the stick stays centred through the turn.
  const e = bench({kappa: 1 / 90, turnFrom: 260, warm: 0, fast: boost});
  while (me(e).s < 260) { e.command({type: 'steer', value: 0}); e.step(DT); }
  e.drainEvents(); const x0 = me(e).x; let wall = null, lip = false;
  for (let n = 1; n <= 240; n++) { e.command({type: 'steer', value: 0}); e.step(DT); const d = me(e); if (wall === null && Math.abs(d.x) > P.pipe.flatHalf) wall = n; if (e.drainEvents().some(ev => ev.type === 'takeoff' && ev.riderId === 'player' && ev.objectId === 'lip')) lip = true; if (n === 90) C[boost ? 'turnDrift15BoostM' : 'turnDrift15M'] = round(Math.abs(d.x - x0), 2); }
  return {wallMs: wall === null ? null : round(wall * MS), lip};
}
{ const a = drift(false), b = drift(true); C.turnWallMs = a.wallMs; C.turnWallBoostMs = b.wallMs; C.turnLipLaunch = a.lip; C.turnLipLaunchBoost = b.lip; }
// 5. Where the skis point: a slalom input (stick = sin, 2.4 s period) for 7 s; mean and largest gap between the shown body yaw and the
//    real direction of travel, in degrees. v24 shows carvePose(tilt).yaw; v24.1 the travel-true yaw (alpine-steer travelYaw).
{
  const e = bench(); let body = 0, sum = 0, max = 0, n = 0;
  for (let k = 1; k <= 420; k++) {
    e.command({type: 'steer', value: Math.sin(k / 60 * Math.PI * 2 / 2.4)}); e.step(DT);
    const f = e.snapshot().player, d = me(e); body = steer.followBody(body, steer.bodyTarget(f), DT);
    const yaw = on && steer.travelYaw ? steer.travelYaw(body, f, d.speed) : steer.carvePose(body, Math.min(1, d.speed * 3.6 / 90)).yaw;
    if (k > 60) { const gap = Math.abs(yaw * 180 / Math.PI - heading(d)); sum += gap; max = Math.max(max, gap); n++; }
  }
  C.yawGapMeanDeg = round(sum / n); C.yawGapMaxDeg = round(max);
}
// 6. Braking (stick pulled down): speed after 1 s, time to lose 25%, and the sharpest heading a full stick gives while braking.
{
  const e = bench(), v0 = me(e).speed; let t25 = null;
  for (let n = 1; n <= 60; n++) { e.command({type: 'steer', value: 0}); e.command({type: 'brake', value: 1}); e.step(DT); if (t25 === null && me(e).speed <= v0 * .75) t25 = n; }
  C.brakeKmhStart = round(v0 * 3.6); C.brakeKmhAfter1s = round(me(e).speed * 3.6); C.brakeMinus25Ms = t25 === null ? null : round(t25 * MS);
  for (let n = 1; n <= 30; n++) { e.command({type: 'steer', value: 1}); e.command({type: 'brake', value: 1}); e.step(DT); }
  C.brakeHeadingDeg = round(heading(me(e)));
  const f = bench(); for (let n = 1; n <= 30; n++) { f.command({type: 'steer', value: 1}); f.step(DT); } C.cruiseHeadingDeg = round(heading(me(f)));
  e.command({type: 'brake', value: 0}); let back = null; for (let n = 1; n <= 300 && back === null; n++) { e.command({type: 'steer', value: 0}); e.step(DT); if (me(e).speed >= v0 * .97) back = n; }
  C.brakeRecoverMs = back === null ? null : round(back * MS);
}

// 7. The child-like bot on league stages: falls, unintended lip launches, time on the walls, place goal; plus the three ski stages.
const races = Number(arg('--races', 8)), STAGES = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 30];
const R = {races: 0, crashes: 0, lipLaunches: 0, wallTicks: 0, ticks: 0, passed: 0, ms: 0, coins: 0, collected: 0, hazardHits: 0, events: 0, eventKinds: new Set(), brakes: 0, perStage: {}};
for (const n of STAGES) {
  const row = {races: 0, crashes: 0, lip: 0, passed: 0, ms: 0};
  for (let k = 0; k < races; k++) {
    const balance = leagueBalance(base, n), seed = 900 + k * 37 + n, e = createAlpineEngine({balance, stage: L.engineStageOf(n), seed, equipment: L.equipmentFor({skis: Math.min(5, Math.floor((n - 1) / 5)), helmet: 0, goggles: 0}), power: 1});
    const bot = createKidBot({seed: seed * 7 + 1, physics: balance.physics});
    e.command({type: 'start'});
    for (let f = 0; f < 60 * 260 && e.phase !== 'finished'; f++) {
      if (e.phase === 'racing') { const d = bot.decide(e.snapshot()); e.command({type: 'steer', value: d.steer}); if (d.boost) e.command({type: 'boost'}); if (d.trick) e.command({type: 'trick', id: d.trick}); if (d.brake !== undefined) e.command({type: 'brake', value: d.brake}); }
      e.step(DT);
      for (const ev of e.drainEvents()) {
        if (ev.riderId !== 'player') continue;
        if (ev.type === 'takeoff' && ev.objectId === 'lip') { R.lipLaunches++; row.lip++; }
        if (ev.type === 'pickup') R.collected++;
        if (ev.type === 'collision' && ev.objectType && !['rock', 'gate', 'ramp', 'rider'].includes(ev.objectType)) R.hazardHits++;
        if (!['countdown', 'overtake', 'boost-end', 'land'].includes(ev.type)) { R.events++; R.eventKinds.add(ev.type === 'pickup' || ev.type === 'collision' || ev.type === 'section' ? `${ev.type}:${ev.objectType || ev.kind || ''}` : ev.type); }
      }
      if (e.phase === 'racing') { R.ticks++; if (Math.abs(me(e).x) > P.pipe.flatHalf) R.wallTicks++; }
    }
    const r = e.snapshot().result, passed = r.completed && r.rank <= L.stageInfo(n).targetRank;
    R.races++; R.crashes += r.crashes; R.passed += passed ? 1 : 0; R.ms += r.elapsedMs; R.coins += r.coins;
    row.races++; row.crashes += r.crashes; row.passed += passed ? 1 : 0; row.ms += r.elapsedMs;
  }
  R.perStage[n] = {pass: round(row.passed / row.races * 100, 0), crashes: round(row.crashes / row.races, 2), lip: round(row.lip / row.races, 2), seconds: round(row.ms / row.races / 1000, 1)};
}
out.races = {races: R.races, stages: STAGES, crashesPerRace: round(R.crashes / R.races, 2), lipLaunchesPerRace: round(R.lipLaunches / R.races, 2), wallTimePct: round(R.wallTicks / R.ticks * 100, 1),
  passPct: round(R.passed / R.races * 100, 1), meanSeconds: round(R.ms / R.races / 1000, 1), coinsPerRace: round(R.coins / R.races, 1), pickupsPerRace: round(R.collected / R.races, 2), hazardHitsPerRace: round(R.hazardHits / R.races, 2),
  eventsPerMinute: round(R.events / (R.ms / 60000), 1), eventKinds: R.eventKinds.size, eventKindList: [...R.eventKinds].sort(), perStage: R.perStage};

// 8. Content: what the courses hold (object kinds, sections), and how long the longest stretch without anything new on the course lasts.
const courseOf = n => { const b = leagueBalance(base, n), level = b.levels[L.engineStageOf(n) - 1]; return generateCourse({...b.tracks[level.trackId], id: level.trackId}, b.physics); };
const kinds = new Set(), perTheme = {}, rows = [];
for (let n = 1; n <= L.STAGE_COUNT; n++) {
  const c = courseOf(n), types = new Set(c.objects.map(o => o.type === 'warn' ? null : o.type).filter(Boolean)), theme = L.stageInfo(n).theme;
  for (const t of types) kinds.add(t); (perTheme[theme] ||= new Set()); for (const t of types) perTheme[theme].add(t);
  // Longest stretch (m) with only rocks and coins (the plain filler), and how many section kinds the course announces.
  let longest = 0, from = c.objects[0]?.s ?? 0;
  for (const o of c.objects) { if (o.type === 'rock' || o.type === 'coin' || o.type === 'warn') continue; longest = Math.max(longest, o.s - from); from = o.s; }
  rows.push({n, theme, types: types.size, sections: (c.sections || []).length, sectionKinds: new Set((c.sections || []).map(s => s.kind)).size, plainStretchM: Math.round(longest)});
}
const avg = k => round(rows.reduce((a, r) => a + r[k], 0) / rows.length, 1);
out.content = {objectKinds: [...kinds].sort(), objectKindCount: kinds.size, kindsPerTheme: Object.fromEntries(Object.entries(perTheme).map(([k, v]) => [k, [...v].sort()])),
  meanTypesPerCourse: avg('types'), meanSectionsPerCourse: avg('sections'), meanSectionKindsPerCourse: avg('sectionKinds'), meanPlainStretchM: avg('plainStretchM'), maxPlainStretchM: Math.max(...rows.map(r => r.plainStretchM)),
  signatureDistinctThemes: new Set(Object.values(perTheme).map(s => [...s].sort().join('+'))).size};

const json = arg('--json', null); if (json) await writeFile(json, JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
