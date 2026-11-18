/** Build assets/soccer-v11/clips.json from Codex's motion-fix-v12 repaired soccer-v11 clips.
 * Each repaired GLB carries 0.35 s of idle lead-in and a trailing handle around the real motion; `metadata.coreRange` (runtime seconds) marks the
 * motion itself. Only the core is shipped (the game's own state machine does the blending), keys re-timed so the core starts at 0.
 * Run: node tools/soccer-v11-clips.mjs <pack-dir> [<catalog-json>]
 *   pack-dir = a checkout of workout/island/design/motion-fix-v12 (with runtime/soccer-v9|v10/*.motion-fix-v12.glb);
 *   catalog-json = its runtime/catalog.json (default <pack-dir>/runtime/catalog.json). Writes assets/soccer-v11/clips.json. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseGLB,readAccessor} from '../design/soccer-motion-v8/verification/glb-reader.mjs';

const pack=resolve(process.argv[2]||'.')+'/',catalogPath=process.argv[3]||pack+'runtime/catalog.json';
const out=new URL('../assets/soccer-v11/',import.meta.url);
const rawCatalog=JSON.parse(await readFile(catalogPath,'utf8')),catalog=(rawCatalog.clips||rawCatalog).filter(c=>c.library==='soccer-v11');
const round=(v,n=3)=>Math.round(v*10**n)/10**n,REST_HIPS=[0,.86,0];
const ang=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])))*180/Math.PI;
const states={};
for(const meta of catalog){
  const m=meta.metadata,id=meta.id;
  const glb=parseGLB(await readFile(pack+'runtime/'+meta.animation.replace(/^runtime\//,''))),{json}=glb;
  const animation=json.animations[0];
  // Each channel has its own sparse keys (adaptive timing): resample all of them onto one 30 Hz grid over the core.
  const chans={};
  for(const channel of animation.channels){
    const sampler=animation.samplers[channel.sampler],name=json.nodes[channel.target.node].name;
    chans[`${name}.${channel.target.path}`]={t:Array.from(readAccessor(glb,sampler.input).values),v:readAccessor(glb,sampler.output).values,w:channel.target.path==='rotation'?4:3};
  }
  const sample=(c,t)=>{
    const n=c.t.length;let i=0;while(i<n-2&&c.t[i+1]<=t)i++;
    const ta=c.t[i],tb=c.t[Math.min(n-1,i+1)],u=tb>ta?Math.max(0,Math.min(1,(t-ta)/(tb-ta))):0,w=c.w,a=Array.from(c.v.slice(i*w,i*w+w)),b=Array.from(c.v.slice(Math.min(n-1,i+1)*w,Math.min(n-1,i+1)*w+w));
    if(w===3)return a.map((x,k)=>x+(b[k]-x)*u);
    let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];const sgn=d<0?-1:1;d=Math.abs(d);
    let q;if(d>.9995)q=a.map((x,k)=>x+(sgn*b[k]-x)*u);else{const th=Math.acos(d),sa=Math.sin((1-u)*th)/Math.sin(th),sb=Math.sin(u*th)/Math.sin(th);q=a.map((x,k)=>x*sa+sgn*b[k]*sb);}
    const l=Math.hypot(...q)||1;return q.map(x=>x/l);
  };
  const core=m.coreRange||{start:0,end:animation.samplers.length?Math.max(...animation.samplers.map(sm=>readAccessor(glb,sm.input).values.at(-1))):1};
  const t0=core.start,t1=core.end,duration=round(t1-t0,4),bones=json.nodes.slice(0,18).map(n=>n.name);
  const frames=Math.max(2,Math.round(duration*30)+1);
  const keyframes=[];
  for(let f=0;f<frames;f++){
    const t=t0+(t1-t0)*f/(frames-1),rotations={};
    for(const bone of bones){const c=chans[`${bone}.rotation`];rotations[bone]=c?sample(c,t).map(v=>round(v)):[0,0,0,1];}
    const h=chans['Hips.translation'];
    keyframes.push({time:round(f/(frames-1),5),rotations,hipsOffsetMeters:h?sample(h,t).map((v,k)=>round(v-REST_HIPS[k])):[0,0,0]});
  }
  const shift=e=>round(e-t0,4),inCore=e=>e>=t0-.02&&e<=t1+.02;
  const named=(m.events||[]).filter(e=>e.type!=='plant'&&inCore(e.time));
  const events=named.map(e=>({timeSeconds:shift(e.time),name:'visual_'+e.type,bone:e.bone,domain:'presentation'}));
  const ballContacts=named.filter(e=>['receive','release','contact'].includes(e.type)).map(e=>({time:round(Math.max(0,Math.min(1,(e.time-t0)/duration)),6),atSeconds:shift(e.time),event:'visual_contact',kind:e.type,bone:e.bone}));
  let maxKeyDeg=0;for(let i=1;i<keyframes.length;i++){const dtk=(keyframes[i].time-keyframes[i-1].time)*duration;for(const b of bones)maxKeyDeg=Math.max(maxKeyDeg,ang(keyframes[i-1].rotations[b],keyframes[i].rotations[b])/(dtk*30||1));}
  states[id]={clip:id,group:m.role==='keeper'?'keeper':'action',category:m.category,durationSeconds:duration,loop:Boolean(m.originalLoop??m.loop),maxKeyDeg:round(maxKeyDeg,1),timeScale:round(meta.metadata.timeScale||1,4),events,ballContacts,keyframes};
}
await mkdir(out,{recursive:true});
await writeFile(new URL('clips.json',out),JSON.stringify({schemaVersion:1,source:'design/motion-fix-v12 (repaired soccer-v11), core range only',fps:30,states}));
for(const [n,s] of Object.entries(states))console.log(n.padEnd(34),s.durationSeconds.toFixed(2)+'s',s.keyframes.length+'k',s.maxKeyDeg+'deg/key',s.ballContacts.map(c=>c.kind+'@'+c.atSeconds).join(' '));
