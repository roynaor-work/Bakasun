import { API_VERSION, DIFFICULTIES, EXTINGUISHERS, FIRE_CLASSES, LIMITS, MATERIALS } from './catalog.mjs';

export const fail = message => { throw new TypeError(message); };
export function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${path} must be a plain object`);
}
export function keys(value, allowed, path) {
  object(value, path);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key} is not supported`);
}
export function number(value, min, max, path, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`${path} must be ${integer ? 'an integer' : 'finite'} in [${min}, ${max}]`);
}
export function id(value, path) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(value)) fail(`${path} must be a 1–48 character identifier`);
}
export function oneOf(value, values, path) {
  if (!values.includes(value)) fail(`${path} must be one of ${values.join(', ')}`);
}
export function boolean(value, path) { if (typeof value !== 'boolean') fail(`${path} must be boolean`); }
export function list(value, min, max, path) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${path} must contain ${min}–${max} entries`);
}
export function unique(items, path) {
  if (new Set(items.map(item => item.id)).size !== items.length) fail(`${path} has duplicate ids`);
}
function json(value, path = 'state', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail(`${path} must be finite`); return; }
  if (typeof value !== 'object' || seen.has(value)) fail(`${path} must be acyclic JSON data`);
  seen.add(value);
  if (!Array.isArray(value)) object(value, path);
  for (const [key, item] of Object.entries(value)) json(item, `${path}.${key}`, seen);
  seen.delete(value);
}

export function validateBuilding(input, live = false) {
  keys(input, ['rooms', 'links', 'people', 'startRoomId'], 'building');
  list(input.rooms, 1, LIMITS.maxRooms, 'building.rooms');
  list(input.links, 0, LIMITS.maxLinks, 'building.links');
  list(input.people, 0, LIMITS.maxPeople, 'building.people');
  unique(input.rooms, 'building.rooms'); unique(input.links, 'building.links'); unique(input.people, 'building.people');
  for (const [i, room] of input.rooms.entries()) {
    const path = `building.rooms[${i}]`;
    keys(room, ['id', 'floor', 'material', 'fireClass', 'fuel', 'heat', 'fire', 'smoke', 'oxygen', 'ventilation', 'exit'], path);
    id(room.id, `${path}.id`); number(room.floor, 0, LIMITS.maxFloors - 1, `${path}.floor`, true);
    oneOf(room.material, Object.keys(MATERIALS), `${path}.material`);
    if (room.fireClass !== undefined) oneOf(room.fireClass, FIRE_CLASSES, `${path}.fireClass`);
    if (room.fuel !== undefined) number(room.fuel, 0, 200, `${path}.fuel`);
    if (room.material === 'concrete' && (room.fuel ?? 0) !== 0) fail(`${path}.concrete cannot contain combustible fuel`);
    for (const field of ['heat', 'fire', 'smoke', 'oxygen', 'ventilation']) if (room[field] !== undefined) number(room[field], 0, 1, `${path}.${field}`);
    if (room.exit !== undefined) boolean(room.exit, `${path}.exit`);
    if (room.exit && room.floor !== 0) fail(`${path}.exit must be on floor zero`);
    if (room.fire > 0 && (room.fuel ?? MATERIALS[room.material].fuel) === 0) fail(`${path} cannot burn without fuel`);
  }
  const rooms = new Map(input.rooms.map(room => [room.id, room]));
  id(input.startRoomId, 'building.startRoomId');
  if (!rooms.has(input.startRoomId)) fail('building.startRoomId is unknown');
  if (!input.rooms.some(room => room.exit)) fail('building requires a ground-floor exit');
  const pairs = new Set();
  for (const [i, link] of input.links.entries()) {
    const path = `building.links[${i}]`;
    keys(link, ['id', 'from', 'to', 'type', 'open'], path); id(link.id, `${path}.id`);
    if (!rooms.has(link.from) || !rooms.has(link.to) || link.from === link.to) fail(`${path} requires two distinct existing rooms`);
    oneOf(link.type, ['door', 'stairs'], `${path}.type`);
    if (link.open !== undefined) boolean(link.open, `${path}.open`);
    const difference = Math.abs(rooms.get(link.from).floor - rooms.get(link.to).floor);
    if (difference !== (link.type === 'door' ? 0 : 1)) fail(`${path} doors must be same-floor and stairs must connect adjacent floors`);
    const pair = [link.from, link.to].sort().join('|');
    if (pairs.has(pair)) fail(`${path} duplicates a connection`); pairs.add(pair);
  }
  // Closed doors can be opened. Every room must have a topological exit route.
  const reached = new Set([input.startRoomId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const link of input.links) if (reached.has(link.from) !== reached.has(link.to)) {
      reached.add(link.from); reached.add(link.to); changed = true;
    }
  }
  if (reached.size !== rooms.size) fail('building rooms must form one connected graph');
  if (!live && (rooms.get(input.startRoomId).fire > 0.35 || rooms.get(input.startRoomId).heat > 0.78)) fail('building.startRoomId must be safe to enter');
  for (const [i, person] of input.people.entries()) {
    const path = `building.people[${i}]`;
    keys(person, ['id', 'roomId', 'health'], path); id(person.id, `${path}.id`);
    if (!rooms.has(person.roomId)) fail(`${path}.roomId is unknown`);
    if (person.health !== undefined) number(person.health, 0.01, 1, `${path}.health`);
  }
  return true;
}

export function validateAction(action) {
  if (action === null) return;
  object(action, 'action');
  const fields = { wait: [], move: ['roomId'], spray: ['roomId', 'agent'], rescue: ['personId'], door: ['linkId', 'open'], pause: [], resume: [] };
  oneOf(action.type, Object.keys(fields), 'action.type'); keys(action, ['type', ...fields[action.type]], 'action');
  if (['move', 'spray'].includes(action.type)) id(action.roomId, 'action.roomId');
  if (action.type === 'spray') oneOf(action.agent, Object.keys(EXTINGUISHERS), 'action.agent');
  if (action.type === 'rescue') id(action.personId, 'action.personId');
  if (action.type === 'door') { id(action.linkId, 'action.linkId'); boolean(action.open, 'action.open'); }
}

/** Validate a serialized v1 snapshot, including cross-references and bounds. */
export function validateState(state) {
  json(state);
  keys(state, ['apiVersion', 'seed', 'rngState', 'difficulty', 'status', 'reason', 'tick', 'pendingNs', 'clock', 'rooms', 'links', 'people', 'actor', 'inventory', 'initialInventory', 'metrics', 'eventSeq'], 'state');
  if (state.apiVersion !== API_VERSION) fail(`state.apiVersion must be ${API_VERSION}`);
  for (const key of ['seed', 'rngState']) number(state[key], 0, 0xffffffff, `state.${key}`, true);
  oneOf(state.difficulty, Object.keys(DIFFICULTIES), 'state.difficulty');
  oneOf(state.status, ['running', 'paused', 'won', 'lost'], 'state.status');
  if (state.reason !== null) oneOf(state.reason, ['complete', 'timeout', 'person-lost', 'structure'], 'state.reason');
  if ((['running', 'paused'].includes(state.status)) !== (state.reason === null)) fail('state.status and reason disagree');
  if (state.status === 'won' && state.reason !== 'complete') fail('won state requires complete reason');
  if (state.status === 'lost' && state.reason === 'complete') fail('lost state cannot have complete reason');
  number(state.tick, 0, 36000, 'state.tick', true); number(state.pendingNs, 0, 99999999.999999, 'state.pendingNs');
  number(state.eventSeq, 0, Number.MAX_SAFE_INTEGER, 'state.eventSeq', true);
  keys(state.clock, ['limit', 'elapsed', 'remaining'], 'state.clock');
  number(state.clock.limit, 10, 3600, 'state.clock.limit'); number(state.clock.elapsed, 0, state.clock.limit, 'state.clock.elapsed');
  if (state.clock.limit !== Math.round(state.clock.limit * 10) / 10) fail('state.clock.limit must be normalized to a multiple of 0.1');
  number(state.clock.remaining, 0, state.clock.limit, 'state.clock.remaining');
  if (Math.abs(state.clock.elapsed - state.tick / 10) > 1e-8 || Math.abs(state.clock.remaining + state.clock.elapsed - state.clock.limit) > 1e-8) fail('state clock does not match tick');
  list(state.rooms, 1, LIMITS.maxRooms, 'state.rooms'); list(state.links, 0, LIMITS.maxLinks, 'state.links'); list(state.people, 0, LIMITS.maxPeople, 'state.people');
  unique(state.rooms, 'state.rooms'); unique(state.links, 'state.links'); unique(state.people, 'state.people');
  for (const [i, link] of state.links.entries()) boolean(link.open, `state.links[${i}].open`);
  for (const [i, room] of state.rooms.entries()) {
    const path = `state.rooms[${i}]`;
    keys(room, ['id', 'floor', 'material', 'fireClass', 'initialFuel', 'fuel', 'heat', 'fire', 'smoke', 'oxygen', 'ventilation', 'exit', 'integrity', 'suppression'], path);
    id(room.id, `${path}.id`); number(room.floor, 0, LIMITS.maxFloors - 1, `${path}.floor`, true);
    oneOf(room.material, Object.keys(MATERIALS), `${path}.material`); oneOf(room.fireClass, FIRE_CLASSES, `${path}.fireClass`);
    number(room.initialFuel, 0, 200, `${path}.initialFuel`); number(room.fuel, 0, room.initialFuel, `${path}.fuel`);
    for (const field of ['heat', 'fire', 'smoke', 'oxygen', 'ventilation', 'integrity']) number(room[field], 0, 1, `${path}.${field}`);
    number(room.suppression, 0, 15, `${path}.suppression`); boolean(room.exit, `${path}.exit`);
  }
  // Reuse topology checks without confusing live fuel/temperature with definitions.
  validateBuilding({ rooms: state.rooms.map(({ id, floor, material, fireClass, fuel, heat, fire, smoke, oxygen, ventilation, exit }) => ({ id, floor, material, fireClass, fuel, heat, fire, smoke, oxygen, ventilation, exit })), links: state.links, people: state.people.map(({ id, roomId }) => ({ id, roomId })), startRoomId: state.rooms.find(room => room.exit)?.id }, true);
  const roomIds = new Set(state.rooms.map(room => room.id));
  keys(state.actor, ['roomId', 'travel', 'carrying', 'task'], 'state.actor');
  if (!roomIds.has(state.actor.roomId)) fail('state.actor.roomId is unknown');
  if (state.actor.travel !== null) {
    keys(state.actor.travel, ['from', 'to', 'linkId', 'remaining', 'total'], 'state.actor.travel');
    const travel = state.actor.travel;
    const link = state.links.find(link => link.id === travel.linkId);
    if (!link || !roomIds.has(travel.to) || travel.from !== state.actor.roomId || ![link.from, link.to].includes(travel.from) || ![link.from, link.to].includes(travel.to) || travel.from === travel.to) fail('state.actor.travel is invalid');
    number(travel.total, 0.1, 10, 'state.actor.travel.total'); number(travel.remaining, 0, travel.total, 'state.actor.travel.remaining');
  }
  if (state.actor.task !== null) {
    validateAction(state.actor.task);
    if (!['spray', 'rescue'].includes(state.actor.task.type)) fail('state.actor.task must be spray or rescue');
    if (state.actor.task.type === 'spray' && !roomIds.has(state.actor.task.roomId)) fail('state.actor.task.roomId is unknown');
    if (state.actor.task.type === 'rescue' && !state.people.some(person => person.id === state.actor.task.personId)) fail('state.actor.task.personId is unknown');
  }
  for (const [i, person] of state.people.entries()) {
    const path = `state.people[${i}]`;
    keys(person, ['id', 'roomId', 'health', 'status', 'progress'], path); id(person.id, `${path}.id`);
    if (!roomIds.has(person.roomId)) fail(`${path}.roomId is unknown`);
    oneOf(person.status, ['waiting', 'escorted', 'rescued', 'lost'], `${path}.status`);
    number(person.health, 0, 1, `${path}.health`); number(person.progress, 0, DIFFICULTIES[state.difficulty].rescueSeconds, `${path}.progress`);
    if ((person.status === 'lost') !== (person.health === 0)) fail(`${path}.health and status disagree`);
    if (person.status === 'rescued' && !state.rooms.find(room => room.id === person.roomId).exit) fail(`${path} rescued person must be at an exit`);
  }
  const escorted = state.people.filter(person => person.status === 'escorted');
  if (state.actor.carrying === null ? escorted.length !== 0 : escorted.length !== 1 || escorted[0].id !== state.actor.carrying || escorted[0].roomId !== state.actor.roomId) fail('state.actor.carrying and escorted people disagree');
  if (state.actor.task !== null) {
    if (state.actor.travel || state.actor.carrying) fail('active task cannot coexist with travel or carrying');
    if (state.actor.task.type === 'rescue') {
      const person = state.people.find(person => person.id === state.actor.task.personId);
      if (person.status !== 'waiting' || person.roomId !== state.actor.roomId) fail('active rescue must target a waiting person in the actor room');
    }
    if (state.actor.task.type === 'spray') {
      const targetId = state.actor.task.roomId;
      if (targetId !== state.actor.roomId && !state.links.some(link => link.open && link.type === 'door' && [link.from, link.to].includes(targetId) && [link.from, link.to].includes(state.actor.roomId))) fail('active spray target is out of range');
    }
  }
  for (const name of ['inventory', 'initialInventory']) {
    keys(state[name], Object.keys(EXTINGUISHERS), `state.${name}`);
    for (const agent of Object.keys(EXTINGUISHERS)) number(state[name][agent], 0, 1000, `state.${name}.${agent}`);
  }
  for (const agent of Object.keys(EXTINGUISHERS)) if (state.inventory[agent] > state.initialInventory[agent]) fail(`state.inventory.${agent} exceeds initial supply`);
  keys(state.metrics, ['agentUsed', 'agentWasted', 'usefulActions', 'extinguished', 'rescued', 'wrongAgentUses'], 'state.metrics');
  for (const key of ['agentUsed', 'agentWasted', 'usefulActions', 'extinguished', 'rescued', 'wrongAgentUses']) number(state.metrics[key], 0, 1000000, `state.metrics.${key}`, !['agentUsed', 'agentWasted'].includes(key));
  if (state.metrics.agentWasted > state.metrics.agentUsed + 1e-8) fail('state.metrics.agentWasted exceeds agentUsed');
  if (state.metrics.rescued !== state.people.filter(person => person.status === 'rescued').length) fail('state.metrics.rescued disagrees with people');
  return true;
}
