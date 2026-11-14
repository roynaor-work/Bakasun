/** 13/11/2026 v23 (Roy, after v22 on the phone): "maybe a long press to home in and improve the aiming, accuracy and firing of the
 * ship; it should be possible to aim even when the ship is not at the right angle". Lock-on: a long press on an enemy hull (or a shore
 * structure) locks it. The turret then turns by itself, all the way round and whatever the hull's heading, onto real turret settings
 * that put the shell on the locked hull where it will be when the shell gets there (the same forecast fleet the arc uses, wind
 * included), and one tap on Fire fires. Another long press on the same hull, or its sinking, ends the lock; a long press on another
 * hull moves it. `?navalLock=0` restores v22 exactly (the held spin aim only). Pure helpers: no clock, no DOM, no random term. */
import {polishValue} from './polish-flag.mjs?v=island-v2-20261107-12';
import {navalSolveLaunch,navalLaunch,navalBallisticConfig,angleDelta} from './naval-ballistics.mjs?v=island-v2-20261107-12';
import {navalForecast} from './naval-forecast.mjs?v=island-v2-20261107-12';

export const navalLockOn=search=>polishValue('navalLock',search)!=='0';
const DEG=Math.PI/180;
/** holdSeconds: how long the finger rests on a hull before it locks (model time); showAfter: when the filling ring appears;
 * movePixels: a finger that travels farther is a drag (steering, aiming), not a long press; pickPixels: how far from the hull line a
 * finger still picks it (the bar above the hull counts, `barLift`); slew: the turret's own turn (exponential at `rate` per second,
 * capped at `maxYawDeg` and `maxElevDeg` per second); alignDeg: on target; queueSeconds: a tap waits this long for the turret at most;
 * settle: the aim point is refined until it moves less than this (sea units; a hull is 16 to 34 units from its centre to its side);
 * powers: candidate muzzle speeds, the flattest arc first, steeper ones to drop over a hull that stands in the way. */
export const NAVAL_LOCK_DEFAULTS=Object.freeze({holdSeconds:.45,showAfter:.12,movePixels:12,pickPixels:34,barLift:26,refreshSeconds:.1,settle:1.5,
 slew:Object.freeze({rate:12,maxYawDeg:240,maxElevDeg:90}),alignDeg:.5,queueSeconds:1.6,iterations:4,powers:Object.freeze([1,.86,.74,.64,.55,.47])});
export function navalLockConfig(balance){const c=balance?.lockOn||{};return {...NAVAL_LOCK_DEFAULTS,...c,slew:{...NAVAL_LOCK_DEFAULTS.slew,...(c.slew||{})}};}

/** Screen distance (pixels) from a point to a hull drawn as its bow-to-stern line, where a finger above the line (on the hull's
 * superstructure or its health bar) counts up to `lift` pixels for free. */
export function navalHullScreenDistance(point,a,b,lift=0){
 const vx=b.x-a.x,vy=b.y-a.y,len=vx*vx+vy*vy,u=len>0?Math.max(0,Math.min(1,((point.x-a.x)*vx+(point.y-a.y)*vy)/len)):0,x=a.x+vx*u,y=a.y+vy*u;
 const dy=point.y<y?Math.max(0,y-point.y-lift):point.y-y;return Math.hypot(point.x-x,dy);
}
/** The live enemy under a finger, or null for open water: the nearest hull line on screen within `pickPixels` (structures count). */
export function navalLockPick(enemies,project,point,width,height,config,balance){
 const c=config||NAVAL_LOCK_DEFAULTS,L=balance?.aim?.hullLength??34;let best=null;
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
 for(const e of enemies||[]){
  if(!e?.active||!(e.hp>0)||!Number.isFinite(e.x)||!Number.isFinite(e.z))continue;
  const half=L*(e.hullScale||1)*.8,h=e.heading||0,a=project(e.x+Math.cos(h)*half,e.z+Math.sin(h)*half,1.5),b=project(e.x-Math.cos(h)*half,e.z-Math.sin(h)*half,1.5),m=project(e.x,e.z,1.5);
  if(!a||!b||!m||!(a.depth>0)||!(b.depth>0)||!(m.depth>0))continue;
  if(m.x<-c.pickPixels||m.x>width+c.pickPixels||m.y<-c.pickPixels||m.y>height+c.pickPixels)continue;
  const d=navalHullScreenDistance(point,a,b,c.barLift);
  if(d<=c.pickPixels&&(!best||d<best.d))best={index:e.index,d};
 }
 return best?best.index:null;
}

/** Turret settings for the locked hull. For each candidate power (flattest first) the aim point is refined against the forecast fleet:
 * solve the launch for the point, fly the forecast against every hull; when it meets the locked hull, move the point to where that hull
 * is at the moment of contact; when it meets another hull or nothing, move it to where the locked hull is at the end of the flight (a
 * forecast with the locked hull alone); repeat until the point stands still (`settle` units). The first candidate that meets the locked
 * hull wins (`status:'ready'`). Otherwise the full-power answer is returned honestly: 'far' (beyond the shell's reach), 'blocked'
 * (another hull is in the way; only then are the steeper arcs tried), 'miss' (the shell meets nothing, for example a submarine that will
 * be under water). `warm` (the previous ready answer for the same hull and weapon) is tried first and starts the refinement where it
 * ended, so a lock that stays on target costs one launch and one forecast per refresh. A guided missile homes by itself and a repair
 * kit needs no aim (bearing only). Every answer is a real launch flown by the same physics. */
export function navalLockSolve({ship,target,enemies,wind,kind=0,pressure=1,context={},targetable=e=>e.active&&e.hp>0,elevation,warm=null},balance,config){
 const c=config||navalLockConfig(balance),b=navalBallisticConfig(balance),bearing=Math.atan2(target.z-(ship.z||0),target.x-ship.x);
 if(kind===1||kind===5)return {yaw:bearing,elevation:Number.isFinite(elevation)?elevation:b.defaultElevation,power:1,reachable:true,status:'ready',contact:{index:target.index},guided:true};
 const only=e=>e.index===target.index&&targetable(e),all=kind===3?()=>false:targetable,settle=c.settle??1.5,base=kind===2?[1]:[...c.powers];
 const hot=warm&&warm.status==='ready'&&warm.index===target.index&&warm.kind===kind&&base.includes(warm.candidate)&&Number.isFinite(warm.point?.x);
 const powers=hot?[warm.candidate,...base.filter(p=>p!==warm.candidate)]:base;let first=null;
 for(const p of powers){
  const fromWarm=hot&&warm.candidate===p;
  let point=fromWarm?{x:warm.point.x,z:warm.point.z}:{x:target.x,z:target.z},result=null;
  for(let i=0;i<c.iterations;i++){
   const s=navalSolveLaunch(ship,point,{power:p,wind,ammo:kind,pressure},balance);
   const launch=navalLaunch({ship,yaw:s.yaw,elevation:s.elevation,power:kind===2?s.power:p,wind,ammo:kind,pressure},balance);
   const check=navalForecast(launch,enemies,{...context,targetable:all},balance);result={s,check,point};
   if(!s.reachable)break;
   const ref=check.contact?.index===target.index||kind===3?check:navalForecast(launch,enemies,{...context,targetable:only},balance),future=ref.fleet.find(e=>e.index===target.index);
   if(!future)break;const next={x:future.x,z:future.z};if(Math.hypot(next.x-point.x,next.z-point.z)<settle)break;point=next;
  }
  if(!result)continue;
  const {s,check}=result,settings={yaw:s.yaw,elevation:kind===2?0:s.elevation,power:kind===2?s.power:p,reachable:Boolean(s.reachable),point:result.point,kind,index:target.index,candidate:p};
  if(!settings.reachable){if(p===base[0])return {...settings,status:'far',contact:null,end:check.end||null,flight:check.flight??null};continue;}
  if(kind===3)return {...settings,status:'ready',contact:{index:target.index,mine:true},end:check.end||null,flight:check.flight??null};
  const answer={...settings,contact:check.contact,end:check.end,flight:check.flight,status:check.contact?.index===target.index?'ready':check.contact?'blocked':'miss'};
  if(answer.status==='ready')return answer;if(p===base[0])first=answer;
  // A steeper arc only helps over a hull that stands in the way; when the flattest shell meets nothing, neither will they.
  if(p===base[0]&&answer.status==='miss')return answer;
 }
 return first||{yaw:bearing,elevation:b.defaultElevation,power:1,reachable:false,status:'far',contact:null,end:null,flight:null};
}

/** One frame of the turret's own turn toward the solution: exponential (time constant 1/rate) with a speed cap, the short way round.
 * A torpedo keeps its barrel down; its power is the run length. */
export function navalLockSlew(turret,solution,dt,config){
 const s=(config||NAVAL_LOCK_DEFAULTS).slew,t=Math.max(0,Number.isFinite(dt)?dt:0),k=1-Math.exp(-s.rate*t),cap=(v,m)=>Math.max(-m,Math.min(m,v));
 const dy=angleDelta(solution.yaw,turret.yaw),de=(solution.elevation??turret.elevation)-turret.elevation,dp=(solution.power??turret.power)-turret.power;
 return {yaw:turret.yaw+cap(dy*k,s.maxYawDeg*DEG*t),elevation:turret.elevation+cap(de*k,s.maxElevDeg*t),power:turret.power+dp*k};
}
/** On target: yaw, elevation (not for a torpedo) and power within the tolerance of the solution. */
export function navalLockAligned(turret,solution,config,kind=0){
 const c=config||NAVAL_LOCK_DEFAULTS;if(!solution)return false;
 return Math.abs(angleDelta(solution.yaw,turret.yaw))/DEG<=c.alignDeg&&(kind===2||kind===1||kind===5||Math.abs((solution.elevation??0)-turret.elevation)<=c.alignDeg)&&(kind===1||kind===5||Math.abs((solution.power??1)-turret.power)<=.02);
}
/** What the HUD and the Fire button show: 'ready' (on target and the forecast meets the hull), 'turning' (the turret is still swinging),
 * or the solver's own word for a shot that cannot land on the hull now ('far', 'blocked', 'miss'). */
export function navalLockStatus(aligned,solution){if(!solution)return 'turning';if(solution.status!=='ready')return solution.status;return aligned?'ready':'turning';}
