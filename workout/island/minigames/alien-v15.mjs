/** Aliens v15 (Roy, 10-11/11/2026, after testing v20 on his phone): "the fire against the ships is cool and
 * sounds like a Vulcan, but there are far too many shots; it should be much more, let us call it, reduced.
 * You just press and fire and finish the stage in a second" and "no change yet, it still fires far too many
 * shots in normal time". v14 measured through the real fire button still gave about 10 shots per second
 * (13.8/s nominal, 18/s cap, 3.5 s of fire per heat cycle), so the stream Roy saw was real.
 *
 * v15: normal fire is a steady cannon at 4 shots per second (gear can raise it to at most 5/s, the rapid
 * bonus to at most 6.7/s), each shot heavy enough to matter. The Vulcan BRRRT is a short burst only: the first
 * 1.2 s of a press while the heat gauge is cold, then a forced 2 s cool-down, then steady fire; the burst
 * comes back after about 1.5 s without firing. A hard token-bucket cap at the single spawn point (fireShot)
 * bounds projectiles per second whatever the gear, bonus or input path. Alien health scales with the ship's
 * damage output as in v14, so stage 1 stays about 90-130 s for a good player.
 * ?alienV15=0 (or globalThis.__alienV15=false) restores v14. Numbers: config.json alienDefense.v15
 * (V15_DEFAULTS below are the fallback). Dependency-free so tests and sims can import it. */
export function alienV15Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienV15){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienV15')!=='0';
}
export const V15_DEFAULTS=Object.freeze({
 normalInterval:.25,   // steady cannon: 4 shots per second
 minInterval:.2,       // floor with all gear multipliers: 5 shots per second
 rapidMinInterval:.15, // floor while the rapid bonus is active: about 6.7 shots per second
 burstInterval:.1,     // Vulcan burst: 10 shots per second
 burstSeconds:1.2,     // how long a burst can run before the guns overheat
 coolSeconds:2,        // forced silence after a burst
 rechargeSeconds:1.5,  // time without firing until a new burst is available
 warmHeat:.35,         // gauge level shown while the cannon fires steadily after a burst
 normalDamage:1,       // damage of a steady shot (v14 bullets were 0.406)
 burstDamage:.5,       // damage of a burst bullet (10/s x .5 = 5 damage per second)
 capPerSecond:15,      // hard cap on projectiles per second at the spawn point
 capBurst:6,           // bucket size: one spread round (3) plus two wing shots pass, a stream does not
 gearExp:1
});
export function v15Config(balance){return {...V15_DEFAULTS,...(balance?.v15||{})};}
/** Fire gate state machine. state={heat,cool,spent}. Returns the next state plus mode and firing.
 * modes: 'idle' (not firing), 'burst' (Vulcan), 'cool' (locked), 'normal' (steady cannon). */
export function fireGate(state,wantFire,dt,cfg=V15_DEFAULTS){
 let {heat=0,cool=0,spent=false}=state;
 if(cool>0){cool=Math.max(0,cool-dt);heat=cool>0?Math.max(cfg.warmHeat,1-(1-cfg.warmHeat)*(1-cool/cfg.coolSeconds)):cfg.warmHeat;return {heat,cool,spent:true,mode:'cool',firing:false};}
 if(wantFire){
  if(!spent){heat=Math.min(1,heat+dt/cfg.burstSeconds);if(heat>=1)return {heat:1,cool:cfg.coolSeconds,spent:true,mode:'burst',firing:true,overheat:true};return {heat,cool:0,spent:false,mode:'burst',firing:true};}
  return {heat:cfg.warmHeat,cool:0,spent:true,mode:'normal',firing:true};
 }
 heat=Math.max(0,heat-dt/cfg.rechargeSeconds);
 return {heat,cool:0,spent:spent&&heat>0,mode:'idle',firing:false};
}
/** Seconds between trigger pulls for a mode. gearRate = every rate multiplier the ship has (equipment, hangar
 * rank, permanent upgrades, power, bonuses); the floor holds whatever it is. */
export function fireInterval(mode,gearRate=1,rapid=false,cfg=V15_DEFAULTS){
 if(mode==='burst')return cfg.burstInterval;
 const floor=rapid?cfg.rapidMinInterval:cfg.minInterval;
 return Math.max(floor,cfg.normalInterval/Math.max(1,gearRate));
}
/** Damage factor of one bullet in a mode (multiplies the ship's gear damage). */
export function shotDamage(mode,cfg=V15_DEFAULTS){return mode==='burst'?cfg.burstDamage:cfg.normalDamage;}
/** Token bucket at the spawn point: at most capPerSecond projectiles per second, capBurst at once. */
export function createSpawnCap(cfg=V15_DEFAULTS){
 let tokens=cfg.capBurst,at=0,dropped=0;
 return {
  allow(time){if(time>at){tokens=Math.min(cfg.capBurst,tokens+(time-at)*cfg.capPerSecond);at=time;}if(tokens>=1){tokens-=1;return true;}dropped++;return false;},
  get dropped(){return dropped;},get tokens(){return tokens;}
 };
}
/** The largest rate multiplier the gear can still realise under the floor (for alien health scaling). */
export function v15RateCap(cfg=V15_DEFAULTS){return cfg.normalInterval/cfg.minInterval;}
