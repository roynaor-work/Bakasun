/** Ski league v23 ghost: the child's best run of a stage, replayed as a see-through rider in the next run of that stage, and the time
 * gap to it on the HUD ("-0.8" = ahead of the record). Recorded from the engine snapshots every STEP seconds of race time (distance,
 * side and height), delta-encoded integers, kept in its own local key (never the island save). Visual only: no physics, no collisions.
 * Pure helpers (no DOM, no three.js). */
export const GHOST_KEY = 'island.alpine.ghosts.v1';
export const GHOST_VERSION = 1, STEP = .25, MAX_SAMPLES = 1100;
const plain = v => v && typeof v === 'object' && !Array.isArray(v);

export function createGhostRecorder() {
  const s = [], x = [], h = []; let next = 0, done = false;
  return {
    /** Feed every frame's snapshot; samples are taken on the STEP grid of race time (the countdown is not recorded). */
    record(snap) {
      if (done || snap.phase !== 'racing' && snap.phase !== 'finished' || !snap.player) return;
      const t = snap.timeMs / 1000;
      while (t >= next && s.length < MAX_SAMPLES) { s.push(snap.player.s); x.push(snap.player.x); h.push(Math.max(0, snap.player.height || 0)); next += STEP; }
      if (snap.phase === 'finished') done = true;
    },
    /** The finished run as a stored ghost (null when nothing was recorded). */
    encode(ms) {
      if (s.length < 2 || !(ms > 0)) return null;
      const d = []; let ps = 0, px = 0;
      for (let i = 0; i < s.length; i++) { const qs = Math.round(s[i] * 10), qx = Math.round(x[i] * 100), qh = Math.round(h[i] * 100); d.push(qs - ps, qx - px, qh); ps = qs; px = qx; }
      return {v: GHOST_VERSION, step: STEP, ms: Math.round(ms), d};
    },
    get samples() { return s.length; }
  };
}
export function validGhost(g) {
  return plain(g) && g.v === GHOST_VERSION && g.step === STEP && Number.isSafeInteger(g.ms) && g.ms > 0 && g.ms < 1e7 && Array.isArray(g.d) && g.d.length >= 6 && g.d.length % 3 === 0 && g.d.length <= MAX_SAMPLES * 3 && g.d.every(Number.isSafeInteger);
}
/** Stored ghost -> arrays for playback. */
export function decodeGhost(g) {
  if (!validGhost(g)) return null;
  const n = g.d.length / 3, s = new Float32Array(n), x = new Float32Array(n), h = new Float32Array(n); let qs = 0, qx = 0;
  for (let i = 0; i < n; i++) { qs += g.d[i * 3]; qx += g.d[i * 3 + 1]; s[i] = qs / 10; x[i] = qx / 100; h[i] = g.d[i * 3 + 2] / 100; }
  return {ms: g.ms, step: g.step, s, x, h, count: n};
}
/** Ghost pose at race time t (ms): interpolated distance, side and height, its sideways lean, and whether it has finished. */
export function ghostAt(ghost, tMs, out = {}) {
  const f = Math.max(0, tMs / 1000 / ghost.step), i = Math.min(ghost.count - 2, Math.floor(f)), k = Math.min(1, f - i);
  out.s = ghost.s[i] + (ghost.s[i + 1] - ghost.s[i]) * k; out.x = ghost.x[i] + (ghost.x[i + 1] - ghost.x[i]) * k; out.height = ghost.h[i] + (ghost.h[i + 1] - ghost.h[i]) * k;
  out.lean = Math.max(-1, Math.min(1, (ghost.x[i + 1] - ghost.x[i]) / ghost.step / 8.5)); out.airborne = out.height > .2; out.finished = tMs >= ghost.ms; return out;
}
/** Race time (ms) at which the ghost passed distance s, for the gap on the HUD; null past its last sample. */
export function ghostTimeAt(ghost, s) {
  const {s: d, count, step} = ghost; if (s <= d[0]) return 0; if (s > d[count - 1]) return null;
  let lo = 0, hi = count - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (d[mid] <= s) lo = mid; else hi = mid; }
  const k = d[hi] > d[lo] ? (s - d[lo]) / (d[hi] - d[lo]) : 0; return (lo + k) * step * 1000;
}
function readAll(storage) {
  let raw = null; try { raw = storage?.getItem(GHOST_KEY) ?? null; } catch { return null; }
  if (raw === null) return {version: GHOST_VERSION, stages: {}};
  try { const parsed = JSON.parse(raw); if (plain(parsed) && parsed.version === GHOST_VERSION && plain(parsed.stages)) return parsed; } catch {}
  return {version: GHOST_VERSION, stages: {}};
}
/** The stored ghost of league stage n, decoded, or null (none, damaged, no storage). */
export function loadGhost(storage, n) { const all = readAll(storage); return all ? decodeGhost(all.stages[String(n)]) : null; }
/** Keeps the faster run only. Returns {saved, best: ms}. A full storage drops the oldest other stages first, never the island save. */
export function saveGhost(storage, n, ghost) {
  if (!validGhost(ghost)) return {saved: false};
  const all = readAll(storage); if (!all) return {saved: false};
  const old = all.stages[String(n)]; if (validGhost(old) && old.ms <= ghost.ms) return {saved: false, best: old.ms};
  all.stages[String(n)] = ghost;
  for (let tries = 0; tries < 40; tries++) {
    try { storage.setItem(GHOST_KEY, JSON.stringify(all)); return {saved: true, best: ghost.ms}; }
    catch { const other = Object.keys(all.stages).find(k => k !== String(n)); if (!other) return {saved: false}; delete all.stages[other]; }
  }
  return {saved: false};
}
