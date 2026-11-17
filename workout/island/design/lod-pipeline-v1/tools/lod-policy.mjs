// Policy only. No edits or coupling to any game's runtime.
export function selectLod(distanceMetres, profile, previous = null, hysteresis = 0.1) {
  if (!Number.isFinite(distanceMetres) || distanceMetres < 0) throw Error('Distance must be finite and nonnegative');
  const thresholds = profile.enterMetres;
  if (!Array.isArray(thresholds) || thresholds.length !== 3 || thresholds[0] !== 0 || !(thresholds[1] > 0 && thresholds[2] > thresholds[1])) throw Error('Expected three increasing thresholds');
  if (!(hysteresis >= 0 && hysteresis < 1)) throw Error('Invalid hysteresis');
  if (previous === null) return distanceMetres < thresholds[1] ? 0 : distanceMetres < thresholds[2] ? 1 : 2;
  if (![0, 1, 2].includes(previous)) throw Error('Invalid previous LOD');
  let next = previous;
  while (next < 2 && distanceMetres >= thresholds[next + 1] * (1 + hysteresis)) next++;
  while (next > 0 && distanceMetres < thresholds[next] * (1 - hysteresis)) next--;
  return next;
}
