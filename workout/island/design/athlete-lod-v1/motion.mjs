// Read the shipped motion packs without editing or regenerating their animation.
export const BONE_NAMES = ['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head',
  'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
export const CLIPS = [
  {id: 'run', label: 'ריצה'}, {id: 'sprint', label: 'ספרינט'},
  {id: 'spin_kick', label: 'בעיטה בסיבוב'}, {id: 'throw_in', label: 'הוצאת חוץ'},
  {id: 'jump_shot', label: 'קליעת ניתור'},
];
export const MOTION_PATHS = ['../../assets/soccer-v12/clips.json', '../../assets/hoops-tall/motion-v12.json'];

function int16(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Int16Array(bytes.buffer);
}

export function buildClips(T, soccer, hoops, profile) {
  // Same rest-relative translation scale as minigames/athlete-body-v22.mjs.
  const legRatio = {guard: .824177, wing: .782552, center: .744929}[profile] ?? .782552;
  return Object.fromEntries(CLIPS.map(({id}) => {
    let times, rotations, hips;
    if (id === 'jump_shot') {
      const clip = hoops.clips[id], q = int16(clip.quat), h = int16(clip.hips);
      times = Array.from({length: clip.frames}, (_, i) => i / hoops.fps);
      rotations = BONE_NAMES.map((_, b) => times.flatMap((_, f) =>
        Array.from(q.subarray((f * 18 + b) * 4, (f * 18 + b + 1) * 4), v => v / 32767)));
      hips = times.flatMap((_, f) => [h[f * 3] / 10000 * legRatio,
        .86 + h[f * 3 + 1] / 10000 * legRatio, h[f * 3 + 2] / 10000 * legRatio]);
    } else {
      const clip = soccer.libraries.v9[id];
      times = clip.keyframes.map(f => f.time * clip.durationSeconds);
      rotations = BONE_NAMES.map(name => clip.keyframes.flatMap(f => f.rotations[name]));
      hips = clip.keyframes.flatMap(f => {
        const offset = f.hipsOffsetMeters || [0, 0, 0];
        return [offset[0], .86 + offset[1], offset[2]];
      });
    }
    // The packed source has quantized quaternions. Normalize without retargeting.
    const tracks = BONE_NAMES.map((name, i) => {
      const values = rotations[i];
      for (let k = 0; k < values.length; k += 4) {
        const length = Math.hypot(...values.slice(k, k + 4));
        if (!length) throw Error(`Invalid quaternion: ${id}/${name}`);
        for (let c = 0; c < 4; c++) values[k + c] /= length;
      }
      return new T.QuaternionKeyframeTrack(name + '.quaternion', times, values);
    });
    tracks.push(new T.VectorKeyframeTrack('Hips.position', times, hips));
    return [id, new T.AnimationClip(id, times.at(-1), tracks)];
  }));
}
