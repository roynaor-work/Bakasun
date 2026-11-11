/** v6 "תפוס את הפושע": the car chase on a real track with turns (catch-track.mjs). Pure rules, no DOM, no Three.js:
 * the officer's car has a position along the track (s) and across it (d, right is positive), a speed and a steering
 * state; in a bend the car is carried to the outside in proportion to v*v*curvature, so the player has to steer into
 * every turn, and a boost through a tight bend pushes the car onto the shoulder and the kerb. The thief's car runs ahead,
 * picks free lanes, swerves away from the officer, boosts on straights and brakes before tight corners. Obstacles sit
 * on the road (traffic, parked cars, barriers, cones, oil, boost pads); hitting one slows the officer.
 * The tyre gun (catch-tyres.mjs) locks when the thief is close and in line; enough flats stop his car: the chase ends
 * with a catch, the car skids to a halt and the throw stage (archery) starts where it stopped. Ramming still fills a
 * damage meter as a slower second way. When the time runs out the thief reaches the roadblock and bails out further away.
 * Deterministic from (seed, stage, inputs) so tools/catch-sim.mjs can drive it. */
import {buildTrack, seededRandom} from './catch-track.mjs?v=island-v2-20261107-8';
import {createTyreGun} from './catch-tyres.mjs?v=island-v2-20261107-8';

export const CHASE6 = Object.freeze({
  countdownSeconds: 2.5, startGap: 30, catchGap: 7,
  roadHalf: 5, shoulder: 4.3, laneWidth: 3.3, lanes: [-3.3, 0, 3.3],
  baseSpeed: 22, boostSpeed: 9, brakeSpeed: 9, accel: 13, decel: 26,
  steerSpeed: 5.6, steerResponse: 7,        // lateral metres per second at full lock, and how fast the wheel answers
  driftK: .5,                                // outward slide in a bend: driftK * v*v*k metres per second
  scrapeDrag: 1.8, kerbBounce: 1.2,          // the kerb slows the car and nudges it back
  boostSeconds: 3, rechargePerSecond: .1, padCharge: .4,
  crashKeep: .5, stunSeconds: .7, coneKeep: .82, oilSeconds: 1.1, oilDrift: 3.5,
  hitLateral: 1.9, carLen: 4.4,
  crimLatAccel: 7.5,                         // the thief's grip: top speed in a bend = sqrt(crimLatAccel / |k|)
  crimLead: 2.5, crimLeadPerStage: .35, crimAdrenaline: 2.5, rubberFrom: 30, rubberSpan: 20, rubberSlow: 8, // far ahead the thief runs into traffic and slows, so one bad bend does not lose the chase       // the thief is a little faster than the officer's base speed: boosting and clean bends close the gap
  crimSteer: 2.6, crimBoostSpeed: 6, crimBoostSeconds: 1.3, crimSlowSeconds: 1, crimFlee: 18,
  trafficSpeed: [9, 13],
  contactLen: 4.4, contactWidth: 2, sideZone: .8, sideBonus: 1.8, ramRate: .07, crimPush: 1.6, ramDrag: .8,
  skidSeconds: 2.2, stopSearch: 45,          // after the last flat: the thief slides to a stop, on a straight if one is near (skidSeconds is the minimum)
  farFactor: 1.3, nearFactor: .75, windFar: 1.25, windNear: .6, bonusThrowAt: .85,
  turnWarn: 55,                              // metres ahead a bend is announced
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;

export const STRINGS = Object.freeze({
  'catch.steerHint6': 'גוררים ימינה ושמאלה כדי להטות את ההגה, ובפניות מחזיקים לכיוון הפנייה',
  'catch.pop.turnLeft': 'פנייה שמאלה', 'catch.pop.turnRight': 'פנייה ימינה', 'catch.pop.oil': 'כתם שמן, ההגה מחליק',
  'catch.pop.kerb': 'שפת הכביש מאטה, מחזירים את ההגה', 'catch.pop.parked': 'התנגשות ברכב חונה',
  'catch.chase.stopped': 'הרכב נעצר עם הפנצ׳רים, הפושע בורח ברגל. זריקות: {throws}',
});

/** Obstacles for the whole run, laid out up front from the seed. `d` is the lane centre; `kind` decides size and effect. */
function layout(C, spec, rnd, track, length) {
  const list = []; let s = 60;
  const lanes = C.lanes;
  while (s < length) {
    s += (90 / Math.max(.2, spec.density)) * (.5 + rnd() * .9);
    const k = Math.abs(track.curvatureAt(s)), inBend = k > 1 / 120, roll = rnd();
    const lane = lanes[Math.floor(rnd() * 3)];
    if (roll < .14) list.push({id: list.length, kind: 'pad', s, d: lane, len: 3});
    else if (roll < .5) list.push({id: list.length, kind: 'traffic', s, d: lane, len: 4.4, v: C.trafficSpeed[0] + rnd() * (C.trafficSpeed[1] - C.trafficSpeed[0]), model: ['taxi', 'truck', 'bus'][Math.floor(rnd() * 3)]});
    else if (roll < .64) list.push({id: list.length, kind: 'parked', s, d: (rnd() < .5 ? -1 : 1) * 3.9, len: 4.4, model: 'taxi'});
    else if (roll < .8) list.push({id: list.length, kind: 'barrier', s, d: lane, len: 2.2});
    else if (roll < .9 || inBend) list.push({id: list.length, kind: 'cone', s, d: lane, len: 1.2});
    else list.push({id: list.length, kind: 'oil', s, d: lane, len: 3});
    // never wall off the road: a second obstacle within 14 m must leave a lane free
    if (rnd() < spec.density * .2 && !['pad', 'oil'].includes(list.at(-1).kind)) {
      const other = list.at(-1).d === 0 ? (rnd() < .5 ? -3.3 : 3.3) : 0;
      list.push({id: list.length, kind: rnd() < .5 ? 'barrier' : 'traffic', s: s + 5 + rnd() * 8, d: other, len: 3, v: C.trafficSpeed[0] + rnd() * 3, model: 'taxi'});
    }
  }
  return list;
}
const obstacleS = (o, t) => o.kind === 'traffic' ? o.s + o.v * t : o.s;

export function createChaseEngine6({balance, stage = 1, seed = 1, equipment = {}, track: givenTrack = null} = {}) {
  const C = {...CHASE6, ...(balance.chase6 || {})}, level = balance.levels[stage - 1], spec = level?.chase;
  if (!spec) throw Error('catch: stage ' + stage + ' has no chase');
  const rnd = seededRandom((seed * 2246822519 + stage * 131 + 7) >>> 0);
  const length = spec.seconds * (C.baseSpeed + C.boostSpeed) + 200;
  const track = givenTrack || buildTrack({seed: seed * 31 + stage, length, curve: spec.curve ?? .5});
  const obstacles = layout(C, spec, rnd, track, length);
  const gun = createTyreGun({balance, stage, rnd, level});
  const tankScale = 1 + ((Number(equipment.net) || 1) - 1) * 2;
  const crimTop = Math.max(spec.crimSpeed, C.baseSpeed + C.crimLead + (stage - 1) * C.crimLeadPerStage);
  const s = {t: 0, phase: 'countdown', countdown: C.countdownSeconds, s: 0, d: 0, v: C.baseSpeed, steer: 0, slide: 0, tank: tankScale, stun: 0, oil: 0, hits: 0, pads: 0, scrape: 0, scraping: false, boosting: false, braking: false, damage: 0, rams: 0, ramCool: 0, curvature: 0, bendAhead: null,
    crim: {s: spec.gap ?? C.startGap, d: 0, targetD: 0, v: C.baseSpeed, slow: 0, boostLeft: 0, nextBoost: spec.crimBoost || 1e9, hits: 0, retarget: 0, swerve: 0, stopS: null, wobble: 0},
    gap: spec.gap ?? C.startGap, outcome: null, skid: 0};
  const events = [], input = {steer: 0, boost: false, brake: false};
  const tankMax = tankScale;
  let announced = -1;

  const hitBox = (cs, cd, o, t) => Math.abs(cs - obstacleS(o, t)) < (C.carLen + o.len) / 2 && Math.abs(cd - o.d) < C.hitLateral;
  const freeAhead = (from, lane, span, t, ignoreMoving = false) => { let free = span; for (const o of obstacles) { if (o.kind === 'pad' || o.kind === 'oil') continue; if (ignoreMoving && o.kind === 'traffic') continue; const os = obstacleS(o, t) - from; if (os > -3 && os < span && Math.abs(o.d - lane) < 2.2) free = Math.min(free, os); } return free; };

  function crimThink(dt) {
    const c = s.crim; c.retarget -= dt;
    if (c.retarget > 0) return;
    c.retarget = .3;
    let bestLane = c.targetD, bestScore = -1e9;
    for (const lane of C.lanes) {
      const free = freeAhead(c.s, lane, 60, s.t);
      const score = free - Math.abs(lane - c.d) * 2 + (lane === c.targetD ? 4 : 0) + rnd() * 4 * (1 - spec.skill);
      if (score > bestScore) { bestScore = score; bestLane = lane; }
    }
    if (rnd() > spec.skill) bestLane = c.targetD; // a careless moment
    // the officer is close: swerve to the far side if it is free
    if (c.s - s.s < C.crimFlee && rnd() < spec.skill + .15) {
      const away = s.d > c.d + .3 ? -3.3 : s.d < c.d - .3 ? 3.3 : (rnd() < .5 ? -3.3 : 3.3);
      if (freeAhead(c.s, away, 24, s.t) >= 24) bestLane = away;
    }
    c.targetD = bestLane;
  }

  const api = {
    balance, level, spec, obstacles, track, gun, state: s, input, length, obstacleS, C,
    setSteer(v) { input.steer = clamp(Number(v) || 0, -1, 1); },
    setBoost(v) { input.boost = Boolean(v); },
    setBrake(v) { input.brake = Boolean(v); },
    fire() { if (s.phase !== 'run') return false; const ok = gun.fire(); pullGun(); return ok; },
    step(dt) {
      if (s.phase === 'end') return;
      if (s.phase === 'countdown') {
        const before = Math.ceil(s.countdown); s.countdown -= dt;
        if (Math.ceil(s.countdown) < before && s.countdown > 0) events.push({type: 'count', value: Math.ceil(s.countdown)});
        if (s.countdown <= 0) { s.phase = 'run'; events.push({type: 'go'}); }
        return;
      }
      s.t += dt;
      const c = s.crim;
      if (s.phase === 'skid') { // the thief's car slides to its stop; the officer rolls up behind
        s.skid += dt; const u = clamp((c.s - c.skidFrom) / Math.max(1, c.stopS - c.skidFrom), 0, 1);
        c.v = Math.max(3, c.skidV * (1 - u)); c.s = Math.min(c.stopS, c.s + c.v * dt); c.d += (c.stopD - c.d) * Math.min(1, dt * 2);
        s.v = Math.max(0, Math.min(s.v, (c.s - s.s - 8) * 1.5)); s.s += s.v * dt; s.d += (c.d - s.d) * Math.min(1, dt * 1.5); s.steer *= 1 - dt * 3;
        s.gap = c.s - s.s;
        if (c.s >= c.stopS - .05 && s.skid >= C.skidSeconds) finish('caught');
        return;
      }
      // --- officer ---
      s.stun = Math.max(0, s.stun - dt); s.oil = Math.max(0, s.oil - dt);
      const grip = s.stun > 0 ? .35 : s.oil > 0 ? .15 : 1;
      s.steer += (input.steer * grip - s.steer) * Math.min(1, dt * C.steerResponse);
      s.curvature = track.curvatureAt(s.s);
      const drift = C.driftK * s.v * s.v * s.curvature + (s.oil > 0 ? C.oilDrift * Math.sign(s.curvature || 1) : 0);
      s.slide = drift;
      s.d += (s.steer * C.steerSpeed + drift) * dt;
      s.scraping = Math.abs(s.d) > C.shoulder;
      if (s.scraping) {
        s.v *= 1 - Math.min(1, C.scrapeDrag * dt); s.scrape += dt;
        s.d -= Math.sign(s.d) * C.kerbBounce * dt; // the kerb pushes back a little
        if ((s.scrapeCool || 0) <= 0) { s.scrapeCool = .45; events.push({type: 'scrape', side: Math.sign(s.d)}); }
      }
      s.d = clamp(s.d, -C.roadHalf, C.roadHalf);
      s.scrapeCool = Math.max(0, (s.scrapeCool || 0) - dt);
      s.boosting = Boolean(input.boost) && s.tank > 0 && s.stun <= 0;
      s.braking = Boolean(input.brake) && !s.boosting;
      if (s.boosting) s.tank = Math.max(0, s.tank - dt / C.boostSeconds); else s.tank = Math.min(tankMax, s.tank + dt * C.rechargePerSecond);
      const target = s.boosting ? C.baseSpeed + C.boostSpeed : s.braking ? C.brakeSpeed : C.baseSpeed;
      const rate = target < s.v ? C.decel : C.accel;
      s.v += clamp(target - s.v, -rate * dt, rate * dt);
      s.s += s.v * dt;
      // a bend ahead: announce it once
      const ahead = track.segmentAt(s.s + C.turnWarn);
      if (ahead.kind === 'arc' && ahead.s0 !== announced && ahead.s0 > s.s) { announced = ahead.s0; s.bendAhead = {dir: ahead.dir, radius: ahead.radius, s: ahead.s0}; events.push({type: 'turn', dir: ahead.dir, radius: ahead.radius, s: ahead.s0}); }
      else if (ahead.kind !== 'arc' && s.s > (s.bendAhead?.s || -1) + 20) s.bendAhead = null;
      // --- thief ---
      crimThink(dt);
      c.nextBoost -= dt; if (c.nextBoost <= 0 && Math.abs(track.curvatureAt(c.s + 30)) < 1 / 150) { c.boostLeft = C.crimBoostSeconds; c.nextBoost = spec.crimBoost; events.push({type: 'crimBoost'}); }
      c.boostLeft = Math.max(0, c.boostLeft - dt); c.slow = Math.max(0, c.slow - dt);
      const kAhead = Math.max(Math.abs(track.curvatureAt(c.s)), Math.abs(track.curvatureAt(c.s + 18)));
      const gripTop = kAhead > 1e-4 ? Math.sqrt(C.crimLatAccel / kAhead) : 99;
      const rubber = clamp((c.s - s.s - C.rubberFrom) / C.rubberSpan, 0, 1) * C.rubberSlow;
      const cv = Math.min(gripTop, crimTop - rubber + (c.boostLeft > 0 && !rubber ? C.crimBoostSpeed : 0) + (c.s - s.s < 10 ? C.crimAdrenaline : 0)) * (c.slow > 0 ? .5 : 1) * gun.thiefSpeedScale();
      c.v += (cv - c.v) * Math.min(1, dt * 2.5); c.s += c.v * dt;
      const prevD = c.d;
      c.d += clamp(c.targetD - c.d, -C.crimSteer * dt, C.crimSteer * dt);
      c.wobble = gun.thiefWobble(s.t); c.swerve = clamp((c.d - prevD) / Math.max(1e-4, dt) / C.crimSteer, -1, 1);
      // --- obstacles ---
      for (const o of obstacles) {
        const os = obstacleS(o, s.t);
        if (os < s.s - 12 && os < c.s - 12) continue;
        if (os > c.s + 20 && os > s.s + 20) break;
        if (o.kind === 'pad') { if (!o.used && Math.abs(s.s - os) < 2.6 && Math.abs(s.d - o.d) < 1.6) { o.used = true; s.tank = Math.min(tankMax, s.tank + C.padCharge); s.pads++; events.push({type: 'pad', id: o.id}); } continue; }
        if (o.kind === 'oil') { if (!o.hitP && Math.abs(s.s - os) < 2.4 && Math.abs(s.d - o.d) < 1.7) { o.hitP = true; s.oil = C.oilSeconds; events.push({type: 'oil', id: o.id}); } continue; }
        if (!o.hitP && hitBox(s.s, s.d, o, s.t)) {
          o.hitP = true; s.hits++; s.v *= o.kind === 'cone' ? C.coneKeep : C.crashKeep; s.stun = o.kind === 'cone' ? .15 : C.stunSeconds; s.tank = Math.max(0, s.tank - .2);
          events.push({type: 'crash', id: o.id, kind: o.kind});
        }
        if (!o.hitC && hitBox(c.s, c.d + c.wobble, o, s.t)) { o.hitC = true; c.hits++; c.v *= C.crashKeep; c.slow = C.crimSlowSeconds; events.push({type: 'crimCrash', id: o.id, kind: o.kind}); }
      }
      // --- contact: ramming fills the damage meter, the thief is pushed sideways ---
      const ds = c.s - s.s, dd = (c.d + c.wobble) - s.d;
      s.ramCool = Math.max(0, s.ramCool - dt);
      if (Math.abs(ds) < C.contactLen && Math.abs(dd) < C.contactWidth) {
        const side = Math.abs(dd) > C.sideZone ? C.sideBonus : 1, closing = clamp((s.v - c.v) / 8, 0, 1);
        s.damage = Math.min(1, s.damage + C.ramRate * side * (.6 + .4 * closing) * dt);
        const push = (dd >= 0 ? 1 : -1) * C.crimPush * dt;
        c.d = clamp(c.d + push, -C.shoulder, C.shoulder); s.d = clamp(s.d - push * .5, -C.shoulder, C.shoulder);
        s.v *= 1 - C.ramDrag * dt; // the thief keeps his speed: a shove, not a brake, so contact does not lock the cars together
        if (s.ramCool <= 0) { s.ramCool = .45; s.rams++; events.push({type: 'ram', damage: s.damage, side: side > 1}); }
      }
      s.gap = ds;
      // --- tyre gun ---
      gun.step(dt, {gap: ds, lateral: dd, vOfficer: s.v, vThief: c.v, stun: s.stun, scraping: s.scraping, thiefSwerve: c.swerve, curvature: s.curvature});
      pullGun();
      // --- end: the damage meter is full, or the time runs out and he reaches the police roadblock ---
      if (s.phase === 'run') { if (s.damage >= 1) beginSkid(); else if (s.t >= spec.seconds) finish('roadblock'); }
    },
    drainEvents() { return events.splice(0); },
    /** What the throw receives: closeness 0..1, the numbers derived from it, and the frame (s0, d0) where the thief bails out. */
    result() {
      const g0 = spec.gap ?? C.startGap, prox = clamp((g0 - Math.abs(s.gap)) / Math.max(1, g0 - C.catchGap), 0, 1);
      const closeness = !s.outcome ? 0 : s.outcome === 'caught' ? 1 : clamp(Math.max(s.damage * .9, prox * .6), 0, 1);
      return {closeness, damage: s.damage, caught: s.outcome === 'caught', byTyres: gun.state.stopped, flats: gun.state.flatCount, shots: gun.state.shots, gap: s.gap, hits: s.hits, crimHits: s.crim.hits, how: s.outcome, seconds: s.t, scrape: s.scrape,
        frame: {s0: s.crim.s, d0: clamp(s.crim.d, -3, 3)},
        mods: {dist: lerp(level.dist * C.farFactor, level.dist * C.nearFactor, closeness), windScale: lerp(C.windFar, C.windNear, closeness), extraThrows: closeness >= C.bonusThrowAt ? 1 : 0}};
    },
  };
  /** The gun's events join the chase events at once (fire() is called between steps). */
  function pullGun() { for (const e of gun.drainEvents()) { events.push(e); if (e.type === 'stopped') beginSkid(); } }
  /** The last flat (or a full damage meter): the thief's car slides to a stop, on a straight stretch if one is within reach. */
  function beginSkid() {
    if (s.phase !== 'run') return;
    s.phase = 'skid'; s.skid = 0; s.crim.stopD = clamp(s.crim.d, -2.5, 2.5);
    let best = null;
    for (let q = s.crim.s + 10; q <= s.crim.s + C.stopSearch; q += 5) { const k = Math.abs(track.curvatureAt(q)) + Math.abs(track.curvatureAt(q + 20)); if (!best || k < best.k) best = {q, k}; if (k < 1e-4) break; }
    s.crim.stopS = best ? best.q : s.crim.s + 20; s.crim.skidFrom = s.crim.s; s.crim.skidV = Math.max(s.crim.v, 12);
    events.push({type: 'skid', s: s.crim.stopS});
  }
  function finish(how) { s.phase = 'end'; s.outcome = how; input.boost = false; events.push({type: 'end', how, gap: s.gap}); }
  return api;
}

/** A model driver for the simulation: reacts every `react` seconds, steers into bends, avoids obstacles, boosts on straights,
 * fires when the reticle is green. `miss` = chance to ignore a hazard, `aim` = chance to skip a good shot. */
export const DRIVING6 = Object.freeze({expert: {react: .12, miss: .05, aim: .05}, good: {react: .25, miss: .18, aim: .15}, casual: {react: .4, miss: .35, aim: .3}});
export function driveChase6(chase, driving = DRIVING6.good, rnd = Math.random) {
  const dt = 1 / 60, C = chase.C, st = chase.state;
  let timer = 0, want = 0, guard = 0, fireTimer = 0;
  while (st.phase !== 'end' && guard++ < 60 * 150) {
    timer -= dt; fireTimer -= dt;
    if (timer <= 0 && st.phase === 'run') {
      timer = driving.react;
      let best = want, bestScore = -1e9;
      for (const lane of C.lanes) {
        let free = 60;
        for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > -2 && os < 60 && Math.abs(o.d - lane) < 2.2) free = Math.min(free, os); }
        const score = free - Math.abs(lane - st.d) * 1.5;
        if (score > bestScore) { bestScore = score; best = lane; }
      }
      want = rnd() < driving.miss ? want : best;
      const ds = st.crim.s - st.s;
      if (ds > -9 && ds < 26 && rnd() >= driving.miss) want = clamp(st.crim.d, -3.3, 3.3);
    }
    // steer: toward the lane, and against the slide the bend produces (a human feels the pull and counters it)
    const wantVel = clamp((want - st.d) * 2.2, -C.steerSpeed, C.steerSpeed);
    chase.setSteer(clamp((wantVel - st.slide * .9) / C.steerSpeed, -1, 1));
    let near = 99; for (const o of chase.obstacles) { if (o.kind === 'pad') continue; const os = chase.obstacleS(o, st.t) - st.s; if (os > 0 && os < near && Math.abs(o.d - st.d) < 2.2) near = os; }
    const ds = st.crim.s - st.s, kAhead = Math.abs(chase.track.curvatureAt(st.s + 25));
    chase.setBoost(st.tank > .12 && ds > 4 && near > 18 && kAhead < 1 / 110);
    chase.setBrake(ds < -1.5 || (kAhead > 1 / 60 && st.v > C.baseSpeed + 2));
    if (chase.gun.state.locked && chase.gun.state.reload <= 0 && fireTimer <= 0) { fireTimer = .25 + rnd() * .3; if (rnd() >= driving.aim && chase.gun.state.hitChance > .35) chase.fire(); }
    chase.step(dt); chase.drainEvents();
  }
  return chase.result();
}
