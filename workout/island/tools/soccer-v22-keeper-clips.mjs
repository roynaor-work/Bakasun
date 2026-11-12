/** Build assets/soccer-v22/keeper.json from Codex's soccer-keeper-crowd-v1 pack (PR 418): the beaten keeper's clips.
 * Clips shipped: keeper_after_goal (2.5 s once), disappointed (2 s loop). keeper_celebrate stays in the Codex pack only: the simulation has no
 * save event to play it on (a parry is not marked, a catch leaves the ball in his hands), and every shipped clip is compiled and floor-baked per match.
 * The pack keeps the celebration jump on Root ("do not add the lift twice"); the game's retarget zeroes Root, so Root's offset is folded into
 * the Hips offset here. The whole clip is the core (coreRange = 0..duration).
 * Run: node tools/soccer-v22-keeper-clips.mjs */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const pack=new URL('../design/soccer-keeper-crowd-v1/runtime/',import.meta.url),out=new URL('../assets/soccer-v22/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('catalog.json',pack),'utf8'));
const round=(v,n=4)=>Math.round(v*10**n)/10**n,REST_HIPS=[0,.86,0];
const ang=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])))*180/Math.PI;
const states={};
for(const meta of catalog.clips){
  if(meta.id==='keeper_ready_reference'||meta.id==='keeper_celebrate')continue; // reference for measurement only / no trigger yet
  const data=JSON.parse(await readFile(new URL('keyframes/'+meta.id+'.json',pack),'utf8')),duration=round(meta.duration);
  const bones=Object.keys(data.poses[0].rotations);if(bones.length!==18)throw Error(meta.id+': expected 18 bones');
  const keyframes=data.poses.map(p=>{
    const root=p.translations.Root||[0,0,0],hips=p.translations.Hips;
    return {time:round(p.t/duration,5),rotations:Object.fromEntries(bones.map(b=>[b,p.rotations[b].map(v=>round(v,5))])),hipsOffsetMeters:hips.map((v,k)=>round(v+root[k]-REST_HIPS[k]))};
  });
  keyframes[0].time=0;keyframes.at(-1).time=1;
  let maxKeyDeg=0;for(let i=1;i<keyframes.length;i++)for(const b of bones)maxKeyDeg=Math.max(maxKeyDeg,ang(keyframes[i-1].rotations[b],keyframes[i].rotations[b]));
  const events=meta.metadata.events.filter(e=>e.type!=='plant').map(e=>({timeSeconds:round(e.time),name:'visual_'+e.type,bone:e.bone||null,domain:'presentation'}));
  states[meta.id]={clip:meta.id,group:'keeper',category:meta.metadata.kind,durationSeconds:duration,loop:Boolean(meta.metadata.originalLoop??meta.metadata.loop),maxKeyDeg:round(maxKeyDeg,1),timeScale:1,events,ballContacts:[],keyframes};
}
await mkdir(out,{recursive:true});
await writeFile(new URL('keeper.json',out),JSON.stringify({schemaVersion:1,source:'design/soccer-keeper-crowd-v1 (Codex PR 418, CC0), Root jump folded into Hips',fps:30,states}));
for(const [id,s] of Object.entries(states))console.log(id.padEnd(18),s.durationSeconds+'s',s.keyframes.length+'k',s.maxKeyDeg+'deg/key','loop='+s.loop,s.events.map(e=>e.name.slice(7)+'@'+e.timeSeconds).join(' '));
