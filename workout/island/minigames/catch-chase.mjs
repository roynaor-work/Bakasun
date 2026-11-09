/** v3: the officer can overtake and corner the thief. Ramming him (a side hit counts most) fills a damage
 * meter; a full meter stops his car and ends the chase with a catch. If the time runs out he reaches the roadblock.
 * The car chase that opens every v2 stage of "תפוס את הפושע". Pure rules, no DOM:
 * the officer's car steers between three lanes, boosts and brakes while the thief's
 * car weaves ahead through traffic. Whoever clips a car or a barrier loses speed.
 * When the time is up (the thief reaches the police roadblock) or he is boxed in,
 * he bails out on foot; how close the officer got decides how hard the throw is.
 * World units are metres, x runs down the road, lat is -1..1 across three lanes. */

export function seededRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;

export const laneZ = (lat, C) => C.laneCenter + lat * C.laneWidth;
/** Bend of the road at street position x: -1..1 times the stage's `curve`. The street repeats every C.period metres. */
export const curveAt = (x, C, curve = 0) => curve ? curve * Math.sin(2 * Math.PI * x / (C.period || 66)) : 0;

/** Obstacles for the whole run, laid out up front from the seed so the chase is a pure function of inputs. */
function layout(C, spec, rnd, length) {
  const list = [];
  let x = 38;
  while (x < length) {
    x += (100 / spec.density) * (.55 + rnd() * .9);
    const kindRoll = rnd(), lane = Math.floor(rnd() * 3) - 1;
    if (kindRoll < .15) list.push({id: list.length, kind: 'pad', x, lat: lane, len: 3, h: 0});
    else if (kindRoll < .55) list.push({id: list.length, kind: 'traffic', x, lat: lane, len: 4.4, v: C.trafficSpeed[0] + rnd() * (C.trafficSpeed[1] - C.trafficSpeed[0]), model: ['taxi', 'truck', 'bus'][Math.floor(rnd() * 3)]});
    else if (kindRoll < .8) list.push({id: list.length, kind: 'barrier', x, lat: lane, len: 2.2});
    else list.push({id: list.length, kind: 'cone', x, lat: lane, len: 1.2});
    // never wall off the whole road: a second obstacle within 14 m must use another lane
    if (rnd() < spec.density * .22 && list.at(-1).kind !== 'pad') {
      const other = list.at(-1).lat === 0 ? (rnd() < .5 ? -1 : 1) : 0;
      list.push({id: list.length, kind: rnd() < .5 ? 'barrier' : 'traffic', x: x + 4 + rnd() * 8, lat: other, len: 3, v: C.trafficSpeed[0] + rnd() * 3, model: 'taxi'});
    }
  }
  return list;
}
const obstacleX = (o, t) => o.kind === 'traffic' ? o.x + o.v * t : o.x;

export function createChaseEngine({balance, stage = 1, seed = 1, equipment = {}, bends = true}) {
  const C = balance.chase, level = balance.levels[stage - 1], spec = bends || !level.chase ? level.chase : {...level.chase, curve: 0};
  if (!spec) throw Error('catch: stage ' + stage + ' has no chase');
  const rnd = seededRandom((seed * 2246822519 + stage * 131) >>> 0);
  const length = spec.seconds * (C.baseSpeed + C.boostSpeed) + 160;
  const obstacles = layout(C, spec, rnd, length);
  const tankScale = 1 + ((Number(equipment.net) || 1) - 1) * 2;
  const s = {damage: 0, rams: 0, ramCool: 0, t: 0, phase: 'countdown', countdown: C.countdownSeconds, x: 0, lat: 0, steer: 0, v: C.baseSpeed, tank: 1 * tankScale, stun: 0, hits: 0, boosting: false, braking: false, pads: 0,
    crim: {x: spec.gap ?? C.startGap, lat: 0, targetLat: 0, v: spec.crimSpeed, slow: 0, boostLeft: 0, nextBoost: spec.crimBoost || 1e9, hits: 0, retarget: 0},
    gap: spec.gap ?? C.startGap, outcome: null, bail: null};
  const events = [];
  const input = {steer: 0, boost: false, brake: false};
  const tankMax = tankScale;

  const hitBox = (carX, carLat, o, t) => Math.abs(carX - obstacleX(o, t)) < (4.4 + o.len) / 2 && Math.abs(carLat - o.lat) * C.laneWidth < C.hitLateral;

  function crimThink(dt) {
    const c = s.crim; c.retarget -= dt;
    if (c.retarget > 0) return;
    c.retarget = .35;
    // pick the lane with the longest clear stretch ahead of the thief, preferring where he already is
    let bestLane = c.targetLat, bestFree = -1;
    for (const lane of [-1, 0, 1]) {
      let free = 60;
      for (const o of obstacles) { if (o.kind === 'pad') continue; const ox = obstacleX(o, s.t) - c.x; if (ox > -3 && ox < 55 && Math.abs(o.lat - lane) < .6) free = Math.min(free, ox); }
      const score = free - Math.abs(lane - c.lat) * 6 + (lane === c.targetLat ? 4 : 0) + rnd() * 3 * (1 - spec.skill);
      if (score > bestFree) { bestFree = score; bestLane = lane; }
    }
    // a clever driver sometimes still clips something; the chance falls with his skill
    if (rnd() > spec.skill) bestLane = c.targetLat;
    // when the officer is close the thief swerves away from him (a free lane is still preferred)
    if (Math.abs(c.x - s.x) < C.crimFlee && rnd() < spec.skill + .15) {
      const away = s.lat > c.lat ? -1 : s.lat < c.lat ? 1 : (rnd() < .5 ? -1 : 1);
      let clear = true; for (const o of obstacles) { if (o.kind === 'pad') continue; const ox = obstacleX(o, s.t) - c.x; if (ox > -3 && ox < 22 && Math.abs(o.lat - away) < .6) clear = false; }
      if (clear) bestLane = away;
    }
    c.targetLat = bestLane;
  }

  const api = {
    balance, level, spec, obstacles, state: s, input, length, obstacleX,
    setSteer(v) { input.steer = clamp(Number(v) || 0, -1, 1); },
    setBoost(v) { input.boost = Boolean(v); },
    setBrake(v) { input.brake = Boolean(v); },
    step(dt) {
      if (s.phase === 'end') return;
      if (s.phase === 'countdown') {
        const before = Math.ceil(s.countdown); s.countdown -= dt;
        if (Math.ceil(s.countdown) < before && s.countdown > 0) events.push({type: 'count', value: Math.ceil(s.countdown)});
        if (s.countdown <= 0) { s.phase = 'run'; events.push({type: 'go'}); }
        return;
      }
      s.t += dt;
      // --- officer ---
      s.stun = Math.max(0, s.stun - dt);
      const grip = s.stun > 0 ? .35 : 1;
      s.steer += (input.steer * grip - s.steer) * Math.min(1, dt * C.steerResponse);
      s.lat = clamp(s.lat + s.steer * C.steerSpeed * dt, -1, 1);
      // v5 bends: the road swings left and right, a car that does not steer is carried to the outside; the kerb scrapes and slows
      s.curveNow = curveAt(s.x, C, spec.curve);
      if (spec.curve) {
        s.lat += (C.curveDrift || 0) * s.curveNow * (s.v / 22) * dt;
        if (Math.abs(s.lat) > 1) {
          s.lat = clamp(s.lat, -1, 1); s.v *= 1 - Math.min(1, C.scrapeDrag * dt); s.scrape = (s.scrape || 0) + dt;
          if ((s.scrapeCool || 0) <= 0) { s.scrapeCool = .45; events.push({type: 'scrape', side: Math.sign(s.curveNow)}); }
        }
        s.scrapeCool = Math.max(0, (s.scrapeCool || 0) - dt);
      }
      s.boosting = Boolean(input.boost) && s.tank > 0 && s.stun <= 0;
      s.braking = Boolean(input.brake) && !s.boosting;
      if (s.boosting) s.tank = Math.max(0, s.tank - dt / C.boostSeconds); else s.tank = Math.min(tankMax, s.tank + dt * C.rechargePerSecond);
      const target = s.boosting ? C.baseSpeed + C.boostSpeed : s.braking ? C.brakeSpeed : C.baseSpeed;
      const rate = target < s.v ? C.decel : C.accel;
      s.v += clamp(target - s.v, -rate * dt, rate * dt);
      s.x += s.v * dt;
      // --- thief ---
      const c = s.crim;
      crimThink(dt);
      c.nextBoost -= dt; if (c.nextBoost <= 0) { c.boostLeft = C.crimBoostSeconds; c.nextBoost = spec.crimBoost; events.push({type: 'crimBoost'}); }
      c.boostLeft = Math.max(0, c.boostLeft - dt); c.slow = Math.max(0, c.slow - dt);
      const cv = spec.crimSpeed + (c.boostLeft > 0 ? C.crimBoostSpeed : 0), slowK = c.slow > 0 ? .5 : 1;
      c.v += (cv * slowK - c.v) * Math.min(1, dt * 2.5); c.x += c.v * dt;
      c.lat += clamp(c.targetLat - c.lat, -C.crimSteer * dt, C.crimSteer * dt);
      // --- collisions and pads ---
      for (const o of obstacles) {
        const ox = obstacleX(o, s.t);
        if (ox < s.x - 12 && ox < c.x - 12) continue;
        if (ox > c.x + 20 && ox > s.x + 20) break;
        if (o.kind === 'pad') { if (!o.used && Math.abs(s.x - ox) < 2.6 && Math.abs(s.lat - o.lat) * C.laneWidth < 1.4) { o.used = true; s.tank = Math.min(tankMax, s.tank + C.padCharge); s.pads++; events.push({type: 'pad', id: o.id}); } continue; }
        if (!o.hitP && hitBox(s.x, s.lat, o, s.t)) {
          o.hitP = true; s.hits++; s.v *= o.kind === 'cone' ? .8 : C.crashKeep; s.stun = o.kind === 'cone' ? .15 : C.stunSeconds; s.tank = Math.max(0, s.tank - .2);
          events.push({type: 'crash', id: o.id, kind: o.kind});
        }
        if (!o.hitC && o.kind !== 'pad' && hitBox(c.x, c.lat, o, s.t)) { o.hitC = true; c.hits++; c.v *= C.crashKeep; c.slow = C.crimSlowSeconds; events.push({type: 'crimCrash', id: o.id, kind: o.kind}); }
      }
      // --- contact: the cars touch, he is pushed away, the damage meter fills ---
      const dx = c.x - s.x, dz = (c.lat - s.lat) * C.laneWidth;
      s.ramCool = Math.max(0, s.ramCool - dt);
      if (Math.abs(dx) < C.contactLen && Math.abs(dz) < C.contactWidth) {
        const side = Math.abs(dz) > C.sideZone ? C.sideBonus : 1, closing = clamp((s.v - c.v) / 8, 0, 1);
        s.damage = Math.min(1, s.damage + C.ramRate * side * (.6 + .4 * closing) * dt);
        const push = (dz >= 0 ? 1 : -1) * C.crimPush * dt;
        c.lat = clamp(c.lat + push, -1.15, 1.15); s.lat = clamp(s.lat - push * .5, -1, 1);
        c.slow = Math.max(c.slow, .35); s.v *= 1 - C.ramDrag * dt;
        if (s.ramCool <= 0) { s.ramCool = .45; s.rams++; events.push({type: 'ram', damage: s.damage, side: side > 1}); }
      }
      s.gap = c.x - s.x;
      // --- end of the chase: his car stops, or the time runs out and he reaches the police roadblock ---
      if (s.damage >= 1) finish('caught');
      else if (s.t >= spec.seconds) finish('roadblock');
    },
    drainEvents() { return events.splice(0); },
    /** What the throw receives: closeness 0..1 and the numbers derived from it. */
    result() {
      const g0 = spec.gap ?? C.startGap, prox = clamp((g0 - Math.abs(s.gap)) / Math.max(1, g0 - C.catchGap), 0, 1), closeness = !s.outcome ? 0 : s.outcome === 'caught' ? 1 : clamp(Math.max(s.damage * .9, prox * .6), 0, 1);
      return {closeness, damage: s.damage, caught: s.outcome === 'caught', gap: s.gap, hits: s.hits, crimHits: s.crim.hits, how: s.outcome, seconds: s.t,
        mods: {dist: lerp(level.dist * C.farFactor, level.dist * C.nearFactor, closeness), windScale: lerp(C.windFar, C.windNear, closeness), extraThrows: closeness >= C.bonusThrowAt ? 1 : 0}};
    },
  };
  function finish(how) { s.phase = 'end'; s.outcome = how; events.push({type: 'end', how, gap: s.gap}); }
  return api;
}
