import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCourse, validateCourse, LANES } from '../src/index.mjs';

const clone = options => JSON.parse(JSON.stringify(generateCourse({ seed: 'adversarial', difficulty: 3, segmentCount: 3, ...options })));
const codes = course => validateCourse(course).errors.map(e => e.code);

test('independent validator rejects complete geometric closure even when a route is supplied', () => {
  const c = clone({ segmentCount: 1 }), s = c.segments[0], template = s.obstacles[0];
  s.obstacles = LANES.map(lane => ({ ...template, id: `closed-${lane.index}`, lane: lane.index, xM: lane.xM, zStartM: 27, zEndM: 32 }));
  assert.ok(codes(c).includes('LANE_CLOSED'));
  assert.ok(codes(c).includes('PATH_COLLISION'));
});

test('one open lane at every station does not certify a reachable continuous path', () => {
  const c = clone({ segmentCount: 1 }), s = c.segments[0];
  // A narrow temporal gate collides only inside the linear switch, away from all polyline vertices.
  s.obstacles = [{ ...s.obstacles[0], id: 'mid-switch', lane: s.entryLane, xM: LANES[s.entryLane].xM,
    zStartM: 16, zEndM: 17, halfWidthM: 1.15 }];
  const found = codes(c);
  assert.equal(found.includes('LANE_CLOSED'), false);
  assert.ok(found.includes('PATH_COLLISION'));
});

test('reaction time and lane-switch duration are validated at max speed', () => {
  const c = clone(), s = c.segments[0];
  s.path.cueM = s.path.moveStartM - .1;
  assert.ok(codes(c).includes('REACTION'));
  const fast = clone(), f = fast.segments[0];
  f.path.moveEndM = f.path.moveStartM + 1;
  f.path.points[3].zM = f.path.moveEndM;
  assert.ok(codes(fast).includes('LATERAL_SPEED'));
  assert.ok(codes(fast).includes('LANE_SWITCH'));
});

test('seam obstacle spans, carry-in integrity, and route continuity are checked', () => {
  const missing = clone(); missing.segments[1].carryIn.pop();
  assert.ok(codes(missing).includes('SEAM'));
  const broken = clone(); broken.segments[1].entryLane = (broken.segments[0].exitLane + 1) % 3;
  assert.equal(validateCourse(broken).valid, false);
  const tail = clone(); tail.segments[0].path.points.at(-1).xM = 0;
  assert.equal(validateCourse(tail).valid, false);
  const incoming = clone({ startSegment: 9, segmentCount: 1 }), s = incoming.segments[0];
  s.carryIn[0].lane = s.entryLane; s.carryIn[0].xM = LANES[s.entryLane].xM;
  assert.ok(codes(incoming).includes('PATH_COLLISION'));
});

test('bonuses cannot overlap obstacles or advertise an uncertified detour', () => {
  const c = clone(), s = c.segments[0], o = s.obstacles[0], b = s.bonuses[0];
  b.lane = o.lane; b.xM = o.xM; b.zM = 28;
  assert.ok(codes(c).includes('BONUS_COLLISION'));
  assert.ok(codes(c).includes('BONUS_OFF_ROUTE'));
});

test('widths, physics tampering, nonfinite positions, missing schema and duplicate IDs fail safely', () => {
  const wide = clone(); wide.segments[0].obstacles[0].halfWidthM = 4;
  assert.ok(codes(wide).includes('OBSTACLE'));
  const physics = clone(); physics.physics.maxSpeedMps = .1;
  assert.ok(codes(physics).includes('PHYSICS'));
  const nan = clone(); nan.segments[0].path.points[1].zM = NaN;
  assert.ok(codes(nan).includes('ROUTE'));
  const duplicate = clone(); duplicate.segments[0].bonuses[0].id = duplicate.segments[0].obstacles[0].id;
  assert.ok(codes(duplicate).includes('DUPLICATE_ID'));
  const malformedObstacle = clone(); malformedObstacle.segments[0].obstacles[0] = null;
  assert.ok(codes(malformedObstacle).includes('OBSTACLE'));
  for (const bad of [null, undefined, [], {}, { apiVersion: 1, config: {} }, 'bad']) assert.equal(validateCourse(bad).valid, false);
});

test('malformed nested identifiers and sparse arrays do not throw or freeze caller-owned objects', () => {
  const badId = clone(), identifier = { invalid: true };
  badId.segments[0].obstacles[0].id = identifier;
  const report = validateCourse(badId);
  assert.equal(report.valid, false);
  assert.equal(Object.isFrozen(identifier), false);
  assert.doesNotThrow(() => JSON.stringify(report));
  const sparsePath = clone(); delete sparsePath.segments[0].path.points[0];
  assert.ok(codes(sparsePath).includes('ROUTE'));
  const sparseLanes = clone(); sparseLanes.lanes = new Array(3);
  assert.ok(codes(sparseLanes).includes('LANES'));
  const sparseCarry = clone(); sparseCarry.segments[1].carryIn = new Array(1);
  assert.ok(codes(sparseCarry).includes('OBSTACLE'));
});
