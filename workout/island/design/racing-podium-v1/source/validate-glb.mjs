// SPDX-License-Identifier: CC0-1.0. Khronos validation and independent delivery contracts.
// Verification dependencies are installed outside the repository.
import{readFile,writeFile,readdir,mkdir}from'node:fs/promises';
import path from'node:path';
import{fileURLToPath}from'node:url';
import{createRequire}from'node:module';
import{createHash}from'node:crypto';
import assert from'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const require=createRequire(path.join(path.resolve(arg('--modules','/tmp/racing-podium-tools')),'package.json'));
const validator=require('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex');
const NAMES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const PARENTS=[null,0,1,2,3,4,3,6,7,3,9,10,1,12,13,1,15,16];
const MOTIONS=['exit_car','helmet_lift','wave','victory_dance','disappointment','handshake','podium_idle','trophy_lift'];
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const report={validatorVersion:validator.version(),generatedAt:new Date().toISOString(),files:[],passed:false};
for(const file of(await walk(path.join(root,'assets'))).filter(p=>p.endsWith('.glb')).sort()){
  const bytes=await readFile(file),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const result=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(file),maxIssues:1000});
  const record={file:path.relative(root,file),bytes:bytes.length,sha256:hash(bytes),errors:result.issues.numErrors,
    warnings:result.issues.numWarnings,infos:result.issues.numInfos,hints:result.issues.numHints,
    messages:result.issues.messages,contractErrors:[],triangles:0,animationNames:(json.animations??[]).map(a=>a.name)};
  report.files.push(record);
  try{
    assert.equal(json.asset.version,'2.0');assert.equal(json.buffers.length,1);
    assert(json.buffers.every(b=>!b.uri),'External buffer');assert(!(json.images??[]).length,'Unexpected image/texture');
    assert(!(json.extensionsRequired??[]).length,'A decoder/extension is required');
    for(const mesh of json.meshes)for(const p of mesh.primitives){
      assert.equal(p.mode??4,4,'Expected triangles');
      if(p.attributes.COLOR_0!==undefined){const color=json.accessors[p.attributes.COLOR_0];assert(['VEC3','VEC4'].includes(color.type));}
      record.triangles+=(p.indices!==undefined?json.accessors[p.indices].count:json.accessors[p.attributes.POSITION].count)/3;
    }
    if(path.basename(file).startsWith('driver-')){
      assert.equal(json.skins.length,1,'Exactly one skin');const skin=json.skins[0];
      assert.deepEqual(skin.joints.map(i=>json.nodes[i].name),NAMES,'Canonical joint order');
      for(let i=0;i<NAMES.length;i++){
        if(PARENTS[i]===null)continue;
        assert((json.nodes[skin.joints[PARENTS[i]]].children??[]).includes(skin.joints[i]),`Canonical parent for ${NAMES[i]}`);
      }
      assert.equal(record.animationNames.length,8);assert.deepEqual([...record.animationNames].sort(),[...MOTIONS].sort());
      assert.equal(json.accessors[skin.inverseBindMatrices].count,18);
      for(const mesh of json.meshes)for(const p of mesh.primitives){
        assert(p.attributes.COLOR_0!==undefined,'Driver vertex colors missing');
        assert(p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined,'Skin weights missing');
        assert(p.attributes._TEAM_MASK!==undefined,'Vertex team mask missing');
      }
      record.canonicalJoints=18;
    }
  }catch(e){record.contractErrors.push(e.message);}
  record.passed=record.errors===0&&record.warnings===0&&record.contractErrors.length===0;
}
report.passed=report.files.length>0&&report.files.every(f=>f.passed);
await mkdir(path.join(root,'verification'),{recursive:true});
await writeFile(path.join(root,'verification/khronos.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({files:report.files.length,errors:report.files.reduce((s,f)=>s+f.errors,0),
  warnings:report.files.reduce((s,f)=>s+f.warnings,0),contracts:report.files.flatMap(f=>f.contractErrors),passed:report.passed},null,2));
if(!report.passed)process.exitCode=1;
