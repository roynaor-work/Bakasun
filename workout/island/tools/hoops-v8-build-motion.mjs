// Builds assets/hoops-v8/motion.json from the GPT hoops-motion-v8 package (design/hoops-motion-v8/runtime/keyframes).
// The design/ folder is not published, so the game loads this compact file instead of the package's 15 GLB previews
// (each GLB carries a preview athlete: 230 KB). Only the clips the game plays are kept. Rotations are resampled to 60 Hz
// (the package bakes 120 Hz with eased keys) and stored as int16 quaternions (1/32767 resolution, base64).
// Usage: node workout/island/tools/hoops-v8-build-motion.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const src=path.join(root,'design/hoops-motion-v8/runtime/keyframes'),out=path.join(root,'assets/hoops-v8/motion.json');
export const V8_CLIPS=['pass_chest','pass_bounce','pass_overhead','pass_side','pass_jump','receive_two_hands','receive_moving','steal','block','dribble_idle','dribble_run'];
// clips whose ball track is stored too (root-local metres, 60 Hz): the dribbles, so the ball in the hand follows the authored bounce
export const BALL_CLIPS=['dribble_idle','dribble_run'];
export const BONES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const FPS=60;
function slerp(a,b,t){let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3],s=1;if(d<0){d=-d;s=-1;}
 let k0,k1;if(d>.9995){k0=1-t;k1=t*s;}else{const th=Math.acos(d),sn=Math.sin(th);k0=Math.sin((1-t)*th)/sn;k1=Math.sin(t*th)/sn*s;}
 const q=[0,1,2,3].map(i=>a[i]*k0+b[i]*k1),n=Math.hypot(...q)||1;return q.map(v=>v/n);}
const b64=(arr)=>Buffer.from(new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength)).toString('base64');
const pack={version:2,fps:FPS,bones:BONES,clips:{}};
for(const id of V8_CLIPS){
 const d=JSON.parse(gunzipSync(readFileSync(path.join(src,id+'.json.gz')))),dur=d.durationSeconds,k=d.keyframes;
 const frames=Math.round(dur*FPS)+1,quat=new Int16Array(frames*BONES.length*4),hips=new Int16Array(frames*3);
 let j=0;
 for(let f=0;f<frames;f++){
  const t=Math.min(1,f/FPS/dur);while(j<k.length-2&&k[j+1].time<=t)j++;
  const a=k[j],b=k[Math.min(k.length-1,j+1)],u=b.time>a.time?Math.min(1,Math.max(0,(t-a.time)/(b.time-a.time))):0;
  BONES.forEach((name,bi)=>{const q=slerp(a.rotations[name],b.rotations[name],u);for(let c=0;c<4;c++)quat[(f*BONES.length+bi)*4+c]=Math.round(q[c]*32767);});
  for(let c=0;c<3;c++)hips[f*3+c]=Math.round((a.hipsOffsetMeters[c]+(b.hipsOffsetMeters[c]-a.hipsOffsetMeters[c])*u)*10000);
 }
 const events={};for(const e of d.events)events[e.name]=e.atSeconds;
 let ball=null;
 if(BALL_CLIPS.includes(id)){const tr=d.ball.trajectory,bp=new Int16Array(frames*3);let jj=0;for(let f=0;f<frames;f++){const t=Math.min(1,f/FPS/dur);while(jj<tr.length-2&&tr[jj+1].time<=t)jj++;const a=tr[jj],b=tr[Math.min(tr.length-1,jj+1)],u=b.time>a.time?Math.min(1,Math.max(0,(t-a.time)/(b.time-a.time))):0;for(let c=0;c<3;c++)bp[f*3+c]=Math.round((a.positionMeters[c]+(b.positionMeters[c]-a.positionMeters[c])*u)*10000);}ball=b64(bp);}
 pack.clips[id]={duration:dur,frames,events,quat:b64(quat),hips:b64(hips),ball,
  support:d.supportWindows.map(w=>({bone:w.effector,start:w.startSeconds,end:w.endSeconds,anchor:w.anchorMeters})),
  release:d.ball?.flightReference?{at:d.ball.flightReference.releaseAtSeconds,position:d.ball.flightReference.releasePositionMeters,velocity:d.ball.flightReference.releaseVelocityMetersPerSecond}:null,
  start:d.startState,end:d.endState};
}
pack.hipsRest=0.86;
writeFileSync(out,JSON.stringify(pack));
console.log('wrote',out,(JSON.stringify(pack).length/1024).toFixed(1)+' KB',V8_CLIPS.length,'clips');
