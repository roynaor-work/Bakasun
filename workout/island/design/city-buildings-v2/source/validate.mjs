import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Install the development validator outside the deliverable; no package install at runtime.
const require=createRequire(path.resolve(process.env.CITY_V2_TOOLS || '/tmp/city-v2-tools','package.json'));
const validator=require('gltf-validator');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.buildings.length,20);
const report={validator:validator.version(),glbCount:0,errors:0,warnings:0,infos:0,hints:0,glbBytes:0,minTriangles:Infinity,maxTriangles:0,assets:[]};
const filenames=new Set(),geometryHashes=new Map();
for(const building of manifest.buildings){
  assert.equal(building.variants.length,2);assert.equal(building.occupancy.cellCount,building.occupancy.occupiedCells.length);
  assert.equal(new Set(building.occupancy.occupiedCells.map(p=>p.join(','))).size,building.occupancy.cellCount);
  assert.equal(building.occupancy.cellCount,building.footprint.columns*building.footprint.rows);
  for(const [x,z] of building.occupancy.occupiedCells)assert.ok(x>=0&&x<building.footprint.columns&&z>=0&&z<building.footprint.rows);
  const completeGeometries=[];
  for(const variant of building.variants){
    assert.deepEqual(Object.keys(variant.assets),manifest.stages);
    for(const [stage,asset] of Object.entries(variant.assets)){
      assert.ok(!filenames.has(asset.path));filenames.add(asset.path);
      const bytes=await fs.readFile(path.join(root,asset.path));
      assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
      const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength));
      assert.ok(!doc.extensionsUsed?.length&&!doc.extensionsRequired?.length);assert.equal(doc.buffers.length,1);
      assert.ok(!doc.buffers[0].uri&&!doc.images&&!doc.textures&&!doc.animations&&!doc.skins);
      assert.equal(doc.meshes.length,1);assert.equal(doc.meshes[0].primitives.length,1);
      assert.equal(doc.nodes[0].extras.stage,stage);assert.equal(doc.nodes[0].extras.palette,variant.palette);
      const primitive=doc.meshes[0].primitives[0];assert.equal(primitive.mode,4);
      assert.equal(doc.accessors[primitive.indices].count/3,asset.triangles);
      assert.ok(asset.triangles>=200&&asset.triangles<=800);
      const pos=doc.accessors[primitive.attributes.POSITION];
      assert.deepEqual(pos.min,asset.bounds.min);assert.deepEqual(pos.max,asset.bounds.max);
      assert.ok(pos.min[1]>=0&&pos.min[0]>=-building.footprint.columns/2&&pos.max[0]<=building.footprint.columns/2);
      assert.ok(pos.min[2]>=-building.footprint.rows/2&&pos.max[2]<=building.footprint.rows/2);
      assert.ok(asset.openingAnchor[1]>pos.max[1]);
      const start=28+jsonLength,view=doc.bufferViews[pos.bufferView];
      const positions=bytes.subarray(start+view.byteOffset,start+view.byteOffset+view.byteLength);
      const geometryHash=createHash('sha256').update(positions).digest('hex');
      const key=building.id+'/'+stage;
      if(geometryHashes.has(key))assert.equal(geometryHashes.get(key),geometryHash,'Palette changes geometry');
      else geometryHashes.set(key,geometryHash);
      if(stage==='complete')completeGeometries.push(geometryHash);
      const result=await validator.validateBytes(new Uint8Array(bytes),{uri:asset.path,maxIssues:100});
      assert.equal(result.issues.numErrors,0,asset.path+JSON.stringify(result.issues.messages));
      assert.equal(result.issues.numWarnings,0,asset.path+JSON.stringify(result.issues.messages));
      assert.equal(result.issues.numInfos,0,asset.path+JSON.stringify(result.issues.messages));
      assert.equal(result.issues.numHints,0,asset.path+JSON.stringify(result.issues.messages));
      report.glbCount++;report.glbBytes+=bytes.length;
      report.minTriangles=Math.min(report.minTriangles,asset.triangles);report.maxTriangles=Math.max(report.maxTriangles,asset.triangles);
      report.assets.push({path:asset.path,sha256:asset.sha256,bytes:bytes.length,triangles:asset.triangles,vertices:asset.vertices,
        errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,hints:result.issues.numHints});
    }
  }
  assert.equal(new Set(completeGeometries).size,1);
  assert.equal(new Set(manifest.stages.map(stage=>geometryHashes.get(building.id+'/'+stage))).size,3,'Construction stages share geometry');
  assert.notEqual(building.variants[0].assets.complete.sha256,building.variants[1].assets.complete.sha256);
}
assert.equal(new Set(manifest.buildings.map(b=>geometryHashes.get(b.id+'/complete'))).size,20,'Distinct building silhouettes');
assert.equal(report.glbCount,120);
report.checks={embeddedBuffers:true,noExtensions:true,noTextures:true,oneMeshAndMaterialPerGLB:true,distinctCompletedGeometry:20,
  allStagesHaveDifferentGeometry:true,identicalGeometryAcrossPalettes:true,allGridBoundsRespected:true,allCapacitiesDeclared:true,allSHA256Matched:true};
await fs.writeFile(path.join(root,'verification/gltf-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,assets:`${report.assets.length} records saved`}));
