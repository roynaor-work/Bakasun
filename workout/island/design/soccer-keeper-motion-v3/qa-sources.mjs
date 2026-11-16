// SPDX-License-Identifier: CC0-1.0
// Input adapter only. The pinned motion-qa-v1 reader, metrics and runner are unchanged.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const base=path.dirname(fileURLToPath(import.meta.url));
const qaRoot=process.env.SOCCER_KEEPER_QA_ROOT;
if(!qaRoot)throw new Error('Run source/run-qa.mjs to prepare the pinned QA workspace.');
const {sampleGLB}=await import(pathToFileURL(path.join(qaRoot,'glb.mjs')).href);
const source={id:'soccer-keeper-motion-v3',sport:'soccer',version:'keeper-motion-v3',
  ref:'codex/soccer-keeper-motion-v3',commit:process.env.SOCCER_KEEPER_SOURCE_COMMIT??'working-tree',
  path:'workout/island/design/soccer-keeper-motion-v3',kind:'soccer',catalog:'catalog.json'};
export const SOURCES=Object.freeze([source]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
export function rotate(v,q){
  const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
function multiply(a,b){
  const [x,y,z,w]=a,[X,Y,Z,W]=b;
  return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
}
export function track(keys,time,{yawUnit='radians'}={}){
  if(!keys?.length)return {position:[0,0,0],yawRadians:0};
  const point=k=>k.position??k.positionMeters??[0,0,0],at=k=>k.time??k.t??k.timeSeconds;
  const yaw=k=>k.yawRadians??(k.yaw??0)*(yawUnit==='radians'?1:Math.PI/180);
  const result=k=>({position:[...point(k)],yawRadians:yaw(k)});
  if(time<=at(keys[0]))return result(keys[0]);
  for(let i=1;i<keys.length;i++)if(time<=at(keys[i])){
    const a=keys[i-1],b=keys[i],u=(time-at(a))/(at(b)-at(a));
    return {position:point(a).map((v,j)=>v+(point(b)[j]-v)*u),yawRadians:yaw(a)+(yaw(b)-yaw(a))*u};
  }
  return result(keys.at(-1));
}
const roleFor=entry=>entry.role??(entry.id.startsWith('keeper_')?'goalkeeper':'field');
const normalizeWindow=w=>({...w,bone:w.bone??w.effector,
  start:w.startSeconds??w.start,end:w.endSeconds??w.end,
  local:w.local??w.localPointMeters??(String(w.bone??w.effector).endsWith('Foot')?[0,-.08,0]:[0,0,0])});

export async function loadMotionAssets({fps=120}={}){
  const records=[];
  async function read(relative){
    const bytes=await readFile(path.join(base,relative));
    records.push({path:`${source.path}/${relative}`,bytes:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      gitBlob:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')});
    return bytes;
  }
  const catalog=JSON.parse(await read('catalog.json'));
  await read('motions.json');
  let references=catalog.qaReferences??catalog.references;
  if(!Array.isArray(references))references=[];
  // An auxiliary pinned locomotion idle supplies the field role's honest baseline.
  // It is measured and clearly labelled, and never counted among the 14 new actions.
  if(!references.some(c=>c.id==='idle_relaxed'))references.push({id:'idle_relaxed',
    label:'עמידת ייחוס של שחקן שדה · soccer-locomotion-v2',role:'field',
    asset:'reference/idle_relaxed.glb',loop:true,locomotion:false,auxiliary:true,
    supports:[{bone:'LeftFoot',start:0,end:4,local:[0,-.08,0]},
      {bone:'RightFoot',start:0,end:4,local:[0,-.08,0]}]});
  const entries=[...catalog.clips.map(c=>({...c,auxiliary:false})),
    ...references.filter(c=>/idle|ready|stance/.test(c.id)).map(c=>({...c,auxiliary:true}))];
  const clips=[];
  for(const entry of entries){
    const events=(entry.events??[]).map(e=>({...e,type:e.type??e.name??e.event,
      time:e.timeSeconds??e.atSeconds??e.time??(e.frame??0)/30,
      bone:e.bone??e.effector,local:e.local??e.localPointMeters}));
    const supports=(entry.supports??entry.supportWindows??[]).map(normalizeWindow);
    const ballContacts=(entry.ballContacts??entry.ballContactWindows??[]).map(normalizeWindow);
    for(const e of events)if(e.bone&&/^(contact|touch|catch|receive|release|ball_release|hand_ball_contact)$/.test(e.type)){
      if(!ballContacts.some(w=>w.bone===e.bone&&e.time>=w.start-1e-8&&e.time<=w.end+1e-8))
        ballContacts.push({bone:e.bone,start:e.time,end:e.time,local:e.local??[0,0,0]});
    }
    const extraTimes=[...events.map(e=>e.time),...supports.flatMap(w=>[w.start,w.end]),
      ...ballContacts.flatMap(w=>[w.start,w.end])];
    const relative=entry.asset??entry.glb??`clips/${entry.id}.glb`;
    const native=sampleGLB(await read(relative),{animation:entry.animation??entry.id,fps,extraTimes});
    const travel=entry.referenceTravel?.samples??entry.referenceRootMotion?.samples??entry.travel??[];
    const ballKeys=entry.ball?.samples??entry.ball?.keys;
    for(const frame of native.frames){
      // Keep the original in-place pose for continuity; world drift uses the declared actor scenario once.
      frame.localJoints=structuredClone(frame.joints);frame.assetRoot=[...frame.root];
      const scenario=track(travel,frame.t,{yawUnit:entry.referenceRootMotion?.yawUnit??'radians'});
      const q=[0,Math.sin(scenario.yawRadians/2),0,Math.cos(scenario.yawRadians/2)];
      frame.referenceRoot=[...scenario.position];frame.referenceYaw=scenario.yawRadians;
      frame.joints=Object.fromEntries(Object.entries(frame.joints).map(([bone,p])=>[bone,add(rotate(p,q),scenario.position)]));
      frame.rotations=Object.fromEntries(Object.entries(frame.rotations).map(([bone,v])=>[bone,multiply(q,v)]));
      frame.root=add(rotate(frame.assetRoot,q),scenario.position);
      if(ballKeys?.length){
        const p=track(ballKeys,frame.t).position;
        frame.ball=entry.ball.space==='world'||entry.ball.coordinateSpace==='world'?p:add(rotate(p,q),scenario.position);
      }else if(frame.ball)frame.ball=add(rotate(frame.ball,q),scenario.position);
      frame.floorPoints=['LeftFoot','RightFoot'].map(bone=>({bone,
        position:add(frame.joints[bone],rotate(entry.soleLocal??[0,-.08,0],frame.rotations[bone]))}));
    }
    const hasBall=entry.ballVisible??entry.ball?.visible??native.frames.some(f=>!!f.ball);
    clips.push({id:entry.id,motionId:entry.id,label:entry.label??entry.labelHe??entry.id,
      role:roleFor(entry),auxiliary:!!entry.auxiliary,
      duration:entry.durationSeconds??entry.duration??native.duration,nativeDuration:native.duration,height:native.height,
      metadata:{...entry,role:roleFor(entry),auxiliary:!!entry.auxiliary,kind:entry.category??entry.kind,
        events,supports,ballContacts,ball:{...(entry.ball??{}),radius:entry.ball?.radius??entry.ballRadius??.11},
        ballRadius:entry.ball?.radius??entry.ballRadius??.11,ballVisible:!!hasBall,
        locomotion:entry.locomotion??false,rootMotion:false,rootMotionApplied:travel.length>0,
        referenceTravelKnown:travel.length>0,speed:entry.speedMps,soleLocal:entry.soleLocal??[0,-.08,0],
        checkHingeDirection:true,symmetryMode:entry.symmetryMode??'structural',sourceAsset:relative,
        coordinateSpace:'Native GLB plus declared external actor position and heading, applied once.',
        measurementSpace:'World support drift uses the actor scenario; continuity retains the native pose.'},
      frames:native.frames});
  }
  return {catalog,clips,records};
}
export async function loadLibraries({fps=120,only}={}){
  if(only?.length&&!only.includes(source.id))return [];
  const {clips,records}=await loadMotionAssets({fps});
  return [{...source,source,clips,sources:records}];
}
