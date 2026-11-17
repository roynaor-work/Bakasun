// SPDX-License-Identifier: CC0-1.0
// Input adapter for the unchanged motion-qa-v1 sampler and scoring equations.
// Renaming one actor's nodes exposes that skeleton to the stock name filter;
// every node transform, hierarchy, animation channel and sampled pose is preserved.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const assetRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const SOURCES=Object.freeze([{id:'soccer-celebrations-v1'}]);
const hash=b=>createHash('sha256').update(b).digest('hex');
export const rotate=([x,y,z,w],[a,b,c])=>{
  const tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
};
export const point=(frame,bone,local=[0,0,0])=>{
  if(!frame?.joints[bone])throw Error(`Missing contact joint: ${bone}`);
  const scaled=local.map((v,i)=>v*(frame.scales?.[bone]?.[i]??1));
  const offset=rotate(frame.rotations[bone],scaled);
  return frame.joints[bone].map((v,i)=>v+offset[i]);
};
export function actorDocument(glb,actor,bones) {
  const json=structuredClone(glb.json),prefix=actor.prefix??`${actor.id}_`;
  for(const bone of bones) {
    const candidates=json.nodes.filter(n=>n.name===`${prefix}${bone.name}`);
    if(candidates.length!==1)throw Error(`${actor.id}: expected exactly one ${prefix}${bone.name}`);
    candidates[0].name=bone.name;
  }
  return {json,binary:glb.binary};
}
export async function loadAssets({fps=120}={}) {
  if(!process.env.CELEBRATION_QA_ROOT)throw Error('CELEBRATION_QA_ROOT must identify the pinned, unchanged QA workspace.');
  const {parseGLB,sampleGLB}=await import(pathToFileURL(path.join(process.env.CELEBRATION_QA_ROOT,'glb.mjs')).href);
  const catalog=JSON.parse(await readFile(path.join(assetRoot,'catalog.json'),'utf8'));
  // Snapshot of the unchanged main canonical definition, shipped for offline QA.
  const skeleton=JSON.parse(await readFile(path.join(assetRoot,'source/qa-canonical-skeleton.json'),'utf8')).bones;
  const referenceBytes=await readFile(path.join(assetRoot,'source/qa-reference-idle.glb'));
  const reference=parseGLB(referenceBytes),records=[],entries=[],clips=[],references=[];
  for(const entry of catalog.clips) {
    const relative=entry.asset??entry.file,bytes=await readFile(path.join(assetRoot,relative));
    const glb=parseGLB(bytes),actors=new Map(),props=new Map();
    records.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});
    const extraTimes=[...(entry.events??[]).map(e=>e.time),...(entry.supports??[]).flatMap(w=>[w.start,w.end]),...(entry.contacts??[]).flatMap(w=>[w.start,w.end])];
    for(const actor of entry.actors) {
      const sampled=sampleGLB(actorDocument(glb,actor,skeleton),{fps,extraTimes});
      const supports=(entry.supports??[]).filter(w=>w.actor===actor.id&&w.mode!=='slide'&&['LeftFoot','RightFoot'].includes(w.bone)).map(w=>({...w,local:w.local??[0,-.08,0]}));
      const profile=`${entry.id}/${actor.id}`,role=actor.role??'field';
      const metadata={
        loop:entry.loop??false,locomotion:actor.locomotion??entry.locomotion??false,
        floorY:0,soleLocal:[0,-.08,0],supports,events:entry.events??[],
        contacts:[],ballContacts:[],ballVisible:false,checkHingeDirection:true,
        symmetryMode:'structural',role,profile,sourceLibrary:'soccer-celebrations-v1',
        rootMotion:'baked Root translation and rotation; consume once',
        coordinateSpace:'delivered GLB world transforms; selected actor names only adapted',
        intent:entry.intent??entry.label??entry.id,
      };
      const clip={id:`${entry.id}/${actor.id}`,motionId:entry.id,role,profile,
        duration:sampled.duration,height:actor.heightMeters??sampled.height,
        frames:sampled.frames,metadata,
        source:{file:relative,sha256:hash(bytes),animation:sampled.animation,actor:actor.id,
          adapter:'Only selected actor node names lose their prefix. No pose or channel changes.'}};
      actors.set(actor.id,clip);clips.push(clip);
      // World-facing placement belongs to the reference frame of the actor. Use
      // the same genuine idle asset for all actors, oriented by their initial
      // Root rotation. This avoids comparing opposite world-facing headings.
      // No poses from the action are used as idle references.
      const ref={json:structuredClone(reference.json),binary:reference.binary};
      const refRootIndex=ref.json.nodes.findIndex(n=>n.name==='Root');
      if(refRootIndex<0)throw Error('Reference idle is missing its canonical Root.');
      const heading=[...sampled.frames[0].rotations.Root],groupIndex=ref.json.nodes.length;
      for(const node of ref.json.nodes)if(node.children?.includes(refRootIndex))throw Error('Idle Root must be a scene root.');
      ref.json.nodes.push({name:'QAWorldHeading',rotation:heading,children:[refRootIndex]});
      for(const scene of ref.json.scenes??[])scene.nodes=scene.nodes.map(i=>i===refRootIndex?groupIndex:i);
      const idle=sampleGLB(ref,{fps});
      references.push({id:`idle_reference/${entry.id}/${actor.id}`,motionId:'idle_relaxed',role,profile,
        duration:idle.duration,height:clip.height,frames:idle.frames,
        metadata:{...metadata,locomotion:false,loop:true,events:[],supports:[
          {bone:'LeftFoot',local:[0,-.08,0],start:0,end:idle.duration},
          {bone:'RightFoot',local:[0,-.08,0],start:0,end:idle.duration}],intent:'Common genuine relaxed idle reference; initial actor world heading applied'},
        source:{file:'source/qa-reference-idle.glb',sha256:hash(referenceBytes),original:'soccer-header-v1/runtime/reference/idle_relaxed.glb',
          worldHeadingQuaternion:heading}});
    }
    // The stock sampler exposes a fixed marker-name vocabulary. A disposable
    // second view names a prop Spine999 solely to query its unchanged world FK;
    // it is never supplied to stock anatomy or other actor scoring.
    for(const node of new Set((entry.contacts??[]).flatMap(c=>[c.a?.node,c.b?.node]).filter(Boolean))){
      const selected=actorDocument(glb,entry.actors[0],skeleton),target=selected.json.nodes.find(n=>n.name===node);
      if(!target)throw Error(`Missing declared prop node: ${node}`);
      target.name='Spine999';const sampled=sampleGLB(selected,{fps,extraTimes});
      props.set(node,{...sampled,bone:'Spine999'});
    }
    entries.push({entry,glb,bytes,actors,props});
  }
  return {catalog,skeleton,entries,clips,references,records,referenceSha256:hash(referenceBytes)};
}
export async function loadLibraries({fps=120}={}) {
  const {clips,references,records,referenceSha256}=await loadAssets({fps});
  return [{id:'soccer-celebrations-v1',sport:'soccer',version:1,title:'Synchronized canonical soccer celebrations',
    clips:[...clips,...references],source:{ref:'codex/soccer-celebrations-v1',commit:process.env.CELEBRATION_ASSET_COMMIT??'working-tree',
      path:'workout/island/design/soccer-celebrations-v1',inputs:records,referenceSha256,
      geometryDecoded:false,adapter:'Selected-actor names and initial-world-heading idle reference only; all measurements and scoring unchanged'}}];
}
