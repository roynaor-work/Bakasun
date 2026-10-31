import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join, relative} from 'node:path';
import test from 'node:test';

// Standalone design-data checks. This file never imports or starts a game.
const directory = fileURLToPath(new URL('.', import.meta.url));
const requiredFiles = ['basketball.json', 'soccer.json'];
const soccerPhases = ['build_up', 'attack', 'defensive_transition', 'defense',
  'throw_in', 'corner', 'goal_kick', 'free_kick'];
const basketballRoles = ['PG', 'SG', 'SF', 'PF', 'C'];
const epsilon = 1e-9;

function jsonFiles(path) {
  return readdirSync(path, {withFileTypes: true}).flatMap(entry => {
    const full = join(path, entry.name);
    return entry.isDirectory() ? jsonFiles(full) : entry.isFile() && entry.name.endsWith('.json') ? [full] : [];
  }).sort();
}

function parse(text, path) {
  try { return JSON.parse(text); }
  catch (error) { throw new SyntaxError(`${path}: ${error.message}`); }
}

function finite(value, path) {
  assert.ok(typeof value === 'number' && Number.isFinite(value), `${path}: expected a finite number`);
}

function text(value, path) {
  assert.ok(typeof value === 'string' && value.trim().length > 0, `${path}: expected nonempty text`);
}

function range(value, example, path, bounds) {
  assert.ok(Array.isArray(value) && value.length === 2, `${path}: expected [minimum, maximum]`);
  value.forEach((n, i) => finite(n, `${path}[${i}]`));
  assert.ok(value[0] <= value[1], `${path}: reversed range`);
  finite(example, `${path}.example`);
  assert.ok(example >= value[0] - epsilon && example <= value[1] + epsilon,
    `${path}: example ${example} falls outside ${JSON.stringify(value)}`);
  if (bounds) assert.ok(value[0] >= bounds[0] && value[1] <= bounds[1], `${path}: range exceeds allowed bounds`);
}

function point(value, path) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${path}: expected a point`);
  assert.ok(value.recommendedRange && typeof value.recommendedRange === 'object', `${path}: missing coordinate ranges`);
  assert.ok(value.example && typeof value.example === 'object', `${path}: missing coordinate example`);
  text(value.cpuCost, `${path}.cpuCost`);
  for (const axis of ['x', 'y']) {
    finite(value[axis], `${path}.${axis}`);
    assert.ok(value[axis] >= 0 && value[axis] <= 1, `${path}.${axis}: coordinate outside [0, 1]`);
    range(value.recommendedRange[axis], value[axis], `${path}.recommendedRange.${axis}`, [0, 1]);
    range(value.recommendedRange[axis], value.example[axis], `${path}.example.${axis}`, [0, 1]);
  }
}

// The traversal also reaches illustrative coordinates outside formation snapshots.
// A point's plain example is checked by point(), rather than treated as another point.
function metadata(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach((item, i) => metadata(item, `${path}[${i}]`));
  const hasCoordinateAxis = ['x', 'y'].some(axis => Object.hasOwn(value, axis) && !Array.isArray(value[axis]));
  if (hasCoordinateAxis) {
    point(value, path);
    for (const [key, item] of Object.entries(value)) {
      if (!['x', 'y', 'recommendedRange', 'example', 'cpuCost'].includes(key)) metadata(item, `${path}.${key}`);
    }
    return;
  }
  const isMetric = Object.hasOwn(value, 'unit');
  if (isMetric || Object.hasOwn(value, 'recommendedRange')) {
    assert.ok(Object.hasOwn(value, 'recommendedRange'), `${path}: missing recommendedRange`);
    assert.ok(Object.hasOwn(value, 'example'), `${path}: missing example`);
    text(value.cpuCost, `${path}.cpuCost`);
    if (isMetric || Array.isArray(value.recommendedRange) && value.recommendedRange.every(n => typeof n === 'number')) {
      text(value.unit, `${path}.unit`);
      const bounds = value.unit.startsWith('probability') ? [0, 1] : undefined;
      range(value.recommendedRange, value.example, `${path}.recommendedRange`, bounds);
      if (['players', 'candidates', 'passes'].includes(value.unit)) {
        assert.ok([...value.recommendedRange, value.example].every(Number.isInteger), `${path}: counts must be integers`);
      }
    }
  }
  for (const [key, item] of Object.entries(value)) metadata(item, `${path}.${key}`);
}

function sameMembers(actual, expected, path) {
  assert.ok(Array.isArray(actual), `${path}: expected a list`);
  assert.equal(new Set(actual).size, actual.length, `${path}: duplicate entries`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${path}: incomplete or unexpected entries`);
}

function field(data) {
  assert.equal(data.schemaVersion, 1, 'unsupported schemaVersion');
  for (const key of ['widthM', 'lengthM']) {
    finite(data.field?.[key], `field.${key}`);
    assert.ok(data.field[key] > 0, `field.${key}: must be positive`);
  }
  finite(data.minSeparationM, 'minSeparationM');
  assert.ok(data.minSeparationM > 0, 'minSeparationM: must be positive');
}

function distance(a, b, data) {
  return Math.hypot((a.x - b.x) * data.field.widthM, (a.y - b.y) * data.field.lengthM);
}

function separated(positions, roles, data, path) {
  sameMembers(Object.keys(positions), roles, `${path}.positions`);
  for (const role of roles) point(positions[role], `${path}.positions.${role}`);
  for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) {
    const d = distance(positions[roles[i]], positions[roles[j]], data);
    assert.ok(d + epsilon >= data.minSeparationM,
      `${path}: overlap ${roles[i]}/${roles[j]} (${d.toFixed(4)}m < ${data.minSeparationM}m)`);
    const exampleDistance = distance(positions[roles[i]].example, positions[roles[j]].example, data);
    assert.ok(exampleDistance + epsilon >= data.minSeparationM,
      `${path}: example overlap ${roles[i]}/${roles[j]} (${exampleDistance.toFixed(4)}m)`);
  }
}

function soccer(data) {
  field(data);
  assert.equal(data.sport, 'soccer');
  metadata(data);
  sameMembers(data.formations.map(item => item.id), ['4-4-2', '4-3-3', '3-5-2'], 'formations');
  for (const formation of data.formations) {
    assert.equal(formation.roles.length, 11, `${formation.id}: expected eleven roles`);
    assert.ok(formation.roles.includes('GK'), `${formation.id}: missing goalkeeper`);
    sameMembers(formation.phases.map(item => item.id), soccerPhases, `${formation.id}.phases`);
    for (const phase of formation.phases) {
      separated(phase.positions, formation.roles, data, `${formation.id}.${phase.id}`);
      point(phase.ball, `${formation.id}.${phase.id}.ball`);
      if (soccerPhases.indexOf(phase.id) >= 4) {
        assert.ok(formation.roles.includes(phase.takerRole), `${formation.id}.${phase.id}: invalid restart taker`);
      }
      if (phase.id === 'goal_kick') {
        // The ball may be placed anywhere in the 5.5m goal area, not at a
        // convenient goalkeeper anchor outside it. Validate its tuning envelope too.
        const halfWidth = (7.32 + 2 * 5.5) / (2 * data.field.widthM);
        const xBounds = [0.5 - halfWidth, 0.5 + halfWidth];
        const yBounds = [0, 5.5 / data.field.lengthM];
        for (const [axis, bounds] of [['x', xBounds], ['y', yBounds]]) {
          range(phase.ball.recommendedRange[axis], phase.ball[axis], `${formation.id}.goal_kick.ball.${axis}`, bounds);
          range(phase.ball.recommendedRange[axis], phase.ball.example[axis], `${formation.id}.goal_kick.ball.example.${axis}`, bounds);
        }
      }
      const optionMetric = {throw_in: 'nearOptionM', free_kick: 'shortOptionM', goal_kick: 'shortOutletM'}[phase.id];
      if (optionMetric) {
        const policy = data.restartPolicies.find(item => item.id === phase.id);
        const [minimum, maximum] = policy.parameters[optionMetric].recommendedRange;
        const count = formation.roles.filter(role => {
          const d = distance(phase.positions[role], phase.ball, data);
          return role !== phase.takerRole && d >= minimum - epsilon && d <= maximum + epsilon;
        }).length;
        const required = phase.id === 'goal_kick' ? policy.parameters.minimumShortOptions.example : 1;
        assert.ok(count >= required, `${formation.id}.${phase.id}: expected ${required} short options in range, found ${count}`);
      }
    }
  }
  sameMembers(data.ballMovementProfiles.map(profile => profile.phase), soccerPhases.slice(0, 4), 'ballMovementProfiles');
  for (const profile of data.ballMovementProfiles) for (const formation of data.formations) {
    const assignedRoles = profile.groups.flatMap(group => group.roles).filter(role => formation.roles.includes(role));
    sameMembers(assignedRoles, formation.roles, `${profile.phase}.${formation.id}.movementGroups`);
  }
}

// Relative motion is linear between successive keyframes. Minimise its squared
// distance analytically on t in [0,1], catching collisions between sample times.
function movingSeparation(from, to, roles, data, path) {
  for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) {
    const a = roles[i], b = roles[j];
    const start = [(from[a].x - from[b].x) * data.field.widthM,
      (from[a].y - from[b].y) * data.field.lengthM];
    const end = [(to[a].x - to[b].x) * data.field.widthM,
      (to[a].y - to[b].y) * data.field.lengthM];
    const delta = end.map((n, k) => n - start[k]);
    const speed2 = delta[0] ** 2 + delta[1] ** 2;
    const t = speed2 ? Math.max(0, Math.min(1, -(start[0] * delta[0] + start[1] * delta[1]) / speed2)) : 0;
    const d = Math.hypot(start[0] + t * delta[0], start[1] + t * delta[1]);
    assert.ok(d + epsilon >= data.minSeparationM,
      `${path}: moving overlap ${a}/${b} at t=${t.toFixed(4)} (${d.toFixed(4)}m)`);
  }
}

function basketball(data) {
  field(data);
  assert.equal(data.sport, 'basketball');
  metadata(data);
  sameMembers(data.offense.map(item => item.id), ['pick_and_roll', 'spacing', 'isolation'], 'offense');
  for (const play of data.offense) {
    sameMembers(play.roles, basketballRoles, `${play.id}.roles`);
    assert.ok(play.keyframes.length >= 2, `${play.id}: missing timed motion`);
    assert.equal(play.keyframes[0].atMs, 0, `${play.id}: timing must start at zero`);
    let previous = null;
    const ids = [];
    for (const frame of play.keyframes) {
      text(frame.id, `${play.id}.keyframe.id`);
      ids.push(frame.id);
      finite(frame.atMs, `${play.id}.${frame.id}.atMs`);
      assert.equal(frame.atMs, frame.timing.example, `${play.id}.${frame.id}: atMs and timing example disagree`);
      range(frame.timing.recommendedRange, frame.atMs, `${play.id}.${frame.id}.timing`);
      assert.ok(play.roles.includes(frame.ballOwner), `${play.id}.${frame.id}: invalid ballOwner`);
      separated(frame.positions, play.roles, data, `${play.id}.${frame.id}`);
      point(frame.ball, `${play.id}.${frame.id}.ball`);
      if (previous) {
        assert.ok(frame.atMs > previous.atMs, `${play.id}: keyframe times must increase`);
        movingSeparation(previous.positions, frame.positions, play.roles, data, `${play.id}.${previous.id}->${frame.id}`);
        const seconds = (frame.atMs - previous.atMs) / 1000;
        for (const role of play.roles) {
          const speed = distance(previous.positions[role], frame.positions[role], data) / seconds;
          assert.ok(speed <= data.parameters.maxTargetSpeedMps.example + epsilon,
            `${play.id}.${previous.id}->${frame.id}.${role}: speed ${speed.toFixed(4)}m/s exceeds maxTargetSpeedMps`);
        }
      }
      previous = frame;
    }
    assert.equal(new Set(ids).size, ids.length, `${play.id}: duplicate keyframe IDs`);
    if (play.id === 'pick_and_roll') {
      assert.deepEqual(ids, ['setup', 'screen_set', 'screen_ready', 'clear_screen', 'turn_corner', 'roll_start', 'roll_receive'],
        'pick_and_roll: missing screen timing stages');
      const byId = Object.fromEntries(play.keyframes.map(frame => [frame.id, frame]));
      const screenRule = data.rules.offBall.find(rule => rule.id === 'screen_then_roll').parameters;
      assert.ok(byId.screen_ready.atMs - byId.screen_set.atMs >= screenRule.stationaryBeforeContactMs.example,
        'pick_and_roll: screen must become stationary before contact');
      assert.ok(byId.roll_start.atMs - byId.turn_corner.atMs >= screenRule.rollDelayAfterTurnMs.example,
        'pick_and_roll: roll starts before the turn delay');
      for (const id of ['screen_ready', 'clear_screen', 'turn_corner', 'roll_start']) {
        assert.ok(distance(byId.screen_set.positions.C, byId[id].positions.C, data) <= epsilon,
          `pick_and_roll.${id}: screener must remain stationary until roll_start`);
      }
    }
  }
  sameMembers(data.defense.map(item => item.id), ['man_to_man', 'zone_2_3'], 'defense');
  for (const defense of data.defense) {
    sameMembers(defense.roles, basketballRoles, `${defense.id}.roles`);
    separated(defense.positions, defense.roles, data, defense.id);
    point(defense.ball, `${defense.id}.ball`);
  }
}

function firstMetric(value, match = () => true) {
  if (!value || typeof value !== 'object') return null;
  if (Object.hasOwn(value, 'unit') && Array.isArray(value.recommendedRange) && match(value)) return value;
  for (const item of Object.values(value)) {
    const result = firstMetric(item, match);
    if (result) return result;
  }
  return null;
}

const files = jsonFiles(directory);
const packs = new Map(files.map(path => [relative(directory, path), parse(readFileSync(path, 'utf8'), relative(directory, path))]));

test('required JSON files exist and every JSON file parses', () => {
  for (const name of requiredFiles) assert.ok(packs.has(name), `${name}: missing data file`);
  for (const [name, data] of packs) {
    assert.ok(data && typeof data === 'object' && !Array.isArray(data), `${name}: expected an object`);
    metadata(data, name);
  }
});

test('soccer: complete formations, in-field anchors and nonoverlapping players', () => soccer(packs.get('soccer.json')));
test('basketball: timed plays, complete defenses and nonoverlapping motion', () => basketball(packs.get('basketball.json')));

test('validator rejects malformed JSON', () => {
  assert.throws(() => parse('{"schemaVersion":1,}', 'broken.json'), /broken.json:/);
});

test('validator rejects out-of-field coordinates', () => {
  const data = structuredClone(packs.get('soccer.json'));
  data.formations[0].phases[0].positions.GK.x = 1.01;
  assert.throws(() => soccer(data), /outside \[0, 1\]/);
});

test('validator rejects duplicate anchors', () => {
  const data = structuredClone(packs.get('soccer.json'));
  const formation = data.formations[0], positions = formation.phases[0].positions;
  positions[formation.roles.find(role => role !== 'GK')] = structuredClone(positions.GK);
  assert.throws(() => soccer(data), /overlap/);
});

test('validator rejects missing roles', () => {
  const data = structuredClone(packs.get('soccer.json'));
  delete data.formations[0].phases[0].positions.GK;
  assert.throws(() => soccer(data), /incomplete or unexpected/);
});

test('validator rejects reversed metric ranges and missing CPU notes', () => {
  const data = structuredClone(packs.get('basketball.json'));
  const metric = firstMetric(data);
  assert.ok(metric, 'expected at least one tunable metric');
  metric.recommendedRange = [2, 1];
  assert.throws(() => basketball(data), /reversed range/);
  metric.recommendedRange = [metric.example, metric.example];
  delete metric.cpuCost;
  assert.throws(() => basketball(data), /cpuCost/);
});

test('validator rejects missing or nonnumeric metric ranges', () => {
  const data = structuredClone(packs.get('basketball.json'));
  const metric = firstMetric(data);
  delete metric.recommendedRange;
  assert.throws(() => basketball(data), /missing recommendedRange/);
  metric.recommendedRange = 'fast';
  assert.throws(() => basketball(data), /expected \[minimum, maximum\]/);
});

test('validator rejects invalid probability and count ranges', () => {
  const data = structuredClone(packs.get('basketball.json'));
  const probability = firstMetric(data, metric => metric.unit.startsWith('probability'));
  assert.ok(probability, 'expected a probability metric');
  probability.recommendedRange = [-0.1, 1.1];
  assert.throws(() => basketball(data), /exceeds allowed bounds/);
  probability.recommendedRange = [0, 1];
  probability.example = Infinity;
  assert.throws(() => basketball(data), /finite number/);
  const counts = structuredClone(packs.get('soccer.json'));
  const count = firstMetric(counts, metric => ['players', 'candidates', 'passes'].includes(metric.unit));
  assert.ok(count, 'expected an integer count metric');
  count.recommendedRange = [0, 2.5];
  count.example = 1;
  assert.throws(() => soccer(counts), /counts must be integers/);
});

test('validator rejects invalid basketball ball owners', () => {
  const data = structuredClone(packs.get('basketball.json'));
  data.offense[0].keyframes[0].ballOwner = 'missing-role';
  assert.throws(() => basketball(data), /invalid ballOwner/);
});

test('validator rejects goal-kick balls or tuning ranges outside the goal area', () => {
  for (const axis of ['x', 'y']) {
    const data = structuredClone(packs.get('soccer.json'));
    const ball = data.formations[0].phases.find(phase => phase.id === 'goal_kick').ball;
    ball[axis] = axis === 'x' ? 0.8 : 0.08;
    ball.example[axis] = ball[axis];
    ball.recommendedRange[axis] = [ball[axis], ball[axis]];
    assert.throws(() => soccer(data), /goal_kick.*exceeds allowed bounds/);
  }
  const data = structuredClone(packs.get('soccer.json'));
  const ball = data.formations[0].phases.find(phase => phase.id === 'goal_kick').ball;
  ball.recommendedRange.y[1] = 0.08;
  assert.throws(() => soccer(data), /goal_kick.*exceeds allowed bounds/);
});

test('validator rejects nonnumeric coordinates and unordered timing', () => {
  const data = structuredClone(packs.get('basketball.json'));
  data.offense[0].keyframes[0].positions.PG.x = NaN;
  assert.throws(() => basketball(data), /finite number/);
  const reference = structuredClone(packs.get('soccer.json'));
  reference.ballMovementProfiles[0].referenceBall.x = '0.5';
  reference.ballMovementProfiles[0].referenceBall.y = '0.2';
  assert.throws(() => soccer(reference), /finite number/);
  const timing = structuredClone(packs.get('basketball.json'));
  timing.offense[0].keyframes[1].atMs = 0;
  timing.offense[0].keyframes[1].timing.example = 0;
  timing.offense[0].keyframes[1].timing.recommendedRange = [0, 0];
  assert.throws(() => basketball(timing), /times must increase/);
});

test('validator detects crossing paths between otherwise separated endpoints', () => {
  const data = {field: {widthM: 15, lengthM: 28}, minSeparationM: 0.65};
  const from = {A: {x: 0.2, y: 0.5}, B: {x: 0.8, y: 0.5}};
  const to = {A: {x: 0.8, y: 0.5}, B: {x: 0.2, y: 0.5}};
  assert.throws(() => movingSeparation(from, to, ['A', 'B'], data, 'crossing'), /moving overlap/);
});
