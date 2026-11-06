/**
 * Presentation policy, not a basketball rules engine. Only the host's authoritative
 * possession feed may call authorizePossession(). Animation events never call it.
 * Epochs are monotonically increasing integers, including changes to another owner.
 */
export const DRIBBLE_STATES = Object.freeze(['dribble_idle', 'dribble_run', 'dribble_behind_back']);
export const PASS_STATES = Object.freeze(['pass_chest', 'pass_bounce', 'pass_overhead', 'pass_side', 'pass_jump']);
export const RECEIVE_STATES = Object.freeze(['receive_two_hands', 'receive_moving']);
export const STATE_IDS = Object.freeze(['idle', ...PASS_STATES, ...RECEIVE_STATES, ...DRIBBLE_STATES, 'stop_two_feet', 'pivot', 'shot_start', 'block', 'steal']);
const dribble = new Set(DRIBBLE_STATES);
const possessionActions = new Set([...PASS_STATES, ...DRIBBLE_STATES, 'stop_two_feet', 'pivot', 'shot_start']);

// Every edge is listed. There is deliberately no wildcard, implicit reset or
// clip-completed transition. Final poses remain held until the host requests one.
const next = {
  idle: [...RECEIVE_STATES, ...DRIBBLE_STATES, 'block', 'steal'],
  receive_two_hands: [...DRIBBLE_STATES, ...PASS_STATES, 'pivot', 'shot_start', 'receive_two_hands', 'receive_moving', 'idle'],
  receive_moving: [...DRIBBLE_STATES, ...PASS_STATES, 'stop_two_feet', 'pivot', 'shot_start', 'receive_two_hands', 'receive_moving', 'idle'],
  dribble_idle: [...DRIBBLE_STATES, ...PASS_STATES, 'stop_two_feet', 'shot_start'],
  dribble_run: [...DRIBBLE_STATES, ...PASS_STATES, 'stop_two_feet', 'shot_start'],
  dribble_behind_back: [...DRIBBLE_STATES, ...PASS_STATES, 'stop_two_feet', 'shot_start'],
  stop_two_feet: ['pivot', ...PASS_STATES, 'shot_start', ...RECEIVE_STATES, 'idle'],
  pivot: ['pivot', ...DRIBBLE_STATES, ...PASS_STATES, 'shot_start', ...RECEIVE_STATES, 'idle'],
  shot_start: [...RECEIVE_STATES, 'block', 'steal', 'idle'],
  block: ['block', 'steal', ...RECEIVE_STATES, 'idle'],
  steal: ['block', 'steal', ...RECEIVE_STATES, 'idle'],
};
for (const id of PASS_STATES) next[id] = [...RECEIVE_STATES, 'block', 'steal', 'idle'];

export const LEGAL_TRANSITIONS = Object.freeze(STATE_IDS.flatMap(from => next[from].map(to => Object.freeze({
  from, to,
  requiresPossession: possessionActions.has(to),
  requiresDribbleAvailable: dribble.has(to),
}))));
export const TRANSITION_GRAPH = Object.freeze(Object.fromEntries(STATE_IDS.map(id => [id, Object.freeze([...next[id]])])));

/** The conditional graph for a fixed possession context. After a stop it has no
 * dribble targets anywhere, including paths through pivot, receive and idle. */
export function effectiveTransitionGraph(context = {}) {
  const ownsBall = 'owner' in context ? context.owner === 'self' : context.hasPossession === true;
  return Object.freeze(Object.fromEntries(STATE_IDS.map(from => [from, Object.freeze(next[from].filter(to =>
    (!possessionActions.has(to) || ownsBall) && (!dribble.has(to) || !context.dribbleEnded)
  ))])));
}

function checkEpoch(epoch) {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new TypeError('Possession epoch must be a nonnegative safe integer');
}

export function createStateMachine({initialState = 'idle', possession} = {}) {
  if (!STATE_IDS.includes(initialState)) throw new RangeError(`Unknown initial state: ${initialState}`);
  // Starting on a dribble clip is not proof that the player owns the ball.
  let state = initialState;
  let epoch = -1;
  let owner = null;
  let started = false;
  let ended = initialState === 'stop_two_feet';
  const snapshot = () => Object.freeze({state, possessionEpoch: epoch < 0 ? null : epoch, owner,
    hasPossession: owner === 'self', dribbleStarted: started, dribbleEnded: ended});
  function authorizePossession(context) {
    if (!context || typeof context !== 'object') throw new TypeError('An authoritative possession context is required');
    checkEpoch(context.epoch);
    if (context.epoch <= epoch) throw new RangeError('Possession epoch must increase; a replay cannot clear the dribble lock');
    if (!['self', 'other', null].includes(context.owner)) throw new TypeError('Possession owner must be self, other or null');
    epoch = context.epoch;
    owner = context.owner;
    started = false;
    ended = false;
    return snapshot();
  }
  function canTransition(to) {
    if (!STATE_IDS.includes(to)) return Object.freeze({ok: false, reason: 'unknown-state'});
    if (!next[state].includes(to)) return Object.freeze({ok: false, reason: 'edge-not-listed'});
    if (possessionActions.has(to) && owner !== 'self') return Object.freeze({ok: false, reason: 'authoritative-possession-required'});
    if (dribble.has(to) && ended) return Object.freeze({ok: false, reason: 'dribble-ended-this-possession'});
    return Object.freeze({ok: true, reason: null});
  }
  function transition(to) {
    const result = canTransition(to);
    if (!result.ok) return Object.freeze({...result, ...snapshot()});
    // No presentation path may erase this latch. A catch, pass, idle or defensive
    // clip after a gather cannot imply a new possession, even indirectly.
    if (to === 'stop_two_feet' || (started && !dribble.has(to))) ended = true;
    if (dribble.has(to)) started = true;
    state = to;
    return Object.freeze({...result, ...snapshot()});
  }
  if (possession) authorizePossession(possession);
  started = dribble.has(initialState);
  ended = initialState === 'stop_two_feet';
  return Object.freeze({get state() {return state;}, get context() {return snapshot();}, snapshot,
    canTransition, transition, authorizePossession,
    effectiveGraph() {return effectiveTransitionGraph(snapshot());},
    // Events are available to presentation clients; this explicitly does not
    // mutate possession, dribble availability, state, score or game rules.
    handlePresentationEvent(event) {
      if (!event || event.domain !== 'presentation') throw new TypeError('Expected a presentation event');
      return snapshot();
    },
    legalNext() {return Object.freeze(next[state].map(to => Object.freeze({to, ...canTransition(to)})));},
  });
}
