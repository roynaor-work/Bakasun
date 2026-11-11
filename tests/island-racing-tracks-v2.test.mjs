import test from 'node:test';
import assert from 'node:assert/strict';

// ?racingTracks=v2: Codex circuits (design/racing-tracks-v2) calibrated by the app. The flag is read at import time, so the module is loaded with a faked location.
globalThis.location = { search: '?racingTracks=v2' };
const {createTrack, TRACKS, RACING_TRACK_SET} = await import('../workout/island/minigames/racing-tracks.mjs?v2');
delete globalThis.location;

test('v2 set is active and has the six stages', () => {
  assert.equal(RACING_TRACK_SET, 'v2');
  assert.deepEqual(TRACKS.map(t => t.id), ['coast', 'jungle', 'volcano', 'harbor', 'summit', 'ruins']);
});
for (const track of TRACKS) {
  test(`v2 ${track.id}: closed, 1.9-2.7 km, road above the island surface, no leg closer than 2.2 road widths`, () => {
    const t = createTrack(track.id), low = Math.min(...t.points.map(p => p.y));
    assert.ok(t.length > 1900 && t.length < 2700, `length ${t.length}`);   // racing-deep-m2: scale 0.87 (jungle 2.0 km)
    assert.ok(low >= -0.1, `lowest road point ${low}`);
    const a = t.sample(0), b = t.sample(t.length - 1); assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 3, 'closed loop');
    let min = 1e9;
    for (let s = 0; s < t.length; s += 8) { const p = t.sample(s); for (let u = s + 4 * t.width; u < t.length + s - 4 * t.width; u += 8) { const q = t.sample(u % t.length); min = Math.min(min, Math.hypot(p.x - q.x, p.z - q.z)); } }
    assert.ok(min > 2.2 * t.width, `closest far-apart legs ${min.toFixed(1)} m`);
  });
}
