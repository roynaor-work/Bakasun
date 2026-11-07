/** Soccer motion v9 headless measurement (evidence only, no browser): real rig + real clips + the real motion
 * controller, stepped at 60 Hz. Prints JSON: arm angles standing/running/celebrating and slide timing.
 * Usage: node tools/soccer-motion-v9-measure.mjs [off]   ("off" = ?soccerMotion=0, the previous behaviour) */
import {readFile} from 'node:fs/promises';
const off=process.argv[2]==='off';
globalThis.location={search:off?'?soccerMotion=0':''};
const T=await import('../vendor/three.module.js');
const {composeSoccerRestartMotion}=await import('../minigames/soccer-restart-motion.mjs');
const {compileSoccerDesignClips,createSoccerDesignMotion}=await import('../minigames/soccer-design-character.mjs');
const read=async f=>JSON.parse(await readFile(new URL('../design/'+f,import.meta.url),'utf8'));
const base=await read('motion/soccer.json'),packs=await Promise.all(['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('motion2/soccer/'+p+'.json')));
const rig=await read('characters/rig.json'),map=await read('viewer/retarget-map.json');
const config=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;
const data=composeSoccerRestartMotion(base,...packs),clips=compileSoccerDesignClips(data,rig,map);
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
const mk=(over={})=>({id:0,x:0,z:0,vx:0,vz:0,fx:1,fz:0,kickTime:0,stealTime:0,slideKind:'straight',slideTime:0,recover:0,slideWon:false,...over});
const S=(mode='defense')=>({ball:{owner:null,flight:null},mode,event:null});
function stand(){const rt=make(),p=mk(),s=S('attack'),rows=[];for(let i=0;i<150;i++){rt.motion.update(p,s,{mode:'idle'},dt);if(i>60)rows.push(measure(rt));}return {state:rt.motion.state,abdMax:+Math.max(...rows.map(r=>r.abd)).toFixed(1),flexMin:+Math.min(...rows.map(r=>r.flex)).toFixed(1)};}
function run(speed,mode='run'){const rt=make(),p=mk({vx:speed}),s=S('attack'),rows=[];for(let i=0;i<180;i++){rt.motion.update(p,s,{mode},dt);if(i>60)rows.push(measure(rt));}const m=f=>rows.map(f);return {state:rt.motion.state,abdMax:+Math.max(...m(r=>r.abd)).toFixed(1),flexMin:+Math.min(...m(r=>r.flex)).toFixed(1),flexMax:+Math.max(...m(r=>r.flex)).toFixed(1),fwdMax:+Math.max(...m(r=>r.fwd)).toFixed(1)};}
function celebrate(id){const rt=make(),p=mk({id}),s=S('attack'),rows=[];for(let i=0;i<110;i++){rt.motion.update(p,s,{mode:'celebrate'},dt);rows.push(measure(rt));}return {clip:rt.motion.state,abdMax:+Math.max(...rows.map(r=>r.abd)).toFixed(1)};}
function slide(kind,won,after){
  const rt=make(),v={...config.slide,...config.slide.variants[kind]},p=mk({slideKind:kind,vx:4.5}),s=S(),rows=[];let sim=0;
  const step=mode=>{rt.motion.update(p,s,{mode},dt);sim+=dt;const m=measure(rt);rows.push({sim,mode,state:rt.motion.state,...m});};
  for(let i=0;i<30;i++)step('run');
  const t0=sim;p.slideTime=v.seconds;p.vx=v.distance/v.seconds;
  while(p.slideTime>1e-9){p.slideTime=Math.max(0,p.slideTime-dt);if(p.slideTime<v.seconds*.5)p.slideWon=won;step('slide');}
  const recover=Math.min(v.recoverSeconds*(1+(won?0:.2)+.25+.15),Number.isFinite(v.maxTotalSeconds)&&!off?v.maxTotalSeconds-v.seconds:99);
  const rec=won?v.recoverSeconds:recover;p.recover=rec;p.vx=0;
  const tRec=sim-t0;while(p.recover>1e-9){p.recover=Math.max(0,p.recover-dt);step('recover');}
  const control=sim-t0;
  if(after==='run'){p.vx=4.5;for(let i=0;i<50;i++)step('run');}else for(let i=0;i<120;i++)step('idle');
  const standing=rows[0].hipsY,down=rows.filter(r=>r.sim>t0),during=down.filter(r=>r.mode==='slide'||r.mode==='recover');
  const upAt=down.find(r=>r.mode!=='slide'&&r.hipsY>=standing*.8)?.sim-t0;
  const cross=during.filter(r=>/Hand|Foot/.test(r.insideNames)).length,elbowCross=during.filter(r=>/ForeArm/.test(r.insideNames)&&!/Hand|Foot/.test(r.insideNames)).length,afterRun=down.filter(r=>r.sim-t0>control);
  let maxJump=0;for(let i=1;i<rows.length;i++)maxJump=Math.max(maxJump,Math.abs(rows[i].hipsY-rows[i-1].hipsY));
  return {kind,won,controlReturnsAt:+control.toFixed(2),uprightAt:upAt===undefined?null:+upAt.toFixed(2),lowestHips:+Math.min(...during.map(r=>r.hipsY)).toFixed(2),runningStateAt:(()=>{const r=down.find(r=>r.sim-t0>control&&/^run|dribble/.test(r.state));return r?+(r.sim-t0).toFixed(2):null;})(),handFootCrossFrames:cross,elbowOnTorsoFrames:elbowCross,maxHipsStepPerFrame:+maxJump.toFixed(3),crossDetail:process.env.DETAIL?during.filter(r=>r.inside>0).map(r=>[+(r.sim-t0).toFixed(2),r.mode,r.state,r.insideNames]):undefined};
}
const out={mode:off?'before (soccerMotion=0)':'after (v9)',stand:stand(),jockey:run(.3,'defense'),run4:run(4.5),sprint6:run(6.5,'sprint'),celebrations:[0,1,2,3].map(celebrate),
  slides:['straight','lateral','fast'].flatMap(k=>[true,false].map(w=>slide(k,w,'run')))};
console.log(JSON.stringify(out,null,1));
