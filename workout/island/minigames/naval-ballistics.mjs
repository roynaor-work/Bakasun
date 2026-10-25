/** One ballistic model for the preview arc, the live shell and every test.
 * Units are the naval model's own sea units (x toward the enemy, z lateral,
 * h above the waterline). There is no random term anywhere in this file:
 * the same launch always produces the same path, contact and landing.
 * Wind is a constant horizontal acceleration that is part of the launch,
 * so the preview and the live shell share it exactly. */
const DEG=Math.PI/180,TAU=Math.PI*2;
export const NAVAL_STEP=1/120;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

export function navalBallisticConfig(balance){
 const c=balance.ballistics||{};
 return {...c,gravity:c.gravity??300,maxSpeed:c.maxSpeed??318,minPower:c.minPower??.35,muzzleHeight:c.muzzleHeight??19,hullTop:c.hullTop??15,
  pivotForward:c.pivotForward??20,barrelLength:c.barrelLength??17,minElevation:c.minElevation??3,maxElevation:c.maxElevation??42,defaultElevation:c.defaultElevation??14,
  windAccel:c.windAccel??.55,salvoYawDegrees:c.salvoYawDegrees??3.2,torpedoSpeed:c.torpedoSpeed??125,torpedoMinRange:c.torpedoMinRange??90,torpedoMaxRange:c.torpedoMaxRange??380,
  weakSpot:c.weakSpot??.42,criticalMultiplier:c.criticalMultiplier??1.75,criticalPoints:c.criticalPoints??20,maxFlight:c.maxFlight??4};
}
/** The turret pivot sits ahead of the hull centre; the shell leaves the muzzle. */
export function navalMuzzle(ship,yaw,balance){
 const c=navalBallisticConfig(balance),h=ship.heading||0;
 return {x:ship.x+Math.cos(h)*c.pivotForward+Math.cos(yaw)*c.barrelLength,z:(ship.z||0)+Math.sin(h)*c.pivotForward+Math.sin(yaw)*c.barrelLength,h:c.muzzleHeight};
}
export function navalWindAcceleration(wind,balance,pressure=1){
 const c=navalBallisticConfig(balance),w=balance.aim?.wind||{},scale=c.windAccel*((w.difficultyMin??.78)+(Math.max(1,pressure)-1)*(w.difficultyStep??.045));
 return {x:(wind?.x||0)*scale,z:(wind?.z||0)*scale};
}
/** A launch is a complete, immutable description of one shot. */
export function navalLaunch({ship,yaw,elevation,power=1,wind,ammo=0,pressure=1},balance){
 const c=navalBallisticConfig(balance),origin=navalMuzzle(ship,yaw,balance);
 if(ammo===2){
  origin.h=0;
  const range=c.torpedoMinRange+(c.torpedoMaxRange-c.torpedoMinRange)*clamp((power-c.minPower)/(1-c.minPower),0,1);
  return Object.freeze({kind:'water',ammo,origin,yaw,elevation:0,power,speed:c.torpedoSpeed,vx:Math.cos(yaw)*c.torpedoSpeed,vz:Math.sin(yaw)*c.torpedoSpeed,vh:0,ax:0,az:0,g:0,duration:range/c.torpedoSpeed});
 }
 const e=clamp(elevation,c.minElevation,c.maxElevation)*DEG,speed=c.maxSpeed*clamp(power,c.minPower,1),flat=Math.cos(e)*speed,vh=Math.sin(e)*speed,a=navalWindAcceleration(ammo===0||ammo===3||ammo===4?wind:null,balance,pressure);
 const duration=Math.min(c.maxFlight,(vh+Math.sqrt(vh*vh+2*c.gravity*origin.h))/c.gravity);
 return Object.freeze({kind:'arc',ammo,origin,yaw,elevation:e/DEG,power:clamp(power,c.minPower,1),speed,vx:Math.cos(yaw)*flat,vz:Math.sin(yaw)*flat,vh,ax:a.x,az:a.z,g:c.gravity,duration});
}
export function navalBallisticPoint(l,t){
 const u=clamp(t,0,l.duration);
 return {x:l.origin.x+l.vx*u+.5*l.ax*u*u,z:l.origin.z+l.vz*u+.5*l.az*u*u,h:Math.max(0,l.origin.h+l.vh*u-.5*l.g*u*u),t:u};
}
export function navalBallisticVelocity(l,t){const u=clamp(t,0,l.duration);return {x:l.vx+l.ax*u,z:l.vz+l.az*u,h:l.vh-l.g*u};}
export function navalLanding(l){return navalBallisticPoint(l,l.duration);}

/** Normalised hull distance along a segment (0 = centre, 1 = hull edge). */
export function navalHullDistance(from,to,ship,balance){
 const a=ship.heading||0,c=Math.cos(a),s=Math.sin(a),L=balance.aim.hullLength*(ship.hullScale||1),B=balance.aim.hullBeam*(ship.hullScale||1);
 const local=p=>({x:((p.x-ship.x)*c+(p.z-ship.z)*s)/L,z:((p.z-ship.z)*c-(p.x-ship.x)*s)/B});
 const f=local(from),t=local(to),vx=t.x-f.x,vz=t.z-f.z,u=clamp(-(f.x*vx+f.z*vz)/(vx*vx+vz*vz||1),0,1);
 return {distance:Math.hypot(f.x+vx*u,f.z+vz*u),u};
}
/** Contact on one fixed grid step k. Prediction and the live shell both test
 * exactly these segments, so their contact time cannot depend on frame rate. */
export function navalStepContact(l,k,targets,balance){
 const c=navalBallisticConfig(balance),t0=k*NAVAL_STEP;if(t0>=l.duration)return null;
 const t1=Math.min(l.duration,(k+1)*NAVAL_STEP),a=navalBallisticPoint(l,t0),b=navalBallisticPoint(l,t1);
 if(l.kind==='arc'&&Math.min(a.h,b.h)>c.hullTop)return null;
 let best=null;
 for(const ship of targets){const hit=navalHullDistance(a,b,ship,balance);if(hit.distance<=1&&(!best||hit.distance<best.distance))best={ship,distance:hit.distance,u:hit.u};}
 if(!best)return null;const t=t0+(t1-t0)*best.u,p=navalBallisticPoint(l,t);
 const end=navalLanding(l),core=navalHullDistance(end,end,best.ship,balance).distance;
 return {index:best.ship.index,x:p.x,z:p.z,h:p.h,t,step:k,distance:best.distance,core,critical:l.kind==='arc'&&core<=c.weakSpot};
}
/** Preview against the hulls as they stand now. A moving hull may leave the
 * predicted contact during flight; that is target motion, not a hidden error. */
export function navalPredict(l,targets,balance,samples=28){
 const points=[];for(let i=0;i<=samples;i++)points.push(navalBallisticPoint(l,l.duration*i/samples));
 let contact=null;for(let k=0;k*NAVAL_STEP<l.duration&&!contact;k++)contact=navalStepContact(l,k,targets,balance);
 const landing=navalLanding(l),end=contact||{...landing,t:l.duration};
 return {points,landing,contact,end,flight:end.t};
}
/** Advance a live shell from age a to age b over the same grid. */
export function navalAdvanceShot(l,from,to,targets,balance){
 const first=Math.floor(from/NAVAL_STEP+1e-9),last=Math.ceil(Math.min(to,l.duration)/NAVAL_STEP-1e-9);
 for(let k=first;k<last;k++){const contact=navalStepContact(l,k,targets,balance);if(contact&&contact.t>=from-1e-9)return contact;}
 return null;
}
/** Exact turret settings for a water point. Used for the easy-mode quick shot
 * and fixture input. It returns a real launch; the result still flies. */
export function navalSolveLaunch(ship,target,{power=1,wind,ammo=0,pressure=1},balance){
 const c=navalBallisticConfig(balance);let yaw=Math.atan2(target.z-(ship.z||0),target.x-ship.x),elevation=c.defaultElevation,launch;
 if(ammo===2){
  for(let i=0;i<6;i++){const m=navalMuzzle(ship,yaw,balance);yaw=Math.atan2(target.z-m.z,target.x-m.x);}
  const m=navalMuzzle(ship,yaw,balance),range=Math.hypot(target.x-m.x,target.z-m.z);
  return {yaw,elevation:0,power:c.minPower+(1-c.minPower)*clamp((range-c.torpedoMinRange)/(c.torpedoMaxRange-c.torpedoMinRange),0,1),reachable:range<=c.torpedoMaxRange};
 }
 const rangeAt=e=>{launch=navalLaunch({ship,yaw,elevation:e,power,wind,ammo,pressure},balance);const p=navalLanding(launch);return {p,along:(p.x-launch.origin.x)*Math.cos(yaw)+(p.z-launch.origin.z)*Math.sin(yaw)};};
 for(let pass=0;pass<8;pass++){
  const m=navalMuzzle(ship,yaw,balance),want=(target.x-m.x)*Math.cos(yaw)+(target.z-m.z)*Math.sin(yaw);
  let lo=c.minElevation,hi=c.maxElevation;
  for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(rangeAt(mid).along<want)lo=mid;else hi=mid;}
  elevation=(lo+hi)/2;const p=rangeAt(elevation).p,side=(target.z-p.z)*Math.cos(yaw)-(target.x-p.x)*Math.sin(yaw),dist=Math.max(1,Math.hypot(p.x-m.x,p.z-m.z));
  yaw+=Math.atan2(side,dist);
 }
 const p=rangeAt(elevation).p;
 return {yaw,elevation,power,reachable:Math.hypot(p.x-target.x,p.z-target.z)<.05};
}
/** Ballistic flight time to a point, for lead prediction in the assisted shot. */
export function navalFlightTo(ship,target,options,balance){const s=navalSolveLaunch(ship,target,options,balance);return navalLaunch({ship,...options,...s},balance).duration;}
export {DEG,TAU};
