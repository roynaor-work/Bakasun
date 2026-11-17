/** Aliens v24 (Roy, 14/11/2026, after v23 on the phone): "it worked. But the buttons are too big and hide [the screen]. They
 * should be elegant, at the side." and, still open from v22.1: "the Vulcan ... needs a way to refill it".
 *  - HUD: the three fire buttons (steady cannon, Vulcan, missile) become thin, half-transparent rings with an icon in one column at
 *    the right edge, above the ship's lane and far from the stick, so they cover neither the aliens nor the ship. Touch targets stay
 *    at least 56 px. The Vulcan's heat is a thin arc around its ring. `?alienHud=v23` restores the v23 row of big buttons.
 *  - Refill: a Vulcan magazine drops from downed aliens (the boss at a phase change; while the Vulcan is in use, always from the big
 *    ships, heavy and carrier, and sometimes from the others) and falls toward the ship like a bonus. Flying into it empties the gauge,
 *    ends a lock at once and keeps the barrels cold for `coldSeconds` (the Vulcan heats no more meanwhile). The steady cannon is never
 *    touched and the Vulcan button never leaves the screen. `?alienRefill=0` restores v23 (no magazines).
 * Pure helpers (no DOM, no clock, random passed in) so tests and sims can import them. Numbers: config.json alienDefense.v24
 * (V24_DEFAULTS below are the fallback). */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function alienHudV24Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienHud){
 if(flag==='v23'||flag===false)return false;return param('alienHud',search)!=='v23';
}
export function alienRefillEnabled(search=globalThis.location?.search||'',flag=globalThis.__alienRefill){
 if(flag==='0'||flag===false)return false;return param('alienRefill',search)!=='0';
}
export const V24_DEFAULTS=Object.freeze({
 refill:Object.freeze({
  bigKinds:Object.freeze([1,4]), // heavy and carrier ("the big ships"): always drop a magazine (with the gap below)
  chance:.12,          // any other kill, once the Vulcan has been used in the last `usedSeconds`
  usedSeconds:10,      // "used": a Vulcan bullet left the barrels this recently (or the gauge is still warm)
  pityOverheats:3,     // this many locks since the last magazine: the next kill drops one
  gapSeconds:8,        // at least this long between two drops
  maxOnScreen:1,       // one magazine falling at a time
  speed:105,           // fall speed (bonus tokens fall at 125)
  radius:24,           // pick-up radius (bonus tokens: 26)
  coldSeconds:5,       // after a pick-up the Vulcan does not heat for this long
  hudSeconds:6         // the captions under the buttons fade after this long in a stage (HUD v24)
 })
});
export function v24Config(balance){const b=balance?.v24||{};return {...V24_DEFAULTS,...b,refill:{...V24_DEFAULTS.refill,...(b.refill||{})}};}
/** Should this kill drop a Vulcan magazine? state={kind,boss,child,phase,time,lastDropAt,lastVulcanAt,heat,locked,overheatsSince,onScreen,
 * random}. Boss phase changes always drop (gap and screen cap allowing); otherwise only while the Vulcan is in use (fired in the last
 * `usedSeconds`, warm or locked): big ships always, the pity rule after `pityOverheats` locks, other kills by chance. */
export function refillShouldDrop(state,cfg=V24_DEFAULTS.refill){
 const s=state||{},c=cfg||V24_DEFAULTS.refill,time=Number(s.time)||0;
 if((s.onScreen||0)>=c.maxOnScreen)return false;
 if(time-(Number.isFinite(s.lastDropAt)?s.lastDropAt:-Infinity)<c.gapSeconds)return false;
 if(s.phase||s.boss)return true;
 // A magazine only for a Vulcan in use: a child who plays with the steady cannon alone is not sent chasing tokens it does not need.
 const used=s.locked||(s.heat||0)>.05||time-(Number.isFinite(s.lastVulcanAt)?s.lastVulcanAt:-Infinity)<=c.usedSeconds;if(!used)return false;
 if(!s.child&&c.bigKinds.includes(s.kind))return true;
 if((s.overheatsSince||0)>=c.pityOverheats)return true;
 return (typeof s.random==='function'?s.random():1)<c.chance;
}
/** A magazine was picked up: the gauge empties, a lock ends, and the barrels stay cold for `coldSeconds`. */
export function refillApply(vgate,cfg=V24_DEFAULTS.refill){return {gate:{...(vgate||{}),heat:0,lock:0,rest:0,mode:'idle',firing:false},cold:cfg.coldSeconds};}
/** Ring colour band with the refill: 'cold' while the barrels are kept cold, else the v23 band. */
export function refillLevel(level,cold){return cold>0?'cold':level;}
export const REFILL_COLORS=Object.freeze({cold:'#6fe3ff',token:'#ffb547',halo:'#ffd27a'});
