// Build-time only: reuse the approved catalog poses and the existing purple #7 kit.
import { EXERCISES } from '../../../js/exercises.js';
import { PROGRAMS } from '../../../js/programs.js';
import { poseAt, cycleMs } from '../../../js/figure.js';

export const SPEED = 0.6;
export const MAX_BYTES = 300_000;
export const VIEWBOX = [-10, -12, 220, 210];
const FRONT = new Set(['jumping-jacks', 'side-hops', 'jump-rope']);
const FLOOR = new Set(['push-ups', 'plank', 'crunches', 'bicycle', 'leg-raises']);
const COLORS = {
  ink: '#2b2441', skin: '#f6c6a0', skinShade: '#dda17e',
  shirt: '#8b5cf6', shirtShade: '#6d3bd1', shorts: '#292440',
  farShorts: '#211d36', sock: '#fff8ed', shoe: '#f6a348',
  farShoe: '#dc843c', sole: '#fff9ed', hair: '#3b2a24',
};
export const frameFor = exercise => FLOOR.has(exercise.id) ? [6, 76, 188, 122] : VIEWBOX;
export const n = value => String(Math.round(value * 100) / 100 || 0);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const blend = (value, from, to) => { const t = Math.max(0, Math.min(1, (value - from) / (to - from))); return t * t * (3 - 2 * t); };
const line = (a, b, c) => `M${a.map(n).join(' ')}L${b.map(n).join(' ')}${c ? ` ${c.map(n).join(' ')}` : ''}`;
const transform = (point, angle = 0) => [...point, angle, 1, 1];

export function selectExercises() {
  const counts = new Map();
  for (const program of PROGRAMS) {
    const ids = new Set(program.blocks.filter(b => !['חימום', 'מתיחות'].includes(b.name)).flatMap(b => b.items));
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return EXERCISES.map((exercise, index) => ({ exercise, index, count: counts.get(exercise.id) || 0 }))
    .filter(item => item.count)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, 12);
}

// The catalog's cyclic curves have unequal keyframe durations. Time-weighted
// Hermite tangents preserve C1 velocity at every keyframe, including the seam.
export function samplePose(frames, ms) {
  if (!frames.smooth) return poseAt(frames, ms);
  let remaining = ((ms % cycleMs(frames)) + cycleMs(frames)) % cycleMs(frames);
  let i = 0;
  while (remaining >= frames[i][1] && i < frames.length - 1) remaining -= frames[i++][1];
  const count = frames.length;
  const [p0, d0] = frames[(i - 1 + count) % count];
  const [p1, d1] = frames[i];
  const [p2, d2] = frames[(i + 1) % count];
  const [p3] = frames[(i + 2) % count];
  const u = remaining / d1, u2 = u * u, u3 = u2 * u;
  const interpolate = (a, b, c, d) => (2 * u3 - 3 * u2 + 1) * b + (u3 - 2 * u2 + u) * d1 * (c - a) / (d0 + d1)
    + (-2 * u3 + 3 * u2) * c + (u3 - u2) * d1 * (d - b) / (d1 + d2);
  const pose = {};
  for (const key of Object.keys(p1)) {
    if (Array.isArray(p1[key])) pose[key] = p1[key].map((_, axis) => interpolate(...[p0, p1, p2, p3].map(p => p[key][axis] || 0)));
    else if (typeof p1[key] === 'number') pose[key] = interpolate(...[p0, p1, p2, p3].map(p => p[key] ?? p1[key]));
  }
  return pose;
}

// A single periodic sample set drives every part; the last sample is exactly the first.
export function samplesFor(exercise) {
  const duration = Math.round(cycleMs(exercise.frames) / SPEED);
  const segments = Math.max(40, Math.ceil(duration / 1000 * 30));
  const poses = Array.from({ length: segments }, (_, i) => {
    const pose = samplePose(exercise.frames, i / segments * cycleMs(exercise.frames));
    // Catmull-Rom may overshoot a planted sole between catalog keyframes.
    for (const key of ['lf', 'rf']) pose[key][1] = Math.min(182, pose[key][1]);
    return pose;
  });
  poses.push(structuredClone(poses[0]));
  return { duration, segments, poses };
}

function geometry(p, exercise) {
  const front = FRONT.has(exercise.id);
  const torso = [p.hip[0] - p.neck[0], p.hip[1] - p.neck[1]];
  const length = Math.hypot(...torso), down = torso.map(v => v / length);
  const right = [down[1], -down[0]];
  const body = [...p.neck.slice(0, 2), Math.atan2(-torso[0], torso[1]) * 180 / Math.PI, 1, length / 46];
  const headAngle = Math.atan2(p.head[0] - p.neck[0], p.neck[1] - p.head[1]) * 180 / Math.PI;
  const out = {
    body,
    head: transform(p.head.slice(0, 2), headAngle),
    neck: line(p.neck, p.head),
  };
  for (const [prefix, e, h, k, f, sign] of [
    ['far', 'le', 'lh', 'lk', 'lf', -1], ['near', 're', 'rh', 'rk', 'rf', 1],
  ]) {
    const shoulder = add(p.neck.slice(0, 2), add(right.map(v => v * sign * (front ? 11.5 : 2.2)), down.map(v => v * 5)));
    const hip = add(p.hip.slice(0, 2), right.map(v => v * sign * (front ? 6 : 2)));
    const elbow = p[e].slice(0, 2), hand = p[h].slice(0, 2);
    // In a side view the catalog's depth-free hand points land on the chin.
    // Attach these hands to the nape while keeping the approved elbow gesture.
    if (['crunches', 'bicycle'].includes(exercise.id)) {
      const radians = headAngle * Math.PI / 180;
      hand[0] = p.head[0] - 7 * Math.cos(radians) - 9 * Math.sin(radians);
      hand[1] = p.head[1] - 7 * Math.sin(radians) + 9 * Math.cos(radians);
      const tuck = blend(172 - p.neck[1], 0, 46) * .3;
      elbow[0] = shoulder[0] * tuck + elbow[0] * (1 - tuck);
      elbow[1] = shoulder[1] * tuck + elbow[1] * (1 - tuck);
    }
    const palm = ['crunches', 'bicycle'].includes(exercise.id) ? 0 : blend(hand[1], 172, 182);
    hand[1] -= 4 * palm;
    const knee = p[k].slice(0, 2), foot = p[f].slice(0, 2);
    out[`${prefix}-arm`] = line(shoulder, elbow, hand);
    out[`${prefix}-sleeve`] = line(shoulder, mix(shoulder, elbow, .38));
    out[`${prefix}-shorts`] = line(hip, mix(hip, knee, .39));
    // Ground contact is the sole, never the shoe's centre. The source's 182 is the floor.
    let shoeAngle = 0;
    if (!front) {
      const elevation = 182 - foot[1];
      const forward = foot[0] - knee[0];
      if (FLOOR.has(exercise.id) && !['push-ups', 'plank'].includes(exercise.id)) {
        shoeAngle = Math.atan2(foot[1] - knee[1], forward) * 180 / Math.PI - 90;
      } else {
        const airAngle = Math.max(-40, Math.min(38, forward * .85));
        const support = ['push-ups', 'plank'].includes(exercise.id) ? 1 : exercise.id === 'burpees' ? blend(p.neck[1], 104, 136) : 0;
        const ground = blend(foot[1], 174, 180);
        shoeAngle = airAngle * (1 - ground) + 50 * support * ground;
      }
    } else {
      shoeAngle = sign * Math.min(14, Math.max(0, 182 - foot[1]) * .35);
    }
    // Solve the shoe's lowest point, then connect the calf to its actual ankle.
    // This keeps a heel or toe planted at every angle without a pose threshold.
    const radians = shoeAngle * Math.PI / 180;
    const shoePoints = [[-5, -8], [-2, -10], [2, -6], [6, -4], [12, -4], [12, 0], [-6, 0], [-8, -3]];
    const lowest = Math.max(...shoePoints.map(([x, y]) => x * Math.sin(radians) + y * Math.cos(radians)));
    const anchor = [foot[0], foot[1] - lowest];
    const ankle = [anchor[0] + 6 * Math.sin(radians), anchor[1] - 6 * Math.cos(radians)];
    out[`${prefix}-leg`] = line(hip, knee, ankle);
    out[`${prefix}-sock`] = line(mix(knee, ankle, .62), ankle);
    out[`${prefix}-shoe`] = transform(anchor, shoeAngle);
    const naturalAngle = Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]) * 180 / Math.PI - 90;
    const toPalm = ((-90 - naturalAngle + 540) % 360) - 180;
    const handAngle = naturalAngle + toPalm * palm;
    out[`${prefix}-hand`] = transform(hand, handAngle);
  }
  if (exercise.id === 'jump-rope') {
    // Keep the source rope arc and constrain its lowest point to the floor.
    const controlY = Math.min(p.rope ?? 20, 360 - (p.lh[1] + p.rh[1]) / 2);
    out.rope = `M${p.lh.slice(0, 2).map(n).join(' ')}Q100 ${n(controlY)} ${p.rh.slice(0, 2).map(n).join(' ')}`;
  }
  const floor = FLOOR.has(exercise.id);
  const centerX = floor ? (p.head[0] + p.lf[0] + p.rf[0]) / 3 : (p.lf[0] + p.rf[0]) / 2;
  const lift = floor ? 0 : Math.max(0, 182 - Math.max(p.lf[1], p.rf[1]));
  out.shadow = [centerX, 184, 0, (floor ? 1.55 : 1) - Math.min(.3, lift / 150), 1 - Math.min(.5, lift / 100)];
  return out;
}

const xml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

export function renderExercise(exercise, { animated = true } = {}) {
  const { poses, duration, segments } = samplesFor(exercise);
  const states = poses.map(p => geometry(p, exercise));
  // Keep wrists on the shortest angular path when atan2 crosses its branch cut.
  for (const key of ['far-hand', 'near-hand', 'far-shoe', 'near-shoe', 'head', 'body']) {
    for (let i = 1; i < states.length; i++) {
      while (states[i][key][2] - states[i - 1][key][2] > 180) states[i][key][2] -= 360;
      while (states[i][key][2] - states[i - 1][key][2] < -180) states[i][key][2] += 360;
    }
  }
  const front = FRONT.has(exercise.id);
  const c = COLORS;
  const animation = (key, attribute = 'd') => {
    if (!animated) return '';
    const values = states.map(s => s[key]).join(';');
    return `<animate attributeName="${attribute}" dur="${duration}ms" values="${values}" calcMode="linear" repeatCount="indefinite"/>`;
  };
  const pathDef = key => `<path id="${key}" d="${states[0][key]}">${animation(key)}</path>`;
  const use = (key, color, width) => `<use href="#${key}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
  const tube = (key, color, width) => use(key, c.ink, width + 2.2) + use(key, color, width);
  const moving = (key, content) => {
    const parts = [['translate', [0, 1]], ['rotate', [2]], ['scale', [3, 4]]];
    return parts.reduceRight((inner, [type, indices]) => {
      const values = states.map(s => indices.map(i => n(s[key][i])).join(' '));
      const motion = animated && values.some(v => v !== values[0])
        ? `<animateTransform attributeName="transform" type="${type}" dur="${duration}ms" values="${values.join(';')}" calcMode="linear" repeatCount="indefinite"/>` : '';
      return `<g${type === 'translate' ? ` data-part="${key}"` : ''} transform="${type}(${values[0]})">${motion}${inner}</g>`;
    }, content);
  };
  const shoe = near => `<path d="M-5-8Q-2-10 2-6L6-4Q12-4 12-1L12 0H-6Q-8-3-5-8Z" fill="${near ? c.shoe : c.farShoe}" stroke="${c.ink}" stroke-width="1.1"/><path d="M-6-1H11" fill="none" stroke="${c.sole}" stroke-width="2.1"/><path d="M0-6 4-5M-1-4 3-3" stroke="${c.sole}" stroke-width="1.2"/>`;
  const hand = near => `<path d="M-3-2Q-5 0-4 3Q-3 6 1 6Q5 5 4 2L3-2Z" fill="${near ? c.skin : c.skinShade}" stroke="${c.ink}" stroke-width="1.1"/><path d="m2 0-1 3" fill="none" stroke="${c.skinShade}" stroke-width=".8"/>`;
  const leg = prefix => {
    const near = prefix === 'near';
    return `<g data-limb="${prefix}-leg">${tube(`${prefix}-leg`, near ? c.skin : c.skinShade, 8.2)}${tube(`${prefix}-sock`, near ? c.sock : '#e4d6cd', 7.8)}${moving(`${prefix}-shoe`, shoe(near))}${tube(`${prefix}-shorts`, near ? c.shorts : c.farShorts, 13.2)}</g>`;
  };
  const arm = prefix => {
    const near = prefix === 'near';
    return `<g data-limb="${prefix}-arm">${tube(`${prefix}-arm`, near ? c.skin : c.skinShade, 6.5)}${tube(`${prefix}-sleeve`, near ? c.shirt : c.shirtShade, 10.4)}${moving(`${prefix}-hand`, hand(near))}</g>`;
  };
  const bodyWidth = front ? 13.5 : 9;
  const body = `<path d="M${n(-bodyWidth)} 6Q-9 20-9 42L-9 46Q0 49 9 46L9 42Q9 20 ${n(bodyWidth)} 6Q5 0 0 3Q-5 0 ${n(-bodyWidth)} 6Z" fill="${c.shirt}" stroke="${c.ink}" stroke-width="1.3"/><path d="M${n(-bodyWidth + 1)} 7Q-8 25-8 44L-3 45Q-7 22-5 6Z" fill="${c.shirtShade}"/><path d="M-5 4Q0 11 5 4" fill="none" stroke="#e8d9ff" stroke-width="2.2"/><path d="M-8 43Q0 45 8 43" fill="none" stroke="${c.shirtShade}" stroke-width="1.2"/><g transform="translate(${front ? 0 : 1} 21) scale(${front ? 1 : .78} 1)"><path d="M-4-3H4L-1 8" fill="none" stroke="#fff8ee" stroke-width="2.8" stroke-linejoin="round"/><path d="M4-8h3m-1.5-1.5v3" stroke="#efc6ff" stroke-width=".9"/></g>`;
  const head = `<g stroke="${c.ink}" stroke-width="1.15">
    <ellipse cx="-12.5" cy="1" rx="3" ry="4.1" fill="${c.skinShade}"/>
    ${front ? `<ellipse cx="12.5" cy="1" rx="3" ry="4.1" fill="${c.skin}"/>` : ''}
    <path d="M-12-6Q-12-15 0-15Q13-15 13-4L${front ? '13 4' : '15 1 13 4'}Q12 15 1 16Q-10 15-12 4Z" fill="${c.skin}"/>
    <path d="M-11-3Q-12 11 0 15Q-10 13-10 2Z" fill="${c.skinShade}" stroke="none"/>
    <path d="M-13 1-14-6Q-16-14-8-17L-10-20Q-4-21 0-18Q6-22 11-17Q18-17 15-9Q14-5 10-6L8-9Q0-6-5-11Q-8-7-10-6L-10 1Z" fill="${c.hair}"/>
    <path d="M-9-13Q-5-18 1-15M3-16q5-2 8 1" fill="none" stroke="#665047" stroke-width="1.5"/>
    <g fill="#fffaf3">
      ${front ? '<ellipse cx="-5.4" cy=".5" rx="3.4" ry="4.3"/>' : '<ellipse cx="2.2" cy=".5" rx="2.9" ry="4"/>'}
      <ellipse cx="8.1" cy=".4" rx="3" ry="4.1"/>
    </g>
    <g fill="${c.ink}" stroke="none"><ellipse cx="${front ? -4.8 : 3.2}" cy="1" rx="1.65" ry="2.55"/><ellipse cx="9" cy="1" rx="1.6" ry="2.5"/></g>
    <g fill="white" stroke="none"><circle cx="${front ? -5.3 : 2.7}" cy="0" r=".7"/><circle cx="8.5" cy="0" r=".7"/></g>
    <path d="M${front ? '-8-5q3-2 6-.3' : '0-5q2-1.8 4-.7'}M6-5q3-1.5 5 .3" fill="none" stroke-width="1.45"/>
    <path d="${front ? 'm2 3-1 3h2' : 'm10 3 2 2-2 1'}" fill="none" stroke="#bf805f" stroke-width=".8"/>
    <ellipse cx="${front ? -7.8 : -2}" cy="7" rx="2.8" ry="1.5" fill="#ed9a8c" opacity=".6" stroke="none"/>
    <path d="M${front ? '-3' : '3'} 9q4 4 8-1" fill="none" stroke="#824c47" stroke-width="1.2"/>
  </g>`;
  const defs = Object.keys(states[0]).filter(key => !['body', 'head', 'shadow'].includes(key) && !key.endsWith('-shoe') && !key.endsWith('-hand')).map(pathDef).join('');
  const description = 'דמות האימון בחולצה סגולה עם מספר 7. פוזות מקטלוג התרגילים, בתנועה מחזורית חלקה.';
  const background = `<g aria-hidden="true"><path d="M14 183H186" stroke="#d3c9db" stroke-width=".9" stroke-linecap="round"/>${moving('shadow', '<ellipse rx="27" ry="3.5" fill="#3c2c56" opacity=".13"/>')}</g>`;
  const rope = exercise.id === 'jump-rope' ? `<use href="#rope" fill="none" stroke="#7c5aa5" stroke-width="1.5"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frameFor(exercise).join(' ')}" width="440" height="420" role="img" aria-labelledby="title desc" data-exercise="${exercise.id}" data-duration="${duration / 1000}" data-samples="${segments}" fill="none" stroke-linecap="round" stroke-linejoin="round"><title id="title">${xml(exercise.name)}</title><desc id="desc">${description}</desc><defs>${defs}</defs>${background}<g id="character">${rope}${leg('far')}${arm('far')}${leg('near')}${moving('body', body)}${tube('neck', c.skinShade, 7.5)}${arm('near')}${moving('head', head)}</g></svg>\n`;
}
