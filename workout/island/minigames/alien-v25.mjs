/** Aliens v25 Vulcan (Roy, 14/11/2026, after v24 on the phone): "the Vulcan fire is not that good. It should last longer, and cool
 * down before it reaches the end too, I mean if you do not fire it, it cools. And in any case the fire should be more massive when you
 * fire it, compared to the regular one."
 * v24 (the v23 gate): 10 bullets per second, the gauge full after 12 of them (1.2 s of fire), then a 2 s lock; after the button came up
 * the gauge waited 0.5 s and then cooled a full gauge in 2 s; a Vulcan bullet (.45) hit as hard per second as the steady cannon (4.5 vs
 * 4.4), drawn as the same thin yellow tracer. v25, on the same two buttons and the same gate functions (vulcanGate / vulcanShot):
 *  - longer: the gauge fills in heatShots x vulcanInterval = 3.6 s of continuous fire (3x), then the same 2 s lock.
 *  - it cools whenever it is not firing: 0.15 s after the button comes up the gauge already drains, a full gauge in 1.6 s (faster than it
 *    fills), so a child who lets go at yellow sees it go back to green; holding it to the end still locks it.
 *  - massive: 15 bullets per second (was 10), each one a little heavier per second than the cannon (15 x .4 = 6 damage per second, 1.35x
 *    the cannon's 4.4); every bullet is drawn as three plasma pellets (the Codex aliens-vulcan-v2 plasma, a 2 degree spread), with a
 *    spinning muzzle flash on both barrels, impact bursts on the aliens, steam at the lock, and the Codex rotary loop sound with its
 *    spin-up and spin-down instead of the click per bullet. The extra pellets are presentation only: the hit test and the damage are the
 *    real bullet's.
 *  - bounded: Vulcan bullets have their own spawn cap (capPerSecond); the fan bonus and the escort wings join every wingEvery-th Vulcan
 *    tick, so they keep about the cannon's pace instead of tripling with the barrels.
 * Both buttons together keep the v23 rule: the Vulcan's barrels set the pace and each tick carries the cannon's shot when that is due.
 * ?alienVulcan=v24 (or globalThis.__alienVulcan='v24') restores v24 exactly. Numbers: config.json alienDefense.v25 (V25_DEFAULTS below is
 * the fallback). Pure: no DOM, no clock, so tests and sims import it. */
import {v23Config} from './alien-v23.mjs?v=island-v2-20261107-21';
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function alienVulcanV25Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienVulcan){
 if(flag==='v24'||flag===false)return false;return param('alienVulcan',search)!=='v24';
}
export const V25_DEFAULTS=Object.freeze({
 vulcanInterval:1/15, // 15 Vulcan ticks per second (v24: 10)
 heatShots:54,        // ticks from a cold gauge to a full one: 54/15 = 3.6 s of continuous fire (v24: 1.2 s)
 lockSeconds:2,       // a full gauge still locks the Vulcan for 2 s (red blink, the gauge drains)
 restSeconds:.15,     // the gauge starts to cool this soon after the last Vulcan tick (v24: .5)
 coolSeconds:1.6,     // a full gauge cools to empty in this long once resting (v24: 2)
 vulcanDamage:.4,     // a Vulcan bullet; 15/s x .4 = 6 damage per second, 1.35x the steady cannon (5.6/s x .8)
 pellets:3,           // plasma pellets drawn per bullet (presentation only)
 pelletSpread:.035,   // radians between pellets (about 2 degrees), so the stream fans a little with distance
 capPerSecond:18,     // spawn cap for Vulcan bullets (the v15 cap of 15/s still bounds every other projectile)
 capBurst:4,
 wingEvery:3          // the fan bonus and the wings join one Vulcan tick in this many
});
/** The v23 config (regular cannon, colours, key) with the v25 Vulcan numbers on top; config.json alienDefense.v25 overrides. */
export function v25Config(balance){return {...v23Config(balance),...V25_DEFAULTS,...(balance?.v25||{})};}
/** Lateral offsets (model units) of the pellets of one bullet that has flown `distance`: the middle one on the bullet, the others fanning. */
export function pelletOffsets(distance,cfg=V25_DEFAULTS){
 const n=Math.max(1,Math.round(cfg.pellets||1)),spread=cfg.pelletSpread||0,out=[];
 for(let i=0;i<n;i++){const k=i-(n-1)/2;out.push(k*(3+Math.max(0,distance)*Math.tan(spread)));}
 return out;
}
/** Seconds of continuous fire from a cold gauge to the lock, and seconds for a gauge at `heat` to cool to empty after the button comes up. */
export function vulcanFireSeconds(cfg){return cfg.heatShots*cfg.vulcanInterval;}
export function vulcanCoolSeconds(cfg,heat=1){return (cfg.restSeconds||0)+Math.max(0,Math.min(1,heat))*cfg.coolSeconds;}
/** Damage per second of the Vulcan alone, and of the steady cannon alone (gear 1, no bonus). */
export function vulcanDps(cfg){return cfg.vulcanDamage/cfg.vulcanInterval;}
export const VULCAN_V25_ASSETS=Object.freeze({plasma:'plasma-256.png',muzzle:'muzzle-256.png',impact:'impact-256.png',steam:'steam-256.png'});
