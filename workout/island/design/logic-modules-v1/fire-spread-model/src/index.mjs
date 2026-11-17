import { API_VERSION, DIFFICULTIES, EXTINGUISHERS, LIMITS, MATERIALS, TICK_SECONDS, nextRandom } from './catalog.mjs';
import { fail, keys, number, oneOf, validateAction, validateBuilding, validateState } from './validation.mjs';
export { API_VERSION, DIFFICULTIES, EXTINGUISHERS, FIRE_CLASSES, LIMITS, MATERIALS, TICK_SECONDS, nextRandom } from './catalog.mjs';
export { validateState } from './validation.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const roomById = (state, id) => state.rooms.find(room => room.id === id);
const otherEnd = (link, id) => link.from === id ? link.to : link.from;
const touching = (link, id) => link.from === id || link.to === id;
const safeToEnter = room => room.fire <= 0.35 && room.heat <= 0.78;
const safeToRescue = room => room.fire <= 0.12 && room.heat <= 0.65 && room.smoke <= 0.8;
const isTerminal = state => state.status === 'won' || state.status === 'lost';

function emit(state, events, type, detail = {}) {
  state.eventSeq += 1;
  events.push({ id: state.eventSeq, type, tick: state.tick, time: state.tick / 10, ...detail });
}
function draw(state) {
  const next = nextRandom(state.rngState); state.rngState = next.state; return next.value;
}

function generateBuilding(random, difficulty) {
  const settings = DIFFICULTIES[difficulty];
  const rooms = [], links = [], people = [], candidates = [];
  const materials = ['wood', 'fabric', 'liquid', 'electrical', 'cookingOil'];
  for (let floor = 0; floor < settings.floors; floor += 1) {
    const landing = `landing-${floor}`;
    rooms.push({ id: landing, floor, material: 'concrete', exit: floor === 0, ventilation: floor === 0 ? 0.85 : 0.35 });
    if (floor > 0) links.push({ id: `stairs-${floor}`, from: `landing-${floor - 1}`, to: landing, type: 'stairs', open: true });
    for (let side = 0; side < 2; side += 1) {
      const id = `room-${floor}-${side}`;
      rooms.push({ id, floor, material: materials[Math.floor(random() * materials.length)], ventilation: 0.25 + random() * 0.3 });
      links.push({ id: `door-${floor}-${side}`, from: landing, to: id, type: 'door', open: true });
      candidates.push(id);
    }
    people.push({ id: `person-${floor}`, roomId: `room-${floor}-${Math.floor(random() * 2)}` });
  }
  // At least one actual fire on each floor, with a fourth on hard. No fire starts
  // in a stairwell; a patient player can reach every floor at the start.
  const selected = [];
  for (let floor = 0; floor < settings.floors; floor += 1) selected.push(`room-${floor}-${Math.floor(random() * 2)}`);
  while (selected.length < settings.fires) {
    const available = candidates.filter(id => !selected.includes(id));
    selected.push(available[Math.floor(random() * available.length)]);
  }
  for (const id of selected) {
    const room = rooms.find(room => room.id === id);
    room.fire = 0.35 + random() * 0.12; room.heat = 0.6 + random() * 0.08;
  }
  return { rooms, links, people, startRoomId: 'landing-0' };
}

/** Create an independent, mutable-by-caller JSON value; all reducers clone it. */
export function createGame(options = {}) {
  keys(options, ['seed', 'difficulty', 'building', 'timeLimit', 'inventory'], 'options');
  const seed = options.seed === undefined ? 1 : options.seed, difficulty = options.difficulty === undefined ? 'normal' : options.difficulty;
  number(seed, 0, 0xffffffff, 'options.seed', true); oneOf(difficulty, Object.keys(DIFFICULTIES), 'options.difficulty');
  let rngState = seed;
  const random = () => { const next = nextRandom(rngState); rngState = next.state; return next.value; };
  const building = options.building === undefined ? generateBuilding(random, difficulty) : options.building;
  validateBuilding(building);
  const requestedLimit = options.timeLimit === undefined ? DIFFICULTIES[difficulty].seconds : options.timeLimit;
  number(requestedLimit, 10, 3600, 'options.timeLimit');
  if (Math.abs(requestedLimit * 10 - Math.round(requestedLimit * 10)) > 1e-8) fail('options.timeLimit must be a multiple of 0.1 seconds');
  const timeLimit = Math.round(requestedLimit * 10) / 10;
  if (options.inventory !== undefined) {
    keys(options.inventory, Object.keys(EXTINGUISHERS), 'options.inventory');
    for (const [agent, amount] of Object.entries(options.inventory)) number(amount, 0, 1000, `options.inventory.${agent}`);
  }
  const inventory = Object.fromEntries(Object.entries(EXTINGUISHERS).map(([name, value]) => [name, options.inventory?.[name] ?? value.capacity * DIFFICULTIES[difficulty].resources]));
  const state = {
    apiVersion: API_VERSION, seed, rngState, difficulty, status: 'running', reason: null, tick: 0, pendingNs: 0,
    clock: { limit: timeLimit, elapsed: 0, remaining: timeLimit },
    rooms: building.rooms.map(room => ({
      id: room.id, floor: room.floor, material: room.material, fireClass: room.fireClass ?? MATERIALS[room.material].fireClass,
      initialFuel: room.fuel ?? MATERIALS[room.material].fuel, fuel: room.fuel ?? MATERIALS[room.material].fuel,
      heat: room.heat ?? ((room.fire ?? 0) > 0 ? 0.65 : 0.08), fire: room.fire ?? 0,
      smoke: room.smoke ?? 0, oxygen: room.oxygen ?? 1, ventilation: room.ventilation ?? 0.35,
      exit: room.exit ?? false, integrity: 1, suppression: 0,
    })),
    links: building.links.map(link => ({ ...link, open: link.open ?? true })),
    people: building.people.map(person => ({ id: person.id, roomId: person.roomId, health: person.health ?? 1, status: 'waiting', progress: 0 })),
    actor: { roomId: building.startRoomId, travel: null, carrying: null, task: null },
    inventory, initialInventory: { ...inventory },
    metrics: { agentUsed: 0, agentWasted: 0, usefulActions: 0, extinguished: 0, rescued: 0, wrongAgentUses: 0 }, eventSeq: 0,
  };
  validateState(state);
  return state;
}

function canReachSpray(state, target) {
  if (state.actor.travel) return false;
  if (state.actor.roomId === target.id) return true;
  return state.links.some(link => link.open && link.type === 'door' && touching(link, state.actor.roomId) && otherEnd(link, state.actor.roomId) === target.id);
}
function stopTask(state) {
  if (state.actor.task?.type === 'rescue') {
    const person = state.people.find(person => person.id === state.actor.task.personId);
    if (person?.status === 'waiting') person.progress = 0;
  }
  state.actor.task = null;
}
function reject(state, events, action, code) { emit(state, events, 'action-rejected', { action: action.type, code }); }
function command(state, action, events) {
  if (action === null || isTerminal(state)) return;
  if (action.type === 'pause') {
    if (state.status === 'running') { state.status = 'paused'; emit(state, events, 'paused'); }
    return;
  }
  if (action.type === 'resume') {
    if (state.status === 'paused') { state.status = 'running'; emit(state, events, 'resumed'); }
    return;
  }
  if (state.status === 'paused') { reject(state, events, action, 'paused'); return; }
  if (action.type === 'wait') { stopTask(state); return; }
  if (state.actor.travel) { reject(state, events, action, 'travelling'); return; }
  if (action.type === 'door') {
    const link = state.links.find(link => link.id === action.linkId);
    if (!link) { reject(state, events, action, 'unknown-link'); return; }
    if (!touching(link, state.actor.roomId)) { reject(state, events, action, 'out-of-reach'); return; }
    if (link.type !== 'door') { reject(state, events, action, 'not-a-door'); return; }
    if (link.open !== action.open) {
      link.open = action.open; emit(state, events, 'door-changed', { linkId: link.id, open: link.open });
      if (state.actor.task?.type === 'spray' && !canReachSpray(state, roomById(state, state.actor.task.roomId))) stopTask(state);
    }
    return;
  }
  if (action.type === 'move') {
    const destination = roomById(state, action.roomId);
    if (!destination) { reject(state, events, action, 'unknown-room'); return; }
    if (destination.id === state.actor.roomId) return;
    const link = state.links.find(link => touching(link, state.actor.roomId) && otherEnd(link, state.actor.roomId) === destination.id);
    if (!link) { reject(state, events, action, 'not-adjacent'); return; }
    if (!link.open) { reject(state, events, action, 'closed-door'); return; }
    if (!safeToEnter(destination)) { reject(state, events, action, 'unsafe-entry'); return; }
    stopTask(state);
    const total = (link.type === 'stairs' ? 2.5 : 1.2) * (state.actor.carrying ? 1.4 : 1);
    state.actor.travel = { from: state.actor.roomId, to: destination.id, linkId: link.id, remaining: total, total };
    emit(state, events, 'travel-started', { from: state.actor.roomId, to: destination.id, seconds: total }); return;
  }
  if (action.type === 'spray') {
    const target = roomById(state, action.roomId);
    if (!target) { reject(state, events, action, 'unknown-room'); return; }
    if (state.actor.carrying) { reject(state, events, action, 'carrying-person'); return; }
    if (!canReachSpray(state, target)) { reject(state, events, action, 'out-of-range'); return; }
    if (state.inventory[action.agent] <= 0) { reject(state, events, action, 'empty-agent'); return; }
    if (JSON.stringify(state.actor.task) === JSON.stringify(action)) return;
    stopTask(state); state.actor.task = { ...action };
    const efficacy = EXTINGUISHERS[action.agent].efficacy[target.fireClass];
    if (efficacy < 0.4) { state.metrics.wrongAgentUses += 1; emit(state, events, 'agent-mismatch', { roomId: target.id, agent: action.agent, fireClass: target.fireClass, efficacy }); }
    emit(state, events, 'spray-started', { roomId: target.id, agent: action.agent, efficacy }); return;
  }
  if (action.type === 'rescue') {
    const person = state.people.find(person => person.id === action.personId);
    if (!person) { reject(state, events, action, 'unknown-person'); return; }
    if (person.status !== 'waiting') { reject(state, events, action, 'person-unavailable'); return; }
    if (state.actor.carrying) { reject(state, events, action, 'carrying-person'); return; }
    if (person.roomId !== state.actor.roomId) { reject(state, events, action, 'out-of-reach'); return; }
    if (!safeToRescue(roomById(state, person.roomId))) { reject(state, events, action, 'unsafe-rescue'); return; }
    if (state.actor.task?.type === 'rescue' && state.actor.task.personId === person.id) return;
    stopTask(state); state.actor.task = { ...action }; emit(state, events, 'rescue-started', { personId: person.id });
  }
}

function updateActor(state, events) {
  const dt = TICK_SECONDS;
  if (state.actor.travel) {
    const travel = state.actor.travel;
    travel.remaining = Math.max(0, travel.remaining - dt);
    if (travel.remaining <= 1e-9) {
      // Hazards are checked again at arrival. Aborting returns to the origin,
      // so a delayed frame never deposits the actor inside an unsafe room.
      if (safeToEnter(roomById(state, travel.to))) {
        state.actor.roomId = travel.to;
        if (state.actor.carrying) state.people.find(person => person.id === state.actor.carrying).roomId = travel.to;
        emit(state, events, 'arrived', { roomId: travel.to });
      } else emit(state, events, 'travel-blocked', { roomId: travel.to, code: 'unsafe-entry' });
      state.actor.travel = null;
    }
  }
  const task = state.actor.task;
  if (task?.type === 'spray') {
    const target = roomById(state, task.roomId), agent = EXTINGUISHERS[task.agent];
    if (!canReachSpray(state, target)) { stopTask(state); emit(state, events, 'spray-stopped', { code: 'out-of-range' }); return; }
    const amount = Math.min(state.inventory[task.agent], agent.usePerSecond * dt);
    const efficacy = agent.efficacy[target.fireClass];
    const useful = (target.fire > 0 || target.heat > 0.28 || target.smoke > 0.6) && efficacy >= 0.4;
    state.inventory[task.agent] = Math.max(0, state.inventory[task.agent] - amount);
    state.metrics.agentUsed += amount;
    if (!useful) state.metrics.agentWasted += amount; else state.metrics.usefulActions += 1;
    const effectiveDt = amount / agent.usePerSecond;
    target.fire = clamp(target.fire - 0.13 * efficacy * effectiveDt);
    target.heat = clamp(target.heat - 0.16 * efficacy * effectiveDt);
    target.smoke = clamp(target.smoke - 0.13 * efficacy * effectiveDt);
    if (efficacy >= 0.4) target.suppression = Math.min(15, target.suppression + 3 * effectiveDt);
    if (task.agent === 'water' && ['B', 'E', 'F'].includes(target.fireClass) && target.fire > 0) {
      target.fire = clamp(target.fire + 0.035 * effectiveDt); target.heat = clamp(target.heat + 0.02 * effectiveDt);
    }
    if (state.inventory[task.agent] <= 1e-9) { state.inventory[task.agent] = 0; stopTask(state); emit(state, events, 'agent-empty', { agent: task.agent }); }
    else if (target.fire === 0 && target.heat <= 0.28 && target.smoke <= 0.6) { stopTask(state); emit(state, events, 'spray-stopped', { roomId: target.id, code: 'cooled' }); }
  }
  if (task?.type === 'rescue') {
    const person = state.people.find(person => person.id === task.personId);
    if (person.status !== 'waiting' || !safeToRescue(roomById(state, person.roomId))) { stopTask(state); emit(state, events, 'rescue-interrupted', { personId: person.id }); return; }
    person.progress = Math.min(DIFFICULTIES[state.difficulty].rescueSeconds, person.progress + dt);
    if (person.progress >= DIFFICULTIES[state.difficulty].rescueSeconds - 1e-9) {
      person.progress = DIFFICULTIES[state.difficulty].rescueSeconds;
      person.status = 'escorted'; state.actor.carrying = person.id; state.actor.task = null;
      state.metrics.usefulActions += 1; emit(state, events, 'person-picked-up', { personId: person.id });
    }
  }
  if (state.actor.carrying && roomById(state, state.actor.roomId).exit && !state.actor.travel) {
    const person = state.people.find(person => person.id === state.actor.carrying);
    person.status = 'rescued'; state.actor.carrying = null; state.metrics.rescued += 1;
    emit(state, events, 'person-rescued', { personId: person.id, roomId: person.roomId });
  }
}

function updatePhysics(state, events, burningBefore) {
  const dt = TICK_SECONDS, settings = DIFFICULTIES[state.difficulty];
  const flux = state.rooms.map(() => ({ heat: 0, smoke: 0, oxygen: 0 }));
  const indices = new Map(state.rooms.map((room, index) => [room.id, index]));
  // All connections read the same pre-flux rooms, avoiding iteration-order bias.
  for (const link of state.links) {
    const ai = indices.get(link.from), bi = indices.get(link.to), a = state.rooms[ai], b = state.rooms[bi];
    const opening = link.open ? 1 : 0.025;
    for (const [key, exchange] of [['heat', link.type === 'stairs' ? 0.045 : 0.012], ['smoke', 0.11], ['oxygen', 0.12]]) {
      const transfer = (a[key] - b[key]) * exchange * opening;
      flux[ai][key] -= transfer; flux[bi][key] += transfer;
    }
    // Hot gases rise through open stairs. Doors transmit much less heat closed.
    if (link.type === 'stairs' && link.open) {
      const lo = a.floor < b.floor ? ai : bi, hi = lo === ai ? bi : ai;
      const low = state.rooms[lo];
      flux[hi].heat += low.fire * 0.07 + low.heat * 0.012;
      flux[lo].heat -= low.heat * 0.006;
      flux[hi].smoke += low.smoke * 0.065; flux[lo].smoke -= low.smoke * 0.045;
    } else {
      flux[ai].heat += b.fire * 0.005 * opening; flux[bi].heat += a.fire * 0.005 * opening;
    }
  }
  for (const [index, room] of state.rooms.entries()) {
    const material = MATERIALS[room.material], exchange = flux[index];
    const jitter = 0.94 + draw(state) * 0.12;
    room.oxygen = clamp(room.oxygen + (exchange.oxygen + (1 - room.oxygen) * room.ventilation * 0.075 - room.fire * 0.055) * dt);
    room.smoke = clamp(room.smoke + (exchange.smoke + room.fire * material.smoke - room.smoke * room.ventilation * 0.045) * dt);
    room.heat = clamp(room.heat + (exchange.heat + room.fire * 0.055 - (room.heat - 0.08) * (0.012 + room.ventilation * 0.008)) * dt);
    room.suppression = Math.max(0, room.suppression - dt);
    if (room.fire > 0) {
      const consumed = Math.min(room.fuel, material.burn * room.fire * room.oxygen * dt);
      room.fuel = Math.max(0, room.fuel - consumed);
      room.fire = clamp(room.fire + (0.022 * material.growth * settings.growth * room.oxygen * jitter - room.suppression * 0.004 - Math.max(0, 0.3 - room.oxygen) * 0.24) * dt);
      room.integrity = clamp(room.integrity - room.fire * room.heat * 0.0016 * dt);
      if (room.fuel === 0 || (room.fire < 0.025 && room.heat < 0.4)) room.fire = 0;
    } else if (room.fuel > 0 && room.heat >= material.ignition && room.oxygen >= 0.25 && room.suppression === 0) {
      room.fire = 0.1 + jitter * 0.035;
      emit(state, events, 'fire-ignited', { roomId: room.id, floor: room.floor, fireClass: room.fireClass });
    }
    if (burningBefore.has(room.id) && room.fire === 0) {
      state.metrics.extinguished += 1;
      emit(state, events, 'fire-extinguished', { roomId: room.id, cause: room.fuel === 0 ? 'fuel-exhausted' : 'cooled' });
    }
  }
}

function updatePeople(state, events) {
  for (const person of state.people) {
    if (person.status !== 'waiting') continue;
    const room = roomById(state, person.roomId);
    const harm = room.smoke * 0.0035 + room.fire * 0.0025 + Math.max(0, room.heat - 0.65) * 0.002;
    person.health = clamp(person.health - harm * TICK_SECONDS);
    if (person.health === 0) {
      person.status = 'lost'; person.progress = 0;
      if (state.actor.task?.type === 'rescue' && state.actor.task.personId === person.id) stopTask(state);
      emit(state, events, 'person-lost', { personId: person.id });
    }
  }
}

function finishIfNeeded(state, events) {
  let reason = null, status = 'lost';
  const structure = state.rooms.reduce((sum, room) => sum + room.integrity, 0) / state.rooms.length;
  if (state.people.some(person => person.status === 'lost')) reason = 'person-lost';
  else if (structure <= 0.48) reason = 'structure';
  else if (state.rooms.every(room => room.fire === 0 && room.heat < MATERIALS[room.material].ignition) && state.people.every(person => person.status === 'rescued') && state.metrics.usefulActions > 0) { reason = 'complete'; status = 'won'; }
  else if (state.clock.remaining <= 0) reason = 'timeout';
  if (reason !== null) {
    state.status = status; state.reason = reason; state.pendingNs = 0; stopTask(state);
    emit(state, events, 'game-ended', { outcome: status, reason });
  }
}

/** Advance a serialized snapshot. Commands persist; null means continue. */
export function step(input, action = null, seconds = TICK_SECONDS) {
  validateState(input); validateAction(action); number(seconds, 0, LIMITS.maxStepSeconds, 'seconds');
  const state = clone(input), events = [];
  command(state, action, events);
  if (state.status === 'running') {
    const ns = state.pendingNs + seconds * 1e9;
    const ticks = Math.floor((ns + 0.0001) / 100000000);
    const remainder = ns - ticks * 100000000;
    state.pendingNs = Math.abs(remainder) < 0.0001 ? 0 : Number(remainder.toFixed(6));
    for (let count = 0; count < ticks && state.status === 'running'; count += 1) {
      state.tick += 1; state.clock.elapsed = state.tick / 10;
      state.clock.remaining = Math.max(0, state.clock.limit - state.clock.elapsed);
      const burningBefore = new Set(state.rooms.filter(room => room.fire > 0).map(room => room.id));
      updateActor(state, events); updatePhysics(state, events, burningBefore); updatePeople(state, events); finishIfNeeded(state, events);
    }
  }
  return { state, events, result: getResultUnchecked(state) };
}

function getResultUnchecked(state) {
  if (!isTerminal(state)) return null;
  const structure = state.rooms.reduce((sum, room) => sum + room.integrity, 0) / state.rooms.length;
  const efficiency = state.metrics.agentUsed === 0 ? 1 : 1 - state.metrics.agentWasted / state.metrics.agentUsed;
  const stars = state.status === 'lost' ? 1 : (state.clock.remaining >= state.clock.limit * 0.35 && structure >= 0.8 && efficiency >= 0.75 ? 3 : 2);
  return { apiVersion: API_VERSION, outcome: state.status, reason: state.reason, stars, elapsed: state.clock.elapsed, rescued: state.metrics.rescued, people: state.people.length, extinguished: state.metrics.extinguished, structure, agentUsed: state.metrics.agentUsed, efficiency };
}

/** Detached result; null until the mission ends. */
export function getResult(state) { validateState(state); return getResultUnchecked(state); }
/** Detached, validated JSON snapshot for adapters, saving and replay. */
export function snapshot(state) { validateState(state); return clone(state); }

/** Read-only affordances for a UI. Availability never executes an action. */
export function getAvailableActions(state) {
  validateState(state);
  if (isTerminal(state)) return [];
  if (state.status === 'paused') return [{ type: 'resume' }];
  const actions = [{ type: 'pause' }, { type: 'wait' }];
  if (state.actor.travel) return actions;
  for (const link of state.links.filter(link => touching(link, state.actor.roomId))) {
    const target = roomById(state, otherEnd(link, state.actor.roomId));
    if (link.type === 'door') actions.push({ type: 'door', linkId: link.id, open: !link.open });
    if (link.open && safeToEnter(target)) actions.push({ type: 'move', roomId: target.id });
  }
  if (!state.actor.carrying) {
    for (const room of state.rooms.filter(room => canReachSpray(state, room))) {
      for (const agent of Object.keys(EXTINGUISHERS)) if (state.inventory[agent] > 0 && (room.fire > 0 || room.heat > 0.28 || room.smoke > 0.6)) actions.push({ type: 'spray', roomId: room.id, agent });
    }
    for (const person of state.people) if (person.status === 'waiting' && person.roomId === state.actor.roomId && safeToRescue(roomById(state, person.roomId))) actions.push({ type: 'rescue', personId: person.id });
  }
  return actions;
}
