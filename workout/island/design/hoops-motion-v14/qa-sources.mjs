// SPDX-License-Identifier: CC0-1.0
// New-library input adapter. Native in-place assets and the external actor scenario remain distinct.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const source = {
  id: 'hoops-motion-v14', sport: 'hoops', version: 'motion-v14',
  ref: 'codex/hoops-motion-v14', commit: process.env.HOOPS_MOTION_SOURCE_COMMIT ?? 'working-tree',
  path: 'workout/island/design/hoops-motion-v14', kind: 'hoops', catalog: 'runtime/catalog.json',
};
export const SOURCES = Object.freeze([source]);
const qaRoot = process.env.HOOPS_MOTION_QA_ROOT;
if (!qaRoot) throw new Error('HOOPS_MOTION_QA_ROOT must identify the pinned QA workspace.');
const {sampleGLB} = await import(pathToFileURL(path.join(qaRoot, 'glb.mjs')).href);
const add = (a,b) => a.map((v,i) => v+b[i]);
const rotate = (v,q) => {
  const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
};
const multiply = (a,b) => {
  const [x,y,z,w]=a,[X,Y,Z,W]=b;
  return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
};
export function track(keys,time) {
  if (!keys?.length) return {position:[0,0,0],yawRadians:0};
  const point = k => k.position ?? k.positionMeters ?? [0,0,0];
  const keyTime = k => k.time ?? k.t;
  const result = k => ({position:[...point(k)],yawRadians:k.yawRadians ?? 0});
  if (time <= keyTime(keys[0])) return result(keys[0]);
  for (let i=1;i<keys.length;i++) if (time <= keyTime(keys[i])) {
    const a=keys[i-1],b=keys[i],u=(time-keyTime(a))/(keyTime(b)-keyTime(a));
    return {position:point(a).map((v,j)=>v+(point(b)[j]-v)*u),
      yawRadians:(a.yawRadians??0)+((b.yawRadians??0)-(a.yawRadians??0))*u};
  }
  return result(keys.at(-1));
}

export async function loadMotionAssets({fps=120,includeReferences=false}={}) {
  const records=[];
  async function read(relative,root=base) {
    const bytes=await readFile(path.join(root,relative));
    records.push({path:path.relative(path.resolve(base,"../../../.."),path.join(root,relative)),bytes:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      gitBlob:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')});
    return bytes;
  }
  const catalog=JSON.parse(await read('runtime/catalog.json'));
  const clips=[];
  let entries=catalog.clips;
  if(includeReferences){
    const referenceBase=path.join(base,"../hoops-motion-v13");
    const referenceCatalog=JSON.parse(await read("runtime/catalog.json",referenceBase));
    entries=[...entries,...referenceCatalog.clips.filter(e=>["idle","run"].includes(e.id)).map(e=>({...e,sourceReference:true,referenceBase}))];
  }
  for (const entry of entries) {
    const events=(entry.events??[]).map(e=>({...e,type:e.type??e.name??e.event,
      time:e.timeSeconds??e.atSeconds??e.time??(e.frame??0)/30,
      bone:e.bone??e.effector,local:e.local??e.localPointMeters}));
    const supports=(entry.supports??entry.supportWindows??[]).map(w=>({...w,
      start:w.startSeconds??w.start,end:w.endSeconds??w.end,local:w.local??[0,-.08,0]}));
    const ballContacts=(entry.ballContacts??entry.ballContactWindows??[]).map(w=>({...w}));
    for (const e of events) if (['contact','release'].includes(e.type) && e.bone) {
      ballContacts.push({bone:e.bone,start:e.time,end:e.time,local:e.local});
    }
    const extraTimes=[...events.map(e=>e.time),...supports.flatMap(w=>[w.start,w.end]),
      ...ballContacts.flatMap(w=>[w.start,w.end])];
    const relative=`runtime/${entry.asset}`;
    const native=sampleGLB(await read(relative,entry.referenceBase??base),{animation:entry.id,fps,extraTimes});
    // Metadata uses decimal seconds; FLOAT accessor endpoints can round inward.
    // Snap only sub-microsecond endpoint differences to the serialized endpoint,
    // preserving every event and window rather than discarding exact-end contacts.
    const endpointTimeCorrections=[];
    const snap=(item,key)=>{
      const time=item[key];
      if(Number.isFinite(time)&&time>native.duration&&time-native.duration<=1e-6){
        endpointTimeCorrections.push({kind:key,declaredTime:time,serializedTime:native.duration,deltaSeconds:native.duration-time});
        item[key]=native.duration;
      }
    };
    for(const event of events)snap(event,'time');
    for(const window of [...supports,...ballContacts]){snap(window,'start');snap(window,'end');}
    const travel=entry.referenceTravel?.samples??entry.referenceRootMotion?.samples??entry.travel??[];
    for (const frame of native.frames) {
      // The scenario is simulation-owned. It is never baked into the GLB Root or Hips.
      frame.localJoints=structuredClone(frame.joints);
      frame.assetRoot=[...frame.root];
      const scenario=track(travel,frame.t),q=[0,Math.sin(scenario.yawRadians/2),0,Math.cos(scenario.yawRadians/2)];
      frame.referenceRoot=[...scenario.position];
      frame.referenceYaw=scenario.yawRadians;
      frame.joints=Object.fromEntries(Object.entries(frame.joints).map(([bone,p])=>[bone,add(rotate(p,q),scenario.position)]));
      frame.rotations=Object.fromEntries(Object.entries(frame.rotations).map(([bone,v])=>[bone,multiply(q,v)]));
      frame.root=add(rotate(frame.assetRoot,q),scenario.position);
      frame.ball=entry.ball ? add(rotate(track(entry.ball.samples??entry.ball.keys,frame.t).position,q),scenario.position) : null;
      // Rebuild probes after the actor transform, as in the original QA source loader.
      frame.floorPoints=['LeftFoot','RightFoot'].map(bone=>({bone,
        position:add(frame.joints[bone],rotate([0,-.08,0],frame.rotations[bone]))}));
    }
    clips.push({id:entry.id,motionId:entry.id,label:entry.label??entry.labelHe??entry.id,
      duration:entry.durationSeconds??entry.duration??native.duration,nativeDuration:native.duration,height:native.height,
      metadata:{...entry,referenceBase:undefined,endpointTimeCorrections,role:'basketball',kind:entry.category??entry.kind,events,supports,ballContacts,
        ball:{...(entry.ball??{}),radius:entry.ball?.radius??.11},ballRadius:entry.ball?.radius??.11,
        ballVisible:!!entry.ball,locomotion:entry.locomotion??['gait','turn','transition'].includes(entry.category),
        rootMotion:false,rootMotionApplied:travel.length>0,referenceTravelKnown:travel.length>0,
        speed:entry.speedMps,soleLocal:[0,-.08,0],checkHingeDirection:true,
        symmetryMode:entry.symmetryMode??'structural',sourceAsset:relative,
        coordinateSpace:'native GLB plus explicitly declared external actor position and heading, applied once',
        measurementSpace:'World support drift uses external scenario; pose/continuity retain the native in-place pose.'},
      frames:native.frames});
  }
  return {catalog,clips,records};
}

export async function loadLibraries({fps=120,only}={}) {
  if (only?.length && !only.includes(source.id)) return [];
  const {clips,records}=await loadMotionAssets({fps,includeReferences:true});
  return [{...source,source,clips,sources:records}];
}
