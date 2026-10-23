/** The moving reticle is deterministic and continuous; releasing freezes its actual water point. */
const hash=n=>{n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return ((n^(n>>>15))>>>0)/4294967296;};
export function navalLockRadius(ship,enemy,balance,stage=5,difficulty='normal',equipment={}){
 const c=balance.lock,distance=Math.hypot(enemy.x-ship.x,enemy.z-ship.z),inside=distance<=balance.lock.goodRadius;
 const rank=Math.max(1,Math.min(30,Number.isFinite(stage)?stage:1));
 const stageScale=c.stageBase+Math.log2(rank)*c.stageStep*2.5,difficultyScale=c.difficulties[difficulty]??1,aimScale=1/Math.max(1,equipment.rate||1);
 // Range remains meaningful without turning the opening shot into a lottery.
 // The largest late-stage sway still fits around a visible hull, not a lane.
 const rangeScale=1+.35*(1-Math.exp(-Math.max(0,distance-c.goodRadius)/Math.max(1,c.outsideFalloff)));
 return {inside,distance,radius:c.goodRadius,spread:c.radius*.24*stageScale*difficultyScale*rangeScale*aimScale};
}
export function navalJitter(seed,time,radius){
 const a=hash((seed+17)>>>0)*Math.PI*2,b=hash((seed+87)>>>0)*Math.PI*2;
 return {x:radius*(.7*Math.sin(time*1.8+a)+.3*Math.sin(time*3.1+b)),z:radius*(.7*Math.sin(time*1.6+b)+.3*Math.sin(time*2.7+a))};
}
export function navalLockedPoint(ship,enemy,wind,balance,stage,difficulty,equipment,seed,time,ammo=0){
 const rank=Math.max(1,Math.min(30,Number.isFinite(stage)?stage:1)),range=navalLockRadius(ship,enemy,balance,rank,difficulty,equipment),precision=[1,.15,.45,.2,1.15,0][ammo]??1,jitter=navalJitter(seed,time,range.spread*precision);
 let flight=balance.targeting.flightSeconds+range.distance*balance.targeting.secondsPerRange;
 if(ammo===2)flight*=balance.aim.torpedoSecondsMultiplier;
 // Predict the same water point that a shell/torpedo will reach. Guided
 // missiles track the hull themselves and do not need an offset destination.
 const velocity=Math.hypot(enemy.vx||0,enemy.vz||0),limit=balance.movement.speed*1.5,velocityScale=velocity>limit?limit/velocity:1;
 const lead=ammo===0||ammo===2||ammo===4?flight*velocityScale:0;
 const drift=ammo===0||ammo===4?balance.aim.wind.driftScale*(balance.aim.wind.difficultyMin+(rank-1)*balance.aim.wind.difficultyStep)*flight*flight:0;
 const windLength=Math.hypot(wind.x,wind.z)*drift,windScale=windLength>balance.targeting.radius*.22?balance.targeting.radius*.22/windLength:1;
 const windX=wind.x*drift*windScale,windZ=wind.z*drift*windScale;
 return {x:enemy.x+(enemy.vx||0)*lead+jitter.x+windX,z:enemy.z+(enemy.vz||0)*lead+jitter.z+windZ,windX,windZ,jitter,flight,...range};
}
