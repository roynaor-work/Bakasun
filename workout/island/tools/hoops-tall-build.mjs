// Builds assets/hoops-tall/ from the Codex packages (design/hoops-tall-v1: three tall bodies and the 83 v9 clips retargeted to them).
// The design/ folder is not published, so the game loads this compact copy: the three GLBs (no Draco, no WebAssembly) and one motion.json
// with the clips the game plays as 30 Hz int16 quaternions (absolute canonical local rotations: the tall bodies' bind rotations are identity),
// hips offsets, ball tracks of the dribble / gait clips, events, the reference speed of every gait, and the per-body dunk calibration
// (calibrateDunk of the package: the palm clears the 3.05 m rim by 25 cm).
// Usage: node workout/island/tools/hoops-tall-build.mjs
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),pkg=path.join(root,'design/hoops-tall-v1'),out=path.join(root,'assets/hoops-tall');
const {calibrateDunk}=await import(pathToFileURL(path.join(pkg,'runtime/retarget.mjs')).href);
const rig=JSON.parse(readFileSync(path.join(pkg,'rig.json'))),catalog=JSON.parse(readFileSync(path.join(pkg,'catalog.json'))).clips.filter(c=>c.library==='v9');
const BONES=rig.boneNames;
const b64=a=>Buffer.from(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).toString('base64');
const BALL_TRACK=new Set(['dribble_crossover_left','dribble_crossover_right','dribble_between_legs_left','dribble_between_legs_right','dribble_hesitation_left','dribble_hesitation_right','dribble_forward','dribble_walk_left','dribble_walk_right','dribble_left','dribble_right','dribble_backward','jog_ball','run_ball','sprint_ball','walk_ball','brake_ball']);
const pack={version:1,fps:30,bones:BONES,profiles:{},clips:{}};
for(const p of rig.profiles){
 pack.profiles[p.id]={height:p.heightMeters,hips:p.joints.find(j=>j.name==='Hips').translation,palm:p.palmPoint,palms:p.palms||null};
 copyFileSync(path.join(pkg,'runtime',p.id+'.glb'),path.join(out,p.id+'.glb'));
}
for(const c of catalog){
 const d=JSON.parse(gunzipSync(readFileSync(path.join(pkg,c.path)))),k=d.keyframes,n=k.length;
 const quat=new Int16Array(n*BONES.length*4),hips=new Int16Array(n*3);
 k.forEach((f,i)=>{BONES.forEach((b,bi)=>{const q=f.rotations[b]||[0,0,0,1];for(let j=0;j<4;j++)quat[(i*BONES.length+bi)*4+j]=Math.round(q[j]*32767);});for(let j=0;j<3;j++)hips[i*3+j]=Math.round(f.hipsOffsetMeters[j]*10000);});
 const events={};for(const e of d.events||[]){(events[e.name]||(events[e.name]=[])).push(+(e.atSeconds).toFixed(4));}
 const rt=k[n-1].referenceRootTranslationMeters,refSpeed=Math.hypot(rt[0],rt[2])/d.durationSeconds;
 let ball=null;if(BALL_TRACK.has(c.id)){const bp=new Int16Array(n*3);k.forEach((f,i)=>{for(let j=0;j<3;j++)bp[i*3+j]=Math.round(f.ballPositionMeters[j]*10000);});ball=b64(bp);}
 const clip={duration:d.durationSeconds,frames:n,loop:!!d.loop,kind:c.kind,events,refSpeed:+refSpeed.toFixed(3),rootEnd:rt.map(v=>+v.toFixed(3)),quat:b64(quat),hips:b64(hips),ball};
 if(c.id.startsWith('dunk_')){clip.jumpScale={};for(const p of rig.profiles)clip.jumpScale[p.id]=+calibrateDunk({...d,id:c.id},p).jumpScale.toFixed(4);}
 pack.clips[c.id]=clip;
}
writeFileSync(path.join(out,'motion.json'),JSON.stringify(pack));
console.log('clips',Object.keys(pack.clips).length,'motion.json',(JSON.stringify(pack).length/1024).toFixed(0)+' KB');
console.log('dunk calibration',JSON.stringify({one:pack.clips.dunk_one_hand.jumpScale,two:pack.clips.dunk_two_hands.jumpScale}));
