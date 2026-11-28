// SPDX-License-Identifier: CC0-1.0
// The game's runtime asset: the wired clips only, in the tall-pack encoding (int16 quaternions /32767, hips offsets from the canonical rest /10000),
// canonical profile, plus the stop table. Writes workout/island/assets/hoops-stop-clips-v1/stop-clips.json.
import fs from 'node:fs/promises';

const base = new URL('../', import.meta.url);
const out = new URL('../../../assets/hoops-stop-clips-v1/', import.meta.url);
const data = JSON.parse(await fs.readFile(new URL('runtime/motions.json', base)));
const BONES = data.skeleton.map(b => b.name);
const q16 = v => Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
const wired = c => /^hoops_stop_(sprint|run|jog)_/.test(c.id) || /^hoops_defensive_slide_fast_(left|right)$/.test(c.id);
const b64 = (arr) => Buffer.from(new Int16Array(arr).buffer).toString('base64');
const clips = {}, stops = [], slide = {};
for (const c of data.clips.filter(wired)) {
  const n = c.frames.length, quat = [], hips = [];
  for (const f of c.frames) {
    for (const name of BONES) { let q = f.rotations[name]; if (name !== 'Root' && quat.length && false) q = q; quat.push(...q.map(q16)); }
    hips.push(Math.round(f.hips[0] * 1e4), Math.round((f.hips[1] - .86) * 1e4), Math.round(f.hips[2] * 1e4));
  }
  clips[c.id] = {duration: +(c.duration).toFixed(4), frames: n, loop: !!c.loop, kind: c.loop ? 'slide' : 'stop', events: Object.fromEntries(c.events.map(e => [e.type, [e.time]])), refSpeed: c.variant.entrySpeedMps ?? c.variant.referenceSpeedMps ?? 0, rootEnd: c.path.samples.at(-1).concat([]).length ? [c.path.samples.at(-1)[0], 0, c.path.samples.at(-1)[1]] : [0, 0, 0], quat: b64(quat), hips: b64(hips)};
  if (!c.loop) stops.push({id: c.id, family: c.family, v0: c.variant.entrySpeedMps, Ts: c.meta.Ts, duration: c.duration, distance: c.meta.D});
  else slide[c.variant.direction] = c.id, slide.refSpeed = c.variant.referenceSpeedMps, slide.rateRange = c.variant.rateRange, slide.speedRange = c.variant.speedRangeMps;
}
const pack = {version: 1, fps: 30, bones: BONES, profiles: {canonical: {height: 1.75, hips: [0, .86, 0]}}, clips,
  stop: {families: {sprint: {Ts: .42}, run: {Ts: .34}, jog: {Ts: .30}}, variants: stops, slide, canonicalScaleNote: 'speeds and distances are canonical metres; a body of scale s plays them as s times as fast and as far'},
  library: data.version, license: 'CC0-1.0'};
await fs.mkdir(out, {recursive: true});
const text = JSON.stringify(pack);
await fs.writeFile(new URL('stop-clips.json', out), text + '\n');
console.log('stop-clips.json', text.length, 'bytes,', Object.keys(clips).length, 'clips');
