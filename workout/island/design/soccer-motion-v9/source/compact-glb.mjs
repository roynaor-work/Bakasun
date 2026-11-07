/** Lossless GLB packing: retain referenced accessors and buffer views only.
 * Draco streams, image bytes, skin weights and animation floats are copied
 * verbatim. This is not re-encoding, quantization or mesh simplification.
 */
function insist(condition, message) { if (!condition) throw new Error(message); }
export function unpack(bytes) {
  insist(bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2, 'Expected glTF 2 GLB');
  insist(bytes.readUInt32LE(8) === bytes.length, 'Truncated GLB');
  const length = bytes.readUInt32LE(12), binaryStart = 20 + length;
  insist(bytes.readUInt32LE(16) === 0x4e4f534a && bytes.readUInt32LE(binaryStart + 4) === 0x004e4942, 'Expected JSON and BIN chunks');
  const document = JSON.parse(bytes.subarray(20, binaryStart).toString('utf8'));
  insist(document.buffers.length === 1 && !document.buffers[0].uri, 'Only self-contained single-buffer GLBs are supported');
  return { document, binary: bytes.subarray(binaryStart + 8, binaryStart + 8 + bytes.readUInt32LE(binaryStart)) };
}
export function pack(document, binary) {
  const text = Buffer.from(JSON.stringify(document)), json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
  text.copy(json);
  const bin = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(bin);
  const output = Buffer.alloc(28 + json.length + bin.length);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12); output.writeUInt32LE(0x4e4f534a, 16); json.copy(output, 20);
  output.writeUInt32LE(bin.length, 20 + json.length); output.writeUInt32LE(0x004e4942, 24 + json.length); bin.copy(output, 28 + json.length);
  return output;
}

/** Collect standard glTF accessor references; bufferView references are visited
 * generically, including KHR_draco_mesh_compression, images and sparse arrays.
 */
function accessorSlots(document) {
  const slots = [];
  const slot = (object, key) => { if (object?.[key] !== undefined) slots.push([object, key]); };
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives) {
    slot(primitive, 'indices');
    for (const name of Object.keys(primitive.attributes)) slot(primitive.attributes, name);
    for (const target of primitive.targets ?? []) for (const name of Object.keys(target)) slot(target, name);
  }
  for (const skin of document.skins ?? []) slot(skin, 'inverseBindMatrices');
  for (const animation of document.animations ?? []) for (const sampler of animation.samplers) {
    slot(sampler, 'input'); slot(sampler, 'output');
  }
  for (const node of document.nodes ?? []) {
    const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
    for (const name of Object.keys(attributes ?? {})) slot(attributes, name);
  }
  return slots;
}
function viewSlots(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) { for (const child of value) viewSlots(child, output); return output; }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'bufferView') output.push([value, key]);
    else if (key !== 'extras' && key !== 'bufferViews') viewSlots(child, output);
  }
  return output;
}

export function compactGLB(bytes) {
  const { document, binary } = unpack(bytes), accessors = document.accessors, views = document.bufferViews;
  const supported = new Set(['KHR_draco_mesh_compression', 'EXT_texture_webp', 'KHR_materials_clearcoat', 'KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_lights_punctual', 'EXT_mesh_gpu_instancing']);
  for (const extension of document.extensionsUsed ?? []) insist(supported.has(extension), `Audit unknown extension before packing: ${extension}`);
  const references = accessorSlots(document), retained = [...new Set(references.map(([object, key]) => object[key]))].sort((a, b) => a - b);
  for (const index of retained) insist(Number.isInteger(index) && accessors[index], `Invalid accessor ${index}`);
  const indices = new Map(retained.map((old, index) => [old, index]));
  for (const [object, key] of references) object[key] = indices.get(object[key]);
  document.accessors = retained.map(index => accessors[index]);
  const viewReferences = viewSlots(document);
  const retainedViews = [...new Set(viewReferences.map(([object, key]) => object[key]))].sort((a, b) => a - b);
  const viewIndices = new Map(retainedViews.map((old, index) => [old, index]));
  const parts = [], newViews = [];
  let offset = 0;
  for (const index of retainedViews) {
    const view = views[index];
    insist(view && view.buffer === 0, `Invalid view ${index}`);
    insist((view.byteOffset ?? 0) + view.byteLength <= binary.length, `View ${index} exceeds BIN`);
    const padding = (4 - offset % 4) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); offset += padding; }
    const contents = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    parts.push(contents); newViews.push({ ...view, byteOffset: offset }); offset += contents.length;
  }
  for (const [object, key] of viewReferences) object[key] = viewIndices.get(object[key]);
  document.bufferViews = newViews;
  document.buffers[0].byteLength = offset;
  const result = pack(document, Buffer.concat(parts));
  // Verify every relocated live block against the original bytes immediately.
  const packed = unpack(result);
  for (let index = 0; index < retainedViews.length; index++) {
    const old = views[retainedViews[index]], next = packed.document.bufferViews[index];
    const before = binary.subarray(old.byteOffset ?? 0, (old.byteOffset ?? 0) + old.byteLength);
    const after = packed.binary.subarray(next.byteOffset, next.byteOffset + next.byteLength);
    insist(before.equals(after), `Changed live block ${retainedViews[index]} while packing`);
  }
  return { bytes: result, before: bytes.length, after: result.length,
    accessorsRemoved: accessors.length - document.accessors.length,
    viewsRemoved: views.length - document.bufferViews.length };
}
