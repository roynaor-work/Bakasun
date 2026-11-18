/** Ships v24 (Roy, 14/11/2026, after v23 on the phone). Pure rules (no clock, no DOM, random passed in), shared by the model, the
 * forecast, the input layer and the HUD. Three switches, each restoring v23 exactly:
 *  - Aim (`?navalAim=v23`): "the aiming is a serious improvement; I want one more level". A short tap on a hull locks it (a long press is
 *    not needed any more), a Lock button next to Fire picks the most dangerous or nearest target in one tap and a swipe on it moves the
 *    lock along the fleet, the lock moves on by itself when its hull sinks, the Vulcan's crosshair locks onto the nearest aircraft while
 *    its button is held, and the screen shows where the shell will meet the hull (a ring on the forecast hull, green when the shot will
 *    hit). The solver itself is v23's (forecast fleet along its real patrol path, wind included).
 *  - Enemy fire (`?navalEnemyFire=v23`): "the enemies should fire a lot more". Every hull and every shore gun fires more often, from
 *    1.45x at stage 1 to 1.6x from stage 20, and from stage 6 every third shot of a hull is a salvo of three shells along the ship's
 *    course (about 2.5x the shells of v23 from stage 10, measured), every shot is marked by a red
 *    pulsing decal before it lands, and a hit costs less hull (many lives) so a child is pushed to keep moving, not sunk fast.
 *  - Submarine (`?navalSub=v23`): "when a submarine is under water only a torpedo should hit it; it can stay under water and fire
 *    under water only". A diving submarine is out of reach of shells, missiles and mines (they pass over with a small splash and the
 *    word "under water"); only the torpedo (3 to 5 a stage, its own button while a submarine is out) hits it, and from under water it
 *    fires torpedoes only (a bubble line and a red decal you can sail away from). It surfaces briefly, and then shells hit it too. */
import {polishLegacy,polishValue} from './polish-flag.mjs?v=island-v2-20261107-18';
export const navalAimV24=search=>!polishLegacy('navalAim',search)&&!['v19','v20','v23'].includes(polishValue('navalAim',search));
export const navalEnemyFireV24=search=>polishValue('navalEnemyFire',search)!=='v23';
export const navalSubV24=search=>polishValue('navalSub',search)!=='v23';
export const NAVAL_V24_DEFAULTS=Object.freeze({
 // snapDeg: a ready lock within this many degrees fires at once (the turret snaps the rest). A locked shell is never the weak centre
 // (the gold star x1.75 stays a hand-aimed shot), so a lock does not end a stage in seconds.
 aim:Object.freeze({tapSeconds:.32,tapPixels:12,stickySeconds:.7,swipePixels:26,dangerSeconds:3,skyMagnetDeg:42,skyRate:16,snapDeg:3,nearRange:150}),
 // Fire rate multiplier from `rateFirst` (stage 1) to `rateLast` (stage `rateStage` on), on v23's fireSeconds; the warning stays v23's
 // (`telegraphMult` 1, a fair reaction time for a 7-year-old; never under `telegraphMin`), now drawn as a red pulsing decal; `lead` of the ship's velocity times the time to impact is added to the
 // aim point (sailing straight on is not always safe, turning is); hits cost `damageMult` of v23. Salvos from `salvoStage`.
 enemyFire:Object.freeze({rateFirst:1.45,rateLast:1.6,rateStage:20,telegraphMult:1,telegraphMin:1.3,lead:.35,damageMult:.75,errorMult:.8,firstShot:.5,
  salvoStage:6,salvoShots:3,salvoGap:.32,salvoStep:13,salvoEvery:3,baseReloadMult:.5,baseTelegraphMin:1.4,staggerMult:.6}),
 sub:Object.freeze({cycle:12,surface:3,torpedoes:Object.freeze([3,5]),firstDive:2.5,enemyTorpedoSeconds:2.6,telegraphMin:1.5,fireMult:1.1})
});
export function navalV24Config(balance){const b=balance?.v24||{};return {aim:{...NAVAL_V24_DEFAULTS.aim,...(b.aim||{})},enemyFire:{...NAVAL_V24_DEFAULTS.enemyFire,...(b.enemyFire||{})},sub:{...NAVAL_V24_DEFAULTS.sub,...(b.sub||{})}};}
/** Enemy fire-rate multiplier at a stage (linear between the first and the last value). */
export function navalFireRate(stage,cfg=NAVAL_V24_DEFAULTS.enemyFire){const s=Math.max(1,Number(stage)||1),u=Math.min(1,(s-1)/Math.max(1,cfg.rateStage-1));return cfg.rateFirst+(cfg.rateLast-cfg.rateFirst)*u;}
/** Seconds between two shots of a hull (v23 `fireSeconds` and its behaviour factor) at a stage. */
export function navalFireSeconds(fireSeconds,stage,cfg=NAVAL_V24_DEFAULTS.enemyFire){return fireSeconds/navalFireRate(stage,cfg);}
export function navalTelegraph(seconds,cfg=NAVAL_V24_DEFAULTS.enemyFire,min=cfg.telegraphMin){return Math.max(min,seconds*cfg.telegraphMult);}
/** Where an enemy shot is aimed: the ship's position, plus `lead` of its velocity over the time to impact, plus a bounded scatter. A salvo
 * lays `salvoShots` points `salvoStep` apart along the ship's course (or across it when the ship is still), so standing still or sailing
 * straight on can be caught, and a turn gets out. */
export function navalEnemyAim(player,{seconds=2,error=0,random=Math.random,salvo=1,cfg=NAVAL_V24_DEFAULTS.enemyFire}={}){
 const speed=Number(player.speed)||0,h=player.heading||0,lead=cfg.lead*speed*seconds,cx=player.x+Math.cos(h)*lead,cz=(player.z||0)+Math.sin(h)*lead;
 const ex=(random()-.5)*error*cfg.errorMult,ez=(random()-.5)*error*cfg.errorMult,points=[];
 const ax=speed>2?Math.cos(h):-Math.sin(h),az=speed>2?Math.sin(h):Math.cos(h);
 for(let i=0;i<salvo;i++){const k=i-(salvo-1)/2;points.push({x:cx+ex+ax*k*cfg.salvoStep,z:cz+ez+az*k*cfg.salvoStep});}
 return points;
}
/** Submarine depth (0 surfaced, 1 diving) at `age` seconds after it joined: v24 dives after `firstDive` and surfaces for `surface` of every
 * `cycle`; v23 (no subMode) keeps its own cycle. */
export function navalSubDepth(e,age,balance){
 // v24.1 (naval-v241.mjs, `?navalSub=v24` keeps the v24 cycle): a deep submarine never comes up.
 if(e?.subMode==='v24'&&e.subDeep)return 1;
 if(e?.subMode==='v24'){const c={...NAVAL_V24_DEFAULTS.sub,...(balance?.v24?.sub||{})},a=Math.max(0,age);if(a<c.firstDive)return 0;return ((a-c.firstDive)%c.cycle)<c.cycle-c.surface?1:0;}
 const combat=balance?.combat||{};return age%combat.submarineCycle>combat.submarineSurface?1:0;
}
/** Seconds a v24 submarine stays under water from `age` (0 when it is up): it only starts a torpedo run it can finish under water. */
export function navalSubDiveLeft(e,age,balance){if(e?.subMode==='v24'&&e.subDeep)return Infinity;const c={...NAVAL_V24_DEFAULTS.sub,...(balance?.v24?.sub||{})},a=Math.max(0,age);if(e?.subMode!=='v24'||a<c.firstDive)return 0;const phase=(a-c.firstDive)%c.cycle;return Math.max(0,c.cycle-c.surface-phase);}
/** v24 rule: a diving submarine can only be hit by a torpedo (ammo 2). */
export function navalSubShield(e,ammoIndex,balance){return e?.subMode==='v24'&&balance?.shipTypes?.[e.kind??0]?.submarine&&e.depth>(balance.combat?.submarineHitDepth??.3)&&ammoIndex!==2;}
/** Torpedoes for a stage with the v24 submarine: the stock clamped to 3..5. */
export function navalTorpedoStock(stock,cfg=NAVAL_V24_DEFAULTS.sub){return Math.max(cfg.torpedoes[0],Math.min(cfg.torpedoes[1],Number(stock)||0));}
/** Smart lock order: hulls about to fire at you first (a warning shorter than `dangerSeconds`), then the nearest; only live hulls the
 * current weapon can reach count first, the rest follow. Returns the ordered indices. */
export function navalLockOrder(enemies,player,{time=0,canHit=()=>true,cfg=NAVAL_V24_DEFAULTS.aim}={}){
 const live=(enemies||[]).filter(e=>e?.active&&e.hp>0&&Number.isFinite(e.x)&&Number.isFinite(e.z));
 const score=e=>{const d=Math.hypot(e.x-player.x,e.z-(player.z||0)),warn=e.attack?Math.max(0,(e.attack.fireTime??time)-time):Infinity,danger=warn<=cfg.dangerSeconds?1:0;return {e,d,danger,hit:canHit(e)?1:0,warn};};
 return live.map(score).sort((a,b)=>b.hit-a.hit||b.danger-a.danger||(a.danger&&b.danger?a.warn-b.warn:0)||a.d-b.d).map(s=>s.e.index);
}
/** Next index in the lock order after `current` (dir +1 or -1), wrapping. */
export function navalLockNext(order,current,dir=1){if(!order.length)return null;const i=order.indexOf(current);if(i<0)return order[0];return order[(i+(dir<0?-1:1)+order.length)%order.length];}
/** How likely the shell is to meet the hull, for the colour of the ring on the forecast hull: 1 ready (safe hit), .6 while the lock turns
 * or the aim is near, .2 a miss, 0 out of reach. */
export function navalHitChance(prediction,homing){
 if(homing){const s=homing.status;return s==='ready'?1:s==='turning'?.6:s==='far'||s==='near'?0:.2;}
 if(!prediction)return 0;if(prediction.contact&&prediction.safe!==false)return 1;if(prediction.contact)return .6;return .2;
}
export const NAVAL_V24_COLORS=Object.freeze({hit:'#5CF29A',maybe:'#FFD166',miss:'#FF8A5C',decal:'#FF3B30',sonar:'#7FE8FF',bubbles:'#E8FBFF'});
export const navalChanceColor=c=>c>=.95?NAVAL_V24_COLORS.hit:c>=.5?NAVAL_V24_COLORS.maybe:NAVAL_V24_COLORS.miss;
