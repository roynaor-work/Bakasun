import * as THREE from './vendor/three.module.js';

// Intentionally small reader for this package's static, single-mesh glTF 2.0 subset.
// These are ordinary GLBs and also work with a standard GLTFLoader.
export function parseCityGLB(buffer) {
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== buffer.byteLength) {
    throw new Error('Invalid GLB 2.0 file');
  }
  const jsonLength = header.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  if (doc.extensionsUsed?.length || doc.buffers.length !== 1 || doc.buffers[0].uri || doc.images?.length) {
    throw new Error('City GLBs must be self-contained, untextured, and extension-free');
  }
  const binaryOffset = 20 + jsonLength + 8;
  const widths = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4};
  const types = {5121: Uint8Array, 5123: Uint16Array, 5126: Float32Array};
  const accessor = index => {
    const spec = doc.accessors[index], view = doc.bufferViews[spec.bufferView];
    const Type = types[spec.componentType];
    if (!Type || view.byteStride) throw new Error('Unsupported city accessor');
    return new THREE.BufferAttribute(new Type(buffer, binaryOffset + (view.byteOffset || 0) + (spec.byteOffset || 0), spec.count * widths[spec.type]).slice(), widths[spec.type], !!spec.normalized);
  };
  const primitive = doc.meshes[0].primitives[0];
  const geometry = new THREE.BufferGeometry();
  for (const [key, name] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['COLOR_0', 'color']]) {
    geometry.setAttribute(name, accessor(primitive.attributes[key]));
  }
  geometry.setIndex(accessor(primitive.indices));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .88, metalness: 0});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = doc.nodes[0].name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {...doc.nodes[0].extras, triangles: geometry.index.count / 3};
  return mesh;
}

export async function loadCityBuilding(building, {palette = 'sunrise', stage = 'complete', baseURL = new URL('./', import.meta.url), signal} = {}) {
  const variant = building.variants.find(v => v.palette === palette);
  const asset = variant?.assets[stage];
  if (!asset) throw new Error(`Unknown city variant: ${building.id}/${palette}/${stage}`);
  const response = await fetch(new URL(asset.path, baseURL), {signal});
  if (!response.ok) throw new Error(`Could not load ${asset.path}: ${response.status}`);
  return parseCityGLB(await response.arrayBuffer());
}

export function disposeCityBuilding(mesh) {
  mesh.geometry.dispose();
  mesh.material.dispose();
  mesh.removeFromParent();
}
