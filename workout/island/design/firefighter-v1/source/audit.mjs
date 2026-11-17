// SPDX-License-Identifier: CC0-1.0
// Asset delivery audit only. Does not read, write or execute application tests.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {fk} from '../../soccer-header-v1/source/rig.mjs';
import {unpack,readAccessor} from './glb.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
const poses=JSON.parse(await readFile(path.join(base,manifest.motions.poses),'utf8'));
const body=JSON.parse(await readFile(path.join(base,manifest.body.manifest),'utf8'));
const checks=[],assert=(name,passed,details={})=>checks.push({name,passed,...details});
const eps=2e-6,distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const records=[];
let equipment;
for(const file of [manifest.equipment.path,manifest.equipment.independentMask.path,manifest.motions.path,manifest.optionalRescue.cat.path]){
  const bytes=await readFile(path.join(base,file)),g=unpack(bytes),j=g.json;
  records.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  assert(file+' uncompressed',!JSON.stringify(j).includes('KHR_draco_mesh_compression')&&!JSON.stringify(j).includes('EXT_meshopt_compression')&&!j.buffers.some(b=>b.uri));
  let triangles=0,maxNormalError=0,maxQuaternionError=0;
  for(const mesh of j.meshes??[])for(const p of mesh.primitives){
    const pos=readAccessor(g,p.attributes.POSITION);if((p.mode??4)===4)triangles+=(p.indices!==undefined?readAccessor(g,p.indices).values.length:pos.accessor.count)/3;
    for(const key of ['COLOR_0','_REGION'])assert(file+' '+mesh.name+' '+key,p.attributes[key]!==undefined&&readAccessor(g,p.attributes[key]).accessor.count===pos.accessor.count);
    if(p.attributes.NORMAL!==undefined){const a=readAccessor(g,p.attributes.NORMAL).values;for(let i=0;i<a.length;i+=3)maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(...a.slice(i,i+3))-1));}
  }
  for(const a of j.animations??[])for(const c of a.channels){const s=a.samplers[c.sampler],times=readAccessor(g,s.input).values;
    assert(file+' '+a.name+' 30Hz',times.every((t,i)=>Math.abs(t-i/30)<eps));
    if(c.target.path==='rotation'){const values=readAccessor(g,s.output).values;for(let i=0;i<values.length;i+=4)maxQuaternionError=Math.max(maxQuaternionError,Math.abs(Math.hypot(...values.slice(i,i+4))-1));}
  }
  assert(file+' unit normals',maxNormalError<eps,{maxNormalError});
  assert(file+' unit rotations',maxQuaternionError<eps,{maxQuaternionError});
  if(file===manifest.equipment.path){equipment=g;assert('Equipment hard triangle cap',triangles===manifest.equipment.triangles&&triangles<=1500,{triangles,limit:1500});}
  if(file===manifest.optionalRescue.cat.path)assert('Optional cat triangle count',triangles===manifest.optionalRescue.cat.triangles,{triangles});
}
const g=unpack(await readFile(path.join(base,manifest.motions.path))),j=g.json,names=j.nodes.map(n=>n.name);
assert('Exact canonical 18 names and rest hierarchy',j.nodes.length===18&&body.canonicalBones.every(b=>{
 const i=names.indexOf(b.name),n=j.nodes[i],parent=j.nodes.find(n=>(n.children??[]).includes(i));return n&&distance(n.translation,b.rest)<eps&&(parent?.name??null)===b.parent;
}));
const nodeNames=equipment.json.nodes.map(n=>n.name);
assert('Required independently addressable parts',['helmet','helmet_visor','jacket','pants_waist','boot_left','boot_right','glove_left','glove_right','oxygen_mask','mask_regulator','air_backpack','hose_surface','hose_centerline','nozzle','water_emitter'].every(n=>nodeNames.includes(n)));
assert('Both hose representations',equipment.json.meshes.find(m=>m.name==='hose_surface').primitives[0].mode===4&&equipment.json.meshes.find(m=>m.name==='hose_centerline').primitives[0].mode===3);
const clips=[];
for(const id of manifest.motions.requiredClips){
 const entry=manifest.motions.clips.find(c=>c.id===id),a=j.animations.find(a=>a.name===id),source=poses.clips.find(c=>c.id===id);
 let maxPoseError=0,rate=true;
 for(const c of a.channels){const s=a.samplers[c.sampler],values=readAccessor(g,s.output).values,times=readAccessor(g,s.input).values,node=j.nodes[c.target.node].name;
   rate&&=times.length===entry.frameCount&&times.every((t,i)=>Math.abs(t-i/30)<eps);
   const wanted=source.frames.flatMap(f=>c.target.path==='rotation'?f.rotations[node]:f.hips);
   maxPoseError=Math.max(maxPoseError,...values.map((v,i)=>Math.abs(v-wanted[i])));
 }
 let seamError=0;
 if(entry.loop){const f=source.frames[0],l=source.frames.at(-1);seamError=distance(f.hips,l.hips);for(const name of names){const qa=new T.Quaternion(...f.rotations[name]),qb=new T.Quaternion(...l.rotations[name]);seamError=Math.max(seamError,qa.angleTo(qb));}}
 assert(id+' full native channels',a.channels.length===19&&new Set(a.channels.filter(c=>c.target.path==='rotation').map(c=>j.nodes[c.target.node].name)).size===18&&rate&&maxPoseError<eps,{maxPoseError,frameCount:entry.frameCount});
 assert(id+' root fixed',source.frames.every(f=>distance(f.rotations.Root,[0,0,0,1])<eps)&&!a.channels.some(c=>j.nodes[c.target.node].name==='Root'&&c.target.path==='translation'));
 assert(id+' no unreachable IK',entry.maximumReachErrorMeters<1e-5,{maximumReachErrorMeters:entry.maximumReachErrorMeters});
 if(entry.loop)assert(id+' periodic seam',seamError<1e-5,{seamError});
 clips.push({id,frameCount:entry.frameCount,maxPoseError,seamError:entry.loop?seamError:null});
}
// Audit all authored equipment vertices against the floor, not just skeletal soles.
const parts=equipment.json.nodes.filter(n=>n.mesh!==undefined&&!['hose_centerline','hose_surface'].includes(n.name)).map(n=>{
 const p=equipment.json.meshes[n.mesh].primitives[0];return {node:n,positions:readAccessor(equipment,p.attributes.POSITION).values,
   joints:p.attributes.JOINTS_0===undefined?null:readAccessor(equipment,p.attributes.JOINTS_0).values,
   weights:p.attributes.WEIGHTS_0===undefined?null:readAccessor(equipment,p.attributes.WEIGHTS_0).values};
});
const rest=fk({hips:[0,.86,0],rotations:Object.fromEntries(names.map(n=>[n,[0,0,0,1]]))});
let floorMinimum=Infinity,highestCrouchHelmet=-Infinity,highestCrouchCanonical=-Infinity,worstFloor;
const crouchByBody=Object.fromEntries(body.models.map(m=>[m.id,-Infinity]));
const point=new T.Vector3(),result=new T.Vector3(),q=new T.Quaternion();
for(const c of poses.clips.filter(c=>manifest.motions.requiredClips.includes(c.id)))for(const f of c.frames){
 const world=fk(f),matrices=Object.fromEntries(names.map(n=>[n,new T.Matrix4().compose(new T.Vector3(...world[n].position),new T.Quaternion(...world[n].rotation),new T.Vector3(1,1,1)).multiply(new T.Matrix4().makeTranslation(...rest[n].position.map(v=>-v)))]));
 for(const part of parts)for(let i=0;i<part.positions.length;i+=3){
   point.fromArray(part.positions,i);result.set(0,0,0);
   if(part.joints){for(let k=0;k<4;k++){const w=part.weights[i/3*4+k];if(w)result.addScaledVector(point.clone().applyMatrix4(matrices[names[part.joints[i/3*4+k]]]),w);}}
   else {const bone=world[part.node.extras.attachBone];q.fromArray(bone.rotation);result.copy(point).applyQuaternion(q).add(new T.Vector3(...bone.position));}
   const y=result.y*body.models[0].scale-body.models[0].canonicalFloorY*body.models[0].scale;
   if(y<floorMinimum){floorMinimum=y;worstFloor={clip:c.id,time:f.time,node:part.node.name};}
   if(c.id==='crouch_walk'&&part.node.name==='helmet'){
     highestCrouchHelmet=Math.max(highestCrouchHelmet,y);highestCrouchCanonical=Math.max(highestCrouchCanonical,result.y);
     for(const m of body.models){const fitted=new T.Vector3(point.x*m.bodyShape.width,point.y,point.z*m.bodyShape.depth).applyQuaternion(q).add(new T.Vector3(...world.Head.position));crouchByBody[m.id]=Math.max(crouchByBody[m.id],(fitted.y-m.canonicalFloorY)*m.scale);}
   }
 }
}
assert('Equipment mesh floor clearance',floorMinimum>=-.002,{minimumY:floorMinimum,worst:worstFloor,toleranceMeters:.002,scope:'All authored equipment vertices at every native frame, soccer body scale. Hose is updated and checked separately by browser.'});
const crouchHeights=body.models.map(m=>({body:m.id,highestHelmetY:crouchByBody[m.id]}));
assert('Crouch fits under 1.25m smoke boundary',crouchHeights.every(m=>m.highestHelmetY<1.25),{bodies:crouchHeights,smokeBoundaryMeters:1.25});
const qa=JSON.parse(await readFile(path.join(base,'verification/motion-qa.json'),'utf8'));
assert('Official motion QA gate',qa.passed&&qa.minimumScore>=88&&qa.redMetrics===0,{minimumScore:qa.minimumScore,redMetrics:qa.redMetrics});
const summary={schemaVersion:1,records,clips,equipmentFloor:{minimumY:floorMinimum,worst:worstFloor},crouchHeight:highestCrouchHelmet,crouchHeights,checks,passed:checks.every(c=>c.passed)};
await writeFile(path.join(base,'verification/assets.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({passed:summary.passed,checks:checks.length,failures:checks.filter(c=>!c.passed),floorMinimum,highestCrouchHelmet}));
if(!summary.passed)process.exitCode=1;
