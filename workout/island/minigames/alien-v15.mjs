/** Aliens v15 (Roy, 10-11/11/2026, after testing v20 on his phone): "the fire against the ships is cool and
 * sounds like a Vulcan, but there are far too many shots; it should be much more, let us call it, reduced.
 * You just press and fire and finish the stage in a second" and "no change yet, it still fires far too many
 * shots in normal time". v14 measured through the real fire button still gave about 10 shots per second
 * (13.8/s nominal, 18/s cap, 3.5 s of fire per heat cycle), so the stream Roy saw was real.
 *
 * v15: normal fire is a steady cannon at about 5.6 shots per second (gear can raise it to at most 6/s, the rapid
 * bonus to at most 7.7/s), each shot heavy enough to matter. The Vulcan BRRRT is a short burst only: the first
 * 1.2 s of a press while the heat gauge is cold, then a forced 2 s cool-down, then steady fire; the burst
 * comes back after about 1.5 s without firing (1 s of rest, then the warm gauge cools in about half a second).
 * 12/11/2026 (independent QA): quick taps kept the gauge cold, because it cooled the moment the button came up,
 * so a child tapping fast got the Vulcan forever (9.7 shots/s at 10 taps/s, the same as v20). Now the gauge
 * cools only after `restSeconds` without firing, and every press counts at least `pressShots` burst shot of
 * heat: taps add up to one short burst, then the cool-down and the steady cannon (whose interval also limits
 * taps). `?alienTaps=v15` restores the first v15 gate (restSeconds 0, pressShots 0). A hard token-bucket cap at the single spawn point (fireShot)
 * bounds projectiles per second whatever the gear, bonus or input path. Alien health scales with the ship's
 * damage output as in v14, so stage 1 stays about 90-130 s for a good player.
 * ?alienV15=0 (or globalThis.__alienV15=false) restores v14. Numbers: config.json alienDefense.v15
 * (V15_DEFAULTS below are the fallback). Dependency-free so tests and sims can import it. */
export function alienV15Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienV15){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienV15')!=='0';
}
export const V15_DEFAULTS=Object.freeze({
 normalInterval:.18,   // steady cannon: about 5.6 shots per second (Roy, 11/11 evening: 'a little more fire', between the old 10 and 4)
 minInterval:.167,     // floor with all gear multipliers: 6 shots per second
 rapidMinInterval:.13, // floor while the rapid bonus is active: about 7.7 shots per second
 burstInterval:.1,     // Vulcan burst: 10 shots per second
 burstSeconds:1.2,     // how long a burst can run before the guns overheat
 coolSeconds:2,        // forced silence after a burst
 rechargeSeconds:1.5,  // seconds for a full gauge to cool once resting (the warm gauge after steady fire: about half a second)
 restSeconds:1,        // the gauge starts to cool only after this long without firing (taps cannot keep it cold)
 pressShots:1,         // a press, however short, heats the gauge by at least this many burst shots
 warmHeat:.35,         // gauge level shown while the cannon fires steadily after a burst
 normalDamage:.8,      // damage of a steady shot (v14 bullets were 0.406): 5.6/s x .8 = 4.4 damage per second
 burstDamage:.5,       // damage of a burst bullet (10/s x .5 = 5 damage per second)
 capPerSecond:15,      // hard cap on projectiles per second at the spawn point
 capBurst:6,           // bucket size: one spread round (3) plus two wing shots pass, a stream does not
 gearExp:1,
 secondsMult:1.5,        // stage clock: fewer bullets need more time, a slow child must not lose to the clock
 convergeDistance:300    // the two wing cannons aim at the ship's centre line this far ahead (model units), like a fighter's guns
});
/** Horizontal speed of a wing-cannon shot so it crosses the centre line convergeDistance ahead. At a phone's
 * 844x390 the model's hit test is stretched 2.9x in x, so a straight shot from a wing (11 units out) misses an
 * alien centred on the ship; converging shots hit what the child is under. */
export function convergeVx(side,offset,shotSpeed,cfg=V15_DEFAULTS){return cfg.convergeDistance>0?-side*offset*shotSpeed/cfg.convergeDistance:0;}
export function v15Config(balance,search=globalThis.location?.search||''){const cfg={...V15_DEFAULTS,...(balance?.v15||{})};return alienTapsV15(search)?{...cfg,restSeconds:0,pressShots:0}:cfg;}
/** ?alienTaps=v15: the first v15 gate, where the gauge cooled the moment the button came up (taps bypassed the burst). */
export function alienTapsV15(search=globalThis.location?.search||''){try{return new URLSearchParams(search).get('alienTaps')==='v15';}catch{return false;}}
/** Fire gate state machine. state={heat,cool,spent}. Returns the next state plus mode and firing.
 * modes: 'idle' (not firing), 'burst' (Vulcan), 'cool' (locked), 'normal' (steady cannon). */
export function fireGate(state,wantFire,dt,cfg=V15_DEFAULTS){
 let {heat=0,cool=0,spent=false,rest=0,held=false,press=0}=state;
 if(cool>0){cool=Math.max(0,cool-dt);heat=cool>0?Math.max(cfg.warmHeat,1-(1-cfg.warmHeat)*(1-cool/cfg.coolSeconds)):cfg.warmHeat;return {heat,cool,spent:true,mode:'cool',firing:false,rest:0,held:Boolean(wantFire),press:0};}
 if(wantFire){
  if(!spent){const add=dt/cfg.burstSeconds;heat=Math.min(1,heat+add);press+=add;if(heat>=1)return {heat:1,cool:cfg.coolSeconds,spent:true,mode:'burst',firing:true,overheat:true,rest:0,held:true,press:0};return {heat,cool:0,spent:false,mode:'burst',firing:true,rest:0,held:true,press};}
  return {heat:cfg.warmHeat,cool:0,spent:true,mode:'normal',firing:true,rest:0,held:true,press:0};
 }
 // A burst press that ends before one burst interval still heats the gauge by a whole shot, so taps add up like a hold.
 const shotHeat=(cfg.pressShots||0)*cfg.burstInterval/cfg.burstSeconds;
 if(held&&!spent&&press<shotHeat){heat=Math.min(1,heat+shotHeat-press);if(heat>=1)return {heat:1,cool:cfg.coolSeconds,spent:true,mode:'cool',firing:false,overheat:true,rest:0,held:false,press:0};}
 rest+=dt;if(rest>(cfg.restSeconds||0))heat=Math.max(0,heat-dt/cfg.rechargeSeconds);
 return {heat,cool:0,spent:spent&&heat>0,mode:'idle',firing:false,rest,held:false,press:0};
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
