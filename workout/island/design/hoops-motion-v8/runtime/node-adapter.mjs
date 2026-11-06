// Node has no browser Workers or image renderer. Geometry uses the same shipped
// Draco WASM decoder as the browser. Embedded WebP is checked and its dimensions
// exposed as texture metadata; real pixel decoding/rendering is a browser check.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

let decoderPending;
async function getDecoder() {
  if (!decoderPending) decoderPending = (async () => {
    const decoderBase = new URL('./vendor/draco/', import.meta.url);
    const [wrapper, wasm] = await Promise.all([
      readFile(new URL('draco_wasm_wrapper.js', decoderBase), 'utf8'),
      readFile(new URL('draco_decoder.wasm', decoderBase)),
    ]);
    const createModule = vm.runInNewContext(`${wrapper}\n;DracoDecoderModule;`, {
      WebAssembly, console, TextDecoder, TextEncoder, setTimeout, clearTimeout, performance,
    }, {filename: 'vendored-draco-decoder.js'});
    return createModule({wasmBinary: wasm});
  })();
  return decoderPending;
}

export async function createNodeDracoLoader() {
  const {DRACOLoader} = await import('./vendor/DRACOLoader.js');
  const draco = await getDecoder();
  class NodeDracoLoader extends DRACOLoader {
    preload() {return this;}
    async decodeGeometry(buffer, config) {
      const decoder = new draco.Decoder();
      const input = new Int8Array(buffer);
      const geometryType = decoder.GetEncodedGeometryType(input);
      const mesh = geometryType === draco.TRIANGULAR_MESH ? new draco.Mesh() : new draco.PointCloud();
      try {
        const status = geometryType === draco.TRIANGULAR_MESH
          ? decoder.DecodeArrayToMesh(input, input.byteLength, mesh)
          : decoder.DecodeArrayToPointCloud(input, input.byteLength, mesh);
        if (!status.ok() || !mesh.ptr) throw new Error(`Draco decode failed: ${status.error_msg()}`);
        const result = {index: null, attributes: []};
        const constructors = {Float32Array, Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array};
        const dataTypes = {Float32Array: draco.DT_FLOAT32, Int8Array: draco.DT_INT8, Uint8Array: draco.DT_UINT8,
          Int16Array: draco.DT_INT16, Uint16Array: draco.DT_UINT16, Int32Array: draco.DT_INT32, Uint32Array: draco.DT_UINT32};
        for (const [name, uniqueID] of Object.entries(config.attributeIDs)) {
          const attribute = decoder.GetAttributeByUniqueId(mesh, uniqueID);
          if (!attribute?.ptr) throw new Error(`Missing Draco attribute ${name}`);
          const typeName = config.attributeTypes[name];
          const ArrayType = constructors[typeName];
          if (!ArrayType) throw new TypeError(`Unsupported Draco attribute type ${typeName}`);
          const count = mesh.num_points() * attribute.num_components();
          const byteLength = count * ArrayType.BYTES_PER_ELEMENT;
          const pointer = draco._malloc(byteLength);
          try {
            if (!decoder.GetAttributeDataArrayForAllPoints(mesh, attribute, dataTypes[typeName], byteLength, pointer)) {
              throw new Error(`Failed to decode Draco attribute ${name}`);
            }
            result.attributes.push({name, itemSize: attribute.num_components(),
              array: new ArrayType(draco.HEAPU8.buffer, pointer, count).slice(), vertexColorSpace: config.vertexColorSpace});
          } finally {draco._free(pointer);}
        }
        if (geometryType === draco.TRIANGULAR_MESH) {
          const count = mesh.num_faces() * 3;
          const pointer = draco._malloc(count * 4);
          try {
            decoder.GetTrianglesUInt32Array(mesh, count * 4, pointer);
            result.index = {array: new Uint32Array(draco.HEAPU8.buffer, pointer, count).slice(), itemSize: 1};
          } finally {draco._free(pointer);}
        }
        return this._createGeometry(result);
      } finally {draco.destroy(mesh); draco.destroy(decoder);}
    }
  }
  return new NodeDracoLoader();
}

export function inspectWebP(input) {
  const bytes = new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = offset => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 20 || text(0) !== 'RIFF' || text(8) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) {
    throw new Error('Invalid embedded WebP container');
  }
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = text(offset), size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > bytes.length) throw new Error('Truncated WebP chunk');
    let width, height;
    if (kind === 'VP8X' && size >= 10) {
      width = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
      height = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
    } else if (kind === 'VP8 ' && size >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 1 && bytes[start + 5] === 0x2a) {
      width = view.getUint16(start + 6, true) & 0x3fff;
      height = view.getUint16(start + 8, true) & 0x3fff;
    } else if (kind === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
      const bits = view.getUint32(start + 1, true);
      width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    }
    if (width && height) return Object.freeze({width, height, bytes: bytes.length, mimeType: 'image/webp', pixelsDecoded: false});
    offset = start + size + (size & 1);
  }
  throw new Error('WebP dimensions were not found');
}

export function nodeTexturePlugin(THREE) {
  return parser => ({
    // Replaces the browser-only built-in WebP plugin in Node, preserving actual
    // GLTFLoader parsing for skins, materials, geometry and animation channels.
    name: 'EXT_texture_webp',
    async loadTexture(index) {
      const definition = parser.json.textures[index];
      const source = definition.extensions?.EXT_texture_webp?.source ?? definition.source;
      const image = parser.json.images[source];
      if (!Number.isInteger(image?.bufferView)) throw new Error('Node adapter expects a self-contained embedded WebP image');
      const metadata = inspectWebP(await parser.getDependency('bufferView', image.bufferView));
      const texture = new THREE.Texture({width: metadata.width, height: metadata.height});
      texture.name = image.name || definition.name || `embedded-WebP-${index}`;
      texture.flipY = false;
      texture.userData.nodeImageMetadata = metadata;
      parser.associations.set(texture, {textures: index});
      return texture;
    },
  });
}
