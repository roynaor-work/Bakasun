/** Independent acceptance reader. The GLB bytes, not the catalog, define tracks.
 * No npm packages or network access are used. Textures receive one neutral test
 * pixel in Node; all Draco geometry, skins and animations use the real local
 * r160 GLTFLoader and decoder. Browser verification checks the original images.
 */
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as THREE from '../runtime/vendor/three.module.js';
import { GLTFLoader } from '../runtime/vendor/GLTFLoader.js';

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const READERS = {
  5120: [1, 'getInt8'], 5121: [1, 'getUint8'],
  5122: [2, 'getInt16'], 5123: [2, 'getUint16'],
  5125: [4, 'getUint32'], 5126: [4, 'getFloat32'],
};
function requireThat(condition, message) { if (!condition) throw new Error(message); }

export function parseGLB(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  requireThat(bytes.length >= 28, 'Truncated GLB header');
  requireThat(bytes.readUInt32LE(0) === 0x46546c67, 'GLB magic mismatch');
  requireThat(bytes.readUInt32LE(4) === 2, 'GLB must be version 2');
  requireThat(bytes.readUInt32LE(8) === bytes.length, 'GLB declared length mismatch');
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    requireThat(offset + 8 <= bytes.length, 'Truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    requireThat(length % 4 === 0 && offset + 8 + length <= bytes.length, 'Invalid GLB chunk length');
    chunks.push({ type, bytes: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  requireThat(chunks.length === 2 && chunks[0].type === 0x4e4f534a && chunks[1].type === 0x004e4942,
    'Expected one JSON chunk followed by one BIN chunk');
  const json = JSON.parse(chunks[0].bytes.toString('utf8'));
  requireThat(json.asset?.version === '2.0', 'glTF asset version mismatch');
  requireThat(json.buffers?.length === 1 && !json.buffers[0].uri, 'GLB must be self-contained');
  const binary = chunks[1].bytes;
  requireThat(json.buffers[0].byteLength <= binary.length && binary.length - json.buffers[0].byteLength < 4,
    'BIN buffer size mismatch');
  for (const [i, view] of (json.bufferViews ?? []).entries()) {
    requireThat(view.buffer === 0 && Number.isInteger(view.byteLength) && view.byteLength > 0,
      `Invalid bufferView ${i}`);
    requireThat((view.byteOffset ?? 0) >= 0 && (view.byteOffset ?? 0) + view.byteLength <= json.buffers[0].byteLength,
      `Out-of-bounds bufferView ${i}`);
  }
  for (const image of json.images ?? []) requireThat(!image.uri && Number.isInteger(image.bufferView), 'External image');
  return { bytes, json, binary };
}

export function readAccessor(glb, index) {
  const accessor = glb.json.accessors?.[index];
  requireThat(accessor, `Missing accessor ${index}`);
  const width = COMPONENTS[accessor.type], reader = READERS[accessor.componentType];
  requireThat(width && reader && Number.isInteger(accessor.count) && accessor.count > 0,
    `Unsupported accessor ${index}`);
  requireThat(!accessor.sparse, `Sparse accessor ${index} needs an explicit reader`);
  const view = glb.json.bufferViews?.[accessor.bufferView];
  requireThat(view, `Accessor ${index} has no raw bufferView (Draco-only accessor)`);
  const [size, method] = reader, stride = view.byteStride ?? width * size;
  requireThat(stride >= width * size, `Short stride in accessor ${index}`);
  const start = accessor.byteOffset ?? 0;
  requireThat(start >= 0 && start + (accessor.count - 1) * stride + width * size <= view.byteLength,
    `Accessor ${index} exceeds its bufferView`);
  const dv = new DataView(glb.binary.buffer, glb.binary.byteOffset, glb.binary.byteLength), values = [];
  for (let row = 0; row < accessor.count; row++) for (let component = 0; component < width; component++) {
    values.push(dv[method]((view.byteOffset ?? 0) + start + row * stride + component * size, true));
  }
  return { accessor, width, values };
}

let decoderPromise;
async function decoderModule() {
  if (!decoderPromise) decoderPromise = (async () => {
    const root = new URL('../runtime/vendor/draco/', import.meta.url);
    const source = await fs.readFile(new URL('draco_wasm_wrapper.js', root), 'utf8');
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module, exports: module.exports, require: createRequire(import.meta.url), process,
      console, Buffer, WebAssembly, TextDecoder, TextEncoder, setTimeout, clearTimeout,
      __dirname: fileURLToPath(root),
    }, { filename: 'local-draco-decoder.cjs' });
    return module.exports({ wasmBinary: new Uint8Array(await fs.readFile(new URL('draco_decoder.wasm', root))) });
  })();
  return decoderPromise;
}

async function nodeDracoLoader() {
  const draco = await decoderModule();
  const types = {
    Float32Array: [Float32Array, draco.DT_FLOAT32], Int8Array: [Int8Array, draco.DT_INT8],
    Int16Array: [Int16Array, draco.DT_INT16], Int32Array: [Int32Array, draco.DT_INT32],
    Uint8Array: [Uint8Array, draco.DT_UINT8], Uint16Array: [Uint16Array, draco.DT_UINT16],
    Uint32Array: [Uint32Array, draco.DT_UINT32],
  };
  return {
    preload() {},
    decodeDracoFile(buffer, onLoad, attributeIDs, attributeTypes, colorSpace, onError) {
      try {
        const decoder = new draco.Decoder(), mesh = new draco.Mesh();
        try {
          const bytes = new Int8Array(buffer), status = decoder.DecodeArrayToMesh(bytes, bytes.byteLength, mesh);
          requireThat(status.ok() && mesh.ptr !== 0, `Draco decode failed: ${status.error_msg()}`);
          const geometry = new THREE.BufferGeometry();
          for (const [name, id] of Object.entries(attributeIDs)) {
            const attribute = decoder.GetAttributeByUniqueId(mesh, id), [Type, code] = types[attributeTypes[name]];
            const itemSize = attribute.num_components(), count = mesh.num_points() * itemSize;
            const length = count * Type.BYTES_PER_ELEMENT, pointer = draco._malloc(length);
            try {
              decoder.GetAttributeDataArrayForAllPoints(mesh, attribute, code, length, pointer);
              geometry.setAttribute(name, new THREE.BufferAttribute(new Type(draco.HEAPF32.buffer, pointer, count).slice(), itemSize));
            } finally { draco._free(pointer); }
          }
          const count = mesh.num_faces() * 3, pointer = draco._malloc(count * 4);
          try {
            decoder.GetTrianglesUInt32Array(mesh, count * 4, pointer);
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(draco.HEAPF32.buffer, pointer, count).slice(), 1));
          } finally { draco._free(pointer); }
          onLoad(geometry);
        } finally { draco.destroy(mesh); draco.destroy(decoder); }
      } catch (error) { onError(error); }
    },
  };
}

/** Parse the actual runtime GLB with r160, including its real Draco geometry.
 * Only raster decoding is replaced, because Node has no DOM/image codec.
 */
export async function loadNativeGLTF(file) {
  const input = await fs.readFile(file), loader = new GLTFLoader();
  loader.setDRACOLoader(await nodeDracoLoader());
  loader.register(() => ({
    name: 'EXT_texture_webp',
    loadTexture() {
      const texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
      texture.needsUpdate = true;
      return Promise.resolve(texture);
    },
  }));
  const buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  const result = await loader.parseAsync(buffer, path.dirname(String(file)) + '/');
  result.scene.updateMatrixWorld(true);
  return result;
}

export async function walkFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }), files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    requireThat(!entry.isSymbolicLink(), `Symlink in delivery: ${target}`);
    if (entry.isDirectory()) files.push(...await walkFiles(target));
    else if (entry.isFile()) files.push({ path: target, size: (await fs.stat(target)).size });
  }
  return files;
}
