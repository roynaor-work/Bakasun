/** Local GLB tools: retain the original geometry, skins, morphs and textures. */
import { readFile, writeFile } from 'node:fs/promises';
import * as T from './vendor/three.module.js';

export async function readGLB(path) {
  const bytes = await readFile(path);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB header');
  const size = bytes.readUInt32LE(12), offset = 20 + size;
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(offset + 4) !== 0x004e4942) throw Error('Expected JSON and BIN chunks');
  return { json: JSON.parse(bytes.subarray(20, offset).toString()), bin: bytes.subarray(offset + 8, offset + 8 + bytes.readUInt32LE(offset)) };
}

export async function writeGLB(path, json, bin) {
  const source = Buffer.from(JSON.stringify(json)), jsonBytes = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20);
  source.copy(jsonBytes);
  const binary = Buffer.alloc(Math.ceil(bin.length / 4) * 4); bin.copy(binary);
  const bytes = Buffer.alloc(28 + jsonBytes.length + binary.length);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(jsonBytes.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); jsonBytes.copy(bytes, 20);
  const offset = 20 + jsonBytes.length;
  bytes.writeUInt32LE(binary.length, offset); bytes.writeUInt32LE(0x004e4942, offset + 4); binary.copy(bytes, offset + 8);
  await writeFile(path, bytes);
  return bytes.length;
}

const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const types = { 5120: [Int8Array, 'getInt8', 1], 5121: [Uint8Array, 'getUint8', 1], 5122: [Int16Array, 'getInt16', 2], 5123: [Uint16Array, 'getUint16', 2], 5125: [Uint32Array, 'getUint32', 4], 5126: [Float32Array, 'getFloat32', 4] };
export function readAccessor(json, bin, index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView];
  if (a.sparse || !view || view.buffer !== 0) throw Error('Expected dense embedded accessor');
  const [ArrayType, method, bytes] = types[a.componentType], size = components[a.type];
  if (!size) throw Error('Unsupported accessor type: ' + a.type);
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength), result = new ArrayType(a.count * size);
  const start = (view.byteOffset || 0) + (a.byteOffset || 0), stride = view.byteStride || size * bytes;
  for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) result[i * size + c] = data[method](start + i * stride + c * bytes, true);
  return result;
}

/** CPU pose model with real vertices, for contact checks; no image decoding. */
export function createMotionModel(json, bin) {
  const joints = new Set(json.skins.flatMap(s => s.joints)), root = new T.Group(), byName = {};
  const nodes = json.nodes.map((n, i) => {
    const o = joints.has(i) ? new T.Bone() : new T.Group(); o.name = n.name || `node_${i}`;
    if (n.matrix) new T.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    else { o.position.fromArray(n.translation || [0, 0, 0]); o.quaternion.fromArray(n.rotation || [0, 0, 0, 1]); o.scale.fromArray(n.scale || [1, 1, 1]); }
    byName[o.name] = o; return o;
  });
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => nodes[i].add(nodes[c])));
  json.scenes[json.scene || 0].nodes.forEach(i => root.add(nodes[i])); root.updateMatrixWorld(true);
  const skeletons = json.skins.map(s => {
    const inverses = readAccessor(json, bin, s.inverseBindMatrices);
    return new T.Skeleton(s.joints.map(i => nodes[i]), s.joints.map((_, i) => new T.Matrix4().fromArray(inverses, i * 16)));
  });
  const names = { POSITION: 'position', NORMAL: 'normal', JOINTS_0: 'skinIndex', WEIGHTS_0: 'skinWeight' };
  json.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    const m = json.meshes[n.mesh];
    m.primitives.forEach(p => {
      const geometry = new T.BufferGeometry();
      for (const [semantic, name] of Object.entries(names)) if (p.attributes[semantic] !== undefined) {
        const a = json.accessors[p.attributes[semantic]];
        geometry.setAttribute(name, new T.BufferAttribute(readAccessor(json, bin, p.attributes[semantic]), components[a.type], !!a.normalized));
      }
      if (p.indices !== undefined) geometry.setIndex(new T.BufferAttribute(readAccessor(json, bin, p.indices), 1));
      if (p.targets) {
        geometry.morphTargetsRelative = true;
        geometry.morphAttributes.position = p.targets.map(t => new T.BufferAttribute(readAccessor(json, bin, t.POSITION), 3));
      }
      const mesh = n.skin === undefined ? new T.Mesh(geometry) : new T.SkinnedMesh(geometry);
      mesh.name = n.name + '_geometry'; nodes[i].add(mesh);
      if (n.skin !== undefined) mesh.bind(skeletons[n.skin], new T.Matrix4());
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0);
    });
  });
  const bones = [...joints].map(i => nodes[i]);
  return { root, bones, byName, skeleton: skeletons[0], skeletons, ball: byName.Ball, nodes };
}

export function vertexBounds(model) {
  model.root.updateMatrixWorld(true); model.skeletons.forEach(s => s.update());
  const bounds = new T.Box3(), point = new T.Vector3();
  model.root.traverse(m => {
    if (!m.isMesh || m.parent === model.ball) return;
    for (let i = 0; i < m.geometry.attributes.position.count; i++) bounds.expandByPoint(m.getVertexPosition(i, point).applyMatrix4(m.matrixWorld));
  });
  return bounds;
}
