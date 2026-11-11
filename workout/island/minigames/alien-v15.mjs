/** Aliens v15 (Roy, 11/11/2026): "still too many shots in normal play". Normal fire is a calm 5 bullets a
 * second (alternating cannons), the Vulcan roar comes only in short bursts when a charge meter fills (about
 * every 7 s, about a second), bullet damage is higher so the stage length is unchanged, and no fire mode
 * (gear, rapid bonus, spread, wings) can push the rate above the cap. ?alienV15=0 (or globalThis.__alienV15=false)
 * restores v14. Numbers: config.json alienDefense.v15. Dependency-free so tests and sims can import it. */
export function alienV15Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienV15){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienV15')!=='0';
}
/** Fire interval in seconds: calm normal rate, short fast burst, never below the floor. `rateGear` is the
 * ship's rate multiplier (gear), limited by the cap, so upgrades cannot raise the bullet rate. */
export function fireInterval(v15,{burst=false,spread=false,rateGear=1}={}){
 const gear=Math.max(1,Math.min(rateGear,v15.rateCap)),base=burst?v15.burstInterval:v15.normalInterval,floor=burst?v15.burstMin:v15.minInterval;
 return Math.max(floor,base/gear)*(spread&&!burst?v15.spreadSlow:1);
}
/** Vulcan charge meter: fills while firing, a burst starts at 1 and drains to 0 over burstSeconds. */
export function chargeStep(state,firing,dt,v15){
 let {charge,burst}=state;
 if(burst>0){burst=Math.max(0,burst-dt);charge=burst/v15.burstSeconds;return {charge,burst,started:false};}
 if(firing){charge+=dt/v15.chargeSeconds;if(charge>=1)return {charge:1,burst:v15.burstSeconds,started:true};return {charge,burst:0,started:false};}
 return {charge:Math.max(0,charge-dt*v15.restRate),burst:0,started:false};
}
