/** Baked exercise authoring: fixed-length limbs and world-space contact targets. */
import * as T from './vendor/three.module.js';

export const EXERCISE_ANIMATIONS = Object.freeze([
  { id: 'squats', name: 'סקוואט', duration: 2.4, description: 'יורדים כמו לשבת על כיסא, ידיים קדימה וגב ישר. הברכיים בכיוון כפות הרגליים.', repetition: 'ירידה ועלייה אחת.' },
  { id: 'jumping-jacks', name: 'קפיצות פיסוק', duration: 2.2, description: 'קופצים ופותחים רגליים וידיים, קופצים וסוגרים; נחיתה רכה.', repetition: 'פתיחה וסגירה אחת.' },
  { id: 'high-knees', name: 'ברכיים גבוהות', duration: 2.2, description: 'רצים במקום ומרימים ברך לכיוון הבטן; היד הנגדית עוזרת כמו בריצה.', repetition: 'מחזור צעד זוגי: שמאל ואז ימין.' },
  { id: 'lunges', name: 'מכרעים', duration: 2.5, description: 'מנח צעד גדול, שמאל קדימה. יורדים עם גוף זקוף ועולים; לאחר ההדגמה מחליפים רגל.', repetition: 'ירידה ועלייה אחת, שמאל קדימה.' },
  { id: 'push-ups', name: 'שכיבות סמיכה', duration: 2.4, description: 'כפות ידיים על הרצפה. מורידים חזה בכיפוף מרפקים ודוחפים; כתפיים, אגן וקרסוליים בקו ישר.', repetition: 'ירידה ודחיפה אחת.' },
  { id: 'knee-push-ups', name: 'שכיבות סמיכה על הברכיים', duration: 2.4, description: 'ברכיים על הרצפה וידיים מתחת לכתפיים. יורדים לאט ודוחפים; הגוף ישר מהברכיים לכתפיים.', repetition: 'ירידה ודחיפה אחת.' },
  { id: 'glute-bridge', name: 'גשר ישבן', duration: 2.5, description: 'שוכבים על הגב וברכיים כפופות. מרימים אגן לקו ישר, מחזיקים ויורדים לאט בלי לקמר גב.', repetition: 'הרמה, החזקה וירידה אחת.' },
]);

const cache = new WeakMap();
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const Q = (x = 0, y = 0, z = 0) => new T.Quaternion().setFromEuler(new T.Euler(x, y, z));
const TAU = 2 * Math.PI;
const smooth = (a, b, x) => T.MathUtils.smoothstep(x, a, b);
const worldPosition = b => b.getWorldPosition(V());
function update(model) {
  model.root.updateMatrixWorld(true);
  for (const skeleton of model.skeletons || [model.skeleton]) skeleton?.update();
}

function initialize(model) {
  if (cache.has(model)) return cache.get(model);
  update(model);
  const state = {
    rest: new Map(model.bones.map(b => [b.name, { position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone() }])),
    foot: {}, palms: {}, head: [], standingHip: model.byName.Hips.position.clone(),
  };
  for (const side of ['L', 'R']) {
    const bone = model.byName['Foot_' + side], inverse = bone.matrixWorld.clone().invert(), points = [];
    bone.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) points.push(mesh.getVertexPosition(i, V()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
    });
    const pivot = worldPosition(bone);
    state.foot[side] = { points, pivot };
    const hand = model.byName['Hand_' + side], handInverse = hand.matrixWorld.clone().invert(), handPoints = [];
    const indices = new Set(model.bones.filter(b => b.name === hand.name || b.name.startsWith('Finger') && b.name.endsWith('_' + side)).map(b => model.skeleton?.bones.indexOf(b)));
    model.root.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      const p = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
      for (let i = 0; i < p.count; i++) {
        let weight = 0;
        for (let slot = 0; slot < 4; slot++) if (indices.has(si.array[i * 4 + slot])) weight += sw.array[i * 4 + slot];
        if (weight > .5) handPoints.push(mesh.getVertexPosition(i, V()).applyMatrix4(mesh.matrixWorld).applyMatrix4(handInverse));
      }
    });
    state.palms[side] = handPoints;
  }
  const headInverse = model.byName.Head.matrixWorld.clone().invert();
  model.byName.Head.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) state.head.push(mesh.getVertexPosition(i, V()).applyMatrix4(mesh.matrixWorld).applyMatrix4(headInverse));
  });
  cache.set(model, state);
  return state;
}

function reset(model, state) {
  for (const bone of model.bones) {
    const rest = state.rest.get(bone.name);
    bone.position.copy(rest.position); bone.quaternion.copy(rest.quaternion); bone.scale.copy(rest.scale);
  }
  (model.ball || model.byName.Ball)?.scale.setScalar(0);
  model.root.traverse(mesh => { if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0); });
  update(model);
}

function worldQuaternion(model, bone, quaternion) {
  const parent = bone.parent?.getWorldQuaternion(new T.Quaternion()) || new T.Quaternion();
  bone.quaternion.copy(parent.invert().multiply(quaternion));
  update(model);
}

/** The pole sets the anatomical bend plane; no joint translations or scaling. */
function twoBone(model, upper, lower, end, target, pole, diagnostics) {
  const a = model.byName[upper], b = model.byName[lower], c = model.byName[end];
  update(model);
  const start = worldPosition(a), direction = target.clone().sub(start), requested = direction.length();
  const first = b.position.length(), second = c.position.length();
  const distance = T.MathUtils.clamp(requested, Math.abs(first - second) + 1e-5, first + second - 1e-5);
  direction.normalize();
  const bend = pole.clone().addScaledVector(direction, -pole.dot(direction));
  if (bend.lengthSq() < 1e-8) bend.copy(V(1, 0, 0)).addScaledVector(direction, -direction.x);
  bend.normalize();
  const along = (first * first - second * second + distance * distance) / (2 * distance);
  const elbow = start.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, first * first - along * along)));
  const reached = start.clone().addScaledVector(direction, distance);
  worldQuaternion(model, a, new T.Quaternion().setFromUnitVectors(b.position.clone().normalize(), elbow.clone().sub(start).normalize()));
  worldQuaternion(model, b, new T.Quaternion().setFromUnitVectors(c.position.clone().normalize(), reached.clone().sub(elbow).normalize()));
  diagnostics.targets[end] = { requested: target.toArray(), reached: worldPosition(c).toArray(), error: worldPosition(c).distanceTo(target) };
  return elbow;
}

function support(points, quaternion) {
  let min = Infinity, lowest = V();
  for (const p of points) {
    const rotated = p.clone().applyQuaternion(quaternion);
    if (rotated.y < min) { min = rotated.y; lowest.copy(rotated); }
  }
  return { min, lowest };
}

function palmHeight(state, side, quaternion) { return -support(state.palms[side], quaternion).min + .003; }
function footHeight(state, side, quaternion) { return -support(state.foot[side].points, quaternion).min + .002; }
function leg(model, side, target, pole, quaternion, diagnostics) {
  twoBone(model, 'UpperLeg_' + side, 'LowerLeg_' + side, 'Foot_' + side, target, pole, diagnostics);
  worldQuaternion(model, model.byName['Foot_' + side], quaternion);
}
function arm(model, side, target, pole, quaternion, diagnostics) {
  twoBone(model, 'UpperArm_' + side, 'LowerArm_' + side, 'Hand_' + side, target, pole, diagnostics);
  worldQuaternion(model, model.byName['Hand_' + side], quaternion);
}
function hips(model, position, rotation) { model.byName.Hips.position.copy(position); model.byName.Hips.quaternion.copy(Q(rotation)); update(model); }

function standingArms(model, amount, diagnostics) {
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const shoulder = worldPosition(model.byName['UpperArm_' + side]);
    const target = shoulder.clone().add(V(sign * .02, -.18 - .25 * (1 - amount), .39 * amount));
    arm(model, side, target, V(sign, 0, .3), Q(-Math.PI / 2 * amount), diagnostics);
  }
}

function squats(model, state, phase, diagnostics) {
  const bend = Math.sin(Math.PI * phase) ** 2;
  hips(model, V(0, state.standingHip.y - .238 * bend, -.215 * bend), .22 * bend);
  for (const side of ['L', 'R']) leg(model, side, state.foot[side].pivot.clone(), V(0, 0, 1), Q(), diagnostics);
  standingArms(model, 1, diagnostics);
}

function jumpingJacks(model, state, phase, diagnostics) {
  const open = Math.sin(Math.PI * phase) ** 2, jump = .13 * Math.sin(TAU * phase) ** 2;
  const footX = .198 + .27 * open;
  const vertical = Math.sqrt(.6795 ** 2 - (footX - .165) ** 2);
  const heel = state.foot.R.pivot.y;
  hips(model, V(0, heel + vertical + .0465 + jump - .028 * open, 0), 0);
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    leg(model, side, V(sign * footX, heel + jump, -.008), V(0, 0, 1), Q(), diagnostics);
    const shoulder = worldPosition(model.byName['UpperArm_' + side]);
    const theta = .08 + 2.40 * open;
    const target = shoulder.clone().add(V(sign * .515 * Math.sin(theta), -.515 * Math.cos(theta), .025));
    arm(model, side, target, V(sign, 0, .2), Q(0, 0, sign * theta), diagnostics);
  }
}

function highKnees(model, state, phase, diagnostics) {
  phase = (phase + .25) % 1;
  const first = phase < .5, local = first ? phase * 2 : (phase - .5) * 2;
  const lift = Math.sin(Math.PI * local) ** 2, active = first ? 'L' : 'R';
  hips(model, V(0, state.standingHip.y - .012 * lift, 0), 0);
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const a = side === active ? lift : 0, target = state.foot[side].pivot.clone().add(V(0, .55 * a, .33 * a));
    leg(model, side, target, V(0, 0, 1), Q(-.12 * a), diagnostics);
    const swing = side === active ? -lift : lift, shoulder = worldPosition(model.byName['UpperArm_' + side]);
    arm(model, side, shoulder.clone().add(V(sign * .02, -.33 + .10 * swing, .27 * swing)), V(sign, 0, .8), Q(-.5 * swing), diagnostics);
  }
}

function lunges(model, state, phase, diagnostics) {
  const bend = Math.sin(Math.PI * phase) ** 2;
  const front = V(-.198, state.foot.L.pivot.y, .68);
  const backQuaternion = Q(1.28), backSupport = support(state.foot.R.points, backQuaternion);
  const back = V(.198, -backSupport.min + .002, -.06);
  hips(model, V(0, .90 - .36 * bend, .35 - .10 * bend), 0);
  leg(model, 'L', front, V(-.15, 0, 1), Q(), diagnostics);
  leg(model, 'R', back, V(.08, -1, .25), backQuaternion, diagnostics);
  standingArms(model, .15, diagnostics);
}

function pushUps(model, state, phase, knees, diagnostics) {
  const bend = Math.sin(Math.PI * phase) ** 2, inclination = .22 - .14 * bend;
  const rotation = Math.PI / 2 - inclination, bodyAxis = V(0, Math.sin(inclination), Math.cos(inclination));
  const handQuaternion = Q(-Math.PI / 2), footQuaternion = Q(.15);
  if (!knees) {
    const ankleY = footHeight(state, 'R', footQuaternion), ankleZ = -.69;
    hips(model, V(0, ankleY + .7254 * Math.sin(inclination), ankleZ + .7254 * Math.cos(inclination)), rotation);
    for (const side of ['L', 'R']) leg(model, side, V(side === 'L' ? -.198 : .198, ankleY, ankleZ), V(0, 0, 1), footQuaternion, diagnostics);
  } else {
    // The mixed knee/upper-shin skin needs .145 clearance around the pivot.
    const kneeY = .145, kneeZ = -.31;
    const kneeInclination = .55 - .18 * bend;
    const kneeRotation = Math.PI / 2 - kneeInclination;
    hips(model, V(0, kneeY + .3348 * Math.sin(kneeInclination) + .001 * Math.cos(kneeInclination), kneeZ + .3348 * Math.cos(kneeInclination) - .001 * Math.sin(kneeInclination)), kneeRotation);
    for (const [side, sign] of [['L', -1], ['R', 1]]) {
      const upper = model.byName['UpperLeg_' + side], lower = model.byName['LowerLeg_' + side], foot = model.byName['Foot_' + side];
      // The upper leg lies on the shoulder–hip–knee line; shins fold back/up.
      worldQuaternion(model, upper, Q(kneeRotation));
      worldQuaternion(model, lower, Q(2.45));
      worldQuaternion(model, foot, Q(2.45));
      diagnostics.targets[lower.name] = { requested: V(sign * .181, kneeY, kneeZ).toArray(), reached: worldPosition(lower).toArray(), error: worldPosition(lower).distanceTo(V(sign * .181, kneeY, kneeZ)) };
    }
  }
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const hand = V(sign * .31, palmHeight(state, side, handQuaternion), .51);
    arm(model, side, hand, V(sign * .38, -.1, -.8), handQuaternion, diagnostics);
  }
  diagnostics.bodyAxis = bodyAxis.toArray();
}

function gluteBridge(model, state, phase, diagnostics) {
  // The one-second top hold sits inside the 2.5-second repetition.
  const lift = smooth(0, .30, phase) * (1 - smooth(.70, 1, phase));
  const hipY = .215 + .19 * lift, shoulderY = .355;
  const inclination = Math.asin((shoulderY - hipY) / .4557), rotation = -Math.PI / 2 + inclination;
  hips(model, V(0, hipY, 0), rotation);
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    leg(model, side, V(sign * .198, state.foot[side].pivot.y, .65), V(0, 1, .4), Q(), diagnostics);
    const handQuaternion = Q(-Math.PI / 2);
    arm(model, side, V(sign * .40, palmHeight(state, side, handQuaternion), -.12), V(sign, -1, 0), handQuaternion, diagnostics);
  }
  // Neutral-ish neck flexion accommodates the one-unit head without sinking it.
  worldQuaternion(model, model.byName.Neck, Q(-Math.PI / 2 + .25));
  const pivotY = worldPosition(model.byName.Head).y;
  let lo = 0, hi = Math.max(0, inclination + .523);
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (pivotY + support(state.head, Q(-Math.PI / 2 + mid)).min < .004) lo = mid; else hi = mid;
  }
  worldQuaternion(model, model.byName.Head, Q(-Math.PI / 2 + hi));
  diagnostics.neckRelativeRadians = .25 - inclination;
}

/** Sets a complete pose; phase 0 and 1 are deliberately bit-identical. */
export function sampleExercise(model, id, phase) {
  if (!EXERCISE_ANIMATIONS.some(a => a.id === id)) throw new RangeError('Unknown exercise: ' + id);
  if (!Number.isFinite(phase)) throw new TypeError('Animation phase must be finite');
  const state = initialize(model), p = phase <= 0 || phase >= 1 ? 0 : phase;
  reset(model, state);
  const diagnostics = { id, phase: p, targets: {} };
  if (id === 'squats') squats(model, state, p, diagnostics);
  else if (id === 'jumping-jacks') jumpingJacks(model, state, p, diagnostics);
  else if (id === 'high-knees') highKnees(model, state, p, diagnostics);
  else if (id === 'lunges') lunges(model, state, p, diagnostics);
  else if (id === 'push-ups' || id === 'knee-push-ups') pushUps(model, state, p, id === 'knee-push-ups', diagnostics);
  else gluteBridge(model, state, p, diagnostics);
  update(model);
  model.exerciseDiagnostics = diagnostics;
  return diagnostics;
}
