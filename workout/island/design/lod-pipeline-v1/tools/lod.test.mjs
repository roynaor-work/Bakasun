import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseGLB,writeGLB,invariantFingerprint,sha256,sceneTriangleCount,rawAccessor,addAccessor} from './glb.mjs';
import {decimate,measure,outputPath} from './lod.mjs';
import {hausdorff,TriangleBVH} from './hausdorff.mjs';
import {selectLod} from './lod-policy.mjs';
import {authoredVariant} from './authored.mjs';
import {calibratePolicy} from './calibrate-policy.mjs';
import validator from '../vendor/gltf-validator/index.js';

const read = name => fs.readFile(new URL('../'+name,import.meta.url));
const config=JSON.parse(await read('lod-config.json'));

test('surface distance encloses the analytic distance between parallel triangles',()=>{
  const a=Float64Array.from([0,0,0,1,0,0,0,1,0]), b=Float64Array.from(a,(v,i)=>v+(i%3===2?.3:0));
  const h=hausdorff(a,b,{tolerance:.02,maxSamples:15000});
  assert.ok(h.lowerMetres<=.3+1e-12&&h.upperMetres>=.3-1e-12);
  assert.ok(h.intervalWidthMetres<=.02);assert.equal(h.toleranceReached,true);
});

test('Hausdorff includes face interiors, even when both surfaces share every vertex',()=>{
  const p=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
  const surface=faces=>Float64Array.from(faces.flatMap(ids=>ids.flatMap(i=>p[i])));
  const closed=surface([[0,1,2],[0,3,1],[0,2,3],[1,3,2]]),open=surface([[0,1,2],[0,3,1],[0,2,3]]);
  const h=hausdorff(closed,open,{tolerance:.02,maxSamples:15000});
  assert.ok(h.lowerMetres>.3);assert.ok(h.lowerMetres<=1/3+1e-9);assert.ok(h.upperMetres>=1/3);
});

test('degenerate triangles have a finite nearest-surface distance',()=>{
  const bvh=new TriangleBVH(Float64Array.from([0,0,0,0,0,0,1,0,0]));
  assert.equal(bvh.nearest([.5,2,0]),2);
});

test('distance policy holds the level near boundaries and handles large jumps',()=>{
  const p=config.profiles.crowd;
  assert.equal(selectLod(12,p),1);assert.equal(selectLod(12.5,p,0),0);assert.equal(selectLod(13.3,p,0),1);
  assert.equal(selectLod(11,p,1),1);assert.equal(selectLod(10.7,p,1),0);
  assert.equal(selectLod(80,p,0),2);assert.equal(selectLod(0,p,2),0);
  for(const d of [-1,NaN,Infinity])assert.throws(()=>selectLod(d,p));
});

test('pipeline refuses output outside its own package',()=>{
  assert.throws(()=>outputPath('../existing.glb'));
  assert.throws(()=>outputPath('/tmp/existing.glb'));
  assert.equal(outputPath('models/test-lod1.glb'),fileURLToPath(new URL('../models/test-lod1.glb',import.meta.url)));
});

test('calibrated distances bound perspective surface error at the reference viewport',()=>{
  const manifest={assets:[{id:'test',profile:'crowd',variants:[{scenes:[{hausdorff:{upperMetres:.1,diagonalMetres:2}}],animatedSurfaces:[]},{scenes:[{hausdorff:{upperMetres:.3,diagonalMetres:2}}],animatedSurfaces:[]}]}]};
  const c=structuredClone(config);calibratePolicy(manifest,c);
  const p=c.assets.test,f=c.projection.referenceViewportHeightPx/(2*Math.tan(c.projection.verticalFovDegrees*Math.PI/360));
  for(const level of [1,2]){const z=p.enterMetres[level]*(1-c.hysteresisFraction)-p.boundingRadiusMetres,e=p.measuredErrorUpperMetres[level-1];assert.ok(f*e/z*(1+p.boundingRadiusMetres/z)<=p.referencePixelLimits[level-1]);}
  assert.ok(p.enterMetres[2]>p.enterMetres[1]);
});

test('skinned crowd pipeline: deterministic authored output, immutable inputs and exact animation contract',async()=>{
  const bytes=await read('models/soccer-crowd-people-v2/fan-01-lod0.glb'),hash=sha256(bytes),source=parseGLB(bytes);
  for(const [level,ratio] of [[1,.4],[2,.12]]) {
    const guide=await read(`guides/soccer-crowd-people-v2/fan-01-lod${level}.glb`);
    const result=authoredVariant(bytes,guide,ratio),again=authoredVariant(bytes,guide,ratio);
    assert.equal(sha256(bytes),hash);assert.equal(sha256(result.bytes),sha256(again.bytes));
    assert.equal(invariantFingerprint(source),invariantFingerprint(result.doc));
    assert.ok(Math.abs(sceneTriangleCount(result.doc)/sceneTriangleCount(source)-ratio)<.03);
    const report=measure(source,result,config);
    assert.equal(report.animation.maxDriftMetres,0);assert.ok(report.animation.comparedVertices>1000);
    assert.equal(report.animation.clips,7);
  }
});

test('QEM reduces a skinned city citizen at both budgets without changing bone weights',async()=>{
  const bytes=await read('models/city-citizens-v1/people/adult-man-a-lod0.glb'),source=parseGLB(bytes);
  for(const ratio of [.4,.12]) {
    const result=decimate(bytes,ratio);
    assert.ok(Math.abs(sceneTriangleCount(result.doc)/sceneTriangleCount(source)-ratio)<.03);
    assert.equal(invariantFingerprint(source),invariantFingerprint(result.doc));
    assert.equal(measure(source,result,config).animation.maxDriftMetres,0);
  }
});

test('tennis: all three independent rigs and all supported bones survive; budgets use the default scene',async()=>{
  const bytes=await read('models/tennis-crowd-people-v2/fan-01-lod0.glb'),source=parseGLB(bytes);
  for(const [sourceMesh,ratio] of [[1,.4],[2,.12]]) {
    const result=authoredVariant(bytes,bytes,ratio,{sourceMesh,sourceScene:sourceMesh});
    assert.equal(result.doc.json.skins.length,3);assert.equal(result.doc.json.scenes.length,3);
    assert.equal(invariantFingerprint(result.doc),invariantFingerprint(source));
    assert.ok(Math.abs(sceneTriangleCount(result.doc)/210-ratio)<.03);
    assert.equal(measure(source,result,config).animation.maxDriftMetres,0);
  }
});

test('shared geometry accessor addresses are remapped once for independent rigs',async()=>{
  const source=parseGLB(await read('models/tennis-crowd-people-v2/fan-01-lod0.glb'));
  const attributes=source.json.meshes[0].primitives[0].attributes;
  source.json.meshes.forEach(m=>m.primitives[0].attributes=attributes);
  const result=parseGLB(writeGLB(source));
  assert.deepEqual(result.json.meshes[0].primitives[0].attributes,result.json.meshes[2].primitives[0].attributes);
  assert.equal(result.json.accessors[result.json.meshes[2].primitives[0].attributes.POSITION].count,630);
});

test('identical bind arrays share native storage while retaining every matrix byte',async()=>{
  const source=parseGLB(await read('models/tennis-crowd-people-v2/fan-01-lod0.glb'));
  const first=source.json.skins[0].inverseBindMatrices;
  source.json.skins[1].inverseBindMatrices=addAccessor(source,source.json.accessors[first],rawAccessor(source,first).slice());
  const fingerprint=invariantFingerprint(source),result=parseGLB(writeGLB(source));
  const [a,b]=result.json.skins.map(s=>result.json.accessors[s.inverseBindMatrices]);
  assert.equal(a.bufferView,b.bufferView);assert.equal(invariantFingerprint(result),fingerprint);
});

test('shared morph and vertex views declare the required native byte stride',async()=>{
  const source=parseGLB(await read('models/catch-vehicles-v2/police-sedan-lod0.glb')),bytes=writeGLB(source),output=parseGLB(bytes);
  const validation=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:50});
  assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages));
  const uses=new Map();output.json.accessors.forEach(a=>uses.set(a.bufferView,(uses.get(a.bufferView)||0)+1));
  let shared=0;output.json.bufferViews.forEach((v,i)=>{if(v.target===34962&&uses.get(i)>1){shared++;assert.ok(v.byteStride>=4&&v.byteStride%4===0);}});
  assert.ok(shared>0);
});

test('authored crowd topology retains the original wrist and shoulder influence support',async()=>{
  const sourceBytes=await read('models/hoops-realism-v2/crowd/fan-01-lod0.glb'),guideBytes=await read('guides/hoops-realism-v2/crowd/fan-01-lod2.glb');
  const result=authoredVariant(sourceBytes,guideBytes,.12);
  assert.ok(result.stats[0].jointSupportTriangles>0);
  assert.ok(Math.abs(result.primaryCount/210-.12)<.03);
  assert.equal(measure(parseGLB(sourceBytes),result,config).animation.maxDriftMetres,0);
});

test('vehicle morphs, wheel clips and every damage scene survive at both budgets',async()=>{
  const bytes=await read('models/catch-vehicles-v2/police-sedan-lod0.glb'),source=parseGLB(bytes);
  for(const ratio of [.4,.12]) {
    const result=decimate(bytes,ratio);
    assert.deepEqual(result.doc.json.scenes.map(s=>s.name),['intact','damaged','crushed']);
    assert.equal(invariantFingerprint(source),invariantFingerprint(result.doc));
    assert.ok(Math.abs(sceneTriangleCount(result.doc)/sceneTriangleCount(source)-ratio)<.03);
    const report=measure(source,result,config);
    assert.equal(report.animation.maxDriftMetres,0);assert.equal(report.scenes.length,3);
  }
});

test('compressed and externally linked GLBs fail closed',async()=>{
  const source=parseGLB(await read('models/soccer-crowd-people-v2/fan-01-lod0.glb'));
  source.json.extensionsUsed=['KHR_draco_mesh_compression'];
  assert.throws(()=>parseGLB(writeGLB(source)),/prohibited/);
  delete source.json.extensionsUsed;const native=writeGLB(source),j=parseGLB(native);
  assert.ok(j.json.images.every(i=>i.uri===undefined));
  j.json.images[0].uri='elsewhere.png';assert.throws(()=>parseGLB(writeGLB(j)),/External resources/);
  const changed=Buffer.from(native);changed.writeUInt32LE(1,4);assert.throws(()=>parseGLB(changed),/header/);
});
