/** Aliens v14 (Roy, 09/11/2026): "the Vulcan is great but far too much fire, you press and finish the stage
 * in a second". Fewer, heavier bullets (about half the rate), a heat meter (fire for a few seconds, then the
 * guns cool down), shield charges that cannot be drained by a bullet stream (one charge per interval), and
 * alien health that scales with the ship's real damage output so gear no longer collapses a stage.
 * ?alienV14=0 (or globalThis.__alienV14=false) restores v13. Numbers: config.json alienDefense.v14.
 * Dependency-free so tests and sims can import it. */
export function alienV14Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienV14){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienV14')!=='0';
}
/** Damage-output factor of the ship's gear (1 = no gear): damage x rate x laser x power. */
export function gearFactor({equipment={},permanentUpgrades={},hangar={},power=1,rankRate=.05,stacks={},rateCap=Infinity}){
 const d=(equipment.damage||1)*(1+(stacks.damage||0)),r=Math.min(rateCap,(equipment.rate||1)*(1+(hangar.rapid||0)*rankRate)*(1+(stacks.rapid||0))*Math.max(1,power));
 const laser=(permanentUpgrades.laser>0||(equipment.weapon||0)>=2)?2+.25*(stacks.laser||0):1;
 return Math.max(1,d*r*laser);
}
/** Heat step: returns {heat,cool,firing} after dt. While firing heat rises to 1, then the guns lock for coolSeconds. */
export function heatStep(state,wantFire,dt,{heatSeconds,coolSeconds,restRate=.6,resumeHeat=.25}){
 let {heat,cool}=state;
 if(cool>0){cool=Math.max(0,cool-dt);heat=Math.max(resumeHeat*(cool>0?1:0),heat-dt/coolSeconds*(1-resumeHeat));if(cool===0)heat=resumeHeat;return {heat,cool,firing:false};}
 if(wantFire){heat+=dt/heatSeconds;if(heat>=1){return {heat:1,cool:coolSeconds,firing:true};}return {heat,cool:0,firing:true};}
 return {heat:Math.max(0,heat-dt*restRate),cool:0,firing:false};
}
