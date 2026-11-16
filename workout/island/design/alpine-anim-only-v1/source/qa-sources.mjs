// SPDX-License-Identifier: CC0-1.0
// Input adaptation only. The pinned motion-qa-v1 sampler and mathematics are unchanged.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const rotate=(q,p)=>{const [x,y,z,w]=q,[a,b,c]=p,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return[a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];};
const multiply=([x,y,z,w],[X,Y,Z,W])=>[w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
function applyProbes(frame,probes){
  frame.floorPoints=[];
  for(const [bone,points]of Object.entries(probes))for(const local of points){
    const p=rotate(frame.rotations[bone],local.map((v,i)=>v*(frame.scales?.[bone]?.[i]??1)));
    frame.floorPoints.push({bone,position:frame.joints[bone].map((v,i)=>v+p[i])});
  }
}
export async function loadSamples(qaRoot,{fps=120}={}){
  const {parseGLB,sampleGLB}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs')).href);
  const catalog=JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8'));
  const nativeBytes=await readFile(path.join(root,'clips.glb')),glb=parseGLB(nativeBytes);
  const referencePath=path.resolve(root,'../alpine-v7/characters/ski-male.glb');
  const sourceBytes=await readFile(referencePath),source=parseGLB(sourceBytes);
  const referenceCache=new Map();
  const definition={ready:{animation:'glide',time:0},fallen:{animation:'get_up',time:0},ready_switch:{animation:'glide',time:0,yaw:Math.PI}};
  async function reference(id){
    if(referenceCache.has(id))return referenceCache.get(id);
    const spec=definition[id];if(!spec)throw Error(`Unknown independent boundary reference: ${id}`);
    const native=sampleGLB(source,{animation:spec.animation,fps,extraTimes:[spec.time]});
    const pose=structuredClone(native.frames.reduce((a,b)=>Math.abs(b.t-spec.time)<Math.abs(a.t-spec.time)?b:a));
    applyProbes(pose,probes);
    if(spec.yaw){const q=[0,Math.sin(spec.yaw/2),0,Math.cos(spec.yaw/2)];for(const key of ['joints','floorPoints']){
      if(key==='joints')pose.joints=Object.fromEntries(Object.entries(pose.joints).map(([n,p])=>[n,rotate(q,p)]));
      else pose.floorPoints=pose.floorPoints.map(p=>({...p,position:rotate(q,p.position)}));
    }pose.rotations=Object.fromEntries(Object.entries(pose.rotations).map(([n,r])=>[n,multiply(q,r)]));pose.root=rotate(q,pose.root);}
    // Reference postures are held: expected endpoint velocity is zero.
    const frames=[{...structuredClone(pose),t:0},{...structuredClone(pose),t:.1}];
    referenceCache.set(id,frames);return frames;
  }
  const probes=catalog.qa?.soleProbes??catalog.soleProbes;
  if(!Array.isArray(probes?.LeftFoot?.[0])||!Array.isArray(probes?.RightFoot?.[0]))throw Error('catalog.qa.soleProbes must contain arrays of independently measured v7 foot-local probes.');
  const sole=catalog.qa?.supportLocal??catalog.soleProbes;
  const clips=[];
  for(const entry of catalog.clips){
    const name=entry.name??entry.id,animation=glb.json.animations.find(a=>a.name===name);
    if(!animation)throw Error(`Missing delivered animation: ${name}`);
    const supports=(entry.contacts??entry.supports??[]).map(s=>({...s,local:s.local??sole[s.bone]}));
    const events=(entry.events??[]).map(e=>({...e,time:e.time??e.timeSeconds??e.atSeconds,type:e.type??e.name}));
    const native=sampleGLB(glb,{animation:name,fps,extraTimes:[...supports.flatMap(s=>[s.start,s.end]),...events.map(e=>e.time)]});
    for(const frame of native.frames)applyProbes(frame,probes);
    const entryReference=entry.references?.entry??entry.boundaries?.entry??(entry.id==='get_up'?'fallen':'ready');
    const exitReference=entry.references?.exit??entry.boundaries?.exit??(entry.id==='fall'?'fallen':entry.id==='air_180'?'ready_switch':'ready');
    const loopStart=[{...structuredClone(native.frames[0]),t:0},{...structuredClone(native.frames[0]),t:.1}];
    if((entryReference==='self'||exitReference==='self')&&!entry.loop)throw Error('Only a looping clip may use its first pose for seam continuity.');
    if(!(catalog.heightMeters>0))throw Error('A geometry-derived native v7 height is required.');
    clips.push({id:entry.id,label:entry.label??entry.id,duration:native.duration,height:catalog.heightMeters,frames:native.frames,
      metadata:{loop:entry.loop===true,supports,events,ballVisible:false,locomotion:false,symmetryMode:'structural',
        checkHingeDirection:catalog.qa?.checkHingeDirection??false,
        floorProbeKind:'Independent v7 foot-local mesh probes plus all actual skeletal joint centers',
        coordinateSpace:'Delivered animation GLB in native v7 metres; no locomotion path or scale added'},
      idleFrames:{entry:entryReference==='self'?loopStart:await reference(entryReference),exit:exitReference==='self'?loopStart:await reference(exitReference)},
      boundaryAssumptions:{entry:entryReference,exit:exitReference,referenceFile:'../alpine-v7/characters/ski-male.glb',definitions:definition,
        velocity:'Held reference postures; zero expected endpoint velocity',loop:'Self means cycle-start pose for seam closure, not an independently certified ready transition',heading180:'Outgoing expected stance is rotated by 180 degrees in world Y'},
      source:{file:'clips.glb',animation:name,sha256:hash(nativeBytes)},entry});
  }
  return{catalog,clips,glb,inputs:[{file:'clips.glb',bytes:nativeBytes.length,sha256:hash(nativeBytes)},
    {file:'../alpine-v7/characters/ski-male.glb',bytes:sourceBytes.length,sha256:hash(sourceBytes)},
    {file:'catalog.json',sha256:hash(await readFile(path.join(root,'catalog.json')))}],probes,sole};
}
