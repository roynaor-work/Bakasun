// SPDX-License-Identifier: CC0-1.0
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { GLB } from '../../firefighter-v1/source/glb.mjs';
import { bake, sampleRateHz, skeleton } from './pose.mjs';
import { stageActions } from './stage-actions.mjs';
import { carryActions } from './carry-actions.mjs';
import { teamActions } from './team-actions.mjs';

const definitions = [
  ['clear-path', 'ניקוי דרך', 'תופסים את המכשול בשתי ידיים ומזיזים אותו הצדה כדי לפנות מעבר.'],
  ['force-door', 'פתיחת דלת תקועה', 'נאחזים בידית, משחררים את הדלת ופותחים את המעבר.'],
  ['cut-tool', 'חיתוך עם כלי', 'מניחים את כלי החילוץ על המוט ומפנים את החלק שנחתך.'],
  ['lift-child', 'הרמת ילד', 'כורעים, תומכים בגוף הילד ומרימים אותו בשתי ידיים.'],
  ['carry-shoulder', 'נשיאה על הכתף', 'מייצבים את המחולץ על הכתף ומתקדמים בצעדים קצרים.'],
  ['carry-arms', 'נשיאה בידיים', 'מתקדמים כשהילד נתמך בשתי הזרועות.'],
  ['set-down', 'הנחה בבטחה', 'מורידים את הילד בהדרגה ומשחררים ידיים כשהוא יושב ביציבות.'],
  ['wrap-blanket', 'עטיפת שמיכה', 'פורשים שמיכה, עוטפים את המחולץ ומצמידים את השוליים.'],
  ['assist-walk', 'תמיכה בהליכה', 'מייצבים את המחולץ בכתף ומתקדמים יחד לנקודה בטוחה.'],
  ['pull-under-table', 'משיכה מתחת לשולחן', 'כורעים ומושכים את המחולץ אל מחוץ לשולחן.'],
  ['lift-cat', 'הרמת חתול', 'מתכופפים, תומכים בחתול ומרימים אותו קרוב לגוף.'],
  ['open-cage', 'פתיחת כלוב', 'משחררים את הבריח, מרחיקים את הדלת ונותנים לחתול לצאת.'],
  ['signal-clear', 'סימון פנוי', 'סורקים את המעבר ומסמנים לצוות ביד מורמת.'],
  ['handoff-medic', 'מסירה לחובש', 'מעבירים את משקל הילד לחובש לפני שהכבאי משחרר את הידיים.'],
];
const authored = new Map([...stageActions, ...carryActions, ...teamActions].map(action => [action.id, action]));
const bones = skeleton.bones;
const nodes = bones.map(({ name, restTranslationMeters }) => ({
  name, translation: restTranslationMeters,
}));
for (const [index, { parent }] of bones.entries()) {
  if (parent) {
    const parentNode = nodes.find(node => node.name === parent);
    (parentNode.children ??= []).push(index);
  }
}
const asset = 'fire-rescue-actions.glb';
const glb = new GLB(nodes);
glb.json.asset.generator = 'Bakasun fire-rescue-actions-v1';
glb.json.animations = [];
const actions = definitions.map(([id, label, description]) => {
  const source = authored.get(id);
  const { duration } = source;
  const { frames, attachments, propTracks, qa, maxGripError } = bake(source);
  const times = glb.accessor(frames.map(frame => frame.t), 'SCALAR');
  const channels = [];
  const samplers = [];
  function track(node, path, output, type) {
    const sampler = samplers.push({ input: times, output: glb.accessor(output, type), interpolation: 'LINEAR' }) - 1;
    channels.push({ sampler, target: { node, path } });
  }
  for (const [index] of bones.entries()) track(index, 'rotation', frames.flatMap(frame => frame.rotations[index]), 'VEC4');
  track(0, 'translation', frames.flatMap(frame => frame.root), 'VEC3');
  track(1, 'translation', frames.flatMap(frame => frame.hips), 'VEC3');
  const rootMotion = frames.some(frame => frame.root.some(value => Math.abs(value) > 1e-5));
  glb.json.animations.push({ name: id, channels, samplers, extras: { nativeRate: sampleRateHz, loop: false, rootMotion } });
  const worst = Math.max(0, ...Object.values(maxGripError));
  if (worst > .01) process.stderr.write(`${id} wrist error ${JSON.stringify(maxGripError)}\n`);
  return {
    id, label, description, duration, frameCount: frames.length, loop: false, rootMotion,
    icon: 'icons/' + id + '.svg',
    timer: { durationSeconds: duration, mode: 'countdown', completesAtFrame: frames.length - 1 },
    entryStance: source.entryStance ?? 'ready',
    exitStance: source.exitStance ?? 'ready',
    props: source.props, attachments, propTracks, events: source.events, qa,
  };
});
const bytes = glb.finish();
const catalog = {
  version: 'fire-rescue-actions-v1',
  asset,
  assetSha256: createHash('sha256').update(bytes).digest('hex'),
  sampleRateHz,
  character: '../fire-rescue-people-v2/models/young-firefighter.glb',
  skeleton: '../fire-rescue-people-v2/skeleton.json',
  previewModels: {
    child: '../fire-rescue-people-v2/models/boy.glb',
    adult: '../fire-rescue-people-v2/models/father.glb',
    cat: '../firefighter-v1/models/rescue-cat.glb',
  },
  units: 'meters',
  axes: skeleton.axes,
  boneCount: bones.length,
  rigSpace: 'canonical parent-local quaternions xyzw plus Root and Hips translations',
  propTrackSpace: 'world in the action scene, relative to the initial rescuer placement',
  propFrameLayout: ['x', 'y', 'z', 'rotXDegrees', 'rotYDegrees', 'rotZDegrees', 'poseBlendOptional'],
  propRotationOrder: 'XYZ',
  eventTimesUnit: 'seconds',
  actions,
};
writeFileSync(new URL('../' + asset, import.meta.url), bytes);
const formatted = JSON.stringify(catalog, null, 2).replace(/\[\n\s+(-?\d[^\[\]]*?)\n\s+\]/g,
  (_, numbers) => '[' + numbers.replace(/\s+/g, ' ') + ']');
writeFileSync(new URL('../catalog.json', import.meta.url), formatted + '\n');
