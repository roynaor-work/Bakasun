import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrack, TRACKS} from '../workout/island/minigames/racing-tracks.mjs';

// racing-look-v1: the island surface (grass cylinder top -0.5, shore top -1.0) must stay under every road,
// otherwise grass covers the asphalt (Roy's screenshot, coast s~1390, road y -1.05).
const INLAND_TOP = -0.5, MARGIN = 0.4;
const vergeHeight = (w, y, d) => Math.max(-1.2, y - .07 - Math.max(0, d - w / 2 - 2.1) * .18);

for (const track of TRACKS) {
  test(`${track.id}: road stays above the island surface`, () => {
    const t = createTrack(track.id), low = Math.min(...t.points.map(p => p.y));
    assert.ok(low >= INLAND_TOP + MARGIN, `lowest road point ${low.toFixed(2)} m`);
  });
  test(`${track.id}: terrain mesh (64x64 grid) never rises over the road`, () => {
    const t = createTrack(track.id);
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const p of t.points) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
    const W = maxx - minx + 100, H = maxz - minz + 100, x0 = (minx + maxx) / 2 - W / 2, z0 = (minz + maxz) / 2 - H / 2, dx = W / 64, dz = H / 64, cache = new Map();
    const V = (i, j) => { const k = i * 100 + j; if (!cache.has(k)) { const p = t.project(x0 + i * dx, z0 + j * dz); cache.set(k, vergeHeight(t.width, p.y, p.distance) - .08); } return cache.get(k); };
    let worst = -1;
    for (let s = 0; s < t.length; s += 4) for (const lat of [-.9, 0, .9]) {
      const p = t.sample(s), x = p.x + p.normal.x * lat * t.width / 2, z = p.z + p.normal.z * lat * t.width / 2;
      const fx = (x - x0) / dx, fz = (z - z0) / dz, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1);
      const h = Math.max(u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v), u >= v ? a + (b - a) * u + (d - b) * v : a + (c - a) * v + (d - c) * u);
      worst = Math.max(worst, h - (p.y + .02));
    }
    assert.ok(worst < 0, `terrain above road by ${worst.toFixed(3)} m`);
  });
}
