import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { createTrack, racingAngle } from '../../../minigames/racing-tracks.mjs';
import { atLateral, inRange, runoffWidth, sampleLine, samplePit, trackIds, wrapDistance } from '../course.mjs';
import { firstIntersection, nearestNonlocal, positiveStrip } from './geometry.mjs';

const root = new URL('../', import.meta.url);
const definitions = trackIds.map((id) => JSON.parse(readFileSync(new URL(`tracks/${id}.json`, root), 'utf8')));
const planDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const headingChange = (track, from, to) => racingAngle(track.sample(to).heading - track.sample(from).heading);
const lapDistance = (a, b, length) => Math.abs(wrapDistance(a - b + length / 2, length) - length / 2);
const series = (from, to, maxStep, at) => {
  const count = Math.ceil((to - from) / maxStep);
  return Array.from({ length: count + 1 }, (_, i) => at(from + i / count * (to - from)));
};

test('six new engine definitions match the six requested settings', () => {
  assert.deepEqual(readdirSync(new URL('tracks/', root)).filter((name) => name.endsWith('.json')).sort(),
    trackIds.map((id) => `${id}.json`).sort());
  assert.deepEqual(definitions.map(({ id }) => id), trackIds);
  assert.deepEqual(definitions.map(({ theme }) => theme), ['city-night','desert','coast','mountain','forest','snow']);
  assert.equal(new Set(definitions.map(({ points }) => JSON.stringify(points))).size, 6);
});

test('intersection checks reject crossings, endpoint contact and folded road strips', () => {
  const p = (x, z) => ({ x, z });
  const square = [p(0, 0), p(4, 0), p(4, 4), p(0, 4)];
  assert.equal(firstIntersection(square), null);
  assert.deepEqual(firstIntersection([square[0], square[2], square[1], square[3]]), [0, 2]);
  assert.deepEqual(firstIntersection([p(0, 0), p(3, 0)], [p(2, 0), p(5, 0)], false), [0, 0]);
  assert.equal(positiveStrip([p(0, 0), p(2, 1)], [p(2, 0), p(0, 1)], false), 0);
});

for (const definition of definitions) {
  const track = createTrack(definition);

  test(`${track.id}: engine samples a closed 3D lap and a continuous start seam`, () => {
    assert.equal(track.id, definition.id);
    assert.equal(track.width, definition.width);
    assert.equal(track.samples, 4);
    assert.deepEqual(definition.points[0].filter((_, axis) => axis !== 1), [0, 0]);
    assert.ok(definition.points.every((rows) => rows.length === 3 && rows.every(Number.isFinite)));
    assert.equal(new Set(definition.points.map((point) => point.join(','))).size, definition.points.length);
    assert.equal(track.points.length, definition.points.length * definition.samples);
    const segments = track.points.map((p, i) => {
      const q = track.points[(i + 1) % track.points.length];
      assert.ok(Math.hypot(q.x - p.x, q.z - p.z) > 0.3);
      assert.ok(Math.abs(q.y - p.y) / planDistance(p, q) < 0.10);
      return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    });
    assert.ok(segments.at(-1) > 0.3 && segments.at(-1) < 3, 'seam segment');
    assert.ok(Math.abs(segments.reduce((total, d) => total + d, 0) - definition.lengthM) < 0.0006);
    assert.ok(Math.abs(track.length - definition.lengthM) < 0.0006);
    assert.ok(track.length > 1600 && track.length < 2200);
    for (const lap of [-2, -1, 1, 2]) {
      const start = track.sample(0), end = track.sample(lap * track.length);
      assert.ok(planDistance(start, end) < 1e-9 && Math.abs(start.y - end.y) < 1e-9);
      assert.ok(Math.abs(headingChange(track, -0.4, 0.4)) < 0.002);
      assert.ok(planDistance(track.sample(-0.4), track.sample(track.length - 0.4)) < 1e-9);
    }
    assert.ok(track.points.every((p, i) => i === 0 || p.s > track.points[i - 1].s));
  });

  test(`${track.id}: the road and driving line do not intersect themselves`, () => {
    const left = track.points.map(({ s }) => atLateral(track, s, -track.width / 2));
    const right = track.points.map(({ s }) => atLateral(track, s, track.width / 2));
    const driving = track.points.map(({ s }) => sampleLine(track, s));
    for (const [name, points] of [['axis', track.points], ['left edge', left], ['right edge', right], ['driving line', driving]]) {
      assert.equal(firstIntersection(points), null, name);
    }
    assert.equal(firstIntersection(left, right), null, 'opposite edges');
    assert.equal(positiveStrip(left, right), -1, 'folded asphalt');
    assert.ok(nearestNonlocal(track.points, track.length, track.width * 4) > track.width + 2, 'clearance between separate arms');
    for (const [i, p] of driving.entries()) {
      const projected = track.project(p.x, p.z);
      assert.ok(projected.distance <= track.width / 2 - 1.35, `car clearance at ${i}`);
      assert.ok(lapDistance(projected.s, track.points[i].s, track.length) < 4);
    }
  });

  test(`${track.id}: pit, corners, runoffs, DRS and bridge clearances`, () => {
    const { pitStraight, pitLane: pit, runoffs, drsZones, bridges, corners } = track;
    assert.ok(pitStraight.from < -85 && pitStraight.to > 100);
    assert.ok(pitStraight.from < pit.entryS && pit.entryS < pit.limitFrom && pit.limitFrom < 0);
    assert.ok(pit.limitTo > 0 && pit.limitTo < pit.exitS && pit.exitS < pitStraight.to);
    assert.ok(pit.speedLimitKph === 60 && pit.width > 5);
    assert.ok(track.mainStraight.length >= 300);
    assert.ok(series(pitStraight.from, pitStraight.to, 5, (s) => Math.abs(headingChange(track, s, s + 0.5))).every((turn) => turn < 0.003));
    const pin = Math.sign(pit.offset);
    const pitLeft = series(pit.entryS, pit.exitS, 1.8, (s) => samplePit(track, s, -pit.width / 2));
    const pitRight = series(pit.entryS, pit.exitS, 1.8, (s) => samplePit(track, s, pit.width / 2));
    assert.equal(firstIntersection(pitLeft, pitLeft, false), null);
    assert.equal(firstIntersection(pitRight, pitRight, false), null);
    assert.equal(firstIntersection(pitLeft, pitRight, false), null);
    assert.equal(positiveStrip(pitLeft, pitRight, false), -1);
    for (const p of series(pit.limitFrom, pit.limitTo, 1.5, (s) => samplePit(track, s, -pin * pit.width / 2))) {
      const projected = track.project(p.x, p.z);
      assert.ok(projected.distance >= track.width / 2 + 2.55);
      assert.ok(lapDistance(projected.s, p.s, track.length) < 2.3);
    }
    for (const edgeS of [pit.entryS, pit.exitS]) {
      const edge = samplePit(track, edgeS, pin * pit.width / 2);
      assert.ok(Math.abs(track.project(edge.x, edge.z).distance - track.width / 2) < 0.01);
    }

    for (const [index, corner] of corners.entries()) {
      assert.equal(corner.id, `T${index + 1}`);
      assert.ok(corner.from > (corners[index - 1]?.to ?? 0) && corner.from < corner.apex && corner.apex < corner.to && corner.to < track.length);
      const turn = headingChange(track, corner.from, corner.to);
      assert.equal(turn > 0 ? 'right' : 'left', corner.turn);
      assert.ok(Math.abs(Math.abs(turn) * 180 / Math.PI - corner.angleDeg) < 7.2, corner.id);
      assert.ok(corner.radiusM > track.width / 2 + 4);
      assert.ok(Math.abs(headingChange(track, corner.apex - 4, corner.apex + 4)) > 0.03);
    }

    assert.equal(runoffs.length, 3);
    assert.ok(drsZones.length >= 1 && drsZones.length <= 2);
    assert.ok(bridges.length > 0);
    const ranges = [pitStraight, ...runoffs, ...drsZones, ...bridges];
    for (const [i, range] of ranges.entries()) {
      assert.ok(range.from < range.to && range.to - range.from < track.length);
      for (const other of ranges.slice(i + 1)) {
        assert.ok(!inRange(range.from, other, track.length) && !inRange(other.from, range, track.length));
      }
    }
    for (const zone of runoffs) {
      const c = corners.find(({ id }) => id === zone.cornerId);
      assert.ok(zone.from >= c.from && zone.to <= c.to);
      assert.equal(zone.side, c.turn === 'left' ? 1 : -1);
      assert.equal(runoffWidth(zone, zone.from), 0);
      assert.equal(runoffWidth(zone, zone.to), 0);
      assert.ok(runoffWidth(zone, (zone.from + zone.to) / 2) > 4);
      for (const p of series(zone.from + 0.25, zone.to - 0.25, 1.5, (s) =>
        atLateral(track, s, zone.side * (track.width / 2 + runoffWidth(zone, s))))) {
        const projected = track.project(p.x, p.z);
        assert.ok(projected.distance >= track.width / 2 - 0.12);
        assert.ok(lapDistance(projected.s, p.s, track.length) < 3);
      }
    }
    for (const zone of drsZones) {
      assert.ok(zone.detectionS < zone.from && zone.from - zone.detectionS < 12);
      assert.ok(zone.to - zone.from > 47);
      assert.ok(Math.abs(headingChange(track, zone.detectionS, zone.to)) < 0.012);
      assert.ok(series(zone.from, zone.to, 5, (s) => Math.abs(headingChange(track, s, Math.min(s + 4, zone.to)))).every((turn) => turn < 0.005));
    }
    for (const bridge of bridges) {
      assert.ok(bridge.deckWidthM > track.width && bridge.deckThicknessM > 0);
      assert.ok(bridge.minClearanceM >= 4 && bridge.to - bridge.from >= 27);
      const deck = series(bridge.from, bridge.to, 0.5, (s) => track.sample(s));
      for (const p of deck) assert.ok(p.y - bridge.deckThicknessM - bridge.underpassY >= bridge.minClearanceM - 0.002);
    }
  });

  test(`${track.id}: eight roadside models stay out of the traffic and runoff surfaces`, () => {
    assert.equal(track.roadside.length, 8);
    assert.equal(new Set(track.roadside.map(({ id }) => id)).size, 8);
    assert.ok(track.roadside.some(({ id }) => id === track.landmark));
    assert.equal(track.roadside.filter(({ surface }) => surface === 'water').length, track.theme === 'coast' ? 2 : 0);
    const pit = track.pitLane, placed = [];
    const hazards = series(pit.entryS, pit.exitS, 1, (s) => ({ ...samplePit(track, s), radius: pit.width / 2 }));
    for (const zone of track.runoffs) {
      hazards.push(...series(zone.from, zone.to, 1, (s) => {
        const radius = runoffWidth(zone, s) / 2;
        return { ...atLateral(track, s, zone.side * (track.width / 2 + radius)), radius };
      }));
    }
    for (const item of track.roadside) {
      const { s, lateralM, yawDeg, footprintRadiusM: radius } = item;
      assert.ok(s > 0 && s < track.length && Math.abs(yawDeg) <= 180 && radius > 0);
      const p = atLateral(track, s, lateralM);
      const clearance = track.project(p.x, p.z).distance - radius;
      assert.ok(clearance >= track.width / 2 + 2.75, item.id);
      if (item.surface === 'water') {
        assert.equal(track.theme, 'coast');
        assert.ok(clearance >= 73.95);
      } else {
        assert.equal(item.surface, 'ground');
      }
      for (const other of [...hazards, ...placed]) {
        assert.ok(planDistance(p, other) >= radius + other.radius + 2.65, item.id);
      }
      placed.push({ ...p, radius });
    }
  });
}

function coreGlb(bytes, name) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', name);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const after = jsonLength + 20;
  assert.equal(bytes.toString('ascii', 16, 20), 'JSON');
  assert.equal(bytes.toString('hex', after + 4, after + 8), '42494e00');
  const model = JSON.parse(bytes.toString('utf8', 20, after));
  const binary = bytes.subarray(after + 8);
  assert.equal(bytes.readUInt32LE(after), binary.length);
  assert.equal(model.buffers[0].byteLength, binary.length);
  assert.ok(!model.extensionsUsed && !model.extensionsRequired && !model.images && !model.buffers[0].uri);
  let radius = 0, lowY = Infinity;
  for (const mesh of model.meshes) {
    for (const primitive of mesh.primitives) {
      const positions = model.accessors[primitive.attributes.POSITION];
      const normals = model.accessors[primitive.attributes.NORMAL];
      assert.equal(positions.count, normals.count);
      assert.ok(positions.count > 0 && positions.count % 3 === 0);
      const positionView = model.bufferViews[positions.bufferView], normalView = model.bufferViews[normals.bufferView];
      for (const accessor of [positions, normals]) {
        const view = model.bufferViews[accessor.bufferView];
        assert.equal(accessor.componentType, 5126);
        assert.equal(accessor.type, 'VEC3');
        assert.equal(view.byteLength, accessor.count * 12);
        assert.ok(view.byteOffset + view.byteLength <= binary.length);
      }
      for (let i = 0; i < positions.count; i++) {
        const p = positionView.byteOffset + i * 12, n = normalView.byteOffset + i * 12;
        const [x, y, z] = [0, 4, 8].map((offset) => binary.readFloatLE(p + offset));
        assert.ok([x, y, z].every(Number.isFinite), name);
        radius = Math.max(radius, Math.hypot(x, z));
        lowY = Math.min(lowY, y);
        assert.ok(Math.abs(Math.hypot(...[0, 4, 8].map((offset) => binary.readFloatLE(n + offset))) - 1) < 0.00001);
      }
    }
  }
  assert.ok(radius > 0 && Math.abs(lowY) < 0.20, name);
  return { radius, declared: model.extras.footprintRadiusM };
}

test('all 48 props are unique core GLBs with accurate metre-space footprints', () => {
  const used = new Set();
  for (const definition of definitions) {
    const files = readdirSync(new URL(`assets/props/${definition.id}/`, root)).sort();
    assert.deepEqual(files, definition.roadside.map(({ id }) => `${id}.glb`).sort());
    for (const item of definition.roadside) {
      assert.equal(item.asset, `assets/props/${definition.id}/${item.id}.glb`);
      assert.ok(!used.has(item.asset));
      used.add(item.asset);
      const { radius, declared } = coreGlb(readFileSync(new URL(item.asset, root)), item.asset);
      assert.equal(declared, item.footprintRadiusM);
      assert.ok(radius <= declared + 0.00001 && declared - radius <= 0.01001);
    }
  }
  assert.equal(used.size, 48);
});

test('six local equirectangular skies and three valid weather presets per circuit', () => {
  assert.deepEqual(readdirSync(new URL('assets/skies/', root)).sort(), trackIds.map((id) => `${id}.webp`).sort());
  for (const { id, sky, weather } of definitions) {
    assert.equal(sky.asset, `assets/skies/${id}.webp`);
    assert.equal(sky.projection, 'equirectangular');
    assert.equal(sky.width, 2 * sky.height);
    const bytes = readFileSync(new URL(sky.asset, root));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 16), 'WEBPVP8 ');
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
    assert.equal(bytes.readUInt16LE(26) & 0x3fff, sky.width);
    assert.equal(bytes.readUInt16LE(28) & 0x3fff, sky.height);
    assert.equal(weather.length, 3);
    assert.equal(new Set(weather.map(({ id: presetId }) => presetId)).size, 3);
    assert.equal(weather[0].id, 'clear');
    assert.equal(weather[0].effect, 'none');
    assert.equal(weather[0].density, 0);
    assert.equal(weather[0].wetness, 0);
    assert.equal(weather[0].drsEnabled, true);
    for (const preset of weather) {
      assert.ok(preset.label.length > 2);
      assert.ok(['none', 'rain', 'fog', 'heat', 'dust', 'snow'].includes(preset.effect));
      assert.ok(preset.visibilityM >= 80 && preset.visibilityM <= weather[0].visibilityM);
      assert.ok(preset.grip > 0 && preset.grip <= 1 && preset.windMps >= 0);
      assert.ok([preset.density, preset.wetness, preset.cloudCover].every((v) => v >= 0 && v <= 1));
      assert.match(preset.tint, /^#[0-9a-f]{6}$/);
      if (preset.wetness > 0) assert.equal(preset.drsEnabled, false);
    }
  }
});

test('package fits the 8 MB budget and uses local resources', () => {
  function size(dir) {
    let total = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      assert.ok(!entry.isSymbolicLink());
      assert.doesNotMatch(entry.name, /\.(?:wasm|ktx2|drc)$/i);
      total += entry.isDirectory() ? size(path) : statSync(path).size;
    }
    return total;
  }
  assert.ok(size(root) <= 8_000_000);
  const html = readFileSync(new URL('preview.html', root), 'utf8');
  assert.doesNotMatch(html, /https?:\/\/|unsafe-eval|wasm-unsafe-eval/i);
  assert.match(html, /connect-src 'self'/);
  const runtime = ['preview.mjs', 'scene.mjs', 'map.mjs', 'course.mjs', 'weather.mjs']
    .map((file) => readFileSync(new URL(file, root), 'utf8')).join('\n');
  assert.doesNotMatch(runtime, /https?:\/\/|\bWebAssembly\b|\b(?:DRACOLoader|MeshoptDecoder|KTX2Loader)\b/);
});
