/** Build assets/soccer-v9/clips.json from Codex's soccer-motion-v9 library (design/soccer-motion-v9/runtime/clips/*.glb).
 * Each GLB carries one animation on the same 18 canonical bones and rest pose as the soccer-v7/v8 characters, so only the
 * animation data is converted, into the shape the game's motion compiler already reads (same as assets/soccer-v8/clips.json).
 * Meshes, textures, Draco geometry and the pack's own state machine are not shipped. `speedMps` is the clip's own travel speed
 * (travel path length over duration), which the game uses to pick a locomotion clip and to scale its playback.
 * Run: node tools/soccer-v9-clips.mjs   (writes assets/soccer-v9/clips.json) */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseGLB,readAccessor} from '../design/soccer-motion-v9/verification/glb-reader.mjs';
import {clips as catalog} from '../design/soccer-motion-v9/runtime/catalog.mjs';

const pack=new URL('../design/soccer-motion-v9/runtime/',import.meta.url),out=new URL('../assets/soccer-v9/',import.meta.url);
const round=(v,n=3)=>Math.round(v*10**n)/10**n;
/** Clips the game plays, with the key stride of the 30 Hz source (1 = every key). Contact clips keep every key. */
export const USED={run:1,sprint:1,idle_relaxed:2,idle_scan:2,idle_weight_shift:2,walk:1,jog:1,run_brake:1,running_pass:1,long_shot:1,
  goalkeeper_ready:2,goalkeeper_catch_high:1,goalkeeper_catch_low:1,celebrate_hop:2,celebrate_clap:2,celebrate_pump:2,celebrate_turn:2};
const REST_HIPS=[0,.86,0];
const states={};
for(const [id,stride] of Object.entries(USED)){
  const meta=catalog.find(c=>c.id===id);if(!meta)throw Error('no catalog entry for '+id);
  const glb=parseGLB(await readFile(new URL(meta.asset,pack))),{json}=glb;
  const animation=json.animations.find(a=>a.name===id)||json.animations[0];if(!animation)throw Error(id+': no animation');
  const tracks={};let times=null;
  for(const channel of animation.channels){
    const sampler=animation.samplers[channel.sampler],name=json.nodes[channel.target.node].name,input=readAccessor(glb,sampler.input).values,output=readAccessor(glb,sampler.output);
    if(!times)times=input;else if(times.length!==input.length||times.some((t,i)=>Math.abs(t-input[i])>1e-6))throw Error(`${id}: channels do not share one time base`);
    tracks[`${name}.${channel.target.path}`]=output.values;
  }
  const duration=meta.duration,frames=times.length,bones=json.nodes.slice(0,18).map(n=>n.name);
  const pick=times.map((_,i)=>i).filter(i=>i%stride===0||i===times.length-1);
  const keyframes=pick.map(i=>{
    const rotations={};for(const bone of bones){const q=tracks[`${bone}.rotation`];if(!q)throw Error(`${id}: no rotation for ${bone}`);rotations[bone]=Array.from(q.slice(i*4,i*4+4),v=>round(v));}
    const h=tracks['Hips.translation'];
    return {time:round(times[i]/duration,5),rotations,hipsOffsetMeters:h?[0,1,2].map(k=>round(h[i*3+k]-REST_HIPS[k])):[0,0,0]};
  });
  if(Math.abs(times[frames-1]-duration)>.04)throw Error(`${id}: ${times[frames-1]}s of keys for a ${duration}s clip`);
  const events=meta.events.filter(e=>e.type!=='plant').map(e=>({timeSeconds:round(e.time,4),name:'visual_'+e.type,bone:e.bone,domain:'presentation'}));
  const ballContacts=meta.events.filter(e=>e.type==='contact').map(e=>({time:round(e.time/duration,6),atSeconds:round(e.time,4),event:'visual_contact',bone:e.bone,localPointMeters:e.local.map(v=>round(v,5)),pointMeters:e.position.map(v=>round(v,5))}));
  const t=meta.travel||[],speedMps=t.length>1?round(Math.hypot(t.at(-1).position[0]-t[0].position[0],t.at(-1).position[2]-t[0].position[2])/duration,3):0;
  states[id]={clip:id,group:meta.role==='keeper'?'keeper':'action',durationSeconds:duration,loop:meta.loop,speedMps,events,ballContacts,keyframes,
    supports:(meta.supports||[]).map(s=>({bone:s.bone,start:round(s.start,4),end:round(s.end,4)}))};
}
await mkdir(out,{recursive:true});
await writeFile(new URL('clips.json',out),JSON.stringify({schemaVersion:1,source:'design/soccer-motion-v9/runtime/clips/*.glb',fps:30,states}));
for(const [name,s] of Object.entries(states))console.log(name.padEnd(24),s.durationSeconds+'s',s.keyframes.length+'k',s.speedMps+'m/s',s.ballContacts.map(c=>'contact@'+c.atSeconds).join(' '));
