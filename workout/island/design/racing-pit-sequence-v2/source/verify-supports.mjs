// SPDX-License-Identifier: CC0-1.0
// Independent uncompressed GLB triangle/support check. JavaScript only, offline.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Matrix4, Quaternion, Ray, Vector3} from '../../racing-v7/vendor/three.module.js';
import {samplePitSequence} from '../src/pit-sequence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sequenceBytes = await readFile(path.join(root, 'sequence.json'));
const config = JSON.parse(sequenceBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const tolerance = .001;
const components = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const types = {5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
const v = point => new Vector3(...point);

async function readGLB(relative) {
  const bytes = await readFile(path.resolve(root, relative));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB byte length');
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'GLB JSON chunk');
  const length = bytes.readUInt32LE(12), offset = 20 + length;
  assert.equal(bytes.readUInt32LE(offset + 4), 0x004e4942, 'GLB binary chunk');
  const json = JSON.parse(bytes.subarray(20, offset));
  assert(!(json.extensionsRequired ?? []).some(name => /draco|meshopt|basisu/i.test(name)), 'No compressed decoder');
  assert((json.buffers ?? []).every(buffer => !buffer.uri), 'Embedded GLB buffers');
  const binary = bytes.subarray(offset + 8);
  const accessors = new Map();
  function accessor(index) {
    if (accessors.has(index)) return accessors.get(index);
    const item = json.accessors[index], view = json.bufferViews[item.bufferView];
    assert(!item.sparse, 'This audit expects ordinary uncompressed accessors');
    const width = components[item.type], [size, method] = types[item.componentType] ?? [];
    assert(width && size, 'Supported accessor component/type');
    const start = (view.byteOffset ?? 0) + (item.byteOffset ?? 0), stride = view.byteStride ?? width * size;
    assert(start + Math.max(0, item.count - 1) * stride + width * size <= binary.length, 'Accessor bounds');
    const result = Array.from({length:item.count}, (_, row) => Array.from({length:width}, (_, column) => {
      const value = binary[method](start + row * stride + column * size);
      assert(Number.isFinite(value), 'Finite geometry coordinate'); return value;
    }));
    accessors.set(index, result); return result;
  }
  const parent = new Map();
  json.nodes.forEach((node, i) => (node.children ?? []).forEach(child => parent.set(child, i)));
  const matrices = new Map();
  function matrix(index) {
    if (matrices.has(index)) return matrices.get(index);
    const node = json.nodes[index];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      v(node.translation ?? [0,0,0]), new Quaternion(...(node.rotation ?? [0,0,0,1])), v(node.scale ?? [1,1,1]));
    if (parent.has(index)) local.premultiply(matrix(parent.get(index)));
    matrices.set(index, local); return local;
  }
  const triangles = [], points = [];
  for (const [index, node] of json.nodes.entries()) {
    if (node.mesh === undefined) continue;
    assert(node.skin === undefined, 'Support/car audit expects static mesh geometry');
    for (const primitive of json.meshes[node.mesh].primitives) {
      assert(primitive.mode === undefined || primitive.mode === 4, 'Triangle geometry');
      const vertices = accessor(primitive.attributes.POSITION).map(point => v(point).applyMatrix4(matrix(index)));
      const indices = primitive.indices === undefined ? vertices.map((_, i) => [i]) : accessor(primitive.indices);
      points.push(...vertices.map(point => ({node:node.name,point})));
      for (let i = 0; i < indices.length; i += 3) {
        const corners = [indices[i][0],indices[i+1][0],indices[i+2][0]].map(vertex => vertices[vertex]);
        assert(corners.every(Boolean), 'Triangle indices in range');
        triangles.push({node:node.name,corners});
      }
    }
  }
  function bounds(selection = () => true, placement = new Matrix4()) {
    const selected = points.filter(point => selection(point.node)).map(({point}) => point.clone().applyMatrix4(placement));
    assert(selected.length, 'Bounds require actual decoded vertices');
    return {min:[0,1,2].map(axis => Math.min(...selected.map(point => point.getComponent(axis)))),
      max:[0,1,2].map(axis => Math.max(...selected.map(point => point.getComponent(axis)))),vertices:selected.length};
  }
  return {relative,bytes:bytes.length,sha256:hash(bytes),triangles,bounds};
}

const car = await readGLB(config.car.asset);
const carBounds = car.bounds(), carHalfWidth = Math.max(Math.abs(carBounds.min[0]), Math.abs(carBounds.max[0]));
const supports = [];
for (const id of ['jack_front','jack_rear']) {
  const jack = config.props.attachments.find(prop => prop.id === id);
  assert(jack?.contactMesh && jack.contactPosition && jack.padLocal, 'Explicit physical support contract');
  const target = jack.contactPosition;
  const triangles = car.triangles.filter(triangle => triangle.node === jack.contactMesh);
  assert(triangles.length, 'Named actual car mesh: ' + jack.contactMesh);
  const ray = new Ray(new Vector3(target[0],carBounds.max[1] + 1,target[2]), new Vector3(0,-1,0));
  const hits = [];
  for (const triangle of triangles) {
    const point = ray.intersectTriangle(...triangle.corners, false, new Vector3());
    if (point) hits.push(point.y);
  }
  assert(hits.length, `${id} pad must be below actual ${jack.contactMesh} triangles`);
  const undersideY = Math.min(...hits);
  const placement = new Matrix4().compose(v(jack.position),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),jack.yaw),v([1,1,1]));
  const padTop = v(jack.padLocal).add(new Vector3(0,.025,0)).applyMatrix4(placement).toArray();
  const errors = {padTopY:Math.abs(padTop[1] - undersideY),contractY:Math.abs(target[1] - undersideY),
    horizontal:Math.hypot(padTop[0] - target[0],padTop[2] - target[2]),restPadY:Math.abs(jack.restPadY + .025 + jack.position[1] - undersideY)};
  assert(Object.values(errors).every(error => error <= tolerance), `${id} pad top and actual mesh underside differ by more than 1mm: ${JSON.stringify(errors)}`);
  let footprint = null;
  if (id === 'jack_rear') {
    const jackAsset = await readGLB(jack.asset), padBounds = jackAsset.bounds(name => name === 'LiftPad');
    const radius = (padBounds.max[0] - padBounds.min[0]) / 2 * jack.padScale[0];
    const ys = [], missing = [];
    // This rear pad is deliberately smaller and offset from the central fin.
    // Sample its entire circular footprint, including the perimeter, against
    // decoded Diffuser triangles rather than relying on the center ray alone.
    for (let row = -10; row <= 10; row++) for (let column = -10; column <= 10; column++) {
      if (row * row + column * column > 100) continue;
      const x = target[0] + column * radius / 10, z = target[2] + row * radius / 10;
      const probe = new Ray(new Vector3(x,carBounds.max[1] + 1,z),new Vector3(0,-1,0)), intersections = [];
      for (const triangle of triangles) {
        const point = probe.intersectTriangle(...triangle.corners,false,new Vector3());
        if (point) intersections.push(point.y);
      }
      if (intersections.length) ys.push(Math.min(...intersections)); else missing.push([x,z]);
    }
    // A pad may overhang an edge of the supported part. Empty rays are exposed
    // as coverage, not fabricated as contacts; any lower fin hit still fails.
    assert(ys.length, 'Rear pad must have a measurable supporting surface');
    assert(ys.every(y => y >= undersideY - tolerance), `Rear pad footprint must clear every lower Diffuser fin: ${Math.min(...ys)}..${Math.max(...ys)}`);
    footprint = {radiusMeters:radius,probes:ys.length+missing.length,contactRays:ys.length,coverage:ys.length/(ys.length+missing.length),xRange:[target[0]-radius,target[0]+radius],
      zRange:[target[2]-radius,target[2]+radius],undersideRangeY:[Math.min(...ys),Math.max(...ys)],missingRays:missing.length,
      edgeOverhang:missing.length>0,centralFinClear:true,passed:true};
  }
  supports.push({id,mesh:jack.contactMesh,triangles:triangles.length,ray:{x:target[0],z:target[2],direction:[0,-1,0]},
    intersectionsY:[...new Set(hits)].sort((a,b) => a-b),undersideY,restPadY:jack.restPadY,padTop,contractContact:target,errorMeters:errors,footprint,passed:true});
}

// These are conservative one-dimensional corridor checks, not a mesh collision
// solver. Operator core radius is explicit; hands reach toward tools by design.
const operators = config.actors.filter(actor => actor.id.startsWith('jack_')).map(actor => {
  const assumedCoreRadiusMeters = .20, margin = Math.abs(actor.position[0]) - assumedCoreRadiusMeters - carHalfWidth;
  assert(margin > 0, `${actor.id} body core must stand outside the full car-width corridor`);
  return {id:actor.id,position:actor.position,assumedCoreRadiusMeters,conservativeLateralMarginMeters:margin,passed:true};
});
const baseClearances = [];
for (const id of ['jack_front','jack_rear']) {
  const jack = config.props.attachments.find(prop => prop.id === id), asset = await readGLB(jack.asset);
  const snapshot = samplePitSequence(config, jack.clearAt);
  const key = id.replace('jack_', ''), position = snapshot.jacks[key].position;
  assert(position, 'Controller exposes the actual jack clearance position');
  const placement = new Matrix4().compose(v(position),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),jack.yaw),v([1,1,1]));
  const baseBounds = asset.bounds(name => name === 'Base', placement);
  const nearestX = position[0] >= 0 ? baseBounds.min[0] : -baseBounds.max[0], margin = nearestX - carHalfWidth;
  assert(margin > 0, `${id} base is not fully clear of the conservative car-width corridor: ${margin}`);
  baseClearances.push({id,time:jack.clearAt,position,baseBounds,conservativeLateralMarginMeters:margin,passed:true});
}

const report = {schemaVersion:1,passed:true,method:'Decode original uncompressed GLB triangle vertices; downward ray through each configured pad support x/z; compare lowest actual car-mesh intersection against pad top. No WASM or geometric decoders.',
  inputs:{sequence:{file:'sequence.json',sha256:hash(sequenceBytes)},car:{file:car.relative,bytes:car.bytes,sha256:car.sha256}},
  toleranceMeters:tolerance,padGeometry:{halfHeightMeters:.025,topProbeLocal:[0,.025,0]},carBounds,supports,
  clearances:{carHalfWidthMeters:carHalfWidth,operators,baseClearances},
  limitations:['Support verification checks the center of each pad top plus 317 rays across the rear pad footprint; it is not a continuous all-surface collision simulation.',
    'Lateral corridor checks use full static car geometry and an explicit 0.20m operator body-core radius; hands/tool contact and animation are verified separately.']};
await mkdir(path.join(root,'verification'),{recursive:true});
await writeFile(path.join(root,'verification/supports.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS: both jack pads meet actual formula mesh undersides within 1mm; operators and cleared jack bases stand outside the car-width corridor.');
