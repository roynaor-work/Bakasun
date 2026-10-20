/** Charged shots use a persistent bearing, never the enemy position. */
export const navalShotRange=(power,balance)=>balance.charge.minRange+Math.max(0,Math.min(1,power))*(balance.charge.maxRange-balance.charge.minRange);
export const navalChargePower=(seconds,balance)=>Math.max(0,Math.min(1,seconds/balance.charge.seconds));
export function navalRangeState(ship,enemies,balance,level=5){
 const target=enemies.filter(e=>e.active&&e.hp>0).sort((a,b)=>Math.hypot(a.x-ship.x,a.z-ship.z)-Math.hypot(b.x-ship.x,b.z-ship.z))[0];
 // Extra active hulls create more collision opportunities; keep stage accuracy comparable.
 const distance=target?Math.hypot(target.x-ship.x,target.z-ship.z):Infinity,radius=balance.charge.goodRadius;
 return {inside:distance<=radius,distance,radius,spread:(balance.charge.spreadEasy+(level-1)*balance.charge.spreadStep)*Math.pow(enemies.filter(e=>e.active&&e.hp>0).length,.2)+Math.max(0,distance-radius)*balance.charge.outsideSpread};
}
export function navalChargedLanding(ship,bearing,power,wind,balance,level=5,ammo=0){
 const range=navalShotRange(power,balance),flight=ammo===4?balance.combat.vulcanFlight:(balance.targeting.flightSeconds+range*balance.targeting.secondsPerRange)*(ammo===2?balance.aim.torpedoSecondsMultiplier:1);
 const scale=[2,4,5].includes(ammo)?0:balance.aim.wind.driftScale*(balance.aim.wind.difficultyMin+(level-1)*balance.aim.wind.difficultyStep)*flight*flight;
 return {x:ship.x+Math.cos(bearing)*range+wind.x*scale,z:ship.z+Math.sin(bearing)*range+wind.z*scale,range,flight,windX:wind.x*scale,windZ:wind.z*scale};
}
/** Uniform disk error changes the physical landing point; collisions decide hits. */
export function navalScatter(point,spread,random){const a=random()*Math.PI*2,r=Math.sqrt(random())*spread;return {x:point.x+Math.cos(a)*r,z:point.z+Math.sin(a)*r};}
