/** Street Slam engine: 2 v 2 full-court street basketball.
 * Deterministic fixed-step simulation (1/60 s). No DOM, no Three.js, no clock.
 * Same input sequence + same seed = same match. Rendering never decides points. */
import {slamCourt} from './slam-court.mjs?v=island-citydetail-20261025-2';
import {slamColliders,stepBall,launchVelocity} from './slam-ball.mjs?v=island-citydetail-20261025-2';
import {thinkAI,aiBlockReaction} from './slam-ai.mjs?v=island-citydetail-20261025-2';

export const SLAM_DT=1/60;
const TEAMS=['home','away'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const len=(x,z)=>Math.hypot(x,z);
const NO_INPUT=Object.freeze({move:{x:0,z:0},primaryPressed:false,primaryReleased:false,primaryCancelled:false,secondaryPressed:false});

export function mulberry32(seed){let a=seed>>>0;return {next(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;},get state(){return a;}};}

/** Fixed layouts in metres for the team T that holds the ball. Home attacks -Z;
 * the away layout is the same picture rotated half a turn. */
function formation(kind,team,attacking){
 const s=team==='home'?1:-1;
 const rows=kind==='inbound'
  ?(attacking?[[1.4,6.6],[-2.6,4.2]]:[[1.2,-.4],[-1.8,-2.2]])
  :(attacking?[[0,1.2],[-2.8,-1.2]]:[[.9,-1.4],[-2.4,-3.2]]);
 return rows.map(([x,z])=>[x*s,z*s]);
}

export function createSlamEngine({config,seed=1,stage=1,mode='match',difficulty}={}){
 const court=slamCourt(config),colliders=slamColliders(court);
 const level=config.levels[clamp(stage,1,config.levels.length)-1];
 const ai={away:{...config.ai.base,...level.ai,...(difficulty||{})},home:{...config.ai.base,...config.ai.teammate}};
 let rng,state,seq=0,queue=[],disposed=false;

 function makePlayer(id,team,index){
  return {id,team,index,x:0,z:0,y:0,vx:0,vz:0,yaw:team==='home'?Math.PI:0,
   state:'idle',stateT:0,anim:'idle',animT:0,jumpT:-1,jumpDur:0,jumpHeight:0,charge:-1,shootT:-1,shotHold:0,dunk:null,
   cd:{steal:0,block:0,dunk:0,pickup:0,pass:0},stumble:0,energy:config.energy.start,
   think:0,plan:null,blockAt:-1,primaryDown:false,celebrate:0,stats:{points:0,steals:0,blocks:0,dunks:0}};
 }

 function emit(event){const e={seq:++seq,tick:state.tick,...event};queue.push(e);return e;}

 function reset(newSeed){
  rng=mulberry32(newSeed>>>0);seq=0;queue=[];
  const players=[makePlayer('h1','home',0),makePlayer('h2','home',1),makePlayer('a1','away',0),makePlayer('a2','away',1)];
  state={seed:newSeed>>>0,stage,mode,tick:0,phase:mode==='practice'?'practice':'ready',resume:null,timer:config.match.readySeconds,
   remainingTicks:Math.round(config.match.seconds*60),overtimes:0,buzzer:false,score:{home:0,away:0},players,
   ball:{x:0,y:1,z:0,vx:0,vy:0,vz:0,ownerId:null,shot:null,pass:null,lastTeam:'home',stuck:0,heldTicks:0,touch:null},
   nextShotId:1,controlledId:'h1',attackTeam:'home',lastPossession:'home',result:null,practice:mode==='practice'?{step:0,target:{x:-2.6,z:-2.4},returnAt:-1}:null,
   playedTicks:0,shots:[]};
  place('tip','home');
  if(mode==='practice'){
   // Opponents rest on the sideline; they never touch the ball in practice.
   const [a1,a2]=[state.players[2],state.players[3]];a1.x=7.15;a1.z=-1.2;a2.x=7.15;a2.z=1.2;a1.yaw=a2.yaw=-Math.PI/2;a1.inactive=a2.inactive=true;
  }
 }

 function byId(id){return state.players.find(p=>p.id===id)||null;}
 function owner(){return byId(state.ball.ownerId);}
 function teammate(p){return state.players.find(q=>q.team===p.team&&q.id!==p.id);}
 function opponents(p){return state.players.filter(q=>q.team!==p.team&&!q.inactive);}
 function airborne(p){return p.jumpT>=0;}

 function place(kind,team){
  for(const p of state.players){
   const [x,z]=formation(kind,team,p.team===team)[p.index];
   Object.assign(p,{x,z,y:0,vx:0,vz:0,state:'idle',stateT:0,jumpT:-1,charge:-1,shootT:-1,dunk:null,stumble:0,plan:null,blockAt:-1,primaryDown:false,celebrate:0,think:0});
   p.cd.pickup=0;p.yaw=faceAngle(p,court.target(p.team));
  }
  const b=state.ball;Object.assign(b,{vx:0,vy:0,vz:0,shot:null,pass:null,stuck:0,heldTicks:0});
  const holder=state.players.find(p=>p.team===team&&p.index===0);b.ownerId=null;setOwner(holder,'reset');
 }

 function faceAngle(p,t){return Math.atan2(t.x-p.x,t.z-p.z);}

 function setOwner(p,reason){
  const b=state.ball,before=b.ownerId,prevTeam=b.lastTeam;b.ownerId=p?p.id:null;b.heldTicks=0;b.pass=null;
  if(p){b.vx=b.vy=b.vz=0;b.lastTeam=p.team;state.lastPossession=p.team;state.attackTeam=p.team;
   if(state.mode!=='practice'){
    // The child always plays the home ball handler, and defends with the
    // home player nearest the ball when the other team gains it.
    if(p.team==='home'&&state.controlledId!==p.id){state.controlledId=p.id;emit({type:'switch',playerId:p.id});}
    if(p.team==='away'&&(prevTeam!=='away'||reason==='reset')){
     const home=state.players.filter(q=>q.team==='home'),near=home.reduce((m,q)=>len(q.x-p.x,q.z-p.z)<len(m.x-p.x,m.z-p.z)?q:m);
     const cur=byId(state.controlledId);
     if(near.id!==state.controlledId&&!['shoot','dunk'].includes(cur?.state)){state.controlledId=near.id;emit({type:'switch',playerId:near.id});}
    }
   }
  }
  if(before!==b.ownerId)emit({type:'possession',playerId:b.ownerId,reason});
 }

 /** Ball position while held: deterministic dribble, chest hold or overhead. */
 function heldBall(p){
  const fx=Math.sin(p.yaw),fz=Math.cos(p.yaw),rx=fz,rz=-fx;
  if(p.state==='dunk'&&p.dunk)return {x:p.x+fx*.45,y:p.y+2.35,z:p.z+fz*.45,dribble:0};
  if(p.charge>=0||p.state==='shoot')return {x:p.x+fx*.28,y:p.y+(p.state==='shoot'?2.25:1.55),z:p.z+fz*.28,dribble:0};
  if(p.state==='pass')return {x:p.x+fx*.4,y:p.y+1.25,z:p.z+fz*.4,dribble:0};
  const phase=(state.tick*config.player.dribbleHz/60)%1,h=Math.abs(Math.sin(phase*Math.PI));
  return {x:p.x+rx*.34+fx*.32,y:config.court.ballRadius+h*(.92-config.court.ballRadius),z:p.z+rz*.34+fz*.32,dribble:phase};
 }

 function startJump(p,height,dur){p.jumpT=0;p.jumpDur=dur;p.jumpHeight=height;emit({type:'jump',playerId:p.id});}

 function actionsFor(p){
  const o=owner();
  if(o===p)return {primary:'shoot',secondary:'pass'};
  if(o&&o.team!==p.team)return {primary:'block',secondary:'steal'};
  return {primary:'rebound',secondary:'switch'};
 }

 function canAct(p){return !p.inactive&&p.stumble<=0&&!['dunk','shoot','pass'].includes(p.state)&&(state.phase==='playing'||state.phase==='overtime'||state.phase==='practice')&&!state.buzzer;}

 function dunkEligible(p){
  const c=config.dunk,ring=court.ring(p.team),dx=ring.x-p.x,dz=ring.z-p.z,d=len(dx,dz);
  if(state.mode==='practice'||airborne(p)||p.cd.dunk>0||p.energy<c.cost||d<c.minRange||d>c.range)return false;
  const fx=Math.sin(p.yaw),fz=Math.cos(p.yaw);if((fx*dx+fz*dz)/d<Math.cos(c.coneDegrees*Math.PI/360))return false;
  for(const q of opponents(p)){
   const t=((q.x-p.x)*dx+(q.z-p.z)*dz)/(d*d);if(t<.1||t>1.05)continue;
   const px=p.x+dx*t,pz=p.z+dz*t;if(len(q.x-px,q.z-pz)<c.laneWidth)return false;
  }
  return true;
 }

 function startDunk(p){
  const c=config.dunk,ring=court.ring(p.team),dx=ring.x-p.x,dz=ring.z-p.z,d=len(dx,dz),ux=dx/d,uz=dz/d;
  const take={x:ring.x-ux*c.takeoff,z:ring.z-uz*c.takeoff},gatherDist=Math.max(0,d-c.takeoff-c.jumpTravel);
  const gather=Math.max(c.minGather,gatherDist/c.gatherSpeed);
  p.state='dunk';p.stateT=0;p.energy-=c.cost;p.cd.dunk=c.cooldown;p.charge=-1;
  p.dunk={t:0,gather,sx:p.x,sz:p.z,mx:take.x-ux*c.jumpTravel,mz:take.z-uz*c.jumpTravel,tx:take.x,tz:take.z,ux,uz,released:false};
  p.yaw=Math.atan2(ux,uz);
 }

 function releaseShot(p,kind){
  const b=state.ball,ring=court.ring(p.team),cfg=config.shot;
  if(state.buzzer||state.remainingTicks<=0&&state.mode!=='practice'){emit({type:'lateRelease',playerId:p.id});return false;}
  const hp=heldBall(p),points=kind==='dunk'?2:court.points(p.team,p.x,p.z),id=state.nextShotId++;
  let target={...ring},vel;
  if(kind==='dunk'){
   b.x=ring.x-p.dunk.ux*.06;b.z=ring.z-p.dunk.uz*.06;b.y=ring.y+cfg.dunkDrop;vel={vx:p.dunk.ux*.4,vy:-3.2,vz:p.dunk.uz*.4};
  } else {
   const d=len(ring.x-p.x,ring.z-p.z),contest=contestOf(p),skill=p.id===state.controlledId?1:ai[p.team].aimError;
   const q=timingQuality(p.shotHold),err=cfg.baseError*(1+d*cfg.distanceError)*(cfg.timingSpread-q)*(1+contest*cfg.contestError)*skill;
   const ang=rng.next()*Math.PI*2,mag=err*Math.sqrt(-2*Math.log(1-rng.next()*.999)),ux=(ring.x-p.x)/(d||1),uz=(ring.z-p.z)/(d||1);
   const along=Math.cos(ang)*mag*cfg.depthBias,side=Math.sin(ang)*mag;
   target={x:ring.x+ux*along+uz*side,y:ring.y,z:ring.z+uz*along-ux*side};
   Object.assign(b,{x:hp.x,y:hp.y,z:hp.z});
   vel=launchVelocity(b,target,d<cfg.closeRange?cfg.closeAngle:cfg.angle,config.physics.gravity);
   b.shotQuality=q;b.shotInfo={distance:Math.round(d*100)/100,contest:Math.round(contest*100)/100,error:Math.round(err*1000)/1000};
  }
  b.vx=vel.vx;b.vy=vel.vy;b.vz=vel.vz;
  const shot={id,shooterId:p.id,team:p.team,releasedAtTick:state.tick,origin:{x:p.x,y:b.y,z:p.z},pointsIfMade:points,resolved:false,kind,flight:0,result:null,apex:false};
  b.ownerId=null;b.shot=shot;b.pass=null;b.stuck=0;p.cd.pickup=cfg.pickupCooldown;state.shots.push(shot);
  emit({type:'possession',playerId:null,reason:'shot'});
  emit({type:'shotReleased',shotId:id,playerId:p.id,points,kind,quality:kind==='dunk'?1:b.shotQuality,...(kind==='dunk'?{}:b.shotInfo)});
  if(kind==='dunk'){p.stats.dunks++;emit({type:'dunk',playerId:p.id,shotId:id});}
  return true;
 }

 function timingQuality(h){
  const c=config.shot;
  if(h<c.tapMax)return c.tapQuality;
  if(h>=c.perfectFrom&&h<=c.perfectTo)return 1;
  if(h<c.perfectFrom)return c.lowQuality+(1-c.lowQuality)*(h-c.tapMax)/(c.perfectFrom-c.tapMax);
  return 1-(1-c.lowQuality)*clamp((h-c.perfectTo)/(c.maxHold-c.perfectTo),0,1);
 }

 function contestOf(p){
  const ring=court.ring(p.team);let best=0;
  for(const q of opponents(p)){
   const d=len(q.x-p.x,q.z-p.z);if(d>config.shot.contestRange)continue;
   const toward=((q.x-p.x)*(ring.x-p.x)+(q.z-p.z)*(ring.z-p.z))/(d*len(ring.x-p.x,ring.z-p.z)||1);
   best=Math.max(best,(1-d/config.shot.contestRange)*(toward>0?1:.4)*(airborne(q)?1.3:1));
  }
  return best;
 }

 function pass(p){
  const r=teammate(p);if(!r||r.inactive)return false;
  const b=state.ball,c=config.pass,hp=heldBall(p),lead=clamp(len(r.x-p.x,r.z-p.z)/c.speed,c.minTime,c.maxTime);
  const tx=r.x+r.vx*lead*c.lead,tz=r.z+r.vz*lead*c.lead,ty=c.catchHeight;
  b.ownerId=null;b.x=hp.x;b.y=Math.max(1.1,hp.y);b.z=hp.z;
  const t=clamp(len(tx-b.x,tz-b.z)/c.speed,c.minTime,c.maxTime);
  b.vx=(tx-b.x)/t;b.vz=(tz-b.z)/t;b.vy=(ty-b.y+.5*config.physics.gravity*t*t)/t;
  b.pass={from:p.id,to:r.id,team:p.team,t:0};b.shot=null;b.stuck=0;
  p.state='pass';p.stateT=0;p.cd.pickup=c.cooldown;p.charge=-1;
  emit({type:'possession',playerId:null,reason:'pass'});emit({type:'pass',playerId:p.id,to:r.id});
  if(state.practice&&state.practice.step===1&&p.id==='h1')advancePractice();
  return true;
 }

 function trySteal(p){
  const o=owner(),c=config.steal;if(!o||o.team===p.team||p.cd.steal>0)return false;
  p.cd.steal=c.cooldown;p.state='steal';p.stateT=0;
  const d=len(o.x-p.x,o.z-p.z),face=(Math.sin(p.yaw)*(o.x-p.x)+Math.cos(p.yaw)*(o.z-p.z))/(d||1);
  const inRange=d<=c.range&&face>=Math.cos(c.coneDegrees*Math.PI/360)&&o.state!=='dunk'&&!airborne(o);
  let chance=inRange?c.chance*(o.charge>=0?c.chargeBonus:1)*(o.state==='pass'?0:1):0;
  // Reaching across the ball side is harder than reaching at the dribble.
  if(inRange){const hb=heldBall(o),side=len(hb.x-p.x,hb.z-p.z)<d?1:c.farSide;chance*=side;}
  const roll=rng.next();
  emit({type:'stealAttempt',playerId:p.id,target:o.id,success:roll<chance});
  if(roll<chance){
   o.charge=-1;o.stumble=c.victimStumble;o.cd.pickup=c.victimPickup;setOwner(p,'steal');p.energy=Math.min(1,p.energy+config.energy.stealBonus);p.stats.steals++;
   emit({type:'steal',playerId:p.id,from:o.id});return true;
  }
  p.stumble=c.missStumble;return false;
 }

 function applyInput(p,input){
  const acts=actionsFor(p),ok=canAct(p);
  if(input.primaryPressed)p.primaryDown=true;
  if(input.primaryReleased||input.primaryCancelled)p.primaryDown=false;
  if(input.primaryCancelled&&p.charge>=0){p.charge=-1;emit({type:'chargeCancelled',playerId:p.id});}
  if(!ok){if(input.primaryReleased&&p.charge>=0)p.charge=-1;return;}
  if(input.primaryPressed){
   if(acts.primary==='shoot'){if(dunkEligible(p))startDunk(p);else if(p.charge<0&&!airborne(p)){p.charge=0;emit({type:'charge',playerId:p.id});}}
   else if(!airborne(p)&&p.cd.block<=0){startJump(p,config.block.height,config.block.seconds);p.cd.block=config.block.cooldown;p.state=acts.primary==='block'?'block':'rebound';p.stateT=0;}
  }
  if(input.primaryReleased&&p.charge>=0&&owner()===p)beginShot(p);
  if(input.secondaryPressed){
   if(acts.secondary==='pass'&&owner()===p)pass(p);
   else if(acts.secondary==='steal')trySteal(p);
   else if(acts.secondary==='switch'&&p.id===state.controlledId){const t=teammate(p);if(t&&!t.inactive){state.controlledId=t.id;emit({type:'switch',playerId:t.id});}}
  }
 }

 function beginShot(p){
  p.shotHold=p.charge;p.charge=-1;p.state='shoot';p.stateT=0;p.shootT=0;
  startJump(p,config.shot.jumpHeight,config.shot.jumpSeconds);
  emit({type:'shotStart',playerId:p.id,hold:p.shotHold,quality:timingQuality(p.shotHold)});
 }

 function movePlayer(p,move,dt){
  const c=config.player,team=ai[p.team];
  let speed=(owner()===p?c.ballSpeed:c.speed)*(p.id===state.controlledId?1:team.speed);
  if(p.charge>=0)speed*=c.chargeSpeed;
  if(p.stumble>0)speed*=c.stumbleSpeed;
  if(['shoot','pass','steal'].includes(p.state)||airborne(p)&&p.state!=='rebound'&&p.state!=='block')speed*=p.state==='steal'?.5:0;
  if(airborne(p))speed*=.6;
  let mx=move.x,mz=move.z;const m=len(mx,mz);if(m>1){mx/=m;mz/=m;}
  const tx=mx*speed,tz=mz*speed,k=Math.min(1,c.accel*dt);
  p.vx+=(tx-p.vx)*k;p.vz+=(tz-p.vz)*k;
  p.x+=p.vx*dt;p.z+=p.vz*dt;court.clampPlayer(p);
  const v=len(p.vx,p.vz);
  if(v>.4&&!['shoot','dunk'].includes(p.state)&&p.charge<0)p.yaw=turn(p.yaw,Math.atan2(p.vx,p.vz),c.turnRate*dt);
  else if(owner()===p&&p.state!=='dunk')p.yaw=turn(p.yaw,faceAngle(p,court.target(p.team)),c.turnRate*dt*.6);
  else if(owner()&&owner().team!==p.team&&v<.4)p.yaw=turn(p.yaw,faceAngle(p,owner()),c.turnRate*dt*.6);
 }

 function turn(a,b,max){let d=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return a+clamp(d,-max,max);}

 function separate(){
  const r=config.player.radius*2,ps=state.players;
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
   const a=ps[i],b=ps[j];if(a.inactive||b.inactive)continue;const dx=b.x-a.x,dz=b.z-a.z,d=len(dx,dz);
   if(d<r){const push=(r-d)/2,ux=d>1e-6?dx/d:1,uz=d>1e-6?dz/d:0;
    const wa=a.state==='dunk'?0:b.state==='dunk'?1:.5,wb=1-wa;a.x-=ux*push*2*wa;a.z-=uz*push*2*wa;b.x+=ux*push*2*wb;b.z+=uz*push*2*wb;court.clampPlayer(a);court.clampPlayer(b);}
  }
 }

 function updatePlayerTimers(p,dt){
  for(const k of Object.keys(p.cd))p.cd[k]=Math.max(0,p.cd[k]-dt);
  p.stumble=Math.max(0,p.stumble-dt);p.stateT+=dt;p.celebrate=Math.max(0,p.celebrate-dt);
  p.energy=Math.min(1,p.energy+config.energy.regen*dt);
  if(p.jumpT>=0){p.jumpT+=dt;const u=p.jumpT/p.jumpDur;if(u>=1){p.jumpT=-1;p.y=0;if(['block','rebound','shoot'].includes(p.state)){p.state='land';p.stateT=0;}}else p.y=4*p.jumpHeight*u*(1-u);}
  if(p.charge>=0){p.charge+=dt;if(p.charge>=config.shot.maxHold&&owner()===p)beginShot(p);}
  if(p.state==='shoot'&&p.shootT>=0){p.shootT+=dt;if(p.shootT>=config.shot.windup){p.shootT=-1;if(owner()===p)releaseShot(p,'jump');}}
  if(['pass','steal'].includes(p.state)&&p.stateT>config.player.actionSeconds){p.state='idle';p.stateT=0;}
  if(p.state==='land'&&p.stateT>config.player.landSeconds){p.state='idle';p.stateT=0;}
 }

 function updateDunk(p,dt){
  const d=p.dunk,c=config.dunk;d.t+=dt;
  if(d.t<d.gather){const u=d.t/d.gather;p.x=d.sx+(d.mx-d.sx)*u;p.z=d.sz+(d.mz-d.sz)*u;return;}
  if(p.jumpT<0&&!d.jumped){d.jumped=true;startJump(p,c.jumpHeight,c.airSeconds);}
  const u=clamp((d.t-d.gather)/c.airSeconds,0,1);
  p.x=d.mx+(d.tx-d.mx)*Math.min(1,u*1.6);p.z=d.mz+(d.tz-d.mz)*Math.min(1,u*1.6);
  // Stuffed: an airborne defender reaching the ball before release.
  if(!d.released&&owner()===p){
   for(const q of opponents(p)){
    if(!airborne(q))continue;const reach=q.y+config.block.reach,hb=heldBall(p);
    if(len(q.x-p.x,q.z-p.z)<c.stuffRange&&reach>=hb.y-c.stuffSlack){
     const b=state.ball;setOwner(null,'block');Object.assign(b,{x:hb.x,y:hb.y,z:hb.z,vx:(p.x-q.x)*2.2,vy:1.2,vz:(p.z-q.z)*2.2});
     d.released=true;q.stats.blocks++;q.energy=Math.min(1,q.energy+config.energy.blockBonus);p.cd.pickup=.6;emit({type:'block',playerId:q.id,shotId:null,dunk:true});break;
    }
   }
  }
  if(!d.released&&u>=c.releaseAt&&owner()===p){d.released=true;if(!releaseShot(p,'dunk'))setOwner(null,'buzzer');}
  if(u>=1&&p.jumpT<0){p.state='land';p.stateT=0;p.dunk=null;}
 }

 function resolveShot(result,extra={}){
  const shot=state.ball.shot;if(!shot||shot.resolved)return;
  shot.resolved=true;shot.result=result;
  if(result!=='made')emit({type:'miss',shotId:shot.id,reason:result,...extra});
 }

 function updateBall(dt){
  const b=state.ball,o=owner();
  if(o){const h=heldBall(o);b.x=h.x;b.y=h.y;b.z=h.z;b.dribble=h.dribble;b.heldTicks++;return;}
  const prevVy=b.vy,{events,crossings}=stepBall(b,dt,court,colliders,config.physics);
  for(const e of events)emit({type:e.type,speed:Math.round(e.speed*100)/100});
  const shot=b.shot;
  if(shot&&!shot.resolved){
   shot.flight+=dt;if(prevVy>0&&b.vy<=0)shot.apex=true;
   for(const x of crossings){
    if(x.team!==shot.team)continue;
    shot.resolved=true;shot.result='made';
    state.score[shot.team]+=shot.pointsIfMade;const shooter=byId(shot.shooterId);shooter.stats.points+=shot.pointsIfMade;
    emit({type:'score',shotId:shot.id,team:shot.team,points:shot.pointsIfMade,playerId:shot.shooterId,kind:shot.kind});
    for(const p of state.players)if(p.team===shot.team)p.celebrate=config.match.scoreResetSeconds;
    if(state.phase!=='practice'){state.resume=state.phase;state.phase='scoreReset';state.timer=config.match.scoreResetSeconds;state.conceded=shot.team==='home'?'away':'home';}
    else advancePractice();
    break;
   }
   if(!shot.resolved){
    const ring=court.ring(shot.team),r=len(b.x-ring.x,b.z-ring.z);
    if(events.some(e=>e.type==='floor'))resolveShot('floor');
    else if(shot.apex&&b.y<ring.y-config.physics.missDrop&&r>config.court.ringRadius+.12)resolveShot('outside');
    else if(shot.flight<config.block.window&&!shot.apex&&shot.kind!=='dunk')checkBlock(shot);
   }
  } else if(b.pass){b.pass.t+=dt;if(events.some(e=>e.type==='floor'||e.type==='fence'))b.pass=null;}
  // Stuck on the rim or board top: dislodge after a bounded time.
  const speed=Math.hypot(b.vx,b.vy,b.vz);
  if(b.y>config.court.hoopHeight-.2&&speed<config.physics.stuckSpeed){b.stuck+=dt;if(b.stuck>config.physics.stuckSeconds){
   const ring=nearestRing(b),dx=b.x-ring.x,dz=b.z-ring.z,d=len(dx,dz)||1;
   b.vx=dx/d*1.6;b.vz=(dz/d||1)*1.6;b.vy=.8;b.x+=dx/d*.05;b.stuck=0;resolveShot('stuck');emit({type:'stuck'});}}
  else b.stuck=0;
  if(state.phase!=='scoreReset')pickups();
 }

 function nearestRing(b){return [court.ring('home'),court.ring('away')].reduce((m,r)=>len(r.x-b.x,r.z-b.z)<len(m.x-b.x,m.z-b.z)?r:m);}

 function checkBlock(shot){
  const b=state.ball,shooter=byId(shot.shooterId);
  for(const q of opponents(shooter)){
   if(!airborne(q))continue;
   // Only a defender in front of the shooter, between him and the rim, can block.
   const ring=court.ring(shot.team),sx=ring.x-shot.origin.x,sz=ring.z-shot.origin.z,qx=q.x-shot.origin.x,qz=q.z-shot.origin.z;
   if((sx*qx+sz*qz)/((len(sx,sz)*len(qx,qz))||1)<config.block.frontDot)continue;
   const fx=Math.sin(q.yaw),fz=Math.cos(q.yaw),hx=q.x+fx*.25,hz=q.z+fz*.25,hy=q.y+config.block.reach;
   if(Math.hypot(b.x-hx,b.y-hy,b.z-hz)<config.block.handRadius){
    const dx=b.x-q.x,dz=b.z-q.z,d=len(dx,dz)||1;b.vx=dx/d*config.block.deflect;b.vz=dz/d*config.block.deflect;b.vy=1.4;
    resolveShot('blocked',{playerId:q.id});q.stats.blocks++;q.energy=Math.min(1,q.energy+config.energy.blockBonus);
    emit({type:'block',playerId:q.id,shotId:shot.id});return;
   }
  }
 }

 function pickups(){
  const b=state.ball;if(b.ownerId)return;
  const shotLive=b.shot&&!b.shot.resolved;if(shotLive)return;
  let best=null,bestD=Infinity;
  for(const p of state.players){
   if(p.inactive||p.cd.pickup>0||['dunk','shoot'].includes(p.state)||p.stumble>0&&!b.pass)continue;
   const d=len(b.x-p.x,b.z-p.z),reachTop=airborne(p)?p.y+config.player.jumpReach:config.player.pickupHeight;
   const passTarget=b.pass&&b.pass.team===p.team,rad=passTarget?config.player.catchRadius:b.pass?config.pass.interceptRadius:config.player.pickupRadius;
   if(d<rad&&b.y<=reachTop&&b.y>=0&&d<bestD){best=p;bestD=d;}
  }
  if(!best)return;
  const wasPass=b.pass;
  setOwner(best,wasPass?(wasPass.team===best.team?'catch':'intercept'):'rebound');b.shot=null;
  if(wasPass&&wasPass.team!==best.team){best.stats.steals++;emit({type:'steal',playerId:best.id,from:wasPass.from,intercept:true});}
  if(state.practice&&state.practice.step>=1&&best.id==='h2')state.practice.returnAt=state.tick+Math.round(config.practice.returnSeconds*60);
 }

 function advancePractice(){
  const pr=state.practice;if(!pr||pr.step>=3)return;pr.step++;emit({type:'practiceStep',step:pr.step});
  if(pr.step>=3){emit({type:'practiceDone'});state.phase='finished';state.result={practice:true};}
 }

 function stepPractice(){
  const pr=state.practice,h1=byId('h1'),h2=byId('h2');
  if(pr.step===0&&len(h1.x-pr.target.x,h1.z-pr.target.z)<config.practice.targetRadius)advancePractice();
  if(pr.returnAt>=0&&state.tick>=pr.returnAt&&owner()===h2){pr.returnAt=-1;const save=state.controlledId;pass(h2);state.controlledId=save;}
  // Shooting step completes once the attempt is judged, made or not.
  if(pr.step===2&&state.ball.shot&&state.ball.shot.resolved)advancePractice();
  if(pr.step===2&&!owner()&&!state.ball.shot&&!state.ball.pass&&len(state.ball.x-h1.x,state.ball.z-h1.z)>config.practice.fetchDistance){
   // A dropped practice ball is handed back instead of chased.
   setOwner(h1,'practice');
  }
 }

 function stepAI(dt){
  const ctx={state,court,config,owner:owner(),byId,teammate,opponents,airborne,dunkEligible,heldBall,rng,controlledId:state.controlledId};
  for(const p of state.players){
   if(p.inactive||p.id===state.controlledId)continue;
   if(state.mode==='practice'){if(p.id==='h2'){p.plan={target:{x:-3.2,z:-4.6}};}}
   else {
    aiBlockReaction(p,ctx,ai[p.team],dt);
    p.think-=dt;if(p.think<=0){p.plan=thinkAI(p,ctx,ai[p.team]);p.think=ai[p.team].reaction*(.75+.5*rng.next());}
   }
   const plan=p.plan||{},intent={move:{x:0,z:0},primaryPressed:false,primaryReleased:false,secondaryPressed:false};
   if(plan.target){const dx=plan.target.x-p.x,dz=plan.target.z-p.z,d=len(dx,dz);if(d>.15){const s=Math.min(1,d/1.2);intent.move={x:dx/d*s,z:dz/d*s};}}
   if(plan.action&&canAct(p)){
    const a=plan.action;
    if(a.type==='shoot'&&owner()===p){if(p.charge<0)intent.primaryPressed=true;else if(p.charge>=a.hold){intent.primaryReleased=true;plan.action=null;}}
    else if(a.type==='dunk'&&owner()===p){intent.primaryPressed=true;plan.action=null;}
    else if(a.type==='pass'&&owner()===p){intent.secondaryPressed=true;plan.action=null;}
    else if(a.type==='steal'){intent.secondaryPressed=true;plan.action=null;}
    else if(a.type==='jump'){intent.primaryPressed=true;intent.primaryReleased=true;plan.action=null;}
   }
   applyInput(p,intent);
   if(p.state!=='dunk')movePlayer(p,intent.move,dt);
  }
 }

 function decideAfterBuzzer(){
  if(state.score.home===state.score.away){
   state.overtimes++;state.buzzer=false;state.remainingTicks=Math.round(config.match.overtimeSeconds*60);
   state.phase='ready';state.timer=config.match.readySeconds;state.resume='overtime';
   place('tip',state.overtimes%2?'home':'away');emit({type:'overtime',number:state.overtimes});
  } else finish();
 }

 function finish(){
  const winner=state.score.home>state.score.away?'home':'away',margin=Math.abs(state.score.home-state.score.away);
  state.phase='finished';
  const won=winner==='home',stars=won?(margin>=config.stars.three?3:margin>=config.stars.two?2:1):0;
  state.result={won,stars,scoreFor:state.score.home,scoreAgainst:state.score.away,overtimes:state.overtimes,stage,seed:state.seed,durationSeconds:Math.round(state.playedTicks/60*1000)/1000};
  emit({type:'finished',winner});
 }

 function step(input=NO_INPUT){
  if(disposed||state.phase==='finished'||state.phase==='paused')return;
  const dt=SLAM_DT;state.tick++;
  const human=byId(state.controlledId);
  if(state.phase==='ready'){
   state.timer-=dt;if(state.timer<=0){state.phase=state.resume||'playing';state.resume=null;emit({type:'tipoff',phase:state.phase});}
   updateBall(dt);return;
  }
  if(state.phase==='scoreReset'){
   state.timer-=dt;for(const p of state.players){updatePlayerTimers(p,dt);p.vx*=.9;p.vz*=.9;}
   updateBall(dt);
   if(state.timer<=0){
    const resume=state.resume;state.resume=null;
    if(state.buzzer){state.phase=resume;decideAfterBuzzer();return;}
    state.phase=resume;place('inbound',state.conceded);emit({type:'inbound',team:state.conceded});
   }
   return;
  }
  state.playedTicks++;
  // Controlled player: exactly one input frame per step.
  if(human&&!human.inactive){applyInput(human,input);if(human.state!=='dunk')movePlayer(human,input.move||NO_INPUT.move,dt);}
  stepAI(dt);
  for(const p of state.players){if(p.state==='dunk'&&p.dunk)updateDunk(p,dt);updatePlayerTimers(p,dt);}
  separate();
  updateBall(dt);
  if(state.mode==='practice'){stepPractice();return;}
  if(!state.buzzer){
   state.remainingTicks=Math.max(0,state.remainingTicks-1);
   if(state.remainingTicks===0){
    state.buzzer=true;emit({type:'buzzer'});
    // Nothing new leaves a hand after the buzzer.
    for(const p of state.players){p.charge=-1;if(p.state==='shoot'&&p.shootT>=0){p.shootT=-1;}}
   }
  }
  if(state.buzzer&&state.phase!=='scoreReset'){
   const shot=state.ball.shot,dunking=state.players.some(p=>p.state==='dunk'&&p.dunk&&!p.dunk.released);
   if((!shot||shot.resolved)&&!dunking)decideAfterBuzzer();
  }
 }

 function snapshot(){
  const b=state.ball,ctrl=byId(state.controlledId),o=owner();
  return {
   version:1,tick:state.tick,phase:state.phase,remainingMs:Math.round(state.remainingTicks/60*1000),
   controlledPlayerId:state.controlledId,attackTeam:state.attackTeam,score:{...state.score},
   overtimes:state.overtimes,buzzer:state.buzzer,mode:state.mode,
   players:state.players.map(p=>({id:p.id,team:p.team,position:{x:p.x,y:p.y,z:p.z},yaw:p.yaw,animation:animationOf(p),animationT:p.stateT,
    stamina:p.energy,hasBall:o===p,charge:p.charge,stumble:p.stumble,speed:len(p.vx,p.vz),inactive:!!p.inactive,
    cooldowns:{...p.cd},dunk:p.dunk?{t:p.dunk.t,gather:p.dunk.gather,released:p.dunk.released}:null,stats:{...p.stats}})),
   ball:{position:{x:b.x,y:b.y,z:b.z},velocity:{x:b.vx,y:b.vy,z:b.vz},ownerId:b.ownerId,dribble:b.dribble||0,
    shot:b.shot?{id:b.shot.id,shooterId:b.shot.shooterId,releasedAtTick:b.shot.releasedAtTick,origin:{...b.shot.origin},pointsIfMade:b.shot.pointsIfMade,resolved:b.shot.resolved,kind:b.shot.kind,result:b.shot.result}:null,
    pass:b.pass?{...b.pass}:null},
   availableActions:ctrl?actionsFor(ctrl):{primary:'rebound',secondary:'switch'},
   dunkReady:!!(ctrl&&o===ctrl&&dunkEligible(ctrl)),
   shotWindow:{tapMax:config.shot.tapMax,perfectFrom:config.shot.perfectFrom,perfectTo:config.shot.perfectTo,maxHold:config.shot.maxHold},
   practice:state.practice?{step:state.practice.step,target:{...state.practice.target}}:null,
   result:state.result?{...state.result}:null,
  };
 }

 function animationOf(p){
  if(p.celebrate>0&&state.phase==='scoreReset')return 'celebrate';
  if(p.state==='dunk')return 'dunk';
  if(p.state==='shoot'||p.charge>=0)return 'shoot';
  if(p.state==='pass')return 'pass';
  if(p.state==='steal')return 'steal';
  if(p.state==='block'||p.state==='rebound')return 'block';
  if(p.state==='land')return 'land';
  if(owner()===p)return 'dribble';
  return len(p.vx,p.vz)>.5?'run':'idle';
 }

 reset(seed);
 return {
  step,snapshot,
  drainEvents(){const out=queue;queue=[];return out;},
  pause(){if(state.phase==='paused'||state.phase==='finished')return;state.paused=state.phase;state.phase='paused';},
  resume(){if(state.phase!=='paused')return;state.phase=state.paused;state.paused=null;
   // A release edge lost during the pause must not leave a charge stuck.
   for(const p of state.players){p.primaryDown=false;if(p.charge>=0)p.charge=-1;}},
  restart(s=state.seed){reset(s);},
  dispose(){disposed=true;queue=[];},
  get result(){return state.result?{...state.result}:null;},
  get court(){return court;},
  /** Test/debug access; never used by the renderer to score. */
  get debugState(){return state;},
  invariants(){const owners=state.players.filter(p=>state.ball.ownerId===p.id).length;return {owners,ownerValid:state.ball.ownerId===null||!!byId(state.ball.ownerId)};},
 };
}
