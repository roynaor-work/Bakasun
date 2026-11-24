// The bots use the same observable trail and actions as the player. They can
// run against the browser session or against the pure engine in Node.
const PROFILES = Object.freeze({
  easy: {interval: .25, horizon: .52, pickupHorizon: .41, missChance: .34, pickups: .8, tricks: false},
  medium: {interval: .12, horizon: .68, pickupHorizon: .52, missChance: .19, pickups: 1.5, tricks: true},
  hard: {interval: 1 / 30, horizon: 1.14, pickupHorizon: .78, missChance: 0, pickups: 3.5, tricks: true},
});

const PICKUP_VALUES = {coin: 1, shield: 4, magnet: 3, double: 3};
const HAZARD_KINDS = new Set(['block', 'jump', 'slide']);
const STANCE_WINDOWS = {jump: [.10, .84], slide: [.01, .91]};
const LANE_SECONDS = .36;
const LONGITUDINAL_MARGIN = 1;
const LATERAL_MARGIN = .55;
const ACTION_COST = .15;
const COLLISION_COST = 160;

export const RUNNER_BOT_DIFFICULTIES = Object.freeze(Object.keys(PROFILES));

function missesEvent(seed, id, chance) {
  if (!chance) return false;
  // One stable outcome per seed and event keeps missed cues consistent across frames.
  let hash = 2166136261;
  const key = `${seed}/${id}`;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000 < chance;
}

function hazardWindow(event, origin, destination) {
  const left = event.lane - LATERAL_MARGIN;
  const right = event.lane + LATERAL_MARGIN;
  const direction = Math.sign(destination - origin);
  if (!direction) return origin >= left && origin <= right ? [event.from, event.to] : null;
  if (Math.max(origin, destination) < left || Math.min(origin, destination) > right) return null;
  const entry = direction > 0 ? left : right;
  const exit = direction > 0 ? right : left;
  const timeAt = lane => (lane - origin) * direction * LANE_SECONDS;
  const from = Math.max(event.from, timeAt(entry));
  const to = destination >= left && destination <= right ? event.to : Math.min(event.to, timeAt(exit));
  return from <= to ? [from, to] : null;
}

function ratePlan({origin, destination, stance, stanceAge}, events, profile, action) {
  const stanceWindow = STANCE_WINDOWS[stance];
  let score = action ? -ACTION_COST : 0;
  for (const event of events) {
    if (!event.hazard) {
      const direction = Math.sign(destination - origin);
      const position = origin + direction * Math.min(Math.abs(destination - origin), event.from / LANE_SECONDS);
      if (Math.abs(event.lane - position) <= .32) {
        const urgency = 1 - event.from / profile.pickupHorizon;
        score += PICKUP_VALUES[event.kind] * profile.pickups * urgency ** 2;
      }
      continue;
    }
    const overlap = hazardWindow(event, origin, destination);
    if (!overlap) continue;
    if (stance === event.kind && stanceWindow &&
        overlap[0] + stanceAge >= stanceWindow[0] && overlap[1] + stanceAge <= stanceWindow[1]) continue;
    score -= COLLISION_COST * (1 - overlap[0] / profile.horizon) ** 3;
  }
  return score;
}

export function createRunnerBot(difficulty, {seed = 1} = {}) {
  if (!Object.hasOwn(PROFILES, difficulty)) throw new RangeError(`Unknown Alpine bot difficulty: ${difficulty}`);
  const profile = PROFILES[difficulty];
  let nextDecision = 0;
  let stanceStarted = -Infinity;
  let observedStance = 'stand';

  return snapshot => {
    const {status, distance, speed, elapsed, lane, lanePosition = lane, stance, nextEvents} = snapshot;
    if (stance !== observedStance) {
      observedStance = stance;
      stanceStarted = elapsed;
    }
    if (status !== 'running' || elapsed + 1e-9 < nextDecision || speed <= 0) return null;
    nextDecision = elapsed + profile.interval;

    const events = [];
    for (const event of nextEvents) {
      const hazard = HAZARD_KINDS.has(event.kind);
      if (!hazard && !Object.hasOwn(PICKUP_VALUES, event.kind)) continue;
      const from = ((event.startDistance ?? event.distance) - distance - (hazard ? LONGITUDINAL_MARGIN : 0)) / speed;
      const to = ((event.endDistance ?? event.distance) - distance + (hazard ? LONGITUDINAL_MARGIN : 0)) / speed;
      if (to < 0 || from > (hazard ? profile.horizon : profile.pickupHorizon)) continue;
      if (missesEvent(seed, event.id, profile.missChance)) continue;
      events.push({kind: event.kind, lane: event.lane, from: Math.max(0, from), to, hazard});
    }

    const current = {origin: lanePosition, destination: lane, stance, stanceAge: elapsed - stanceStarted};
    const choices = [[null, current]];
    if (Math.abs(lanePosition - lane) < .03) {
      if (lane > 0) choices.push(['left', {...current, destination: lane - 1}]);
      if (lane < 2) choices.push(['right', {...current, destination: lane + 1}]);
    }
    if (profile.tricks && stance === 'stand') {
      choices.push(['jump', {...current, stance: 'jump', stanceAge: 0}]);
      choices.push(['slide', {...current, stance: 'slide', stanceAge: 0}]);
    }

    let bestAction = null;
    let bestScore = -Infinity;
    for (const [action, plan] of choices) {
      const score = ratePlan(plan, events, profile, action);
      if (score > bestScore) {
        bestAction = action;
        bestScore = score;
      }
    }
    return bestAction;
  };
}
