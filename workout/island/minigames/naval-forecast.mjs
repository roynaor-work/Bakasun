import {navalAdvanceShot,navalBallisticPoint,navalBallisticConfig,navalHullDistance,navalLanding} from './naval-ballistics.mjs?v=island-perf-20261030-1';
import {stepNavalPatrol,navalPatrolCentre,navalPatrolObstacles,navalPatrolConfig} from './naval-patrol.mjs?v=island-perf-20261030-1';
/** Honest aim (29/10/2026). Where a shot really goes: the shell flies its
 * fixed launch while every hull sails on under the same patrol rules as the
 * live fleet (naval-patrol: station, flank drift, yielding, the early-stage
 * hold while a shell is airborne), on the game's frame step. The measured
 * diagnosis showed the old mark tested the hulls as they stood at release, so
 * a shell released the moment the mark turned to "hit" missed in about half
 * of the cases once the ship sailed on. Pure and deterministic: the live
 * fleet is never touched, the same state and launch give the same answer. */
export function navalForecastConfig(balance){
 const f=balance.aim?.forecast||{};
 return {reactionSeconds:f.reactionSeconds??.25,stepSeconds:f.stepSeconds??1/60,leadFromStage:f.leadFromStage??3};
}
const copy=e=>({index:e.index,x:e.x,z:e.z,heading:e.heading||0,hp:e.hp,active:e.active,slot:e.slot,behavior:e.behavior,spawnTime:e.spawnTime,hullScale:e.hullScale,kind:e.kind,depth:e.depth||0,patrol:e.patrol?{...e.patrol}:null});
/** `delay`: seconds the fleet sails on before the shell leaves (the reaction
 * margin); nothing is airborne during it. `targetable(e)` mirrors the live
 * contact filter. Returns the contact, the landing, the end the mark shows,
 * the hull the arc passes over too high to touch (`over`, only on a miss),
 * and every hull where it stands when the shot ends. */
export function navalForecast(launch,enemies,{time=0,player={x:0,z:0},concurrent=1,fleetLength=enemies.length,drift=0,delay=0,targetable=e=>e.active&&e.hp>0}={},balance){
 const step=navalForecastConfig(balance).stepSeconds,fleet=enemies.map(copy),types=balance.shipTypes||[],combat=balance.combat||{},shell=navalBallisticConfig(balance),patrol=navalPatrolConfig(balance),hullTop=shell.hullTop;
 let t=time;
 const move=(dt,airborne)=>{t+=dt;
  for(const e of fleet){
   if(e.hp<=0||!e.active||!e.patrol)continue;
   const centreX=navalPatrolCentre(e,fleet,{time:t,concurrent,fleetLength,drift},balance);
   stepNavalPatrol(e.patrol,dt,{obstacles:navalPatrolObstacles(e,fleet,player),shellAirborne:airborne,centreX,config:patrol},balance);
   e.x=e.patrol.x;e.z=e.patrol.z;e.heading=e.patrol.heading;
   if(types[e.kind]?.submarine)e.depth=(t-e.spawnTime)%combat.submarineCycle>combat.submarineSurface?1:0;
  }
 };
 for(let waited=0;waited<delay-1e-9;waited+=step)move(Math.min(step,delay-waited),false);
 let age=0,contact=null,over=null;
 while(age<launch.duration-1e-9){
  move(step,true);const from=age;age=Math.min(launch.duration,age+step);const targets=fleet.filter(targetable);
  contact=navalAdvanceShot(launch,from,age,targets,balance,shell);if(contact)break;
  if(!over&&launch.kind==='arc'){const a=navalBallisticPoint(launch,from),b=navalBallisticPoint(launch,age);if(Math.min(a.h,b.h)>hullTop)for(const e of targets)if(navalHullDistance(a,b,e,balance).distance<=1){over={index:e.index,x:e.x,z:e.z};break;}}
 }
 const landing=navalLanding(launch),end=contact||{...landing,t:launch.duration};
 return {contact,landing,end,flight:end.t,over:contact?null:over,fleet:fleet.map(e=>({index:e.index,x:e.x,z:e.z,heading:e.heading})),delay};
}
