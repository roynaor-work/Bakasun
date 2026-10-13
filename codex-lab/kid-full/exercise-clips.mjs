import * as T from './vendor/three.module.js';
import { EXERCISE_ANIMATIONS, sampleExercise } from './exercise-motion.mjs';

/** Bake the contact-aware poses once; playback needs only AnimationMixer. */
export function createExerciseClips(model) {
  return EXERCISE_ANIMATIONS.map(({ id, duration }) => {
    const times = Array.from({ length: 81 }, (_, i) => duration * i / 80);
    const samples = times.map((_, i) => {
      sampleExercise(model, id, i / 80);
      return { rotations: model.bones.map(b => b.quaternion.toArray()), hips: model.byName.Hips.position.toArray() };
    });
    // Identical stored endpoints, including signs of equivalent quaternions.
    samples[80] = structuredClone(samples[0]);
    const tracks = model.bones.map((b, i) => {
      const values = samples.map(s => s.rotations[i]);
      for (let k = 1; k < values.length; k++) if (values[k].reduce((sum, v, c) => sum + v * values[k - 1][c], 0) < 0) values[k] = values[k].map(v => -v);
      // No exercise completes a full 360° bone turn: retain a closed sign too.
      values[80] = [...values[0]];
      return new T.QuaternionKeyframeTrack(b.name + '.quaternion', times, values.flat());
    });
    tracks.push(new T.VectorKeyframeTrack('Hips.position', times, samples.flatMap(s => s.hips)));
    tracks.push(new T.VectorKeyframeTrack('Ball.scale', [0, duration], [0, 0, 0, 0, 0, 0]));
    tracks.push(new T.VectorKeyframeTrack('Ball.position', [0, duration], [0, 0, 0, 0, 0, 0]));
    // Neutral face is deliberate: full morph targets are retained in the GLB.
    model.root.traverse(node => {
      if (node.name === 'HeadExpressions') tracks.push(new T.NumberKeyframeTrack(node.name + '.morphTargetInfluences', [0, duration], Array(12).fill(0)));
    });
    return new T.AnimationClip(id, duration, tracks);
  });
}
