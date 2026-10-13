/** Verify exported interpolation and actual deformed vertices, including between keys. */
import assert from 'node:assert/strict';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from './vendor/three.module.js';
import { readGLB, readAccessor, createMotionModel, vertexBounds } from './glb-animation-io.mjs';

const path = new URL('./kid-full.glb', import.meta.url), { json, bin } = await readGLB(path);
const model = createMotionModel(json, bin), ids = ['squats','jumping-jacks','high-knees','lunges','push-ups','knee-push-ups','glute-bridge'];
const report = { sha256: createHash('sha256').update(await readFile(path)).digest('hex'), samplesPerClip: 161, maximumFloorPenetration: .015, clips: [], passed: true };
const point = new T.Vector3();
function minimumY(name) {
  let minimum = Infinity;
  model.byName[name].traverse(mesh => {
    if (!mesh.isMesh) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) minimum = Math.min(minimum, mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y);
  });
  return minimum;
}
for (const id of ids) {
  const animation = json.animations.find(a => a.name === id); assert.ok(animation, id);
  const tracks = animation.channels.filter(c => c.target.path !== 'weights').map(c => {
    const s = animation.samplers[c.sampler], property = { rotation:'quaternion', translation:'position', scale:'scale' }[c.target.path];
    const Track = c.target.path === 'rotation' ? T.QuaternionKeyframeTrack : T.VectorKeyframeTrack;
    return new Track(json.nodes[c.target.node].name + '.' + property, readAccessor(json,bin,s.input), readAccessor(json,bin,s.output));
  });
  const clip = new T.AnimationClip(id, -1, tracks), mixer = new T.AnimationMixer(model.root);
  const action = mixer.clipAction(clip); action.setLoop(T.LoopOnce,1); action.clampWhenFinished = true; action.play();
  const result = { id, duration:clip.duration, modelMinY:Infinity, headMinY:Infinity, leftShoeMinY:Infinity, rightShoeMinY:Infinity, maximumShoeElevation:0, largestStraightSpineError:0 };
  for (let i = 0; i <= 160; i++) {
    mixer.setTime(clip.duration*i/160);
    const bounds = vertexBounds(model); assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
    result.modelMinY = Math.min(result.modelMinY,bounds.min.y);
    result.headMinY = Math.min(result.headMinY,minimumY('Head'));
    const l = minimumY('ShoeSurface_Foot_L'), r = minimumY('ShoeSurface_Foot_R');
    result.leftShoeMinY = Math.min(result.leftShoeMinY,l); result.rightShoeMinY = Math.min(result.rightShoeMinY,r);
    result.maximumShoeElevation = Math.max(result.maximumShoeElevation,Math.min(l,r));
    const hip = model.byName.Hips.getWorldPosition(new T.Vector3()), spine = model.byName.Spine.getWorldPosition(new T.Vector3()), chest = model.byName.Chest.getWorldPosition(new T.Vector3());
    const line = chest.clone().sub(hip).normalize();
    result.largestStraightSpineError = Math.max(result.largestStraightSpineError,spine.clone().sub(hip).cross(line).length());
  }
  result.passed = result.modelMinY >= -report.maximumFloorPenetration;
  report.passed &&= result.passed; report.clips.push(result); mixer.stopAllAction();mixer.uncacheRoot(model.root);
}
await mkdir(new URL('./shots/animations/',import.meta.url),{recursive:true});
await writeFile(new URL('./shots/animations/motion-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (!report.passed) process.exitCode = 1;
