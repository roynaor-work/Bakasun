/** Codex v9 motion connect: headless measurement (evidence only, no browser). Real rig, the clips the game loads (library + v7 + v8 +
 * Codex v9), the real motion controller at 60 Hz, with the character travelling at the simulated speed. Prints JSON:
 * foot sliding per constant speed (stance foot horizontal speed while planted), pose pops (largest per-frame bone rotation and
 * hips step) over a scripted sequence, and the idle arm angles.
 * Usage: node tools/soccer-codex-motion-measure.mjs [off|v7run]   ("off" = without the Codex clips; "v7run" = Codex walk/jog/idle/brake but the v7 runs) */
import {readFile} from 'node:fs/promises';
const off=process.argv[2]==='off',v7run=process.argv[2]==='v7run';
globalThis.location={search:v7run?'?soccerRunV9=0':''};
const T=await import('../vendor/three.module.js');
const {composeSoccerRestartMotion}=await import('../minigames/soccer-restart-motion.mjs');
const {compileSoccerDesignClips,createSoccerDesignMotion}=await import('../minigames/soccer-design-character.mjs');
const read=async f=>JSON.parse(await readFile(new URL('../design/'+f,import.meta.url),'utf8'));
const base=await read('motion/soccer.json'),packs=await Promise.all(['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('motion2/soccer/'+p+'.json')));
const rig=await read('characters/rig.json'),map=await read('viewer/retarget-map.json');
const config=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;
const v7=await readFile(new URL('../assets/soccer-v7/clips.json',import.meta.url),'utf8').then(JSON.parse),v8=await readFile(new URL('../assets/soccer-v8/clips.json',import.meta.url),'utf8').then(JSON.parse),v9=await readFile(new URL('../assets/soccer-v9/clips.json',import.meta.url),'utf8').then(JSON.parse);
const {soccerV8States}=await import('../minigames/soccer-v8.mjs'),{soccerCodexStates}=await import('../minigames/soccer-codex-motion.mjs');
const library=composeSoccerRestartMotion(base,...packs);
const data={...library,states:{...library.states,...v7.states,...soccerV8States(v8),...(off?{}:soccerCodexStates(v9))}},clips=compileSoccerDesignClips(data,rig,map);
const deg=r=>r*180/Math.PI,dt=1/60;
function make(){
  const bones={};let root;
  for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else root=b;}
  const group=new T.Group();group.add(root);const mixer=new T.AnimationMixer(group);
  return {bones,group,motion:createSoccerDesignMotion(mixer,clips,data,config)};
}
const world=(bones,n)=>bones[n].getWorldPosition(new T.Vector3());
function measure(rt){
  rt.group.updateMatrixWorld(true);const b=rt.bones,W=n=>world(b,n);
  const arm=side=>{const u=W(side+'ForeArm').sub(W(side+'Arm')),f=W(side+'Hand').sub(W(side+'ForeArm'));return {abd:deg(Math.atan2((side==='Left'?1:-1)*u.x,-u.y)),fwd:deg(Math.atan2(u.z,-u.y)),flex:deg(u.angleTo(f))};};
  const a=W('Hips'),n=W('Neck'),ab=n.clone().sub(a),L=ab.length();
  const dist=v=>{const t=Math.max(0,Math.min(1,v.clone().sub(a).dot(ab)/(L*L)));return v.distanceTo(a.clone().add(ab.clone().multiplyScalar(t)));};
  const inside=['LeftHand','RightHand','LeftForeArm','RightForeArm','LeftFoot','RightFoot'].filter(k=>dist(W(k))<.07);
  const l=arm('Left'),r=arm('Right');return {insideNames:inside.join('+'),abd:Math.max(l.abd,r.abd),flex:Math.min(l.flex,r.flex),fwd:Math.max(Math.abs(l.fwd),Math.abs(r.fwd)),hipsY:a.y,inside:inside.length};
}

const mk=(over={})=>({id:0,x:0,z:0,vx:0,vz:0,fx:0,fz:1,kickTime:0,stealTime:0,slideKind:'straight',slideTime:0,recover:0,slideWon:false,...over});
const S=(mode='attack')=>({ball:{owner:null,flight:null,y:.11},mode,event:null});
const FEET=['LeftFoot','RightFoot'];
/** Run one scripted sequence; the character group travels forward (+Z) at p's speed so planted feet are measurable. */
function play(script){
  const rt=make(),p=mk(),s=S(),rows=[];let prev=null,z=0;
  for(const [seconds,speed,mode] of script){
    for(let i=0;i<Math.round(seconds/dt);i++){
      p.vx=0;p.vz=speed;p.fz=1;z+=speed*dt;rt.group.position.z=z;
      const animation={mode:mode||(speed>.2?'run':'idle')};rt.motion.update(p,s,animation,dt);rt.group.updateMatrixWorld(true);
      const row={state:rt.motion.state,speed,feet:FEET.map(n=>{const w=world(rt.bones,n);return {x:w.x,y:w.y,z:w.z};}),q:Object.fromEntries(Object.keys(rt.bones).map(n=>[n,rt.bones[n].quaternion.clone()])),hips:world(rt.bones,'Hips').y};
      row.pop=prev?Math.max(...Object.keys(rt.bones).map(n=>deg(prev.q[n].angleTo(row.q[n])))):0;row.hipsStep=prev?Math.abs(row.hips-prev.hips):0;
      if(prev){const k=row.feet[0].y<=row.feet[1].y?0:1;row.slide=row.feet[k].y<.12&&prev.feet[k].y<.12&&prev.low===k?[Math.hypot(row.feet[k].x-prev.feet[k].x,row.feet[k].z-prev.feet[k].z)/dt]:null;}
      row.low=row.feet[0].y<=row.feet[1].y?0:1;
      rows.push(row);prev=row;
    }
  }
  return rows;
}
const pct=(a,f)=>{const v=[...a].sort((x,y)=>x-y);return v.length?v[Math.min(v.length-1,Math.floor(v.length*f))]:null;};
const r2=v=>v===null||v===undefined?null:+v.toFixed(2);
/** Stride match: the travel speed the playing clip implies (its own speedMps x the playback rate the controller applies) against the
 * simulated speed. A mismatch is the part of foot sliding the choice of clip and rate controls; the geometric slip of a clip is
 * Codex's own measurement (design/soccer-motion-v9/REPORT.md). */
function strideMatch(speed){
  const rt=make(),p=mk(),s=S();p.vz=speed;p.fz=1;
  for(let i=0;i<150;i++)rt.motion.update(p,s,{mode:'run'},dt);
  const state=rt.motion.state,clip=data.states[state],rate=rt.motion.actions[state]?.getEffectiveTimeScale?.()??1,implied=(clip?.speedMps||0)*rate;
  return {speed,state,clipSpeedMps:clip?.speedMps??null,rate:r2(rate),impliedMps:r2(implied),mismatchPct:clip?.speedMps?r2(Math.abs(implied-speed)/speed*100):null};
}

/** What the runs look like in numbers: trunk lean, elbow flexion range, hips bob, step rate, and the playback rate the controller applies. */
function runPose(speed){
  const rt=make(),p=mk(),s=S();p.vz=speed;p.fz=1;const T2=T;const rows=[];
  for(let i=0;i<240;i++){rt.motion.update(p,s,{mode:'run'},dt);if(i<90)continue;rt.group.updateMatrixWorld(true);
    const W=n=>world(rt.bones,n),hips=W('Hips'),neck=W('Neck'),up=neck.clone().sub(hips);
    const flex=['Left','Right'].map(side=>{const u=W(side+'ForeArm').sub(W(side+'Arm')),f=W(side+'Hand').sub(W(side+'ForeArm'));return deg(u.angleTo(f));});
    rows.push({lean:deg(Math.atan2(up.z,up.y)),flexMin:Math.min(...flex),flexMax:Math.max(...flex),hipsY:hips.y});}
  const state=rt.motion.state,clip=data.states[state],rate=rt.motion.actions[state]?.getEffectiveTimeScale?.()??1;
  return {speed,state,rate:r2(rate),stepsPerSecond:r2(2/(clip.durationSeconds/rate)),leanDeg:r2(rows.reduce((a,r)=>a+r.lean,0)/rows.length),elbowFlexMinDeg:r2(Math.min(...rows.map(r=>r.flexMin))),elbowFlexMaxDeg:r2(Math.max(...rows.map(r=>r.flexMax))),hipsBobCm:r2((Math.max(...rows.map(r=>r.hipsY))-Math.min(...rows.map(r=>r.hipsY)))*100)};
}
const SEQ=[[1.5,0],[2,1],[2,2.6],[2,4.5],[2,6.5],[1.2,0],[1.5,2.6],[1.2,0]];
const seq=play(SEQ),pops=seq.map(r=>r.pop),steps=seq.map(r=>r.hipsStep);
const states=[];for(const r of seq)if(!states.length||states.at(-1)!==r.state)states.push(r.state);
function idleArms(){const rt=make(),p=mk(),s=S();let rows=[];const seen={};for(let i=0;i<1500;i++){rt.motion.update(p,s,{mode:'idle'},dt);if(i>60){const m=measure(rt);rows.push(m);const k=rt.motion.state;(seen[k]||(seen[k]=[])).push(m);}}
  return Object.fromEntries(Object.entries(seen).map(([k,v])=>[k,{abdMax:+Math.max(...v.map(r=>r.abd)).toFixed(1),flexMin:+Math.min(...v.map(r=>r.flex)).toFixed(1)}]));}
const out={mode:off?'before (no Codex v9 clips)':v7run?'Codex walk/jog/idle/brake, v7 runs':'Codex clips incl. v9 run and sprint',
  strideMatch:[.8,1,1.3,1.6,2,2.4,2.8,3.2,4,4.5,5.4,6.5].map(strideMatch),
  sequence:{states,popMaxDeg:r2(Math.max(...pops)),popP99Deg:r2(pct(pops,.99)),hipsStepMaxM:r2(Math.max(...steps)),hipsStepP99M:r2(pct(steps,.99))},
  runs:[3.2,4.2,5.3,6,6.5].map(runPose),
  idle:idleArms()};
console.log(JSON.stringify(out,null,1));
if(process.argv.includes('--pops')){const top=seq.map((r,i)=>({i,t:+(i*dt).toFixed(2),state:r.state,pop:+r.pop.toFixed(1)})).sort((a,b)=>b.pop-a.pop).slice(0,8);console.error(JSON.stringify(top));}
