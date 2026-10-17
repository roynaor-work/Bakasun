// Pure, fixed-step tennis. Coordinates: child +Z, opponent -Z; metres/seconds.
// No DOM, storage, wall clock or Math.random. The host owns loading and lifecycle.
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (value + 0x6D2B79F5) >>> 0; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function createScore() { return { points: [0, 0], games: [0, 0], finished: false, winner: null }; }
export function awardPoint(score, side, rules) {
  if (score.finished || ![0, 1].includes(side)) return { game: false, match: score.finished };
  score.points[side]++;
  const other = 1 - side;
  const game = score.points[side] >= rules.pointsToWin && score.points[side] - score.points[other] >= rules.pointMargin;
  if (game) { score.games[side]++; score.points = [0, 0]; }
  if (score.games[side] >= rules.gamesToWin) { score.finished = true; score.winner = side; }
  return { game, match: score.finished };
}
export function pointLabels(score, rules) {
  const [a, b] = score.points;
  if (a >= rules.pointsToWin - 1 && b >= rules.pointsToWin - 1) {
    if (a === b) return ['deuce', 'deuce'];
    return a > b ? ['advantage', 40] : [40, 'advantage'];
  }
  return score.points.map(n => rules.pointValues[Math.min(n, rules.pointValues.length - 1)]);
}
export function buildResult(score, stage, seed, durationSeconds, rules) {
  if (!score.finished) return null;
  const won = score.winner === 0;
  const stars = won ? score.games[1] === 0 ? rules.perfectStars : score.games[1] <= rules.goodWinAgainst ? rules.goodWinStars : rules.winStars : rules.lossStars;
  return { won, gamesFor: score.games[0], gamesAgainst: score.games[1], stage, stars, seed, durationSeconds: Math.round(durationSeconds * 1000) / 1000 };
}
// Solve the next ground contact and the rising, post-bounce racket contact.
export function predictLanding(ball, config) {
  const c = config.ball, g = c.gravity;
  const t = Math.max(0, (ball.vy + Math.sqrt(Math.max(0, ball.vy ** 2 + 2 * g * (ball.y - c.radius)))) / g);
  return { x: ball.x + ball.vx * t, z: ball.z + ball.vz * t, seconds: t };
}
export function createTennis({ config, stage = 1, seed = config.seed, ranks = config.player.defaults,difficulty='easy' } = {}) {
  stage = clamp(Math.trunc(Number(stage) || 1), 1, config.levels.length);
  seed = Number(seed) >>> 0;
  const rng = seededRandom(seed), selected=config.levels[stage-1],d=config.difficulties?.[difficulty]||{speed:1,timing:1,miss:0},level={...selected,speed:selected.speed*d.speed,timingWindow:selected.timingWindow*d.timing,missChance:clamp(selected.missChance+d.miss,0,config.opponent.maximumMissChance)}, p = config.player, c = config.ball, court = config.court, rules = config.rules;
  const safeRanks = Object.fromEntries(['speed', 'hit', 'serve'].map(k => [k, clamp(Math.trunc(Number(ranks[k]) || p.defaults[k]), p.rankMin, p.rankMax)]));
  const attributes = { speed: p.speedByRank[safeRanks.speed - 1], hitPower: p.hitPowerByRank[safeRanks.hit - 1], servePower: p.servePowerByRank[safeRanks.serve - 1] };
  const score = createScore();
  const state = { stage, seed, ranks: safeRanks, attributes, timingWindow: level.timingWindow, phase: 'serve', elapsed: 0, phaseTime: 0, server: 0, score, pointLabels: [0, 0], players: [{ x: 0, z: p.readyZ, swing: 0, running: false }, { x: 0, z: -p.readyZ, swing: 0, running: false }], ball: { x: 0, y: c.serveHeight, z: p.readyZ, vx: 0, vy: 0, vz: 0, bounces: 0, lastHitter: 0 }, landing: null, contact: null, charge: 0, rallyHits: 0, pointNumber: 0, event: { id: 0, type: 'ready' }, result: null, shot: null };
  let lob=false;let accumulator = 0, inputWasSwing = false, pendingTap = null, cooldown = 0, rallyTime = 0, shotTime = 0, aiMiss = false, aiOffset = 0, humanTarget = 0;
  function emit(type, details = {}) { state.event = { id: state.event.id + 1, type, ...details }; }
  function prepareServe() {
    state.phase = 'serve'; state.phaseTime = 0; state.charge = 0; state.rallyHits = 0; pendingTap = null; rallyTime = 0;
    for (let i = 0; i < 2; i++) { state.players[i].x = 0; state.players[i].z = (i === 0 ? 1 : -1) * p.readyZ; }
    Object.assign(state.ball, { x: 0, y: c.serveHeight, z: state.players[state.server].z, vx: 0, vy: 0, vz: 0, bounces: 0, lastHitter: state.server });
    state.landing = null; state.contact = null; state.shot = null; emit('ready');
  }
  function point(winner, reason) {
    if (state.phase !== 'rally' && state.phase !== 'serve') return;
    const ace = state.rallyHits === 1 && state.ball.lastHitter === state.server && winner === state.server && reason !== 'out' && reason !== 'net';
    state.ball.vx = state.ball.vy = state.ball.vz = 0;
    const transition = awardPoint(score, winner, rules);
    state.pointLabels = pointLabels(score, rules); state.pointNumber++; state.phaseTime = 0;
    state.phase = transition.match ? 'complete' : transition.game ? 'game' : 'point';
    state.result = buildResult(score, stage, seed, state.elapsed, rules);if(state.result)state.result.difficulty=difficulty;
    emit(transition.match ? 'complete' : transition.game ? 'game' : 'point', { winner, reason, ace });
    state.landing = null; state.contact = null; pendingTap = null;
    if (transition.game) state.server = 1 - state.server;
  }
  function planContact() {
    const b = state.ball, landing = predictLanding(b, config);
    const downSpeed = b.vy - c.gravity * landing.seconds;
    const upSpeed = -downSpeed * c.bounce;
    const discriminant = upSpeed ** 2 - 2 * c.gravity * (c.hitHeight - c.radius);
    const afterBounce = (upSpeed - Math.sqrt(Math.max(0, discriminant))) / c.gravity;
    state.landing = { ...landing, valid: Math.abs(landing.x) <= court.halfWidth + court.lineTolerance && Math.abs(landing.z) <= court.halfLength + court.lineTolerance };
    const time = landing.seconds + afterBounce;
    state.contact = { x: b.x + b.vx * time, z: b.z + b.vz * time, at: state.elapsed + time, eta: time, side: 1 - b.lastHitter };
  }
  function shoot(side, timing = 0, charge = 0) {
    const b = state.ball, serving = state.phase === 'serve';
    const power = side === 0 ? (serving ? attributes.servePower + charge * p.chargeBonus : attributes.hitPower - Math.abs(timing) * p.timingPowerPenalty) : level.power;
    let targetX = 0;
    if (side === 0) {
      targetX = Math.abs(timing) > p.timingCenterFraction ? Math.sign(timing) * c.spread * Math.min(1, Math.abs(timing)) : 0;
    } else {
      const corner = rng() < level.cornerChance;
      targetX = corner ? (state.players[0].x >= 0 ? -1 : 1) * c.spread : 0;
      targetX += (rng() - 0.5) * (1 - level.accuracy) * c.spread;
    }
    const direction = side === 0 ? -1 : 1;
    const targetZ = direction * (serving ? court.serviceLength - c.outMargin : c.depth);
    const pace = power + (serving ? 0 : Math.min(c.rallyPowerLimit, state.rallyHits * c.rallyPowerPerHit));
    const flight = Math.max(c.minimumFlight, c.flightSeconds - pace * c.powerFlightFactor)*(side===0&&lob?config.lob.flightMultiplier:1);
    if (serving) { b.x = state.players[side].x; b.z = state.players[side].z - (side === 0 ? 1 : -1) * p.contactOffsetZ; }
    b.y = serving ? c.serveHeight : Math.max(c.hitHeight, b.y);
    b.vx = (targetX - b.x) / flight; b.vz = (targetZ - b.z) / flight;
    b.vy = (c.radius - b.y + 0.5 * c.gravity * flight ** 2) / flight;
    b.bounces = 0; b.lastHitter = side;
    state.phase = 'rally'; state.phaseTime = 0; state.rallyHits++; shotTime = 0;
    state.players[side].swing = p.swingSeconds;
    const fatigue = Math.max(0, state.rallyHits - config.opponent.fatigueAfterHits) * config.opponent.fatigueMissPerHit;
    aiMiss = rng() < Math.min(config.opponent.maximumMissChance, level.missChance + fatigue); aiOffset = (rng() - 0.5) * (1 - level.accuracy) * c.spread;
    state.shot = { side, serving, power, targetX, targetZ, flight, timing };
    planContact(); emit('hit', { side, serving, timing, power }); pendingTap = null;
  }
  function swing() {
    if (cooldown > 0) return;
    cooldown = p.swingCooldown;
    if (state.phase === 'serve' && state.server === 0) { shoot(0, 0, state.charge); state.charge = 0; return; }
    if (state.phase !== 'rally' || state.ball.lastHitter !== 1 || !state.contact) return;
    const difference = state.elapsed - state.contact.at;
    const half = level.timingWindow / 2;
    if (Math.abs(difference) <= half) {
      pendingTap = difference / half;
      if (difference >= 0) tryHumanHit();
    } else { state.players[0].swing = p.swingSeconds; emit('timing'); }
  }
  function tryHumanHit() {
    if (pendingTap === null || !state.contact) return;
    const near = Math.abs(state.players[0].x - state.ball.x) <= p.reach && Math.abs(state.players[0].z - state.ball.z) <= p.reach;
    if (near || stage <= p.assistStages) shoot(0, pendingTap);
    else { pendingTap = null; emit('missSwing'); }
  }
  function movePlayer(index, x, z, speed, dt) {
    const player = state.players[index], dx = clamp(x - player.x, -speed * dt, speed * dt), dz = clamp(z - player.z, -p.autoZSpeed * dt, p.autoZSpeed * dt);
    player.x = clamp(player.x + dx, -court.playerLimit, court.playerLimit);
    player.z = clamp(player.z + dz, index === 0 ? p.contactOffsetZ : -court.halfLength - p.reach, index === 0 ? court.halfLength + p.reach : -p.contactOffsetZ);
    player.running = Math.abs(dx) + Math.abs(dz) > 0.001;
  }
  function step(dt, input) {
    state.elapsed += dt; state.phaseTime += dt; cooldown = Math.max(0, cooldown - dt);
    state.players.forEach(player => { player.swing = Math.max(0, player.swing - dt); });
    if (state.phase === 'complete') return;
    if (state.phase === 'point' || state.phase === 'game') {
      if (state.phaseTime >= (state.phase === 'game' ? rules.gamePause : rules.pointPause)) prepareServe();
      return;
    }
    if (Number.isFinite(input.targetX)) humanTarget = clamp(input.targetX, -court.playerLimit, court.playerLimit);
    else if (Number.isFinite(input.move) && input.move !== 0) humanTarget = clamp(state.players[0].x + input.move * attributes.speed * dt, -court.playerLimit, court.playerLimit);
    const contact = state.contact;
    if (contact) contact.eta = contact.at - state.elapsed;
    const incoming = contact?.side === 0;
    movePlayer(0, incoming && stage <= p.assistStages ? contact.x : humanTarget, incoming ? contact.z + p.contactOffsetZ : p.readyZ, incoming && stage <= p.assistStages ? p.assistSpeed : attributes.speed, dt);
    const aiIncoming = contact?.side === 1;
    const approach = state.phase === 'rally' && level.netChance > 0 && state.pointNumber % Math.max(1, Math.round(1 / level.netChance)) === 0;
    movePlayer(1, aiIncoming && shotTime >= level.reaction ? contact.x + aiOffset : 0, aiIncoming ? contact.z - p.contactOffsetZ : approach ? -court.serviceLength : -p.readyZ, level.speed, dt);
    if (state.phase === 'serve') {
      const b = state.ball, server = state.players[state.server]; b.x = server.x; b.z = server.z;
      if (state.server === 0) {
        if (input.charge) state.charge = clamp(state.charge + dt / p.chargeSeconds, 0, 1);
        if (state.phaseTime >= rules.serveTimeout) point(1, 'timeout');
      } else if (state.phaseTime >= rules.serveWait) shoot(1);
      return;
    }
    rallyTime += dt; shotTime += dt;
    const b = state.ball, previousZ = b.z, previousY = b.y;
    b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt - 0.5 * c.gravity * dt * dt; b.vy -= c.gravity * dt;
    // Swept net crossing: a fast ball cannot skip the net between ticks.
    if (previousZ * b.z <= 0 && previousZ !== b.z) {
      const alpha = Math.abs(previousZ) / Math.abs(b.z - previousZ);
      if (previousY + (b.y - previousY) * alpha - c.radius < court.netHeight) { b.z = 0; point(1 - b.lastHitter, 'net'); return; }
    }
    if (b.y <= c.radius && b.vy < 0) {
      b.y = c.radius; b.bounces++;
      if (b.bounces === 1) {
        const wrongSide = b.z * (b.lastHitter === 0 ? -1 : 1) < 0;
        const serveOut = state.shot.serving && Math.abs(b.z) > court.serviceLength + court.lineTolerance;
        if (Math.abs(b.x) > court.halfWidth + court.lineTolerance || Math.abs(b.z) > court.halfLength + court.lineTolerance || wrongSide || serveOut) { point(1 - b.lastHitter, 'out'); return; }
        b.vy = -b.vy * c.bounce;
      } else { point(b.lastHitter, 'doubleBounce'); return; }
    }
    if (state.contact?.side === 0 && state.elapsed >= state.contact.at && pendingTap !== null) tryHumanHit();
    if (state.contact?.side === 1 && b.bounces === 1 && state.elapsed >= state.contact.at) {
      if (!aiMiss && Math.abs(state.players[1].x - b.x) <= p.reach && Math.abs(state.players[1].z - b.z) <= p.reach) shoot(1);
    }
    // Bounded point fallback covers even a pathological endless exchange.
    if (rallyTime >= rules.rallyTimeout) point(b.lastHitter, 'timeout');
  }
  function update(dt, input = {}) {
    if (!Number.isFinite(dt) || dt < 0 || state.phase === 'complete') return state;
    // A tap is an edge; held charge is continuous. Consume taps even below one tick.
    lob=Boolean(input.lob);const tap = Boolean(input.swing) && !inputWasSwing; inputWasSwing = Boolean(input.swing);
    if (tap) swing();
    accumulator += Math.min(dt, config.simulation.maxDelta);
    while (accumulator + 1e-10 >= config.simulation.step && state.phase !== 'complete') { step(config.simulation.step, input); accumulator -= config.simulation.step; }
    state.pointLabels = pointLabels(score, rules);
    return state;
  }
  return { update, getState: () => state, snapshot: () => structuredClone(state), get result() { return state.result; } };
}
