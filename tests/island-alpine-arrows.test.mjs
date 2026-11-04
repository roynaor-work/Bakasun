import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {padChevrons, barEnds, decalCorners} from '../workout/island/minigames/alpine-arrows.mjs';

const meta = JSON.parse(await readFile(new URL('../workout/island/design/alpine-v5/decals/route-and-snow.json', import.meta.url), 'utf8'));

test('Alpine floor arrows: every boost-pad chevron has its tip on the downhill side (local -z)', () => {
  const bars = padChevrons(); assert.equal(bars.length, 6);
  for (const b of bars) {
    const {inner, outer} = barEnds(b);
    assert.ok(outer[1] > inner[1], `bar at x=${b.x}: the outer end (${outer[1].toFixed(2)}) must be uphill (+z) of the inner end (${inner[1].toFixed(2)}), so the arms open uphill and the tip points downhill`);
    assert.ok(Math.abs(outer[0]) > Math.abs(inner[0]), 'the outer end is farther from the centre line');
  }
  // The two bars of a row are mirror images and meet on the centre line: a symmetric ">" shape.
  for (let i = 0; i < bars.length; i += 2) { const a = barEnds(bars[i]), c = barEnds(bars[i + 1]); assert.ok(Math.abs(a.inner[1] - c.inner[1]) < 1e-9 && Math.abs(a.outer[1] - c.outer[1]) < 1e-9); }
});

test('Alpine floor arrows: the decal atlas image top (downhill) lands on the larger course distance s, for every frame', () => {
  for (const f of meta.frames) {
    const corners = decalCorners({s: 100, x: 0, size: 3, uv: f.uv}), top = corners.filter(c => c.fv === 1), bottom = corners.filter(c => c.fv === 0);
    assert.ok(top.every(c => c.s > 100) && bottom.every(c => c.s < 100), `${f.id}: image top is downhill (+s)`);
    assert.ok(top.every(c => c.v === f.uv[3]) && bottom.every(c => c.v === f.uv[1]), `${f.id}: top row of the image is v1 (texture flipY)`);
    const right = corners.filter(c => c.x > 0), left = corners.filter(c => c.x < 0);
    assert.ok(right.every(c => c.u === f.uv[2]) && left.every(c => c.u === f.uv[0]), `${f.id}: image right is the rider's right`);
  }
  assert.ok(meta.frames.some(f => f.id === 'downhill-arrow') && meta.frames.some(f => f.id === 'turn-right') && meta.frames.some(f => f.id === 'turn-left'));
});
