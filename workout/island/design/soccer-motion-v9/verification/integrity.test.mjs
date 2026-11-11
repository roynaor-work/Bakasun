/** Original acceptance checks: geometry reuse must be lossless, motion reuse absent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {clips} from '../runtime/catalog.mjs';
import {parseGLB} from './glb-reader.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytesOfView=(glb,i)=>{const v=glb.json.bufferViews[i];return glb.binary.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);};
function signatures(glb){
 const j=glb.json;
 return {
  compressed:j.meshes.flatMap(m=>m.primitives.map(p=>sha(bytesOfView(glb,p.extensions.KHR_draco_mesh_compression.bufferView)))),
  images:j.images.map(i=>sha(bytesOfView(glb,i.bufferView))),
  inverseBinds:j.skins.map(s=>sha(bytesOfView(glb,j.accessors[s.inverseBindMatrices].bufferView))),
  rawWeights:j.meshes.flatMap(m=>m.primitives.flatMap(p=>['JOINTS_0','WEIGHTS_0'].flatMap(k=>{const a=j.accessors[p.attributes[k]];return a.bufferView===undefined?[]:[sha(bytesOfView(glb,a.bufferView))];}))),
  materials:j.materials,
  joints:j.skins.map(s=>s.joints.map(i=>j.nodes[i].name)),
 };
}
const original={};for(const [role,name] of [['field','player'],['keeper','keeper']])original[role]=signatures(parseGLB(await fs.readFile(new URL(`../../soccer-motion-v8/runtime/${name}.glb`,import.meta.url))));
for(const clip of clips)test(`${clip.id}: unchanged geometry, materials, textures, skin and bind matrices`,async()=>{
 const bytes=await fs.readFile(new URL(`../runtime/${clip.asset}`,import.meta.url)),glb=parseGLB(bytes);
 assert.deepEqual(signatures(glb),original[clip.role]);
 assert.equal(sha(bytes),clip.sha256);
 assert.deepEqual(glb.json.animations.map(a=>a.name),[clip.id]);
 assert.equal(glb.json.animations[0].channels.length,19);
});
test('calibration binds all contact cues to real skin with one common sphere per moment',async()=>{
 const build=JSON.parse(await fs.readFile(new URL('./build.json',import.meta.url),'utf8'));
 assert.equal(build.clipCount,48);assert.ok(build.calibration.length>40);
 for(const cue of build.calibration)assert.ok(cue.sphereSurfaceError<=.002,`${cue.id}/${cue.bone}: ${cue.sphereSurfaceError}`);
});

test('authoring source matches the delivered build manifest',async()=>{
 const build=JSON.parse(await fs.readFile(new URL('./build.json',import.meta.url),'utf8'));
 assert.equal(Object.keys(build.authoringFiles).length,8);
 for(const [name,hash] of Object.entries(build.authoringFiles))assert.equal(sha(await fs.readFile(new URL('../'+name,import.meta.url))),hash,name);
});
