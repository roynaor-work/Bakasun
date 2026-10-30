#!/usr/bin/env node
/** Validate the delivered compressed bytes and an independently decoded copy.
 * Usage: node source/validate.mjs --models /absolute/models --modules /absolute/tooling
 * Dependencies live outside the asset repository; see README for pinned versions.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${name} requires a path`);
  return path.resolve(argv[index + 1]);
}
const modelsDir = arg('--models', process.cwd());
const modulesDir = arg('--modules');
if (!modulesDir) throw new Error('Pass --modules with the directory containing the installed package.json/node_modules.');
const require = createRequire(path.join(path.basename(modulesDir) === 'node_modules' ? path.dirname(modulesDir) : modulesDir, 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const draco = require('draco3dgltf');
const validator = require('gltf-validator');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule() });
const expected = [
  'basketball', 'basketball-arena', 'basketball-hoop', 'fence', 'fir-a', 'fir-b', 'fir-c',
  'rock', 'ski-poles', 'ski-slope', 'skis', 'slalom-gate', 'snowboard', 'soccer-ball', 'soccer-goal', 'soccer-stadium',
].sort();
const large = new Set(['soccer-stadium', 'basketball-arena', 'ski-slope']);
const requiredNodes = {
  'soccer-stadium': ['pitch_surface', 'stand_shell', 'beams', 'floodlights', 'anchor_ball_spot'],
  'basketball-arena': ['scoreboard', 'anchor_ball_spot', 'anchor_rim_center_north', 'anchor_rim_center_south'],
  'soccer-goal': ['goal_post', 'crossbar', 'net', 'anchor_goal_center', 'anchor_ball_spot'],
  'basketball-hoop': ['backboard', 'rim', 'net', 'anchor_rim_center', 'anchor_ball_spot'],
  basketball: ['basketball', 'anchor_ball_center'], 'soccer-ball': ['soccer_ball', 'anchor_ball_center'],
  skis: ['ski_left', 'ski_right', 'anchor_boot_left', 'anchor_boot_right'],
  'ski-poles': ['pole_left', 'pole_right', 'anchor_grip_left', 'anchor_grip_right'],
  snowboard: ['snowboard', 'anchor_boot_front', 'anchor_boot_rear'],
  'ski-slope': ['anchor_route_start', 'anchor_route_end'],
  'slalom-gate': ['anchor_gate_center', 'anchor_pole_left', 'anchor_pole_right'],
  fence: ['anchor_connect_left', 'anchor_connect_right'], rock: ['anchor_rock_top'],
  'fir-a': ['anchor_trunk_base', 'anchor_tree_tip'], 'fir-b': ['anchor_trunk_base', 'anchor_tree_tip'], 'fir-c': ['anchor_trunk_base', 'anchor_tree_tip'],
};
const rawDir = path.join(modelsDir, 'validation');
await fs.mkdir(path.join(rawDir, 'compressed'), { recursive: true });
await fs.mkdir(path.join(rawDir, 'decoded'), { recursive: true });
const round = (value, digits = 7) => Number(value.toFixed(digits));
const vec = (array) => Array.from(array, (value) => round(value));
const approx = (a, b, epsilon = 0.00001) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= epsilon);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function glbJSON(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB header.');
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Missing JSON chunk.');
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8').trim());
}
function point(matrix, a) {
  return [matrix[0]*a[0] + matrix[4]*a[1] + matrix[8]*a[2] + matrix[12],
    matrix[1]*a[0] + matrix[5]*a[1] + matrix[9]*a[2] + matrix[13],
    matrix[2]*a[0] + matrix[6]*a[1] + matrix[10]*a[2] + matrix[14]];
}
async function writeJSON(filename, value) { await fs.writeFile(filename, `${JSON.stringify(value, null, 2)}\n`); }
async function validate(bytes, filename) {
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: filename, maxIssues: 0 });
  // Validator's wall-clock timestamp is omitted so repeat runs produce identical reports.
  delete report.validatedAt;
  return report;
}
function issueCounts(report) {
  return Object.fromEntries(['numErrors', 'numWarnings', 'numInfos', 'numHints'].map((key) => [key, report.issues[key]]));
}

// Interior overlap is forbidden within a material's atlas. Different materials
// may each use [0,1], including the intentionally independent pitch tile.
const UV_OVERLAP_AREA_EPSILON = 1e-12;
const UV_BOUNDARY_EPSILON = 1e-14;
function cross2(a, b, c) {
  return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
}
function uvIntersectionArea(first, second) {
  const clip = cross2(...second) >= 0 ? second : [second[0],second[2],second[1]];
  let polygon = first;
  for (let edge=0; edge<3 && polygon.length; edge++) {
    const a=clip[edge], b=clip[(edge+1)%3], output=[];
    let previous=polygon[polygon.length-1], previousDistance=cross2(a,b,previous);
    for (const current of polygon) {
      const currentDistance=cross2(a,b,current);
      const wasInside=previousDistance >= -UV_BOUNDARY_EPSILON;
      const isInside=currentDistance >= -UV_BOUNDARY_EPSILON;
      if (wasInside !== isInside) {
        const denominator=previousDistance-currentDistance;
        if (Math.abs(denominator)>Number.EPSILON*Number.EPSILON) {
          const fraction=Math.max(0,Math.min(1,previousDistance/denominator));
          output.push([previous[0]+fraction*(current[0]-previous[0]),previous[1]+fraction*(current[1]-previous[1])]);
        }
      }
      if (isInside) output.push(current);
      previous=current; previousDistance=currentDistance;
    }
    polygon=output;
  }
  // A local triangle fan avoids cancellation in the shoelace sum near UV=1.
  let doubleArea=0;
  for (let i=1;i+1<polygon.length;i++) doubleArea+=cross2(polygon[0],polygon[i],polygon[i+1]);
  return Math.abs(doubleArea)*.5;
}
function uvOverlapReport(materialGroups) {
  let overlappingUVTrianglePairs=0, totalOverlapArea=0, broadPhaseCandidatePairs=0;
  const diagnostics=[];
  for (const [material,triangles] of materialGroups) {
    // Each triangle enters only its occupied grid cells; tested neighbours are
    // deduplicated per triangle, avoiding a full all-pairs scan of large shells.
    const resolution=Math.max(8,Math.min(256,Math.ceil(Math.sqrt(triangles.length))));
    const cells=new Map();
    for (let index=0;index<triangles.length;index++) {
      const triangle=triangles[index], tested=new Set();
      const cellBounds=[triangle.min,triangle.max].map((p)=>p.map((v)=>Math.max(0,Math.min(resolution-1,Math.floor(v*resolution)))));
      for (let y=cellBounds[0][1];y<=cellBounds[1][1];y++) {
        for (let x=cellBounds[0][0];x<=cellBounds[1][0];x++) {
          const cellId=y*resolution+x;
          const cell=cells.get(cellId) || [];
          for (const otherIndex of cell) {
            if (tested.has(otherIndex)) continue;
            tested.add(otherIndex);
            const other=triangles[otherIndex];
            if ([0,1].some((axis)=>Math.min(triangle.max[axis],other.max[axis])-Math.max(triangle.min[axis],other.min[axis])<=UV_BOUNDARY_EPSILON)) continue;
            broadPhaseCandidatePairs++;
            const area=uvIntersectionArea(triangle.points,other.points);
            if (area>UV_OVERLAP_AREA_EPSILON) {
              overlappingUVTrianglePairs++; totalOverlapArea+=area;
              if (diagnostics.length<12) diagnostics.push({material:material?.getName() || '(default)',
                first:{node:other.node,primitive:other.primitive,triangle:other.triangle},
                second:{node:triangle.node,primitive:triangle.primitive,triangle:triangle.triangle},area});
            }
          }
          cell.push(index); cells.set(cellId,cell);
        }
      }
    }
  }
  return {overlappingUVTrianglePairs,totalOverlapArea,broadPhaseCandidatePairs,diagnostics};
}

const actual = (await fs.readdir(modelsDir)).filter((name) => name.endsWith('.glb')).map((name) => name.slice(0, -4)).sort();
const globalIssues = [];
if (JSON.stringify(actual) !== JSON.stringify(expected)) globalIssues.push(`Expected exactly the 16 named GLBs; found ${actual.join(', ')}.`);
const results = [];
for (const id of actual) {
  const filename = `${id}.glb`;
  const bytes = await fs.readFile(path.join(modelsDir, filename));
  const json = glbJSON(bytes);
  const issues = [];
  const check = (condition, message) => { if (!condition) issues.push(message); };
  const cap = large.has(id) ? 250000 : 60000;
  check(bytes.length <= cap, `GLB exceeds ${cap} bytes.`);
  check((json.extensionsRequired || []).includes('KHR_draco_mesh_compression'), 'Draco must be a required extension.');
  check(!(json.images?.length || json.textures?.length), 'Image/texture resources are forbidden.');
  check(!(json.buffers || []).some((buffer) => buffer.uri), 'GLB must not reference external buffer URIs.');
  check(!(json.animations?.length || json.skins?.length), 'Static environment/equipment assets must not contain animations or skins.');
  const rawPrimitives = (json.meshes || []).flatMap((mesh) => mesh.primitives);
  check(rawPrimitives.length > 0, 'Asset must contain mesh primitives.');
  for (const [i, primitive] of rawPrimitives.entries()) {
    const compressed = primitive.extensions?.KHR_draco_mesh_compression;
    check(compressed && Number.isInteger(compressed.bufferView) && json.bufferViews?.[compressed.bufferView]?.byteLength > 0, `Primitive ${i} lacks an actual Draco buffer.`);
    check((primitive.mode ?? 4) === 4, `Primitive ${i} is not TRIANGLES.`);
    for (const semantic of ['POSITION', 'NORMAL', 'COLOR_0', 'TEXCOORD_0']) {
      check(Number.isInteger(primitive.attributes?.[semantic]) && Number.isInteger(compressed?.attributes?.[semantic]), `Primitive ${i} lacks compressed ${semantic}.`);
    }
  }
  const compressedReport = await validate(bytes, filename);
  await writeJSON(path.join(rawDir, 'compressed', `${id}.json`), compressedReport);
  check(compressedReport.issues.numErrors === 0, 'Compressed glTF Validator reported errors.');
  check(compressedReport.issues.numWarnings === 0, 'Compressed glTF Validator reported warnings.');
  const doc = await io.readBinary(new Uint8Array(bytes));
  for (const extension of doc.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === 'KHR_draco_mesh_compression') extension.dispose();
  }
  const decodedBytes = await io.writeBinary(doc);
  const decodedReport = await validate(decodedBytes, `${id}.decoded.glb`);
  await writeJSON(path.join(rawDir, 'decoded', `${id}.json`), decodedReport);
  check(decodedReport.issues.numErrors === 0, 'Decoded glTF Validator reported errors.');
  check(decodedReport.issues.numWarnings === 0, 'Decoded glTF Validator reported warnings.');
  const nodes = doc.getRoot().listNodes();
  const names = nodes.map((node) => node.getName());
  check(new Set(names).size === names.length && names.every(Boolean), 'Node names must be nonempty and unique.');
  const roots = nodes.filter((node) => node.getName() === 'asset_root');
  check(roots.length === 1, 'Exactly one asset_root is required.');
  const root = roots[0];
  if (root) {
    check(approx(root.getTranslation(), [0, 0, 0]) && approx(root.getRotation(), [0, 0, 0, 1]) && approx(root.getScale(), [1, 1, 1]), 'asset_root must have identity transform.');
    const extras = root.getExtras();
    check(extras.units === 'metres' && extras.asset_id === id && extras.reference_player_height_m === 1.8, 'Root metadata must declare asset ID, metres and the 1.8m player reference.');
    for (const scene of doc.getRoot().listScenes()) check(scene.listChildren().length === 1 && scene.listChildren()[0] === root, 'Scene must have asset_root as its sole root.');
  }
  for (const name of ['anchor_origin', ...(requiredNodes[id] || [])]) check(names.includes(name), `Missing semantic node ${name}.`);
  const anchors = Object.fromEntries(nodes.filter((node) => node.getName().startsWith('anchor_')).sort((a,b) => a.getName().localeCompare(b.getName(), 'en')).map((node) => [node.getName(), vec(point(node.getWorldMatrix(), [0,0,0]))]));
  check(approx(anchors.anchor_origin || [], [0,0,0]), 'anchor_origin must coincide with asset_root.');
  let authoring;
  try { authoring = JSON.parse(await fs.readFile(path.join(modelsDir, `${id}.authoring.json`), 'utf8')); }
  catch { issues.push('Missing or invalid authoring metadata.'); }
  if (authoring) {
    check(authoring.id === id && authoring.category === (large.has(id) ? 'large' : 'equipment'), 'Authoring category/id mismatch.');
    check(JSON.stringify(Object.keys(anchors).sort()) === JSON.stringify(Object.keys(authoring.anchors || {}).sort()), 'Authoring anchor list differs from the final GLB.');
    for (const [name, value] of Object.entries(authoring.anchors || {})) check(approx(anchors[name] || [], value, 0.00001), `Anchor ${name} differs from authoring coordinates.`);
    for (const name of authoring.objects || []) check(names.includes(name), `Authoring object ${name} is absent from final GLB.`);
  }
  const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  const objectBounds = {}, primitiveDiagnostics = [];
  const uvMaterialGroups = new Map();
  let triangles = 0, vertices = 0, primitiveCount = 0, degenerateGeometry = 0, degenerateUV = 0;
  let uvMin = [Infinity, Infinity], uvMax = [-Infinity, -Infinity];
  for (const node of nodes.filter((node) => node.getMesh())) {
    const matrix = node.getWorldMatrix();
    const nodeBounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (const primitive of node.getMesh().listPrimitives()) {
      primitiveCount++;
      const position = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL'), color = primitive.getAttribute('COLOR_0'), uv = primitive.getAttribute('TEXCOORD_0');
      if (!(position && normal && color && uv)) { issues.push(`Decoded primitive in ${node.getName()} lacks required attributes.`); continue; }
      const count = position.getCount();
      vertices += count;
      check([normal, color, uv].every((a) => a.getCount() === count), `Attribute vertex counts differ in ${node.getName()}.`);
      for (const accessor of [position, normal, color, uv]) check(Array.from(accessor.getArray()).every(Number.isFinite), `Nonfinite attribute in ${node.getName()}.`);
      const p = position.getArray(), t = uv.getArray();
      for (let i=0; i<count; i++) {
        const world = point(matrix, p.subarray(i*3, i*3+3));
        for (let k=0; k<3; k++) {
          bounds[0][k]=Math.min(bounds[0][k], world[k]); bounds[1][k]=Math.max(bounds[1][k], world[k]);
          nodeBounds[0][k]=Math.min(nodeBounds[0][k], world[k]); nodeBounds[1][k]=Math.max(nodeBounds[1][k], world[k]);
        }
        for (let k=0; k<2; k++) { uvMin[k]=Math.min(uvMin[k],t[i*2+k]); uvMax[k]=Math.max(uvMax[k],t[i*2+k]); }
      }
      check(uvMin.every((v) => v >= -0.0001) && uvMax.every((v) => v <= 1.0001), `UV coordinates outside normalized atlas in ${node.getName()}.`);
      const indices = primitive.getIndices()?.getArray() || Uint32Array.from({length:count},(_,i)=>i);
      const material=primitive.getMaterial();
      if(!uvMaterialGroups.has(material)) uvMaterialGroups.set(material,[]);
      const uvTriangles=uvMaterialGroups.get(material);
      check(indices.length % 3 === 0, `Non-triangular index count in ${node.getName()}.`);
      triangles += indices.length/3;
      let primitiveDegenerateGeometry=0, primitiveDegenerateUV=0;
      for(let i=0; i<indices.length; i+=3) {
        const [a,b,c]=[indices[i],indices[i+1],indices[i+2]];
        const ab=[0,1,2].map((k)=>p[b*3+k]-p[a*3+k]);
        const ac=[0,1,2].map((k)=>p[c*3+k]-p[a*3+k]);
        const cross=[ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
        if(cross.reduce((sum,v)=>sum+v*v,0)<=1e-24) { degenerateGeometry++; primitiveDegenerateGeometry++; }
        const area=(t[b*2]-t[a*2])*(t[c*2+1]-t[a*2+1])-(t[b*2+1]-t[a*2+1])*(t[c*2]-t[a*2]);
        if(Math.abs(area)<=1e-14) { degenerateUV++; primitiveDegenerateUV++; }
        else {
          const points=[a,b,c].map((vertex)=>[t[vertex*2],t[vertex*2+1]]);
          if(points.flat().every(Number.isFinite)) uvTriangles.push({points,
            min:[0,1].map((axis)=>Math.min(...points.map((p)=>p[axis]))),
            max:[0,1].map((axis)=>Math.max(...points.map((p)=>p[axis]))),
            node:node.getName(),primitive:primitiveCount-1,triangle:i/3});
        }
      }
      if(primitiveDegenerateGeometry || primitiveDegenerateUV) primitiveDiagnostics.push({node:node.getName(),degenerateGeometryTriangles:primitiveDegenerateGeometry,degenerateUVTriangles:primitiveDegenerateUV});
      const colorValues = color.getArray(), divisor = color.getNormalized() ? (colorValues instanceof Uint8Array ? 255 : colorValues instanceof Uint16Array ? 65535 : 1) : 1;
      check(Array.from(colorValues).every((value)=>value/divisor>=0 && value/divisor<=1), `Color values outside [0,1] in ${node.getName()}.`);
    }
    objectBounds[node.getName()]=nodeBounds.map(vec);
  }
  check(degenerateGeometry === 0, `${degenerateGeometry} degenerate geometry triangles after Draco decoding.`);
  check(degenerateUV === 0, `${degenerateUV} degenerate UV triangles after Draco decoding.`);
  const uvOverlap=uvOverlapReport(uvMaterialGroups);
  check(uvOverlap.overlappingUVTrianglePairs === 0, `${uvOverlap.overlappingUVTrianglePairs} UV triangle pairs overlap inside the same material atlas after Draco decoding.`);
  check(Math.abs(bounds[0][1]) <= 0.004, 'Asset base must touch Y=0 within 4mm Draco tolerance.');
  check(Math.abs((bounds[0][0]+bounds[1][0])/2) <= 0.015 && Math.abs((bounds[0][2]+bounds[1][2])/2) <= 0.015, 'Asset root must lie at the horizontal footprint centre within 15mm.');
  if (authoring) {
    check(authoring.triangles === triangles, 'Decoded triangle count differs from authoring metadata.');
    const b=authoring.bounds_blender;
    if(b?.length===2) {
      const expectedBounds=[[b[0][0],b[0][2],-b[1][1]],[b[1][0],b[1][2],-b[0][1]]];
      check(bounds.every((bound,i)=>approx(bound,expectedBounds[i],0.004)),'Decoded bounds differ from original authoring bounds by more than 4mm.');
    }
  }
  for(const name of Object.keys(anchors).filter((name)=>name.startsWith('anchor_rim_center'))) check(Math.abs(anchors[name][1]-3.05)<=0.00001, `${name} must be exactly 3.05m high.`);
  if(id==='soccer-goal') {
    const a=anchors.anchor_goal_line_left,b=anchors.anchor_goal_line_right;
    check(a&&b&&Math.abs(Math.hypot(...a.map((v,i)=>v-b[i]))-7.32)<0.00001,'Goal opening anchors must be 7.32m apart.');
    check(Math.abs((anchors.anchor_goal_center?.[1] ?? -1)-1.22)<0.00001,'Goal centre must be half the 2.44m clear opening height.');
    check(Math.abs((objectBounds.crossbar?.[0][1] ?? -1)-2.44)<=0.002,'Crossbar underside must define a 2.44m clear opening height.');
  }
  if(id==='basketball-hoop') check(Math.abs(((objectBounds.rim?.[0][1] ?? -1)+(objectBounds.rim?.[1][1] ?? -1))/2-3.05)<=0.002,'Rim mesh centre must be at 3.05m.');
  const preview = path.join(modelsDir, `${id}.png`);
  let previewBytes=0;
  try {
    const png=await fs.readFile(preview); previewBytes=png.length;
    check(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Preview is not a PNG.');
    check(png.readUInt32BE(16)>=256 && png.readUInt32BE(20)>=256,'Preview must be at least 256px per side.');
  } catch { if(!argv.includes('--allow-missing-previews')) issues.push('Missing per-model PNG preview.'); }
  results.push({id,file:filename,bytes:bytes.length,budgetBytes:cap,sha256:hash(bytes),category:large.has(id)?'large':'equipment',
    triangles,vertices,primitives:primitiveCount,boundsMetres:bounds.map(vec),sizeMetres:vec(bounds[1].map((v,i)=>v-bounds[0][i])),
    uvBounds:[vec(uvMin),vec(uvMax)],degenerateGeometryTriangles:degenerateGeometry,degenerateUVTriangles:degenerateUV,
    overlappingUVTrianglePairs:uvOverlap.overlappingUVTrianglePairs,uvOverlap,
    nodeNames:names.sort(),anchors,objectBoundsMetres:objectBounds,primitiveDiagnostics,previewBytes,validator:{compressed:issueCounts(compressedReport),decoded:issueCounts(decodedReport)},issues});
  console.log(`${filename}: ${bytes.length} bytes, ${triangles} triangles, ${issues.length ? `FAIL: ${issues.join(' ')}` : 'PASS'}`);
}

async function filesIn(dir) {
  const files=[];
  for(const item of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
    const absolute=path.join(dir,item.name);
    if(item.isDirectory()) files.push(...await filesIn(absolute));
    else if(item.isFile()) files.push({path:path.relative(modelsDir,absolute).split(path.sep).join('/'),bytes:(await fs.stat(absolute)).size});
  }
  return files;
}
const packageFiles=(await filesIn(modelsDir)).filter((file)=>file.path!=='validation.json');
const packageBytesWithoutSummary=packageFiles.reduce((sum,file)=>sum+file.bytes,0);
const summary={schemaVersion:1,toolVersions:{gltfValidator:validator.version(),gltfTransform:'4.5.1',draco:'1.5.9'},
  convention:{units:'metres',up:'+Y',forward:'+Z',root:'asset_root',referencePlayerHeightMetres:1.8},
  expectedModelCount:16,modelCount:actual.length,glbBytes:results.reduce((sum,result)=>sum+result.bytes,0),
  totalPackageBudgetBytes:2000000,totalPackageBytes:0,packageFileCount:packageFiles.length+1,
  validationScope:{compressed:true,independentlyDecoded:true,uvDegeneracy:true,
    uvOverlap:{tested:true,scope:'Triangle interiors within each material atlas after independent Draco decoding',
      method:'Uniform-grid broad phase and convex polygon clipping; shared boundaries are excluded',
      areaEpsilon:UV_OVERLAP_AREA_EPSILON,boundaryEpsilon:UV_BOUNDARY_EPSILON},physicalPhonePerformance:false},
  allPassed:false,globalIssues,models:results,packageFiles};
const summaryPath=path.join(modelsDir,'validation.json');
for(let pass=0;pass<8;pass++) {
  const exceeded=summary.totalPackageBytes>summary.totalPackageBudgetBytes;
  const budgetMessage='Complete models directory exceeds 2,000,000 bytes (including source, reports and previews).';
  summary.globalIssues=globalIssues.filter((issue)=>issue!==budgetMessage);
  if(exceeded) summary.globalIssues.push(budgetMessage);
  summary.allPassed=summary.globalIssues.length===0 && results.length===expected.length && results.every((result)=>result.issues.length===0);
  const encoded=`${JSON.stringify(summary,null,2)}\n`;
  const total=packageBytesWithoutSummary+Buffer.byteLength(encoded);
  if(total===summary.totalPackageBytes) { await fs.writeFile(summaryPath,encoded); break; }
  summary.totalPackageBytes=total;
  if(pass===7) throw new Error('Unable to settle validation summary byte count.');
}
console.log(`Package: ${summary.totalPackageBytes} / 2000000 bytes. ${summary.allPassed?'PASS':'FAIL'}. Summary: validation.json`);
if(!summary.allPassed) process.exitCode=1;
