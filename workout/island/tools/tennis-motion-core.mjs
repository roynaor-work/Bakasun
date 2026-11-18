/* Builds assets/tennis-motion-v1/core.json from the repaired Codex clips (design/motion-fix-v12, PR #377), admitted clips only.
 * Usage: node tools/tennis-motion-core.mjs <path to motion-fix-v12 folder> [out.json]
 * Each clip is read from runtime/tennis-v1/<id>.motion-fix-v12.glb (per-bone rotation tracks + Hips translation), resampled to 30 Hz;
 * events come from runtime/catalog.json. Clips that were blocked or not admitted (run_right, ready_idle, ...) are not included: the game keeps its own pose for them. */
import {readFileSync,writeFileSync} from 'node:fs';
const WANT=['run_forward','run_backward','run_left','forehand_flat_short','forehand_flat_long','backhand_flat_short','backhand_flat_long','serve_toss','serve_trophy','serve_follow_through'];
const dir=process.argv[2],out=process.argv[3]||new URL('../assets/tennis-motion-v1/core.json',import.meta.url).pathname;
const catalog=JSON.parse(readFileSync(dir+'/runtime/catalog.json','utf8')).clips.filter(c=>c.library==='tennis-v1'),block=new Set(JSON.parse(readFileSync(dir+'/blocklist.json','utf8')).clips.map(c=>c.key));
function glb(path){const d=readFileSync(path),n=d.readUInt32LE(12),json=JSON.parse(d.subarray(20,20+n).toString()),off=20+n,len=d.readUInt32LE(off);return {json,bin:d.subarray(off+8,off+8+len)};}
function accessor(g,i){const a=g.json.accessors[i],v=g.json.bufferViews[a.bufferView],comp={SCALAR:1,VEC3:3,VEC4:4}[a.type],o=(v.byteOffset||0)+(a.byteOffset||0),arr=new Float32Array(g.bin.buffer.slice(g.bin.byteOffset+o,g.bin.byteOffset+o+a.count*comp*4));return {arr,comp,count:a.count};}
const slerp=(a,b,t)=>{let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];if(d<0){b=b.map(v=>-v);d=-d;}if(d>.9995){const r=a.map((v,i)=>v+(b[i]-v)*t),n=Math.hypot(...r);return r.map(v=>v/n);}const h=Math.acos(d),s=Math.sin(h);return a.map((v,i)=>(v*Math.sin((1-t)*h)+b[i]*Math.sin(t*h))/s);};
const round=v=>v.map(x=>Math.round(x*1e4)/1e4);
// the canonical 18-bone skeleton is the one already in core.json (same in every package clip)
const bonesOf=JSON.parse(readFileSync(out,'utf8')).bones.map(b=>({name:b.name,parent:b.parent,restTranslationMeters:b.rest}));
const result={fps:30,bones:bonesOf.map(b=>({name:b.name,parent:b.parent,rest:b.restTranslationMeters})),clips:{}};
for(const id of WANT){
 const entry=catalog.find(c=>c.id===id);if(!entry||block.has('tennis-v1/'+id))continue;
 const g=glb(`${dir}/${entry.animation}`),names=g.json.nodes.map(n=>n.name),anim=g.json.animations[0],tracks={};
 for(const c of anim.channels){const s=anim.samplers[c.sampler],t=accessor(g,s.input),o=accessor(g,s.output),name=names[c.target.node];if(c.target.path==='rotation'||(c.target.path==='translation'&&name==='Hips'))tracks[name+'.'+c.target.path]={t:t.arr,v:o.arr,comp:o.comp};}
 const sampleTrack=(tr,time)=>{const n=tr.t.length;if(time<=tr.t[0])return Array.from(tr.v.slice(0,tr.comp));if(time>=tr.t[n-1])return Array.from(tr.v.slice((n-1)*tr.comp,n*tr.comp));let i=0;while(tr.t[i+1]<time)i++;const k=(time-tr.t[i])/(tr.t[i+1]-tr.t[i]),a=Array.from(tr.v.slice(i*tr.comp,(i+1)*tr.comp)),b=Array.from(tr.v.slice((i+1)*tr.comp,(i+2)*tr.comp));return tr.comp===4?slerp(a,b,k):a.map((x,j)=>x+(b[j]-x)*k);};
 const dur=entry.duration,count=Math.round(dur*30),frames=[];
 for(let f=0;f<=count;f++){const time=Math.min(dur,f/30),rot={};
  for(const b of bonesOf){const tr=tracks[b.name+'.rotation'];rot[b.name]=round(tr?sampleTrack(tr,time):[0,0,0,1]);}
  const hipsTrack=tracks['Hips.translation'],hips=hipsTrack?sampleTrack(hipsTrack,time):[0,.86,0];
  frames.push({rot,hips:round([hips[0],hips[1]-.86,hips[2]])});}
 result.clips[id]={dur,loop:Boolean(entry.metadata.loop),events:(entry.metadata.events||[]).map(e=>({name:e.name,at:Math.round(e.atSeconds*1e4)/1e4})),frames};
}
writeFileSync(out,JSON.stringify(result));console.log(Object.keys(result.clips).join(', '),'->',out);
