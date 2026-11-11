/** 09/11/2026 (Roy): aircraft and helicopters attack the ship, and a Vulcan gun answers in the air.
 * Pure model (no render clock): spawn schedule from the stage's `air` block (or, from 11/11/2026, the balance default block for
 * stages without one), two behaviours (a plane strafes in a pass, a helicopter hovers and fires every few seconds), every shot
 * telegraphed by a landing marker, and an automatic Vulcan with heat so it comes in bursts. A hit aircraft falls into the sea
 * (`state:'down'`) rather than vanishing. Deterministic for the model's random stream. `?navalAir=off` removes the whole
 * mechanic. Stages with attacks (11/11/2026): 3, 4, 6, 8, 9, 12, 14, 16, 18, 20, 22, 24, 26, 27, 29 (`air` in the stage data). */
import {polishValue} from './polish-flag.mjs';
export const navalAirEnabled=search=>polishValue('navalAir',search)!=='off';
/** World height per model height unit (shared by the view and the HUD, so rings sit on the aircraft). */
export const NAVAL_AIR_LIFT=.32;
export const NAVAL_AIR_DEFAULTS=Object.freeze({
 plane:{speed:72,hp:1.6,pass:96,telegraph:1.3,damage:.7,size:1},
 heli:{speed:34,hp:3,hover:84,telegraph:1.5,every:3.4,damage:.55,leaveAfter:30,size:1.2},
 vulcan:{range:135,rate:22,heatUp:.3,coolDown:.5,resume:.4,damage:.34,hitMax:.55,tracerLife:.14,fall:9,sinkSeconds:3.2},
});
export function navalAirConfig(settings,balance){const a=settings?.air;if(!a)return null;const d=NAVAL_AIR_DEFAULTS,b=balance?.air||{};
 return {from:a.from??30,every:a.every??38,count:a.count??2,kinds:a.kinds||['plane','heli'],hpScale:a.hpScale??1,
  plane:{...d.plane,...b.plane,...a.plane},heli:{...d.heli,...b.heli,...a.heli},vulcan:{...d.vulcan,...b.vulcan,...a.vulcan}};}
/** One simulation step. `ctx`: {time,dt,random,player,enemyShots,settings,sound,score(n)}; `state` is created once. */
export function createNavalAir(cfg,balance){
 const air=[],tracers=[],state={heat:0,overheated:false,firing:false,target:null,kills:0,spawned:0,shots:0,hits:0,next:cfg.from,acc:0,serial:0,splashes:0};
 function spawn(kind,ctx){
  const c=cfg[kind],r=ctx.random,z=(r()-.5)*220,id=++state.serial;
  air.push({id,kind,x:ctx.player.x+190+r()*20,z,h:kind==='heli'?14:22,hp:c.hp*cfg.hpScale,maxHp:c.hp*cfg.hpScale,vx:-c.speed,vz:0,vh:0,roll:0,attack:null,fireAt:ctx.time+1.5,born:ctx.time,state:'in',passed:false,hit:0,downAt:null});state.spawned++;
 }
 function step(ctx){
  const {time,dt,random,player,enemyShots,settings}=ctx,v=cfg.vulcan;
  if(time>=state.next){state.next=time+cfg.every;for(let i=0;i<cfg.count;i++)spawn(cfg.kinds[(state.spawned)%cfg.kinds.length],ctx);}
  for(let i=air.length-1;i>=0;i--){
   const a=air[i],c=cfg[a.kind];
   if(a.state==='down'){
    // Shot down: the aircraft keeps some of its speed, noses over, spins and falls until the sea takes it.
    a.vh-=v.fall*dt;a.h+=a.vh*dt;a.x+=a.vx*.55*dt;a.z+=a.vz*dt;a.roll+=dt*(a.kind==='heli'?2.6:4.2);a.attack=null;a.hit=Math.max(0,a.hit-dt);
    if(a.h<=0){air.splice(i,1);state.splashes++;ctx.sound?.('splash');}
    continue;
   }
   if(a.hp<=0){a.state='down';a.downAt=time;a.vh=1.5;a.hit=.3;continue;}
   const dx=player.x-a.x,dz=player.z-a.z,dist=Math.hypot(dx,dz);
   if(a.kind==='plane'){
    a.vx=-c.speed;a.vz=Math.sin((time-a.born)*1.1+a.id)*9;
    if(!a.attack&&!a.passed&&dist<c.pass){a.attack={x:player.x+(random()-.5)*14,z:player.z+(random()-.5)*14,fireTime:time+c.telegraph};}
    if(a.x<player.x-70)a.state='out';
   }else{
    const hold=player.x+c.hover;a.vx=a.x>hold?-c.speed:Math.sin((time-a.born)*.8)*3;a.vz=Math.cos((time-a.born)*.6+a.id)*5;
    if(a.x<=hold+2&&!a.attack&&time>=a.fireAt)a.attack={x:player.x+(random()-.5)*12,z:player.z+(random()-.5)*12,fireTime:time+c.telegraph};
    if(time-a.born>c.leaveAfter){a.vx=c.speed;a.state='out';}
   }
   a.x+=a.vx*dt;a.z+=a.vz*dt;a.hit=Math.max(0,a.hit-dt);
   if(a.attack&&time>=a.attack.fireTime){
    enemyShots.push({x:a.x,z:a.z,fromX:a.x,fromZ:a.z,targetX:a.attack.x,targetZ:a.attack.z,age:0,duration:.9,kind:0,ammo:0,owner:'enemy',air:true,damage:settings.damage*c.damage});
    a.attack=null;a.fireAt=time+(c.every||99);if(a.kind==='plane')a.passed=true;ctx.sound?.('cannon');
   }
   if(a.state==='out'&&(a.x<player.x-120||a.x>player.x+260))air.splice(i,1);
  }
  // Vulcan: nearest flying aircraft in range; bursts limited by heat. Start and stop are reported once each for the sound.
  let target=null,best=v.range;for(const a of air){if(a.state==='down')continue;const d=Math.hypot(a.x-player.x,a.z-player.z);if(d<best){best=d;target=a;}}
  state.target=target?target.id:null;
  if(state.overheated&&state.heat<=v.resume)state.overheated=false;
  const firing=Boolean(target&&!state.overheated);
  if(firing!==state.firing){state.firing=firing;ctx.sound?.(firing?'vulcanStart':'vulcanStop');}
  if(state.firing){
   state.heat=Math.min(1,state.heat+v.heatUp*dt);if(state.heat>=1)state.overheated=true;
   state.acc+=v.rate*dt;
   while(state.acc>=1){state.acc-=1;state.shots++;const p=Math.max(.05,v.hitMax*(1-best/(v.range*1.15))),hit=random()<p;
    tracers.push({fromX:player.x,fromZ:player.z,toX:target.x+(hit?0:(random()-.5)*9),toZ:target.z+(hit?0:(random()-.5)*9),h:target.h+(hit?0:(random()-.5)*4),t:time,hit});if(tracers.length>12)tracers.shift();
    if(hit){state.hits++;target.hp-=v.damage;target.hit=.12;if(target.hp<=0){state.kills++;ctx.score?.(target);ctx.sound?.('explosion');break;}}}
  }else state.heat=Math.max(0,state.heat-v.coolDown*dt);
  while(tracers.length&&time-tracers[0].t>v.tracerLife)tracers.shift();
 }
 return {air,tracers,state,step,config:cfg};
}
