/** The moving reticle is deterministic and continuous; releasing freezes its actual water point. */
const hash=n=>{n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return ((n^(n>>>15))>>>0)/4294967296;};
export function navalLockRadius(ship,enemy,balance,stage=5,difficulty='normal',equipment={}){
 const c=balance.lock,distance=Math.hypot(enemy.x-ship.x,enemy.z-ship.z),inside=distance<=balance.lock.goodRadius;
 const stageScale=c.stageBase+(stage-1)*c.stageStep,difficultyScale=c.difficulties[difficulty]??1,aimScale=1/Math.max(1,equipment.rate||1);
 return {inside,distance,radius:balance.lock.goodRadius,spread:c.radius*stageScale*difficultyScale*(1+Math.max(0,distance-balance.lock.goodRadius)/c.outsideFalloff)*aimScale};
}
export function navalJitter(seed,time,radius){
 const a=hash((seed+17)>>>0)*Math.PI*2,b=hash((seed+87)>>>0)*Math.PI*2;
 return {x:radius*(.7*Math.sin(time*7+a)+.3*Math.sin(time*13+b)),z:radius*(.7*Math.sin(time*9+b)+.3*Math.sin(time*17+a))};
}
export function navalLockedPoint(ship,enemy,wind,balance,stage,difficulty,equipment,seed,time,ammo=0){
 const range=navalLockRadius(ship,enemy,balance,stage,difficulty,equipment),jitter=navalJitter(seed,time,range.spread),flight=balance.targeting.flightSeconds+Math.hypot(enemy.x-ship.x,enemy.z-ship.z)*balance.targeting.secondsPerRange;
 const drift=ammo===0||ammo===4?balance.aim.wind.driftScale*(balance.aim.wind.difficultyMin+(stage-1)*balance.aim.wind.difficultyStep)*flight*flight:0;
 return {x:enemy.x+jitter.x+wind.x*drift,z:enemy.z+jitter.z+wind.z*drift,windX:wind.x*drift,windZ:wind.z*drift,jitter,flight,...range};
}
