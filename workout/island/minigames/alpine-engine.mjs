import {generateCourse,rockClearance,courseRandom,pipeProfile,surfaceHeight,wallAngle,curvatureAt} from './alpine-track.mjs?v=island-ski-20261031-1';

/** Alpine Rush race engine (CONTRACT.ts SkiEngine, extended). Pure: no DOM, Three.js, audio or Date.
 * Physics advance only in fixed 1/60 s ticks through an accumulator, so the same seed and the
 * same command sequence (in simulation time) give the same race at any frame rate.
 * Every rider, the player included, uses the same course, halfpipe, turns, tricks and collision
 * tests. The track is a halfpipe on a curved centreline: turns push riders toward the outer
 * wall, walls pull them back to the floor, and a fast climb over the lip launches them into the air. */

export const RIDER_IDS = Object.freeze(['player', 'rival-1', 'rival-2', 'rival-3', 'rival-4', 'rival-5']);
export const TRICK_IDS = Object.freeze(['grab', 'spin', 'flip', 'combo']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Reward table shared with the island result validator. Coins count whatever the placing. */
export function alpineReward(balance, stage, rank, completed = true, coins = 0) {
  const level = balance.levels[stage - 1];
  const won = completed && rank <= level.targetRank;
  const stars = won ? Math.max(1, 4 - rank) : 0;
  const score = completed ? balance.riders + 1 - rank : 0;
  return { won, stars, score, money: (won ? level.winMoney + score : 0) + coins * balance.physics.coins.value };
}

export function alpineTrack(balance, stage) {
  const level = balance.levels[stage - 1];
  if (!level) throw new Error('alpine.stage');
  const track = balance.tracks[level.trackId];
  return { level, track: { ...track, id: level.trackId } };
}

/** Board rectangle (half sizes hx along x, hs along s) against a circle. */
function boardHitsCircle(dx, ds, hx, hs, r) {
  const nx = clamp(dx, -hx, hx), ns = clamp(ds, -hs, hs);
  return (dx - nx) ** 2 + (ds - ns) ** 2 < r * r;
}

export function createAlpineEngine({ balance, stage = 1, seed = 1, equipment = {}, power = 1, course: courseOverride = null }) {
  // Purchased equipment and the game level apply to the player only, within configured tracks.
  const wax = clamp(Number(equipment.wax) || 1, 1, 1.1), tankSize = clamp(Number(equipment.tank) || 1, 1, 1.5), recharge = clamp(Number(power) || 1, 1, 1.2);
  const physics = balance.physics, step = physics.fixedStep, pipe = pipeProfile(physics), tricks = physics.tricks;
  const { level, track } = alpineTrack(balance, stage);
  // courseOverride exists for rule tests only (hand-placed obstacles); the game always generates.
  const course = courseOverride || generateCourse(track, physics);
  const objects = course.objects;
  let phase = 'menu', countdownShown = 0, resumePhase = null, accumulator = 0, ticks = 0, countdownTicks = 0, run = 0, disposed = false;
  let riders = [], events = [], eventSeq = 0, result = null, steerInput = 0, boostRequest = false, trickRequest = null, order = [], previousPresentation = null;
  const aiRandom = { value: null };

  function emit(type, extra = {}) { events.push({ id: `e${++eventSeq}`, type, ...extra }); }

  function makeRider(id, index) {
    const grid = physics.grid[index];
    const ai = index === 0 ? null : level.ai[index - 1];
    return {
      id, index, ai, s: grid.s, x: grid.x, vx: 0, speed: 0, steer: 0, steerOut: 0, alt: 0, vy: 0, airborne: false, airKind: null,
      tank: physics.boostStartTank, boostTime: 0, padTime: 0, hitTime: 0, grace: 0, landTime: 0, crashTime: 0,
      ramp: null, seen: new Map(), hits: new Set(), pads: new Set(), gates: new Set(), coins: new Set(), cursor: 0,
      trick: null, airScore: 0, airTricks: 0, lastTrick: null, trickScore: 0, crashes: 0, trickDecideIn: 0,
      finished: false, finishTicks: 0, peak: 0, collisions: 0,
      decideIn: 0, targetX: grid.x,
    };
  }

  function reset() {
    run++;
    aiRandom.value = courseRandom((Number(seed) >>> 0) ^ Math.imul(run, 0x9e3779b1));
    riders = RIDER_IDS.map(makeRider);
    accumulator = 0; ticks = 0; countdownTicks = Math.round(physics.countdownSeconds / step);
    result = null; steerInput = 0; boostRequest = false; trickRequest = null; resumePhase = null;
    order = riders.map(r => r.id);
    previousPresentation = null;
    phase = 'countdown';
    countdownShown = Math.ceil(physics.countdownSeconds);
    emit('countdown', { value: countdownShown });
  }

  const heightOf = r => r.alt - surfaceHeight(r.x, pipe);
  /** Seconds until an airborne rider meets the surface below it. */
  function airTimeLeft(r) {
    const h = Math.max(0, heightOf(r)), g = physics.gravity;
    return (r.vy + Math.sqrt(Math.max(0, r.vy * r.vy + 2 * g * h))) / g;
  }

  // ---------- AI: same rules, decisions limited by reaction time, lookahead and accuracy ----------
  function aiDecide(r) {
    const ai = r.ai, half = pipe.lip - 0.5, board = physics.board;
    const ahead = objects.filter(o => o.s > r.s + 1 && o.s < r.s + ai.lookahead && o.type !== 'coin');
    // Each obstacle is judged once: a rider either notices it or misses it (mistakeRate).
    for (const o of ahead) if (!r.seen.has(o.id)) r.seen.set(o.id, aiRandom.value() < ai.mistakeRate);
    const laneCost = cx => {
      let cost = Math.abs(cx - r.x) * 0.12 + Math.max(0, Math.abs(cx) - pipe.F) * physics.aiWallCost;
      for (const o of ahead) {
        if (r.seen.get(o.id)) continue;
        const near = 1 / (1 + (o.s - r.s) / 18);
        // While moving across to cx the board sweeps every lane in between; obstacles reached
        // before the move ends count against the whole sweep.
        const sweeping = o.s - r.s < Math.abs(cx - r.x) / physics.lateralSpeed * Math.max(r.speed, 8) + 3;
        const lo = Math.min(cx, r.x), hi = Math.max(cx, r.x);
        if (o.type === 'rock') {
          const reach = o.radius * physics.rockHitScale + board.halfWidth + ai.margin;
          if (Math.abs(cx - o.x) < reach || (sweeping && o.x > lo - reach && o.x < hi + reach)) cost += 100 * near;
        } else if (o.type === 'gate') {
          const off = Math.abs(cx - o.x), reach = board.halfWidth + physics.postHalf[0] + ai.margin;
          const crossesPost = sweeping && [-1, 1].some(side => { const p = o.x + side * physics.gateHalfWidth; return p > lo - reach && p < hi + reach; });
          if (Math.abs(off - physics.gateHalfWidth) < reach || crossesPost) cost += 100 * near;
          else if (off < physics.gateHalfWidth - board.halfWidth) cost -= (ai.gateDesire ?? 0) * near;
        } else if (o.type === 'boost') {
          if (Math.abs(cx - o.x) < physics.pad.width / 2 - 0.3) cost -= ai.padDesire * near;
        } else if (o.type === 'ramp') {
          const off = Math.abs(cx - o.x);
          if (off < physics.ramp.width / 2 - 0.4) cost -= ai.rampDesire * near;
          else if (off < physics.ramp.width / 2 + board.halfWidth) cost += 60 * near;
        }
      }
      for (const other of riders) {
        if (other === r || other.finished) continue;
        const ds = other.s - r.s;
        if (ds > -2 && ds < 10 && Math.abs(cx - other.x) < physics.riderSeparation + 0.4) cost += 14 / (1 + Math.max(0, ds) / 6);
      }
      return cost;
    };
    let best = r.x, bestCost = Infinity;
    for (let cx = -half; cx <= half + 1e-9; cx += 0.4) {
      const cost = laneCost(cx);
      if (cost < bestCost - 1e-9) { bestCost = cost; best = cx; }
    }
    // Aim error moves the line only within lanes that are about as good (imprecise, not blind).
    const noisy = clamp(best + (aiRandom.value() * 2 - 1) * ai.error, -half, half);
    r.targetX = laneCost(noisy) <= bestCost + 3 ? noisy : best;
    r.decideIn = ai.reaction;
    // Boost only in an open lane, with the tank skill of this rider.
    if (r.boostTime <= 0 && r.tank >= ai.boostTank && !r.airborne && aiRandom.value() < ai.boostChance) {
      const blocked = objects.some(o => o.type === 'rock' && o.s > r.s && o.s < r.s + 45 && Math.abs(o.x - r.targetX) < o.radius + board.halfWidth + 0.6);
      if (!blocked) r.wantsBoost = true;
    }
  }
  /** AI tricks: the longest trick that fits the remaining air with this rider's margin; a
   * rider who misjudges (mistakeRate) may start one that cannot finish, and crash. */
  function aiTrick(r) {
    r.trickDecideIn -= step; if (r.trickDecideIn > 0 || r.trick || r.crashTime > 0) return;
    r.trickDecideIn = .1;
    if (aiRandom.value() > r.ai.trickChance) return;
    const left = airTimeLeft(r), careless = aiRandom.value() < r.ai.mistakeRate * 2;
    const options = TRICK_IDS.filter(id => careless || tricks[id].seconds * (1 + r.ai.trickMargin) < left);
    if (options.length) startTrick(r, options.reduce((a, b) => tricks[b].points > tricks[a].points ? b : a));
  }

  function startBoost(r) {
    if (r.boostTime > 0 || r.tank < physics.boostMinimum) return false;
    r.boostTime = r.tank * physics.boostSeconds * (r.ai ? 1 : tankSize); r.tank = 0;
    emit('boost-start', { riderId: r.id });
    return true;
  }
  function startTrick(r, id) {
    if (!r.airborne || r.trick || r.crashTime > 0 || !tricks[id]) return false;
    r.trick = { id, t: 0, duration: tricks[id].seconds };
    emit('trick-start', { riderId: r.id, objectId: id });
    return true;
  }
  /** Forgive an early input for at most 120ms of simulation time, including an
   * input received on the same tick as takeoff. Grounded riders never perform
   * tricks and a press during an active trick never queues an automatic combo. */
  function consumePlayerTrick(r) {
    if (!trickRequest) return;
    if (ticks > trickRequest.expiresAt || r.trick || r.crashTime > 0) { trickRequest = null; return; }
    if (startTrick(r, trickRequest.id)) trickRequest = null;
  }

  /** A course rock remains solid after its one damage event. Move the board completely
   * clear on the nearest available side, choosing the inward side near a pipe boundary. */
  function separateRock(r, object) {
    const reach = object.radius * physics.rockHitScale + physics.board.halfWidth + .04;
    const preferred = Math.sign(r.x - object.x) || Math.sign(r.vx) || (r.index % 2 ? -1 : 1);
    const sides = [preferred, -preferred].map(side => ({side, x: object.x + side * reach}));
    const clear = sides.find(p => p.x >= -pipe.lip && p.x <= pipe.lip);
    if (clear) {
      r.x = clear.x;
      const rebound = Math.min(physics.lateralSpeed * .3, physics.lipLaunchSpeed * .75, Math.max(1.25, Math.abs(r.vx) * .35 + r.speed * .04));
      r.vx = clear.side * rebound;
      if (!r.airborne && !r.ramp) r.alt = surfaceHeight(r.x, pipe);
      return clear.side;
    }
    // Defensive fallback for a hand-authored rock wider than the pipe: do not push a
    // rider outside the course or let it pass through an obstacle that has no side exit.
    r.s = Math.min(r.s, object.s - object.radius * physics.rockHitScale - physics.board.halfDepth - .04);
    r.vx *= -.25;
    return 0;
  }

  function collide(r, object) {
    const speedBefore = r.speed;
    r.hits.add(object.id); r.collisions++;
    const rock = object.type === 'rock';
    // Hitting a rock is a fall for the player and every rival: the rider tumbles, loses most of the
    // speed and cannot steer or boost until up again. A gate post stays a bump.
    if (rock) {
      r.crashes++; r.speed *= 1 - physics.crashSpeedLoss; r.hitTime = physics.crashSeconds; r.crashTime = physics.crashSeconds; r.grace = physics.crashSeconds;
      r.boostTime = 0; r.padTime = 0; r.trick = null; r.airScore = 0; r.airTricks = 0;
    } else { r.speed *= 1 - physics.hitSpeedLoss; r.hitTime = physics.recoverySeconds; r.grace = physics.hitGraceSeconds; }
    const impactSide = rock ? separateRock(r, object) : 0;
    emit('collision', { riderId: r.id, objectId: object.id, objectType: object.type, impactSide, impactStrength: clamp(speedBefore / physics.boostSpeed, 0, 1) });
    if (rock) emit('crash', { riderId: r.id, objectId: object.id, objectType: 'rock' });
  }

  function takeoff(r, kind, vy, objectId) {
    r.airborne = true; r.airKind = kind; r.vy = vy; r.airScore = 0; r.airTricks = 0; r.lastTrick = null;
    emit('takeoff', { riderId: r.id, objectId });
  }
  function land(r) {
    const surface = surfaceHeight(r.x, pipe), impact = r.vy;
    r.alt = surface; r.vy = 0; r.airborne = false; r.landTime = physics.landSeconds;
    if (r.airKind === 'pipe') r.vx = -Math.sign(r.x) * Math.min(physics.pipeReturnSpeed, Math.abs(impact) * .6);
    r.airKind = null;
    if (r.trick && r.trick.t < r.trick.duration * physics.trickLandWindow) {
      // An unfinished trick on landing is a fall: a big slowdown and a longer recovery.
      r.crashes++; r.speed *= 1 - physics.crashSpeedLoss; r.hitTime = physics.crashSeconds; r.crashTime = physics.crashSeconds; r.grace = physics.crashSeconds;
      emit('crash', { riderId: r.id, objectId: r.trick.id }); r.trick = null; r.airScore = 0; r.airTricks = 0;
      return;
    }
    if (r.trick) { completeTrick(r); }
    if (r.airTricks > 0) {
      const points = Math.round(r.airScore * (1 + physics.comboBonus * (r.airTricks - 1)));
      r.trickScore += points; r.tank = Math.min(1, r.tank + physics.trickCharge * r.airTricks);
      emit('trick', { riderId: r.id, objectId: r.lastTrick, value: points, count: r.airTricks });
    } else emit('land', { riderId: r.id });
    r.airScore = 0; r.airTricks = 0;
  }
  function completeTrick(r) { r.airScore += tricks[r.trick.id].points; r.airTricks++; r.lastTrick = r.trick.id; r.trick = null; }

  function interact(r, prevS) {
    const board = physics.board, coin = physics.coins;
    while (r.cursor < objects.length && objects[r.cursor].s < r.s - 12) r.cursor++;
    for (let i = r.cursor; i < objects.length && objects[i].s < r.s + 8; i++) {
      const o = objects[i], ds = r.s - o.s, dx = r.x - o.x;
      if (o.type === 'coin') {
        if (!r.coins.has(o.id) && Math.abs(dx) < coin.reach && Math.abs(ds) < coin.depth && Math.abs(r.alt + coin.centre - o.h) < coin.height) {
          r.coins.add(o.id); emit('coin', { riderId: r.id, objectId: o.id });
        }
      } else if (o.type === 'rock') {
        if (r.alt >= rockClearance(o.radius) || !boardHitsCircle(dx, ds, board.halfWidth, board.halfDepth, o.radius * physics.rockHitScale)) continue;
        if (r.hits.has(o.id)) { separateRock(r, o); continue; }
        if (r.grace <= 0) collide(r, o);
      } else if (o.type === 'gate') {
        if (r.alt < physics.gatePostHeight && !r.hits.has(o.id) && r.grace <= 0) {
          for (const side of [-1, 1]) {
            const px = dx - side * physics.gateHalfWidth;
            if (Math.abs(px) < board.halfWidth + physics.postHalf[0] && Math.abs(ds) < board.halfDepth + physics.postHalf[1]) { collide(r, o); break; }
          }
        }
        if (prevS < o.s && r.s >= o.s && !r.gates.has(o.id) && !r.hits.has(o.id) && Math.abs(dx) < physics.gateHalfWidth - physics.postHalf[0] - board.halfWidth) {
          r.gates.add(o.id); r.tank = Math.min(1, r.tank + physics.gateCharge);
          emit('gate', { riderId: r.id, objectId: o.id });
        }
      } else if (o.type === 'boost') {
        if (!r.airborne && !r.pads.has(o.id) && Math.abs(dx) < physics.pad.width / 2 && Math.abs(ds) < physics.pad.length / 2) {
          r.pads.add(o.id); r.padTime = physics.padSeconds; r.tank = Math.min(1, r.tank + physics.padCharge);
          emit('boost-start', { riderId: r.id, objectId: o.id });
        }
      } else if (o.type === 'ramp') {
        const near = o.s - physics.ramp.length / 2, far = o.s + physics.ramp.length / 2, halfW = physics.ramp.width / 2;
        if (!r.airborne && r.ramp === null && prevS < near && r.s >= near && Math.abs(dx) <= halfW) r.ramp = o;
        else if (!r.airborne && r.ramp === null && !r.hits.has(o.id) && r.grace <= 0 && r.s > near + 0.6 && r.s < far && Math.abs(dx) < halfW + board.halfWidth * 0.5) {
          // Riding into the side wall of a ramp is a collision; the rider is moved clear of it.
          collide(r, o); r.x = o.x + Math.sign(dx || 1) * (halfW + board.halfWidth * 0.5 + 0.05); r.vx = 0;
        }
      }
    }
  }

  function updateRider(r, dt) {
    if (r.finished) {
      // Finished riders glide on so the view and rank stay continuous.
      r.speed = Math.max(0, r.speed - 4 * dt); r.s += r.speed * dt;
      if (r.airborne) { r.vy -= physics.gravity * dt; r.alt += r.vy * dt; if (r.alt <= surfaceHeight(r.x, pipe)) { r.alt = surfaceHeight(r.x, pipe); r.airborne = false; r.trick = null; r.vy = 0; } }
      return;
    }
    if (r.ai) {
      r.decideIn -= dt; if (r.decideIn <= 0) aiDecide(r);
      // Feed-forward against the turn's outward push, then a proportional pull to the chosen line.
      const lean = curvatureAt(course.path, r.s) * r.speed * r.speed * physics.turnPush / (physics.lateralResponse * physics.lateralSpeed);
      r.steer = clamp((r.targetX - r.x) * 0.7 + lean, -1, 1);
      if (r.wantsBoost) { r.wantsBoost = false; if (r.crashTime <= 0) startBoost(r); }
      if (r.airborne) aiTrick(r);
    } else {
      if (r.crashTime > 0) boostRequest = false;
      else {
        // Fine control near the centre (expo) and a rate limit so a thumb flick cannot snap the board sideways.
        const shaped = Math.sign(steerInput) * Math.pow(Math.abs(steerInput), physics.steerExpo ?? 1);
        const rate = (Math.sign(shaped) !== Math.sign(r.steerOut) || Math.abs(shaped) > Math.abs(r.steerOut) ? physics.steerAttack : physics.steerRelease) ?? 1e9;
        r.steerOut += clamp(shaped - r.steerOut, -rate * dt, rate * dt);
        r.steer = r.steerOut;
        if (boostRequest) { boostRequest = false; startBoost(r); }
      }
      consumePlayerTrick(r);
    }
    if (r.crashTime > 0) { r.steer = 0; r.steerOut = 0; }
    const angle = r.airborne ? 0 : wallAngle(r.x, pipe), onWall = angle > 0;
    const boosted = r.boostTime > 0 || r.padTime > 0;
    const skill = r.ai ? r.ai.speed : wax;
    const target = (boosted ? physics.boostSpeed : physics.baseSpeed) * skill * (onWall ? physics.wallSpeedFactor : 1);
    // A boost must help below cruising speed too; use the same acceleration rule for
    // the player, rivals and boost pads without changing their configured speed caps.
    const acceleration = physics.acceleration * (boosted ? 2 : 1);
    if (r.speed < target) r.speed = Math.min(target, r.speed + acceleration * dt);
    else r.speed = Math.max(target, r.speed - physics.deceleration * dt);
    if (r.boostTime > 0) { r.boostTime = Math.max(0, r.boostTime - dt); if (r.boostTime === 0) emit('boost-end', { riderId: r.id }); }
    else r.tank = Math.min(1, r.tank + physics.boostRechargePerSecond * (r.ai ? 1 : recharge) * dt);
    if (r.padTime > 0) { r.padTime = Math.max(0, r.padTime - dt); if (r.padTime === 0 && r.boostTime === 0) emit('boost-end', { riderId: r.id }); }
    r.hitTime = Math.max(0, r.hitTime - dt); r.grace = Math.max(0, r.grace - dt); r.landTime = Math.max(0, r.landTime - dt); r.crashTime = Math.max(0, r.crashTime - dt);
    // Lateral: steering sets a target lateral speed. Walls pull back toward the floor, turns push
    // toward the outer wall, and airborne riders have reduced (pipe air: no) control.
    if (r.airKind !== 'pipe') {
      const control = r.airborne ? physics.airControl : Math.cos(angle);
      r.vx += (r.steer * physics.lateralSpeed - r.vx) * Math.min(1, physics.lateralResponse * control * dt);
      if (!r.airborne) {
        if (onWall) r.vx -= Math.sign(r.x) * physics.wallGravity * Math.sin(angle) * dt;
        r.vx -= curvatureAt(course.path, r.s) * r.speed * r.speed * physics.turnPush * dt;
      }
      r.x += r.vx * dt;
    }
    if (Math.abs(r.x) >= pipe.lip) {
      const outward = r.vx * Math.sign(r.x);
      if (!r.airborne && outward > physics.lipLaunchSpeed) {
        r.x = Math.sign(r.x) * pipe.lip; r.alt = pipe.lipHeight;
        takeoff(r, 'pipe', outward * physics.lipLaunchFactor + physics.lipKick, 'lip'); r.vx = 0;
      } else { r.x = Math.sign(r.x) * pipe.lip; if (outward > 0) r.vx = 0; }
    }
    const prevS = r.s;
    r.s += r.speed * dt;
    // Vertical
    if (r.ramp) {
      const o = r.ramp, near = o.s - physics.ramp.length / 2, far = o.s + physics.ramp.length / 2;
      if (Math.abs(r.x - o.x) > physics.ramp.width / 2) { r.ramp = null; takeoff(r, 'fall', 0, o.id); }
      else if (r.s >= far) {
        r.ramp = null; r.alt = physics.ramp.height;
        takeoff(r, 'ramp', r.speed * (physics.ramp.height / physics.ramp.length) + physics.rampLaunch, o.id);
      } else r.alt = physics.ramp.height * (r.s - near) / physics.ramp.length;
    } else if (r.airborne) {
      r.vy -= physics.gravity * dt; r.alt += r.vy * dt;
      if (r.trick) { r.trick.t += dt; if (r.trick.t >= r.trick.duration) completeTrick(r); }
      if (r.vy <= 0 && r.alt <= surfaceHeight(r.x, pipe)) land(r);
    } else r.alt = surfaceHeight(r.x, pipe);
    // A ramp/lip can launch after input was read at the top of this tick.
    // Consume the surviving request only after that authoritative launch.
    if (!r.ai) consumePlayerTrick(r);
    interact(r, prevS);
    if (!r.ai) r.peak = Math.max(r.peak, r.speed);
    if (r.s >= course.length) {
      const over = (r.s - course.length) / Math.max(r.speed, 1e-6);
      r.finished = true; r.finishTicks = ticks + 1 - over / step;
      emit('finish', { riderId: r.id });
    }
  }

  function separate() {
    const sep = physics.riderSeparation;
    for (let i = 0; i < riders.length; i++) for (let j = i + 1; j < riders.length; j++) {
      const a = riders[i], b = riders[j];
      if (a.finished || b.finished || a.airborne || b.airborne) continue;
      const ds = a.s - b.s, dx = a.x - b.x;
      if (Math.abs(ds) < 1.6 && Math.abs(dx) < sep) {
        const push = (sep - Math.abs(dx)) * 0.12, dir = dx === 0 ? (a.index < b.index ? -1 : 1) : Math.sign(dx);
        a.x = clamp(a.x + dir * push, -pipe.lip, pipe.lip);
        b.x = clamp(b.x - dir * push, -pipe.lip, pipe.lip);
      }
    }
  }

  function standings() {
    return [...riders].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishTicks - b.finishTicks || a.index - b.index;
      return b.s - a.s || a.index - b.index;
    });
  }

  function finishRace(completed) {
    const player = riders[0], ranked = standings(), rank = ranked.indexOf(player) + 1;
    const elapsedMs = Math.round((completed ? player.finishTicks : ticks) * step * 1000);
    const coins = player.coins.size, reward = alpineReward(balance, stage, rank, completed, coins);
    result = Object.freeze({
      runId: `alpine-${track.id}-${Number(seed) >>> 0}-${run}`, rank, elapsedMs, peakKmh: Math.round(player.peak * 3.6),
      reward: reward.money, won: reward.won, stars: reward.stars, score: reward.score, completed,
      stage, trackId: track.id, seed: Number(seed) >>> 0, totalRiders: riders.length, collisions: player.collisions,
      trickScore: player.trickScore, coins, crashes: player.crashes,
    });
    phase = 'finished';
  }

  function tick() {
    if (phase === 'countdown') {
      countdownTicks--;
      const value = Math.max(0, Math.ceil(countdownTicks * step - 1e-9));
      if (value !== countdownShown) { countdownShown = value; emit('countdown', { value }); }
      if (countdownTicks <= 0) phase = 'racing';
      return;
    }
    ticks++;
    for (const r of riders) updateRider(r, step);
    separate();
    const next = standings().map(r => r.id);
    const playerBefore = order.indexOf('player'), playerAfter = next.indexOf('player');
    if (playerAfter < playerBefore) for (const id of order.slice(playerAfter, playerBefore)) emit('overtake', { riderId: 'player', objectId: id });
    else if (playerAfter > playerBefore) for (const id of next.slice(playerBefore, playerAfter)) emit('overtake', { riderId: id, objectId: 'player' });
    order = next;
    if (riders[0].finished) finishRace(true);
    else if (ticks * step >= balance.maximumSeconds) finishRace(false);
  }

  function frame(r) {
    const p = riders[0];
    return {
      id: r.id, x: r.x, z: p.s - r.s, s: r.s, height: heightOf(r),
      lean: clamp(r.vx / physics.lateralSpeed, -1, 1),
      boosting: r.boostTime > 0 || r.padTime > 0, hit: r.hitTime > physics.recoverySeconds - physics.hitFlashSeconds || r.crashTime > 0,
      crashed: r.crashTime > 0, landing: r.landTime > 0, airborne: r.airborne || r.ramp !== null, airKind: r.airKind,
      trick: r.trick ? { id: r.trick.id, progress: Math.min(1, r.trick.t / r.trick.duration) } : null,
    };
  }

  const copyFrame = value => ({...value, trick: value.trick ? {...value.trick} : null});
  function presentationFrames(player, rivals) {
    const active = !disposed && phase === 'racing' && riders.length > 0;
    const previous = active && previousPresentation;
    return {
      alpha: active ? clamp(accumulator / step, 0, 1) : 1,
      previousPlayer: copyFrame(previous ? previous.player : player),
      previousRivals: (previous ? previous.rivals : rivals).map(copyFrame),
    };
  }

  const engine = {
    course, level, track, pipe,
    command(cmd) {
      if (disposed || !cmd || typeof cmd !== 'object') return;
      switch (cmd.type) {
        case 'start': if (phase === 'menu') reset(); break;
        case 'steer': steerInput = clamp(Number(cmd.value) || 0, -1, 1); break;
        case 'boost': if (phase === 'racing') boostRequest = true; break;
        case 'trick': if (phase === 'racing' && TRICK_IDS.includes(cmd.id)) trickRequest = {id: cmd.id, expiresAt: ticks + Math.max(1, Math.floor(.12 / step))}; break;
        case 'pause': if (phase === 'countdown' || phase === 'racing') { resumePhase = phase; phase = 'paused'; accumulator = 0; steerInput = 0; boostRequest = false; trickRequest = null; previousPresentation = null; } break;
        case 'resume': if (phase === 'paused') { phase = resumePhase; resumePhase = null; accumulator = 0; previousPresentation = null; } break;
        case 'retry': if (phase !== 'menu') reset(); break;
        case 'exit': phase = 'menu'; steerInput = 0; boostRequest = false; trickRequest = null; previousPresentation = null; break;
      }
    },
    step(dtSeconds) {
      if (disposed || (phase !== 'countdown' && phase !== 'racing')) return 0;
      const dt = clamp(Number(dtSeconds) || 0, 0, physics.maxCatchUpSeconds);
      accumulator += dt;
      let count = Math.floor((accumulator + 1e-7) / step);
      accumulator = Math.max(0, accumulator - count * step);
      let done = 0;
      while (count-- > 0 && (phase === 'countdown' || phase === 'racing')) {
        previousPresentation = {player: frame(riders[0]), rivals: riders.slice(1).map(frame)};
        tick(); done++;
      }
      if (phase === 'finished') accumulator = 0;
      return done;
    },
    snapshot() {
      const p = riders[0];
      if (!p) {
        const player = { id: 'player', x: 0, z: 0, s: 0, height: 0, lean: 0, boosting: false, hit: false, trick: null };
        return {
        schemaVersion: 1, phase, timeMs: 0, distanceM: 0, remainingM: course.length, rank: RIDER_IDS.length, totalRiders: RIDER_IDS.length,
        speedKmh: 0, player, rivals: [], obstacles: [],
        countdown: Math.ceil(physics.countdownSeconds), boostFraction: physics.boostStartTank, trackLength: course.length, score: 0, coins: 0, coinTotal: course.coins || 0,
        };
      }
      const ranked = standings();
      const ahead = physics.viewAhead, behind = physics.viewBehind, obstacles = [];
      for (const o of objects) {
        if (o.s < p.s - behind) continue; if (o.s > p.s + ahead) break;
        if (o.type === 'coin') { if (!p.coins.has(o.id)) obstacles.push({ id: o.id, type: 'coin', x: o.x, z: p.s - o.s, s: o.s, h: o.h }); continue; }
        obstacles.push(o.type === 'rock' ? { id: o.id, type: o.type, x: o.x, z: p.s - o.s, s: o.s, radius: o.radius } : { id: o.id, type: o.type, x: o.x, z: p.s - o.s, s: o.s });
      }
      if (course.length - p.s < ahead) obstacles.push({ id: 'finish', type: 'finish', x: 0, z: p.s - course.length, s: course.length });
      const player = frame(p), rivals = riders.slice(1).map(frame);
      return {
        schemaVersion: 1, phase, timeMs: Math.round(ticks * step * 1000), distanceM: p.s, remainingM: Math.max(0, course.length - p.s),
        rank: ranked.indexOf(p) + 1, totalRiders: riders.length, speedKmh: Math.round(p.speed * 3.6),
        player, rivals, obstacles,
        countdown: phase === 'countdown' ? Math.max(1, Math.ceil(countdownTicks * step - 1e-9)) : 0,
        boostFraction: p.boostTime > 0 ? Math.min(1, p.boostTime / (physics.boostSeconds * tankSize)) : p.tank,
        boostReady: p.boostTime <= 0 && p.tank >= physics.boostMinimum,
        trickReady: p.airborne && !p.trick && p.crashTime <= 0,
        score: p.trickScore, coins: p.coins.size, coinTotal: course.coins || 0,
        trackLength: course.length,
        ...(result ? { result: { ...result } } : {}),
      };
    },
    /** Read-only render timing, deliberately separate from the canonical SkiFrame. */
    presentation() {
      const player = riders[0] ? frame(riders[0]) : { id: 'player', x: 0, z: 0, s: 0, height: 0, lean: 0, boosting: false, hit: false, trick: null };
      return presentationFrames(player, riders.slice(1).map(frame));
    },
    drainEvents() { const out = events; events = []; return out; },
    dispose() { disposed = true; events = []; riders = []; steerInput = 0; boostRequest = false; trickRequest = null; previousPresentation = null; },
    /** Read-only diagnostics for tests; never used to render or score. */
    debug() { return riders.map(r => ({ id: r.id, s: r.s, x: r.x, vx: r.vx, speed: r.speed, tank: r.tank, boostTime: r.boostTime, padTime: r.padTime, hitTime: r.hitTime, height: heightOf(r), alt: r.alt, vy: r.vy, airborne: r.airborne, airKind: r.airKind, trick: r.trick ? {...r.trick} : null, trickScore: r.trickScore, crashes: r.crashes, coins: r.coins.size, finished: r.finished, collisions: r.collisions, hits: [...r.hits], pads: [...r.pads], gates: [...r.gates] })); },
    get phase() { return phase; },
    get disposed() { return disposed; },
  };
  return engine;
}
