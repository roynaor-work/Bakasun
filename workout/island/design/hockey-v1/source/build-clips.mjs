// SPDX-License-Identifier: CC0-1.0
// מקור: יצירה מקורית של Codex עבור חבילת הוקי v1, 12/11/2026.
// תנועות על להבים: קינמטיקה הפוכה לרגליים, חלונות מגע הנעים על הקרח.
import {writeFileSync} from 'node:fs';
import {CANON_BONES, CANON_NAMES, qaxis, qmul, qnorm, qrotate, jointWorld, normaliseSoccerClip, gaitMetrics, checkGait, checkStand} from '../../../minigames/athletes-core.mjs';

const DEG = Math.PI / 180, TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x); return x * x * x * (10 + x * (-15 + 6 * x)); };
const bell = x => Math.sin(Math.PI * clamp(x)) ** 2;
const pulse = (u, a, peak, b) => u < peak ? smooth((u - a) / (peak - a)) : 1 - smooth((u - peak) / (b - peak));
const lerp = (a, b, t) => a + (b - a) * t;
const xyz = (x = 0, y = 0, z = 0) => qmul(qmul(qaxis([0, 0, 1], z * DEG), qaxis([0, 1, 0], y * DEG)), qaxis([1, 0, 0], x * DEG));
const inverse = q => [-q[0], -q[1], -q[2], q[3]];
const rounded = v => +v.toFixed(7);
const rotate = (q, v) => qrotate(q, v);
const specs = [
  ['skate_push_slow', 'דחיפה רגועה', 1.6, true, 'walk', 1.6, 'stride', 0],
  ['skate_push_medium', 'דחיפה בקצב בינוני', 1.2, true, 'jog', 3.6, 'stride', 1],
  ['skate_push_fast', 'דחיפה מהירה', 0.8, true, 'sprint', 6.5, 'stride', 2],
  ['skate_glide', 'גלישה', 2.4, true, 'walk', 2.6, 'glide', 0],
  ['skate_crossover_left', 'חצייה שמאלה', 1.6, true, 'run', 3.5, 'cross', 1],
  ['skate_crossover_right', 'חצייה ימינה', 1.6, true, 'run', 3.5, 'cross', -1],
  ['skate_stop_left', 'בלימה לשמאל', 1.8, false, 'walk', 3, 'stop', 1],
  ['skate_stop_right', 'בלימה לימין', 1.8, false, 'walk', 3, 'stop', -1],
  ['skate_turn_45', 'פנייה של 45 מעלות', 2, false, 'walk', 2.5, 'turn', 45],
  ['skate_turn_90', 'פנייה של 90 מעלות', 2.4, false, 'walk', 2.5, 'turn', 90],
  ['skate_turn_180', 'פנייה של 180 מעלות', 3.2, false, 'walk', 2.5, 'turn', 180],
  ['skate_backward', 'החלקה אחורה', 1.6, true, 'jog', 2.4, 'back', 0],
  ['ready_1', 'מוכנות נמוכה', 2.4, true, null, 0, 'ready', 0],
  ['ready_2', 'מוכנות עם מבט לצדדים', 3.2, true, null, 0, 'ready', 1],
  ['ready_3', 'מוכנות עם העברת משקל', 2.8, true, null, 0, 'ready', 2],
  ['shot_wrist', 'קליעת פרק יד', 2, false, null, 0, 'wrist', 0],
  ['shot_slap', 'קליעת סלאפ', 2.4, false, null, 0, 'slap', 0],
  ['pass', 'מסירה', 1.8, false, null, 0, 'pass', 0],
  ['receive', 'קבלת מסירה', 1.6, false, null, 0, 'receive', 0],
  ['body_check', 'מפגש כתף מבוקר', 1.8, false, null, 0, 'check', 0],
  ['goalie_stance', 'עמידת שוער', 2.4, true, null, 0, 'gready', 0],
  ['goalie_butterfly', 'נפילה לפרפר', 2.4, false, null, 0, 'butterfly', 0],
  ['goalie_slide_left', 'החלקת שוער שמאלה', 2, false, 'walk', 1.4, 'gslide', 1],
  ['goalie_slide_right', 'החלקת שוער ימינה', 2, false, 'walk', 1.4, 'gslide', -1],
  ['goalie_glove_high', 'עצירה עם כפפה גבוהה', 2, false, null, 0, 'ghigh', 0],
  ['goalie_glove_low', 'עצירה עם כפפה נמוכה', 2, false, null, 0, 'glow', 0],
  ['goalie_stick_save', 'עצירה עם מקל', 1.8, false, null, 0, 'gstick', 0],
  ['celebrate_1', 'חגיגה עם אגרוף', 2.4, false, null, 0, 'fist', 0],
  ['celebrate_2', 'חגיגה עם הרמת מקל', 2.8, false, null, 0, 'raise', 0],
  ['celebrate_3', 'חגיגה עם סיבוב על הקרח', 3.2, false, null, 1.4, 'spin', 0],
];

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, t) => a.map(v => v * t);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const unit = a => scale(a, 1 / (Math.hypot(...a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function frameAlong(direction, hinge) {
  const y = scale(unit(direction), -1), x = unit(sub(hinge, scale(y, dot(hinge, y)))), z = cross(x, y);
  const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2], trace=m00+m11+m22;
  let q, s;
  if(trace>0){s=Math.sqrt(trace+1)*2;q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
  else if(m00>m11&&m00>m22){s=Math.sqrt(1+m00-m11-m22)*2;q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
  else if(m11>m22){s=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
  else{s=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}
  return qnorm(q);
}
function fromDown(vector) {
  const v = unit(vector), d = -v[1];
  if (d < -.999999) return [1, 0, 0, 0];
  return qnorm([-v[2], 0, v[0], 1 + d]);
}
/** מיקום המרפק או הברך על מעגל החיתוך בין שני אורכי העצמות. */
function solveJoint(hip, foot, pole, a, b) {
  const delta = sub(foot, hip), raw = Math.hypot(...delta), d = clamp(raw, Math.abs(a - b) + .001, a + b - .001);
  const axis = unit(delta), along = (a * a - b * b + d * d) / (2 * d), centre = add(hip, scale(axis, along));
  const off = sub(pole, centre), bend = unit(sub(off, scale(axis, dot(off, axis))));
  return add(centre, scale(bend, Math.sqrt(Math.max(0, a * a - along * along))));
}
function solveArm(p, side, target, pole) {
  const w = jointWorld(p), shoulder = w[side + 'Arm'].p;
  const elbow = solveJoint(shoulder, target, pole, .27, .24);
  const upperVector = sub(elbow, shoulder), foreVector = sub(target, elbow), hinge = unit(cross(foreVector, upperVector));
  const upperWorld = frameAlong(upperVector, hinge), foreWorld = frameAlong(foreVector, hinge);
  p.rot[side + 'Arm'] = qmul(inverse(w.Chest.q), upperWorld);
  p.rot[side + 'ForeArm'] = qmul(inverse(upperWorld), foreWorld);
}

/** פתרון שתי עצמות. הברך פונה קדימה, אורכי העצמות אינם משתנים. */
function solveLeg(pose, side, target, {yaw = 0, edge = 0, pitch = 0} = {}) {
  const sign = side === 'Left' ? 1 : -1;
  const h = pose.hips, dx = target[0] - h[0] - .1 * sign;
  const dy = target[1] - .86 - h[1], dz = target[2] - h[2];
  const vertical = Math.hypot(dx, dy), distance = clamp(Math.hypot(vertical, dz), .16, .779);
  const bend = Math.acos(clamp((distance * distance - .41 ** 2 - .37 ** 2) / (2 * .41 * .37), -1, 1));
  const lift = Math.atan2(dz, vertical) + Math.atan2(.37 * Math.sin(bend), .41 + .37 * Math.cos(bend));
  const roll = Math.atan2(dx, -dy);
  pose.rot[side + 'UpLeg'] = qmul(qaxis([0, 0, 1], roll), qaxis([1, 0, 0], -lift));
  pose.rot[side + 'Leg'] = qaxis([1, 0, 0], bend);
  const lower = qmul(pose.rot[side + 'UpLeg'], pose.rot[side + 'Leg']);
  // להבים שטוחים במגע. גלגול קטן נרשם רק בשלבי החלפת קצה.
  pose.rot[side + 'Foot'] = qmul(inverse(lower), xyz(pitch, yaw, edge));
}

function basePose(u, {goalie = false, gait = null, phase = u, style = 'ready'} = {}) {
  const rot = Object.fromEntries(CANON_NAMES.map(n => [n, [0, 0, 0, 1]]));
  const pose = {rot, hips: [0, goalie ? -.21 : -.14, 0]};
  const breath = Math.sin(TAU * u);
  const lean = goalie ? 20 : gait === 'sprint' ? 24 : gait === 'run' ? 22 : gait === 'jog' ? 18 : 15;
  rot.Spine = xyz(lean * .75, 0, 0);
  rot.Chest = xyz(lean * .25, 0, 0);
  rot.Neck = xyz(-lean * .6, 0, 0);
  rot.Head = xyz(-lean * .4, style === 'ready' ? breath * 3 : 0, 0);
  const swing = gait === 'sprint' ? 42 : gait === 'run' ? 38 : gait === 'jog' ? 32 : gait ? 24 : 2;
  for (const side of ['Left', 'Right']) {
    const sign = side === 'Left' ? 1 : -1;
    rot[side + 'Arm'] = xyz(-35 + sign * swing * Math.sin(TAU * phase), sign * 3, sign * 7);
    rot[side + 'ForeArm'] = xyz(-110 + sign * 8 * Math.sin(TAU * phase), 0, 0);
    rot[side + 'Hand'] = xyz(0, sign * 5, 0);
  }
  return pose;
}

function makePose(spec, u) {
  const [id, label, dur, loop, gait, speed, style, arg] = spec;
  const goalie = id.startsWith('goalie_'), wave = Math.sin(TAU * u), cw = Math.cos(TAU * u);
  const p = basePose(u, {goalie, gait, phase: u, style});
  const feet = {Left: [.15, .08, .03], Right: [-.15, .08, .03]};
  const footAngles = {Left: {}, Right: {}};
  const setArm = (side, x, y, z, elbow = -110) => { p.rot[side + 'Arm'] = xyz(x, y, z); p.rot[side + 'ForeArm'] = xyz(elbow, 0, 0); };
  if (['stride', 'back'].includes(style)) {
    const fast = style === 'back' ? 1 : arg, extent = [.14, .19, .24][fast];
    p.hips[0] = .022 * wave; p.hips[1] -= .006 * Math.cos(2 * TAU * u);
    for (const side of ['Left', 'Right']) {
      const s = side === 'Left' ? 1 : -1, ph = (u + (s < 0 ? .5 : 0)) % 1;
      const push = ph < .56, v = push ? ph / .56 : (ph - .56) / .44;
      const extension = push ? smooth(v) : 1 - smooth(v);
      const lift = push ? 0 : .055 * bell(v);
      feet[side] = [s * (.13 + extent * extension), .08 + lift, (style === 'back' ? 1 : -1) * (.1 * extension - .045)];
      footAngles[side] = {yaw: s * (style === 'back' ? -1 : 1) * (7 + 14 * extension), edge: push ? 0 : s * 4 * bell(v)};
    }
  } else if (style === 'glide') {
    // הלהבים ממשיכים לנוע לאורך הקרח; אין הרמת ברך במחזור גלישה.
    p.hips[0] = .012 * wave; p.hips[1] -= .004 * Math.cos(2 * TAU * u);
    feet.Left[0] += .025 * wave; feet.Right[0] += .025 * wave;
    feet.Left[2] += .025 * cw; feet.Right[2] -= .025 * cw;
  } else if (style === 'cross') {
    p.hips[0] = arg * .018 * wave;
    for (const side of ['Left', 'Right']) {
      const s = side === 'Left' ? 1 : -1, ph = (u + (s > 0 ? 0 : .5)) % 1;
      const crossing = Math.max(0, Math.sin(TAU * ph));
      feet[side] = [s * .15 - arg * .28 * crossing, .08 + .065 * crossing ** 2, .02 + .16 * crossing];
      footAngles[side] = {yaw: arg * 12, edge: crossing > 0 ? arg * 3 * crossing : 0};
    }
    p.rot.Chest = xyz(5.5, 0, arg * -3);
  } else if (style === 'stop') {
    const e = pulse(u, 0, .48, 1), turn = smooth(u / .55);
    p.rot.Root = xyz(0, arg * 65 * turn, 0);
    p.hips[1] -= .055 * e; p.hips[0] = arg * .018 * e;
    feet.Left[0] += .05 * e; feet.Right[0] -= .05 * e;
    feet.Left[2] = .08 * e; feet.Right[2] = -.07 * e;
    footAngles.Left.yaw = arg * 18 * e; footAngles.Right.yaw = arg * 18 * e;
  } else if (style === 'turn') {
    p.rot.Root = xyz(0, arg * smooth(u), 0);
    p.hips[0] = .016 * bell(u); p.hips[1] -= .025 * bell(u);
    feet.Left[0] += .025 * bell(u); feet.Right[0] -= .025 * bell(u);
    feet.Left[2] = .07 * bell(u); feet.Right[2] = -.04 * bell(u);
    footAngles.Left.yaw = 9 * bell(u); footAngles.Right.yaw = 9 * bell(u);
  } else if (style === 'ready' || style === 'gready') {
    p.hips[1] += .003 * wave;
    if (arg === 1) p.rot.Head = xyz(-15, 22 * wave, 0);
    if (arg === 2) p.hips[0] = .025 * wave;
    if (goalie) { feet.Left[0] = .23; feet.Right[0] = -.23; }
  } else if (['wrist', 'slap', 'pass', 'receive'].includes(style)) {
    const windup = pulse(u, 0, .32, .67), follow = pulse(u, .36, .65, 1), impact = pulse(u, .38, .55, .82);
    const large = style === 'slap' ? 1 : style === 'pass' ? .3 : .55;
    p.rot.Hips = xyz(0, -20 * windup + 17 * follow, 0);
    p.rot.Spine = xyz(14 + 5 * impact, -18 * windup + 15 * follow, 0);
    p.rot.Chest = xyz(5, -12 * windup + 8 * follow, 0);
    p.hips[0] = -.025 * windup + .035 * follow; p.hips[1] -= .02 * impact;
    feet.Left = [.2, .08, .11]; feet.Right = [-.19, .08, -.08];
    if (style === 'receive') {
      p.rot.Hips = xyz(0, 0, 0); p.rot.Spine = xyz(14, -7 * impact, 0);
      setArm('Right', -35 + 15 * impact, -18 - 8 * impact, -8, -105 - 8 * impact);
      setArm('Left', -38 + 12 * impact, 20, 9, -112);
    } else {
      setArm('Right', -35 + 55 * large * windup - 50 * large * follow, -15 - 24 * windup + 22 * follow, -8, -110 + 28 * follow);
      setArm('Left', -40 + 35 * large * windup - 30 * large * follow, 12 - 18 * windup + 15 * follow, 9, -110 + 20 * follow);
      p.rot.RightHand = xyz(5 * windup - 24 * follow, -8 * impact, 0);
    }
  } else if (style === 'check') {
    const e = pulse(u, .08, .5, .98);
    p.hips[1] -= .045 * e; p.hips[0] = -.08 * e;
    p.rot.Spine = xyz(16, -15 * e, -8 * e); p.rot.Chest = xyz(4, -7 * e, 0);
    setArm('Right', -32, -5, -9, -125); setArm('Left', -32, 5, 9, -125);
    feet.Left[0] = .22; feet.Right[0] = -.22;
  } else if (style === 'butterfly') {
    const e = pulse(u, .05, .42, .97);
    // כניסה מבוקרת לברכיים, רפידות נפרשות והלהבים משתחררים מהקרח.
    p.hips[1] = -.21 - .15 * e;
    feet.Left = [.23 + .25 * e, .08 + .07 * e, -.075 * e];
    feet.Right = [-.23 - .25 * e, .08 + .07 * e, -.075 * e];
    footAngles.Left.yaw = 62 * e; footAngles.Right.yaw = -62 * e;
    setArm('Left', -36, 10, 13, -110); setArm('Right', -32, -10, -13, -108);
  } else if (style === 'gslide') {
    const e = bell(u);
    p.hips[0] = arg * .09 * e; p.hips[1] -= .025 * e;
    feet.Left = [.25 + arg * .10 * e, .08, .02]; feet.Right = [-.25 + arg * .10 * e, .08, .02];
    footAngles.Left.yaw = arg * 90; footAngles.Right.yaw = arg * 90;
  } else if (['ghigh', 'glow', 'gstick'].includes(style)) {
    const e = pulse(u, .05, .5, .98);
    feet.Left = [.23, .08, .02]; feet.Right = [-.23, .08, .02];
    if (style === 'ghigh') { setArm('Left', -35 - 100 * e, 12, 10 + 14 * e, -110 + 35 * e); p.rot.Head = xyz(-15 - 10 * e, 12 * e, 0); }
    if (style === 'glow') { setArm('Left', -35 + 22 * e, 14 + 12 * e, 10 + 12 * e, -110 + 20 * e); p.hips[1] -= .14 * e; p.rot.Spine = xyz(18 + 35 * e, 8 * e, 0); }
    if (style === 'gstick') { setArm('Right', -35 + 26 * e, -16 - 20 * e, -10, -110 + 25 * e); p.hips[1] -= .055 * e; }
  } else if (['fist', 'raise', 'spin'].includes(style)) {
    const e = pulse(u, .04, .5, .98);
    p.hips[1] += .02 * e; p.rot.Spine = xyz(11, 0, 0);
    if (style === 'fist') setArm('Left', -35 - 105 * e, 5, 9, -110 - 12 * e);
    if (style === 'raise') { setArm('Right', -35 - 120 * e, -5, -10, -110 + 22 * e); setArm('Left', -35 - 60 * e, 12, 9, -110); }
    if (style === 'spin') { p.rot.Root = xyz(0, 360 * smooth(u), 0); setArm('Left', -35 - 65 * e, 10, 12 + 10 * e); }
  }
  for (const side of ['Left', 'Right']) solveLeg(p, side, feet[side], footAngles[side]);
  if (style === 'butterfly') {
    const e = pulse(u, .05, .42, .97);
    for (const side of ['Left', 'Right']) {
      const s = side === 'Left' ? 1 : -1, w = jointWorld(p), hip = w[side + 'UpLeg'].p, foot = feet[side];
      const old = w[side + 'Leg'].p, pole = old.map((v, i) => lerp(v, [s * .22, .07, .2][i], e));
      const knee = solveJoint(hip, foot, pole, .41, .37), upperVector = sub(knee, hip), lowerVector = sub(foot, knee), hinge = unit(cross(upperVector, lowerVector));
      const upper = frameAlong(upperVector, hinge), lower = frameAlong(lowerVector, hinge);
      p.rot[side + 'UpLeg'] = upper; p.rot[side + 'Leg'] = qmul(inverse(upper), lower);
      p.rot[side + 'Foot'] = qmul(inverse(lower), xyz(0, s * 62 * e, s * 22 * e));
    }
  }
  // פיתול אגן משנה את צירי הרגליים, לכן מתרגמים את פתרון העולם למסגרת האגן.
  if (p.rot.Hips.some((v, i) => Math.abs(v - [0, 0, 0, 1][i]) > 1e-8)) {
    for (const side of ['Left', 'Right']) p.rot[side + 'UpLeg'] = qmul(inverse(p.rot.Hips), p.rot[side + 'UpLeg']);
  }
  // בשתי ידיים האחיזה הימנית נמוכה והיד השמאלית על הקצה העליון של המקל.
  const twoHands = ['ready', 'wrist', 'slap', 'pass', 'receive', 'check'].includes(style);
  let w = jointWorld(p), hipsYaw = Math.atan2(qrotate(w.Hips.q, [0, 0, 1])[0], qrotate(w.Hips.q, [0, 0, 1])[2]);
  const bodyYaw = qaxis([0, 1, 0], hipsYaw);
  const atBody = v => add(w.Hips.p, rotate(bodyYaw, v));
  if (twoHands) {
    const amount = style === 'pass' ? .5 : 1;
    const windup = ['slap', 'wrist', 'pass'].includes(style) ? amount * pulse(u, 0, .32, .67) : 0;
    const follow = ['slap', 'wrist', 'pass'].includes(style) ? amount * pulse(u, .36, .65, 1) : 0;
    const target = atBody([-.075 - .06 * windup + .06 * follow, .29 + .10 * windup, .31 - .1 * windup + .055 * follow]);
    solveArm(p, 'Right', target, atBody([-.28, .25, .13]));
  }
  w = jointWorld(p);
  // נקודת BladePoint בקובץ המקל היא [0,-1.28,.31]. הגובה נפתר במטרים.
  const lifted = style === 'slap' ? .36 * pulse(u, .04, .30, .49) : 0;
  const rightY = w.RightHand.p[1];
  // הטיית הידית לצד שומרת על להב אופקי. הטיה קדימה הייתה מעלה את חרטום הלהב ומטביעה את העקב.
  const tilt = -Math.acos(clamp((rightY - .032 - lifted) / 1.28, -.99, .99));
  let stickWorld = qmul(bodyYaw, qaxis([0, 0, 1], tilt));
  if (style === 'raise') stickWorld = qmul(bodyYaw, qmul(qaxis([0, 0, 1], tilt), qaxis([1, 0, 0], -2.7 * pulse(u, .04, .5, .98))));
  p.rot.RightHand = qmul(inverse(w.RightForeArm.q), stickWorld);
  if (twoHands) {
    const topGrip = add(w.RightHand.p, rotate(stickWorld, [0, .16, 0]));
    solveArm(p, 'Left', topGrip, atBody([.24, .24, .12]));
    const nw = jointWorld(p); p.rot.LeftHand = qmul(inverse(nw.LeftForeArm.q), stickWorld);
  }
  if (style === 'glow') {
    const e = pulse(u, .05, .5, .98), nw = jointWorld(p), current = nw.LeftHand.p;
    const low = atBody([.28, -.12, .4]);
    solveArm(p, 'Left', current.map((v, i) => lerp(v, low[i], e)), atBody([.32, .02, .15]));
    const ww = jointWorld(p); p.rot.LeftHand = qmul(inverse(ww.LeftForeArm.q), bodyYaw);
  }
  return p;
}

const support = (bone, start, end, edge = 'flat', duration = 1) => ({bone, start: rounded(start * duration), end: rounded(end * duration), contact: 'blade', timeUnit: 'seconds', localPointMeters: [0, -.08, 0], icePlaneMeters: 0, edge, allowSlide: true});
function contacts(spec) {
  const [id,, dur,,,, style] = spec;
  if (['stride', 'back'].includes(style)) return [support('LeftFoot', 0, .56, 'inside', dur), support('RightFoot', 0, .06, 'inside', dur), support('RightFoot', .5, 1, 'inside', dur)];
  if (style === 'cross') return [support('LeftFoot', .5, 1, 'outside', dur), support('RightFoot', 0, .5, 'inside', dur)];
  if (style === 'butterfly') return [support('LeftFoot', 0, .05, 'flat', dur), support('RightFoot', 0, .05, 'flat', dur), support('LeftFoot', .97, 1, 'flat', dur), support('RightFoot', .97, 1, 'flat', dur)];
  return [support('LeftFoot', 0, 1, style === 'stop' ? 'inside' : 'flat', dur), support('RightFoot', 0, 1, style === 'stop' ? 'outside' : 'flat', dur)];
}
function events(spec) {
  const [id,,dur,,,,style] = spec;
  const event = (phase, name, bone, labelHe) => ({timeSeconds: rounded(phase * dur), name, bone, domain: 'presentation', labelHe});
  const all = [event(0, 'stick_grip', 'RightHand', 'אחיזה במקל')];
  if (['wrist', 'slap', 'pass'].includes(style)) all.push(event(.5, 'visual_contact', 'RightHand', 'מגע המקל בדיסקית'), event(.56, 'visual_release', 'RightHand', 'שחרור הדיסקית'));
  if (style === 'receive') all.push(event(.45, 'visual_contact', 'RightHand', 'קבלת הדיסקית בלהב המקל'), event(.7, 'visual_control', 'RightHand', 'שליטה בדיסקית'));
  if (style === 'ghigh' || style === 'glow') all.push(event(.5, 'visual_contact', 'LeftHand', 'מגע הדיסקית בכפפה'));
  if (style === 'gstick') all.push(event(.5, 'visual_contact', 'RightHand', 'מגע הדיסקית במקל'));
  if (style === 'check') all.push(event(.5, 'visual_contact', 'Chest', 'מגע כתף מבוקר'));
  if (style === 'butterfly') all.push(event(.42, 'pad_contact', 'LeftLeg', 'מגע הרפידות בקרח'));
  return all;
}

const states = {}, measurement = [];
for (const spec of specs) {
  const [id, labelHe, durationSeconds, loop, gaitKind, speedMps, style, arg] = spec;
  const n = Math.round(durationSeconds * 30), keyframes = [];
  for (let i = 0; i <= n; i++) {
    const p = makePose(spec, i / n);
    keyframes.push({time: rounded(i / n), rotations: Object.fromEntries(CANON_NAMES.map(b => [b, qnorm(p.rot[b]).map(rounded)])), hipsOffsetMeters: p.hips.map(rounded)});
  }
  if (loop) keyframes[n] = {...structuredClone(keyframes[0]), time: 1};
  const referenceVelocityMps = style === 'gslide' ? [arg * speedMps, 0, 0] : style === 'cross' ? [arg * .6, 0, Math.sqrt(speedMps ** 2 - .36)] : [0, 0, style === 'back' ? -speedMps : speedMps];
  const referenceRootMotion = [{timeSeconds: 0, translationMeters: [0, 0, 0]}];
  let reference = [0, 0, 0];
  for (let i = 1; i <= n; i++) {
    const u = (i - .5) / n, yaw = style === 'turn' ? arg * DEG * smooth(u) : style === 'spin' ? TAU * smooth(u) : 0;
    const velocity = rotate(qaxis([0, 1, 0], yaw), referenceVelocityMps), decel = style === 'stop' ? 1 - smooth(u) : 1;
    reference = reference.map((v, k) => v + velocity[k] * decel / 30);
    referenceRootMotion.push({timeSeconds: rounded(i / 30), translationMeters: reference.map(rounded)});
  }
  const state = {clip: id, labelHe, role: id.startsWith('goalie_') ? 'goalie' : 'skater', group: gaitKind ? 'locomotion' : id.startsWith('ready') || style === 'gready' ? 'idle' : 'action', durationSeconds, fps: 30, loop, speedMps, referenceVelocityMps, referenceRootMotion, gaitKind, rootMotion: false, contactModel: 'sliding_blade', supports: contacts(spec), events: events(spec), ballContacts: [], keyframes};
  states[id] = state;
  const metrics = gaitMetrics(normaliseSoccerClip(id, state, 'hockey-v1'), 120);
  const fails = gaitKind ? checkGait(metrics, gaitKind) : state.group === 'idle' ? checkStand(metrics) : [];
  measurement.push({id, labelHe, gaitKind, metrics, fails});
}
const pack = {schemaVersion: 1, source: 'יצירה מקורית של Codex, source/build-clips.mjs, 12/11/2026', license: 'CC0-1.0', fps: 30, rig: CANON_BONES, contactTimeUnit: 'seconds', keyframeTimeUnit: 'normalized', stickAttachment: {bone: 'RightHand', node: 'RightHandGrip', handLocalMeters: [0, 0, 0], bladePointMeters: [0, -1.28, .31], secondaryGripMeters: [0, .16, 0]}, states};
writeFileSync(new URL('../clips.json', import.meta.url), JSON.stringify(pack, null, 1) + '\n');
writeFileSync(new URL('../motion-measure.json', import.meta.url), JSON.stringify({license: 'CC0-1.0', source: 'source/build-clips.mjs באמצעות athletes-core.mjs ללא שינוי', measurements: measurement, failures: measurement.filter(m => m.fails.length)}, null, 2) + '\n');
console.log(JSON.stringify({clips: specs.length, frames: Object.values(states).reduce((s, c) => s + c.keyframes.length, 0), failures: measurement.filter(m => m.fails.length), armMetrics: measurement.filter(m => m.gaitKind).map(m => ({id:m.id, abd:m.metrics.armAbdMax, swing:m.metrics.swingRange, elbow:m.metrics.elbowMean, lean:m.metrics.lean}))}, null, 1));
