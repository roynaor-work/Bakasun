// Native, uncompressed glTF 2.0 IO. No packages, network, native code or codecs.
import {createHash} from 'node:crypto';

const components = {5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4]};
export const widths = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16};
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const clone = value => structuredClone(value);

export function parseGLB(bytes) {
  const b = Buffer.from(bytes);
  if (b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length) throw Error('Invalid GLB header');
  let json, bin;
  for (let offset = 12; offset < b.length;) {
    const size = b.readUInt32LE(offset), kind = b.readUInt32LE(offset + 4);
    if (size % 4 || offset + 8 + size > b.length) throw Error('Invalid GLB chunk');
    const chunk = b.subarray(offset + 8, offset + 8 + size);
    if (kind === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').trim());
    else if (kind === 0x004e4942) bin = chunk;
    else throw Error('Unknown GLB chunk; refusing to discard it');
    offset += size + 8;
  }
  if (!json || !bin || json.asset.version !== '2.0') throw Error('Expected self-contained binary glTF 2.0');
  if (json.buffers.length !== 1 || json.buffers[0].uri || json.images?.some(i => i.uri)) throw Error('External resources are not supported; embed them first');
  if (JSON.stringify(json.extensionsUsed || []).match(/draco|meshopt|basisu/i)) throw Error('Compressed input is prohibited');
  return {json, bin, raw: new Map()};
}

export function rawAccessor(doc, index) {
  if (doc.raw.has(index)) return doc.raw.get(index);
  const a = doc.json.accessors[index];
  if (!a || !components[a.componentType] || !widths[a.type]) throw Error(`Unsupported accessor ${index}`);
  // MAT2/3 integer column padding is deliberately rejected, rather than silently misread.
  if (/MAT[23]/.test(a.type) && a.componentType !== 5126) throw Error('Padded integer matrices are not supported');
  const [Typed, size] = components[a.componentType], width = widths[a.type];
  const values = new Typed(a.count * width);
  const copy = (viewIndex, byteOffset, count, destination, strideOverride) => {
    const view = doc.json.bufferViews[viewIndex];
    if (view.buffer !== 0) throw Error('Unexpected external buffer');
    const stride = strideOverride ?? view.byteStride ?? size * width;
    const start = (view.byteOffset || 0) + byteOffset;
    if (count && start + (count - 1) * stride + size * width > (view.byteOffset || 0) + view.byteLength) throw Error('Accessor out of bounds');
    const bytes = Buffer.from(values.buffer);
    for (let n = 0; n < count; n++) doc.bin.copy(bytes, destination(n) * size * width, start + n * stride, start + n * stride + size * width);
  };
  if (a.bufferView !== undefined) copy(a.bufferView, a.byteOffset || 0, a.count, i => i);
  if (a.sparse) {
    const s = a.sparse, view = doc.json.bufferViews[s.indices.bufferView], [IndexTyped, indexSize] = components[s.indices.componentType];
    const indices = new IndexTyped(s.count);
    doc.bin.copy(Buffer.from(indices.buffer), 0, (view.byteOffset || 0) + (s.indices.byteOffset || 0), (view.byteOffset || 0) + (s.indices.byteOffset || 0) + s.count * indexSize);
    copy(s.values.bufferView, s.values.byteOffset || 0, s.count, n => {
      if (indices[n] >= a.count) throw Error('Sparse index out of bounds');
      return indices[n];
    }, size * width);
  }
  doc.raw.set(index, values);
  return values;
}

export function accessor(doc, index) {
  const a = doc.json.accessors[index], values = rawAccessor(doc, index);
  if (!a.normalized) return values;
  const max = {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}[a.componentType];
  if (!max) throw Error('Invalid normalized component type');
  return Float64Array.from(values, n => Math.max(-1, n / max));
}

export function addAccessor(doc, template, values) {
  const a = clone(template);
  delete a.bufferView; delete a.byteOffset; delete a.sparse;
  const width = widths[a.type];
  a.count = values.length / width;
  if (!Number.isInteger(a.count)) throw Error('Accessor width mismatch');
  if (a.min || a.max) {
    a.min = Array(width).fill(Infinity); a.max = Array(width).fill(-Infinity);
    for (let i = 0; i < values.length; i++) {
      a.min[i % width] = Math.min(a.min[i % width], values[i]);
      a.max[i % width] = Math.max(a.max[i % width], values[i]);
    }
  }
  const index = doc.json.accessors.length;
  doc.json.accessors.push(a); doc.raw.set(index, values);
  return index;
}

export function replacePrimitive(doc, primitive, indices, sourceVertices) {
  const select = index => {
    const template = doc.json.accessors[index], input = rawAccessor(doc, index), width = widths[template.type];
    const values = new input.constructor(sourceVertices.length * width);
    sourceVertices.forEach((source, target) => values.set(input.subarray(source * width, (source + 1) * width), target * width));
    return addAccessor(doc, template, values);
  };
  for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = select(primitive.attributes[key]);
  for (const target of primitive.targets || []) for (const key of Object.keys(target)) target[key] = select(target[key]);
  const Typed = sourceVertices.length > 65535 ? Uint32Array : Uint16Array;
  primitive.indices = addAccessor(doc, {type: 'SCALAR', componentType: Typed === Uint32Array ? 5125 : 5123}, Typed.from(indices));
}

export function writeGLB(doc) {
  const json = clone(doc.json), used = new Set();
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) {
    if (p.indices !== undefined) used.add(p.indices);
    Object.values(p.attributes).forEach(i => used.add(i));
    for (const t of p.targets || []) Object.values(t).forEach(i => used.add(i));
  }
  for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) used.add(s.inverseBindMatrices);
  for (const a of json.animations || []) for (const s of a.samplers) {used.add(s.input); used.add(s.output);}
  const accessors = [], views = [], parts = [], remap = new Map(), identicalViews = new Map(); let offset = 0;
  const append = (bytes, target, stride) => {
    // Core glTF can share identical data directly. This is buffer reuse, not
    // compression: every accessor decodes to exactly the same original bytes.
    const reusable = target!==34962 || stride>=4 && stride<=252 && stride%4===0;
    const key = `${target||0}:${stride||0}:${bytes.length}:${sha256(bytes)}`;
    if (reusable && identicalViews.has(key)) return identicalViews.get(key);
    const padding = (4 - offset % 4) % 4;
    if (padding) {parts.push(Buffer.alloc(padding)); offset += padding;}
    const index = views.length;
    if (reusable) identicalViews.set(key,index);
    views.push({buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? {target} : {}), ...(target===34962&&reusable?{byteStride:stride}:{})});
    parts.push(bytes); offset += bytes.length;
    return index;
  };
  const elementIndices = new Set(json.meshes.flatMap(m => m.primitives.map(p => p.indices)));
  const vertexAccessors = new Set(json.meshes.flatMap(m => m.primitives.flatMap(p => [...Object.values(p.attributes), ...(p.targets || []).flatMap(t => Object.values(t))])));
  for (const index of [...used].sort((a, b) => a - b)) {
    const a = clone(json.accessors[index]), raw = rawAccessor(doc, index);
    delete a.sparse; delete a.byteOffset;
    const target = elementIndices.has(index) ? 34963 : vertexAccessors.has(index) ? 34962 : undefined;
    a.bufferView = append(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength), target, target===34962?components[a.componentType][1]*widths[a.type]:undefined);
    remap.set(index, accessors.length); accessors.push(a);
  }
  for (const image of json.images || []) {
    const v = doc.json.bufferViews[image.bufferView];
    image.bufferView = append(doc.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength));
  }
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) {
    if (p.indices !== undefined) p.indices = remap.get(p.indices);
    // A shared geometry may be used by several independent rigs. Replace maps
    // rather than mutating them, so shared accessor addresses are remapped once.
    p.attributes = Object.fromEntries(Object.entries(p.attributes).map(([k,i])=>[k,remap.get(i)]));
    if (p.targets) p.targets = p.targets.map(t=>Object.fromEntries(Object.entries(t).map(([k,i])=>[k,remap.get(i)])));
  }
  for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = remap.get(s.inverseBindMatrices);
  for (const a of json.animations || []) for (const s of a.samplers) {s.input = remap.get(s.input); s.output = remap.get(s.output);}
  json.accessors = accessors; json.bufferViews = views; json.buffers = [{byteLength: offset}];
  json.asset.generator = 'Bakasun lod-pipeline-v1 / native JavaScript';
  const encoded = Buffer.from(JSON.stringify(json)), jsonSize = Math.ceil(encoded.length / 4) * 4, binSize = Math.ceil(offset / 4) * 4;
  const out = Buffer.alloc(12 + 8 + jsonSize + 8 + binSize);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonSize, 12); out.writeUInt32LE(0x4e4f534a, 16);
  out.fill(32, 20, 20 + jsonSize); encoded.copy(out, 20);
  const b = 20 + jsonSize; out.writeUInt32LE(binSize, b); out.writeUInt32LE(0x004e4942, b + 4);
  Buffer.concat(parts).copy(out, b + 8);
  return out;
}

export function triangleCount(doc) {
  return doc.json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, p) => n + (p.indices === undefined ? doc.json.accessors[p.attributes.POSITION].count : doc.json.accessors[p.indices].count) / 3, 0), 0);
}

export function sceneTriangleCount(doc, scene = doc.json.scene || 0) {
  const visit = index => {
    const node = doc.json.nodes[index], mesh = doc.json.meshes[node.mesh];
    return (mesh ? mesh.primitives.reduce((n, p) => n + (p.indices === undefined ? doc.json.accessors[p.attributes.POSITION].count : doc.json.accessors[p.indices].count) / 3, 0) : 0) + (node.children || []).reduce((n, c) => n + visit(c), 0);
  };
  return doc.json.scenes[scene].nodes.reduce((n, i) => n + visit(i), 0);
}

export function uniqueGeometryTriangleCount(doc) {
  const seen = new Set(); let count = 0;
  for (const m of doc.json.meshes) for (const p of m.primitives) {
    const key = JSON.stringify({attributes:p.attributes,indices:p.indices,targets:p.targets,mode:p.mode||4});
    if (!seen.has(key)) {seen.add(key); count += (p.indices===undefined?doc.json.accessors[p.attributes.POSITION].count:doc.json.accessors[p.indices].count)/3;}
  }
  return count;
}

// Fingerprints exclude only IO addresses. Keyframes, interpolation, names, bind
// matrices, targets, scene hierarchy and material semantics must survive exactly.
export function invariantFingerprint(doc) {
  const j = doc.json;
  const data = index => {
    const a = j.accessors[index], raw = rawAccessor(doc, index);
    return {type: a.type, componentType: a.componentType, count: a.count, normalized: !!a.normalized, hash: sha256(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength))};
  };
  return sha256(JSON.stringify({
    nodes: j.nodes, scenes: j.scenes, scene: j.scene, materials: j.materials, textures: j.textures, samplers: j.samplers,
    skins: j.skins?.map(s => ({...s, inverseBindMatrices: s.inverseBindMatrices === undefined ? undefined : data(s.inverseBindMatrices)})),
    animations: j.animations?.map(a => ({...a, samplers: a.samplers.map(s => ({...s, input: data(s.input), output: data(s.output)}))})),
    meshes: j.meshes.map(m => ({...m, primitives: m.primitives.map(p => ({...p, attributes: Object.keys(p.attributes), indices: undefined, targets: p.targets?.map(t => Object.keys(t))}))})),
    images: j.images?.map(i => {const v = j.bufferViews[i.bufferView]; return {...i, bufferView: undefined, hash: sha256(doc.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength))};})
  }));
}
