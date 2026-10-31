import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {createRestartLayout,restartTarget,restartActionProfile,sampleRestartAction,restartBallPose} from '../workout/island/minigames/soccer-restarts.mjs';
import {compileAthleteRestartClips,createAthleteMotion,ATHLETE_CLIPS} from '../workout/island/minigames/soccer-athlete-motion.mjs';
import {compileSoccerDesignClips,createSoccerDesignMotion} from '../workout/island/minigames/soccer-design-character.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const data=JSON.parse(await readFile(new URL('../workout/island/design/motion2/soccer.json',import.meta.url),'utf8'));
const player=(id,team,role,x,z)=>({id,team,role,x,z,vx:0,vz:0});
function fixture(dir=1){return {attackDir:dir,players:[player(10,0,'striker',3*dir,1*dir),player(12,0,'support',-2*dir,-6*dir),player(14,0,'keeper',-16*dir,0),player(16,0,'wing',0,7*dir),player(20,1,'striker',5*dir,0),player(22,1,'support',10*dir,-6*dir),player(24,1,'keeper',16*dir,0),player(26,1,'wing',7*dir,6*dir)]};}
test('restart layout mirrors the complete pitch and gives stable, distinct jobs to arbitrary player IDs',()=>{
 for(const type of ['throwIn','corner','goalKick']){
  const s=fixture(),r={type,team:0,player:type==='goalKick'?14:10,x:type==='goalKick'?-14:type==='corner'?17:4,z:type==='goalKick'?3:10};
  const targets=createRestartLayout(r,s,config),reverse=fixture(-1),rr={...r,x:-r.x,z:-r.z},flipped=createRestartLayout(rr,reverse,config);
  for(const p of s.players)if(targets[p.id]){const a=targets[p.id],b=flipped[p.id];assert.ok(Math.abs(a.x+b.x)<1e-8,`${type} x ${p.id}`);assert.ok(Math.abs(a.z+b.z)<1e-8,`${type} z ${p.id}`);assert.equal(a.duty,b.duty);}
  const mates=s.players.filter(p=>p.team===r.team&&p.id!==r.player&&p.role!=='keeper');
  for(let i=0;i<mates.length;i++)for(let j=i+1;j<mates.length;j++)assert.ok(Math.hypot(targets[mates[i].id].x-targets[mates[j].id].x,targets[mates[i].id].z-targets[mates[j].id].z)>1.2,`${type} receivers occupy separate corridors`);
  const first=restartTarget(mates[0],r,s,config);mates[0].x=100;mates[1].z=-100;assert.equal(restartTarget(mates[0],r,s,config),first,'movement does not swap roles during the preparation');
 }
});
test('goal-kick opponents form outside the penalty area and every assigned marker covers a separate receiver',()=>{
 const s=fixture(),r={type:'goalKick',team:0,player:14,x:-14,z:3},t=createRestartLayout(r,s,config),defenders=s.players.filter(p=>p.team===1&&p.role!=='keeper');
 for(const p of defenders)assert.ok(t[p.id].x>=-config.pitch.length/2+config.pitch.penaltyDepth+2,'opponent waits outside the defending box');
 assert.equal(new Set(defenders.map(p=>`${t[p.id].x},${t[p.id].z}`)).size,defenders.length);
});
test('every authored contact agrees with the simulation profile; no release is reported early or twice by a single forward clock',()=>{
 for(const kind of Object.keys(data.states)){
  const p=restartActionProfile(kind),clip=data.states[kind],marker=clip.events.find(e=>e.name==='visual_release');assert.equal(marker.atSeconds,p.contact);assert.equal(clip.durationSeconds,p.duration);
  assert.equal(sampleRestartAction(kind,p.contact-1e-5).released,false);assert.equal(sampleRestartAction(kind,p.contact).released,true);assert.equal(sampleRestartAction(kind,p.duration).stage,'complete');
  let previous=false,edges=0;for(let t=0;t<p.duration+.1;t+=1/120){const next=sampleRestartAction(kind,t).released;if(next&&!previous)edges++;previous=next;}assert.equal(edges,1);
  for(const f of clip.keyframes){assert.deepEqual(Object.keys(f.rotations).sort(),data.skeleton.bones.map(b=>b.name).sort());for(const a of Object.values(f.rotations))assert.ok(Math.abs(Math.hypot(...a)-1)<1e-7);assert.deepEqual(f.referenceRootTranslationMeters,[0,0,0]);}
 }
 assert.throws(()=>restartActionProfile('basketball'));
});
test('throw-in rises above the head, keeper roll stays low, and punt drops toward the foot before contact',()=>{
 const overhead=restartBallPose('throwIn',.32),roll=restartBallPose('keeperThrow',.32),punt=restartBallPose('keeperPunt',.35);
 assert.ok(overhead.height>=2);assert.ok(roll.height<1);assert.ok(punt.height<.3);
 for(const kind of Object.keys(data.states)){let old=restartBallPose(kind,0);for(let t=1/240;t<restartActionProfile(kind).contact;t+=1/240){const next=restartBallPose(kind,t);assert.ok(Math.abs(next.height-old.height)<.1,'continuous held-ball height');assert.ok(Math.abs(next.forward-old.forward)<.1,'continuous held-ball travel');old=next;}}
});
test('new motion pack keeps FK hand/foot contacts on the ball and planted soles at their declared anchors',()=>{
 const fk=frame=>{const world={};for(const b of data.skeleton.bones){const parent=b.parent&&world[b.parent],offset=new T.Vector3().fromArray(b.restTranslationMeters);if(b.name==='Hips')offset.add(new T.Vector3().fromArray(frame.hipsOffsetMeters));world[b.name]={p:parent?offset.applyQuaternion(parent.q).add(parent.p):offset,q:parent?parent.q.clone().multiply(new T.Quaternion().fromArray(frame.rotations[b.name])):new T.Quaternion().fromArray(frame.rotations[b.name])};}return world;};
 for(const [kind,clip]of Object.entries(data.states)){
  for(const contact of clip.ballContacts){const frame=clip.keyframes.reduce((a,b)=>Math.abs(b.time-contact.time)<Math.abs(a.time-contact.time)?b:a),w=fk(frame)[contact.bone],point=new T.Vector3().fromArray(contact.localPointMeters).applyQuaternion(w.q).add(w.p),center=new T.Vector3().fromArray(contact.ballCenterMeters);assert.ok(point.distanceTo(new T.Vector3().fromArray(contact.pointMeters))<1e-7,kind+' contact FK');assert.ok(Math.abs(point.distanceTo(center)-contact.ballRadiusMeters)<1e-7,kind+' ball surface');}
  for(const f of clip.keyframes){const world=fk(f);for(const support of clip.supportContacts){const p=new T.Vector3().fromArray(support.effectorOffsetMeters).applyQuaternion(world[support.bone].q).add(world[support.bone].p);assert.ok(p.distanceTo(new T.Vector3().fromArray(support.anchorMeters))<=.021,`${kind} ${support.bone} planted at ${f.time}: ${p.distanceTo(new T.Vector3().fromArray(support.anchorMeters))}`);}}
 }
});
async function adultRig(){
 const b=await readFile(new URL('../workout/island/assets/athlete/athlete.glb',import.meta.url)),json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString()),joints=new Set(json.skins[0].joints);
 const nodes=json.nodes.map((n,i)=>{const o=joints.has(i)?new T.Bone():new T.Group();o.name=n.name||'';if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);return o;});
 json.nodes.forEach((n,i)=>(n.children||[]).forEach(j=>nodes[i].add(nodes[j])));return nodes[0];
}
test('authored pack retargets to the actual adult hierarchy without changing bind pose or adding root motion',async()=>{
 const root=await adultRig(),before=[];root.traverse(b=>before.push([b,b.quaternion.toArray(),b.position.toArray()]));
 const clips=compileAthleteRestartClips(T,root,data);assert.equal(clips.length,5);
 for(const [b,q,p]of before){assert.deepEqual(b.quaternion.toArray(),q);assert.deepEqual(b.position.toArray(),p);}
 const mixer=new T.AnimationMixer(root),a=mixer.clipAction(clips.find(c=>c.name==='restart-throwIn'));a.play();mixer.setTime(.32);root.updateMatrixWorld(true);
 const head=root.getObjectByName('Head').getWorldPosition(new T.Vector3()),hands=['LeftHand','RightHand'].map(n=>root.getObjectByName(n).getWorldPosition(new T.Vector3()));
 for(const h of hands)assert.ok(h.y>head.y+.1,'both hands travel above the adult head');
 assert.ok(hands[0].distanceTo(hands[1])<.5,'both hands hold one overhead ball');
 for(const clip of clips){assert.ok(clip.tracks.every(t=>!t.name.startsWith('Root.position')));for(const track of clip.tracks)assert.ok([...track.values].every(Number.isFinite));}
 mixer.stopAllAction();
});
test('adult mixer follows the simulation restart clock and returns to locomotion after follow-through',async()=>{
 const root=await adultRig(),authored=compileAthleteRestartClips(T,root,data),base=ATHLETE_CLIPS.map(name=>new T.AnimationClip(name,1,[new T.VectorKeyframeTrack('Hips.position',[0,1],[0,1,0,0,1,0])])),mixer=new T.AnimationMixer(root),motion=createAthleteMotion(T,mixer,[...base,...authored],config.view.athlete.motion);
 const p={id:0,role:'striker',vx:0,vz:0,kickTime:0,throwTime:0,stealTime:0,headerTime:0,diveTime:0,restartMotion:{kind:'throwIn',elapsed:.16,contact:.32}},s={controlled:0,sprint:{active:false},ball:{vx:0,vz:0}};
 motion.update(p,s,'throw',1/60);assert.equal(motion.oneShot,'restart-throwIn');assert.equal(motion.actions['restart-throwIn'].time,.16);
 p.restartMotion.elapsed=.5;motion.update(p,s,'throw',1/60);assert.equal(motion.actions['restart-throwIn'].time,.5);
 p.restartMotion=null;for(let i=0;i<90;i++)motion.update(p,s,'idle',1/60);assert.equal(motion.oneShot,null);assert.ok(motion.weights.idle>.95);
});
test('GLB fallback uses the same authored restart clock, freezes during pause, then returns to running',async()=>{
 const base=JSON.parse(await readFile(new URL('../workout/island/design/motion/soccer.json',import.meta.url),'utf8')),rig=JSON.parse(await readFile(new URL('../workout/island/design/characters/rig.json',import.meta.url),'utf8')),map=JSON.parse(await readFile(new URL('../workout/island/design/viewer/retarget-map.json',import.meta.url),'utf8')),merged={...base,states:{...base.states,...data.states},transitions:[...base.transitions,...data.transitions]};
 const root=new T.Group(),bones={};for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;(j.parent?bones[j.parent]:root).add(b);}
 const mixer=new T.AnimationMixer(root),motion=createSoccerDesignMotion(mixer,compileSoccerDesignClips(merged,rig,map),merged,config),p={id:0,vx:0,vz:0,fx:1,fz:0,restartMotion:{kind:'throwIn',elapsed:.2,contact:.32}};
 motion.update(p,{}, {mode:'throw'},1/60);assert.equal(motion.state,'throwIn');assert.equal(motion.actions.throwIn.time,.2);
 const displayed=bones.RightArm.quaternion.toArray();motion.update(p,{}, {mode:'throw'},0);assert.deepEqual(bones.RightArm.quaternion.toArray(),displayed);assert.equal(motion.actions.throwIn.time,.2);
 p.restartMotion=null;p.vx=4;motion.update(p,{}, {mode:'run'},1/60);assert.equal(motion.state,'run');mixer.stopAllAction();
});

const step=config.match.fixedStep,range=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),releaseTypes=new Set(['throw','pass','loft','shot']);
function liveFixture({direction=1,role='field',seed=71}={}){
 const game=createSoccer({config,role,seed,stage:4,difficulty:'normal'}),s=game.getState();
 for(const p of s.players){p.x*=direction;p.z*=direction;p.fx*=direction;p.fz*=direction;Object.assign(p,{vx:0,vz:0,recover:0,slideTime:0,cooldown:100,think:100,hands:false,hold:0});}
 s.attackDir=direction;s.controlled=role==='keeper'?2:0;s.switchCooldown=100;s.ball.grace=0;
 const events=[];let ticks=0;
 const tick=(input={},dt=step)=>{game.update(dt,input);ticks++;const batch=game.drainEvents();for(const e of batch)events.push({...e,tick:ticks});return batch;};
 return {game,s,events,tick};
}
function startRestart(f,type,direction=1){
 const hx=config.pitch.length/2,hz=config.pitch.width/2,b=f.s.ball;
 const common={owner:null,y:config.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,grace:0,flight:null,shot:null,thrower:null,lastTeam:1,lastPlayer:3};
 if(type==='throwIn')Object.assign(b,common,{x:4*direction,z:(hz-.05)*direction,vz:30*direction});
 else Object.assign(b,common,{x:(type==='corner'?hx-.05:-hx+.05)*direction,z:6*direction,vx:(type==='corner'?30:-30)*direction});
 f.tick();assert.equal(f.s.restart?.type,type);assert.equal(f.s.restart.team,0);return f.s.restart;
}
for(const direction of [1,-1])for(const type of ['throwIn','corner','goalKick'])test(`live ${type}, attack ${direction}: walk, organize, pause, one delayed physical release and follow-through`,()=>{
 const f=liveFixture({direction}),roles=f.s.players.map(p=>[p.id,p.role]),r=startRestart(f,type,direction),taker=f.s.players[r.player],start={x:taker.x,z:taker.z},initialDistances=new Map(f.s.players.map(p=>[p.id,r.targets[p.id]?range(p,r.targets[p.id]):0]));
 assert.equal(taker.role==='keeper',type==='goalKick','keeper takes only a goal kick');
 assert.equal(f.s.ball.owner,taker.id,'the legacy restart reservation belongs to the correct taker');
 assert.equal(f.s.ball.x,r.x);assert.equal(f.s.ball.z,r.z);assert.equal(f.s.ball.y,config.physics.ballRadius);assert.equal(Math.hypot(f.s.ball.vx,f.s.ball.vz,f.s.ball.vy),0,'a reservation does not carry or move the ball remotely');
 const before=JSON.stringify(f.s);f.game.update(0,{kickHeld:true,passHeld:true});assert.equal(JSON.stringify(f.s),before,'a paused frame changes neither preparation nor input');
 const liveClock=f.s.elapsed;let walked=0,windup=false,release=null,previous={x:taker.x,z:taker.z};
 for(let i=0;i<900&&!release;i++){
  const batch=f.tick();const delta=range(previous,taker);assert.ok(delta<=config.players.speed*1.05*step+1e-6,`${type} continuous taker walk ${delta}`);walked+=delta;previous={x:taker.x,z:taker.z};
  const physical=batch.filter(e=>releaseTypes.has(e.type)&&e.player===taker.id);
  if(r.elapsed+1e-8<r.walkSeconds){assert.equal(f.s.ball.owner,taker.id);assert.equal(f.s.ball.x,r.x,'reserved ball stays on the restart spot while the taker walks');assert.equal(f.s.ball.z,r.z);assert.equal(Math.hypot(f.s.ball.vx,f.s.ball.vz,f.s.ball.vy),0);assert.equal(batch.some(e=>e.type==='possession'||releaseTypes.has(e.type)),false,'reservation never becomes a remote capture or release');}
  if(taker.restartMotion){windup=true;const m=taker.restartMotion;if(m.elapsed+1e-8<m.contact){assert.equal(physical.length,0,'no physics release before contact');assert.equal(f.s.ball.owner,taker.id,'ball remains reserved during the wind-up');if(type!=='throwIn'){assert.equal(f.s.ball.x,r.x,'ground ball stays on the restart spot before contact');assert.equal(f.s.ball.z,r.z);assert.equal(f.s.ball.y,config.physics.ballRadius);}const paused=JSON.stringify(f.s);f.game.update(0,{});assert.equal(JSON.stringify(f.s),paused);}}
  if(f.s.restart)assert.equal(f.s.elapsed,liveClock,'preparation never spends live match time');
  if(physical.length){assert.equal(physical.length,1);release=physical[0];assert.ok(taker.restartMotion.elapsed+1e-8>=taker.restartMotion.contact);assert.ok(taker.restartMotion.elapsed<=taker.restartMotion.contact+step+1e-8);}
 }
 assert.ok(release,`${type} has a bounded completion`);assert.ok(windup);assert.ok(Math.abs(walked-range(start,r.stance||r))<1e-4,'the taker walks continuously to the contact stance');assert.equal(f.s.restart,null);assert.equal(f.s.phase,'playing');
 assert.equal(f.s.ball.owner,null,'release creates a free physical ball');assert.ok(Math.hypot(f.s.ball.vx,f.s.ball.vz)>0);assert.deepEqual(f.s.players.map(p=>[p.id,p.role]),roles);
 const runners=f.s.players.filter(p=>p.id!==r.player&&p.id!==f.s.controlled&&r.targets[p.id]&&initialDistances.get(p.id)>2);
 assert.ok(runners.some(p=>range(p,r.targets[p.id])<initialDistances.get(p.id)-.5),'at least one teammate/marker visibly approaches the preparation shape');
 if(type==='throwIn'){assert.equal(f.s.ball.thrower,taker.id);assert.ok(f.s.ball.vz*direction<0,'throw travels inward');assert.ok(Math.hypot(f.s.ball.vx,f.s.ball.vz)<=config.restarts.throwSpeed+1e-8);}
 for(let i=0;i<14;i++)f.tick();assert.equal(f.events.filter(e=>releaseTypes.has(e.type)&&e.player===taker.id).length,1,'release edge cannot repeat through the follow-through');
});

for(const type of ['corner','goalKick'])test(`live ${type}: a pass stays short while the shot button launches a deliberate long ball`,()=>{
 function action(button){
  const f=liveFixture(),r=startRestart(f,type),taker=f.s.players[r.player];
  for(let i=0;i<800&&f.s.phase!=='restartReady';i++)f.tick();assert.equal(f.s.phase,'restartReady');
  // Wait for the minimum ready time, then tap. Holding pass for the whole
  // minimum-ready interval would correctly request a charged loft instead.
  while(r.age<config.restarts.readySeconds+.05)f.tick();
  f.tick({[button]:true});f.tick({});for(let i=0;i<90&&f.s.restart;i++)f.tick();
  const release=f.events.find(e=>(e.type==='pass'||e.type==='loft')&&e.player===taker.id);assert.ok(release);return {f,release};
 }
 const short=action('passHeld'),long=action('kickHeld');assert.equal(short.release.type,'pass');assert.equal(long.release.type,'loft');assert.ok(long.f.s.ball.flight,'long release has a flight arc');assert.ok(long.release.power>=config.restarts.defaultCornerPower);
});

for(const direction of [1,-1])for(const button of ['passHeld','kickHeld'])test(`live keeper ${button}, attack ${direction}: wind-up retains possession then releases once at the matching contact`,()=>{
 const f=liveFixture({direction,role:'keeper'}),p=f.s.players[2],kind=button==='passHeld'?'keeperThrow':'keeperPunt';
 Object.assign(p,{x:-15*direction,z:0,fx:direction,fz:0,cooldown:0,hands:true,hold:0});
 Object.assign(f.s.ball,{owner:p.id,x:p.x+direction*config.goalkeeping.holdForward,z:0,y:config.goalkeeping.holdHeight,vx:0,vz:0,vy:0,grace:0,flight:null,shot:null,lastTeam:0,lastPlayer:p.id});
 f.tick({[button]:true});f.tick({});assert.equal(p.restartMotion?.kind,kind);assert.equal(f.s.ball.owner,p.id);assert.ok(p.distribution);assert.equal(f.events.filter(e=>releaseTypes.has(e.type)&&e.player===p.id).length,0);
 const frozen=JSON.stringify(f.s);f.game.update(0,{[button]:true});assert.equal(JSON.stringify(f.s),frozen);
 let released=false;for(let i=0;i<60&&!released;i++){const batch=f.tick();const physical=batch.filter(e=>releaseTypes.has(e.type)&&e.player===p.id);if(p.restartMotion?.elapsed+1e-8<p.restartMotion?.contact){assert.equal(f.s.ball.owner,p.id);assert.equal(physical.length,0);}if(physical.length){released=true;assert.equal(physical.length,1);assert.ok(p.restartMotion.elapsed+1e-8>=p.restartMotion.contact);assert.ok(p.restartMotion.elapsed<=p.restartMotion.contact+step+1e-8);assert.equal(f.s.ball.owner,null);assert.equal(p.hands,false);if(kind==='keeperThrow')assert.ok(Math.hypot(f.s.ball.vx,f.s.ball.vz)<=config.goalkeeping.throwMaxSpeed+.3);else assert.equal(physical[0].type,'shot');}}
 assert.ok(released);assert.equal(p.distribution,null);for(let i=0;i<14;i++)f.tick();assert.equal(f.events.filter(e=>releaseTypes.has(e.type)&&e.player===p.id).length,1);
});
test('live human keeper maximum hold schedules the wind-up early enough to release by the existing deadline',()=>{
 const f=liveFixture({role:'keeper'}),p=f.s.players[2];Object.assign(p,{x:-15,z:0,fx:1,fz:0,cooldown:0,hands:true,hold:config.goalkeeping.maxHoldSeconds-.6});Object.assign(f.s.ball,{owner:2,x:-14.6,z:0,y:config.goalkeeping.holdHeight,vx:0,vz:0,vy:0,lastTeam:0,lastPlayer:2,grace:0,flight:null});
 let elapsed=0;while(elapsed<.7&&!f.events.some(e=>e.type==='pass'&&e.player===2)){f.tick();elapsed+=step;}
 assert.ok(f.events.some(e=>e.type==='distribution-windup'&&e.player===2));assert.ok(f.events.some(e=>e.type==='pass'&&e.player===2));assert.ok(elapsed<=.6+step+1e-8,'wind-up is included in the keeper hold deadline');
});
for(const team of [0,1])test(`live AI keeper team ${team}: a long decision timer cannot extend the maximum hold by the new wind-up`,()=>{
 const f=liveFixture(),p=f.s.players[team===0?2:5],d=team===0?1:-1;Object.assign(p,{x:-15*d,z:0,fx:d,fz:0,cooldown:0,hands:true,hold:config.goalkeeping.maxHoldSeconds-.6,think:100});Object.assign(f.s.ball,{owner:p.id,x:p.x+.4*d,z:0,y:config.goalkeeping.holdHeight,vx:0,vz:0,vy:0,lastTeam:team,lastPlayer:p.id,grace:0,flight:null});
 let elapsed=0;while(elapsed<.7&&!f.events.some(e=>e.type==='pass'&&e.player===p.id)){f.tick();elapsed+=step;}
 assert.ok(f.events.some(e=>e.type==='distribution-windup'&&e.player===p.id));assert.ok(f.events.some(e=>e.type==='pass'&&e.player===p.id),'forced release cannot wait for the AI decision timer');assert.ok(elapsed<=.6+step+1e-8,'AI wind-up is included in the existing keeper hold deadline');
});
test('live throw-in fixed-step walk and delayed release are identical at 30 and 120 display updates per second',()=>{
 function run(hz){const f=liveFixture({seed:47});startRestart(f,'throwIn');for(let i=0;i<hz*6;i++)f.tick({},1/hz);return {state:structuredClone(f.s),events:f.events.map(({tick,...e})=>e)};}
 assert.deepEqual(run(30),run(120));
});
test('a high same-team throw remains available to its receiver near the own box; an opponent high ball can still be cleared',()=>{
 for(const lastTeam of [1,0]){const f=liveFixture(),p=f.s.players[3];Object.assign(p,{x:14,z:0,vx:0,vz:0,cooldown:0,think:100,recover:0,fx:-1,fz:0});Object.assign(f.s.ball,{owner:null,x:14,z:0,y:(config.aerial.minHeight+config.aerial.maxHeight)/2,vx:0,vz:0,vy:0,grace:0,flight:null,lastTeam,lastPlayer:lastTeam===1?4:0,thrower:lastTeam===1?4:null});f.tick();const clear=f.events.filter(e=>e.type==='clearance'&&e.player===p.id);assert.equal(clear.length,lastTeam===1?0:1,'same-team reception and genuine opposition clearance are distinct');if(lastTeam===1)assert.ok(Math.hypot(f.s.ball.vx,f.s.ball.vz)<.1);else assert.ok(f.s.ball.vx<0,'a real opponent attack is cleared away from the goal');}
});
for(const direction of [1,-1])for(const type of ['throwIn','corner'])test(`live ${type}, attack ${direction}: a human opponent cannot drift into the legal clearance or trap a restart at the pitch corner`,()=>{
 const f=liveFixture({direction}),hx=config.pitch.length/2,hz=config.pitch.width/2;
 Object.assign(f.s.ball,{owner:null,x:type==='corner'?(-hx+.05)*direction:4*direction,z:(type==='corner'?-6:hz-.05)*direction,y:config.physics.ballRadius,vx:type==='corner'?-30*direction:0,vz:type==='throwIn'?30*direction:0,vy:0,curve:0,grace:0,flight:null,shot:null,thrower:null,lastTeam:0,lastPlayer:0});
 f.tick();const r=f.s.restart;assert.equal(r?.type,type);assert.equal(r.team,1);
 const p=f.s.players[f.s.controlled],space=type==='corner'?3:config.restarts.opponentSpace;
 if(type==='corner')Object.assign(p,{x:r.x+Math.sign(r.x)*.05,z:r.z+Math.sign(r.z)*.05,vx:0,vz:0});
 else Object.assign(p,{x:r.x,z:r.z-Math.sign(r.z)*(space+.0001),vx:0,vz:Math.sign(r.z)*6});
 const input=type==='corner'?{moveX:Math.sign(r.x),moveZ:Math.sign(r.z)}:{moveZ:Math.sign(r.z)};
 let readyFrames=0,previous={x:p.x,z:p.z};
 for(let i=0;i<900&&f.s.restart;i++){
  if(f.s.phase==='restartReady'){readyFrames++;for(const q of f.s.players)if(q.team!==r.team&&q.role!=='keeper')assert.ok(range(q,r)>=space-1e-6,`ready opponent ${q.id} never drifts inside ${space} m`);}
  f.tick(input);assert.ok(range(previous,p)<=config.players.speed*1.4*step+1e-6,'clearance remains continuous even at the field limits');previous={x:p.x,z:p.z};
 }
 assert.ok(readyFrames>5,'the clearance stays valid through the full ready/wind-up period');assert.equal(f.s.restart,null,'the corner cannot soft-lock on an outward radial target');assert.equal(f.s.phase,'playing');
 assert.equal(f.events.filter(e=>releaseTypes.has(e.type)&&e.player===r.player).length,1);
});
