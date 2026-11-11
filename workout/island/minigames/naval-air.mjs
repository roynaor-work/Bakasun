/** 09/11/2026 (Roy): aircraft and helicopters attack the ship, and a Vulcan gun answers in the air.
 * Pure model (no render clock): spawn schedule from the stage's `air` block (or, from 11/11/2026, the balance default block for
 * stages without one), two behaviours (a plane strafes in a pass, a helicopter hovers and fires every few seconds), every shot
 * telegraphed by a landing marker, and an automatic Vulcan with heat so it comes in bursts. A hit aircraft falls into the sea
 * (`state:'down'`) rather than vanishing. Deterministic for the model's random stream. `?navalAir=off` removes the whole
 * mechanic. Stages with attacks (11/11/2026): 3, 4, 6, 8, 9, 12, 14, 16, 18, 20, 22, 24, 26, 27, 29 (`air` in the stage data). */
import {polishValue} from './polish-flag.mjs?v=island-v2-20261107-8';
export const navalAirEnabled=search=>polishValue('navalAir',search)!=='off';
/** 11/11/2026 (Roy, phone): "שמדיע מסוק אז שיהיה איך לכוון עליו עם וולקן ולא ירי אוטומטי". Manual Vulcan by default:
 * the gun fires only while the Vulcan button is held, along the player's sky crosshair; a hit needs the crosshair within
 * `cone` degrees of the aircraft. `?navalAirAim=auto` restores the v20 automatic gun. */
export const navalAirManual=search=>polishValue('navalAirAim',search)!=='auto';
/** World height per model height unit (shared by the view and the HUD, so rings sit on the aircraft). */
export const NAVAL_AIR_LIFT=.32;
/** Half wingspan of the drawn aircraft in world units (the HUD brackets are sized from it). */
export const NAVAL_AIR_WING=4.3;
export const NAVAL_AIR_DEFAULTS=Object.freeze({
 plane:{speed:72,hp:1.6,pass:96,telegraph:1.3,damage:.7,size:1},
 heli:{speed:34,hp:3,hover:84,telegraph:1.5,every:3.4,damage:.55,leaveAfter:30,size:1.2},
 vulcan:{range:135,rate:22,heatUp:.3,coolDown:.5,resume:.4,damage:.34,hitMax:.55,tracerLife:.14,fall:9,sinkSeconds:3.2,cone:6,pitchMin:0,pitchMax:55,defaultPitch:20,pitchPerPx:.16,manualRange:1.35,manualHitMin:.12},
});
export function navalAirConfig(settings,balance){const a=settings?.air;if(!a)return null;const d=NAVAL_AIR_DEFAULTS,b=balance?.air||{};
 return {from:a.from??30,every:a.every??38,count:a.count??2,kinds:a.kinds||['plane','heli'],hpScale:a.hpScale??1,
  plane:{...d.plane,...b.plane,...a.plane},heli:{...d.heli,...b.heli,...a.heli},vulcan:{...d.vulcan,...b.vulcan,...a.vulcan}};}
/** Bearing (model yaw) and elevation of an aircraft from the ship, in radians, plus its distance in model units. */
export function navalSkyAngles(player,a,balance){
 const r=balance.render,dxw=(a.x-player.x)*r.worldScale,dzw=(a.z-player.z)*r.enemySpacing/balance.combat.laneSpacing,horiz=Math.hypot(dxw,dzw);
 return {yaw:Math.atan2(a.z-player.z,a.x-player.x),pitch:Math.atan2(Math.max(0,a.h)*NAVAL_AIR_LIFT,Math.max(.01,horiz)),dist:Math.hypot(a.x-player.x,a.z-player.z)};
}
/** Angular distance in degrees between the crosshair {yaw,pitch} and an aircraft's angles. */
export function navalSkyError(aim,target){const dy=Math.atan2(Math.sin(target.yaw-aim.yaw),Math.cos(target.yaw-aim.yaw)),dp=(target.pitch||0)-(aim.pitch||0);return Math.hypot(dy,dp)*180/Math.PI;}
/** Model point the crosshair looks at: `dist` along the bearing, at the height the pitch gives there (model height units). */
export function navalSkyPoint(player,aim,dist,balance){
 const r=balance.render,x=player.x+Math.cos(aim.yaw)*dist,z=player.z+Math.sin(aim.yaw)*dist,horiz=Math.hypot((x-player.x)*r.worldScale,(z-player.z)*r.enemySpacing/balance.combat.laneSpacing);
 return {x,z,h:Math.tan(Math.max(0,aim.pitch||0))*horiz/NAVAL_AIR_LIFT};
}
/** One simulation step. `ctx`: {time,dt,random,player,enemyShots,settings,sound,score(n),sky?,belt?}; `state` is created once.
 * `sky` = {held,yaw,pitch} puts the gun in manual mode for the step; `belt` = {value} limits the rounds (null = unlimited). */
export function createNavalAir(cfg,balance){
 const air=[],tracers=[],state={heat:0,overheated:false,firing:false,target:null,kills:0,spawned:0,shots:0,hits:0,next:cfg.from,acc:0,serial:0,splashes:0,manual:false,onTarget:false,error:null,held:false,dry:false};
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
  // Vulcan. Automatic (v20): nearest flying aircraft in range. Manual (11/11): the aircraft nearest the crosshair, a hit only inside the cone,
  // fire only while the button is held. Bursts limited by heat and by the belt. Start and stop are reported once each for the sound.
  const sky=ctx.sky||null,belt=ctx.belt||null;state.manual=Boolean(sky);state.held=Boolean(sky?.held);state.onTarget=false;state.error=null;
  let target=null,best=v.range,aimErr=null;
  if(sky){best=Infinity;for(const a of air){if(a.state==='down')continue;const t=navalSkyAngles(player,a,balance);if(t.dist>v.range*v.manualRange)continue;const e=navalSkyError(sky,t);if(e<best){best=e;target=a;aimErr=e;}}
   state.error=target?+aimErr.toFixed(2):null;state.onTarget=Boolean(target&&aimErr<=v.cone);if(target&&aimErr>v.cone*2)target=null;}
  else for(const a of air){if(a.state==='down')continue;const d=Math.hypot(a.x-player.x,a.z-player.z);if(d<best){best=d;target=a;}}
  state.target=target?target.id:null;
  if(state.overheated&&state.heat<=v.resume)state.overheated=false;
  state.dry=Boolean(belt&&belt.value<=0);
  const firing=Boolean(!state.overheated&&!state.dry&&(sky?sky.held:target));
  if(firing!==state.firing){state.firing=firing;ctx.sound?.(firing?'vulcanStart':'vulcanStop');}
  if(state.firing){
   state.heat=Math.min(1,state.heat+v.heatUp*dt);if(state.heat>=1)state.overheated=true;
   state.acc+=v.rate*dt;
   while(state.acc>=1&&!state.dry){state.acc-=1;state.shots++;if(belt){belt.value=Math.max(0,belt.value-1);state.dry=belt.value<=0;}
    let hit=false,to;
    if(sky){const inCone=Boolean(target&&aimErr<=v.cone);hit=inCone&&random()<Math.max(v.manualHitMin,v.hitMax*(1-(aimErr/v.cone)*.6));const dist=target?navalSkyAngles(player,target,balance).dist:v.range;to=hit?{x:target.x,z:target.z,h:target.h}:navalSkyPoint(player,sky,dist,balance);}
    else{const p=Math.max(.05,v.hitMax*(1-best/(v.range*1.15)));hit=random()<p;to={x:target.x+(hit?0:(random()-.5)*9),z:target.z+(hit?0:(random()-.5)*9),h:target.h+(hit?0:(random()-.5)*4)};}
    tracers.push({fromX:player.x,fromZ:player.z,toX:to.x,toZ:to.z,h:to.h,t:time,hit});if(tracers.length>12)tracers.shift();
    if(hit){state.hits++;target.hp-=v.damage;target.hit=.12;if(target.hp<=0){state.kills++;ctx.score?.(target);ctx.sound?.('explosion');break;}}}
  }else state.heat=Math.max(0,state.heat-v.coolDown*dt);
  while(tracers.length&&time-tracers[0].t>v.tracerLife)tracers.shift();
 }
 return {air,tracers,state,step,config:cfg};
}
