// Small GLB reader for this pack's embedded, uncompressed static triangle assets.
// Integration may instead use the game's existing ordinary GLTFLoader.
// CC0-1.0. No dynamic imports, fetches, codecs or external resources.
export function readGLB(T, bytes) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error('Invalid GLB 2.0');
  const length = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  const bin = 28 + length;
  if (doc.buffers.length !== 1 || doc.buffers[0].uri || doc.images?.length || doc.extensionsRequired?.length) throw new Error('Unsupported external or required GLB feature');
  const types = {5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array};
  const widths = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4};
  function accessor(index) {
    const a = doc.accessors[index], b = doc.bufferViews[a.bufferView], Type = types[a.componentType], width = widths[a.type];
    if (!Type || !width || a.sparse) throw new Error('Unsupported accessor');
    const stride = b.byteStride || width * Type.BYTES_PER_ELEMENT;
    const offset = bin + (b.byteOffset || 0) + (a.byteOffset || 0);
    if (stride === width * Type.BYTES_PER_ELEMENT) return new T.BufferAttribute(new Type(buffer, offset, a.count * width), width, !!a.normalized);
    const values = new Type(a.count * width);
    for (let i = 0; i < a.count; i++) values.set(new Type(buffer, offset + i * stride, width), i * width);
    return new T.BufferAttribute(values, width, !!a.normalized);
  }
  const materials = (doc.materials || []).map(m => {
    const p = m.pbrMetallicRoughness || {}, c = p.baseColorFactor || [1, 1, 1, 1], ext = m.extensions || {};
    const mat = new T.MeshPhysicalMaterial({name: m.name || '', color: new T.Color().fromArray(c), metalness: p.metallicFactor ?? 1,
      roughness: p.roughnessFactor ?? 1, opacity: c[3], transparent: m.alphaMode === 'BLEND',
      side: m.doubleSided ? T.DoubleSide : T.FrontSide, clearcoat: ext.KHR_materials_clearcoat?.clearcoatFactor || 0,
      clearcoatRoughness: .2, emissive: new T.Color().fromArray(m.emissiveFactor || [0, 0, 0]),
      emissiveIntensity: ext.KHR_materials_emissive_strength?.emissiveStrength || 1});
    return mat;
  });
  const meshes = doc.meshes.map(mesh => mesh.primitives.map(p => {
    const g = new T.BufferGeometry();
    for (const [key, index] of Object.entries(p.attributes)) {
      const names = {POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv'};
      if (names[key]) g.setAttribute(names[key], accessor(index));
    }
    if (p.indices != null) g.setIndex(accessor(p.indices));
    g.computeBoundingSphere();
    return new T.Mesh(g, materials[p.material]);
  }));
  const nodes = doc.nodes.map(n => {
    const obj = new T.Group(); obj.name = n.name || '';
    if (n.mesh != null) for (const mesh of meshes[n.mesh]) obj.add(mesh.clone());
    if (n.matrix) {obj.matrix.fromArray(n.matrix); obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);}
    else {if (n.translation) obj.position.fromArray(n.translation); if (n.rotation) obj.quaternion.fromArray(n.rotation); if (n.scale) obj.scale.fromArray(n.scale);}
    obj.userData = n.extras || {};
    return obj;
  });
  doc.nodes.forEach((n, i) => (n.children || []).forEach(c => nodes[i].add(nodes[c])));
  const scene = new T.Group(); scene.name = 'GLBScene';
  for (const i of doc.scenes[doc.scene || 0].nodes) scene.add(nodes[i]);
  scene.updateMatrixWorld(true);
  return scene;
}

export function decodeBase64(value) {
  const raw = atob(value), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
