import { EPOCH_SEGMENTS, generateCourse, MAX_SEGMENTS, SEGMENT_LENGTH_M } from './alpine-runner-generator/index.mjs?v=island-v2-20261107-23';
import { alpineRunnerScore } from './alpine-runner-rules.mjs?v=island-v2-20261107-23';

const STEP = 1 / 120;
const LEAD_IN = 32;
const LOOKAHEAD = 160;
const LANE_WIDTH = 3;
const JUMP_SECONDS = .96;
const SLIDE_SECONDS = .94;
const POWER_SECONDS = {magnet: 7, double: 8};
const ACTIONS = new Set(['left', 'right', 'jump', 'slide']);
const POWERUPS = ['shield', 'magnet', 'double'];
const CONFIRMED_HAZARD = ['block', 'jump', 'slide'];

const toward = (value, target, delta) => value + Math.sign(target - value) * Math.min(Math.abs(target - value), delta);
const laneX = lane => (lane - 1) * LANE_WIDTH;
const jumpHeightAt = remaining => remaining > 0 && remaining < JUMP_SECONDS
  ? 1.5 * Math.sin(Math.PI * remaining / JUMP_SECONDS) : 0;

export function createAlpineRunner({seed = 'alpine-runner', difficulty = 1, theme = 'pine'} = {}) {
  const options = {seed, difficulty, theme};
  const {physics} = generateCourse({...options, segmentCount: 0});
  let seedForEra = seed, currentEra = 0;
  let generated = 0, distance = 0, elapsed = 0, remainder = 0;
  let lane = 1, lanePosition = 1, jump = 0, slide = 0, coins = 0;
  let speed = physics.nominalSpeedMps - 3;
  let status = 'running';
  const powerups = {shield: false, magnet: 0, double: 0};
  const pending = [];
  const notifications = [];
  let courseEvents = [], segments = [];

  function extendCourse() {
    while (LEAD_IN + generated * SEGMENT_LENGTH_M < distance + LOOKAHEAD) {
      const era = Math.floor(generated / MAX_SEGMENTS);
      const startSegment = generated % MAX_SEGMENTS;
      if (era !== currentEra) {
        currentEra = era;
        // An epoch seam ends and begins in the centre lane, including between generator ranges.
        seedForEra = ['continuation', era, seed].join(':').slice(0, 128);
      }
      const offset = LEAD_IN + era * MAX_SEGMENTS * SEGMENT_LENGTH_M;
      const batch = generateCourse({...options, seed: seedForEra, startSegment, segmentCount: EPOCH_SEGMENTS});
      for (const segment of batch.segments) {
        const index = generated++;
        const startM = segment.startM + offset;
        segments.push({index, startM, endM: segment.endM + offset,
          entryLane: segment.entryLane, exitLane: segment.exitLane,
          moveStartM: segment.path.moveStartM + offset, moveEndM: segment.path.moveEndM + offset});
        for (const obstacle of segment.obstacles) {
          const kind = CONFIRMED_HAZARD[(index + Number(obstacle.id.split('o').at(-1))) % CONFIRMED_HAZARD.length];
          const startDistance = obstacle.zStartM + offset, endDistance = obstacle.zEndM + offset;
          courseEvents.push({id: `${era}:${obstacle.id}`, kind, lane: obstacle.lane, assetKind: obstacle.kind,
            distance: (startDistance + endDistance) / 2, startDistance, endDistance, halfWidth: obstacle.halfWidthM});
        }
        // Marks on the entry lane give the rider a visible approach to each generated row.
        for (const localDistance of [4, 9]) {
          if (startM + localDistance >= segment.path.moveStartM + offset) break;
          courseEvents.push({id: `${index}:c${localDistance}`, kind: 'coin', lane: segment.entryLane,
            distance: startM + localDistance, radius: .26, value: 1});
        }
        for (const [ordinal, bonus] of segment.bonuses.entries()) {
          const boost = index % 6 === 3 && ordinal === segment.bonuses.length - 1;
          const kind = boost ? POWERUPS[Math.floor(index / 6) % POWERUPS.length] : 'coin';
          courseEvents.push({id: `${era}:${bonus.id}`, kind, lane: bonus.lane, distance: bonus.zM + offset,
            radius: bonus.radiusM, value: bonus.value});
        }
      }
      courseEvents.sort((a, b) => a.distance - b.distance);
    }
  }

  function command(action) {
    if (!ACTIONS.has(action) || status !== 'running' || pending.length >= 4) return false;
    pending.push(action);
    return true;
  }

  function touches(x0, nextX, event, start, end, halfWidth, nextDistance) {
    if (nextDistance < start || distance > end) return false;
    const travel = nextDistance - distance;
    const enter = Math.max(0, (start - distance) / travel);
    const leave = Math.min(1, (end - distance) / travel);
    const xEnter = x0 + (nextX - x0) * enter, xLeave = x0 + (nextX - x0) * leave;
    const x = laneX(event.lane);
    return Math.min(xEnter, xLeave) <= x + halfWidth && Math.max(xEnter, xLeave) >= x - halfWidth;
  }

  function advance() {
    const wasJumping = jump;
    jump = Math.max(0, jump - STEP);
    slide = Math.max(0, slide - STEP);
    powerups.magnet = Math.max(0, powerups.magnet - STEP);
    powerups.double = Math.max(0, powerups.double - STEP);
    for (const action of pending.splice(0)) {
      if (action === 'left' || action === 'right') {
        lane = Math.min(2, Math.max(0, lane + (action === 'left' ? -1 : 1)));
      } else if (action === 'jump' && jump === 0 && slide === 0) {
        jump = JUMP_SECONDS;
      } else if (action === 'slide' && slide === 0) {
        jump = 0;
        slide = SLIDE_SECONDS;
      }
    }

    const previousX = laneX(lanePosition);
    lanePosition = toward(lanePosition, lane, STEP / physics.laneSwitchSeconds);
    const nextX = laneX(lanePosition);
    elapsed += STEP;
    speed = Math.min(physics.maxSpeedMps, physics.nominalSpeedMps - 3 + elapsed * .115);
    const nextDistance = distance + speed * STEP;
    const length = physics.playerHalfLengthM;
    const width = physics.playerHalfWidthM;
    const retained = [];

    for (const event of courseEvents) {
      if (event.startDistance !== undefined) {
        const end = event.endDistance + length + physics.longitudinalClearanceM;
        if (end < distance) continue;
        const start = event.startDistance - length - physics.longitudinalClearanceM;
        const collisionWidth = event.halfWidth + width + physics.lateralClearanceM;
        if (touches(previousX, nextX, event, start, end, collisionWidth, nextDistance)) {
          const clearsJump = event.kind === 'jump' && Math.min(jumpHeightAt(jump), jumpHeightAt(wasJumping)) >= .38;
          const clearsSlide = event.kind === 'slide' && slide > 0;
          if (!clearsJump && !clearsSlide && status === 'running') {
            const shielded = powerups.shield;
            powerups.shield = false;
            notifications.push({type: shielded ? 'shield' : 'crash', event: {...event}});
            if (shielded) continue;
            status = 'crashed';
          }
        }
      } else {
        const pickupReach = length + event.radius + (event.kind === 'coin' ? .3 : .15);
        if (event.distance + pickupReach < distance) continue;
        const pickupWidth = width + event.radius + (event.kind === 'coin' && powerups.magnet > 0 ? LANE_WIDTH : .28);
        if (status === 'running' && touches(previousX, nextX, event, event.distance - pickupReach,
          event.distance + pickupReach, pickupWidth, nextDistance)) {
          if (event.kind === 'coin') coins += event.value * (powerups.double > 0 ? 2 : 1);
          else if (event.kind === 'shield') powerups.shield = true;
          else powerups[event.kind] = POWER_SECONDS[event.kind];
          notifications.push({type: event.kind === 'coin' ? 'coin' : 'powerup', event: {...event}});
          continue;
        }
      }
      retained.push(event);
    }

    distance = nextDistance;
    courseEvents = retained;
    segments = segments.filter(segment => segment.endM + 3 >= distance);
    if (status === 'running') extendCourse();
  }

  function step(seconds) {
    if (status !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    remainder += Math.min(seconds, .25);
    while (remainder + 1e-9 >= STEP && status === 'running') {
      remainder -= STEP;
      advance();
    }
  }

  function snapshot() {
    return {
      status, distance, elapsed, speed, lane, lanePosition, jumpHeight: jumpHeightAt(jump), sliding: slide > 0,
      jumpProgress: jump ? 1 - jump / JUMP_SECONDS : 0, slideProgress: slide ? 1 - slide / SLIDE_SECONDS : 0,
      stance: jump > 0 ? 'jump' : slide > 0 ? 'slide' : 'stand',
      coins, score: alpineRunnerScore(distance, coins), difficulty, theme, powerups: {...powerups},
      nextEvents: courseEvents.filter(event => event.distance < distance + LOOKAHEAD).map(event => ({...event})),
      segments: segments.map(segment => ({...segment}))
    };
  }

  extendCourse();
  return {command, step, snapshot, clearCommands: () => { pending.length = 0; }, drainEvents: () => notifications.splice(0)};
}
