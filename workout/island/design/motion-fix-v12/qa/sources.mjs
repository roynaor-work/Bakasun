/** Original CC0-1.0. Immutable Git sources, native animation channels, no mesh decoder. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {sampleGLB,parseGLB,createRig} from './glb.mjs';
const execute=promisify(execFile), here=dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(await readFile(new URL('./sources.json',import.meta.url),'utf8'));
export const SOURCES=Object.freeze(manifest.sources);
const identity=[0,0,0,1], add=(a,b)=>a.map((v,i)=>v+b[i]);
function rotate(v,q){const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];}
function multiply(a,b){const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];}
function track(keys,time,{normalized=false,duration=1}={}){
  if(!keys?.length)return {position:[0,0,0],yaw:0};const t=normalized?time/duration:time;
  const point=f=>f.position??f.positionMeters??f.referenceRootTranslationMeters??[0,0,0];
  if(t<=keys[0].time)return {...keys[0],position:point(keys[0])};
  for(let i=1;i<keys.length;i++)if(t<=keys[i].time){const a=keys[i-1],b=keys[i],u=(t-a.time)/(b.time-a.time||1);return {position:point(a).map((v,j)=>v+(point(b)[j]-v)*u),yaw:(a.yaw??0)+((b.yaw??0)-(a.yaw??0))*u};}
  const last=keys.at(-1);return {...last,position:point(last)};
}
function normalizeEvents(events,D,normalized=false){return (events??[]).map(e=>({...e,type:e.type??e.name??e.event,time:e.timeSeconds??e.atSeconds??(normalized?(e.time??0)*D:e.time??(e.frame??0)/30),bone:e.bone??e.effector??e.hand??e.foot,local:e.local??e.localPointMeters}));}
function normalizeWindows(windows,D){return (windows??[]).map(w=>({...w,bone:w.bone??w.effector,start:w.startSeconds??w.start??(w.startTime??0)*D,end:w.endSeconds??w.end??(w.endTime??1)*D,local:w.local??w.localPointMeters??[0,-.08,0],anchor:w.anchor??w.anchorMeters??w.anchorWorldMeters}));}
function extraTimes(meta,D){return [...new Set([0,D,...(meta.events??[]).map(e=>e.time),...(meta.supports??[]).flatMap(w=>[w.start,w.end]),...(meta.ballContacts??[]).flatMap(w=>[w.start,w.end])])].filter(t=>Number.isFinite(t)&&t>=0&&t<=D);}
function metadataFor(entry,data={}){
  const D=data.durationSeconds??entry.durationSeconds??entry.duration;
  const isHoops=!!data.keyframes;
  const events=normalizeEvents(data.events??entry.events,D,isHoops);
  const supports=normalizeWindows(data.supportWindows??entry.supports,D);
  const ballContacts=normalizeWindows(data.ballContactWindows,D);
  for(const e of events)if(e.bone&&/^(contact|release|hand_ball_contact|ball_release)$/.test(e.type??''))ballContacts.push({bone:e.bone,start:e.time,end:e.time,local:e.local});
  return {...entry,loop:data.loop??entry.loop,events,supports,ballContacts,ballRadius:data.ball?.radiusMeters??entry.ball?.radius??.12,
    ball:{...(typeof data.ball==='object'?data.ball:entry.ball??{}),radius:data.ball?.radiusMeters??entry.ball?.radius??.12},role:entry.role??'field',kind:data.kind??entry.kind??entry.category,rootMotion:data.rootMotion??entry.rootMotion??false,
    referenceTravelKnown:!!(entry.travel?.length||entry.referenceRootMotion?.samples?.length||data.keyframes?.some(f=>f.referenceRootTranslationMeters)),
    speed:data.speed??entry.metricsTargets?.speed??null,cadence:data.cadence??entry.cadenceTargetStepsPerSecond??null,
    checkHingeDirection:true,soleLocal:[0,-.08,0],ballVisible:data.ball?.visible!==false,unit:'metres',timeUnit:'seconds'};
}
function applyReference(frame,{ballIsWorld=false}={}) {
  frame.localJoints=Object.fromEntries(Object.entries(frame.joints).map(([name,p])=>[name,[...p]]));
  frame.assetRoot=[...frame.root];
  const yaw=frame.referenceYaw??0,q=[0,Math.sin(yaw/2),0,Math.cos(yaw/2)],p=frame.referenceRoot??[0,0,0];
  frame.joints=Object.fromEntries(Object.entries(frame.joints).map(([name,v])=>[name,add(rotate(v,q),p)]));
  frame.rotations=Object.fromEntries(Object.entries(frame.rotations).map(([name,v])=>[name,multiply(q,v)]));
  frame.root=add(rotate(frame.assetRoot,q),p);
  if(frame.ball&&!ballIsWorld)frame.ball=add(rotate(frame.ball,q),p);
  return frame;
}
function addMarkers(frame,{sole=[0,-.08,0],palms,contacts=[]}={}){
  frame.contactPoints={};frame.soles={};frame.palms={};
  const point=(bone,local)=>add(frame.joints[bone],rotate(local,frame.rotations[bone]??identity));
  for(const bone of ['LeftFoot','RightFoot'])if(frame.joints[bone]){frame.soles[bone]=point(bone,typeof sole==='function'?sole(bone):sole);frame.contactPoints[`${bone}:sole`]=frame.soles[bone];}
  for(const bone of ['LeftHand','RightHand'])if(frame.joints[bone])frame.palms[bone]=point(bone,palms?.[bone]??[0,-.08,.025]);
  for(const c of contacts)if(frame.joints[c.bone])frame.contactPoints[c.bone]=point(c.bone,c.local??(c.bone?.endsWith('Hand')?palms?.[c.bone]??[0,-.08,.025]:[0,-.08,0]));
  frame.floorPoints=Object.entries(frame.soles).map(([bone,position])=>({bone,position}));return frame;
}
/** Cache only files actually read. The Git object IDs, SHA-256 and sizes are recorded per library. */
export async function loadLibraries({repoRoot=resolve(here,'../../../..'),cacheRoot=join(here,'.cache'),fps=60,only}={}){
  const requested=typeof only==='string'?only.split(','):only;
  const sources=SOURCES.filter(s=>!requested?.length||requested.some(id=>s.id===id||s.kind==='tall'&&id.startsWith('hoops-tall')));
  const libraries=[];
  for(const source of sources){
    const records=new Map(),cache=join(cacheRoot,source.commit);
    try{await execute('git',['cat-file','-e',`${source.commit}^{commit}`],{cwd:repoRoot});}catch{await execute('git',['fetch','--depth=1','--filter=blob:none','--no-tags','origin',source.commit],{cwd:repoRoot,maxBuffer:4*1024*1024});}
    const tree=await execute('git',['ls-tree','-r','--full-tree',source.commit,source.path],{cwd:repoRoot,maxBuffer:4*1024*1024});
    const objects=new Map(tree.stdout.trim().split('\n').map(line=>{const m=line.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/);return m?[m[2],m[1]]:[];}).filter(row=>row.length));
    async function bytes(relative){
      const path=`${source.path}/${relative}`,target=join(cache,path);let buffer;
      try{buffer=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;
        try{const result=await execute('git',['show',`${source.commit}:${path}`],{cwd:repoRoot,encoding:'buffer',maxBuffer:80*1024*1024});buffer=result.stdout;}
        catch(error){throw new Error(`Missing immutable source ${source.id}: ${path}. Fetch pinned commit ${source.commit} from ${source.ref}. ${error.message}`);}
        await mkdir(dirname(target),{recursive:true});const temporary=`${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;await writeFile(temporary,buffer);await rename(temporary,target);
      }
      const expected=objects.get(path),actual=createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
      if(!expected||actual!==expected)throw new Error(`Source/cache integrity mismatch: ${path}; expected Git blob ${expected}, found ${actual}`);
      records.set(path,{path,commit:source.commit,gitBlob:expected,sha256:createHash('sha256').update(buffer).digest('hex'),bytes:buffer.length});return buffer;
    }
    const json=async p=>{let b=await bytes(p);if(p.endsWith('.gz'))b=gunzipSync(b);return JSON.parse(b.toString('utf8'));};
    const module=async p=>{await bytes(p);return import(pathToFileURL(join(cache,source.path,p)).href);};
    if(source.id==='hoops-v9')await bytes('runtime/skeleton.mjs');
    const catalog=source.catalog.endsWith('.mjs')?await module(source.catalog):await json(source.catalog);
    const entries=catalog.clips??catalog.CATALOG??catalog;
    const library={id:source.id,sport:source.sport,version:source.version,source,clips:[],sources:[]};
    if(source.kind==='tall'){
      const rig=await json('rig.json'),retarget=await module('runtime/retarget.mjs');
      for(const profile of rig.profiles){
        // Static runtime models carry the authoritative target bone proportions, but no embedded animations.
        const modelBytes=await bytes(`runtime/${profile.id}.glb`),model=parseGLB(modelBytes),modelRig=createRig(model);
        for(const joint of profile.joints){const node=modelRig.nodes.find(n=>n.name===joint.name);if(!node)throw new Error(`Tall model ${profile.id} missing ${joint.name}`);const position=node.position.toArray(),world=node.matrixWorld.elements.slice(12,15);if(position.some((v,i)=>Math.abs(v-joint.translation[i])>1e-6)||world.some((v,i)=>Math.abs(v-joint.worldPosition[i])>1e-6))throw new Error(`Tall model ${profile.id}/${joint.name} differs from rig proportions`);}
        for(const entry of entries){
          const data=await json(entry.path),D=data.durationSeconds,meta=metadataFor(entry,data),calibration=data.id.startsWith('dunk_')?retarget.calibrateDunk(data,profile):{jumpScale:1};
          meta.supports=meta.supports.map(w=>w.bone?.endsWith('Foot')?{...w,local:[0,-profile.joints.find(j=>j.name===w.bone).worldPosition[1],0]}:w);
          const times=[...new Set([...Array.from({length:Math.ceil(D*fps)+1},(_,i)=>Math.min(D,i/fps)),...extraTimes(meta,D)])].sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-6),frames=[];
          for(const t of times){const sample=retarget.sampleClip(data,t/D),fk=retarget.forwardKinematics(profile,sample,{jumpScale:calibration.jumpScale});
            const frame={t,joints:Object.fromEntries(Object.entries(fk.world).map(([k,v])=>[k,v.position])),rotations:Object.fromEntries(Object.entries(fk.world).map(([k,v])=>[k,v.rotation])),localRotations:sample.rotations,root:[0,0,0],referenceRoot:sample.referenceRootTranslationMeters??[0,0,0],ball:null};
            const palms=Object.fromEntries(['LeftHand','RightHand'].map(h=>[h,retarget.palmPoint(profile,h)]));
            applyReference(frame);addMarkers(frame,{sole:bone=>[0,-profile.joints.find(j=>j.name===bone).worldPosition[1],0],palms,contacts:meta.ballContacts});frames.push(frame);
          }
          library.clips.push({id:`${profile.id}/${entry.library}/${entry.id}`,motionId:entry.id,profile:profile.id,label:entry.label??entry.id,duration:D,height:profile.heightMeters,metadata:{...meta,profile:profile.id,sourceLibrary:entry.library,calibration,ballContactExpected:meta.ballContacts.length>0,unavailableBallContactCount:meta.ballContacts.length,ballMeasurementUnavailable:'Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.',ballContacts:[],ballVisible:false,rootMotionApplied:true,coordinateSpace:'authored reference world (simulation-owned)',retargeting:'Exact bundled runtime/retarget.mjs; default calibrated dunk lift; static target skeleton verified.'},frames});
        }
      }
    }else if(source.kind==='hoops-profile'){
      for(const profile of catalog.profiles)for(const entry of entries){
        const data=await json(`runtime/keyframes/${profile.id}/${entry.id}.json`),meta=metadataFor(entry,data),native=await sampleGLB(await bytes(`runtime/clips/${profile.id}/${entry.id}.glb`),{animation:entry.id,fps,extraTimes:extraTimes(meta,data.durationSeconds)});
        const palms=Object.fromEntries(['LeftHand','RightHand'].map(h=>[h,profile.palms?.[h]?.palmPoint??profile.palmPoint]));
        for(const frame of native.frames){
          const key=data.keyframes[Math.min(data.keyframes.length-1,Math.floor((frame.t/data.durationSeconds)*(data.keyframes.length-1)+1e-6))];
          const rootQ=frame.rotations.Root??identity,inverseRoot=[-rootQ[0],-rootQ[1],-rootQ[2],rootQ[3]],nativeRoot=[...frame.root];
          frame.localJoints=Object.fromEntries(Object.entries(frame.joints).map(([name,p])=>[name,rotate([p[0]-nativeRoot[0],p[1],p[2]-nativeRoot[2]],inverseRoot)]));frame.assetRoot=[0,nativeRoot[1],0];frame.nativeRoot=nativeRoot;frame.referenceRoot=track(data.keyframes,frame.t,{normalized:true,duration:data.durationSeconds}).position;frame.handContacts=key.handContacts;frame.supportContacts=key.contacts;
          addMarkers(frame,{sole:bone=>[0,-profile.joints.find(j=>j.name===bone).worldPosition[1],0],palms,contacts:meta.ballContacts});
        }
        // Explicit discrete contact fields supply intervals; source sampling never infers contact from distance.
        meta.supports=[];meta.ballContacts=[];
        for(const bone of ['LeftFoot','RightFoot','LeftHand','RightHand']){
          let start=null;
          for(let i=0;i<data.keyframes.length;i++){
            const f=data.keyframes[i],active=bone.endsWith('Foot')?f.contacts?.[bone]?.planted:f.handContacts?.[bone]?.touching,time=f.time*data.durationSeconds;
            if(active&&start===null)start=time;
            if(start!==null&&(!active||i===data.keyframes.length-1)){
              const item={bone,start,end:active?time:data.keyframes[Math.max(0,i-1)].time*data.durationSeconds,local:bone.endsWith('Hand')?palms[bone]:[0,-profile.joints.find(j=>j.name===bone).worldPosition[1],0]};
              (bone.endsWith('Foot')?meta.supports:meta.ballContacts).push(item);start=null;
            }
          }
        }
        for(const f of native.frames)addMarkers(f,{sole:bone=>[0,-profile.joints.find(j=>j.name===bone).worldPosition[1],0],palms,contacts:meta.ballContacts});
        library.clips.push({id:`${profile.id}/${entry.id}`,motionId:entry.id,profile:profile.id,label:entry.labelHe??entry.id,duration:data.durationSeconds,height:profile.heightMeters,metadata:{...meta,profile:profile.id,referenceTravelKnown:true,rootEmbedded:true,rootMotionApplied:true,coordinateSpace:'native GLB external Motion node (applied once)'},frames:native.frames});
      }
    }else for(const entry of entries){
      let data={},asset;
      if(source.kind==='hoops'){data=await json(entry.json);asset=entry.glb;}else asset=`runtime/${entry.asset}`;
      const meta=metadataFor(entry,data),D=data.durationSeconds??entry.durationSeconds??entry.duration;
      const native=await sampleGLB(await bytes(asset),{animation:entry.id,fps,extraTimes:extraTimes(meta,D)});
      for(const frame of native.frames){
        if(source.kind==='soccer'){
          const rootTrack=entry.referenceRootMotion?.samples??entry.travel;
          const ref=track(rootTrack,frame.t);frame.referenceRoot=ref.position;frame.referenceYaw=(ref.yaw??0)*(entry.referenceRootMotion?.yawUnit==='radians'?1:Math.PI/180);
          const ballKeys=entry.ball?.samples??entry.ball?.keys;
          frame.ball=entry.ball&&ballKeys?.length?track(ballKeys,frame.t).position:null;
          frame.ballWorldSpace=!!entry.ball?.samples;
        }else{
          frame.referenceRoot=track(data.keyframes,frame.t,{normalized:true,duration:D}).position;
          if(data.ball?.visible===false)frame.ball=null;
        }
        applyReference(frame,{ballIsWorld:!!frame.ballWorldSpace});addMarkers(frame,{contacts:meta.ballContacts});
      }
      library.clips.push({id:entry.id,motionId:entry.id,label:entry.labelHe??entry.label??entry.id,duration:D,height:native.height??1.7,metadata:{...meta,ballWorldSpace:source.id==='soccer-v10',sourceAsset:asset,rootMotionApplied:meta.referenceTravelKnown,coordinateSpace:'authored reference world (simulation-owned)',measurementSpace:'native animation pose plus declared external reference trajectory, applied once'},frames:native.frames});
    }
    // Adapter additions expose immutable native asset provenance and rest skeleton to offline repair.
    for(const clip of library.clips){
      const profile=clip.profile;
      const asset=source.kind==='tall'?`runtime/${profile}.glb`:source.kind==='hoops-profile'?`runtime/clips/${profile}/${clip.motionId}.glb`:clip.metadata.sourceAsset;
      clip.sourceAsset={commit:source.commit,path:`${source.path}/${asset}`,cachePath:join(cache,source.path,asset)};
    }
    library.sources=[...records.values()];libraries.push(library);
  }
  return libraries;
}
