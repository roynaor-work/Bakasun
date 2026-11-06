/** Build assets/soccer-v8/clips.json from GPT's soccer-motion-v8 review pack.
 * The pack ships its animations inside player.glb / keeper.glb (18 canonical bones, the same skeleton and rest pose as the
 * soccer-v7 characters already in the game), so only the animation data is converted into the shape the game's
 * motion compiler reads (the same shape as assets/soccer-v7/clips.json). Meshes, textures and the pack's own controller are not
 * shipped. Run: node tools/soccer-v8-clips.mjs   (writes assets/soccer-v8/clips.json) */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseGLB,readAccessor} from '../design/soccer-motion-v8/verification/glb-reader.mjs';
import {clips as catalog} from '../design/soccer-motion-v8/runtime/catalog.mjs';

const pack=new URL('../design/soccer-motion-v8/runtime/',import.meta.url),out=new URL('../assets/soccer-v8/',import.meta.url);
const round=(v,n=3)=>Math.round(v*10**n)/10**n;
/** Clips the game plays and the key stride (30 Hz source). Dives and the keeper stance are slow enough for 15/10 Hz keys; every
 * clip keeps its first and last key. The other pack clips (receive, first touch, dribble, turn, shield, cut, block, slide, keeper throw)
 * stay in the review pack: see verification/soccer-v8-connect/REPORT.md. */
const USED={pass_short:1,pass_long:1,pass_loft:1,shot:1,keeper_ready:3,keeper_dive_low_left:2,keeper_dive_low_center:2,keeper_dive_low_right:2,keeper_dive_middle_left:2,keeper_dive_middle_center:2,keeper_dive_middle_right:2,keeper_dive_high_left:2,keeper_dive_high_center:2,keeper_dive_high_right:2};
const REST_HIPS=[0,.86,0];
const states={};
for(const file of ['player.glb','keeper.glb']){
  const glb=parseGLB(await readFile(new URL(file,pack))),{json}=glb;
  for(const animation of json.animations){
    if(!(animation.name in USED))continue;
    const meta=catalog.find(c=>c.id===animation.name);if(!meta)throw Error('no catalog entry for '+animation.name);
    const tracks={};let times=null;
    for(const channel of animation.channels){
      const sampler=animation.samplers[channel.sampler],name=json.nodes[channel.target.node].name,input=readAccessor(glb,sampler.input).values,output=readAccessor(glb,sampler.output);
      if(!times)times=input;else if(times.length!==input.length||times.some((t,i)=>Math.abs(t-input[i])>1e-6))throw Error(`${animation.name}: channels do not share one time base`);
      tracks[`${name}.${channel.target.path}`]=output.values;
    }
    const duration=meta.duration,frames=times.length,bones=json.nodes.slice(0,18).map(n=>n.name);
    const stride=USED[animation.name],pick=times.map((_,i)=>i).filter(i=>i%stride===0||i===times.length-1);
    const keyframes=pick.map(i=>{const t=times[i];
      const rotations={};for(const bone of bones){const q=tracks[`${bone}.rotation`];if(!q)throw Error(`${animation.name}: no rotation for ${bone}`);rotations[bone]=q.slice(i*4,i*4+4).map(v=>round(v));}
      const h=tracks['Hips.translation'];return {time:round(t/duration,5),rotations,hipsOffsetMeters:h?[0,1,2].map(k=>round(h[i*3+k]-REST_HIPS[k])):[0,0,0]};
    });
    const lastTime=times[frames-1];if(Math.abs(lastTime-duration)>.04)throw Error(`${animation.name}: ${lastTime}s of keys for a ${duration}s clip`);
    const events=meta.events.filter(e=>e.type!=='plant').map(e=>({timeSeconds:e.time,name:'visual_'+e.type,bone:e.bone,domain:'presentation'}));
    const ballContacts=meta.events.filter(e=>e.type==='contact').map(e=>({time:round(e.time/duration,6),atSeconds:e.time,event:'visual_contact',bone:e.bone,localPointMeters:e.local.map(v=>round(v,5)),pointMeters:e.position.map(v=>round(v,5)),ballRadiusMeters:.11,timeSeconds:e.time}));
    states[animation.name]={clip:animation.name,group:meta.role==='keeper'?'keeper':'action',durationSeconds:duration,loop:meta.loop,events,ballContacts,keyframes,
      supports:meta.supports?.map(s=>({bone:s.bone,start:s.start,end:s.end}))||[]};
  }
}
await mkdir(out,{recursive:true});
await writeFile(new URL('clips.json',out),JSON.stringify({schemaVersion:1,source:'design/soccer-motion-v8/runtime/{player,keeper}.glb',fps:30,states}));
for(const [name,s] of Object.entries(states))console.log(name.padEnd(26),s.durationSeconds+'s',s.keyframes.length+'k',s.events.map(e=>e.name.slice(7)+'@'+e.timeSeconds).join(' '));
