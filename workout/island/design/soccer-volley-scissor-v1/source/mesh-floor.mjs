// SPDX-License-Identifier: CC0-1.0
// Independent CPU skin inspection of the delivered GLB geometry (not joint proxies).
import {Matrix4, Vector3} from '../vendor/three.module.js';
import {readAccessor} from './glb.mjs';
import {fk} from './rig.mjs';

export function skinGeometry(glb) {
  const d = glb.document;
  const skin = d.skins[0];
  const bind = readAccessor(glb, skin.inverseBindMatrices).values;
  const names = skin.joints.map(i => d.nodes[i].name);
  const matrices = names.map((_, i) => new Matrix4().fromArray(bind, i * 16));
  const vertices = [];
  for (const mesh of d.meshes) for (const primitive of mesh.primitives) {
    const a = primitive.attributes;
    const positions = readAccessor(glb, a.POSITION).values;
    const joints = readAccessor(glb, a.JOINTS_0).values;
    const weights = readAccessor(glb, a.WEIGHTS_0).values;
    for (let i = 0; i < positions.length / 3; i++) {
      const influences = [];
      for (let j = 0; j < 4; j++) {
        const weight = weights[i * 4 + j];
        if (!weight) continue;
        const joint = joints[i * 4 + j];
        const local = new Vector3().fromArray(positions, i * 3).applyMatrix4(matrices[joint]);
        influences.push({bone: names[joint], weight, local: local.toArray()});
      }
      vertices.push(influences);
    }
  }
  return vertices;
}

export function lowestSkinY(pose, vertices) {
  const world = fk(pose), rows = {};
  for (const [name, bone] of Object.entries(world)) {
    const [x,y,z,w] = bone.rotation;
    rows[name] = [2*(x*y+w*z), 1-2*(x*x+z*z), 2*(y*z-w*x), bone.position[1]];
  }
  let minimum = Infinity, vertex = -1;
  for (let i = 0; i < vertices.length; i++) {
    let y = 0;
    for (const {bone, weight, local} of vertices[i]) {
      const r = rows[bone];
      y += weight*(r[0]*local[0]+r[1]*local[1]+r[2]*local[2]+r[3]);
    }
    if (y < minimum) { minimum = y; vertex = i; }
  }
  return {minimum, vertex, influences: vertices[vertex]};
}
