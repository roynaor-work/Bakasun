/** Build assets/soccer-v24/clips/clips.json from Codex's soccer-clips-v13 pack (8 clips, QA 89-98, 0 red metrics).
 * Only the six clips that have a clean simulation event are shipped (see minigames/soccer-v24.mjs SOCCER_V24_CLIPS):
 * goal_kick (a goal kick), keeper_throw (the keeper's hand distribution), throw_in (a throw-in), slide_tackle (a slide),
 * lob_pass (a lofted pass, also the v23 lob button) and chest_control (a high pass received standing at chest height).
 * keeper_celebrate and volley stay in design/ (no clean event: the keeper holds the caught ball in front of him until he
 * distributes it, and the simulation has no volley).
 * Unlike the v22 header tool the whole timeline is kept (not only the core range): the restart clips are scrubbed on the
 * simulation's own clock between event anchors (approach/contact/release), which need the authored lead-in and recovery.
 * Keys are normalised to 0..1, events and contacts are in clip seconds, Hips offsets are relative to the canonical rest
 * (0, 0.86, 0) as in every other Codex pack (the pack has no root motion; the simulation moves the player).
 * Run: node workout/island/tools/soccer-v24-clips.mjs   (reads design/soccer-clips-v13/runtime/{catalog,motions}.json) */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {SOCCER_V24_CLIPS} from '../minigames/soccer-v24.mjs';
const pack=new URL('../design/soccer-clips-v13/runtime/',import.meta.url),out=new URL('../assets/soccer-v24/clips/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('catalog.json',pack),'utf8')),motions=JSON.parse(await readFile(new URL('motions.json',pack),'utf8'));
const round=(v,n=4)=>Math.round(v*10**n)/10**n,REST_HIPS=[0,.86,0];
const ang=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])))*180/Math.PI;
const states={};
for(const id of SOCCER_V24_CLIPS){
  const meta=catalog.clips.find(c=>c.id===id),motion=motions.clips.find(c=>c.id===id);
  if(!meta||!motion)throw Error('soccer-clips-v13 lacks '+id);
  const duration=round(meta.durationSeconds),frames=motion.frames;
  if(frames.length<10)throw Error(id+': too few frames');
  const bones=Object.keys(frames[0].rotations);if(bones.length!==18)throw Error(id+': expected 18 bones, got '+bones.length);
  const keyframes=frames.map(f=>({time:round(f.time/duration,5),rotations:Object.fromEntries(bones.map(b=>[b,f.rotations[b].map(v=>round(v,5))])),hipsOffsetMeters:f.hips.map((v,k)=>round(v-REST_HIPS[k]))}));
  keyframes[0].time=0;keyframes.at(-1).time=1;
  let maxKeyDeg=0;for(let i=1;i<keyframes.length;i++)for(const b of bones)maxKeyDeg=Math.max(maxKeyDeg,ang(keyframes[i-1].rotations[b],keyframes[i].rotations[b]));
  const events=meta.events.map(e=>({timeSeconds:round(e.time),name:'visual_'+e.type,bone:e.bone||null,domain:'presentation'}));
  const strike=meta.events.find(e=>['contact','release','receive'].includes(e.type));
  states[id]={clip:id,group:'action',category:meta.category,durationSeconds:duration,loop:false,maxKeyDeg:round(maxKeyDeg,1),timeScale:1,
    coreRange:{start:round(meta.coreRange.start),end:round(meta.coreRange.end)},events,
    // contact, release and receive are all the moment the ball meets the body: one 'visual_contact' the state machine's contactTime() reads
    ballContacts:strike?[{time:round(strike.time/duration,6),atSeconds:round(strike.time),event:'visual_contact',kind:strike.type,bone:strike.bone||null}]:[],
    keyframes};
}
await mkdir(out,{recursive:true});
await writeFile(new URL('clips.json',out),JSON.stringify({schemaVersion:1,source:'design/soccer-clips-v13 (Codex, CC0), full timeline of the six clips with a simulation event',fps:30,states}));
for(const [id,s] of Object.entries(states))console.log(id.padEnd(16),s.durationSeconds+'s',s.keyframes.length+'k',s.maxKeyDeg+'deg/key',s.events.map(e=>e.name.slice(7)+'@'+e.timeSeconds).join(' '));
