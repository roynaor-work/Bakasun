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
export function createCatchEngine({balance, stage = 1, seed = 1, equipment = {}, city = {}}) {
  const level = balance.levels[stage - 1];
  if (!level) throw Error('catch: unknown stage ' + stage);
  const rnd = seededRandom((seed * 2654435761 + stage * 97) >>> 0);
  const P = balance.physics, C = balance.criminal;
  const bonus = {net: Number(equipment.net) || 1, police: city.police || 0, level: level.radiusScale || 1};
  const previewFraction = clamp(level.preview + (Number(equipment.scope) || 0), 0.15, 1);
  const tools = level.tools.map(id => toolValues(balance, id, bonus));
  const aim = {angle: P.angle.start, power: P.powerStart, tool: tools[0].id};
  const events = [];
  const wob = level.wobble || {angle: 0, power: 0};
  const turn = {index: 0, start: 0, wind: 0, windSign: 1, phase: rnd() * Math.PI * 2, popPhase: rnd() * 3};
  const wobSeed = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  /** Unsteady hand: a deterministic sway of the aim over the clock, visible in the preview. */
  function wobbleAt(t) {
    const a = wob.angle * (0.7 * Math.sin(2 * Math.PI * t / 2.3 + wobSeed[0]) + 0.3 * Math.sin(2 * Math.PI * t / 1.1 + wobSeed[1]));
    return {angle: a, power: wob.power * Math.sin(2 * Math.PI * t / 1.7 + wobSeed[2])};
  }
  const s = {phase: 'aim', clock: 0, phaseAt: 0, baseX: level.dist, fromX: level.dist, toX: level.dist, throwsLeft: balance.throws, thrown: 0,
    flight: null, perfect: false, won: false, score: 0, performance: 0, usedTools: []};

  function rollWind() {
    const max = level.wind || 0;
    turn.wind = max ? (rnd() * 2 - 1) * max : 0;
    if (max && Math.abs(turn.wind) < max * .25) turn.wind = Math.sign(turn.wind || 1) * max * .25;
  }
  rollWind();

  const move = () => level.move ? {...level.move, phase: turn.phase} : null;
  const pop = () => level.pop ? {...level.pop, phase: turn.popPhase} : null;

  /** Thief state at an absolute clock time; during a flee the base slides forward. */
  function criminalAt(t) {
    let x = s.baseX, running = false, mode = 'idle', exposed = true;
    if (s.phase === 'flee' || s.phase === 'escape') {
      const u = (t - s.phaseAt) / (s.phase === 'flee' ? P.fleeSeconds : P.escapeSeconds * P.escapeRun);
      x = s.fromX + (s.toX - s.fromX) * smooth(u);
      running = u < 1; mode = running ? 'run' : 'idle'; if (u >= 1 && s.phase === 'escape') mode = 'gone';
    } else if (s.phase === 'caught') { mode = 'caught'; x = s.flight?.catchX ?? s.baseX; }
    else {
      const tt = Math.max(0, t - turn.start), m = moveOffset(move(), tt);
      x += m.offset; running = m.running; exposed = isExposed(pop(), tt);
      mode = !exposed ? 'hide' : running ? 'run' : 'idle';
    }
    return {x, running, exposed, mode, y: exposed ? 0 : -C.hideDrop};
  }

  /** Free flight. `wind` false = the preview line the officer sees. */
  function trajectory(angle, power, toolId, {withWind = true, t0 = s.clock, stopAtObstacle = true, resolve = false} = {}) {
    const tool = tools.find(t => t.id === toolId) || tools[0];
    const speed = tool.vmax * (P.powerMin + (1 - P.powerMin) * clamp(power, 0, 1));
    const a = angle * Math.PI / 180, dt = P.fixedStep;
    let x = P.release.x, y = P.release.y, vx = speed * Math.cos(a), vy = speed * Math.sin(a), t = 0;
    const ax = withWind ? turn.wind * tool.windScale : 0, g = tool.gravity;
    const path = [{t: 0, x, y}];
    let kind = 'out', contact = null, perfect = false, step = 0;
    while (t < P.maxFlight) {
      vx += ax * dt; vy -= g * dt; x += vx * dt; y += vy * dt; t += dt; step++;
      if (step % P.pathEvery === 0) path.push({t, x, y});
      if (x > P.worldEnd || x < -4) { kind = 'out'; break; }
      if (stopAtObstacle) {
        const hitObs = level.obstacles.find(o => insideRect(o, x, y));
        if (hitObs) { kind = 'blocked'; contact = {x, y, t, obstacle: hitObs}; break; }
      }
      if (resolve) {
        const c = criminalAt(t0 + t), cy = C.cy + c.y;
        if (c.exposed) {
          const rx = C.rx + tool.radius * C.reachX, ry = C.ry + tool.radius * C.reachY;
          const nx = (x - c.x) / rx, ny = (y - cy) / ry;
          if (nx * nx + ny * ny <= 1) {
            kind = 'catch'; contact = {x, y, t, criminalX: c.x};
            perfect = y >= tool.perfectY && Math.abs(x - c.x) <= tool.perfectX;
            break;
          }
        }
      }
      if (y <= 0) {
        y = 0;
        kind = 'ground'; contact = {x, y: 0, t};
        if (resolve) {
          const c = criminalAt(t0 + t);
          if (c.exposed && Math.abs(x - c.x) <= tool.radius * C.groundReach + C.rx * .6) { kind = 'catch'; contact.criminalX = c.x; perfect = false; }
          else if (!c.exposed && Math.abs(x - c.x) <= tool.radius * .4) kind = 'hidden';
        }
        break;
      }
    }
    if (!path.length || path[path.length - 1].t !== t) path.push({t, x, y});
    return {kind, contact, perfect, duration: t, path, tool: tool.id, speed};
  }

  const api = {
    balance, level, stage, tools, previewFraction, turn, bonus,
    get state() { return s; },
    get aim() { return aim; },
    get wind() { return turn.wind; },
    get clock() { return s.clock; },
    criminalAt, trajectory, wobbleAt,
    /** The aim the net will really leave with right now (aim plus sway). */
    aimNow(t = s.clock) { const w = wobbleAt(t); return {angle: clamp(aim.angle + w.angle, P.angle.min, P.angle.max), power: clamp(aim.power + w.power, 0, 1), tool: aim.tool}; },
    setAim(next = {}) {
      if (s.phase !== 'aim') return false;
      if (Number.isFinite(next.angle)) aim.angle = clamp(next.angle, P.angle.min, P.angle.max);
      if (Number.isFinite(next.power)) aim.power = clamp(next.power, 0, 1);
      return true;
    },
    setTool(id) {
      if (s.phase !== 'aim' || !tools.some(t => t.id === id)) return false;
      aim.tool = id; return true;
    },
    /** What the officer is allowed to see: the arc without wind and without the thief,
     * cut to the stage's preview fraction of the flight. */
    preview() {
      const now = api.aimNow(), full = trajectory(now.angle, now.power, aim.tool, {withWind: false});
      const cut = full.duration * previewFraction, points = full.path.filter(p => p.t <= cut);
      return {points, blocked: full.kind === 'blocked', land: full.path[full.path.length - 1], fraction: previewFraction, kind: full.kind};
    },
    release() {
      if (s.phase !== 'aim') return null;
      const now = api.aimNow(), f = trajectory(now.angle, now.power, aim.tool, {resolve: true});
      f.t0 = s.clock + P.throwSeconds; f.tool = aim.tool; f.angle = now.angle; f.power = now.power; f.wind = turn.wind;
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
        if (f.kind === 'catch') { s.perfect = f.perfect; f.catchX = f.contact.criminalX; events.push({type: 'catch', perfect: f.perfect, x: f.contact.x, y: f.contact.y}); }
        else events.push({type: f.kind === 'blocked' ? 'blocked' : f.kind === 'hidden' ? 'hidden' : 'miss', x: f.contact?.x ?? 0, y: f.contact?.y ?? 0, kind: f.kind});
      } else if (s.phase === 'impact' && since >= P.impactSeconds) {
        if (f.kind === 'catch') {
          s.phase = 'caught'; s.phaseAt = s.clock; s.won = true; finish();
        } else if (s.throwsLeft > 0) {
          const c = criminalAt(s.clock);
          s.phase = 'flee'; s.phaseAt = s.clock; s.fromX = c.x; s.baseX = c.x; s.toX = c.x + level.flee;
          events.push({type: 'flee', from: s.fromX, to: s.toX});
        } else {
          const c = criminalAt(s.clock);
          s.phase = 'escape'; s.phaseAt = s.clock; s.fromX = c.x; s.baseX = c.x; s.toX = P.escapeX;
          events.push({type: 'escape', from: s.fromX, to: s.toX});
        }
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
      return {outcome: s.won ? 'win' : 'lose', score: s.score, performance: s.performance, perfect: s.perfect, throws: s.thrown, tools: [...s.usedTools], stage};
    },
  };

  function finish() {
    if (!s.won) { s.score = 0; s.performance = 0; return; }
    const w = balance.scoring;
    const left = s.throwsLeft, mult = 1 + w.stageBonus * (stage - 1);
    s.score = Math.min(balance.maximumScore, Math.round((w.catch + (s.perfect ? w.perfect : 0) + left * w.perThrowLeft) * mult));
    const denominator = Math.max(1, balance.throws - 1);
    s.performance = clamp(w.perfCatch + w.perfLeft * (left / denominator) + (s.perfect ? w.perfPerfect : 0), 0, 1);
  }
  return api;
}
