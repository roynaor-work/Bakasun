/** Authored metadata only. No gameplay actions are triggered by these clips. */
const entries = [
  ['pass_chest', 'Chest pass', 'מסירת חזה', 1.12, false, 'held_ready', 'released_ready'],
  ['pass_bounce', 'Bounce pass', 'מסירת הקפצה', 1.22, false, 'held_ready', 'released_ready'],
  ['pass_overhead', 'Overhead pass', 'מסירה מעל הראש', 1.28, false, 'held_ready', 'released_ready'],
  ['pass_side', 'Side pass', 'מסירת צד', 1.16, false, 'held_ready', 'released_ready'],
  ['pass_jump', 'Jump pass', 'מסירת קפיצה', 1.3, false, 'held_ready', 'released_ready'],
  ['receive_two_hands', 'Two-hand receive', 'קבלה בשתי ידיים', 1.08, false, 'ready_empty', 'held_ready'],
  ['receive_moving', 'Receive in motion', 'קבלה בתנועה', 1.12, false, 'moving_empty', 'moving_held'],
  ['dribble_idle', 'Stationary dribble', 'כדרור במקום', .88, true, 'dribbling', 'dribbling'],
  ['dribble_run', 'Running dribble', 'כדרור בריצה', .72, true, 'running_dribble', 'running_dribble'],
  ['dribble_behind_back', 'Behind-back dribble', 'כדרור מאחורי הגב', 1.12, false, 'dribbling', 'dribbling_left'],
  ['stop_two_feet', 'Two-foot stop', 'עצירה בשתי רגליים', 1.16, false, 'running_dribble', 'held_stopped'],
  ['pivot', 'Pivot', 'ציר', 1.32, false, 'held_stopped', 'held_pivoted'],
  ['shot_start', 'Shot preparation', 'תחילת זריקה', 1.26, false, 'held_ready', 'shot_released'],
  ['block', 'Block', 'חסימה', 1.26, false, 'defensive_ready', 'defensive_ready'],
  ['steal', 'Steal attempt', 'ניסיון חטיפה', 1.16, false, 'defensive_ready', 'held_ready'],
];
export const CATALOG = Object.freeze(entries.map(([id, label, labelHe, durationSeconds, loop, startState, endState]) => Object.freeze({
  id, label, labelHe, durationSeconds, loop, startState, endState,
  glb: `runtime/clips/${id}.glb`, json: `runtime/keyframes/${id}.json.gz`,
})));
export const CLIP_IDS = Object.freeze(CATALOG.map(clip => clip.id));
export const CLIPS = Object.freeze(Object.fromEntries(CATALOG.map(clip => [clip.id, clip])));
export const CANONICAL_BONE_NAMES = Object.freeze(['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head',
  'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']);
