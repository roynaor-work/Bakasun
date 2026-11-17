import { createGame, EXTINGUISHERS, getAvailableActions, step } from '../src/index.mjs';

export function advance(state, seconds, action = null, chunk = 1) {
  const events = [];
  let left = seconds, nextAction = action;
  while (left > 1e-8 && ['running', 'paused'].includes(state.status)) {
    const transition = step(state, nextAction, Math.min(chunk, left));
    state = transition.state; events.push(...transition.events);
    nextAction = null; left -= chunk;
  }
  return { state, events };
}

export function fixture({ material = 'wood', fireClass, open = true, upper = false, people = true, sourceFire = 0.6, sourceHeat = 0.8, ventilation = 0.4 } = {}) {
  return {
    rooms: [
      { id: 'exit', floor: 0, material: 'concrete', exit: true },
      { id: 'source', floor: 0, material, ...(fireClass ? { fireClass } : {}), fire: sourceFire, heat: sourceHeat, ventilation },
      { id: 'target', floor: upper ? 1 : 0, material: 'wood', ventilation },
    ],
    links: [
      { id: 'entry', from: 'exit', to: 'source', type: 'door', open: true },
      { id: 'spread', from: 'source', to: 'target', type: upper ? 'stairs' : 'door', open },
    ],
    people: people ? [{ id: 'person', roomId: 'target' }] : [], startRoomId: 'exit',
  };
}

function pathTo(state, target) {
  const queue = [[state.actor.roomId]], seen = new Set(queue[0]);
  while (queue.length) {
    const path = queue.shift(), current = path.at(-1);
    if (current === target) return path.slice(1);
    for (const link of state.links.filter(link => link.open && [link.from, link.to].includes(current))) {
      const next = link.from === current ? link.to : link.from;
      if (!seen.has(next)) { queue.push([...path, next]); seen.add(next); }
    }
  }
  throw new Error(`No route to ${target}`);
}

/** Deliberately simple child strategy: inspect class, spray from each landing,
 * then walk to each person, wait for pickup, walk back to the exit. Every command
 * goes through the public reducer. It never changes a snapshot or RNG. */
export function playPatiently(seed, difficulty, { thinkingSeconds = 0.5, frameSeconds = 0.5 } = {}) {
  let state = createGame({ seed, difficulty });
  const events = [];
  const perform = (seconds, action = null) => {
    const next = advance(state, seconds, action, frameSeconds);
    state = next.state; events.push(...next.events);
  };
  const moveTo = target => {
    for (const roomId of pathTo(state, target)) {
      perform(thinkingSeconds, { type: 'wait' });
      perform(0, null);
      const next = step(state, { type: 'move', roomId }, 0); state = next.state; events.push(...next.events);
      if (!state.actor.travel) throw new Error(`Travel rejected: ${JSON.stringify({ events: next.events, target: state.rooms.find(room => room.id === roomId), inventory: state.inventory })}`);
      while (state.actor.travel && state.status === 'running') perform(frameSeconds);
    }
  };
  for (let floor = 0; floor < Math.max(...state.rooms.map(room => room.floor)) + 1; floor += 1) {
    moveTo(`landing-${floor}`);
    for (const id of state.rooms.filter(room => room.floor === floor && room.fire > 0).map(room => room.id)) {
      const target = state.rooms.find(room => room.id === id);
      const agent = Object.keys(EXTINGUISHERS).sort((a, b) => EXTINGUISHERS[b].efficacy[target.fireClass] - EXTINGUISHERS[a].efficacy[target.fireClass])[0];
      perform(thinkingSeconds, { type: 'wait' });
      const start = step(state, { type: 'spray', roomId: id, agent }, 0); state = start.state; events.push(...start.events);
      while (state.actor.task && state.status === 'running') perform(frameSeconds);
    }
  }
  for (const id of state.people.map(person => person.id)) {
    const person = state.people.find(person => person.id === id);
    moveTo(person.roomId);
    perform(thinkingSeconds, { type: 'wait' });
    const action = getAvailableActions(state).find(action => action.type === 'rescue' && action.personId === id);
    if (!action) throw new Error(`No safe rescue: ${JSON.stringify(state)}`);
    const next = step(state, action, 0); state = next.state; events.push(...next.events);
    while (!state.actor.carrying && state.status === 'running') perform(frameSeconds);
    moveTo('landing-0');
  }
  perform(1);
  return { state, events };
}
