/** Build assets/soccer-v22/headers.json from Codex's soccer-header-v1 pack (PR 416): six header clips, core range only.
 * The pack ships each clip as a 1.6 s (dive 3.2 s) strip with idle lead-in and recovery; `coreRange` marks the motion itself. As for the v12 clips,
 * only the core is shipped (the game's own state machine does the blending), keys re-timed so the core starts at 0 and normalised to 0..1.
 * Events (takeoff, contact, land) are shifted to core time. Hips offsets are kept as authored: they are the visual crouch, jump and dive
 * extension only (the pack has no root motion; the simulation moves the player).
 * Run: node tools/soccer-v22-headers-clips.mjs   (reads design/soccer-header-v1/runtime/{catalog,motions}.json; writes assets/soccer-v22/headers.json) */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const pack=new URL('../design/soccer-header-v1/runtime/',import.meta.url),out=new URL('../assets/soccer-v22/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('catalog.json',pack),'utf8')),motions=JSON.parse(await readFile(new URL('motions.json',pack),'utf8'));
const round=(v,n=4)=>Math.round(v*10**n)/10**n,REST_HIPS=[0,.86,0];
const ang=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])))*180/Math.PI;
const states={};
for(const meta of catalog.clips){
  const motion=motions.clips.find(c=>c.id===meta.id);if(!motion)throw Error('no motion for '+meta.id);
  const {start,end}=meta.coreRange,frames=motion.frames.filter(f=>f.time>=start-1e-6&&f.time<=end+1e-6),duration=round(end-start);
  if(frames.length<10)throw Error(meta.id+': core too short');
  const bones=Object.keys(frames[0].rotations);if(bones.length!==18)throw Error(meta.id+': expected 18 bones, got '+bones.length);
  const keyframes=frames.map(f=>({time:round((f.time-start)/duration,5),rotations:Object.fromEntries(bones.map(b=>[b,f.rotations[b].map(v=>round(v,5))])),hipsOffsetMeters:f.hips.map((v,k)=>round(v-REST_HIPS[k]))}));
  keyframes[0].time=0;keyframes.at(-1).time=1;
  let maxKeyDeg=0;for(let i=1;i<keyframes.length;i++)for(const b of bones)maxKeyDeg=Math.max(maxKeyDeg,ang(keyframes[i-1].rotations[b],keyframes[i].rotations[b]));
  const events=meta.events.map(e=>({timeSeconds:round(e.time-start),name:'visual_'+e.type,bone:e.bone||null,domain:'presentation'})).filter(e=>e.timeSeconds>=-1e-6&&e.timeSeconds<=duration+1e-6);
  const contact=meta.events.find(e=>e.type==='contact');
  states[meta.id]={clip:meta.id,group:'action',category:'header',durationSeconds:duration,loop:false,maxKeyDeg:round(maxKeyDeg,1),timeScale:1,
    events,ballContacts:[{time:round((contact.time-start)/duration,6),atSeconds:round(contact.time-start),event:'visual_contact',kind:'contact',bone:'Head'}],
    keyframes};
}
await mkdir(out,{recursive:true});
await writeFile(new URL('headers.json',out),JSON.stringify({schemaVersion:1,source:'design/soccer-header-v1 (Codex PR 416, CC0), core range only',fps:30,states}));
for(const [id,s] of Object.entries(states))console.log(id.padEnd(20),s.durationSeconds+'s',s.keyframes.length+'k',s.maxKeyDeg+'deg/key',s.events.map(e=>e.name.slice(7)+'@'+e.timeSeconds).join(' '));
