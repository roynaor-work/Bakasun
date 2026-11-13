/** "תפוס את הפושע": a turn-based throwing game. The police officer pulls back, aims
 * and throws a net or a lasso at a thief who is running away through the city.
 * Nobody shoots at anybody: the thief only runs, ducks behind cover or waits.
 *
 * Pure rules (no DOM, no Three.js) so the same code runs in the browser view and in
 * the 200-game-per-stage simulation (tools/catch-sim.mjs). World units are metres,
 * x runs down the street, y is up. Everything is a function of the clock, so the
 * flight that is resolved at release is exactly the flight that is replayed. */

export const PHASES = Object.freeze(['aim', 'throw', 'flight', 'impact', 'flee', 'caught', 'escape', 'done']);

/** Seeded generator local to the game (wind and the thief's phase). */
export function seededRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

const ARCH_Z = [0, -2.4, 2.4, -1.2, 1.2];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

/** Side-to-side offset of the thief inside his current spot, as a function of the
 * seconds since the turn started. 'stand' stays, 'pace' swings, 'dash' runs between
 * two points with a pause at each end. Returns offset (m) and speed sign. */
export function moveOffset(move, tt) {
  if (!move || move.kind === 'stand') return {offset: 0, running: false};
  if (move.kind === 'pace') {
    const w = 2 * Math.PI / move.period, p = move.phase || 0;
    return {offset: move.amp * Math.sin(w * tt + p), running: Math.abs(Math.cos(w * tt + p)) > .35};
  }
  // dash: -amp -> +amp, pause, +amp -> -amp, pause.
  const leg = 2 * move.amp / move.speed, cycle = 2 * (leg + move.pause), u = ((tt + (move.phase || 0)) % cycle + cycle) % cycle;
  if (u < leg) return {offset: -move.amp + move.speed * u, running: true};
  if (u < leg + move.pause) return {offset: move.amp, running: false};
  if (u < 2 * leg + move.pause) return {offset: move.amp - move.speed * (u - leg - move.pause), running: true};
  return {offset: -move.amp, running: false};
}

/** True while the head is above the cover (pop-up thieves). */
export function isExposed(pop, tt) {
  if (!pop) return true;
  const cycle = pop.up + pop.down, u = (((tt + (pop.phase || 0)) % cycle) + cycle) % cycle;
  return u < pop.up;
}

/** Tool values after city and equipment bonuses. */
export function toolValues(balance, toolId, bonus = {}) {
  const base = balance.tools[toolId];
  const radius = base.radius * (bonus.net || 1) * (1 + (bonus.police || 0)) * (bonus.level || 1);
  return {...base, id: toolId, radius};
}

function insideRect(o, x, y) { return x >= o.x - o.w / 2 && x <= o.x + o.w / 2 && y >= (o.y0 || 0) && y <= o.h; }

/** Creates one match: one stage, three throws. */
export function createCatchEngine({balance, stage = 1, seed = 1, equipment = {}, city = {}, v2 = false, mods = {}, feel = true, arch = false}) {
  const base = balance.levels[stage - 1];
  if (!base) throw Error('catch: unknown stage ' + stage);
  // v2 (chase, gangs, bosses, gusts, moving cover) is switched off with ?catchV2=0 and the stage plays as v1.
  // arch (v5): the throw is an archery shot at a thief sweeping across the street: yaw + pitch + power, a cross wind, several throws and 2-3 hits to catch.
  const isArch = Boolean(arch && v2 && base.zmove);
  const hitsNeeded = isArch ? (base.hits || 1) : (v2 && base.boss ? base.boss.hits : 1);
  const crewSize = v2 ? (base.crew || 1) : 1, bossHits = hitsNeeded;
  const level = v2 ? {...base, ...(!isArch && base.v4 ? base.v4 : {}), ...(!feel && base.v3 ? base.v3 : {}), aimHelp: feel ? base.aimHelp : 0, dist: mods.dist ?? base.dist * (mods.distScale ?? 1), wind: (base.wind || 0) * (mods.windScale ?? 1), obstacles: [...base.obstacles, ...(base.movers || [])].map((o, i) => isArch ? {z: ARCH_Z[i % ARCH_Z.length], zw: 1.3, ...o} : o)} : {...base, movers: [], gust: 0, crew: 1, boss: null};
  const throwsTotal = isArch ? (base.throws || balance.throws) + (mods.extraThrows || 0) : balance.throws + (v2 ? (crewSize - 1) * (balance.crewThrows || 2) + (bossHits - 1) * 2 + (mods.extraThrows || 0) : 0);
  const rnd = seededRandom((seed * 2654435761 + stage * 97) >>> 0);
  const P = balance.physics, C = balance.criminal;
  const bonus = {net: Number(equipment.net) || 1, police: city.police || 0, level: level.radiusScale || 1};
  const aimHelp = v2 ? (level.aimHelp || 0) : 0; // early stages: a longer arc, a landing ring and a green ring when the throw would catch
  const previewFraction = clamp(level.preview + (Number(equipment.scope) || 0) + .15 * aimHelp, 0.15, 1);
  const tools = level.tools.map(id => toolValues(balance, id, bonus));
  const aim = {angle: P.angle.start, power: P.powerStart, yaw: 0, tool: tools[0].id};
  const YAW = (P.yawMax ?? 24);
  const events = [];
  const wob = level.wobble || {angle: 0, power: 0};
  const turn = {index: 0, start: 0, wind: 0, windSign: 1, phase: rnd() * Math.PI * 2, popPhase: rnd() * 3};
  const wobSeed = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], gustPhase = rnd() * 6.28;
  /** Wind at an absolute time: the turn's wind plus a slow gust in v2 stages. */
  const windAt = t => turn.wind + (level.gust || 0) * Math.sin(2 * Math.PI * t / 3.7 + gustPhase);
  /** Moving cover (crossing cars) swings back and forth between min and max as a function of the clock. */
  const obstacleAt = (o, t) => { if (!o.v) return o; const span = o.max - o.min, u = ((o.x - o.min + o.v * t) % (2 * span) + 2 * span) % (2 * span); return {...o, x: o.min + (u <= span ? u : 2 * span - u)}; };
  /** Unsteady hand: a deterministic sway of the aim over the clock, visible in the preview. */
  function wobbleAt(t) {
    const a = wob.angle * (0.7 * Math.sin(2 * Math.PI * t / 2.3 + wobSeed[0]) + 0.3 * Math.sin(2 * Math.PI * t / 1.1 + wobSeed[1]));
    return {angle: a, power: wob.power * Math.sin(2 * Math.PI * t / 1.7 + wobSeed[2]), yaw: isArch ? (wob.yaw ?? wob.angle * .8) * Math.sin(2 * Math.PI * t / 1.9 + wobSeed[0] + 1.3) : 0};
  }
  const s = {phase: 'aim', clock: 0, phaseAt: 0, baseX: level.dist, fromX: level.dist, toX: level.dist, throwsLeft: throwsTotal, throwsTotal, thrown: 0, crewLeft: crewSize - 1, crimIndex: 0, caught: [], bossHp: bossHits, catches: 0, perfects: 0, nearMiss: false,
    flight: null, perfect: false, won: false, score: 0, performance: 0, usedTools: []};

  function rollWind() {
    const max = level.wind || 0;
    turn.wind = max ? (rnd() * 2 - 1) * max : 0;
    if (max && Math.abs(turn.wind) < max * .25) turn.wind = Math.sign(turn.wind || 1) * max * .25;
  }
  rollWind();

  const move = () => { const m = isArch ? level.zmove : level.move; return m ? {...m, phase: turn.phase} : null; };
  const pop = () => level.pop ? {...level.pop, phase: turn.popPhase} : null;

  /** Thief state at an absolute clock time; during a flee the base slides forward. */
  function criminalAt(t) {
    let x = s.baseX, z = 0, running = false, mode = 'idle', exposed = true;
    if (s.phase === 'flee' || s.phase === 'escape') {
      const u = (t - s.phaseAt) / (s.phase === 'flee' ? P.fleeSeconds : P.escapeSeconds * P.escapeRun);
      x = s.fromX + (s.toX - s.fromX) * smooth(u);
      z = (s.fromZ || 0) * (1 - smooth(u));
      running = u < 1; mode = running ? 'run' : 'idle'; if (u >= 1 && s.phase === 'escape') mode = 'gone';
    } else if (s.phase === 'caught') { mode = 'caught'; x = s.flight?.catchX ?? s.baseX; z = s.flight?.contact?.criminalZ ?? 0; }
    else {
      const tt = Math.max(0, t - turn.start), m = moveOffset(move(), tt);
      if (isArch) z = m.offset; else x += m.offset;
      running = m.running; exposed = isExposed(pop(), tt);
      mode = !exposed ? 'hide' : running ? 'run' : 'idle';
    }
    return {x, z, running, exposed, mode, y: exposed ? 0 : -C.hideDrop};
  }

  /** Free flight. `wind` false = the preview line the officer sees. */
  function trajectory(angle, power, toolId, {withWind = true, t0 = s.clock, stopAtObstacle = true, resolve = false, yaw = 0} = {}) {
    const tool = tools.find(t => t.id === toolId) || tools[0];
    const speed = tool.vmax * (P.powerMin + (1 - P.powerMin) * clamp(power, 0, 1));
    const a = angle * Math.PI / 180, dt = P.fixedStep;
    const yr = (isArch ? yaw : 0) * Math.PI / 180;
    let x = P.release.x, y = P.release.y, z = 0, vx = speed * Math.cos(a) * Math.cos(yr), vy = speed * Math.sin(a), vz = speed * Math.cos(a) * Math.sin(yr), t = 0;
    const g = tool.gravity;
    let minNear = 9;
    const path = [{t: 0, x, y, z}];
    let kind = 'out', contact = null, perfect = false, step = 0;
    while (t < P.maxFlight) {
      const ax = withWind ? windAt(t0 + t) * tool.windScale : 0; // arch: the wind blows across the street
      if (isArch) vz += ax * dt; else vx += ax * dt;
      vy -= g * dt; x += vx * dt; y += vy * dt; z += vz * dt; t += dt; step++;
      if (step % P.pathEvery === 0) path.push({t, x, y, z});
      if (x > P.worldEnd || x < -4 || Math.abs(z) > 14) { kind = 'out'; break; }
      if (stopAtObstacle) {
        const hitObs = level.obstacles.find(o => insideRect(obstacleAt(o, t0 + t), x, y) && (!isArch || Math.abs(z - (o.z || 0)) <= (o.zw || 1.3)));
        if (hitObs) { kind = 'blocked'; contact = {x, y, z, t, obstacle: hitObs}; break; }
      }
      if (resolve) {
        const c = criminalAt(t0 + t), cy = C.cy + c.y;
        if (c.exposed) {
          const rx = C.rx + tool.radius * C.reachX, ry = C.ry + tool.radius * C.reachY;
          const nx = (x - c.x) / rx, nz = isArch ? (z - c.z) / rx : 0, ny = (y - cy) / ry, nd = nx * nx + nz * nz + ny * ny;
          if (nd < minNear) minNear = nd;
          if (nd <= 1) {
            kind = 'catch'; contact = {x, y, z, t, criminalX: c.x, criminalZ: c.z};
            perfect = y >= tool.perfectY && Math.hypot(x - c.x, isArch ? z - c.z : 0) <= tool.perfectX;
            break;
          }
        }
      }
      if (y <= 0) {
        y = 0;
        kind = 'ground'; contact = {x, y: 0, z, t};
        if (resolve) {
          const c = criminalAt(t0 + t);
          const gd = Math.hypot(x - c.x, isArch ? z - c.z : 0);
          if (c.exposed && gd <= tool.radius * C.groundReach + C.rx * .6) { kind = 'catch'; contact.criminalX = c.x; contact.criminalZ = c.z; perfect = false; }
          else if (!c.exposed && gd <= tool.radius * .4) kind = 'hidden';
        }
        break;
      }
    }
    if (!path.length || path[path.length - 1].t !== t) path.push({t, x, y, z});
    return {kind, contact, perfect, duration: t, path, tool: tool.id, speed, near: Math.sqrt(minNear)};
  }

  const api = {
    balance, level, stage, tools, previewFraction, aimHelp, isArch, hitsNeeded, turn, bonus,
    get state() { return s; },
    get aim() { return aim; },
    get wind() { return windAt(s.clock); },
    windAt, obstacleAt, throwsTotal, v2,
    get clock() { return s.clock; },
    criminalAt, trajectory, wobbleAt,
    /** The net in the air right now, and how far it is from the thief (metres), for slow-motion and the camera. */
    flightNow() {
      const f = s.flight; if (!f || s.phase !== 'flight') return null;
      const t = clamp(s.clock - f.t0, 0, f.duration), p = f.path; let i = 0; while (i < p.length - 2 && p[i + 1].t < t) i++;
      const a = p[i], b = p[i + 1] || a, u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = (a.z || 0) + ((b.z || 0) - (a.z || 0)) * u, c = criminalAt(s.clock);
      return {x, y, z, t, share: t / f.duration, dist: Math.hypot(x - c.x, y - (C.cy + c.y), isArch ? z - c.z : 0), vx: (b.x - a.x) / Math.max(1e-4, b.t - a.t), vy: (b.y - a.y) / Math.max(1e-4, b.t - a.t)};
    },
    /** The aim the net will really leave with right now (aim plus sway). */
    aimNow(t = s.clock) { const w = wobbleAt(t); return {angle: clamp(aim.angle + w.angle, P.angle.min, P.angle.max), power: clamp(aim.power + w.power, 0, 1), yaw: isArch ? clamp(aim.yaw + w.yaw, -YAW, YAW) : 0, tool: aim.tool}; },
    setAim(next = {}) {
      if (s.phase !== 'aim') return false;
      if (Number.isFinite(next.angle)) aim.angle = clamp(next.angle, P.angle.min, P.angle.max);
      if (Number.isFinite(next.power)) aim.power = clamp(next.power, 0, 1);
      if (isArch && Number.isFinite(next.yaw)) aim.yaw = clamp(next.yaw, -YAW, YAW);
      return true;
    },
    setTool(id) {
      if (s.phase !== 'aim' || !tools.some(t => t.id === id)) return false;
      aim.tool = id; return true;
    },
    /** What the officer is allowed to see: the arc without wind and without the thief,
     * cut to the stage's preview fraction of the flight. */
    preview() {
      const now = api.aimNow(), full = trajectory(now.angle, now.power, aim.tool, {withWind: false, yaw: now.yaw});
      const cut = full.duration * previewFraction, points = full.path.filter(p => p.t <= cut);
      const land = full.path[full.path.length - 1];
      // aimHelp 2: would this throw catch the thief if released now (no wind)? The wind is still the player's to read.
      const hit = aimHelp >= 2 && s.phase === 'aim' ? trajectory(now.angle, now.power, aim.tool, {withWind: false, resolve: true, t0: s.clock + P.throwSeconds, yaw: now.yaw}).kind === 'catch' : false;
      return {points, blocked: full.kind === 'blocked', land, fraction: previewFraction, kind: full.kind, help: aimHelp, hit};
    },
    release() {
      if (s.phase !== 'aim') return null;
      const now = api.aimNow(), f = trajectory(now.angle, now.power, aim.tool, {resolve: true, t0: s.clock + P.throwSeconds, yaw: now.yaw});
      f.t0 = s.clock + P.throwSeconds; f.tool = aim.tool; f.angle = now.angle; f.power = now.power; f.yaw = now.yaw; f.wind = turn.wind;
      s.flight = f; s.thrown++; s.throwsLeft--; s.usedTools.push(aim.tool);
      s.phase = 'throw'; s.phaseAt = s.clock;
      events.push({type: 'release', tool: aim.tool, angle: aim.angle, power: aim.power, duration: f.duration});
      return f;
    },
    step(dt) {
      if (s.phase === 'done') return;
      s.clock += dt;
      const f = s.flight, since = s.clock - s.phaseAt;
      if (s.phase === 'throw' && since >= P.throwSeconds) {
        s.phase = 'flight'; s.phaseAt = f.t0;
        events.push({type: 'launch', tool: f.tool});
      } else if (s.phase === 'flight' && s.clock - f.t0 >= f.duration) {
        s.phase = 'impact'; s.phaseAt = s.clock;
        if (f.kind === 'catch') { s.perfect = f.perfect; f.catchX = f.contact.criminalX; events.push({type: 'catch', perfect: f.perfect, x: f.contact.x, y: f.contact.y, z: f.contact.z || 0}); }
        else {
          s.nearMiss = v2 && f.kind !== 'blocked' && f.near < 2.2;
          events.push({type: f.kind === 'blocked' ? 'blocked' : f.kind === 'hidden' ? 'hidden' : 'miss', x: f.contact?.x ?? 0, y: f.contact?.y ?? 0, z: f.contact?.z ?? 0, kind: f.kind, near: s.nearMiss});
        }
      } else if (s.phase === 'impact' && since >= P.impactSeconds) {
        if (f.kind === 'catch') { s.catches++; if (f.perfect) s.perfects++; }
        if (f.kind === 'catch' && s.bossHp > 1) {
          s.bossHp--; const c = criminalAt(s.clock);
          events.push({type: 'bossHit', hp: s.bossHp});
          if (s.throwsLeft > 0) { s.phase = 'flee'; s.phaseAt = s.clock; s.fromX = c.x; s.fromZ = c.z; s.baseX = c.x; s.toX = c.x + level.flee * .6; events.push({type: 'flee', from: s.fromX, to: s.toX, boss: true}); }
          else { s.phase = 'escape'; s.phaseAt = s.clock; s.fromX = c.x; s.fromZ = c.z; s.baseX = c.x; s.toX = P.escapeX; events.push({type: 'escape', from: s.fromX, to: s.toX}); }
        } else if (f.kind === 'catch' && s.crewLeft > 0) {
          s.crewLeft--; s.crimIndex++; s.bossHp = hitsNeeded; s.caught.push({x: f.catchX ?? f.contact.x, z: f.contact.criminalZ ?? 0, perfect: f.perfect});
          s.phase = 'rearm'; s.phaseAt = s.clock; s.baseX = (f.catchX ?? f.contact.x) + (level.crewGap || 5.5); turn.start = s.clock + P.rearmSeconds * .5; turn.phase = rnd() * Math.PI * 2; turn.popPhase = rnd() * 3;
          rollWind(); events.push({type: 'crew', index: s.crimIndex, x: s.baseX});
        } else if (f.kind === 'catch') {
          s.phase = 'caught'; s.phaseAt = s.clock; s.won = true; finish();
        } else if (s.throwsLeft > 0) {
          const c = criminalAt(s.clock);
          s.phase = 'flee'; s.phaseAt = s.clock; s.fromX = c.x; s.fromZ = c.z; s.baseX = c.x; s.toX = Math.min(c.x + level.flee, Math.max(c.x, level.dist + (level.fleeMax ?? Infinity))); // v6: the thief never gets more than fleeMax beyond his start
          events.push({type: 'flee', from: s.fromX, to: s.toX});
        } else {
          const c = criminalAt(s.clock);
          s.phase = 'escape'; s.phaseAt = s.clock; s.fromX = c.x; s.fromZ = c.z; s.baseX = c.x; s.toX = P.escapeX;
          events.push({type: 'escape', from: s.fromX, to: s.toX});
        }
      } else if (s.phase === 'rearm' && since >= P.rearmSeconds) {
        s.phase = 'aim'; s.phaseAt = s.clock; s.flight = null; events.push({type: 'turn', index: turn.index, wind: turn.wind, crew: true});
      } else if (s.phase === 'flee' && since >= P.fleeSeconds) {
        s.baseX = s.toX; turn.index++; turn.start = s.clock; turn.phase = rnd() * Math.PI * 2; turn.popPhase = rnd() * 3;
        rollWind(); s.phase = 'aim'; s.phaseAt = s.clock; s.flight = null;
        events.push({type: 'turn', index: turn.index, wind: turn.wind});
      } else if (s.phase === 'caught' && since >= P.caughtSeconds) { s.phase = 'done'; events.push({type: 'done', won: true}); }
      else if (s.phase === 'escape' && since >= P.escapeSeconds) { finish(); s.phase = 'done'; events.push({type: 'done', won: false}); }
    },
    drainEvents() { return events.splice(0); },
    /** Number the island stores: outcome, score and a 0-1 performance for the stars. */
    summary() {
      return {outcome: s.won ? 'win' : 'lose', score: s.score, performance: s.performance, perfect: s.perfect, throws: s.thrown, tools: [...s.usedTools], stage, catches: s.catches, crew: crewSize, boss: bossHits > 1};
    },
  };

  function finish() {
    if (!s.won) { s.score = 0; s.performance = 0; return; }
    const w = balance.scoring;
    s.perfect = s.perfects * 2 >= Math.max(1, s.catches);
    const left = s.throwsLeft, mult = 1 + w.stageBonus * (stage - 1), bonus = (crewSize - 1) * (w.perCrew || 0) + (bossHits > 1 ? (w.boss || 0) : 0);
    s.score = Math.min(balance.maximumScore, Math.round((w.catch + bonus + (s.perfect ? w.perfect : 0) + left * w.perThrowLeft) * mult));
    const denominator = Math.max(1, throwsTotal - 1);
    s.performance = clamp(w.perfCatch + w.perfLeft * (left / denominator) + (s.perfect ? w.perfPerfect : 0), 0, 1);
  }
  return api;
}
