/** Finite presentation graph. Contact-aligned exits do not author game rules. */
import {clips, transitions, initial} from './catalog.mjs';
const byId = new Map(clips.map(c => [c.id, c]));
const idle = byId.has('idle_relaxed') ? 'idle_relaxed' : initial;
const ready = byId.has('goalkeeper_ready') ? 'goalkeeper_ready' : clips.find(c => c.role === 'keeper')?.id;
const movement = new Set(['walk','jog','run','sprint','run_backward','run_lateral','dribble_fast']);
const generated = [];
function add(from, to, trigger, extra = {}) {
  if (from !== to && byId.has(from) && byId.has(to)) generated.push({from, to, trigger, blend: .16, earliest: 0, ...extra});
}
for (const clip of clips) {
  const home = clip.role === 'keeper' ? ready : idle;
  if (clip.id !== home) {
    add(home, clip.id, `play:${clip.id}`);
    add(clip.id, home, clip.loop ? 'stop' : 'finished', {earliest: clip.loop ? 0 : Math.max(0, clip.duration - .18), latest: clip.duration});
  }
  if (clip.role === 'field' && clip.id !== 'slide_miss' && clip.id !== 'quick_getup') {
    for (const from of movement) add(from, clip.id, `play:${clip.id}`, {align: 'plant'});
    if (!clip.loop) add(clip.id, 'run', 'move', {earliest: Math.max(0, clip.duration - .2), latest: clip.duration});
  }
}
for (const from of movement) for (const to of movement) add(from, to, `move:${to}`, {align: 'plant'});
add('run', 'run_brake', 'stop', {blend: 0, align: 'plant', alignBone: 'LeftFoot', matchPhase: 0, preserveVelocity: true});
add('sprint', 'run_brake', 'stop', {blend: .12, align: 'plant'});
add('slide_miss', 'quick_getup', 'recover', {earliest: byId.get('slide_miss')?.duration || 0, blend: .12});
add('quick_getup', idle, 'finished', {earliest: Math.max(0, (byId.get('quick_getup')?.duration || 0) - .15)});
add('goalkeeper_getup', ready, 'finished', {earliest: Math.max(0, (byId.get('goalkeeper_getup')?.duration || 0) - .15)});
// Explicit authored edges supersede generic edges with the same trigger.
const edges = new Map();
for (const edge of [...generated, ...(transitions || [])]) {
  // A missed tackle finishes on the turf. Every exit must pass through the
  // authored recovery clip before another standing or running action.
  if (edge.from === 'slide_miss' && edge.to !== 'quick_getup') continue;
  if (['run', 'sprint'].includes(edge.from) && edge.to === idle && edge.trigger === 'stop') continue;
  const phase = edge.from === 'run' && edge.to === 'run_brake' ?
    {align: 'plant', alignBone: 'LeftFoot', blend: 0, matchPhase: 0, preserveVelocity: true} : {};
  const key = `${edge.from}|${edge.to}|${edge.trigger}`;
  edges.set(key, Object.freeze({...edges.get(key), ...edge, ...phase}));
}
export const LEGAL_TRANSITIONS = Object.freeze([...edges.values()]);
export const TRANSITION_GRAPH = Object.freeze(Object.fromEntries(clips.map(c => [c.id, Object.freeze([...new Set(LEGAL_TRANSITIONS.filter(e => e.from === c.id).map(e => e.to))])])));
export function createStateMachine(options = {}) {
  if (typeof options === 'string') options = {initialState: options};
  let state = options.initialState || idle, time = 0, elapsed = 0, lastTick = 0, cycleOffset = 0, queued = null;
  if (!byId.has(state)) throw new RangeError(`Unknown initial state ${state}`);
  const snapshot = () => Object.freeze({state, time, elapsed, queued: queued ? {...queued} : null});
  const find = (to, trigger) => LEGAL_TRANSITIONS.find(e => e.from === state && e.to === to && (!trigger || e.trigger === trigger));
  function canTransition(to, {trigger, at = time} = {}) {
    if (!byId.has(to)) return {ok: false, reason: 'unknown-state'};
    if (!Number.isFinite(at) || at < 0) return {ok: false, reason: 'invalid-time'};
    const edge = find(to, trigger);
    if (!edge) return {ok: false, reason: 'edge-not-listed'};
    const duration = byId.get(state).duration, phase = byId.get(state).loop && at > duration ? at % duration : at;
    if (phase + 1e-7 < (edge.earliest || 0) || (edge.latest != null && phase > edge.latest + 1e-7)) return {ok: false, reason: 'outside-transition-window', edge};
    return {ok: true, reason: null, edge};
  }
  function transition(to, request = {}) {
    const result = canTransition(to, request);
    if (!result.ok) return Object.freeze({...result, ...snapshot()});
    if (result.edge.align === 'plant' && !request.aligned) {
      const clip = byId.get(state), requested = request.at ?? time;
      const absolute = request.at == null ? elapsed : requested + (requested <= clip.duration ? cycleOffset : 0);
      const cycle = clip.loop ? Math.floor(absolute / clip.duration) : 0, phase = clip.loop ? absolute - cycle * clip.duration : absolute;
      time = requested; elapsed = absolute; lastTick = time; cycleOffset = absolute - time;
      const plants = clip.events.filter(e => e.type === 'plant' && (!result.edge.alignBone || e.bone === result.edge.alignBone)).map(e => e.time).sort((a, b) => a - b);
      const next = plants.find(t => t + 1e-7 >= phase);
      queued = {to, at: cycle * clip.duration + (next ?? (clip.loop ? clip.duration + (plants[0] || 0) : clip.duration)), trigger: request.trigger};
      return Object.freeze({...result, pending: true, ...snapshot()});
    }
    const from = state; state = to; time = result.edge.matchPhase || 0; elapsed = time; lastTick = time; cycleOffset = 0; queued = null;
    return Object.freeze({...result, from, pending: false, ...snapshot()});
  }
  function tick(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError('Playback time must be finite and nonnegative');
    // A normal AnimationMixer player reports a local time that wraps each
    // loop. Hosts may also report monotonic elapsed time. Both advance the
    // same absolute queue; a backwards local tick on a loop means a wrap.
    const clip = byId.get(state);
    if (clip.loop && seconds + 1e-7 < lastTick && seconds <= clip.duration && lastTick <= clip.duration) cycleOffset += clip.duration;
    if (!clip.loop || seconds > clip.duration) cycleOffset = 0;
    time = seconds; elapsed = seconds + cycleOffset; lastTick = seconds;
    if (queued && elapsed + 1e-7 >= queued.at) {
      const overshoot = elapsed - queued.at > 1e-7 ? elapsed - queued.at : 0;
      const result = transition(queued.to, {trigger: queued.trigger, at: Math.min(seconds, byId.get(state).duration), aligned: true});
      if (result.ok) {time = Math.min(byId.get(state).duration, time + overshoot); elapsed = time; lastTick = time;}
      return Object.freeze({...result, ...snapshot(), overshoot});
    }
    return snapshot();
  }
  return Object.freeze({get state() {return state;}, get time() {return time;}, snapshot, canTransition, transition, tick,
    request(trigger) {const edge = LEGAL_TRANSITIONS.find(e => e.from === state && e.trigger === trigger); return edge ? transition(edge.to, {trigger}) : Object.freeze({ok: false, reason: 'trigger-not-listed', ...snapshot()});},
    legalNext() {return LEGAL_TRANSITIONS.filter(e => e.from === state).map(e => ({...e, ...canTransition(e.to, {trigger: e.trigger})}));},
    cancel() {queued = null; return snapshot();},
  });
}
