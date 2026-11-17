/** Aliens v9 (Roy, 07/11/2026): shots fire only while the fire button is held (no
 * touch/drag auto-fire), tougher aliens (hits to kill), rarer bonuses, longer stages.
 * ?alienV9=0 (or globalThis.__alienV9=false) restores the earlier behaviour. The numbers
 * live in config.json under alienDefense.v9. Dependency-free so tests and sims can import it. */
export function alienV9Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienV9){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienV9')!=='0';
}
/** Extra alien hit points for a stage (1-based): base + perStage*(stage-1), capped. Additive, so a
 * one-hit scout becomes 2-3 hits without making the heavy types (already 2-3 hits) unfair. */
export function alienV9Hp(v9,level){return Math.min(v9.hpMax,v9.hpBase+v9.hpPerStage*(level-1));}
