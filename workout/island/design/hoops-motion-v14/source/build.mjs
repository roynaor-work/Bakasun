// SPDX-License-Identifier: CC0-1.0
// Reproducible extension of v13; writes exclusively inside hoops-motion-v14.
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CANON_BONES} from '../../../minigames/athletes-core.mjs';
import {point,add} from '../../soccer-header-v1/source/rig.mjs';
import {sampleMotion} from '../runtime/player.mjs';
import {createFinishes} from './finishes.mjs';
import {createPassesAndFreeThrows} from './passes-free.mjs';
import {createDribbleAndSocial} from './dribble-social.mjs';

const base=new URL('../',import.meta.url);
const required=['layup_right','layup_left','dunk_two_hand','dunk_reverse','block_jump','block_reach','steal_sprint','free_throw_prepare','free_throw_release','free_throw_follow','fadeaway','pass_overhead','pass_chest','pass_jump','dribble_behind','dribble_between','pivot','celebrate_score','disappointed','help_up'];
await mkdir(new URL('runtime/clips/',base),{recursive:true});
await mkdir(new URL('verification/',base),{recursive:true});
const clips=[...await createFinishes(),...await createPassesAndFreeThrows(),...await createDribbleAndSocial()];
if(clips.length!==20||new Set(clips.map(c=>c.id)).size!==20||required.some(id=>!clips.some(c=>c.id===id)))throw Error('Expected exactly the 20 specified actions');
clips.sort((a,b)=>required.indexOf(a.id)-required.indexOf(b.id));
const sha=b=>createHash('sha256').update(b).digest('hex');
function travelAt(c,t){
 const a=c.referenceTravel?.samples??[{time:0,position:[0,0,0],yawRadians:0}];
 let left=a[0],right=a.at(-1);
 for(let i=1;i<a.length;i++)if(t<=a[i].time){left=a[i-1];right=a[i];break;}
 const u=Math.max(0,Math.min(1,(t-left.time)/(right.time-left.time||1)));
 return {position:left.position.map((v,k)=>v+(right.position[k]-v)*u),yaw:(left.yawRadians??0)+((right.yawRadians??0)-(left.yawRadians??0))*u};
}
for(const c of clips){
 const duration=c.durationSeconds??c.duration;c.duration=c.durationSeconds=duration;
 c.frameCount=c.frames.length;c.nativeRate=30;c.rootMotion=false;c.license='CC0-1.0';
 if(Math.abs(duration*30-Math.round(duration*30))>1e-7||c.frames.length!==Math.round(duration*30)+1)throw Error(`${c.id}: duration/frame count differs from 30Hz`);
 for(const [i,f]of c.frames.entries()){
  if(Math.abs(f.time-i/30)>1e-7||f.hips.length!==3||!f.hips.every(Number.isFinite))throw Error(`${c.id}: invalid sample ${i}`);
  if(Object.keys(f.rotations).length!==18||CANON_BONES.some(b=>!f.rotations[b.name]?.every(Number.isFinite)))throw Error(`${c.id}: noncanonical sample ${i}`);
 }
 c.entry??={reference:'idle',alternatives:[{reference:'run'}],blendSeconds:.4};
 c.exit??={reference:'idle',alternatives:[{reference:'run'}],blendSeconds:.4};
 c.transitionContract={method:'makeClipBridge / interruptBridge',references:['idle','run'],referenceCatalog:'../../hoops-motion-v13/runtime/catalog.json',poseContinuity:'C0',velocityContinuity:'C1',travel:'simulation-owned; preserve support anchors during transitions'};
 // Height and actor/world positions are sampled from the same native pose stream
 // that is serialized into the GLB. Keep ball and ring contacts separate.
 for(const e of c.events??[]){
  e.type??=e.name;e.time??=e.timeSeconds??e.atSeconds;
  if(!Number.isFinite(e.time)||e.time<0||e.time>duration)throw Error(`${c.id}: invalid event time`);
  if(e.bone){
   const p=sampleMotion(c,e.time),local=point(p,e.bone,e.local??[0,0,0]),tr=travelAt(c,e.time),co=Math.cos(tr.yaw),si=Math.sin(tr.yaw);
   const world=add([co*local[0]+si*local[2],local[1],-si*local[0]+co*local[2]],tr.position);
   e.local??=[0,0,0];e.heightMeters=world[1];e.contactPositionMeters=world;e.actorLocalPositionMeters=local;
   e.heightReference='world floor y=0; native 30Hz pose, LINEAR translation and quaternion slerp';
  }
  if(e.type==='bounce'){
   const keys=c.ball?.samples??[],nearest=keys.reduce((a,b)=>Math.abs(b.time-e.time)<Math.abs(a.time-e.time)?b:a,keys[0]);
   const bp=nearest?.position??e.position??[0,c.ball?.radius??.12,0],tr=travelAt(c,e.time),co=Math.cos(tr.yaw),si=Math.sin(tr.yaw);
   e.ballCenterHeightMeters=bp[1]+tr.position[1];e.heightMeters=0;
   e.contactPositionMeters=[co*bp[0]+si*bp[2]+tr.position[0],0,-si*bp[0]+co*bp[2]+tr.position[2]];
   e.heightReference='floor surface y=0; ball center is one radius above this plane';
  }
 }
 c.contactMarkers=(c.events??[]).filter(e=>e.bone||e.type==='bounce'||e.type==='rim_contact').map(e=>({type:e.type,time:e.time,bone:e.bone,local:e.local,heightMeters:e.heightMeters??e.position?.[1],positionMeters:e.contactPositionMeters??e.positionMeters??e.position,surface:e.surface??(e.type==='rim_contact'?'rim':e.type==='bounce'||e.bone?.endsWith('Foot')?'floor':e.type.startsWith('assist_')?'partner':e.type.endsWith('_reaction')?'body':'ball')}));
}
const referenceBytes=await readFile(new URL('../../hoops-motion-v13/runtime/catalog.json',import.meta.url));
const sourceFiles=['source/finishes.mjs','source/passes-free.mjs','source/dribble-social.mjs','source/build.mjs','source/bake.mjs','runtime/player.mjs'];
const provenance=[];
for(const path of sourceFiles){const b=await readFile(new URL(path,base));provenance.push({path,bytes:b.length,sha256:sha(b)});}
const data={schemaVersion:1,version:'hoops-motion-v14',baseCommit:'f97bf53bf2a933c2a5411fa542aeee02d7059156',fps:30,units:'metres',axes:{up:'+Y',forward:'+Z',left:'+X'},hipsConvention:'absolute local translation; canonical rest [0,.86,0]',rootMotion:false,skeleton:CANON_BONES,requiredClipIds:required,referenceClips:{catalog:'../../hoops-motion-v13/runtime/catalog.json',sha256:sha(referenceBytes),ids:['idle','run'],note:'Immutable v13 transition references, not additional v14 deliverable clips.'},clips};
await writeFile(new URL('runtime/motions.json',base),JSON.stringify(data)+'\n');
await writeFile(new URL('verification/author-provenance.json',base),JSON.stringify({license:'CC0-1.0',baseCommit:data.baseCommit,qaCommit:'5eb4f093bc22523ee417a7f2345c3b813bffba24',sourceFiles:provenance},null,2)+'\n');
await import('./bake.mjs');
const catalog=JSON.parse(await readFile(new URL('runtime/catalog.json',base)));
const rootCatalog={...catalog,clips:catalog.clips.map(c=>({...c,asset:'runtime/'+c.asset,meshAsset:'runtime/'+c.meshAsset})),sharedModel:{...catalog.sharedModel,asset:'runtime/'+catalog.sharedModel.asset},referenceClips:{...catalog.referenceClips,catalog:'../hoops-motion-v13/runtime/catalog.json'},runtimeCatalog:'runtime/catalog.json'};
await writeFile(new URL('catalog.json',base),JSON.stringify(rootCatalog,null,2)+'\n');
console.log('Built exactly 20 v14 clips, root catalog and explicit contact heights.');
