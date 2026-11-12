import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import test from 'node:test';

const root = new URL('../workout/island/design/racing-crash-fx/', import.meta.url);
const read = file => readFile(new URL(file, root));
const manifest = JSON.parse(await read('manifest.json'));
const fragments = ['broken_front_wing', 'half_sidepod', 'mirror', 'nose_fragment', 'body_panel_a', 'body_panel_b'];

function png(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'), 'PNG signature');
  let header, ended = false;
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    assert.ok(offset + length + 12 <= bytes.length, 'complete PNG chunk');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = data;
    if (type === 'IDAT') compressed.push(data);
    if (type === 'IEND') ended = true;
    offset += length + 12;
  }
  assert.ok(header && ended && compressed.length, 'complete PNG');
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  assert.equal(header[8], 8, '8-bit channels');
  assert.equal(header[9], 6, 'RGBA with an alpha channel');
  assert.equal(header[12], 0, 'non-interlaced');
  const raw = inflateSync(Buffer.concat(compressed)), stride = width * 4;
  assert.equal(raw.length, (stride + 1) * height, 'decoded dimensions');
  const pixels = Buffer.alloc(width * height * 4);
  function paeth(a, b, c) {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4, 'valid PNG filter');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, a = x >= 4 ? pixels[index - 4] : 0;
      const b = y ? pixels[index - stride] : 0, c = y && x >= 4 ? pixels[index - stride - 4] : 0;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[index] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return {width, height, pixels};
}

function glb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB v2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB declared length');
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert.equal(length % 4, 0, 'aligned GLB chunk');
    assert.ok(offset + 8 + length <= bytes.length, 'complete GLB chunk');
    chunks.push({type, data: bytes.subarray(offset + 8, offset + 8 + length)});
    offset += length + 8;
  }
  assert.deepEqual(chunks.map(c => c.type), [0x4e4f534a, 0x004e4942], 'JSON and BIN chunks');
  const json = JSON.parse(chunks[0].data.toString('utf8')), bin = chunks[1].data;
  assert.equal(json.asset.version, '2.0');
  assert.deepEqual(json.extensionsUsed || [], [], 'no compression or decoder extensions');
  assert.deepEqual(json.extensionsRequired || [], []);
  assert.equal(json.buffers.length, 1);
  assert.equal(json.buffers[0].uri, undefined, 'self-contained buffer');
  assert.ok(json.buffers[0].byteLength <= bin.length && bin.length - json.buffers[0].byteLength < 4);
  for (const view of json.bufferViews) {
    assert.equal(view.buffer, 0);
    assert.ok((view.byteOffset || 0) + view.byteLength <= json.buffers[0].byteLength, 'view bounds');
  }
  function accessor(index) {
    const a = json.accessors[index], view = json.bufferViews[a.bufferView];
    assert.equal(a.sparse, undefined);
    const sizes = {5123: 2, 5126: 4}, widths = {SCALAR: 1, VEC2: 2, VEC3: 3};
    const size = sizes[a.componentType], width = widths[a.type];
    assert.ok(size && width && a.count > 0, 'supported nonempty accessor');
    const step = view.byteStride || size * width, relative = a.byteOffset || 0;
    assert.ok(relative + (a.count - 1) * step + size * width <= view.byteLength, 'accessor bounds');
    return Array.from({length: a.count}, (_, i) => Array.from({length: width}, (_, c) => {
      const offset = (view.byteOffset || 0) + relative + i * step + c * size;
      const value = a.componentType === 5126 ? bin.readFloatLE(offset) : bin.readUInt16LE(offset);
      assert.ok(Number.isFinite(value), 'finite geometry');
      return value;
    }));
  }
  const meshes = json.meshes.map(mesh => {
    let triangles = 0;
    for (const p of mesh.primitives) {
      assert.equal(p.mode ?? 4, 4, 'triangle primitives');
      assert.deepEqual(p.extensions || {}, {}, 'no Draco at primitive level');
      const positions = accessor(p.attributes.POSITION), normals = accessor(p.attributes.NORMAL);
      assert.equal(normals.length, positions.length);
      for (const n of normals) assert.ok(Math.abs(Math.hypot(...n) - 1) < .001, 'unit normals');
      const indices = p.indices === undefined ? positions.map((_, i) => i) : accessor(p.indices).flat();
      assert.equal(indices.length % 3, 0);
      for (const i of indices) assert.ok(Number.isInteger(i) && i >= 0 && i < positions.length, 'index bounds');
      for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = indices.slice(i, i + 3).map(k => positions[k]);
        const u = b.map((x, k) => x - a[k]), v = c.map((x, k) => x - a[k]);
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        assert.ok(Math.hypot(...cross) > 1e-8, 'nondegenerate triangle');
      }
      triangles += indices.length / 3;
      assert.equal(p.material, 0, 'one shared material');
    }
    return {name: mesh.name, triangles};
  });
  return {json, bin, meshes};
}

test('crash pack manifest: exact deliverables exist and match byte counts and hashes', async () => {
  assert.equal(manifest.license, 'CC0-1.0');
  assert.equal(manifest.original, true);
  assert.equal(manifest.compression, 'none');
  assert.deepEqual(manifest.atlases.map(a => a.file).sort(), ['smoke-dust-atlas.png', 'sparks-atlas.png']);
  assert.deepEqual(manifest.models.map(m => m.file).sort(), ['body-fragments.glb', 'formula-tire.glb']);
  const files = [...manifest.atlases, ...manifest.models, manifest.models[1].texture];
  for (const file of files) {
    assert.match(file.file, /^[a-z0-9-]+\.(png|glb)$/);
    const bytes = await read(file.file);
    assert.equal(bytes.length, file.bytes, file.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
  }
  assert.ok((await read('LICENSE.txt')).toString().includes('CC0 1.0'));
});

for (const [filename, blending] of [['sparks-atlas.png', 'AdditiveBlending'], ['smoke-dust-atlas.png', 'NormalBlending']]) {
  test(`${filename}: 256×256 RGBA, sixteen visible 64×64 frames with transparent gutters`, async () => {
    const image = png(await read(filename)), entry = manifest.atlases.find(a => a.file === filename);
    assert.deepEqual([image.width, image.height], [256, 256]);
    assert.deepEqual([entry.width, entry.height, entry.columns, entry.rows, entry.frameCount], [256, 256, 4, 4, 16]);
    assert.equal(entry.blending, blending);
    assert.equal(entry.alpha, 'straight');
    assert.equal(entry.frameOrder, 'row-major-top-left');
    for (let frame = 0; frame < 16; frame++) {
      let visible = 0, translucent = 0;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const offset = (((frame >> 2) * 64 + y) * 256 + (frame % 4) * 64 + x) * 4;
        const [r, g, b, alpha] = image.pixels.subarray(offset, offset + 4);
        if (x < 3 || x >= 61 || y < 3 || y >= 61) assert.equal(alpha, 0, 'transparent tile edge');
        if (alpha) {
          visible++;
          if (alpha < 255) translucent++;
          if (blending === 'NormalBlending') assert.ok(r >= 185 && r === g && g === b, 'light neutral gray smoke');
          else assert.ok(r >= g && g > b, 'warm orange/yellow sparks');
        }
      }
      assert.ok(visible > 8 && translucent > 8, `frame ${frame} has soft visible content`);
    }
  });
}

test('body fragments: six independently centered meshes, each at most 60 actual triangles, one tintable untextured material', async () => {
  const {json, meshes} = glb(await read('body-fragments.glb')), entry = manifest.models[0];
  assert.deepEqual(meshes.map(m => m.name), fragments);
  assert.equal(json.materials.length, 1);
  assert.deepEqual(json.materials[0].pbrMetallicRoughness.baseColorFactor, [1, 1, 1, 1]);
  assert.ok(!JSON.stringify(json.materials).includes('Texture'));
  assert.equal(json.textures, undefined);
  assert.equal(json.images, undefined);
  assert.equal(json.nodes.length, 6);
  assert.deepEqual(json.scenes[json.scene].nodes, [0, 1, 2, 3, 4, 5]);
  for (const [i, mesh] of meshes.entries()) {
    assert.equal(json.nodes[i].name, mesh.name);
    assert.equal(json.nodes[i].mesh, i);
    assert.ok(mesh.triangles > 0 && mesh.triangles <= 60, `${mesh.name}: hard budget independent of manifest`);
    assert.equal(mesh.triangles, entry.meshes[i].triangles);
    const a = json.accessors[json.meshes[i].primitives[0].attributes.POSITION];
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(a.min[axis] + a.max[axis]) < 1e-6, 'local center at origin');
  }
  assert.equal(meshes.reduce((n, mesh) => n + mesh.triangles, 0), entry.triangles);
});

test('formula tire: one mesh at most 120 triangles, UVs and an embedded 128×128 texture matching the PNG', async () => {
  const {json, bin, meshes} = glb(await read('formula-tire.glb')), entry = manifest.models[1];
  assert.equal(meshes.length, 1);
  assert.equal(meshes[0].name, 'formula_tire');
  assert.ok(meshes[0].triangles > 0 && meshes[0].triangles <= 120, 'hard tire budget independent of manifest');
  assert.equal(meshes[0].triangles, entry.triangles);
  assert.equal(meshes[0].triangles, entry.meshes[0].triangles);
  const primitive = json.meshes[0].primitives[0];
  assert.equal(json.accessors[primitive.attributes.TEXCOORD_0].count, json.accessors[primitive.attributes.POSITION].count);
  assert.equal(json.materials.length, 1);
  const texture = json.textures[json.materials[0].pbrMetallicRoughness.baseColorTexture.index];
  const image = json.images[texture.source];
  assert.equal(image.mimeType, 'image/png');
  assert.equal(image.uri, undefined, 'no external texture request');
  const view = json.bufferViews[image.bufferView];
  const embedded = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  assert.deepEqual(embedded, await read('formula-tire-128.png'));
  const decoded = png(embedded);
  assert.deepEqual([decoded.width, decoded.height], [128, 128]);
  assert.deepEqual([entry.texture.width, entry.texture.height], [128, 128]);
});
