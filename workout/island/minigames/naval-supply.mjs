/** 11/11/2026 (Roy, phone): "צריך הגבלה על תחמושת". Magazines per weapon (smaller than the stage's old counts), a Vulcan belt,
 * and supply buoys instead of the silent 2-second refill: when the shells or the belt run low a buoy appears ahead, sailing into
 * it refills. Pure helpers, no render clock. `?navalAmmo=0` restores the v20 counts and the automatic refill. */
import {polishValue} from './polish-flag.mjs?v=island-v2-20261107-8';
export const navalAmmoLimit=search=>polishValue('navalAmmo',search)!=='0';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const NAVAL_SUPPLY_DEFAULTS=Object.freeze({shellShare:.45,shellMin:12,shellMax:24,belt:160,lowShells:3,lowBelt:30,waveShare:.6,near:45,far:70,spread:.7,collect:16,driftAfter:2,driftSpeed:16,refill:{guided:1,torpedo:4,mine:2,salvo:2}});
export function navalSupplyConfig(balance){return {...NAVAL_SUPPLY_DEFAULTS,...(balance?.ammoLimit||{}),refill:{...NAVAL_SUPPLY_DEFAULTS.refill,...(balance?.ammoLimit?.refill||{})}};}
/** Magazine sizes for a stage: the shell magazine is a share of the stage's stock (12 to 24 rounds loaded at a time), the other
 * weapons fire from their stock directly, plus the Vulcan belt. The stock itself (`ammo`) keeps the stage's counts. */
export function navalMagazines(settings,balance){
 const c=navalSupplyConfig(balance),a=settings?.ammunition||[0,0,0,0,0,0];
 return {ammo:[clamp(Math.round(a[0]*c.shellShare),c.shellMin,c.shellMax),a[1]||0,a[2]||0,a[3]||0,a[4]||0,a[5]||0],belt:c.belt};
}
/** Rounds loaded at the start or after a buoy: the magazine, or what the stock still holds. */
export function navalLoad(stock,magazine){return Math.max(0,Math.min(stock||0,magazine||0));}
/** A waiting buoy drifts to a ship that has no shells loaded and has not come for it (after `driftAfter` seconds), so no one is ever stranded. */
export function navalBuoyDrift(buoy,ship,loadedShells,dt,time,balance){
 const c=navalSupplyConfig(balance);if(loadedShells>0||time-(buoy.born||0)<c.driftAfter)return false;
 const dx=ship.x-buoy.x,dz=ship.z-buoy.z,d=Math.hypot(dx,dz);if(d<1e-6)return true;const step=Math.min(d,c.driftSpeed*Math.max(0,dt));buoy.x+=dx/d*step;buoy.z+=dz/d*step;buoy.drifting=true;return true;
}
/** 'empty' when the selected weapon (or the belt) is out, 'low' below the low mark, else 'ok'; `fraction` of the magazine left. */
export function navalAmmoState(count,magazine,low){const max=Math.max(1,magazine||1),n=Math.max(0,count||0);return {fraction:n/max,level:n<=0?'empty':n<=low?'low':'ok'};}
/** A buoy is due when the loaded shells or the belt are at the low mark and no buoy is waiting (the buoy brings fresh shells, so the
 * stage's stock is a start, not a cap: on a base stage the limit is the trip, never a stranded ship). `afterWave`: below the wave share. */
export function navalSupplyNeeded(loaded,stock,belt,mags,buoys,balance,afterWave=false){
 const c=navalSupplyConfig(balance);if(buoys?.length)return false;void stock;
 if((loaded||0)<=c.lowShells)return true;if(Number.isFinite(belt)&&belt<=c.lowBelt)return true;
 if(afterWave){if((loaded||0)<mags.ammo[0]*c.waveShare)return true;if(Number.isFinite(belt)&&belt<mags.belt*c.waveShare)return true;}
 return false;
}
/** Where the buoy floats: 45 to 70 units ahead of the ship's heading, up to 40 degrees to a side, inside the sailing bounds. */
export function navalBuoySpot(ship,random,bounds,balance){
 const c=navalSupplyConfig(balance),r=typeof random==='function'?random:()=>.5,d=c.near+(c.far-c.near)*r(),a=(ship.heading||0)+(r()-.5)*2*c.spread;
 return {x:clamp(ship.x+Math.cos(a)*d,bounds.minX+8,bounds.maxX-8),z:clamp(ship.z+Math.sin(a)*d,bounds.minZ+8,bounds.maxZ-8),born:0};
}
/** Sailing into a buoy: a full magazine of fresh shells (the stock grows by what the magazine was missing), the belt is full again, and a
 * few rounds of the other weapons are added (never above the stage's count). Returns {loaded, added[], belt}. */
export function navalCollect(ammo,loaded,belt,mags,settings,balance){
 const c=navalSupplyConfig(balance),stage=settings?.ammunition||mags.ammo,before=[...ammo];ammo[0]=(ammo[0]||0)+Math.max(0,mags.ammo[0]-Math.min(loaded||0,mags.ammo[0]));
 ammo[1]=Math.min(stage[1]||0,(ammo[1]||0)+c.refill.guided);ammo[2]=Math.min(stage[2]||0,(ammo[2]||0)+c.refill.torpedo);ammo[3]=Math.min(stage[3]||0,(ammo[3]||0)+c.refill.mine);ammo[4]=Math.min(stage[4]||0,(ammo[4]||0)+c.refill.salvo);
 return {loaded:navalLoad(ammo[0],mags.ammo[0]),added:ammo.map((n,i)=>n-before[i]),belt:Number.isFinite(belt)?mags.belt-belt:0};
}
export function navalBuoyReached(ship,buoy,balance){return Math.hypot(ship.x-buoy.x,ship.z-buoy.z)<=navalSupplyConfig(balance).collect;}
