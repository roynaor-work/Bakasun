/** Cut and first-touch transitions in numbers (evidence only, headless): the real controller on the real rig with and without the v10 clips.
 * A run at 4.5 m/s turned 45/90/135/180 degrees the way the simulation turns a player (exponential approach, turnRate 14/s, speed cut by
 * turnDrive), and a pass received at a run and standing. Prints per scenario: the clip that played, its length, the largest per-frame bone
 * rotation (pose pop) and the largest hips step. Usage: node tools/soccer-cut-touch-measure.mjs */
import {readFile} from 'node:fs/promises';
import {soccerV10States,soccerCodexStates} from '../minigames/soccer-codex-motion.mjs';
globalThis.location={search:''};
const root=new URL('../',import.meta.url),read=async f=>JSON.parse(await readFile(new URL(f,root),'utf8'));
async function rig(withV10,all=false){
  
  const T=await import('../vendor/three.module.js');
  const {composeSoccerRestartMotion}=await import('../minigames/soccer-restart-motion.mjs');
  const {compileSoccerDesignClips,createSoccerDesignMotion}=await import('../minigames/soccer-design-character.mjs');
  const {soccerV8States}=await import('../minigames/soccer-v8.mjs');
  const [base,k,l,t,r,map,v7,v8,v9,v10,full]=await Promise.all([read('design/motion/soccer.json'),...['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('design/motion2/soccer/'+p+'.json')),read('design/characters/rig.json'),read('design/viewer/retarget-map.json'),read('assets/soccer-v7/clips.json'),read('assets/soccer-v8/clips.json'),read('assets/soccer-v9/clips.json'),read('assets/soccer-v10/clips.json'),read('data/config.json')]);
  const config=full.minigames.soccer,library=composeSoccerRestartMotion(base,k,l,t);
  const data={...library,states:{...library.states,...v7.states,...soccerV8States(v8),...soccerCodexStates(v9),...(withV10?soccerV10States(v10,all?'?soccerCuts=all':''):{})}},clips=compileSoccerDesignClips(data,r,map);
  const bones={};let top;for(const j of r.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else top=b;}
  const group=new T.Group();group.add(top);const mixer=new T.AnimationMixer(group);
  return {T,bones,motion:createSoccerDesignMotion(mixer,clips,data,config),data};
}

const deg=r=>r*180/Math.PI,dt=1/60,r1=v=>+v.toFixed(1);
const mk=(o={})=>({id:1,x:0,z:0,vx:0,vz:0,fx:0,fz:1,kickTime:0,stealTime:0,slideKind:'straight',slideTime:0,recover:0,slideWon:false,role:'striker',receiveTime:0,...o});
const S=()=>({ball:{owner:null,flight:null,y:.11},mode:'attack',event:null});
function track(rt){let worst={pop:0,state:null,t:0},frames=0;const snap=()=>Object.fromEntries(Object.keys(rt.bones).map(n=>[n,rt.bones[n].quaternion.clone()]));let prev=null,pop=0,step=0,hips=null;
  return {frame(){const q=snap(),h=rt.bones.Hips.position.y;if(prev){for(const n of Object.keys(q)){const a=deg(prev[n].angleTo(q[n]));pop=Math.max(pop,a);if(a>worst.pop)worst={pop:a,bone:n,state:rt.motion.state,frame:frames};}step=Math.max(step,Math.abs(h-hips));}prev=q;hips=h;frames++;},get worst(){return worst;},get pop(){return pop;},get step(){return step;}};}
async function cut(withV10,angle,sign,all=false){
  const rt=await rig(withV10,all),p=mk(),s=S(),tr=track(rt),seen=[];
  const upd=(speed)=>{p.vz=speed;rt.motion.update(p,s,{mode:'run'},dt);tr.frame();if(!seen.length||seen.at(-1).state!==rt.motion.state)seen.push({state:rt.motion.state,t:0});seen.at(-1).t+=dt;};
  for(let i=0;i<90;i++)upd(4.5);
  const target=Math.atan2(p.fx,p.fz)+sign*angle*Math.PI/180;
  for(let i=0;i<150;i++){const cur=Math.atan2(p.fx,p.fz),d=Math.atan2(Math.sin(target-cur),Math.cos(target-cur)),y=cur+d*(1-Math.exp(-14*dt));p.fx=Math.sin(y);p.fz=Math.cos(y);const align=.4+.6*Math.max(0,Math.cos(d));upd(4.5*align);}
  const c=seen.find(x=>/^v10_cut|^turn_/.test(x.state));
  return {angle:sign*angle,clip:c?c.state:null,clipSeconds:c?r1(c.t*100)/100:null,popMaxDeg:r1(tr.pop),worst:{...tr.worst,pop:r1(tr.worst.pop)},hipsStepMaxCm:r1(tr.step*100),path:seen.map(x=>x.state).join(' > ')};
}
async function touch(withV10,running,height){
  const rt=await rig(withV10),p=mk(),s=S(),tr=track(rt),seen=[];
  const upd=(speed,mode='run')=>{p.vz=speed;p.receiveTime=Math.max(0,p.receiveTime-dt);rt.motion.update(p,s,{mode},dt);tr.frame();if(!seen.length||seen.at(-1)!==rt.motion.state)seen.push(rt.motion.state);};
  const speed=running?4:0;for(let i=0;i<90;i++)upd(speed,running?'run':'idle');
  p.receiveTime=.5;p.receiveHeight=height;p.receiveSpeed=speed;for(let i=0;i<120;i++)upd(speed,running?'run':'idle');
  return {running,height,popMaxDeg:r1(tr.pop),hipsStepMaxCm:r1(tr.step*100),path:seen.join(' > ')};
}
const out={mode:'v10 cuts and first touches (after) against v7 turns and no first touch (before)',cuts:[],touches:[]};
for(const angle of [45,90,135,180])for(const sign of [1,-1]){out.cuts.push({before:await cut(false,angle,sign),after:await cut(true,angle,sign),afterAllCuts:await cut(true,angle,sign,true)});}
for(const [running,height] of [[true,1.3],[true,.7],[true,.11],[false,1.3],[false,.11]])out.touches.push({before:await touch(false,running,height),after:await touch(true,running,height)});
console.log(JSON.stringify(out,null,1));
