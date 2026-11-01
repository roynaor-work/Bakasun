import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {compileSoccerDesignClips,bakeSoccerDesignFloor} from '../minigames/soccer-design-character.mjs';
import {composeSoccerRestartMotion,SOCCER_RESTART_SEQUENCES,soccerRestartBallAttachment} from '../minigames/soccer-restart-motion.mjs';

const root=new URL('../',import.meta.url),sha256=value=>createHash('sha256').update(value).digest('hex');
export const SOCCER_RESTART_CALIBRATION_INPUTS=['design/characters2/soccer-player.glb','design/characters2/goalkeeper.glb','design/characters/rig.json','design/viewer/retarget-map.json','design/motion/soccer.json','design/motion2/soccer/throws-receives.json','design/motion2/soccer/kicks-locomotion.json','design/motion2/soccer/tackles-reactions.json'];
let decoderPromise;
async function nodeDecoder(){
 if(decoderPromise)return decoderPromise;
 decoderPromise=(async()=>{
  // The same checked-in Apache-2.0 decoder is used by the browser's self-origin
  // worker. Node loads its CommonJS export without a worker or a network fetch.
  const wrapper=await readFile(new URL('vendor/draco/draco_wasm_wrapper.js',root)),folder=path.join(tmpdir(),'island-soccer-calibration');await mkdir(folder,{recursive:true});
  const file=path.join(folder,'soccer-draco-'+sha256(wrapper).slice(0,16)+'-'+process.pid+'.cjs');await writeFile(file,wrapper);
  const createDecoder=createRequire(import.meta.url)(file);return createDecoder({wasmBinary:new Uint8Array(await readFile(new URL('vendor/draco/draco_decoder.wasm',root)))});
 })();return decoderPromise;
}
async function loadCharacter(bytes){
 const draco=await nodeDecoder();
 const adapter={preload(){return this;},decodeDracoFile(buffer,onLoad,ids,types,_space,onError){
  const decoder=new draco.Decoder(),mesh=new draco.Mesh();
  try{
   const status=decoder.DecodeArrayToMesh(new Int8Array(buffer),buffer.byteLength,mesh);if(!status.ok())throw Error(status.error_msg());
   const geometry=new T.BufferGeometry(),typeNames={Float32Array:'DT_FLOAT32',Uint8Array:'DT_UINT8',Uint16Array:'DT_UINT16',Uint32Array:'DT_UINT32',Int8Array:'DT_INT8',Int16Array:'DT_INT16',Int32Array:'DT_INT32'};
   for(const [name,id]of Object.entries(ids)){
    const attribute=decoder.GetAttributeByUniqueId(mesh,id),ArrayType=globalThis[types[name]],count=mesh.num_points()*attribute.num_components(),length=count*ArrayType.BYTES_PER_ELEMENT,pointer=draco._malloc(length);
    try{decoder.GetAttributeDataArrayForAllPoints(mesh,attribute,draco[typeNames[types[name]]],length,pointer);geometry.setAttribute(name,new T.BufferAttribute(new ArrayType(draco.HEAPF32.buffer,pointer,count).slice(),attribute.num_components()));}finally{draco._free(pointer);}
   }
   const count=mesh.num_faces()*3,pointer=draco._malloc(count*4);try{decoder.GetTrianglesUInt32Array(mesh,count*4,pointer);geometry.setIndex(new T.BufferAttribute(new Uint32Array(draco.HEAPF32.buffer,pointer,count).slice(),1));}finally{draco._free(pointer);}
   onLoad(geometry);
  }catch(error){onError(error);}finally{draco.destroy(mesh);draco.destroy(decoder);}
 }};
 return new GLTFLoader().setDRACOLoader(adapter).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
const round=value=>Number(value.toFixed(9));
export async function calibrateSoccerRestartPoses(){
 const entries=await Promise.all(SOCCER_RESTART_CALIBRATION_INPUTS.map(async name=>[name,await readFile(new URL(name,root))])),bytes=Object.fromEntries(entries),json=name=>JSON.parse(bytes[name]);
 const rig=json('design/characters/rig.json'),map=json('design/viewer/retarget-map.json'),data=composeSoccerRestartMotion(json('design/motion/soccer.json'),...['throws-receives','kicks-locomotion','tackles-reactions'].map(name=>json('design/motion2/soccer/'+name+'.json')));
 const paths={},heightMetres=1.8,radius=.11;let puntDrop=null;
 for(const role of ['soccer-player','goalkeeper']){
  const gltf=await loadCharacter(bytes['design/characters2/'+role+'.glb']),source=gltf.scene,kinds=role==='soccer-player'?['throwIn']:['keeperThrow','keeperPunt'];
  const clips=bakeSoccerDesignFloor(source,compileSoccerDesignClips({...data,states:Object.fromEntries(kinds.map(kind=>[kind,data.states[kind]]))},rig,map));
  source.updateMatrixWorld(true);source.traverse(mesh=>{if(mesh.isSkinnedMesh){mesh.skeleton.update();mesh.computeBoundingBox();}});const bounds=new T.Box3().setFromObject(source),scale=heightMetres/(bounds.max.y-bounds.min.y);source.scale.setScalar(scale);
  const pivot=new T.Group();pivot.add(source);const character={root:source,pivot,restartContactMap:map},bones=[];source.traverse(b=>{if(b.isBone)bones.push({bone:b,q:b.quaternion.clone(),p:b.position.clone()});});
  const restore=()=>{for(const p of bones){p.bone.quaternion.copy(p.q);p.bone.position.copy(p.p);}},mixer=new T.AnimationMixer(source),point=new T.Vector3();
  for(const kind of kinds){
   const profile=SOCCER_RESTART_SEQUENCES[kind],clip=clips.find(c=>c.name===kind),action=mixer.clipAction(clip);action.play();action.timeScale=0;action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;
   const clean=bones.map(p=>({bone:p.bone,q:p.q.clone(),p:p.p.clone()}));let cleanSaved=false;
   const poseAt=t=>{
    // AnimationMixer skips unchanged tracks. Restore its last clean output,
    // rather than bind pose or a previously IK-corrected hand, before sampling.
    if(cleanSaved)for(const p of clean){p.bone.quaternion.copy(p.q);p.bone.position.copy(p.p);}
    action.time=t;mixer.update(0);for(const p of clean){p.q.copy(p.bone.quaternion);p.p.copy(p.bone.position);}cleanSaved=true;pivot.updateMatrixWorld(true);
   };
   const sample=t=>{poseAt(t);const attached=soccerRestartBallAttachment(T,character,{kind,elapsed:t,contact:profile.contact},radius,point,true);if(!attached)throw Error('Expected held ball in calibration: '+kind);return point.clone();};
   const end=kind==='keeperPunt'?profile.drop:profile.contact,times=new Set([0,end,...clip.tracks[0].times].filter(t=>t>=0&&t<=end));for(let t=0;t<end;t+=1/120)times.add(t);
   // The 2D model's side basis is (-facingZ,+facingX), i.e. character -X.
   // Three.js +X rotates to the opposite side; do not mirror a held right hand.
   const keys=[...times].sort((a,b)=>a-b).map(t=>{const p=sample(t);return [round(t),round(p.y),round(p.z),round(-p.x)];});
   if(kind==='keeperPunt'){
    const start=sample(profile.drop);poseAt(profile.contact);
    const entry=map.bones.find(b=>b.target==='RightFoot'),foot=source.getObjectByName('RightFoot'),q=new T.Quaternion().fromArray(entry.targetBasisWorldQuaternion).invert();
    const endPoint=foot.localToWorld(new T.Vector3(0,-.025,.13).applyQuaternion(q).multiplyScalar(map.motionScale)).add(new T.Vector3(0,0,radius));
    const duration=profile.contact-profile.drop,initialVerticalVelocity=-.1,gravity=2*(start.y-endPoint.y+initialVerticalVelocity*duration)/(duration*duration);
    if(!(gravity>4&&gravity<14))throw Error('Retargeted punt drop gravity outside natural range: '+gravity);
    for(let t=profile.drop+1/120;t<profile.contact;t+=1/120){const u=(t-profile.drop)/duration,v=t-profile.drop;keys.push([round(t),round(start.y+initialVerticalVelocity*v-.5*gravity*v*v),round(start.z+(endPoint.z-start.z)*u),round(-start.x-(endPoint.x-start.x)*u)]);}
    keys.push([profile.contact,round(endPoint.y),round(endPoint.z),round(-endPoint.x)]);puntDrop={atSeconds:profile.drop,contactSeconds:profile.contact,initialVerticalVelocity,gravity:round(gravity)};
   }
   paths[kind]=keys;action.stop();restore();
  }
  mixer.stopAllAction();mixer.uncacheRoot(source);source.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();}});
 }
 return {schemaVersion:1,heightMetres,ballRadiusMetres:radius,axes:{up:'+Y',forward:'+Z',side:'-X (simulation right)'},source:'characters2, retarget-map and actual floor-baked motion2 clips; no reference root motion',sources:Object.fromEntries(entries.map(([name,value])=>[name,sha256(value)])),puntDrop,paths};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const result=await calibrateSoccerRestartPoses(),out=new URL('../minigames/soccer-restart-poses.mjs',import.meta.url);
 await writeFile(out,'// Generated by tools/soccer-restart-calibrate.mjs. Rebuild after a source asset changes.\nexport const SOCCER_RESTART_RIG_CALIBRATION='+JSON.stringify(result)+';\n');
 console.log(JSON.stringify({output:fileURLToPath(out),keys:Object.fromEntries(Object.entries(result.paths).map(([kind,keys])=>[kind,keys.length])),release:Object.fromEntries(Object.entries(result.paths).map(([kind,keys])=>[kind,keys.at(-1)])),puntDrop:result.puntDrop}));
}
