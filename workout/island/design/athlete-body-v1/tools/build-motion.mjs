/**
 * Original CC0-1.0 build adapter for athlete-body-v1.
 * Source animations: motion-fix-v12 @ 5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad (CC0).
 * The canonical bone contract is derived from athletes-core.mjs CANON_BONES.
 *
 * ATHLETE_NODE_MODULES=/tmp/athlete-tools/node_modules node tools/build-motion.mjs \
 *   /tmp/athlete-reference/workout/island/design/motion-fix-v12
 *
 * Build dependencies only: @gltf-transform/core 4.2.1 and gltf-validator 2.0.0-dev.3.10.
 * No source geometry, textures, codecs, or decoder dependencies enter the output.
 */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const dependencyBase = dirname(process.env.ATHLETE_NODE_MODULES || '/tmp/athlete-tools/node_modules');
const {Document, NodeIO} = require(require.resolve('@gltf-transform/core', {paths: [dependencyBase]}));
const validator = require(require.resolve('gltf-validator', {paths: [dependencyBase]}));
const outputBase = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceBase = resolve(process.argv[2] || '/tmp/athlete-reference/workout/island/design/motion-fix-v12');
const SOURCE_COMMIT = '5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad';
const SOURCE_REF = 'codex/motion-fix-v12';
const SOURCE_CATALOG_SHA256 = 'be2ff1a59824a499f97e548c94ca2fa0a5caebd3371305c2deab4372f57b7f2c';
const SOURCE_MANIFEST_SHA256 = 'e0d4ec92b63d8b14b77b20b6c259d6db19782523605683c6a3d08a04c79f950b';
const SOURCE_BLOCKLIST_SHA256 = '473845325ab93f77848228d949b442b6aa0e322a3b66fe51af1f8220db76ed49';
const CANON = [
  ['Root', null, [0, 0, 0]],
  ['Hips', 'Root', [0, .86, 0]],
  ['Spine', 'Hips', [0, .2, 0]],
  ['Chest', 'Spine', [0, .18, 0]],
  ['Neck', 'Chest', [0, .1, 0]],
  ['Head', 'Neck', [0, .13, 0]],
  ['LeftArm', 'Chest', [.16, .06, 0]],
  ['LeftForeArm', 'LeftArm', [0, -.27, 0]],
  ['LeftHand', 'LeftForeArm', [0, -.24, 0]],
  ['RightArm', 'Chest', [-.16, .06, 0]],
  ['RightForeArm', 'RightArm', [0, -.27, 0]],
  ['RightHand', 'RightForeArm', [0, -.24, 0]],
  ['LeftUpLeg', 'Hips', [.1, 0, 0]],
  ['LeftLeg', 'LeftUpLeg', [0, -.41, 0]],
  ['LeftFoot', 'LeftLeg', [0, -.37, 0]],
  ['RightUpLeg', 'Hips', [-.1, 0, 0]],
  ['RightLeg', 'RightUpLeg', [0, -.41, 0]],
  ['RightFoot', 'RightLeg', [0, -.37, 0]],
];
const selections = {
  'soccer-v9': ['walk', 'run', 'sprint', 'cut_90', 'throw_in'],
  'soccer-v10': ['cut_45_left', 'cut_90_right', 'first_touch_chest_standing_quick', 'goalkeeper_long_goal_kick', 'brake_reaccelerate'],
  'soccer-v11': ['dribble_slow', 'pass_cross_left', 'shot_volley', 'set_throw_in', 'keeper_dive_right'],
  'hoops-tall-v1': ['guard/v9/run', 'guard/v9/dribble_crossover_left', 'wing/v9/jump_shot', 'center/v9/dunk_two_hands', 'center/v9/defensive_slide_left'],
  'hoops-v11': ['guard/dribble_between_legs', 'wing/pass_chest', 'center/jump_shot', 'guard/fadeaway', 'center/shot_block'],
};
const labels = {
  'soccer-v9/walk': 'הליכה', 'soccer-v9/run': 'ריצה', 'soccer-v9/sprint': 'ספרינט',
  'soccer-v9/cut_90': 'חיתוך 90 מעלות', 'soccer-v9/throw_in': 'הוצאת חוץ',
  'soccer-v10/cut_45_left': 'חיתוך שמאלה 45 מעלות', 'soccer-v10/cut_90_right': 'חיתוך ימינה 90 מעלות',
  'soccer-v10/first_touch_chest_standing_quick': 'עצירת חזה', 'soccer-v10/goalkeeper_long_goal_kick': 'בעיטת שוער ארוכה',
  'soccer-v10/brake_reaccelerate': 'בלימה והאצה', 'soccer-v11/dribble_slow': 'כדרור איטי',
  'soccer-v11/pass_cross_left': 'הגבהה משמאל', 'soccer-v11/shot_volley': 'בעיטת יעף',
  'soccer-v11/set_throw_in': 'הוצאת חוץ בעמידה', 'soccer-v11/keeper_dive_right': 'זינוק שוער ימינה',
  'hoops-tall-v1/guard/v9/run': 'רכז · ריצה', 'hoops-tall-v1/guard/v9/dribble_crossover_left': 'רכז · שינוי יד שמאלה',
  'hoops-tall-v1/wing/v9/jump_shot': 'קיצוני · קליעת ניתור', 'hoops-tall-v1/center/v9/dunk_two_hands': 'סנטר · הטבעה בשתי ידיים',
  'hoops-tall-v1/center/v9/defensive_slide_left': 'סנטר · תנועת הגנה שמאלה',
  'hoops-v11/guard/dribble_between_legs': 'רכז · כדרור בין הרגליים', 'hoops-v11/wing/pass_chest': 'קיצוני · מסירת חזה',
  'hoops-v11/center/jump_shot': 'סנטר · קליעת ניתור', 'hoops-v11/guard/fadeaway': 'רכז · קליעה בנסיגה',
  'hoops-v11/center/shot_block': 'סנטר · חסימת קליעה',
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const catalogBytes = await readFile(join(sourceBase, 'runtime/catalog.json'));
if (sha256(catalogBytes) !== SOURCE_CATALOG_SHA256) throw new Error('Source catalog does not match the pinned commit.');
const catalog = JSON.parse(catalogBytes);
const sourceManifestBytes = await readFile(join(sourceBase, 'manifest.json'));
if (sha256(sourceManifestBytes) !== SOURCE_MANIFEST_SHA256) throw new Error('Source manifest does not match the pinned commit.');
const sourceManifest = JSON.parse(sourceManifestBytes);
const blocklistBytes = await readFile(join(sourceBase, 'blocklist.json'));
if (sha256(blocklistBytes) !== SOURCE_BLOCKLIST_SHA256) throw new Error('Source blocklist does not match the pinned commit.');
const blocklist = JSON.parse(blocklistBytes);
const blockedKeys = new Set((Array.isArray(blocklist) ? blocklist : blocklist.clips || blocklist.blocked || []).map(x => typeof x === 'string' ? x : x.key));
const io = new NodeIO();
const entries = [];
const canonicalLegLength = .41 + .37;

for (const [library, ids] of Object.entries(selections)) for (const id of ids) {
  const key = `${library}/${id}`;
  const sourceEntry = catalog.clips.find(c => c.key === key && c.status !== 'blocked');
  if (!sourceEntry || blockedKeys.has(key)) throw new Error(`Clip is not admitted: ${key}`);
  const sourceBytes = await readFile(join(sourceBase, sourceEntry.animation));
  const declared = sourceManifest.clips.find(c => c.key === key);
  if (declared?.after?.animation !== sourceEntry.animation || declared.after.sha256 !== sha256(sourceBytes)) throw new Error(`Source GLB does not match the pinned manifest: ${key}`);
  const source = await io.readBinary(new Uint8Array(sourceBytes));
  const sourceNodes = new Map(source.getRoot().listNodes().map(node => [node.getName(), node]));
  const sourceAnimation = source.getRoot().listAnimations()[0];
  if (!sourceAnimation) throw new Error(`No animation: ${key}`);
  const sourceChannels = new Map(sourceAnimation.listChannels().map(c => [`${c.getTargetNode().getName()}.${c.getTargetPath()}`, c]));
  const allTimes = sourceAnimation.listSamplers().flatMap(s => Array.from(s.getInput().getArray()));
  const duration = Math.max(...allTimes);
  const legLength = side => Math.hypot(...sourceNodes.get(`${side}Leg`).getTranslation()) + Math.hypot(...sourceNodes.get(`${side}Foot`).getTranslation());
  const sourceLegLength = (legLength('Left') + legLength('Right')) / 2;
  const hipsScale = canonicalLegLength / sourceLegLength;
  const sourceHipsRest = sourceNodes.get('Hips').getTranslation();
  const targetHipsRest = [0, .86, 0];
  const doc = new Document();
  const buffer = doc.createBuffer('animation');
  const scene = doc.createScene('canonical18');
  const nodes = new Map(CANON.map(([name, , rest]) => [name, doc.createNode(name).setTranslation(rest)]));
  for (const [name, parent] of CANON) {
    if (parent) nodes.get(parent).addChild(nodes.get(name));
    else scene.addChild(nodes.get(name));
  }
  const animation = doc.createAnimation(key).setExtras({
    license: 'CC0-1.0', sourceKey: key, sourceCommit: SOURCE_COMMIT,
    rotationPolicy: 'Source quaternion samples and times preserved exactly; missing channels bind to identity.',
    translationPolicy: 'Root and Hips are retargeted rest-relative by the mean leg-length ratio; no limb translations or scale channels.',
    hipsScale,
  });
  const expected = new Map();
  const addTrack = (name, path, times, values, type) => {
    const input = doc.createAccessor(`${name}.${path}.time`).setType('SCALAR').setArray(Float32Array.from(times)).setBuffer(buffer);
    const output = doc.createAccessor(`${name}.${path}.value`).setType(type).setArray(Float32Array.from(values)).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(name)).setTargetPath(path).setSampler(sampler));
    expected.set(`${name}.${path}`, {times: input.getArray().slice(), values: output.getArray().slice()});
  };
  let sourceRotationChannels = 0;
  for (const [name] of CANON) {
    const channel = sourceChannels.get(`${name}.rotation`);
    if (channel) {
      const sampler = channel.getSampler();
      if (sampler.getInterpolation() !== 'LINEAR') throw new Error(`Unexpected interpolation: ${key} ${name}`);
      addTrack(name, 'rotation', sampler.getInput().getArray(), sampler.getOutput().getArray(), 'VEC4');
      sourceRotationChannels++;
    } else {
      const rest = sourceNodes.get(name)?.getRotation() || [0, 0, 0, 1];
      if (rest.some((v, i) => Math.abs(v - [0, 0, 0, 1][i]) > 1e-8)) throw new Error(`Unexpected rest rotation: ${key} ${name}`);
      addTrack(name, 'rotation', [0, duration], [0, 0, 0, 1, 0, 0, 0, 1], 'VEC4');
    }
  }
  for (const name of ['Root', 'Hips']) {
    const channel = sourceChannels.get(`${name}.translation`);
    const targetRest = name === 'Hips' ? targetHipsRest : [0, 0, 0];
    if (!channel) {
      addTrack(name, 'translation', [0, duration], [...targetRest, ...targetRest], 'VEC3');
      continue;
    }
    const sampler = channel.getSampler();
    const sourceRest = sourceNodes.get(name).getTranslation();
    const values = sampler.getOutput().getArray();
    const retargeted = Float32Array.from(values, (value, i) => targetRest[i % 3] + (value - sourceRest[i % 3]) * hipsScale);
    addTrack(name, 'translation', sampler.getInput().getArray(), retargeted, 'VEC3');
  }
  const slug = id.replaceAll('/', '__');
  const path = `runtime/motion/${library}/${slug}.glb`;
  const bytes = await io.writeBinary(doc);
  const validation = await validator.validateBytes(bytes, {uri: path, maxIssues: 1000});
  if (validation.issues.numErrors || validation.issues.numWarnings) throw new Error(`${path}: validator errors=${validation.issues.numErrors}, warnings=${validation.issues.numWarnings}: ${JSON.stringify(validation.issues.messages)}`);
  const readback = await io.readBinary(bytes);
  let rotationMaxAbsoluteError = 0;
  for (const channel of readback.getRoot().listAnimations()[0].listChannels()) {
    const name = channel.getTargetNode().getName(), field = channel.getTargetPath();
    const sample = channel.getSampler(), original = expected.get(`${name}.${field}`);
    const times = sample.getInput().getArray(), values = sample.getOutput().getArray();
    if (times.length !== original.times.length || values.length !== original.values.length) throw new Error(`Readback size changed: ${path} ${name}.${field}`);
    if (times.some((v, i) => v !== original.times[i])) throw new Error(`Readback time changed: ${path} ${name}.${field}`);
    const maxError = values.reduce((m, v, i) => Math.max(m, Math.abs(v - original.values[i])), 0);
    if (field === 'rotation') rotationMaxAbsoluteError = Math.max(rotationMaxAbsoluteError, maxError);
    if (maxError !== 0) throw new Error(`Readback samples changed: ${path} ${name}.${field}`);
  }
  await mkdir(dirname(join(outputBase, path)), {recursive: true});
  await writeFile(join(outputBase, path), bytes);
  entries.push({
    id: key, library, label: labels[key], path, animationName: key, duration,
    loop: false, sourceLoop: !!sourceEntry.metadata?.originalLoop,
    coreRange: sourceEntry.metadata?.coreRange || null,
    sourceKey: key,
    sourcePath: `workout/island/design/motion-fix-v12/${sourceEntry.animation}`,
    sourceSha256: sha256(sourceBytes), sourceCommit: SOURCE_COMMIT,
    sourceBytes: sourceBytes.byteLength,
    sourceCatalogEntrySha256: sha256(JSON.stringify(sourceEntry)),
    originalSource: {commit: sourceEntry.source.commit, path: sourceEntry.source.path, license: 'CC0-1.0'},
    sourceProfile: sourceEntry.profile || 'canonical18',
    sourceLegLength, targetLegLength: canonicalLegLength, hipsScale, sourceHipsRest, targetHipsRest,
    sourceRotationChannels, identityRotationChannels: 18 - sourceRotationChannels,
    rotationMaxAbsoluteError, quaternionSamplesPreserved: true,
    sourceCatalogMetadata: {rootMotionApplied: !!sourceEntry.metadata?.rootMotionApplied, coordinateSpace: sourceEntry.metadata?.coordinateSpace || null},
    retarget: 'Rest-relative uniform translation scale on Hips and Root. Bone rotations are unchanged. Fixed canonical limb lengths. Ball and other accessories omitted.',
    motionScaleNote: 'The actor wrapper scales the entire canonical rig and animation together. Travel speed and body-space displacement scale by hipsScale × actorScale; cadence and duration are unchanged. Prop contacts and world-space targets require integration calibration.',
    bytes: bytes.byteLength, sha256: sha256(bytes), license: 'CC0-1.0',
    validation: {errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, infos: validation.issues.numInfos, hints: validation.issues.numHints},
  });
  console.log(`${key}: ${bytes.byteLength} bytes, hipsScale ${hipsScale.toFixed(6)}, validator 0 errors/0 warnings`);
}
const manifest = {
  schemaVersion: 1, rig: 'canonical18', license: 'CC0-1.0',
  catalog: {
    path: 'workout/island/design/motion-fix-v12/runtime/catalog.json',
    ref: SOURCE_REF, commit: SOURCE_COMMIT, sha256: sha256(catalogBytes),
    url: `https://github.com/roynaor-work/Bakasun/blob/${SOURCE_COMMIT}/workout/island/design/motion-fix-v12/runtime/catalog.json`,
    blocklistPath: 'workout/island/design/motion-fix-v12/blocklist.json',
    blocklistSha256: sha256(blocklistBytes),
    sourceManifestPath: 'workout/island/design/motion-fix-v12/manifest.json',
    sourceManifestSha256: sha256(sourceManifestBytes),
  },
  canonicalBonesSource: {
    path: 'workout/island/minigames/athletes-core.mjs',
    ref: 'claude/unified-athletes-v1', symbol: 'CANON_BONES',
  },
  retargetPolicy: 'All 18 target bones use the exact canonical bind. Source rotation keyframes and their times are copied without modification. Missing rotation channels explicitly reset to identity. Root and Hips translations are rest-relative, scaled by canonical/source mean leg length. Other joint translations and scale channels are absent. This is body retargeting, not a revalidation of game-specific foot-lock or ball-contact constraints.',
  playbackPolicy: 'Full repaired clips include idle handles and are one-shots, as in the source catalog. sourceLoop/coreRange expose the original cyclic segment without silently dropping the repaired handles.',
  clips: entries,
};
await writeFile(join(outputBase, 'motion-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${entries.length} clips / ${Object.keys(selections).length} libraries / ${entries.reduce((s, c) => s + c.bytes, 0)} bytes.`);
