/** Independently check that authored landing events reach the visible ground. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as THREE from '../vendor/three.module.js';
import { sampleClip, contactsAt, applyPose, enforceContacts } from './motion-runtime.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.SOCCER_ASSET_TOOLS || '/tmp/soccer-v7-tools/package.json');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const codec = require('draco3dgltf');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await codec.createDecoderModule() });
const source = fs.readFileSync(path.join(root,'animations.json'));
const motion = JSON.parse(source), manifest = JSON.parse(fs.readFileSync(path.join(root,'asset-manifest.json')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const actor = new THREE.Group(), bones = {};
for (const spec of motion.skeleton.bones) {
  const bone = new THREE.Bone(); bone.name = spec.name; bone.position.fromArray(spec.restTranslationMeters); bones[spec.name] = bone;
  (spec.parent ? bones[spec.parent] : actor).add(bone);
}
const models = new Map();
async function modelFor(clip) {
  const role = clip.id.startsWith('keeper_') ? 'goalkeeper' : 'field';
  const character = manifest.characters.find(c => c.role === role);
  const file = (character.kits || [character])[0].lod0;
  if (models.has(file)) return models.get(file);
  const bytes = fs.readFileSync(path.join(root,file)), doc = await io.readBinary(bytes);
  const skin = doc.getRoot().listSkins()[0], names = skin.listJoints().map(j => j.getName());
  const inverse = skin.getInverseBindMatrices().getArray();
  const matrices = names.map((name,index) => ({ name, inverse: new THREE.Matrix4().fromArray(inverse,index*16) }));
  const primitives = doc.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives()).map(p => ({
    positions: p.getAttribute('POSITION').getArray(), joints: p.getAttribute('JOINTS_0').getArray(), weights: p.getAttribute('WEIGHTS_0').getArray(),
  }));
  const model = { file, bytes: bytes.length, sha256: hash(bytes), matrices, primitives };
  models.set(file,model); return model;
}
function minimumY(model,clip,time) {
  const pose = sampleClip(THREE,clip,time);
  actor.position.fromArray(pose.referenceRootTranslationMeters); applyPose(bones,pose); actor.updateMatrixWorld(true);
  enforceContacts(THREE,bones,contactsAt(clip,time));
  const matrices = model.matrices.map(j => new THREE.Matrix4().copy(bones[j.name].matrixWorld).multiply(j.inverse).elements);
  let minimum = Infinity;
  for (const p of model.primitives) for (let i=0;i<p.positions.length/3;i++) {
    let y = 0;
    for (let k=0;k<4;k++) {
      const weight = p.weights[i*4+k]; if (!weight) continue;
      const matrix = matrices[p.joints[i*4+k]];
      y += weight*(matrix[1]*p.positions[i*3]+matrix[5]*p.positions[i*3+1]+matrix[9]*p.positions[i*3+2]+matrix[13]);
    }
    minimum = Math.min(minimum,y);
  }
  return minimum;
}
const rows = [];
for (const clip of motion.clips) {
  const events = clip.events.filter(event => /(?:side_land|dive_settled|slide_settled|visual_land|visual_palm_ground|palms_support_ground|braking_stopped|recovered_standing)/.test(event.name));
  if (!events.length) continue;
  const model = await modelFor(clip);
  for (const event of events) {
    const rawMinimumYMeters = minimumY(model,clip,event.timeSeconds);
    rows.push({ clip: clip.id, event: event.name, timeSeconds: event.timeSeconds, model: model.file,
      rawMinimumYMeters, minimumYAfterFloorCorrectionMeters: Math.max(.002,rawMinimumYMeters),
      floorLiftMeters: Math.max(0,.002-rawMinimumYMeters), pass: rawMinimumYMeters < .02 });
  }
}
const report = { schemaVersion:1, motionSha256:hash(source), landingMaximumClearanceMeters:.02,
  models:[...models.values()].map(({file,bytes,sha256})=>({file,bytes,sha256})), rows, pass:rows.every(row=>row.pass),
  limitations:['Canonical FK/contact IK and complete decoded-vertex skinning; this is independent of the viewer blend and floor implementation.',
    'A low vertex at an event does not prove physically realistic weight support or damping. This only catches floating landings.'] };
fs.writeFileSync(path.join(root,'source/motion-ground-events.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if (!report.pass) process.exitCode = 1;
