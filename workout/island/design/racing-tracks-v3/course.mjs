export const trackIds = ['neon-quay', 'red-mesa', 'saltwater-bay', 'cloud-pass', 'cedar-bend', 'frostline'];

export const wrapDistance = (s, length) => ((s % length) + length) % length;
export const smoothstep = (t) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

export function inRange(s, { from, to }, length) {
  return wrapDistance(s - from, length) <= to - from;
}

export function atLateral(track, s, lateralM = 0) {
  const point = track.sample(s);
  return {
    ...point,
    x: point.x + point.normal.x * lateralM,
    z: point.z + point.normal.z * lateralM,
  };
}

export function lineLateral(track, s) {
  const wrapped = wrapDistance(s, track.length);
  let lateral = 0;
  for (const { from, apex, to, outside } of track.racingLine) {
    if (wrapped < from || wrapped > to) continue;
    if (wrapped < apex) {
      const progress = (wrapped - from) / (apex - from);
      lateral += outside * (1.17 * Math.sin(Math.PI * progress) ** 2 - smoothstep(progress));
    } else {
      const progress = (wrapped - apex) / (to - apex);
      lateral += outside * (1.17 * Math.sin(Math.PI * progress) ** 2 - (1 - smoothstep(progress)));
    }
  }
  return lateral * track.width * 0.31;
}

export function sampleLine(track, s) {
  return atLateral(track, s, lineLateral(track, s));
}

export function samplePit(track, s, offsetM = 0) {
  const { entryS, limitFrom, limitTo, exitS, width, offset } = track.pitLane;
  const taper = smoothstep(Math.min((s - entryS) / (limitFrom - entryS), (exitS - s) / (exitS - limitTo)));
  const contact = (track.width - width) / 2 * Math.sign(offset);
  return atLateral(track, s, contact + (offset - contact) * taper + offsetM);
}

export function runoffWidth(zone, s) {
  return zone.extraWidthM * smoothstep(Math.min((s - zone.from) / zone.taperM, (zone.to - s) / zone.taperM));
}
