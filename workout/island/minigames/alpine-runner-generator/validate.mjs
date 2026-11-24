import { API_VERSION, SEGMENT_LENGTH_M, MAX_SEGMENTS, MAX_BATCH_SEGMENTS, LANES, DIFFICULTIES,
  THEMES, PATTERNS, configuration, freeze } from './profiles.mjs?v=island-v2-20261107-23';

const EPS = 1e-6;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const int = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
const object = n => n !== null && typeof n === 'object' && !Array.isArray(n);
const close = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= EPS;
const sameObstacle = (a, b) => ['id', 'kind', 'role', 'lane', 'xM', 'zStartM', 'zEndM', 'halfWidthM'].every(k => a[k] === b[k]);

function xAt(points, z) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (z >= a.zM - EPS && z <= b.zM + EPS) {
      return a.xM + (b.xM - a.xM) * (z - a.zM) / (b.zM - a.zM);
    }
  }
  return null;
}

// Exact intersection of a linearly moving, axis-aligned skier with an expanded obstacle rectangle.
function pathHits(points, obstacle, longitudinal, lateral) {
  const lo = obstacle.zStartM - longitudinal, hi = obstacle.zEndM + longitudinal;
  const left = obstacle.xM - obstacle.halfWidthM - lateral, right = obstacle.xM + obstacle.halfWidthM + lateral;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const z0 = Math.max(a.zM, lo), z1 = Math.min(b.zM, hi);
    if (z0 > z1 + EPS) continue;
    const x0 = a.xM + (b.xM - a.xM) * (z0 - a.zM) / (b.zM - a.zM);
    const x1 = a.xM + (b.xM - a.xM) * (z1 - a.zM) / (b.zM - a.zM);
    if (Math.max(x0, x1) >= left - EPS && Math.min(x0, x1) <= right + EPS) return true;
  }
  return false;
}

/** Independent geometry/kinematics audit. Does not regenerate or compare against a seed oracle. */
export function validateCourse(course) {
  const errors = [], add = (code, message, segmentIndex = null, id = null) => errors.push({ code, message,
    segmentIndex: Number.isSafeInteger(segmentIndex) ? segmentIndex : null, id: typeof id === 'string' ? id : null });
  const stats = { segments: 0, obstacles: 0, bonuses: 0, laneChanges: 0, minimumReactionHeadroomSeconds: null,
    maximumLateralSpeedMps: 0 };
  const report = () => freeze({ apiVersion: API_VERSION, valid: errors.length === 0, errors, stats });
  if (!object(course)) { add('SCHEMA', 'course must be an object'); return report(); }
  if (course.apiVersion !== API_VERSION) add('VERSION', 'apiVersion must be 1');
  let config;
  try { config = configuration(course.config, ['seed', 'difficulty', 'theme']); }
  catch (error) { add('CONFIG', error.message); return report(); }
  const p = DIFFICULTIES[config.difficulty], r = course.range;
  if (!object(r) || !int(r.startSegment, 0, MAX_SEGMENTS - 1) || !int(r.segmentCount, 0, MAX_BATCH_SEGMENTS) ||
      r.startSegment + r.segmentCount > MAX_SEGMENTS || r.startM !== r.startSegment * SEGMENT_LENGTH_M ||
      r.endM !== (r.startSegment + r.segmentCount) * SEGMENT_LENGTH_M) {
    add('RANGE', 'range must describe consecutive 30 m segments within the API limits'); return report();
  }
  if (course.segmentLengthM !== SEGMENT_LENGTH_M) add('SEGMENT_LENGTH', 'segmentLengthM must be 30');
  if (!Array.isArray(course.lanes) || course.lanes.length !== 3 || !Array.from(course.lanes).every((lane, i) =>
    object(lane) && lane.index === i && lane.xM === LANES[i].xM && lane.widthM === 3)) add('LANES', 'exactly three 3 m lanes are required');
  if (!object(course.physics) || Object.keys(course.physics).length !== Object.keys(p).length ||
      !Object.keys(p).every(k => course.physics[k] === p[k])) add('PHYSICS', 'physics must equal the selected v1 difficulty profile');
  if (!Array.isArray(course.segments) || course.segments.length !== r.segmentCount) {
    add('SEGMENTS', 'segments length must match segmentCount'); return report();
  }
  const longitudinal = p.playerHalfLengthM + p.longitudinalClearanceM;
  const lateral = p.playerHalfWidthM + p.lateralClearanceM;
  const obstacles = [], ids = new Set(), usable = [], allBonuses = [];
  function obstacle(o, owner, carry = false) {
    const index = owner.index, start = owner.startM;
    const boundsStart = carry ? start - 30 : start;
    const boundsEnd = carry ? start + 2 : owner.endM + 2;
    if (!object(o) || typeof o.id !== 'string' || !o.id || !THEMES[config.theme].obstacleKinds.includes(o.kind) ||
        !['row', 'side'].includes(o.role) || !int(o.lane, 0, 2) || o.xM !== LANES[o.lane]?.xM ||
        !finite(o.zStartM) || !finite(o.zEndM) || o.zStartM < boundsStart || o.zEndM > boundsEnd ||
        o.zEndM <= o.zStartM || !finite(o.halfWidthM) || o.halfWidthM < .2 || o.halfWidthM > p.maxObstacleHalfWidthM ||
        o.halfWidthM >= 1.5 || (carry && o.zEndM <= start)) {
      add('OBSTACLE', 'obstacle has invalid kind, lane, width or longitudinal span', index, o?.id ?? null); return false;
    }
    return true;
  }
  for (let offset = 0; offset < course.segments.length; offset++) {
    const s = course.segments[offset], index = r.startSegment + offset, start = index * 30, end = start + 30;
    if (!object(s) || s.apiVersion !== 1 || s.index !== index || s.startM !== start || s.endM !== end ||
        s.theme !== config.theme || s.difficulty !== config.difficulty || !int(s.entryLane, 0, 2) || !int(s.exitLane, 0, 2) ||
        Math.abs(s.entryLane - s.exitLane) > 1 || !PATTERNS.includes(s.pattern) || !Array.isArray(s.obstacles) ||
        !Array.isArray(s.carryIn) || !Array.isArray(s.bonuses) || s.obstacles.length < 1 || s.obstacles.length > 3 ||
        s.carryIn.length > 2 || s.bonuses.length < 1 || s.bonuses.length > 3) {
      add('SEGMENT', 'segment structure or lane transition is invalid', index); continue;
    }
    stats.segments++;
    if (s.entryLane !== s.exitLane) stats.laneChanges++;
    for (const o of s.obstacles) if (obstacle(o, s)) {
      if (ids.has(o.id)) add('DUPLICATE_ID', 'obstacle id is repeated', index, o.id);
      else { ids.add(o.id); obstacles.push(o); }
    }
    const carry = [];
    for (const o of s.carryIn) if (obstacle(o, s, true)) carry.push(o);
    if (index === 0 && carry.length) add('SEAM', 'the first course segment cannot have carry-in obstacles', index);
    if (offset === 0) for (const o of carry) {
      if (ids.has(o.id)) add('DUPLICATE_ID', 'carry-in obstacle id is repeated', index, o.id);
      else { ids.add(o.id); obstacles.push(o); }
    }
    if (offset > 0) {
      const previous = course.segments[offset - 1];
      if (object(previous) && Array.isArray(previous.obstacles)) {
        const expected = previous.obstacles.filter(o => object(o) && finite(o.zEndM) && o.zEndM > start);
        if (expected.length !== carry.length || !expected.every((o, i) => sameObstacle(o, carry[i]))) add('SEAM', 'carryIn must contain the complete previous row in its original order', index);
        if (previous.exitLane !== s.entryLane) add('SEAM', 'entry lane must continue the preceding exit lane', index);
      }
    }
    const path = s.path;
    if (!object(path) || !Array.isArray(path.points) || path.points.length < 2 || path.points.length > 12 ||
        !Array.from(path.points).every(point => object(point) && finite(point.zM) && finite(point.xM) && point.xM >= -3 && point.xM <= 3) ||
        !path.points.every((point, i) => i === 0 || point.zM > path.points[i - 1].zM) ||
        !close(path.points[0].zM, start) || !close(path.points.at(-1).zM, end + 3) ||
        !close(path.points[0].xM, LANES[s.entryLane].xM) || !close(path.points.at(-1).xM, LANES[s.exitLane].xM) ||
        !finite(path.cueM) || !finite(path.moveStartM) || !finite(path.moveEndM) ||
        path.cueM < start + 3 - EPS || path.moveStartM < path.cueM || path.moveEndM < path.moveStartM || path.moveEndM > end ||
        !close(xAt(path.points, end), LANES[s.exitLane].xM)) {
      add('ROUTE', 'path must be a finite forward polyline spanning the segment and its 3 m seam tail', index); continue;
    }
    let firstMove = null, lastMove = null;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i];
      const speed = Math.abs(b.xM - a.xM) / (b.zM - a.zM) * p.maxSpeedMps;
      stats.maximumLateralSpeedMps = Math.max(stats.maximumLateralSpeedMps, speed);
      if (speed > p.maxLateralSpeedMps + EPS) add('LATERAL_SPEED', 'path changes lanes faster than the permitted lateral speed', index);
      if (!close(a.xM, b.xM)) { if (firstMove === null) firstMove = a.zM; lastMove = b.zM; }
    }
    const reaction = (path.moveStartM - path.cueM) / p.maxSpeedMps;
    const headroom = reaction - p.reactionSeconds;
    stats.minimumReactionHeadroomSeconds = stats.minimumReactionHeadroomSeconds === null ? headroom : Math.min(stats.minimumReactionHeadroomSeconds, headroom);
    if (headroom < -EPS || (firstMove !== null && (firstMove < path.moveStartM - EPS || lastMove > path.moveEndM + EPS)) ||
        carry.some(o => o.zEndM + longitudinal > path.cueM + EPS)) add('REACTION', 'lane movement begins before the full reaction interval or before the incoming row clears', index);
    if (firstMove !== null && (lastMove - firstMove) / p.maxSpeedMps < p.laneSwitchSeconds - EPS) add('LANE_SWITCH', 'lane change is shorter than laneSwitchSeconds', index);
    if (path.points.some(point => point.zM >= end - EPS && !close(point.xM, LANES[s.exitLane].xM))) add('SEAM', 'path must hold its exit lane over the seam tail', index);
    usable.push(s);
    for (const b of s.bonuses) {
      if (!object(b) || typeof b.id !== 'string' || !b.id || !['star', 'energy', 'shield'].includes(b.kind) ||
          !int(b.lane, 0, 2) || b.xM !== LANES[b.lane]?.xM || !finite(b.zM) || !finite(b.radiusM) || b.radiusM < .1 || b.radiusM > .3 ||
          b.zM - b.radiusM < start || b.zM + b.radiusM > end || !int(b.value, 1, 3)) {
        add('BONUS', 'bonus has invalid kind, lane, position, radius or value', index, b?.id ?? null); continue;
      }
      if (ids.has(b.id)) add('DUPLICATE_ID', 'bonus id is repeated', index, b.id); else ids.add(b.id);
      if (!close(xAt(path.points, b.zM), b.xM)) add('BONUS_OFF_ROUTE', 'bonus is not on the certified continuous route', index, b.id);
      allBonuses.push({ bonus: b, index });
    }
  }
  stats.obstacles = obstacles.length; stats.bonuses = allBonuses.length;
  // Check actual geometry, including incoming rows and end-of-range obstacle tails.
  const stations = [...new Set(obstacles.flatMap(o => [o.zStartM - longitudinal, o.zEndM + longitudinal]))].sort((a, b) => a - b);
  const checks = stations.flatMap((z, i) => i === 0 ? [z] : [(stations[i - 1] + z) / 2, z]);
  let closedReported = false;
  for (const z of checks) {
    const active = obstacles.filter(o => z >= o.zStartM - longitudinal - EPS && z <= o.zEndM + longitudinal + EPS);
    if (LANES.every(lane => active.some(o => Math.abs(lane.xM - o.xM) <= o.halfWidthM + lateral + EPS))) {
      add('LANE_CLOSED', `all three lane centres are blocked at ${z} m, including skier clearance`); closedReported = true;
    }
    if (closedReported) break;
  }
  for (const s of usable) {
    const near = obstacles.filter(o => o.zStartM - longitudinal <= s.endM + 3 && o.zEndM + longitudinal >= s.startM);
    for (const o of near) if (pathHits(s.path.points, o, longitudinal, lateral)) add('PATH_COLLISION', 'certified continuous route intersects an expanded obstacle', s.index, o.id);
  }
  for (const { bonus: b, index } of allBonuses) {
    if (obstacles.some(o => b.zM + b.radiusM >= o.zStartM - EPS && b.zM - b.radiusM <= o.zEndM + EPS &&
        Math.abs(b.xM - o.xM) <= o.halfWidthM + b.radiusM + EPS)) add('BONUS_COLLISION', 'bonus intersects an obstacle', index, b.id);
  }
  for (let i = 2; i < course.segments.length; i++) {
    const a = course.segments[i - 2], b = course.segments[i - 1], c = course.segments[i];
    if (!object(a) || !object(b) || !object(c)) continue;
    if (a.exitLane === b.exitLane && b.exitLane === c.exitLane) add('REPEAT', 'safe lane repeats more than twice', c.index);
    if (a.pattern === b.pattern && b.pattern === c.pattern) add('REPEAT', 'pattern repeats more than twice', c.index);
  }
  return report();
}
