import { API_VERSION, SEGMENT_LENGTH_M, EPOCH_SEGMENTS, MAX_SEGMENTS, MAX_BATCH_SEGMENTS,
  LANES, DIFFICULTIES, THEMES, PATTERNS, configuration, integer, freeze, round } from './profiles.mjs?v=island-v2-20261107-24';

// FNV-1a over UTF-16 units, followed by Mulberry32. No ambient state or random source.
function randomFor(config, epoch, domain) {
  const text = JSON.stringify([API_VERSION, typeof config.seed, config.seed, config.difficulty, config.theme, epoch, domain]);
  let state = 2166136261;
  for (let i = 0; i < text.length; i++) state = Math.imul(state ^ text.charCodeAt(i), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function weighted(random, candidates, weights) {
  let pick = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    pick -= weights[i];
    if (pick < 0) return candidates[i];
  }
  return candidates.at(-1);
}

function epochPlan(config, epoch) {
  const p = DIFFICULTIES[config.difficulty], theme = THEMES[config.theme];
  const routeRandom = randomFor(config, epoch, 'route'), patternRandom = randomFor(config, epoch, 'patterns');
  const exits = [], patterns = [];
  let lane = 1, repeat = 0, previousPattern = -1;
  for (let i = 0; i < EPOCH_SEGMENTS; i++) {
    let candidates = [0, 1, 2].filter(n => Math.abs(n - lane) <= 1 && (n !== lane || repeat < 2));
    if (i === 0) candidates = [0, 2]; // Break the previous epoch's centre-lane run.
    if (i === EPOCH_SEGMENTS - 2) candidates = candidates.filter(n => n !== 1 || lane !== 1);
    if (i === EPOCH_SEGMENTS - 1) candidates = [1]; // Random-access seam anchor.
    const turn = Math.min(.97, p.turnChance * theme.turnScale);
    const next = weighted(routeRandom, candidates, candidates.map(n => n === lane ? 1 - turn : turn));
    repeat = next === lane ? repeat + 1 : 1;
    exits.push(next); lane = next;
    const choices = [0, 1, 2, 3].filter(n => n !== previousPattern);
    previousPattern = weighted(patternRandom, choices, choices.map(n => theme.patternWeights[n]));
    patterns.push(PATTERNS[previousPattern]);
  }
  return { exits, patterns };
}

function builder(config) {
  const epochs = new Map(), p = DIFFICULTIES[config.difficulty], theme = THEMES[config.theme];
  const plan = i => {
    const epoch = Math.floor(i / EPOCH_SEGMENTS);
    if (!epochs.has(epoch)) epochs.set(epoch, epochPlan(config, epoch));
    return epochs.get(epoch);
  };
  function raw(index) {
    const offset = index % EPOCH_SEGMENTS, data = plan(index), exitLane = data.exits[offset];
    const entryLane = offset === 0 ? 1 : data.exits[offset - 1];
    const startM = index * SEGMENT_LENGTH_M, endM = startM + SEGMENT_LENGTH_M, pattern = data.patterns[offset];
    const random = randomFor(config, index, 'objects'), obstacles = [];
    const closed = [0, 1, 2].filter(lane => lane !== exitLane);
    if (random() < .5) closed.reverse();
    const blockedCount = random() < p.pairChance ? 2 : 1;
    const makeObstacle = (lane, localStart, localEnd, role) => {
      const halfWidthM = round(p.maxObstacleHalfWidthM - random() * .1);
      obstacles.push({ id: `s${index}-o${obstacles.length}`, kind: theme.obstacleKinds[Math.floor(random() * theme.obstacleKinds.length)],
        role, lane, xM: LANES[lane].xM, zStartM: round(startM + localStart), zEndM: round(startM + localEnd), halfWidthM });
    };
    const tail = pattern === 'long' ? 32 : round(31 + random());
    for (let j = 0; j < blockedCount; j++) makeObstacle(closed[j], p.hazardStartM, tail, 'row');
    const unused = [0, 1, 2].filter(lane => lane !== entryLane && lane !== exitLane);
    const sideChance = Math.min(1, p.sideChance * theme.sideScale);
    if (pattern === 'stagger' || (pattern !== 'reward' && random() < sideChance)) {
      makeObstacle(unused[Math.floor(random() * unused.length)], 8 + random() * 2, 16 + random() * 2, 'side');
    }
    const noticeM = startM + 3;
    const moveStartM = round(noticeM + p.maxSpeedMps * p.reactionSeconds);
    const moveEndM = round(moveStartM + p.maxSpeedMps * p.laneSwitchSeconds);
    const x0 = LANES[entryLane].xM, x1 = LANES[exitLane].xM;
    const path = {
      cueM: noticeM, moveStartM, moveEndM,
      points: [ { zM: startM, xM: x0 }, { zM: noticeM, xM: x0 }, { zM: moveStartM, xM: x0 },
        { zM: moveEndM, xM: x1 }, { zM: endM, xM: x1 }, { zM: endM + 3, xM: x1 } ],
    };
    const count = pattern === 'reward' ? 3 : pattern === 'stagger' ? 2 : 1;
    const bonuses = Array.from({ length: count }, (_, j) => ({
      id: `s${index}-b${j}`, kind: j === count - 1 && pattern === 'reward' ? theme.bonusKind : 'star',
      lane: exitLane, xM: x1, zM: round(startM + [28, 29, 29.8][j]), radiusM: .18,
      value: j === count - 1 && pattern === 'reward' ? 3 : 1,
    }));
    return { apiVersion: API_VERSION, index, startM, endM, theme: config.theme, difficulty: config.difficulty,
      entryLane, exitLane, pattern, obstacles, bonuses, path };
  }
  return index => {
    const segment = raw(index);
    const carryIn = index === 0 ? [] : raw(index - 1).obstacles.filter(o => o.zEndM > segment.startM);
    return { ...segment, carryIn };
  };
}

/** A self-contained segment, including the previous row's seam-crossing obstacles. */
export function generateSegment(options) {
  const config = configuration(options, ['seed', 'difficulty', 'theme', 'index']);
  const index = integer(options.index, 'index', 0, MAX_SEGMENTS - 1);
  return freeze(builder(config)(index));
}

/** Stateless random-access range. Concatenated ranges have byte-identical segment data. */
export function generateCourse(options) {
  const config = configuration(options, ['seed', 'difficulty', 'theme', 'startSegment', 'segmentCount']);
  const startSegment = integer(options.startSegment === undefined ? 0 : options.startSegment, 'startSegment', 0, MAX_SEGMENTS - 1);
  const segmentCount = integer(options.segmentCount === undefined ? 12 : options.segmentCount, 'segmentCount', 0, MAX_BATCH_SEGMENTS);
  if (startSegment + segmentCount > MAX_SEGMENTS) throw new RangeError(`range must end at or before segment ${MAX_SEGMENTS}`);
  const build = builder(config);
  return freeze({ apiVersion: API_VERSION, config, segmentLengthM: SEGMENT_LENGTH_M,
    lanes: LANES, physics: DIFFICULTIES[config.difficulty],
    range: { startSegment, segmentCount, startM: startSegment * SEGMENT_LENGTH_M, endM: (startSegment + segmentCount) * SEGMENT_LENGTH_M },
    segments: Array.from({ length: segmentCount }, (_, i) => build(startSegment + i)) });
}
