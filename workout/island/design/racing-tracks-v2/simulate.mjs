// Original headless driver. CC0-1.0; see LICENSES.md.
// Node >= 22.15: dependency injection only; racing-physics.mjs is loaded unchanged.
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { racingAngle, getRacingStage } from '../../minigames/racing-tracks.mjs';
import { buildSpeedProfile, profileSpeedAt, steeringRate } from './analysis.mjs';

const physicsURL = new URL('../../minigames/racing-physics.mjs', import.meta.url).href;
const tracksURL = new URL('../../minigames/racing-tracks.mjs', import.meta.url).href;
const analysisURL = new URL('./analysis.mjs', import.meta.url).href;
const fixturesKey = 'bakasun.racing-tracks-v2.fixtures';
const fixtures = globalThis[Symbol.for(fixturesKey)] ??= new Map();
const adapterURL = 'racing-tracks-v2:headless-adapter';
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.split('?')[0] === physicsURL && specifier.startsWith('./racing-tracks.mjs'))
      return { url: adapterURL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url !== adapterURL) return nextLoad(url, context);
    return { format: 'module', shortCircuit: true, source: `
      import { createTrack as productionCreateTrack } from ${JSON.stringify(tracksURL)};
      import { buildScaledTrack } from ${JSON.stringify(analysisURL)};
      export { getRacingStage, racingAngle, wrapRacingDistance } from ${JSON.stringify(tracksURL)};
      export function createTrack(stage) {
        const fixture = globalThis[Symbol.for(${JSON.stringify(fixturesKey)})].get(stage.trackId);
        const track = fixture ? buildScaledTrack(fixture, { tier: stage.tier, reverse: stage.reverse }) : productionCreateTrack(stage);
        // Controlled unboosted time trial: no pad, pickup, nitro or drafting gains.
        track.boostPads = []; track.pickups = [];
        return track;
      }
    ` };
  }
});
const { createRacing } = await import(physicsURL + '?racingTracksV2Headless');
hooks.deregister();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Pure pursuit, inverse of the default player's soft yaw cap and input shaping.
 * Only returns normal player inputs; never changes car position, speed or gates.
 */
export function goodPlayerInput(race, profile) {
  const { player: car } = race.state, v = car.speed, look = 6 + v * .24;
  const target = race.track.sample(car.s + look);
  const error = racingAngle(Math.atan2(target.x - car.x, target.z - car.z) - car.heading);
  const desiredYaw = 2 * Math.sin(error) * Math.max(3, v) / look;
  const limit = 44 / Math.max(v, 10);
  const filteredSteer = clamp((v > 10 ? Math.atanh(clamp(desiredYaw / limit, -.96, .96)) * limit : desiredYaw) / steeringRate(v), -1, 1);
  const b = .3 * clamp((v - 28) / 17, 0, 1), a = 1 - b;
  const steer = b ? Math.sign(filteredSteer) * (-a + Math.sqrt(a * a + 4 * b * Math.abs(filteredSteer))) / (2 * b) : filteredSteer;
  const targetSpeed = profileSpeedAt(profile, car.s + v * .07);
  return { steer, throttle: v < targetSpeed - .04 ? 1 : 0, autoAccelerate: false,
    brake: v > targetSpeed + .06, drift: false, nitro: false };
}

/** Two laps in the actual 60 Hz physics: first standing, second rolling.
 * Definitions are pre-scale. Reverse and narrowed-width tiers match production.
 * Calls step(1/60, input) only; no manual pose, speed, gate or wall adjustments.
 */
export function simulateLap(definition, { tier = 0, circuitIndex = 0, laps = 2,
  lateralAcceleration = 44, safety = .985 } = {}) {
  const fixtureId = `racing-tracks-v2:${definition.id}`;
  fixtures.set(fixtureId, definition);
  const stageNumber = tier * 6 + circuitIndex + 1, sourceStage = getRacingStage(stageNumber);
  const race = createRacing({ stage: stageNumber, seed: 20261107, config: { countdown: 0, draft: false,
    stage: { trackId: fixtureId, opponents: 0, grid: 1, laps, timeLimit: 600 } } });
  const { track, state } = race;
  const profile = buildSpeedProfile(track, { tier, lateralAcceleration: lateralAcceleration === 'ai' ? undefined : lateralAcceleration, safety });
  let maxLateral = 0, under85Distance = 0, over95Distance = 0, measuredDistance = 0;
  let maxSpeed = 0, minRollingSpeed = Infinity, brakingDistance = 0, fullThrottleDistance = 0;
  const samples = [], eventCounts = {};
  let lastSampleS = -Infinity;
  while (state.phase === 'racing') {
    const before = state.player.routeS, input = goodPlayerInput(race, profile);
    race.step(1 / 60, input);
    const car = state.player, after = car.routeS;
    maxLateral = Math.max(maxLateral, Math.abs(car.lateral));
    for (const event of state.events) eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    // Measure one complete rolling lap; clamp the small final physics-step overshoot.
    const distance = Math.max(0, Math.min(after, 2 * track.length) - Math.max(before, track.length));
    if (distance) {
      measuredDistance += distance;
      if (car.speed < .85 * sourceStage.playerSpeed) under85Distance += distance;
      if (car.speed > .95 * sourceStage.playerSpeed) over95Distance += distance;
      if (input.brake) brakingDistance += distance;
      if (input.throttle) fullThrottleDistance += distance;
      maxSpeed = Math.max(maxSpeed, car.speed); minRollingSpeed = Math.min(minRollingSpeed, car.speed);
      const s = Math.min(track.length, Math.max(0, after - track.length));
      if (after - lastSampleS >= 2 || after >= 2 * track.length) {
        samples.push({ s, speed: car.speed, x: car.x, y: car.y, z: car.z, lateral: car.lateral,
          brake: input.brake, throttle: input.throttle, gear: car.gear });
        lastSampleS = after;
      }
    }
  }
  fixtures.delete(fixtureId);
  const car = state.player;
  const result = { id: definition.id, tier, stage: stageNumber, topSpeed: sourceStage.playerSpeed,
    aiCorner: sourceStage.aiCorner, length: track.length, finished: car.finished,
    checkpoints: car.checkpoints, requiredCheckpoints: laps * track.checkpoints.length,
    completeRollingLap: car.finished && car.checkpoints === laps * track.checkpoints.length && Math.abs(measuredDistance - track.length) < .01,
    standingLapSeconds: car.lapTimes[0] ?? null, rollingLapSeconds: car.lapTimes[1] ?? null,
    lapTimes: [...car.lapTimes], wallHits: car.wallHits, recoveries: car.recoveries,
    maxLateral, minRollingSpeed: Number.isFinite(minRollingSpeed) ? minRollingSpeed : null, maxSpeed,
    measuredDistance, under85Fraction: measuredDistance ? under85Distance / measuredDistance : null,
    over95Fraction: measuredDistance ? over95Distance / measuredDistance : null,
    brakingFraction: measuredDistance ? brakingDistance / measuredDistance : null,
    fullThrottleFraction: measuredDistance ? fullThrottleDistance / measuredDistance : null,
    fixedStep: 1 / 60, safety, lateralAcceleration, eventCounts, samples };
  race.dispose();
  return result;
}

export async function physicsSourceSHA256() {
  return createHash('sha256').update(await readFile(new URL(physicsURL))).digest('hex');
}
