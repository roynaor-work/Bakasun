import {Matrix4, Quaternion, Vector3} from '../vendor/three.module.js';
import {accessor, rawAccessor} from './glb.mjs';

function sampleChannel(doc, channel, sampler, time) {
  const input = accessor(doc, sampler.input), output = accessor(doc, sampler.output), path = channel.target.path;
  const node = doc.json.nodes[channel.target.node];
  const width = path === 'weights' ? doc.json.meshes[node.mesh].primitives[0].targets.length : path === 'rotation' ? 4 : 3;
  const cubic = sampler.interpolation === 'CUBICSPLINE', stride = width * (cubic ? 3 : 1);
  let low = 0, high = input.length - 1;
  if (time >= input[high]) low = high;
  else while (low + 1 < high) {const middle = (low + high) >> 1; if (input[middle] <= time) low = middle; else high = middle;}
  const next = Math.min(low + 1, input.length - 1), dt = input[next] - input[low], t = dt ? Math.max(0, Math.min(1, (time - input[low]) / dt)) : 0;
  const first = Array.from(output.subarray(low * stride + (cubic ? width : 0), low * stride + (cubic ? width * 2 : width)));
  const last = Array.from(output.subarray(next * stride + (cubic ? width : 0), next * stride + (cubic ? width * 2 : width)));
  if (sampler.interpolation === 'STEP' || low === next) return first;
  if (cubic) {
    const a = 2 * t ** 3 - 3 * t ** 2 + 1, b = t ** 3 - 2 * t ** 2 + t, c = -2 * t ** 3 + 3 * t ** 2, d = t ** 3 - t ** 2;
    const result = first.map((v, i) => a * v + b * dt * output[low * stride + width * 2 + i] + c * last[i] + d * dt * output[next * stride + i]);
    if (path === 'rotation') return new Quaternion().fromArray(result).normalize().toArray();
    return result;
  }
  if (path === 'rotation') return new Quaternion().fromArray(first).slerp(new Quaternion().fromArray(last), t).toArray();
  return first.map((v, i) => v + (last[i] - v) * t);
}

export function clipDuration(doc, clip) {
  return Math.max(0, ...clip.samplers.map(s => {const a = accessor(doc, s.input); return a[a.length - 1];}));
}

// Evaluate glTF in world metres, including scene transforms, morphs and skins.
// This also supports vehicles' separate damage scenes and animated wheel nodes.
export function sceneGeometry(doc, sceneIndex = doc.json.scene || 0, clipIndex = null, time = 0) {
  const j = doc.json, overrides = new Map(), parents = new Map(), world = new Map();
  j.nodes.forEach((n, i) => {for (const c of n.children || []) {if (parents.has(c) && parents.get(c) !== i) throw Error('Multiple node parents'); parents.set(c, i);}});
  if (clipIndex !== null) {
    const clip = j.animations[clipIndex];
    for (const c of clip.channels) {
      const id = c.target.node, state = overrides.get(id) || {};
      state[c.target.path] = sampleChannel(doc, c, clip.samplers[c.sampler], time); overrides.set(id, state);
    }
  }
  const matrix = index => {
    if (world.has(index)) return world.get(index);
    const n = j.nodes[index], s = overrides.get(index) || {};
    const local = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(new Vector3().fromArray(s.translation || n.translation || [0, 0, 0]), new Quaternion().fromArray(s.rotation || n.rotation || [0, 0, 0, 1]), new Vector3().fromArray(s.scale || n.scale || [1, 1, 1]));
    const result = parents.has(index) ? matrix(parents.get(index)).clone().multiply(local) : local;
    world.set(index, result); return result;
  };
  const triangles = [], vertices = [], vertexRecords = [];
  const visit = index => {
    const n = j.nodes[index], m = matrix(index);
    if (n.mesh !== undefined) {
      const mesh = j.meshes[n.mesh], weights = overrides.get(index)?.weights || n.weights || mesh.weights || [];
      const skin = n.skin === undefined ? null : j.skins[n.skin];
      const binds = skin?.inverseBindMatrices === undefined ? null : accessor(doc, skin.inverseBindMatrices);
      const joints = skin?.joints.map((joint, i) => matrix(joint).clone().multiply(binds ? new Matrix4().fromArray(binds, i * 16) : new Matrix4()));
      for (let pi = 0; pi < mesh.primitives.length; pi++) {
        const p = mesh.primitives[pi];
        if ((p.mode ?? 4) !== 4) throw Error('Expected triangles');
        const pos = accessor(doc, p.attributes.POSITION), transformed = new Float64Array(pos.length), morphs = (p.targets || []).map(t => t.POSITION === undefined ? null : accessor(doc, t.POSITION));
        const jointSets = [], weightSets = [];
        for (let set = 0; p.attributes[`JOINTS_${set}`] !== undefined; set++) {jointSets.push(accessor(doc, p.attributes[`JOINTS_${set}`])); weightSets.push(accessor(doc, p.attributes[`WEIGHTS_${set}`]));}
        const point = new Vector3(), result = new Vector3(), part = new Vector3();
        for (let v = 0; v < pos.length / 3; v++) {
          point.fromArray(pos, v * 3);
          for (let k = 0; k < morphs.length; k++) if (morphs[k] && weights[k]) point.addScaledVector(part.fromArray(morphs[k], v * 3), weights[k]);
          if (skin) {
            result.set(0, 0, 0);
            for (let s = 0; s < jointSets.length; s++) for (let k = 0; k < 4; k++) {
              const w = weightSets[s][v * 4 + k];
              if (w) {const joint = joints[jointSets[s][v * 4 + k]]; if (!joint) throw Error('Invalid joint index'); result.addScaledVector(part.copy(point).applyMatrix4(joint), w);}
            }
          } else result.copy(point).applyMatrix4(m);
          result.toArray(transformed, v * 3);
          vertices.push(result.x, result.y, result.z);
        }
        vertexRecords.push({node: index, mesh: n.mesh, primitive: pi, positions: transformed});
        const indices = p.indices === undefined ? Uint32Array.from({length: pos.length / 3}, (_, i) => i) : rawAccessor(doc, p.indices);
        for (const v of indices) triangles.push(transformed[v * 3], transformed[v * 3 + 1], transformed[v * 3 + 2]);
      }
    }
    for (const child of n.children || []) visit(child);
  };
  for (const node of j.scenes[sceneIndex].nodes || []) visit(node);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i++) {min[i % 3] = Math.min(min[i % 3], vertices[i]); max[i % 3] = Math.max(max[i % 3], vertices[i]);}
  return {triangles: Float64Array.from(triangles), vertexRecords, bounds: {min, max}, diagonal: Math.hypot(...min.map((v, i) => max[i] - v)), renderedTriangles: triangles.length / 9};
}
