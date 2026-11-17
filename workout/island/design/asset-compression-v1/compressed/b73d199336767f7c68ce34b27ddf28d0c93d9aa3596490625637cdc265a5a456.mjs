// Interpolate only presentation coordinates between two real fixed simulation states.
// Canonical positions, collisions, scoring and race timing stay in the engine snapshot.
export const dampWeight = (rate, seconds) => 1 - Math.exp(-rate * Math.max(0, seconds));
export function interpolateRider(previous, current, alpha) {
  if (!previous || previous.id !== current.id) return current;
  const a = Math.max(0, Math.min(1, alpha));
  const frame = {...current};
  for (const key of ['s','x','z','height','lean']) if (Number.isFinite(previous[key]) && Number.isFinite(current[key])) frame[key] = previous[key] + (current[key] - previous[key]) * a;
  if (previous.trick?.id === current.trick?.id && current.trick) frame.trick = {...current.trick, progress: previous.trick.progress + (current.trick.progress - previous.trick.progress) * a};
  return frame;
}
export function presentationFrame(state, fixedStep = 1 / 60, presentation = state.presentation) {
  const p = presentation;
  if (state.phase !== 'racing' || !p?.previousPlayer || !Number.isFinite(p.alpha)) return state;
  const alpha = Math.max(0, Math.min(1, p.alpha));
  return {...state,
    timeMs: Math.max(0, state.timeMs - (1 - alpha) * fixedStep * 1000),
    player: interpolateRider(p.previousPlayer, state.player, alpha),
    rivals: (state.rivals || []).map(r => interpolateRider(p.previousRivals?.find(previous => previous.id === r.id), r, alpha)),
  };
}
