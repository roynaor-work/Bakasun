/** Build assets/soccer-v10/clips.json from Codex's soccer-motion-v10 library (design/soccer-motion-v10/runtime/clips/*.glb, no Draco).
 * 30 clips on the same 18 canonical bones and rest pose as the v7/v8/v9 characters: only the animation data is converted, into the shape
 * the game's motion compiler already reads. `events` keep Codex's named events (receive, release, contact, jockey, brake, plant) with frame
 * times; `ballContacts` holds the receive/release/contact ones. Meshes and the pack's own preview player are not shipped.
 * Run: node tools/soccer-v10-clips.mjs   (writes assets/soccer-v10/clips.json) */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseGLB,readAccessor} from '../design/soccer-motion-v8/verification/glb-reader.mjs';

const pack=new URL('../design/soccer-motion-v10/runtime/',import.meta.url),out=new URL('../assets/soccer-v10/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('catalog.json',pack),'utf8')).clips;
const round=(v,n=3)=>Math.round(v*10**n)/10**n,REST_HIPS=[0,.86,0];
const states={};
for(const meta of catalog){
  const id=meta.id,glb=parseGLB(await readFile(new URL(meta.asset,pack))),{json}=glb;
  const animation=json.animations.find(a=>a.name===id)||json.animations[0];if(!animation)throw Error(id+': no animation');
  const tracks={};let times=null;
  for(const channel of animation.channels){
    const sampler=animation.samplers[channel.sampler],name=json.nodes[channel.target.node].name,input=readAccessor(glb,sampler.input).values,output=readAccessor(glb,sampler.output);
    if(!times)times=input;else if(times.length!==input.length||times.some((t,i)=>Math.abs(t-input[i])>1e-6))throw Error(`${id}: channels do not share one time base`);
    tracks[`${name}.${channel.target.path}`]=output.values;
  }
  const duration=meta.duration,frames=times.length,bones=json.nodes.slice(0,18).map(n=>n.name),stride=meta.loop&&meta.category==='idle'?2:1;
  const pick=times.map((_,i)=>i).filter(i=>i%stride===0||i===times.length-1);
  const keyframes=pick.map(i=>{
    const rotations={};for(const bone of bones){const q=tracks[`${bone}.rotation`];if(!q)throw Error(`${id}: no rotation for ${bone}`);rotations[bone]=Array.from(q.slice(i*4,i*4+4),v=>round(v));}
    const h=tracks['Hips.translation'];
    return {time:round(times[i]/duration,5),rotations,hipsOffsetMeters:h?[0,1,2].map(k=>round(h[i*3+k]-REST_HIPS[k])):[0,0,0]};
  });
  if(Math.abs(times[frames-1]-duration)>.04)throw Error(`${id}: ${times[frames-1]}s of keys for a ${duration}s clip`);
  const named=(meta.events||[]).filter(e=>e.type!=='plant');
  const events=named.map(e=>({timeSeconds:round(e.time,4),name:'visual_'+e.type,bone:e.bone,domain:'presentation'}));
  const ballContacts=named.filter(e=>['receive','release','contact'].includes(e.type)).map(e=>({time:round(e.time/duration,6),atSeconds:round(e.time,4),event:'visual_contact',kind:e.type,bone:e.bone,localPointMeters:e.local.map(v=>round(v,5)),pointMeters:(e.position||[0,0,0]).map(v=>round(v,5))}));
  // Largest bone rotation between two neighbouring keys, scaled to 1/30 s: a snap (an arm whipping 100+ degrees in one key) shows on screen.
  const ang=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])))*180/Math.PI;let maxKeyDeg=0;
  for(let i=1;i<keyframes.length;i++){const dtk=(keyframes[i].time-keyframes[i-1].time)*duration;for(const b of bones)maxKeyDeg=Math.max(maxKeyDeg,ang(keyframes[i-1].rotations[b],keyframes[i].rotations[b])/(dtk*30));}
  states[id]={clip:id,group:meta.role==='keeper'?'keeper':'action',category:meta.category,durationSeconds:duration,loop:meta.loop,maxKeyDeg:round(maxKeyDeg,1),events,ballContacts,keyframes,
    supports:(meta.supports||[]).map(s=>({bone:s.bone,start:round(s.start,4),end:round(s.end,4)})),
    entry:meta.entry?{reference:meta.entry.reference,phase:meta.entry.phase}:null,exit:meta.exit?{reference:meta.exit.reference,phase:meta.exit.phase,continuation:!!meta.exit.continuation,blendSeconds:meta.exit.blendSeconds??0}:null};
}
await mkdir(out,{recursive:true});
await writeFile(new URL('clips.json',out),JSON.stringify({schemaVersion:1,source:'design/soccer-motion-v10/runtime/clips/*.glb',fps:30,states}));
for(const [name,s] of Object.entries(states))console.log(name.padEnd(36),s.durationSeconds.toFixed(2)+'s',s.keyframes.length+'k',s.maxKeyDeg+'deg/key',s.ballContacts.map(c=>c.kind+'@'+c.atSeconds).join(' '));
