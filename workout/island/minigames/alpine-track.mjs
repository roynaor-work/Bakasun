import {v241Rules, V241_DEFAULTS} from './alpine-v241.mjs?v=island-v2-20261107-24';

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
 * elevation for the view. Straights and turns alternate after a straight start.
 * v24.1: a 'speed' section (steep drop) falls faster for the view over its stretch (`steep`: [{s0, s1}]). */
export function buildPath(track, physics, steep = null) {
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
    let grade = track.grade[0] + (track.grade[1] - track.grade[0]) * (.5 + .5 * Math.sin(i / 190 + track.seed));
    if (steep) for (const z of steep) if (i > z.s0 - 25 && i < z.s1 + 25) { const e = Math.min(1, (i - z.s0 + 25) / 25, (z.s1 + 25 - i) / 25); grade += .16 * e * e * (3 - 2 * e); }
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
  const deck = patternDeck(random, track), narrowRandom = courseRandom(track.seed + 7919);
  // v24.1 (track.content): sections take over stretches of the course, pickups and snowmen join the rows. Own random streams, so the
  // rows between sections keep the layout rules; without track.content nothing here runs and the course is v24's.
  const content = track.content ? createContent(track, physics, pipe) : null;
  while (s < track.length - track.finishRunout) {
    if (content) { const jump = content.section(s, centre, objects, rows); if (jump) { s = jump.s; centre = jump.centre; continue; } }
    const rowS = s, spacing = between(random, track.rowSpacing);
    // A corridor never asks for a lateral move faster than a boosted rider can make.
    const reach = physics.lateralSpeed * (spacing / physics.boostSpeed) * track.reachFactor;
    const next = Math.max(-track.corridorLimit, Math.min(track.corridorLimit, centre + (random() * 2 - 1) * reach));
    const kind = deck[row++ % deck.length];
    let gap = between(random, track.gap);
    // Narrow passage (track.narrow): some rock rows get a tighter gap and a warning sign pair 30 m before them. Decided on its own
    // random stream so the main layout stream keeps its order.
    const narrowDraw = track.narrow ? narrowRandom() : 1, narrowRow = !!track.narrow && kind === 'rocks' && narrowDraw < track.narrow.chance;
    if (narrowRow) gap *= track.narrow.gapScale;
    const items = [];
    let coins = null;
    if (kind === 'rocks') {
      rockZone(random, -half - 0.4, next - gap / 2, track, items, s);
      rockZone(random, next + gap / 2, half + 0.4, track, items, s);
      rows.push({ s, from: next - gap / 2 + board, to: next + gap / 2 - board });
      coins = random() < track.wallCoins ? 'wall' : 'floor';
    } else if (kind === 'gate' || kind === 'slalom') {
      // track.slalomGates (ski league v23): longer, denser slalom sections on harder stages; the three existing tracks keep 3.
      const count = kind === 'slalom' ? (track.slalomGates ?? 3) : 1;
      for (let i = 0; i < count; i++) {
        const offset = kind === 'slalom' ? (i % 2 ? -1 : 1) * track.slalomOffset : 0;
        const x = Math.max(-half + 2.5, Math.min(half - 2.5, next + offset));
        items.push({ type: 'gate', x: round(x), s: round(s + i * track.slalomStep) });
      }
      rows.push({ s, from: -half, to: half });
      if (kind === 'slalom') s += track.slalomStep * (count - 1); else coins = random() < track.wallCoins ? 'wall' : 'floor';
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
    // Warning signs (non-colliding, drawn by the view): before narrow passages and before rocks hidden behind a jump.
    if (narrowRow || kind === 'rampRocks') {
      const warnS = Math.max(8, s - (physics.warnAhead ?? 30));
      for (const side of [-1, 1]) items.push({ type: 'warn', x: round(side * (half - 0.5)), s: round(warnS), kind: kind === 'rampRocks' ? 'jump' : 'narrow' });
    }
    if (coins) coinLine(random, coins, s + physics.coins.lineStart, next, pipe, physics, items);
    if (content) content.row(kind, rowS, next, items);
    objects.push(...items);
    centre = next;
    s += spacing;
    // The landing zone of a jump stays clear of the following row.
    if (kind.startsWith('ramp')) s = Math.max(s, items[0].s + track.landingClearance);
  }
  objects.sort((a, b) => a.s - b.s || a.x - b.x);
  objects.forEach((object, index) => { object.id = `${track.id}-${index}`; });
  const frozen = Object.freeze(objects.map(o => Object.freeze(o)));
  const wind = windZones(track);
  const sections = content ? Object.freeze(content.sections.map(z => Object.freeze(z))) : null;
  return Object.freeze({ id: track.id, length: track.length, objects: frozen, rows: Object.freeze(rows), path: buildPath(track, physics, sections?.filter(z => z.pace === 'steep')), coins: frozen.filter(o => o.type === 'coin').length, ...(wind ? { wind } : {}), ...(sections ? { sections } : {}) });
}

/** v24.1 course content (track.content): the section plan, the section set pieces and the extras in the regular rows.
 * Fairness: a section's own rows record its free corridor (rocks after an ice patch, the side a mover never reaches); every lateral move a
 * section asks for fits a boosted rider; the opening stretch and the finish run-out stay calm. */
const RAMP_SHIFT = 1.6;           // jump line: a rider who holds the line from one kicker rides onto the next (half width 2.3)
const MOVER_RADIUS = Object.freeze({penguin: .55, snowball: .8, boulder: .85});
function pickKinds(random, weights, count) {
  const pool = Object.entries(weights || {}).filter(([, w]) => w > 0), out = [];
  for (let i = 0; i < count && pool.length; i++) {
    // weighted, never the same kind twice in a row, a kind once per course until every kind has had its turn
    const used = new Set(out), fresh = pool.filter(([k]) => !used.has(k)), from = (fresh.length ? fresh : pool).filter(([k]) => k !== out[out.length - 1]);
    const list = from.length ? from : pool, total = list.reduce((a, [, w]) => a + w, 0);
    let pick = random() * total, kind = list[list.length - 1][0];
    for (const [k, w] of list) { pick -= w; if (pick <= 0) { kind = k; break; } }
    out.push(kind);
  }
  return out;
}
function createContent(track, physics, pipe) {
  const c = track.content, F = pipe.F, hw = physics.board.halfWidth, rules = v241Rules(physics) || V241_DEFAULTS;
  const cr = courseRandom((track.seed + 15485863) >>> 0), pr = courseRandom((track.seed + 32452843) >>> 0);
  const clampX = (x, m) => Math.max(-F + m, Math.min(F - m, x));
  const plan = [], sections = [];
  if (c.sections) {
    const count = Math.round(between(cr, c.sections.count)), A = track.calmStart + 120, B = track.length - track.finishRunout - 30;
    const slot = (B - A) / Math.max(1, count), kinds = pickKinds(cr, c.sections.kinds, count);
    kinds.forEach((kind, i) => {
      const len = kind === 'jumps' ? Math.round(between(cr, [96, 142])) : Math.round(between(cr, c.sections.length || [70, 105]));
      const lo = A + i * slot + 6, hi = A + (i + 1) * slot - len - 6;
      if (hi >= lo) plan.push({kind, s0: Math.round(lo + (hi - lo) * cr()), len});
    });
  }
  // Power-ups in the rows: magnets and shields alternate; stars and power-ups lead into a row's corridor (they sit just before it).
  const powerups = [...Array(c.powerups?.magnet || 0).fill('magnet'), ...Array(c.powerups?.shield || 0).fill('shield')];
  for (let i = powerups.length - 1; i > 0; i--) { const j = Math.floor(pr() * (i + 1)); [powerups[i], powerups[j]] = [powerups[j], powerups[i]]; }
  const sectionPowerups = plan.filter(p => p.kind === 'stars').length;
  const rowPowerups = powerups.slice(sectionPowerups), sectionPick = powerups.slice(0, sectionPowerups);
  const estRows = Math.max(1, Math.round((track.length - track.calmStart - track.finishRunout) / ((track.rowSpacing[0] + track.rowSpacing[1]) / 2)));
  let rowsSeen = 0;
  const star = (x, s, h = rules.star.centre) => ({type: 'star', x: round(x), s: round(s), h: round(h)});
  const builders = {
    jumps(start, len, centre, items, rows) {
      const R = rules.bigRamp, n = len >= 130 ? 3 : 2, v = physics.baseSpeed * 1.05, vy = v * R.height / R.length + R.launch, height = t => R.height + vy * t - physics.gravity * t * t / 2;
      let x = clampX(centre, 2.6);
      for (let i = 0; i < n; i++) {
        const rs = start + 6 + i * 46; if (i) x = clampX(x + (cr() < .5 ? -1 : 1) * (.6 + cr() * (RAMP_SHIFT - .6)), 2.6);
        items.push({type: 'ramp', big: 1, x: round(x), s: round(rs)});
        // An air ring 12 m past the lip at the height a cruising rider flies there, stars along the arc after it.
        const far = rs + R.length / 2, tr = 12 / v;
        items.push({type: 'ring', x: round(x), s: round(far + 12), h: round(height(tr) + rules.star.centre)});
        for (let k = 1; k <= 3; k++) { const t = tr + k * .13; items.push(star(x, far + v * t, height(t) + rules.star.centre)); }
      }
      return {end: start + 6 + (n - 1) * 46 + 44, exit: x};
    },
    movers(start, len, centre, items, rows) {
      const kind = MOVER_RADIUS[c.mover] ? c.mover : 'snowball', radius = MOVER_RADIUS[kind], n = 3, gap = (len - 24) / (n - 1);
      let side = cr() < .5 ? -1 : 1, exit = centre;
      for (let i = 0; i < n; i++) {
        const ms = start + 12 + i * gap, amp = between(cr, c.moverAmp || [2.2, 2.8]), period = between(cr, c.moverPeriod || [3.4, 4.2]);
        const cx = side * (F - .3 - amp), edge = cx - side * (amp + radius + hw + .15);   // the free side ends here (board centre)
        items.push({type: 'mover', kind, x: round(cx), s: round(ms), amp: round(amp), period: round(period), phase: round(cr() * Math.PI * 2), radius});
        const from = side > 0 ? -F : edge, to = side > 0 ? edge : F; rows.push({s: ms, from, to, mover: true});
        exit = (from + to) / 2; items.push(star(exit, ms - 5), star(exit, ms + 5));
        side = -side;
      }
      return {end: start + len, exit};
    },
    ice(start, len, centre, items, rows) {
      const n = 3, gap = (len - 20) / (n - 1), hit = physics.rockHitScale;
      let x = clampX(centre, 3);
      for (let i = 0; i < n; i++) {
        const ps = start + 8 + i * gap, plen = round(between(cr, [11, 15])), w = round(between(cr, [5.6, 7.2]));
        if (i) x = clampX(x + (cr() < .5 ? -1 : 1) * (1.4 + cr() * 1.4), 3);
        items.push({type: 'ice', x: round(x), s: round(ps), w, len: plen});
        for (let k = 0; k < 4; k++) items.push({type: 'coin', x: round(x), s: round(ps - plen / 2 + 1.5 + k * physics.coins.spacing), h: physics.coins.centre});
        // Two rocks just past the patch: a skier who slid off the line has to catch it before them.
        const rockS = ps + plen / 2 + 5, r = .7, off = 2.95;
        for (const sx of [-1, 1]) { const rx = x + sx * off; if (Math.abs(rx) <= F + .4) items.push({type: 'rock', x: round(rx), s: round(rockS), radius: r}); }
        rows.push({s: rockS, from: x - (off - r * hit - hw), to: x + (off - r * hit - hw)});
      }
      return {end: start + len, exit: x};
    },
    powder(start, len, centre, items, rows) {
      const n = 2, gap = len / n, lw = 2.8;
      let lane = clampX(centre, 2);
      for (let i = 0; i < n; i++) {
        const fs = start + 4 + i * gap, flen = gap - 6, mid = fs + flen / 2;
        if (i) lane = clampX(lane + (cr() < .5 ? -1 : 1) * (1.2 + cr() * 1.6), 2);
        const left = [-F - .6, lane - lw / 2], right = [lane + lw / 2, F + .6];
        for (const [a, b] of [left, right]) if (b - a > 1) items.push({type: 'powder', x: round((a + b) / 2), s: round(mid), w: round(b - a), len: round(flen)});
        items.push({type: 'boost', x: round(lane), s: round(fs + flen * .3)});
        for (let k = 0; k < 3; k++) items.push(star(lane, fs + flen * .62 + k * 2.6));
      }
      return {end: start + len, exit: lane};
    },
    stars(start, len, centre, items, rows) {
      const n = 14, cx = Math.max(-2, Math.min(2, centre)), ph = cr() * Math.PI * 2, amp = 2.4 + cr() * .8;
      let x = cx;
      for (let i = 0; i < n; i++) { x = clampX(cx + amp * Math.sin(ph + i * .45), .8); items.push(star(x, start + 10 + i * (len - 20) / (n - 1))); }
      const type = sectionPick.shift(); if (type) items.push({type, x: round(clampX(cx + amp * Math.sin(ph), .8)), s: round(start + 4)});
      return {end: start + len, exit: x};
    },
    speed(start, len, centre, items, rows) {
      const n = 3, gap = (len - 20) / (n - 1);
      let x = clampX(centre, 1.7);
      for (let i = 0; i < n; i++) {
        const ps = start + 8 + i * gap; if (i) x = clampX(x + (cr() < .5 ? -1 : 1) * cr() * 1.4, 1.7);
        items.push({type: 'boost', x: round(x), s: round(ps)});
        if (i < n - 1) items.push({type: 'gate', x: round(clampX(x, 2.5)), s: round(ps + gap / 2)});
      }
      return {end: start + len, exit: x, pace: 'steep'};
    }
  };
  return {
    sections,
    /** At the top of the row loop: when the next planned section is due, build it and return where the rows resume. */
    section(s, centre, objects, rows) {
      const next = plan[0]; if (!next || s < next.s0 - 6) return null;
      plan.shift();
      const start = Math.max(next.s0, s), items = [];
      if (start + next.len > track.length - track.finishRunout - 10) return null;
      const built = builders[next.kind](start, next.len, centre, items, rows);
      sections.push({kind: next.kind, s0: round(start), s1: round(built.end), ...(built.pace ? {pace: built.pace} : {})});
      objects.push(...items);
      return {s: built.end + 10, centre: built.exit};
    },
    /** After a regular row is laid out: snowmen among its rocks, and stars or a power-up leading into the next corridor. */
    row(kind, s, next, items) {
      rowsSeen++;
      if (kind === 'rocks' && c.snowmen) for (const o of items) if (o.type === 'rock' && pr() < c.snowmen) o.type = 'snowman';
      // nothing extra in the opening, nor right after a section (its last rocks or landing are just behind this row)
      if (s < track.calmStart + 60 || (sections.length && s - 14 < sections[sections.length - 1].s1)) return;
      const left = Math.max(1, estRows - rowsSeen);
      if (rowPowerups.length && pr() < rowPowerups.length / Math.max(1, left * .4)) { items.push({type: rowPowerups.shift(), x: round(next), s: round(s - 8)}); return; }
      if (c.stars && pr() < c.stars) for (let k = 0; k < 3; k++) items.push(star(next, s - 10.5 + k * 2.2));
    }
  };
}

/** Ski league v23: gusts of side wind (track.wind), fixed per course on their own random stream, so every rider meets the same gust
 * at the same place. A zone {s0, s1, dir, speed} pushes riders sideways at up to `speed` m/s, easing in and out over WIND_EASE metres.
 * Tracks without `wind` (the three existing ones) get no zones and no `wind` key. */
export const WIND_EASE = 14;
function windZones(track) {
  const w = track.wind; if (!w) return null;
  const random = courseRandom((track.seed + 104729) >>> 0), zones = [];
  let s = w.start ?? 160;
  while (s < track.length - (w.end ?? 90)) {
    const length = Math.round(between(random, w.length)), speed = round(between(random, w.speed)), dir = random() < .5 ? -1 : 1;
    zones.push(Object.freeze({ s0: round(s), s1: round(Math.min(track.length - 40, s + length)), dir, speed }));
    s += length + Math.round(between(random, w.every));
  }
  return Object.freeze(zones);
}
/** Signed side wind (m/s, + is to the right) at distance s. Pure lookup (binary search), safe for snapshots. */
export function windAt(zones, s) {
  if (!zones?.length) return 0;
  let lo = 0, hi = zones.length - 1, i = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (zones[mid].s0 <= s) { i = mid; lo = mid + 1; } else hi = mid - 1; }
  const z = zones[i]; if (!z || s > z.s1) return 0;
  return z.dir * z.speed * Math.max(0, Math.min(1, (s - z.s0) / WIND_EASE, (z.s1 - s) / WIND_EASE));
}
/** The next gust that has not started at s (for the HUD warning), or null. */
export function nextWind(zones, s, within = 60) {
  if (!zones?.length) return null;
  for (const z of zones) if (z.s0 > s) return z.s0 - s <= within ? { dir: z.dir, speed: z.speed, inM: Math.round(z.s0 - s) } : null;
  return null;
}

/** Rock collision height: the snow-capped dome reaches about 0.4 + 0.65r. */
export function rockClearance(radius) { return 0.4 + 0.65 * radius; }
