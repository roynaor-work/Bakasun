/** Alpine Rush course model. One straight centreline shared by physics, AI and view:
 * s grows downhill (metres), x is lateral (metres, right is positive).
 * Every course is generated from its own fixed seed in config, so a track is identical
 * on every run and device. Only AI decisions use the race seed. */

export function courseRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

const between = (random, [min, max]) => min + (max - min) * random();
const round = value => Math.round(value * 100) / 100;

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

/**
 * generateCourse(track, physics) -> { id, length, objects, rows }
 * rows[] records the guaranteed free corridor of each row for fairness checks:
 * {s, from, to} in board-centre coordinates (the board never touches a rock there).
 */
export function generateCourse(track, physics) {
  const random = courseRandom(track.seed);
  const half = physics.trackHalfWidth, board = physics.board.halfWidth;
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
    if (kind === 'rocks') {
      rockZone(random, -half - 0.6, next - gap / 2, track, items, s);
      rockZone(random, next + gap / 2, half + 0.6, track, items, s);
      rows.push({ s, from: next - gap / 2 + board, to: next + gap / 2 - board });
    } else if (kind === 'gate' || kind === 'slalom') {
      const count = kind === 'slalom' ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const offset = kind === 'slalom' ? (i % 2 ? -1 : 1) * track.slalomOffset : 0;
        const x = Math.max(-half + 2.6, Math.min(half - 2.6, next + offset));
        items.push({ type: 'gate', x: round(x), s: round(s + i * track.slalomStep) });
      }
      rows.push({ s, from: -half, to: half });
      if (kind === 'slalom') s += track.slalomStep * 2;
    } else if (kind === 'pad') {
      items.push({ type: 'boost', x: round(Math.max(-half + 1.7, Math.min(half - 1.7, next))), s: round(s) });
      // Rocks on the far sides only; the pad lane itself stays open.
      rockZone(random, -half - 0.6, next - 4.2, track, items, s + 10);
      rockZone(random, next + 4.2, half + 0.6, track, items, s + 10);
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
      }
    }
    objects.push(...items);
    centre = next;
    s += spacing;
    // The landing zone of a jump stays clear of the following row.
    if (kind.startsWith('ramp')) s = Math.max(s, items[0].s + track.landingClearance);
  }
  objects.sort((a, b) => a.s - b.s || a.x - b.x);
  objects.forEach((object, index) => { object.id = `${track.id}-${index}`; });
  return Object.freeze({ id: track.id, length: track.length, objects: Object.freeze(objects.map(o => Object.freeze(o))), rows: Object.freeze(rows) });
}

/** Rock collision height: the snow-capped dome reaches about 0.4 + 0.65r. */
export function rockClearance(radius) { return 0.4 + 0.65 * radius; }
