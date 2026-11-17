import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCourse, generateSegment, validateCourse, THEMES, DIFFICULTIES, LANES } from '../src/index.mjs';

const SEEDS = 128, SEGMENTS = 32;
for (const difficulty of [1, 2, 3]) for (const theme of Object.keys(THEMES)) {
  test(`128 seeds × 32 segments: difficulty ${difficulty}, ${theme}`, t => {
    let obstacleCount = 0, bonusCount = 0, turns = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      const course = generateCourse({ seed, difficulty, theme, segmentCount: SEGMENTS });
      const audit = validateCourse(course);
      assert.equal(audit.valid, true, JSON.stringify({ seed, difficulty, theme, errors: audit.errors }));
      assert.equal(audit.stats.segments, SEGMENTS);
      assert.ok(audit.stats.maximumLateralSpeedMps <= DIFFICULTIES[difficulty].maxLateralSpeedMps + 1e-6);
      obstacleCount += audit.stats.obstacles; bonusCount += audit.stats.bonuses; turns += audit.stats.laneChanges;
      for (let i = 0; i < course.segments.length; i++) {
        const s = course.segments[i];
        assert.equal(s.endM - s.startM, 30);
        assert.ok(s.obstacles.length >= 1 && s.obstacles.length <= 3);
        assert.ok(s.bonuses.length >= 1 && s.bonuses.length <= 3);
        assert.ok(Math.abs(s.exitLane - s.entryLane) <= 1);
        assert.ok(s.obstacles.some(o => o.zEndM > s.endM), 'exercise seam-crossing obstacles');
        for (const o of s.obstacles) assert.ok(Math.abs(o.xM - LANES[o.lane].xM) + o.halfWidthM < 1.5);
        for (const b of s.bonuses) assert.equal(b.lane, s.exitLane);
        if (i > 0) {
          assert.deepEqual(s.carryIn, course.segments[i - 1].obstacles.filter(o => o.zEndM > s.startM));
          assert.equal(s.entryLane, course.segments[i - 1].exitLane);
        }
        if (i > 1) {
          const a = course.segments[i - 2], b = course.segments[i - 1];
          assert.ok(s.exitLane !== b.exitLane || b.exitLane !== a.exitLane);
          assert.ok(s.pattern !== b.pattern || b.pattern !== a.pattern);
        }
      }
    }
    assert.ok(turns > SEEDS * SEGMENTS / 3, 'corridor must actually change lanes');
    t.diagnostic(`${SEEDS * SEGMENTS} segments, ${obstacleCount} obstacles, ${bonusCount} bonuses, ${turns} lane changes`);
  });
}

function xAt(points, z) {
  const i = points.findIndex((p, i) => i > 0 && p.zM >= z);
  const a = points[i - 1], b = points[i];
  return a.xM + (b.xM - a.xM) * (z - a.zM) / (b.zM - a.zM);
}

test('independent time-step skier simulation at the actual 31 m/s boost ceiling', () => {
  // Separate numeric simulation tests the returned witness; no validator or generator internals.
  for (const difficulty of [1, 2, 3]) for (const theme of Object.keys(THEMES)) for (let seed = 0; seed < 8; seed++) {
    const c = generateCourse({ seed, theme, difficulty, startSegment: 5, segmentCount: 12 });
    const p = c.physics, obstacles = [...c.segments[0].carryIn, ...c.segments.flatMap(s => s.obstacles)];
    for (const s of c.segments) {
      let previousX = s.path.points[0].xM, previousZ = s.startM;
      const nearby = obstacles.filter(o => o.zEndM + 1 >= s.startM && o.zStartM - 1 <= s.endM + 3);
      for (let step = 1; step <= 330; step++) {
        const z = s.startM + step / 10, x = xAt(s.path.points, z);
        assert.ok(Math.abs(x - previousX) / ((z - previousZ) / 31) <= p.maxLateralSpeedMps + 1e-5);
        if (z < s.path.cueM + p.reactionSeconds * 31 - 1e-6) assert.equal(x, LANES[s.entryLane].xM);
        for (const o of nearby) {
          const zHit = z >= o.zStartM - p.playerHalfLengthM - p.longitudinalClearanceM && z <= o.zEndM + p.playerHalfLengthM + p.longitudinalClearanceM;
          const xHit = Math.abs(x - o.xM) <= o.halfWidthM + p.playerHalfWidthM + p.lateralClearanceM;
          assert.ok(!(zHit && xHit), `physical collision at seed=${seed}, ${theme}, d=${difficulty}, z=${z}`);
        }
        previousX = x; previousZ = z;
      }
    }
  }
});

test('large random-access indexes, epoch seams, and 1024-segment batch remain fair', () => {
  for (const index of [7, 8, 15, 16, 127, 1023, 999_999]) {
    const course = generateCourse({ seed: 'seam-check', difficulty: 3, theme: 'peak', startSegment: index, segmentCount: 1 });
    assert.equal(validateCourse(course).valid, true);
    assert.deepEqual(course.segments[0], generateSegment({ seed: 'seam-check', difficulty: 3, theme: 'peak', index }));
    assert.ok(course.segments[0].carryIn.length > 0);
  }
  const long = generateCourse({ seed: 'long-run', difficulty: 3, theme: 'lava', segmentCount: 1024 });
  assert.equal(validateCourse(long).valid, true);
});

test('difficulty is bounded and changes density; themes affect gameplay grammar', () => {
  const density = [1, 2, 3].map(difficulty => {
    const c = generateCourse({ seed: 'density', difficulty, segmentCount: 512 });
    assert.equal(c.physics.maxSpeedMps, 31);
    return c.segments.flatMap(s => s.obstacles).length;
  });
  assert.ok(density[0] < density[1] && density[1] < density[2]);
  assert.ok(DIFFICULTIES[1].nominalSpeedMps < DIFFICULTIES[3].nominalSpeedMps);
  assert.ok(DIFFICULTIES[1].reactionSeconds > DIFFICULTIES[3].reactionSeconds);
  const grammar = Object.keys(THEMES).map(theme => JSON.stringify(generateCourse({ seed: 'theme', theme }).segments.map(s => [s.exitLane, s.pattern, s.obstacles.length])));
  assert.equal(new Set(grammar).size, 6);
});
