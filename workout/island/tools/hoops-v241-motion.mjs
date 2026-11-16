// Basketball v24.1 motion evidence (node, no browser): forward kinematics of a clip pack on the canonical 18-bone rig (CANON_REST) to
// find each gait's footfall phase (where the left sole is lowest, i.e. its mid-stance) and the sole's height over the cycle. Used to line the
// hoops-motion-v13 gaits up with the v12 gaits they share one phase with (hoops-tall chooseTallMotion: walk/jog/run/sprint and the dribble
// gaits keep one gait phase), and to measure the v13 pack that the game builds (minigames/hoops-motion-v13.mjs).
// Usage: node workout/island/tools/hoops-v241-motion.mjs [v12|v13|both] [--json=out.json]
import {readFile,writeFile} from 'node:fs/promises';
import {decodeTallPack,TALL_BONES} from '../minigames/hoops-tall.mjs';
import {CANON_REST} from '../minigames/athlete-body.mjs';
import {V22_LEG_RATIO} from '../minigames/athlete-body-v22.mjs';

const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rot=(q,v)=>{const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];};
const parentOf=Object.fromEntries(CANON_REST.map(b=>[b.name,b.parent])),restOf=Object.fromEntries(CANON_REST.map(b=>[b.name,b.restTranslationMeters]));
/** World joint positions and rotations of frame `f` of a decoded clip; hips offset scaled by `hipsScale` (to canonical metres). */
export function poseAt(clip,f,{hipsScale=1}={}){
  const world={},wq={};
  TALL_BONES.forEach((name,bi)=>{
    const q=Array.from(clip.quat.slice((f*TALL_BONES.length+bi)*4,(f*TALL_BONES.length+bi)*4+4)),p=parentOf[name];
    let local=restOf[name];if(name==='Hips')local=[local[0]+clip.hips[f*3]*hipsScale,local[1]+clip.hips[f*3+1]*hipsScale,local[2]+clip.hips[f*3+2]*hipsScale];
    if(!p){world[name]=local;wq[name]=q;return;}
    const r=rot(wq[p],local);world[name]=[world[p][0]+r[0],world[p][1]+r[1],world[p][2]+r[2]];wq[name]=qmul(wq[p],q);
  });
  return {world,wq};
}
/** The sole point of a foot (the QA tool's support point: 8 cm below the ankle along the foot bone). */
export const sole=(pose,side)=>{const o=rot(pose.wq[side+'Foot'],[0,-.08,0]),a=pose.world[side+'Foot'];return [a[0]+o[0],a[1]+o[1],a[2]+o[2]];};
/** Footfall summary of a looped clip: phase (0..1) of each sole's lowest point, the soles' height range (canonical metres, floor = 0). */
export function footfall(clip,{hipsScale=1}={}){
  const n=clip.loop?clip.frames-1:clip.frames,ys={Left:[],Right:[]};
  for(let f=0;f<n;f++){const p=poseAt(clip,f,{hipsScale});for(const s of ['Left','Right'])ys[s].push(sole(p,s)[1]);}
  const out={frames:n};
  for(const s of ['Left','Right']){const v=ys[s];let k=0;v.forEach((y,i)=>{if(y<v[k])k=i;});out[s]={lowPhase:+(k/n).toFixed(3),min:+Math.min(...v).toFixed(3),max:+Math.max(...v).toFixed(3)};}
  return out;
}

/** `--build=<design/hoops-motion-v13/runtime/motion.json>`: the runtime copy with only the clips the game plays (V13_CLIPS), byte-identical
 * clip records (no re-encoding), and where they came from. */
async function build(file,root){
  const {createHash}=await import('node:crypto'),{V13_CLIPS,V13_FILE}=await import('../minigames/hoops-motion-v13.mjs');
  const bytes=await readFile(file),json=JSON.parse(bytes),clips={};
  for(const id of V13_CLIPS){if(!json.clips[id])throw Error('missing '+id);clips[id]=json.clips[id];}
  const {clips:_,...head}=json;
  const out={...head,source:{pack:'codex/hoops-motion-v13',commit:'f97bf53b',file:'workout/island/design/hoops-motion-v13/runtime/motion.json',sha256:createHash('sha256').update(bytes).digest('hex'),clips:V13_CLIPS.length+' of '+Object.keys(json.clips).length,license:'CC0-1.0'},clips};
  const dest=new URL('assets/hoops-v241/motion/'+V13_FILE,root);await writeFile(dest,JSON.stringify(out));
  console.log('wrote',dest.pathname,JSON.stringify(out).length,'bytes',V13_CLIPS.join(','));
}

async function main(){
  const which=process.argv[2]||'both',jsonOut=process.argv.find(a=>a.startsWith('--json='))?.slice(7);
  const root=new URL('../',import.meta.url),report={};
  const toBuild=process.argv.find(a=>a.startsWith('--build='))?.slice(8);if(toBuild)return build(toBuild,root);
  const gaits=['idle_ready','walk','jog','run','sprint','dribble_walk_right','jog_ball','run_ball','sprint_ball','idle','dribble_run','dribble_stand'];
  if(which!=='v13'){
    const p=decodeTallPack(JSON.parse(await readFile(new URL('assets/hoops-tall/motion-v12.json',root),'utf8')));report.v12={};
    for(const id of gaits)if(p.clips[id]){report.v12[id]={duration:+p.clips[id].duration.toFixed(3),refSpeed:p.clips[id].refSpeed,...footfall(p.clips[id],{hipsScale:V22_LEG_RATIO.wing})};}
  }
  if(which!=='v12'){
    const file=process.argv.find(a=>a.startsWith('--v13='))?.slice(6)||'assets/hoops-v241/motion/motion-v13.json';
    const p=decodeTallPack(JSON.parse(await readFile(new URL(file,root),'utf8')));report.v13={};
    for(const id of gaits)if(p.clips[id]){report.v13[id]={duration:+p.clips[id].duration.toFixed(3),refSpeed:p.clips[id].refSpeed,...footfall(p.clips[id])};}
  }
  console.log(JSON.stringify(report,null,1));
  if(jsonOut)await writeFile(jsonOut,JSON.stringify(report,null,1));
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
