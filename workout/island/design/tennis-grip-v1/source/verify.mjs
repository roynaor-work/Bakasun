// SPDX-License-Identifier: CC0-1.0
// Native-channel verification: rigid equipment, 30Hz, canonical bind, both hands.
import fs from 'node:fs/promises';
import * as T from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {unpack,readAccessor} from './glb.mjs';
import {bones,rotate,sub,dot,unit} from './rig.mjs';
import {HANDLE_CENTER,ATTACH,HEAD_LOCAL,HEAD_Y,GRIP_Y} from './author.mjs';
const base=new URL('../',import.meta.url),g=unpack(await fs.readFile(new URL('runtime/player.glb',base))),d=g.document;
const canonical=JSON.parse(await fs.readFile(new URL('../../motion/soccer.json',import.meta.url))).skeleton.bones;
const world=d.nodes.map(n=>{const o=new T.Object3D();o.name=n.name;o.position.fromArray(n.translation??[0,0,0]);o.quaternion.fromArray(n.rotation??[0,0,0,1]);return o;});
d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>world[i].add(world[c])));
const scene=new T.Group();d.scenes[0].nodes.forEach(i=>scene.add(world[i]));
const rest=world.map(o=>({p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));
const catalog=JSON.parse(await fs.readFile(new URL('runtime/catalog.json',base))),mask=JSON.parse(await fs.readFile(new URL('runtime/pose-mask.json',base)));
const names=d.skins[0].joints.map(i=>d.nodes[i].name),checks={canonical18:names.length===18&&names.every((n,i)=>n===canonical[i].name),canonicalBind:true,noCompression:!(d.extensionsUsed??[]).some(n=>/draco|meshopt/i.test(n)),rigidRacketChannels:true,all30Hz:true,rootStationary:true,noNonuniformBodyScale:true};
for(const b of canonical){const i=d.nodes.findIndex(n=>n.name===b.name),n=d.nodes[i],parent=d.nodes.find(p=>(p.children??[]).includes(i))?.name??null;checks.canonicalBind&&=parent===b.parent&&new T.Vector3(...(n.translation??[0,0,0])).distanceTo(new T.Vector3(...b.restTranslationMeters))<1e-8;}
const byName=Object.fromEntries(world.map(o=>[o.name,o]));
const headExpected=new T.Vector3(...HEAD_LOCAL),racketLength=.68,clips=[];
for(const animation of d.animations){
 const entry=catalog.clips.find(c=>c.id===animation.name),channels=animation.channels.map(c=>{const s=animation.samplers[c.sampler];return {...c.target,interpolation:s.interpolation,times:readAccessor(g,s.input).values,values:readAccessor(g,s.output).values,width:c.target.path==='rotation'?4:c.target.path==='weights'?1:3};});
 let maxHeadError=0,maxScaleError=0,maxRootError=0,maxLeftError=0,maxWristBend=0,samples=0;
 for(const c of channels){checks.all30Hz&&=c.times.length===entry.frameCount&&c.times.every((t,i)=>Math.abs(t-i/30)<1e-6);checks.rigidRacketChannels&&=!/racket|^grip$|^head$/.test(d.nodes[c.node].name);checks.noNonuniformBodyScale&&=c.path!=='scale'||d.nodes[c.node].name==='Ball';}
 for(let i=0;i<=Math.round(entry.duration*120);i++){
  const t=i/120;world.forEach((o,j)=>{o.position.copy(rest[j].p);o.quaternion.copy(rest[j].q);o.scale.copy(rest[j].s);});let leftOpen=0;
  for(const c of channels){const k=Math.min(c.times.length-2,Math.floor(t*30+1e-5)),dt=c.times[k+1]-c.times[k],u=Math.max(0,Math.min(1,(t-c.times[k])/dt)),a=c.values.slice(k*c.width,(k+1)*c.width),b=c.values.slice((k+1)*c.width,(k+2)*c.width),o=world[c.node];
   if(c.path==='rotation')o.quaternion.fromArray(a).normalize().slerp(new T.Quaternion(...b).normalize(),u);
   else if(c.path==='translation')o.position.fromArray(a.map((v,j)=>v+(b[j]-v)*u));
   else if(c.path==='scale')o.scale.fromArray(a.map((v,j)=>v+(b[j]-v)*u));
   else if(o.name==='grip_hand_L')leftOpen=a[0]+(b[0]-a[0])*u;
  }
  scene.updateMatrixWorld(true);const h=byName.RightHand,head=byName.head;
  maxHeadError=Math.max(maxHeadError,h.worldToLocal(head.getWorldPosition(new T.Vector3())).distanceTo(headExpected));
  maxScaleError=Math.max(maxScaleError,byName.racket.getWorldScale(new T.Vector3()).distanceTo(new T.Vector3(1,1,1)));
  maxRootError=Math.max(maxRootError,byName.Root.getWorldPosition(new T.Vector3()).length(),byName.Root.quaternion.angleTo(new T.Quaternion()));
  const wrist=h.getWorldPosition(new T.Vector3()),elbow=byName.RightForeArm.getWorldPosition(new T.Vector3()),forearm=wrist.clone().sub(elbow).normalize(),palm=new T.Vector3(0,-1,0).applyQuaternion(h.getWorldQuaternion(new T.Quaternion()));
  maxWristBend=Math.max(maxWristBend,forearm.angleTo(palm)*180/Math.PI);
  if(leftOpen<1e-6){const a=h.localToWorld(new T.Vector3(...HANDLE_CENTER)),b=byName.LeftHand.localToWorld(new T.Vector3(...HANDLE_CENTER)),racket=byName.racket,expected=racket.localToWorld(new T.Vector3(0,.153,0));maxLeftError=Math.max(maxLeftError,b.distanceTo(expected));}
  samples++;
 }
 checks.rootStationary&&=maxRootError<1e-6;
 clips.push({id:entry.id,samples,nativeFrames:entry.frameCount,maxHeadInHandErrorMeters:maxHeadError,maxRacketScaleError:maxScaleError,maxRootError,maxLeftGripErrorMeters:maxLeftError,maxRightWristBendDegrees:maxWristBend,pass:maxHeadError<1e-6&&maxScaleError<1e-6&&maxRootError<1e-6&&maxLeftError<.002&&maxWristBend<62});
}
const prop=unpack(await fs.readFile(new URL('runtime/racket.glb',base))),positions=[];
for(const m of prop.document.meshes)for(const p of m.primitives)positions.push(...readAccessor(prop,p.attributes.POSITION).values.filter((_,i)=>i%3===1));
const measuredLength=Math.max(...positions)-Math.min(...positions);checks.racket68cm=Math.abs(measuredLength-racketLength)<1e-6;
checks.gripAtHandleTop=prop.document.nodes.find(n=>n.name==='grip').translation[1]===.20;checks.headAtStringCentre=prop.document.nodes.find(n=>n.name==='head').translation[1]===.50;
const report={schemaVersion:1,measurementRate:120,checks,clips,measuredRacketLengthMeters:measuredLength,pass:Object.values(checks).every(Boolean)&&clips.length===9&&clips.every(c=>c.pass)};
await fs.writeFile(new URL('verification/asset-checks.json',base),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
