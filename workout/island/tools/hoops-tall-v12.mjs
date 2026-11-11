// Builds assets/hoops-tall/motion-v12.json from the repaired Codex clips (design/motion-fix-v12, PR #377, admitted clips only):
// the same shape as motion.json (30 Hz int16 quaternions on the canonical 18 bones, hips offsets from the profile rest, ball tracks,
// events, reference speed) so decodeTallPack / buildTallClips play it unchanged. Differences from the v9 pack:
//  - every clip is trimmed to its coreRange (the repair adds 0.35 s idle handles before and after; the chooser's times start at the action);
//  - the repair retimes clips (timeScale up to 2.5x): events come from the catalog in runtime seconds, and refSpeed is measured from the
//    Root track over the core (travel / core seconds), so the playback rate = speed / refSpeed keeps the feet on the floor;
//  - the dunk lift is already calibrated inside the GLB (calibration.jumpScale applied once), so jumpScale is null;
//  - the ball track is the repaired independent one (scene-level Ball node) made root-relative.
// One body's clips (guard) serve all three profiles: the hips rest differs per profile and the game adds it (buildTallClips).
// Usage: node workout/island/tools/hoops-tall-v12.mjs <motion-fix-v12 dir> [out.json] [profile=guard]
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=process.argv[2],profile=process.argv[4]||'guard';
if(!dir){console.error('usage: node hoops-tall-v12.mjs <motion-fix-v12 dir> [out.json] [profile]');process.exit(1);}
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.argv[3]||path.join(root,'assets/hoops-tall/motion-v12.json');
const base=JSON.parse(readFileSync(path.join(root,'assets/hoops-tall/motion.json'),'utf8'));
const BONES=base.bones;
const catalog=JSON.parse(readFileSync(path.join(dir,'runtime/catalog.json'),'utf8')).clips.filter(c=>c.library==='hoops-tall-v1'&&c.profile===profile&&c.id.startsWith(profile+'/v9/'));
const block=new Set(JSON.parse(readFileSync(path.join(dir,'blocklist.json'),'utf8')).clips.map(c=>c.key));
const b64=a=>Buffer.from(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).toString('base64');
function glb(p){const d=readFileSync(p),n=d.readUInt32LE(12),json=JSON.parse(d.subarray(20,20+n).toString()),off=20+n,len=d.readUInt32LE(off);return {json,bin:d.subarray(off+8,off+8+len)};}
function accessor(g,i){const a=g.json.accessors[i],v=g.json.bufferViews[a.bufferView],comp={SCALAR:1,VEC3:3,VEC4:4}[a.type],o=(v.byteOffset||0)+(a.byteOffset||0);return {arr:new Float32Array(g.bin.buffer.slice(g.bin.byteOffset+o,g.bin.byteOffset+o+a.count*comp*4)),comp,count:a.count};}
const slerp=(a,b,t)=>{let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];if(d<0){b=b.map(v=>-v);d=-d;}if(d>.9995){const r=a.map((v,i)=>v+(b[i]-v)*t),n=Math.hypot(...r);return r.map(v=>v/n);}const h=Math.acos(d),s=Math.sin(h);return a.map((v,i)=>(v*Math.sin((1-t)*h)+b[i]*Math.sin(t*h))/s);};
function sampler(tr){return time=>{const n=tr.t.length;if(time<=tr.t[0])return Array.from(tr.v.slice(0,tr.comp));if(time>=tr.t[n-1])return Array.from(tr.v.slice((n-1)*tr.comp,n*tr.comp));let i=0;while(tr.t[i+1]<time)i++;const k=(time-tr.t[i])/(tr.t[i+1]-tr.t[i]),a=Array.from(tr.v.slice(i*tr.comp,(i+1)*tr.comp)),b=Array.from(tr.v.slice((i+1)*tr.comp,(i+2)*tr.comp));return tr.comp===4?slerp(a,b,k):a.map((v,j)=>v+(b[j]-v)*k);};}
const pack={version:1,fps:30,bones:BONES,profiles:base.profiles,clips:{},source:'design/motion-fix-v12 (Codex, PR #377), '+profile+' clips trimmed to coreRange'};
const report=[];
for(const c of catalog){
 if(block.has(c.key))continue;
 const id=c.id.split('/').pop(),m=c.metadata,g=glb(path.join(dir,c.animation)),names=g.json.nodes.map(n=>n.name),anim=g.json.animations[0],tracks={};
 for(const ch of anim.channels){const s=anim.samplers[ch.sampler],t=accessor(g,s.input),o=accessor(g,s.output);tracks[names[ch.target.node]+'.'+ch.target.path]=sampler({t:t.arr,v:o.arr,comp:o.comp});}
 const hipsRest=g.json.nodes.find(n=>n.name==='Hips').translation||[0,0,0];
 const core=m.coreRange||{start:0,end:c.duration},start=core.start,end=Math.min(c.duration,core.end),dur=end-start,n=Math.max(2,Math.round(dur*30)+1);
 const quat=new Int16Array(n*BONES.length*4),hips=new Int16Array(n*3),ballT=tracks['Ball.translation'],rootT=tracks['Root.translation'],ball=ballT?new Int16Array(n*3):null;
 for(let f=0;f<n;f++){
  const time=start+Math.min(dur,f/30);
  BONES.forEach((b,bi)=>{const q=tracks[b+'.rotation']?tracks[b+'.rotation'](time):[0,0,0,1];for(let j=0;j<4;j++)quat[(f*BONES.length+bi)*4+j]=Math.round(q[j]*32767);});
  const hp=tracks['Hips.translation']?tracks['Hips.translation'](time):hipsRest;for(let j=0;j<3;j++)hips[f*3+j]=Math.round((hp[j]-hipsRest[j])*10000);
  if(ball){const bp=ballT(time),rp=rootT?rootT(time):[0,0,0];for(let j=0;j<3;j++)ball[f*3+j]=Math.round((bp[j]-rp[j])*10000);}
 }
 // reference speed: the Root track over the core (metres per runtime second); gaits without a Root track keep the authored speed / timeScale
 const r0=rootT?rootT(start):[0,0,0],r1=rootT?rootT(end):[0,0,0],travel=Math.hypot(r1[0]-r0[0],r1[2]-r0[2]);
 const refSpeed=travel>.2?travel/dur:(m.speed?m.speed/(m.timeScale||1):0);
 const events={};for(const e of m.events||[]){const at=(e.atSeconds??e.time)-start;if(at<-1e-3||at>dur+1e-3)continue;(events[e.name]||(events[e.name]=[])).push(+Math.max(0,at).toFixed(4));}
 const clip={duration:+dur.toFixed(4),frames:n,loop:!!(m.originalLoop??m.loop),kind:m.kind,events,refSpeed:+refSpeed.toFixed(3),rootEnd:[r1[0]-r0[0],r1[1]-r0[1],r1[2]-r0[2]].map(v=>+v.toFixed(3)),quat:b64(quat),hips:b64(hips),ball:ball?b64(ball):null,jumpScale:null,score:c.score,timeScale:+(m.timeScale||1).toFixed(3)};
 pack.clips[id]=clip;report.push([id,c.score,clip.duration,clip.refSpeed,Object.keys(events).join('|'),ball?'ball':'']);
}
// the chooser needs these; anything missing stays as the v9 clip (the game merges the packs)
const required=['idle_ready','idle_ready_ball','walk','jog','run','sprint','dribble_walk_right','dribble_right','jog_ball','run_ball','sprint_ball','defensive_stance','defensive_slide_left','defensive_slide_right','closeout','layup_left','layup_right','dunk_one_hand','dunk_two_hands','jump_shot','three_point','free_throw','get_up_front','block_two_hands','rebound_jump','steal_poke','dribble_crossover_left','dribble_crossover_right','pivot_reverse_left','pivot_reverse_right'];
const missing=required.filter(r=>!pack.clips[r]);
writeFileSync(out,JSON.stringify(pack));
console.log('clips',Object.keys(pack.clips).length,'missing required:',missing.join(',')||'none','->',out,(JSON.stringify(pack).length/1024).toFixed(0)+' KB');
console.log(report.map(r=>r.join('  ')).join('\n'));
