/** v6 "תפוס את הפושע": the chase road is a real track with turns, not a straight street with a shader bend.
 * Pure geometry, no DOM, no Three.js, shared by the chase rules (catch-chase6.mjs), the Three.js view and the simulation.
 *
 * World: x and z are the ground plane (y is up, as in Three.js). The track starts at the origin heading +x.
 * `s` is the distance along the centre line in metres, `d` the sideways offset: d > 0 is the RIGHT of the direction
 * of travel (right = tangent x up = (-tz, tx)). A car at (s, d) stands at toWorld(s, d).
 * Segments are straights and circular arcs, so positions are exact; samples every metre speed up lookups.
 * Beyond both ends the track continues straight, so nothing ever runs off the data. */

export function seededRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Segment plan from the stage: `curve` 0..1 (stage difficulty): more and tighter turns as it grows.
 * Every track opens with a straight (the countdown) and closes with a long straight (the roadblock). */
export function planSegments({rnd, length, curve = .5}) {
  const segs = [{kind: 'straight', len: 70}];
  let total = 70, dir = rnd() < .5 ? 1 : -1, sinceS = 0;
  while (total < length - 120) {
    const tight = clamp(curve, 0, 1);
    const radius = Math.round(110 - 62 * tight + rnd() * (60 - 30 * tight)); // 48..170 m: a car at 25 m/s needs to steer into anything under ~90
    const angle = (28 + rnd() * (34 + 46 * tight)) * Math.PI / 180;        // 28..108 degrees
    segs.push({kind: 'arc', radius, angle, dir}); total += radius * angle;
    // an S-bend: the next turn goes the other way with only a short straight between
    const sBend = rnd() < .35 + .4 * tight && sinceS > 1;
    const straight = sBend ? 18 + rnd() * 14 : 45 + rnd() * (70 - 30 * tight);
    segs.push({kind: 'straight', len: Math.round(straight)}); total += straight;
    if (sBend) { dir = -dir; sinceS = 0; } else { dir = rnd() < .6 ? -dir : dir; sinceS++; }
  }
  segs.push({kind: 'straight', len: Math.max(120, length - total + 60)});
  return segs;
}

/** Builds the track: `length` metres of chase road at least, `curve` 0..1. */
export function buildTrack({seed = 1, length = 1200, curve = .5, segments: given = null} = {}) {
  const rnd = seededRandom((seed * 747796405 + 2891336453) >>> 0);
  const segs = given || planSegments({rnd, length, curve});
  // exact walk through the segments, sampled every metre
  const pts = []; let x = 0, z = 0, h = 0, s = 0; // h = heading angle, 0 = +x, positive turns LEFT (towards -z)
  const push = (k) => pts.push({x, z, tx: Math.cos(h), tz: -Math.sin(h), k, s});
  push(0);
  const ranges = [];
  for (const seg of segs) {
    const s0 = s;
    if (seg.kind === 'straight') {
      const n = Math.max(1, Math.round(seg.len));
      for (let i = 0; i < n; i++) { x += Math.cos(h); z += -Math.sin(h); s += 1; push(0); }
    } else {
      const total = seg.radius * seg.angle, n = Math.max(1, Math.round(total)), dh = seg.dir * seg.angle / n, k = seg.dir / seg.radius;
      for (let i = 0; i < n; i++) { const hm = h + dh / 2; x += Math.cos(hm) * (total / n); z += -Math.sin(hm) * (total / n); h += dh; s += total / n; push(k); }
    }
    ranges.push({...seg, s0, s1: s});
  }
  const last = pts[pts.length - 1];
  const sample = (q) => {
    if (q <= 0) { const p = pts[0]; return {x: p.x + p.tx * q, z: p.z + p.tz * q, tx: p.tx, tz: p.tz, k: 0, s: q}; }
    if (q >= last.s) { return {x: last.x + last.tx * (q - last.s), z: last.z + last.tz * (q - last.s), tx: last.tx, tz: last.tz, k: 0, s: q}; }
    let i = Math.min(pts.length - 2, Math.floor(q)); while (pts[i + 1].s < q) i++; while (i > 0 && pts[i].s > q) i--;
    const a = pts[i], b = pts[i + 1], u = (q - a.s) / Math.max(1e-6, b.s - a.s);
    let tx = a.tx + (b.tx - a.tx) * u, tz = a.tz + (b.tz - a.tz) * u; const n = Math.hypot(tx, tz) || 1; tx /= n; tz /= n;
    return {x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, tx, tz, k: a.k + (b.k - a.k) * u, s: q};
  };
  const api = {
    length: last.s, segments: ranges, points: pts, seed, curve,
    sample,
    /** World position of (s, d): d > 0 is the right-hand side of the direction of travel. */
    toWorld(q, d = 0, out = {}) { const p = sample(q); out.x = p.x - p.tz * d; out.z = p.z + p.tx * d; out.tx = p.tx; out.tz = p.tz; out.k = p.k; return out; },
    /** Heading for Three.js `rotation.y` of an object that faces +x at rest, so it faces the tangent at s. */
    yawAt(q) { const p = sample(q); return Math.atan2(-p.tz, p.tx); },
    /** Signed curvature at s (1/m): positive = turning left; a car at speed v feels v*v*k pushing it to the outside (right when positive). */
    curvatureAt(q) { return sample(q).k; },
    /** Which segment contains s. */
    segmentAt(q) { return ranges.find(r => q >= r.s0 && q < r.s1) || ranges[ranges.length - 1]; },
    /** Nearest (s, d) for a world point, searching around a guess (used by the view for props and by tests). */
    toTrack(wx, wz, guess = 0, window = 40) {
      let best = null;
      for (let q = Math.max(0, guess - window); q <= guess + window; q += 1) { const p = sample(q); const dx = wx - p.x, dz = wz - p.z, along = dx * p.tx + dz * p.tz, d = -dx * p.tz + dz * p.tx, err = Math.abs(along); if (!best || err < best.err) best = {s: q + along, d, err}; }
      return best;
    },
  };
  return api;
}
