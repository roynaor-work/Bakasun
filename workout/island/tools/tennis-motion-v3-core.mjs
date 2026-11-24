/* Builds assets/tennis-motion-v3/core.json from the Codex library design/tennis-motion-v3 (CC0): the clips the game plays, as pose data only.
 * Usage: node tools/tennis-motion-v3-core.mjs [path to design/tennis-motion-v3] [out.json]
 * The GLB is an animation library on the canonical 18-bone skeleton of tennis-motion-v1/v2 (CUBICSPLINE rotations and Hips translation, keys at 30 Hz).
 * Only the key values are kept (same format as assets/tennis-motion-v1/core.json: per frame a quaternion per bone and the Hips offset from rest),
 * so the runtime file carries no mesh, no skin and no triangles. Clips with no game moment yet (fall, get up, handshake, the serve lesson,
 * the change of direction) stay in the design folder. */
import {readFileSync,writeFileSync} from 'node:fs';
const WANT=['volley_low','volley_high','half_volley','lob','overhead_backward','serve_return_aggressive','defensive_slice','lateral_crossover_run','slide_to_ball','point_win','childlike_joy','point_disappointment'];
const dir=process.argv[2]||new URL('../design/tennis-motion-v3',import.meta.url).pathname,out=process.argv[3]||new URL('../assets/tennis-motion-v3/core.json',import.meta.url).pathname;
const catalog=JSON.parse(readFileSync(dir+'/catalog.json','utf8'));
const d=readFileSync(`${dir}/${catalog.asset}`),n=d.readUInt32LE(12),json=JSON.parse(d.subarray(20,20+n).toString()),off=20+n,bin=d.subarray(off+8,off+8+d.readUInt32LE(off));
function accessor(i){const a=json.accessors[i],v=json.bufferViews[a.bufferView],comp={SCALAR:1,VEC3:3,VEC4:4}[a.type],o=(v.byteOffset||0)+(a.byteOffset||0);if(v.byteStride&&v.byteStride!==comp*4)throw new Error('interleaved accessor');return {arr:new Float32Array(bin.buffer.slice(bin.byteOffset+o,bin.byteOffset+o+a.count*comp*4)),comp,count:a.count};}
const slerp=(a,b,t)=>{let dt=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];if(dt<0){b=b.map(v=>-v);dt=-dt;}if(dt>.9995){const r=a.map((v,i)=>v+(b[i]-v)*t),m=Math.hypot(...r);return r.map(v=>v/m);}const h=Math.acos(dt),s=Math.sin(h);return a.map((v,i)=>(v*Math.sin((1-t)*h)+b[i]*Math.sin(t*h))/s);};
const round=v=>v.map(x=>Math.round(x*1e4)/1e4),names=json.nodes.map(node=>node.name),bones=catalog.skeleton.map(b=>({name:b.name,parent:b.parent,rest:b.rest}));
const result={fps:30,library:'tennis-motion-v3',bones,clips:{}};
for(const id of WANT){
 const entry=catalog.clips.find(c=>c.id===id),anim=json.animations.find(a=>a.name===id);if(!entry||!anim)throw new Error('missing clip '+id);
 const tracks={};
 for(const c of anim.channels){const s=anim.samplers[c.sampler],name=names[c.target.node];if(!(c.target.path==='rotation'||(c.target.path==='translation'&&name==='Hips')))continue;
  const t=accessor(s.input),o=accessor(s.output),cubic=s.interpolation==='CUBICSPLINE',v=new Float32Array(t.count*o.comp);
  for(let k=0;k<t.count;k++)for(let j=0;j<o.comp;j++)v[k*o.comp+j]=o.arr[(cubic?k*3+1:k)*o.comp+j];/* the key value: a 30 Hz resample needs no tangents */
  tracks[name+'.'+c.target.path]={t:t.arr,v,comp:o.comp};}
 const sampleTrack=(tr,time)=>{const m=tr.t.length;if(time<=tr.t[0])return Array.from(tr.v.slice(0,tr.comp));if(time>=tr.t[m-1])return Array.from(tr.v.slice((m-1)*tr.comp,m*tr.comp));let i=0;while(tr.t[i+1]<time)i++;const k=(time-tr.t[i])/(tr.t[i+1]-tr.t[i]),a=Array.from(tr.v.slice(i*tr.comp,(i+1)*tr.comp)),b=Array.from(tr.v.slice((i+1)*tr.comp,(i+2)*tr.comp));if(tr.comp===4){const q=slerp(a,b,k),m2=Math.hypot(...q);return q.map(x=>x/m2);}return a.map((x,j)=>x+(b[j]-x)*k);};
 const dur=entry.durationSeconds,count=Math.round(dur*30),frames=[];
 for(let f=0;f<=count;f++){const time=Math.min(dur,f/30),rot={};
  for(const b of bones){const tr=tracks[b.name+'.rotation'];rot[b.name]=round(tr?sampleTrack(tr,time):[0,0,0,1]);}
  const hipsTrack=tracks['Hips.translation'],hips=hipsTrack?sampleTrack(hipsTrack,time):[0,.86,0];
  frames.push({rot,hips:round([hips[0],hips[1]-.86,hips[2]])});}
 const contact=entry.events.find(e=>e.type==='contact');
 result.clips[id]={dur:Math.round(dur*1e4)/1e4,loop:false,events:contact?[{name:'racket_contact',at:Math.round(contact.time*1e4)/1e4}]:[],frames};
}
writeFileSync(out,JSON.stringify(result));console.log(Object.keys(result.clips).join(', '),'->',out,readFileSync(out).length,'bytes');
