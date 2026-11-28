/** Ships v24.8 "harder" (Roy, 21/11/2026): "it should be harder to lock on in the ships' firing, and there should be more enemies, also
 * a bit more fire against". Pure rules (no clock, no DOM, no random term), shared by the model, the input layer and the tests.
 * `?navalHarder=0` restores v24.7 exactly. Every value is a [stage 1, stage 30] pair blended linearly, so the lock changes least at stage 1.
 *  - Lock: a finger must land nearer the hull to pick it (`pickScale`), the radar needs longer (`needScale`) and reaches less far
 *    (`rangeScale`), a held lock or an acquisition forgives less when its hull leaves the reach (`marginScale`, `graceScale`), and the radar
 *    now has to track: when the hull's bearing swings fast (the hull sails across, or the player sails across or turns) the gauge fills
 *    slower (from `slowSpeed` sea units a second across the line of sight), stands still at `breakSpeed`, and after `breakSeconds` at a standstill the acquisition or the
 *    lock is lost. A hull that is being acquired or is locked sails faster (`evade`), through the same patrol the aim forecast flies, so
 *    the lock's own shot stays honest.
 *    (`slowSpeed` and `breakSpeed` rise a little with the stage because the hulls themselves sail three times faster late on; the
 *    values were set with the child bot, workout/island/tools/naval-harder-sim.mjs.)
 *  - Fleet: `extraShips` more hulls a stage and `extraConcurrent` more on the water at once; the stage clock grows by `secondsPerShip`
 *    of one hull's share of it for every added hull, so the added work is not a hidden time limit.
 *  - Fire: the whole fleet fires `totalRate` of what it fired before (a bit more, not a lot). More hulls fire at once, so the gap between
 *    two shots of one hull (and of a shore gun) is set from the number of hulls on the water: `intervalScale` = hulls now / hulls before / totalRate.
 *    A longer stage with more hulls means more shells over the whole stage, so a hit may cost `damageScale` of the hull it cost before. */
import {polishValue} from './polish-flag.mjs?v=island-v2-20261107-26';
export const navalHarderEnabled=search=>polishValue('navalHarder',search)!=='0';
export const NAVAL_HARDER_DEFAULTS=Object.freeze({
 lock:Object.freeze({pickScale:[.8,.6],needScale:[1.1,1.15],rangeScale:[.97,.95],marginScale:[.6,.3],graceScale:[.8,.6],
  slowSpeed:[35,45],breakSpeed:[85,100],breakSeconds:[1.1,1],turnShare:.2}),
 evade:Object.freeze({speed:[1.1,1.3],easeSeconds:.5}),
 fleet:Object.freeze({extraShips:[1,2],extraConcurrent:[1,1],secondsPerShip:1.2,maxConcurrent:5}),
 fire:Object.freeze({totalRate:[1.25,1.2],damageScale:[.85,.7]})
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),DEG=Math.PI/180;
export function navalHarderConfig(balance){const b=balance?.harder||{},d=NAVAL_HARDER_DEFAULTS;return {lock:{...d.lock,...(b.lock||{})},evade:{...d.evade,...(b.evade||{})},fleet:{...d.fleet,...(b.fleet||{})},fire:{...d.fire,...(b.fire||{})}};}
/** Stage share 0..1 (stage 1 to 30) and the blend of a [first, last] pair (a plain number stays as it is). */
export const navalHarderShare=stage=>clamp(((Number(stage)||1)-1)/29,0,1);
const at=(pair,u)=>Array.isArray(pair)?pair[0]+(pair[1]-pair[0])*u:pair;
/** The resolved numbers of one stage. */
export function navalHarderStage(stage,balance){
 const c=navalHarderConfig(balance),u=navalHarderShare(stage),l=c.lock;
 return {stage:Math.max(1,Number(stage)||1),
  lock:{pickScale:at(l.pickScale,u),needScale:at(l.needScale,u),rangeScale:at(l.rangeScale,u),marginScale:at(l.marginScale,u),graceScale:at(l.graceScale,u),
   slowSpeed:at(l.slowSpeed,u),breakSpeed:at(l.breakSpeed,u),breakSeconds:at(l.breakSeconds,u),turnShare:l.turnShare},
  evade:{speed:at(c.evade.speed,u),easeSeconds:c.evade.easeSeconds},
  fleet:{extraShips:Math.round(at(c.fleet.extraShips,u)),extraConcurrent:Math.round(at(c.fleet.extraConcurrent,u)),secondsPerShip:c.fleet.secondsPerShip,maxConcurrent:c.fleet.maxConcurrent},
  fire:{totalRate:at(c.fire.totalRate,u),damageScale:at(c.fire.damageScale,u)}};
}
/** The lock settings of the input layer with the smaller pick window. */
export function navalHarderPick(lockConfig,hard){return hard?{...lockConfig,pickPixels:lockConfig.pickPixels*hard.lock.pickScale,barLift:lockConfig.barLift*hard.lock.pickScale}:lockConfig;}
/** The radar settings (naval-v241.mjs) with the shorter reach and the smaller forgiveness. */
export function navalHarderRadar(radar,hard){
 if(!hard)return radar;const l=hard.lock,out={...radar,range:radar.range*l.rangeScale,breakMargin:radar.breakMargin*l.marginScale,graceSeconds:radar.graceSeconds*l.graceScale,min:radar.min*l.needScale,max:radar.max*l.needScale};
 for(const k of ['missileRange','torpedoRange'])if(Number.isFinite(radar[k]))out[k]=radar[k]*l.rangeScale;return out;
}
/** Seconds the radar needs, from the v24.7 seconds. */
export const navalHarderNeed=(seconds,hard)=>hard?seconds*hard.lock.needScale:seconds;
/** How hard the hull is to follow, in sea units a second: its speed across the line of sight as the player sees it (the swing of its
 * bearing between two frames times its distance, so the player's own sailing counts and a near hull is not punished), plus `turnShare`
 * units for every degree a second of the player's own turn. `before` and `now`: {bearing, heading} (radians), `now.distance`. */
export function navalTrackRate(before,now,dt,hard){
 if(!before||!now||!(dt>0))return 0;const d=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
 return (d(now.bearing,before.bearing)*(now.distance||0)+hard.lock.turnShare*d(now.heading,before.heading)/DEG)/dt;
}
/** Tracking quality 1..0: 1 up to `slowSpeed`, 0 from `breakSpeed`. The gauge fills at this share of its speed. */
export function navalTrackQuality(rate,hard){const l=hard.lock;return clamp(1-(rate-l.slowSpeed)/Math.max(1e-6,l.breakSpeed-l.slowSpeed),0,1);}
/** One frame of the tracker. `state`: {lost} seconds at a standstill so far. Returns the quality, the new state and `broken`. */
export function navalTrackStep(state,rate,dt,hard){
 const quality=navalTrackQuality(rate,hard),lost=quality<=0?(state?.lost||0)+dt:0;
 return {quality,lost,broken:lost>=hard.lock.breakSeconds};
}
/** The speed a hull sails at this frame: its own patrol speed, eased up to `evade.speed` of it while the radar is on it. */
export function navalEvadeSpeed(current,base,alerted,dt,hard){
 const target=base*(alerted?hard.evade.speed:1),k=1-Math.exp(-Math.max(0,dt)/Math.max(1e-6,hard.evade.easeSeconds));return current+(target-current)*k;
}
/** The campaign of a stage with the larger fleet, more hulls at once, the faster enemy fire and the longer clock. The added hulls are
 * plain patrol escorts (the stage's own escort kind, the first ship type otherwise) placed before the boss or the base rows. */
export function navalHarderCampaign(campaign,balance,stage){
 const hard=navalHarderStage(stage,balance),{settings}=campaign,moving=campaign.fleet.filter(row=>row.behavior!=='base').length;
 const extra=Math.max(0,hard.fleet.extraShips),kind=campaign.battle?.escortKind??0;
 const escorts=Array.from({length:extra},()=>({kind,behavior:'patrol',boss:false,harder:true}));
 const boundary=campaign.fleet.findIndex(row=>row.boss||row.behavior==='base'),fleet=[...campaign.fleet];
 fleet.splice(boundary<0?fleet.length:boundary,0,...escorts);
 const concurrent=Math.min(moving+extra,Math.max(settings.concurrent,Math.min(hard.fleet.maxConcurrent,settings.concurrent+hard.fleet.extraConcurrent)));
 const tactics=settings.enemyTactics||{telegraphSeconds:1.8,fireSeconds:10,speedScale:1};
 // More hulls fire at once, so each one fires a little less often: together they fire `totalRate` of v24.7.
 const intervalScale=concurrent/Math.max(1,Math.min(settings.concurrent,moving))/hard.fire.totalRate;hard.fire.intervalScale=intervalScale;
 return {...campaign,fleet,harder:hard,
  settings:{...settings,waves:fleet.length,concurrent,seconds:Math.round(settings.seconds*(1+hard.fleet.secondsPerShip*extra/Math.max(1,moving))),
   enemyTactics:{...tactics,fireSeconds:tactics.fireSeconds*intervalScale}}};
}
