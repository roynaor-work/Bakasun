// SPDX-License-Identifier: CC0-1.0
// Input adapter only. The pinned motion-qa-v1 reader and formulas are unchanged.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const qaRoot = process.env.SOCCER_REFEREE_QA_ROOT;
if (!qaRoot) throw new Error('Run source/run-qa.mjs to prepare the pinned QA reader.');
const {sampleGLB} = await import(pathToFileURL(path.join(qaRoot, 'glb.mjs')).href);
const source = {
  id: 'soccer-referee-v1', sport: 'soccer', version: 1,
  ref: 'codex/soccer-referee-v1',
  commit: process.env.SOCCER_REFEREE_SOURCE_COMMIT ?? 'working-tree',
  commitMeaning: 'Checkout base; the actual working-tree catalog and GLB bytes are identified by their individual SHA-256 and Git blob hashes in sources.',
  path: 'workout/island/design/soccer-referee-v1', kind: 'local-native-GLB',
};
export const SOURCES = Object.freeze([source]);
const add = (a, b) => a.map((v, i) => v + b[i]);
function rotate([x,y,z,w], [a,b,c]) {
  const tx = 2*(y*c-z*b), ty = 2*(z*a-x*c), tz = 2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty, b+w*ty+z*tx-x*tz, c+w*tz+x*ty-y*tx];
}
function multiply([x,y,z,w], [a,b,c,d]) {
  return [w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
}
function referenceAt(keys, time) {
  if (!keys?.length) return {position:[0,0,0],yaw:0};
  const value = key => ({position:key.position ?? key.positionMeters ?? [0,0,0],yaw:key.yaw ?? 0});
  if (time <= keys[0].time) return value(keys[0]);
  for (let i=1;i<keys.length;i++) if (time <= keys[i].time) {
    const a=value(keys[i-1]),b=value(keys[i]),u=(time-keys[i-1].time)/(keys[i].time-keys[i-1].time);
    return {position:a.position.map((v,j)=>v+(b.position[j]-v)*u),yaw:a.yaw+(b.yaw-a.yaw)*u};
  }
  return value(keys.at(-1));
}
function applyReference(frame, reference) {
  frame.localJoints=structuredClone(frame.joints);
  frame.rawRotations=structuredClone(frame.rotations);
  frame.assetRoot=[...frame.root];
  frame.referenceRoot=[...reference.position];
  frame.referenceYaw=reference.yaw;
  const q=[0,Math.sin(reference.yaw/2),0,Math.cos(reference.yaw/2)];
  frame.joints=Object.fromEntries(Object.entries(frame.joints).map(([n,p])=>[n,add(rotate(q,p),reference.position)]));
  frame.rotations=Object.fromEntries(Object.entries(frame.rotations).map(([n,r])=>[n,multiply(q,r)]));
  frame.root=add(rotate(q,frame.assetRoot),reference.position);
  frame.floorPoints=frame.floorPoints.map(p=>({...p,position:add(rotate(q,p.position),reference.position)}));
  frame.soles=Object.fromEntries(frame.floorPoints.map(p=>[p.bone,p.position]));
  // Refereeing gestures have no ball. No contact trajectory is manufactured.
  frame.ball=null;
  return frame;
}

export async function loadLibraries({fps=120,only}={}) {
  if (only?.length && !only.includes(source.id)) return [];
  const records=[];
  async function bytes(relative) {
    const absolute=path.resolve(root,relative);
    assert(absolute.startsWith(root+path.sep),'QA source must remain in this package.');
    const buffer=await readFile(absolute);
    records.push({path:`${source.path}/${relative}`,bytes:buffer.length,
      sha256:createHash('sha256').update(buffer).digest('hex'),
      gitBlob:createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex')});
    return buffer;
  }
  const catalog=JSON.parse(await bytes('runtime/catalog.json'));
  const clips=[];
  for (const entry of catalog.clips) {
    const duration=entry.durationSeconds ?? entry.duration;
    const meta={...entry,...entry.metadata};
    const events=(meta.events??[]).map(e=>({...e,type:e.type??e.name??e.event,
      time:e.timeSeconds??e.atSeconds??e.time??e.frame/30}));
    const supports=(meta.supports??meta.supportWindows??[]).map(w=>({...w,
      start:w.startSeconds??w.start??w.startTime*duration,
      end:w.endSeconds??w.end??w.endTime*duration,
      local:w.local??w.localPointMeters??[0,-.08,0]}));
    const travel=meta.referenceRootMotion?.samples??meta.travel??[];
    const extraTimes=[...events.map(e=>e.time),...supports.flatMap(s=>[s.start,s.end]),...travel.map(k=>k.time)];
    const native=sampleGLB(await bytes(entry.asset),{animation:entry.animationName??entry.id,fps,extraTimes});
    assert(Math.abs(native.duration-duration)<1e-5,`${entry.id}: catalog duration differs from GLB`);
    const canonical=catalog.skeleton.map(b=>b.name).sort();
    assert.equal(canonical.length,18,'The source catalog must name the canonical 18 joints.');
    for (const frame of native.frames) {
      assert.deepEqual(Object.keys(frame.joints).sort(),canonical,`${entry.id}: native GLB joint coverage`);
      assert(Math.hypot(...frame.root)<1e-7,`${entry.id}: external travel requires a stationary asset Root`);
      const q=frame.localRotations.Root;
      assert(Math.hypot(...q.slice(0,3))<1e-7 && Math.abs(Math.abs(q[3])-1)<1e-7,`${entry.id}: asset Root must have identity rotation`);
    }
    for (const frame of native.frames) applyReference(frame,referenceAt(travel,frame.t));
    clips.push({id:entry.id,motionId:entry.id,label:entry.labelHe??entry.label??entry.id,
      role:'referee',duration:native.duration,height:native.height,
      metadata:{...meta,events,supports,loop:entry.loop,role:'referee',
        rootMotion:false,locomotion:meta.locomotion??/jog|run/.test(entry.id),
        referenceTravelKnown:travel.length>0,ballVisible:false,ballContactExpected:false,
        ballContacts:[],soleLocal:[0,-.08,0],checkHingeDirection:true,
        sourceAsset:entry.asset,
        coordinateSpace:'Decoded native canonical GLB plus the declared external reference travel; raw asset joints and rotations retained separately.'},
      frames:native.frames,nativeDuration:native.duration});
  }
  return [{...source,source,sources:records,clips}];
}
