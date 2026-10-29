/** Alpine Rush course model, shared by physics, AI and view.
 * s grows downhill along a curved centreline (metres); x is lateral in the track frame
 * (metres, right is positive). The track is a halfpipe: a flat floor with curved walls up
 * to a lip. Courses, turns and coins come from each track's fixed seed in config, so a
 * track is identical on every run and device. Only AI decisions use the race seed. */

export function courseRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

const between = (random, [min, max]) => min + (max - min) * random();
const round = value => Math.round(value * 100) / 100;

/** Halfpipe cross-section from physics.pipe: floor half width F, wall radius R and the lip angle. */
export function pipeProfile(physics) {
  const p = physics.pipe, a = p.maxAngle * Math.PI / 180, wall = p.radius * Math.sin(a);
  return Object.freeze({F: p.flatHalf, R: p.radius, angle: a, wall, lip: p.flatHalf + wall, lipHeight: p.radius * (1 - Math.cos(a))});
}
/** Height of the riding surface above the floor at lateral position x. */
export function surfaceHeight(x, pipe) {
  const u = Math.min(Math.abs(x) - pipe.F, pipe.wall);
  return u <= 0 ? 0 : pipe.R - Math.sqrt(pipe.R * pipe.R - u * u);
}
/** Wall slope angle (radians) at x; zero on the floor. */
export function wallAngle(x, pipe) {
  const u = Math.min(Math.abs(x) - pipe.F, pipe.wall);
  return u <= 0 ? 0 : Math.asin(u / pipe.R);
}

/** Curved centreline sampled every metre: curvature, heading, world x/z and a downhill
 * elevation for the view. Straights and turns alternate after a straight start. */
export function buildPath(track, physics) {
  const random = courseRandom((track.seed ^ 0x51ed27) >>> 0), t = track.turns;
  const count = Math.ceil(track.length + physics.pathRunout) + 2;
  const kappa = new Float64Array(count), theta = new Float64Array(count), px = new Float64Array(count), pz = new Float64Array(count), py = new Float64Array(count);
  let s = Math.round(between(random, t.firstStraight)), dir = random() < .5 ? -1 : 1;
  while (s < track.length) {
    const radius = between(random, t.radius), length = Math.round(between(random, t.length)), k = dir / radius, ramp = t.transition;
    for (let i = 0; i < length && s + i < count; i++) {
      const edge = Math.min(i, length - 1 - i), w = Math.min(1, edge / ramp);
      kappa[s + i] = k * (w * w * (3 - 2 * w));
    }
    s += length + Math.round(between(random, t.straight));
    if (random() < t.alternate) dir = -dir;
  }
  for (let i = 1; i < count; i++) {
    theta[i] = theta[i - 1] + (kappa[i - 1] + kappa[i]) / 2;
    const h = (theta[i - 1] + theta[i]) / 2;
    px[i] = px[i - 1] + Math.sin(h); pz[i] = pz[i - 1] - Math.cos(h);
    const grade = track.grade[0] + (track.grade[1] - track.grade[0]) * (.5 + .5 * Math.sin(i / 190 + track.seed));
    py[i] = py[i - 1] - grade;
  }
  return Object.freeze({count, kappa, theta, px, pz, py});
}
/** Curvature at s (1/m); positive turns right. */
export function curvatureAt(path, s) {
  if (!path) return 0;
  const i = Math.max(0, Math.min(path.count - 1, Math.floor(s)));
  return path.kappa[i];
}

/** A shuffled deck keeps each course's mix of sections as configured, not left to chance.
 * The opening sections come first in the order given (a gentle start). */
function patternDeck(random, track) {
  const entries = Object.entries(track.patterns).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  const rows = Math.ceil((track.length - track.calmStart - track.finishRunout) / ((track.rowSpacing[0] + track.rowSpacing[1]) / 2)) + 4;
  const deck = [];
  for (const [key, w] of entries) for (let i = 0; i < Math.max(1, Math.round(rows * w / total)); i++) deck.push(key);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return [...(track.opening || []), ...deck];
}

/** Fill one side zone [from,to] with rocks whose edges stay outside the free corridor. */
function rockZone(random, from, to, def, out, s) {
  const width = to - from;
  if (width < 1.4) return;
  const slots = Math.max(1, Math.floor(width / def.rockPitch));
  for (let i = 0; i < slots; i++) {
    if (random() > def.rockDensity) continue;
    const r = round(between(random, def.rockRadius));
    const lo = from + i * width / slots + r, hi = from + (i + 1) * width / slots - r;
    if (hi < lo) continue;
    out.push({ type: 'rock', x: round(lo + (hi - lo) * random()), s: round(s + between(random, [-1.5, 1.5])), radius: r });
  }
}

/** Coin lines between rows: on the floor, up and down a wall, or in the air over a jump.
 * h is the height of the coin centre above the floor. */
function coinLine(random, kind, s, x, pipe, physics, out) {
  const coin = physics.coins, n = coin.perLine;
  if (kind === 'air') {
    // Follows a jump at base speed: collected only by riders who take the ramp.
    const far = s + physics.ramp.length / 2, v = physics.baseSpeed, vy = v * physics.ramp.height / physics.ramp.length + physics.rampLaunch;
    for (let i = 1; i <= n; i++) { const t = i * .15; out.push({ type: 'coin', x: round(x), s: round(far + v * t), h: round(physics.ramp.height + vy * t - physics.gravity * t * t / 2 + coin.centre) }); }
    return;
  }
  if (kind === 'wall') {
    const side = random() < .5 ? -1 : 1;
    for (let i = 0; i < n; i++) { const u = Math.sin(Math.PI * i / (n - 1)), cx = side * (pipe.F + .4 + u * (pipe.wall - 1.1)); out.push({ type: 'coin', x: round(cx), s: round(s + i * coin.spacing), h: round(surfaceHeight(cx, pipe) + coin.centre) }); }
    return;
  }
  for (let i = 0; i < n; i++) out.push({ type: 'coin', x: round(x), s: round(s + i * coin.spacing), h: coin.centre });
}

/**
 * generateCourse(track, physics) -> { id, length, objects, rows, path, coins }
 * rows[] records the guaranteed free corridor of each row on the floor for fairness checks:
 * {s, from, to} in board-centre coordinates (the board never touches a rock there).
 * The walls are always free of obstacles.
 */
export function generateCourse(track, physics) {
  const random = courseRandom(track.seed), pipe = pipeProfile(physics);
  const half = pipe.F, board = physics.board.halfWidth;
  const objects = [], rows = [];
  let s = track.calmStart, centre = 0, row = 0;
  const deck = patternDeck(random, track);
  while (s < track.length - track.finishRunout) {
    const spacing = between(random, track.rowSpacing);
    // A corridor never asks for a lateral move faster than a boosted rider can make.
    const reach = physics.lateralSpeed * (spacing / physics.boostSpeed) * track.reachFactor;
    const next = Math.max(-track.corridorLimit, Math.min(track.corridorLimit, centre + (random() * 2 - 1) * reach));
    const kind = deck[row++ % deck.length];
    const gap = between(random, track.gap);
    const items = [];
    let coins = null;
    if (kind === 'rocks') {
      rockZone(random, -half - 0.4, next - gap / 2, track, items, s);
      rockZone(random, next + gap / 2, half + 0.4, track, items, s);
      rows.push({ s, from: next - gap / 2 + board, to: next + gap / 2 - board });
      coins = random() < track.wallCoins ? 'wall' : 'floor';
    } else if (kind === 'gate' || kind === 'slalom') {
      const count = kind === 'slalom' ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const offset = kind === 'slalom' ? (i % 2 ? -1 : 1) * track.slalomOffset : 0;
        const x = Math.max(-half + 2.5, Math.min(half - 2.5, next + offset));
        items.push({ type: 'gate', x: round(x), s: round(s + i * track.slalomStep) });
      }
      rows.push({ s, from: -half, to: half });
      if (kind === 'slalom') s += track.slalomStep * 2; else coins = random() < track.wallCoins ? 'wall' : 'floor';
    } else if (kind === 'pad') {
      items.push({ type: 'boost', x: round(Math.max(-half + 1.7, Math.min(half - 1.7, next))), s: round(s) });
      // Rocks on the far sides only; the pad lane itself stays open.
      rockZone(random, -half - 0.4, next - 4.2, track, items, s + 10);
      rockZone(random, next + 4.2, half + 0.4, track, items, s + 10);
      rows.push({ s: s + 10, from: next - 4.2 + board, to: next + 4.2 - board });
    } else if (kind === 'ramp' || kind === 'rampRocks') {
      const x = round(Math.max(-half + 2.2, Math.min(half - 2.2, next)));
      items.push({ type: 'ramp', x, s: round(s) });
      if (kind === 'rampRocks') {
        // Rocks just beyond the lip: cleared by any jump, avoided on the ground beside it.
        const rockS = s + 3 + track.rampRockDistance;
        items.push({ type: 'rock', x: round(x - 1), s: round(rockS), radius: 0.75 }, { type: 'rock', x: round(x + 1), s: round(rockS + 0.8), radius: 0.75 });
        const side = x > 0 ? -1 : 1, free = x + side * 4.4;
        rows.push({ s: rockS, from: Math.min(free, side < 0 ? -half : free), to: Math.max(free, side < 0 ? free : half) });
      } else coinLine(random, 'air', s, x, pipe, physics, items);
    }
    if (coins) coinLine(random, coins, s + physics.coins.lineStart, next, pipe, physics, items);
    objects.push(...items);
    centre = next;
    s += spacing;
    // The landing zone of a jump stays clear of the following row.
    if (kind.startsWith('ramp')) s = Math.max(s, items[0].s + track.landingClearance);
  }
  objects.sort((a, b) => a.s - b.s || a.x - b.x);
  objects.forEach((object, index) => { object.id = `${track.id}-${index}`; });
  const frozen = Object.freeze(objects.map(o => Object.freeze(o)));
  return Object.freeze({ id: track.id, length: track.length, objects: frozen, rows: Object.freeze(rows), path: buildPath(track, physics), coins: frozen.filter(o => o.type === 'coin').length });
}

/** Rock collision height: the snow-capped dome reaches about 0.4 + 0.65r. */
export function rockClearance(radius) { return 0.4 + 0.65 * radius; }
