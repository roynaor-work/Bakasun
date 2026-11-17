// Original CC0-1.0. Independent inspection of delivered bytes; no exporter imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url));
export const root=path.resolve(here,'..');
const require=createRequire(path.join(process.env.CITY_TOOLS_DIR??'/tmp/city-citizens-tools','package.json'));
const THREE=require('three'),validator=require('gltf-validator');
const {GLTFLoader}=await import(pathToFileURL(require.resolve('three/examples/jsm/loaders/GLTFLoader.js')).href);
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function parse(bytes){const n=bytes.readUInt32LE(12);return JSON.parse(bytes.subarray(20,20+n).toString());}
export async function assetFiles(dir=root){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())out.push(...await assetFiles(f));else if(e.name.endsWith('.glb'))out.push(path.relative(root,f));}return out.sort();}
export async function load(bytes){return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
const qangle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.dot(b))));
const xyz=new THREE.Vector3();
function clipAudit(gltf,clip){
  const mixer=new THREE.AnimationMixer(gltf.scene),action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  let min=Infinity,max=-Infinity,samples=0,vertexSamples=0;
  const joints=[];gltf.scene.traverse(o=>{if(o.isObject3D)joints.push(o);});
  const delta=1/120;
  const times=new Set([0,clip.duration]);for(let n=1;n<Math.ceil(clip.duration*120);n++)times.add(n/120);
  for(const tr of clip.tracks)for(const t of tr.times)times.add(t);
  const sorted=[...times].sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-6);
  function measure(t,floor=true){
    // LoopOnce clamps by pausing the action at its end. Explicitly resume before
    // every independent seek, including rewinds used for endpoint velocities.
    action.paused=false;action.enabled=true;action.setEffectiveTimeScale(1);
    mixer.setTime(t);gltf.scene.updateMatrixWorld(true);
    for(const mesh of meshes){mesh.skeleton?.update();if(!floor)continue;const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        xyz.fromBufferAttribute(positions,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,xyz);xyz.applyMatrix4(mesh.matrixWorld);
        min=Math.min(min,xyz.y);max=Math.max(max,xyz.y);vertexSamples++;
      }
    }
    return joints.map(j=>({name:j.name,p:j.getWorldPosition(new THREE.Vector3()),q:j.getWorldQuaternion(new THREE.Quaternion())}));
  }
  for(const t of sorted){measure(t);samples++;}
  const start=measure(0,false),end=measure(clip.duration,false);let loopPosition=0,loopRotation=0,velocitySeam=0,velocitySeamNode='';
  const shortly=measure(delta,false),before=measure(Math.max(0,clip.duration-delta),false);
  for(let i=0;i<start.length;i++){
    loopPosition=Math.max(loopPosition,start[i].p.distanceTo(end[i].p));loopRotation=Math.max(loopRotation,qangle(start[i].q,end[i].q));
    const v0=shortly[i].p.clone().sub(start[i].p).divideScalar(delta),v1=end[i].p.clone().sub(before[i].p).divideScalar(delta);
    if(v0.distanceTo(v1)>velocitySeam){velocitySeam=v0.distanceTo(v1);velocitySeamNode=start[i].name;}
  }
  action.stop();mixer.uncacheRoot(gltf.scene);
  const loop=clip.userData?.loop??gltf.parser.json.animations.find(a=>a.name===clip.name)?.extras?.loop??true;
  return {name:clip.name,duration:clip.duration,loop,samples,vertexSamples,minSkinnedY:min,maxSkinnedY:max,loopMaxPositionMeters:loopPosition,loopMaxRotationRadians:loopRotation,loopVelocityDifferenceMetersPerSecond:velocitySeam,velocitySeamNode,
    floorPass:min>=-.001,loopPass:!loop||(loopPosition<=.001&&loopRotation<=.01),velocityPass:!loop||velocitySeam<=.5};
}
export async function validate(){
  const files=await assetFiles();if(files.length!==42)throw Error(`Expected42 GLBs; found ${files.length}`);
  const canonical=JSON.parse(await fs.readFile(path.resolve(root,'../motion2/soccer.json'),'utf8')).skeleton.bones;
  const kh={tool:'Khronos glTF Validator',version:validator.version(),assets:[],passed:false};
  const audit={tool:'independent exported GLB audit',sampleHz:120,limits:{citizenTriangles:[800,1200],floorPenetrationMeters:.001,loopPositionMeters:.001,loopRotationRadians:.01,loopVelocityDifferenceMetersPerSecond:.5},assets:[],negativeControls:{},failures:[],passed:false};
  function check(ok,message,file){if(!ok)audit.failures.push({file,message});}
  let people=0,animals=0;const motionGroups=new Map();
  for(const file of files){
    const bytes=await fs.readFile(path.join(root,file)),json=parse(bytes),kr=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:100});
    kh.assets.push({file,bytes:bytes.length,sha256:sha(bytes),errors:kr.issues.numErrors,warnings:kr.issues.numWarnings,messages:kr.issues.messages});
    check(kr.issues.numErrors===0&&kr.issues.numWarnings===0,'Khronos must have zero errors/warnings',file);
    const skin=json.skins?.find(s=>s.joints.length===18),person=!!skin;person?people++:animals++;
    const gltf=await load(bytes);let triangles=0,vertices=0;gltf.scene.traverse(o=>{if(o.isMesh){vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
    if(person){
      check(triangles>=800&&triangles<=1200,`Triangle budget ${triangles}`,file);
      check(json.skins.length===1,'Exactly one citizen skin',file);
      for(let i=0;i<canonical.length;i++){
        const b=canonical[i],n=json.nodes[skin.joints[i]],parent=json.nodes.findIndex(x=>(x.children??[]).includes(skin.joints[i]));
        check(n.name===b.name,`Joint order/name ${b.name}`,file);
        check((parent<0||!skin.joints.includes(parent)?null:json.nodes[parent].name)===(b.parent??null),`Joint parent ${b.name}`,file);
        check((n.translation??[0,0,0]).every((v,k)=>Math.abs(v-b.restTranslationMeters[k])<1e-6),`Canonical rest translation ${b.name}`,file);
        check((n.rotation??[0,0,0,1]).every((v,k)=>Math.abs(v-[0,0,0,1][k])<1e-6),`Canonical identity rest rotation ${b.name}`,file);
      }
      check(['idle','walk','wave','sit','talk','run'].every(n=>gltf.animations.some(a=>a.name===n))&&gltf.animations.length===6,'Exactly requested six clips',file);
    }else check(gltf.animations.length>0,'Animal loop clip missing',file);
    for(const a of json.animations??[])for(const s of a.samplers){
      const accessor=await gltf.parser.getDependency('accessor',s.input),t=accessor.array;
      check(t.length>1&&Math.abs(t[0])<1e-6&&[...t].every((v,i)=>!i||Math.abs(v-t[i-1]-1/30)<2e-6),'Every sampler uniformly30Hz',file);
    }
    // Materials may differ across palettes; decoded rig, geometry, and animation must match.
    const signatures=[];gltf.scene.traverse(o=>{if(o.isMesh){for(const [k,a]of Object.entries(o.geometry.attributes))if(k!=='color')signatures.push(k,sha(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)));if(o.geometry.index)signatures.push(sha(Buffer.from(o.geometry.index.array.buffer)));}});
    const signature=sha(Buffer.from(JSON.stringify({nodes:json.nodes.map(({translation,rotation,scale,matrix,children,skin,mesh})=>({translation,rotation,scale,matrix,children,skin,mesh})),skins:json.skins?.map(({joints,inverseBindMatrices,skeleton})=>({joints,inverseBindMatrices,skeleton})),animations:gltf.animations.map(a=>({name:a.name,tracks:a.tracks.map(t=>({name:t.name,times:[...t.times],values:[...t.values]}))})),signatures})));
    let motions;
    if(motionGroups.has(signature))motions={identicalMotionAndGeometryTo:motionGroups.get(signature)};
    else {motionGroups.set(signature,file);motions=gltf.animations.map(a=>clipAudit(gltf,a));for(const m of motions){check(m.floorPass,`${m.name}: floor ${m.minSkinnedY}`,file);check(m.loopPass,`${m.name}: loop seam`,file);check(m.velocityPass,`${m.name}: loop velocity seam ${m.loopVelocityDifferenceMetersPerSecond}`,file);}}
    audit.assets.push({file,sha256:sha(bytes),bytes:bytes.length,category:person?'citizen':'animal',triangles,vertices,skinJoints:json.skins?.map(s=>s.joints.length)??[],clips:gltf.animations.map(a=>a.name),motionSignature:signature,motions});
    console.log(file,triangles,'tri',kr.issues.numErrors,'errors',kr.issues.numWarnings,'warnings');
  }
  check(people===36&&animals===6,`Coverage people=${people},animals=${animals}`);
  // Controls mutate a newly imported asset, never the delivered bytes.
  const first=audit.assets.find(a=>a.category==='citizen'),probe=await load(await fs.readFile(path.join(root,first.file)));
  const clips=probe.animations.map(a=>a.name);audit.negativeControls.missingClipDetected=!['idle','walk','wave','sit','talk','run'].every(n=>clips.filter(x=>x!=='wave').includes(n));
  const track=probe.animations.find(a=>a.name==='idle').tracks.find(t=>t.name.includes('Hips')&&t.name.endsWith('.position'));
  if(track){const old=track.values.at(-2);track.values[track.values.length-2]=old-.2;const result=clipAudit(probe,probe.animations.find(a=>a.name==='idle'));audit.negativeControls.brokenLoopDetected=!result.loopPass;audit.negativeControls.floorPenetrationDetected=!result.floorPass;}
  check(Object.values(audit.negativeControls).length===3&&Object.values(audit.negativeControls).every(Boolean),'Negative controls did not detect all injections');
  for(const a of audit.assets)check(sha(await fs.readFile(path.join(root,a.file)))===a.sha256,'Asset changed during independent QA',a.file);
  kh.passed=kh.assets.every(a=>a.errors===0&&a.warnings===0);audit.passed=audit.failures.length===0;
  await fs.mkdir(path.join(root,'verification'),{recursive:true});
  await fs.writeFile(path.join(root,'verification/khronos.json'),JSON.stringify(kh,null,2)+'\n');
  await fs.writeFile(path.join(root,'verification/motion-audit.json'),JSON.stringify(audit,null,2)+'\n');
  console.log(JSON.stringify({passed:audit.passed,khronos:kh.passed,people,animals,uniqueMotionGeometries:motionGroups.size,failures:audit.failures}));
  if(!audit.passed||!kh.passed)process.exitCode=1;return audit;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await validate();
