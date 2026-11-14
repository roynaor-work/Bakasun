// npm install --prefix /tmp/alien-boss-tools gltf-validator@2.0.0-dev.3.10
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(process.env.ALIEN_BOSS_TOOLS||'/tmp/alien-boss-tools/package.json');
const validator=require('gltf-validator'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),reports=[];
for(const item of manifest.files){
  const p=path.resolve(root,item.path);assert.ok(p.startsWith(root+path.sep));
  const data=fs.readFileSync(p);assert.equal(data.length,item.bytes);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256);
  if(/\.(ogg|mp3)$/.test(p))assert.ok(data.length<=80000);
}
for(const b of manifest.bosses){
  const bytes=fs.readFileSync(path.join(root,b.model));assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),report=await validator.validateBytes(new Uint8Array(bytes),{uri:b.model,maxIssues:100});
  assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);
  assert.ok(!doc.extensionsRequired?.length);assert.ok(doc.buffers.every(x=>!x.uri));assert.equal(doc.images?.length||0,0);
  const tris=doc.meshes.reduce((sum,m)=>sum+m.primitives.reduce((s,p)=>s+doc.accessors[p.attributes.POSITION].count/3,0),0);assert.equal(tris,b.triangles);assert.ok(Math.abs(tris-3000)<=300);
  for(const t of b.targets){
    const node=doc.nodes.find(n=>n.name===t.node);assert.ok(node);
    const mesh=node.children.map(n=>doc.nodes[n]).find(n=>n.name===t.node+'_geo');
    assert.equal(doc.meshes[mesh.mesh].primitives[0].targets.length,2);
    assert.deepEqual(doc.meshes[mesh.mesh].extras.targetNames,['damaged','critical']);
  }
  for(const a of b.anchors)assert.ok(doc.nodes.some(n=>n.name===a.name&&n.translation.every(Number.isFinite)));
  for(const clip of ['Damage_Intact','Damage_Damaged','Damage_Critical','Entrance','Retreat','Idle'])assert.ok(doc.animations.some(a=>a.name===clip));
  for(const [kind,e] of Object.entries(b.effects)){assert.equal(e.frameCount,6);assert.equal(e.frames.length,6);assert.equal(e.width,768);assert.equal(e.frameWidth,128);}
  reports.push({id:b.id,triangles:tris,bytes:bytes.length,issues:report.issues,info:report.info});
}
fs.writeFileSync(path.join(root,'verification','gltf-validator.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify({assetsChecked:manifest.files.length,bosses:reports.map(r=>({id:r.id,triangles:r.triangles,errors:r.issues.numErrors,warnings:r.issues.numWarnings}))}));
