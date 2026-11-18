// Deterministic pit-stop timeline, independent of renderers and Node APIs. CC0-1.0.
// API 1.0.0. All times are game-clock seconds. No wall-clock timers are used.
export const API_VERSION = '1.0.0';
const EPSILON = 1e-9;
const STAGES = ['enter', 'stop', 'jack_up', 'loosen', 'remove_old', 'mount_new', 'tighten', 'green', 'jack_down', 'signal', 'exit'];
const WHEELS = ['front_left', 'front_right', 'rear_left', 'rear_right'];
const cache = new WeakMap();
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const progress = (time, start, end) => end === start ? Number(time >= end) : clamp((time - start) / (end - start), 0, 1);
const smooth = value => value * value * (3 - 2 * value);
const mix = (a, b, amount) => a.map((value, i) => value + (b[i] - value) * amount);
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Return all schema/ordering errors without changing the caller's data. */
export function validateSequence(config) {
  const errors = [];
  if (!config || typeof config !== 'object') return freeze({valid: false, errors: ['Sequence must be an object.']});
  const stages = Array.isArray(config.stages) ? config.stages : [];
  const actors = Array.isArray(config.actors) ? config.actors : [];
  const wheels = Array.isArray(config.wheels) ? config.wheels : [];
  if (config.schemaVersion !== 2) errors.push('schemaVersion must be 2.');
  if (!finite(config.duration) || config.duration < 2 || config.duration > 3) errors.push('duration must be between 2 and 3 seconds.');
  if (stages.length !== STAGES.length || stages.some((stage, i) => stage.id !== STAGES[i])) errors.push('All eleven stages must occur once in the required order.');
  const stageMap = new Map(stages.map(stage => [stage.id, stage]));
  for (const [i, stage] of stages.entries()) {
    if (!finite(stage.start) || !finite(stage.end) || stage.start < 0 || stage.end <= stage.start) errors.push(`Invalid interval: ${stage.id}.`);
    if (Math.abs(stage.start - (i ? stages[i - 1].end : 0)) > EPSILON) errors.push(`Gap or overlap before ${stage.id}.`);
    if (!Array.isArray(stage.dependsOn)) errors.push(`Missing dependencies: ${stage.id}.`);
    else {
      if (i && !stage.dependsOn.includes(stages[i - 1].id)) errors.push(`Missing preceding dependency: ${stage.id}.`);
      for (const dependency of stage.dependsOn) {
        const previous = stageMap.get(dependency);
        if (!previous || previous.end > stage.start + EPSILON || dependency === stage.id) errors.push(`Overlapping or invalid dependency ${dependency} -> ${stage.id}.`);
      }
    }
  }
  if (stages.length && Math.abs(stages.at(-1).end - config.duration) > EPSILON) errors.push('Final stage must end at duration.');
  const actorIds = actors.map(actor => actor.id);
  if (actorIds.length !== 6 || new Set(actorIds).size !== 6) errors.push('Exactly six unique actors are required.');
  for (const actor of actors) {
    if (!Array.isArray(actor.position) || actor.position.length !== 3 || !actor.position.every(finite) || !finite(actor.yaw)) errors.push(`Invalid actor transform: ${actor.id}.`);
    if (!Array.isArray(actor.tracks) || actor.tracks.length !== stages.length) {errors.push(`Incomplete actor tracks: ${actor.id}.`); continue;}
    for (const [index, track] of actor.tracks.entries()) {
      const stage = stages[index];
      if (!stage || track.stage !== stage.id || track.start !== stage.start || track.end !== stage.end) errors.push(`Track interval does not match stage: ${actor.id}/${track.stage}.`);
      if (typeof track.clip !== 'string' || !track.clip || typeof track.clipFile !== 'string' || !track.clipFile) errors.push(`Missing clip: ${actor.id}/${track.stage}.`);
      if (!finite(track.clipStart) || !finite(track.clipEnd) || track.clipStart < 0 || track.clipEnd < track.clipStart) errors.push(`Invalid clip range: ${actor.id}/${track.stage}.`);
    }
    if (actor.rootMotionKeys !== undefined && (!Array.isArray(actor.rootMotionKeys) || actor.rootMotionKeys.some((key, i, keys) => !finite(key.time) || key.time < 0 || key.time > config.duration || i && key.time <= keys[i - 1].time || !Array.isArray(key.position) || key.position.length !== 3 || !key.position.every(finite)))) errors.push(`Invalid root motion keys: ${actor.id}.`);
    if (actor.rootMotionAxes !== undefined) for (const [axis, curves] of Object.entries(actor.rootMotionAxes)) {
      if (!['x', 'y', 'z'].includes(axis) || !Array.isArray(curves) || curves.some((curve, i) => ![curve.start, curve.end, curve.from, curve.to].every(finite) || curve.start < 0 || curve.end <= curve.start || curve.end > config.duration || i && curve.start < curves[i - 1].end)) errors.push(`Invalid baked root curve: ${actor.id}/${axis}.`);
    }
  }
  if (wheels.length !== 4 || WHEELS.some(id => wheels.filter(wheel => wheel.id === id).length !== 1)) errors.push('Exactly the four canonical wheel stations are required.');
  const identities = wheels.flatMap(wheel => [wheel.oldId, wheel.newId]);
  if (identities.some(id => typeof id !== 'string' || !id) || new Set(identities).size !== 8) errors.push('Eight distinct old/new wheel identities are required.');
  if (new Set(wheels.map(wheel => wheel.actor)).size !== 4) errors.push('Each wheel needs a distinct mechanic.');
  if (new Set(wheels.map(wheel => wheel.carNode)).size !== 4 || wheels.some(wheel => typeof wheel.carNode !== 'string' || !wheel.carNode)) errors.push('Each wheel needs a distinct car hub node.');
  for (const wheel of wheels) {
    if (!actorIds.includes(wheel.actor)) errors.push(`Unknown mechanic: ${wheel.id}.`);
    const mechanic = actors.find(actor => actor.id === wheel.actor);
    if (mechanic?.role !== 'wheel_mechanic' || mechanic?.wheel !== wheel.id) errors.push(`Mechanic assignment does not match wheel: ${wheel.id}.`);
    const events = wheel.events ?? {};
    const ordered = ['nutLoose', 'detach', 'oldReleased', 'oldRacked', 'newGripped', 'secondaryGripReleased', 'mounted', 'nutSeated', 'torqued'].map(key => events[key]);
    if (ordered.some(value => !finite(value)) || ordered.some((value, i) => i && value < ordered[i - 1])) errors.push(`Wheel operations are out of order: ${wheel.id}.`);
    for (const [event, stage] of [['nutLoose', 'loosen'], ['detach', 'remove_old'], ['oldReleased', 'remove_old'], ['oldRacked', 'remove_old'], ['newGripped', 'mount_new'], ['secondaryGripReleased', 'mount_new'], ['mounted', 'mount_new'], ['nutSeated', 'tighten'], ['torqued', 'tighten']]) {
      const interval = stageMap.get(stage);
      if (!interval || events[event] < interval.start - EPSILON || events[event] > interval.end + EPSILON) errors.push(`Event outside its stage: ${wheel.id}/${event}.`);
    }
    if (!Array.isArray(wheel.hub) || wheel.hub.length !== 3 || !wheel.hub.every(finite)) errors.push(`Invalid hub transform: ${wheel.id}.`);
  }
  if (!finite(config.car?.liftMeters) || config.car.liftMeters <= 0) errors.push('Positive car lift is required.');
  for (const key of ['entryPosition', 'stopPosition', 'exitPosition']) if (!Array.isArray(config.car?.[key]) || config.car[key].length !== 3 || !config.car[key].every(finite)) errors.push(`Invalid car ${key}.`);
  const attachments = config.props?.attachments;
  if (!Array.isArray(attachments)) errors.push('Prop attachments are required.');
  else {
    if (new Set(attachments.map(prop => prop.id)).size !== attachments.length) errors.push('Prop IDs must be unique.');
    for (const id of [...identities, ...WHEELS.map(id => `gun_${id}`), 'jack_front', 'jack_rear']) if (!attachments.some(prop => prop.id === id)) errors.push(`Missing prop attachment: ${id}.`);
    for (const prop of attachments) if (prop.windows !== undefined) {
      if (!Array.isArray(prop.windows) || !prop.windows.length) {errors.push(`Missing attachment windows: ${prop.id}.`); continue;}
      for (const [i, window] of prop.windows.entries()) {
        if (!finite(window.start) || !finite(window.end) || window.end <= window.start || Math.abs(window.start - (i ? prop.windows[i - 1].end : 0)) > EPSILON) errors.push(`Gap, overlap or invalid attachment window: ${prop.id}.`);
        if (!['world', 'car', ...actorIds].includes(window.parent)) errors.push(`Unknown attachment parent: ${prop.id}.`);
      }
      if (Math.abs(prop.windows.at(-1).end - config.duration) > EPSILON) errors.push(`Incomplete attachment coverage: ${prop.id}.`);
    }
    for (const id of ['front', 'rear']) {
      const jack = attachments.find(prop => prop.id === `jack_${id}`);
      if (!jack || !Array.isArray(jack.position) || jack.position.length !== 3 || !jack.position.every(finite) || !Array.isArray(jack.contactPosition) || jack.contactPosition.length !== 3 || !jack.contactPosition.every(finite) || !finite(jack.yaw)) errors.push(`Invalid jack transform: ${id}.`);
      if (!jack || !finite(jack.loweredAt) || jack.loweredAt < (stageMap.get('jack_down')?.start ?? 0) || jack.loweredAt > (stageMap.get('jack_down')?.end ?? 0) || jack.clearAt !== stageMap.get('jack_down')?.end) errors.push(`Invalid jack lower/clear timing: ${id}.`);
    }
  }
  if (!Array.isArray(config.events)) errors.push('A chronological event array is required.');
  else for (const [i, event] of config.events.entries()) {
    if (!finite(event.time) || event.time < 0 || event.time > config.duration || i && event.time < config.events[i - 1].time || typeof event.type !== 'string' || !event.type) errors.push(`Invalid or unsorted event at index ${i}.`);
    if (event.wheel !== undefined && !WHEELS.includes(event.wheel)) errors.push(`Unknown event wheel: ${event.wheel}.`);
    if (event.actor !== undefined && event.actor !== 'car' && !actorIds.includes(event.actor)) errors.push(`Unknown event actor: ${event.actor}.`);
  }
  if (Array.isArray(config.events)) {
    const serviceIndex = config.events.findIndex(event => event.type === 'service_complete');
    const releaseIndex = config.events.findIndex(event => event.type === 'release');
    for (const wheel of wheels) {
      const torqueIndex = config.events.findIndex(event => event.type === 'torqued' && event.wheel === wheel.id && event.time === wheel.events?.torqued);
      if (torqueIndex < 0 || serviceIndex < torqueIndex) errors.push(`Torque callback must precede service-complete: ${wheel.id}.`);
    }
    const signalIndex = config.events.findIndex(event => event.type === 'hand_signal_complete');
    if (signalIndex < 0 || releaseIndex < signalIndex) errors.push('Hand-signal callback must precede release.');
  }
  return freeze({valid: errors.length === 0, errors});
}

function prepare(config) {
  if (cache.has(config)) return cache.get(config);
  const result = validateSequence(config);
  if (!result.valid) throw new TypeError(`Invalid pit sequence:\n${result.errors.join('\n')}`);
  // Cache an immutable copy, so edits to an integration's source JSON cannot
  // change a running controller or a previously issued snapshot.
  const data = freeze(clone(config));
  const prepared = {data, stages: Object.fromEntries(data.stages.map(stage => [stage.id, stage]))};
  cache.set(config, prepared);
  return prepared;
}

function numericTime(value, duration) {
  if (!finite(value)) throw new TypeError('Time must be a finite number of seconds.');
  return clamp(value, 0, duration);
}

function evaluate(prepared, requestedTime, options = {}, minimumTime = 0) {
  const {data, stages} = prepared;
  let time = numericTime(requestedTime, data.duration);
  const autoConfirm = options.autoConfirm !== false;
  const confirmations = options.confirmations ?? {};
  const confirmed = Object.fromEntries(data.wheels.map(wheel => [wheel.id, (autoConfirm || confirmations[wheel.id] === true) && time >= wheel.events.torqued - EPSILON]));
  const missing = data.wheels.filter(wheel => !confirmed[wheel.id]).map(wheel => `fastener:${wheel.id}`);
  let hold = null;
  if (time >= stages.green.start - EPSILON && missing.length) {
    time = Math.max(minimumTime, stages.green.start);
    hold = 'hold_fasteners';
  }
  if (!hold && time >= stages.exit.start - EPSILON && options.laneClear === false) {
    time = Math.max(minimumTime, stages.exit.start);
    hold = 'hold_exit';
  }
  if (Math.abs(time - data.duration) < EPSILON) time = data.duration;
  const stage = data.stages.find(candidate => time < candidate.end - EPSILON) ?? data.stages.at(-1);
  const stageProgress = progress(time, stage.start, stage.end);
  const loweredAt = Math.max(...['front', 'rear'].map(id => data.props.attachments.find(prop => prop.id === `jack_${id}`).loweredAt));
  let lift = 0;
  if (time >= stages.jack_up.start && time < stages.jack_up.end) lift = data.car.liftMeters * smooth(progress(time, stages.jack_up.start, stages.jack_up.end));
  else if (time >= stages.jack_up.end && time < stages.jack_down.start) lift = data.car.liftMeters;
  else if (time >= stages.jack_down.start && time < loweredAt) lift = data.car.liftMeters * (1 - smooth(progress(time, stages.jack_down.start, loweredAt)));
  let position = [...data.car.stopPosition];
  if (time < stages.enter.end) position = mix(data.car.entryPosition, data.car.stopPosition, smooth(progress(time, stages.enter.start, stages.enter.end)));
  else if (time > stages.exit.start) position = mix(data.car.stopPosition, data.car.exitPosition, progress(time, stages.exit.start, stages.exit.end) ** 2);
  position[1] += lift;
  const wheels = {};
  for (const wheel of data.wheels) {
    const events = wheel.events;
    const oldState = time < events.detach - EPSILON ? 'hub' : time < events.oldReleased - EPSILON ? 'held' : time < events.oldRacked - EPSILON ? 'released' : 'rack';
    const newState = time < events.newGripped - EPSILON ? 'rack' : time < events.mounted - EPSILON ? 'held' : 'hub';
    const fastener = time < stages.loosen.start ? 'tight' : time < events.nutLoose - EPSILON ? 'loosening' : time < stages.tighten.start ? 'loose' : time < events.nutSeated - EPSILON ? 'tightening' : 'tight';
    const primaryGripActive = oldState === 'held' || newState === 'held';
    const secondaryGripActive = oldState === 'held' || newState === 'held' && time < events.secondaryGripReleased - EPSILON;
    wheels[wheel.id] = {actor: wheel.actor, oldId: wheel.oldId, newId: wheel.newId, oldState, newState, fastener, confirmed: (autoConfirm || confirmations[wheel.id] === true) && time >= events.torqued - EPSILON, replaced: oldState === 'rack' && newState === 'hub', primaryGripActive, secondaryGripActive, hub: [...wheel.hub], progress: {loosen: progress(time, stages.loosen.start, stages.loosen.end), remove: progress(time, stages.remove_old.start, stages.remove_old.end), mount: progress(time, stages.mount_new.start, stages.mount_new.end), tighten: progress(time, stages.tighten.start, stages.tighten.end)}};
  }
  const serviceComplete = Object.values(wheels).every(wheel => wheel.replaced && wheel.fastener === 'tight' && wheel.confirmed);
  const jacksClear = time >= stages.jack_down.end - EPSILON;
  const crewClear = time >= stages.jack_down.end - EPSILON;
  const handSignalComplete = time >= stages.signal.end - EPSILON;
  const blockedBy = [];
  if (!serviceComplete) blockedBy.push(...data.wheels.filter(wheel => !wheels[wheel.id].replaced).map(wheel => `wheel:${wheel.id}`), ...data.wheels.filter(wheel => !wheels[wheel.id].confirmed).map(wheel => `fastener:${wheel.id}`));
  if (!jacksClear) blockedBy.push('jacks_clear');
  if (!crewClear) blockedBy.push('crew_clear');
  if (!handSignalComplete) blockedBy.push('hand_signal');
  if (options.laneClear === false) blockedBy.push('exit_lane_clear');
  const canExit = serviceComplete && jacksClear && crewClear && handSignalComplete && options.laneClear !== false;
  const jacks = {};
  for (const id of ['front', 'rear']) {
    const definition = data.props.attachments.find(prop => prop.id === `jack_${id}`);
    const clearMotion = definition.clearanceMotion;
    const amount = clearMotion ? smooth(progress(time, clearMotion.start, clearMotion.end)) : 0;
    const entryMotion = definition.entryMotion;
    const waitAmount = entryMotion ? 1 - smooth(progress(time, entryMotion.start, entryMotion.end)) : 0;
    const jackPosition = (definition.position ?? [0, 0, 0]).map((value, i) => value + (clearMotion?.translation[i] ?? 0) * amount + (entryMotion?.waitOffset[i] ?? 0) * waitAmount);
    jacks[id] = {liftMeters: lift, clear: jacksClear, position: jackPosition, yaw: definition.yaw ?? 0, chassisContact: definition.contactPosition.map((value, i) => value + position[i])};
  }
  const actors = {};
  for (const actor of data.actors) {
    const track = actor.tracks.find(candidate => candidate.stage === stage.id);
    const amount = progress(time, track.start, track.end);
    const clipTime = track.loop ? (time - track.start) % Math.max(EPSILON, track.clipEnd - track.clipStart) + track.clipStart : track.clipStart + (track.clipEnd - track.clipStart) * amount;
    let rootOffset = [0, 0, 0];
    if (actor.rootMotionKeys?.length) {
      const keys = actor.rootMotionKeys;
      const index = keys.findIndex(key => key.time > time);
      const before = keys[Math.max(0, index === -1 ? keys.length - 1 : index - 1)];
      const after = keys[index === -1 ? keys.length - 1 : index];
      rootOffset = mix(before.position, after.position, smooth(progress(time, before.time, after.time)));
    }
    if (actor.rootMotionAxes) for (const [axis, curves] of Object.entries(actor.rootMotionAxes)) {
      const component = {x: 0, y: 1, z: 2}[axis];
      if (component === undefined) continue;
      let value = 0;
      for (const curve of curves) {
        if (time < curve.start) break;
        value = curve.from + (curve.to - curve.from) * smooth(progress(time, curve.start, curve.end));
      }
      rootOffset[component] = value;
    }
    actors[actor.id] = {clip: track.clip, clipFile: track.clipFile, clipTime, clipDuration: track.clipEnd, stage: stage.id, position: [...actor.position], yaw: actor.yaw, rootMotionBaked: actor.rootMotionBaked === true, rootOffset};
  }
  const events = data.events.filter(event => event.time <= time + EPSILON && (event.type !== 'service_complete' || serviceComplete) && (event.type !== 'release' || canExit) && (event.type !== 'complete' || time === data.duration && canExit));
  const normalizedRequest = Math.abs(requestedTime - data.duration) < EPSILON ? data.duration : clamp(requestedTime, 0, data.duration);
  return freeze({apiVersion: API_VERSION, time, requestedTime: normalizedRequest, duration: data.duration, state: hold ?? stage.id, stage: stage.id, stageProgress, progress: time / data.duration, complete: time === data.duration && canExit, held: hold !== null, light: serviceComplete ? 'green' : 'red', serviceComplete, canExit, blockedBy, laneClear: options.laneClear !== false, car: {position, liftMeters: lift, stopped: time >= stages.enter.end && time <= stages.exit.start || hold !== null}, jacks, crewClear, handSignalComplete, wheels, actors, events});
}

/** Pure random-access replay. Missing manual approvals clamp replay at a gate. */
export function samplePitSequence(config, time, options = {}) {
  return evaluate(prepare(config), time, options);
}

/**
 * Stable controller API. autoConfirm defaults to true for this local simulation;
 * integrations pass false and call setConfirmation(wheelId, true) after torque.
 * update consumes seconds only while playing; blocked time is not accumulated.
 * seek emits no events and rebuilds state. reset clears manual approvals.
 * subscribe receives (event, immutableSnapshot); unsubscribe is idempotent.
 */
export function createPitSequence(config, options = {}) {
  const prepared = prepare(config);
  const settings = {autoConfirm: options.autoConfirm !== false, laneClear: options.laneClear !== false, confirmations: {}};
  const listeners = new Set();
  let playing = false;
  let current = evaluate(prepared, 0, settings);
  let eventCursor = 0;
  function snapshot() { return freeze({...current, playing}); }
  function notify(event) { for (const listener of [...listeners]) listener(freeze(clone(event)), snapshot()); }
  function updateCurrent(time, minimumTime = 0) {current = evaluate(prepared, time, settings, minimumTime); return snapshot();}
  const controller = {
    start() {if (!current.complete) playing = true; return snapshot();},
    pause() {playing = false; return snapshot();},
    update(deltaSeconds) {
      if (!finite(deltaSeconds) || deltaSeconds < 0) throw new TypeError('Delta must be finite nonnegative seconds.');
      if (!playing || deltaSeconds === 0 || current.complete) return snapshot();
      const previousTime = current.time;
      updateCurrent(current.time + deltaSeconds, current.time);
      if (current.complete) playing = false;
      for (let i = eventCursor; i < prepared.data.events.length; i++) {
        const event = prepared.data.events[i];
        if (event.time > current.time + EPSILON) break;
        if (event.type === 'service_complete' && !current.serviceComplete || event.type === 'release' && !current.canExit || event.type === 'complete' && !current.complete) break;
        eventCursor = i + 1;
        if (event.time >= previousTime - EPSILON) notify(event);
      }
      return snapshot();
    },
    seek(time) {
      const target = numericTime(time, prepared.data.duration);
      // A backward replay invalidates acknowledgements from its future.
      if (target < current.time) for (const wheel of prepared.data.wheels) if (target < wheel.events.torqued - EPSILON) delete settings.confirmations[wheel.id];
      playing = false;
      updateCurrent(target);
      eventCursor = prepared.data.events.findIndex(event => event.time > current.time + EPSILON);
      if (eventCursor < 0) eventCursor = prepared.data.events.length;
      return snapshot();
    },
    reset() {
      playing = false; settings.confirmations = {}; eventCursor = 0;
      return updateCurrent(0);
    },
    getSnapshot: snapshot,
    setLaneClear(clear) {
      if (typeof clear !== 'boolean') throw new TypeError('laneClear must be boolean.');
      settings.laneClear = clear;
      return updateCurrent(current.time, current.time);
    },
    setConfirmation(wheelId, confirmed = true) {
      const wheel = prepared.data.wheels.find(candidate => candidate.id === wheelId);
      if (!wheel) throw new RangeError(`Unknown wheel station: ${wheelId}.`);
      if (typeof confirmed !== 'boolean') throw new TypeError('confirmed must be boolean.');
      if (confirmed && current.time < wheel.events.torqued - EPSILON) throw new RangeError(`Cannot confirm ${wheelId} before torque completes.`);
      if (!confirmed && current.time > prepared.stages.exit.start + EPSILON) throw new RangeError('Fastener confirmation cannot be revoked after departure.');
      settings.confirmations[wheelId] = confirmed;
      return updateCurrent(current.time, current.time);
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Listener must be a function.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  return Object.freeze(controller);
}
