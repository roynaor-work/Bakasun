/** Aliens v13 (Roy, 07/11/2026, "תסים הכל"): Codex assets wired into the alien game: the two-Vulcan player
 * ship (assets/alien-v13/player-ship.glb: Barrel_L/Barrel_R spin, Muzzle_L/Muzzle_R fire points) and the
 * Vulcan audio set (assets/audio/alien-v13/*.ogg: fire loop at 80 pulses/s, spin-up, spin-down, flash).
 * Runtime copies only, no Draco. Any load or decode failure falls back silently to v12 (drawn cannons and
 * synthesised BRRRT). ?alienV13=0 (or globalThis.__alienV13=false) forces the v12 look and sound. Numbers:
 * config.json alienDefense.v13. Dependency-free so tests can import it. */
export function alienV13Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienV13){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienV13')!=='0';
}
const TAG='island-v2-20261107-12';
export const V13_SHIP_URL=new URL(`../assets/alien-v13/player-ship.glb?v=${TAG}`,import.meta.url).href;
export const V13_SHIP_PATH='assets/alien-v13/player-ship.glb';
export const V13_AUDIO=Object.freeze(Object.fromEntries(['vulcan-fire-loop','vulcan-spin-up','vulcan-spin-down','vulcan-flash'].map(id=>[id,new URL(`../assets/audio/alien-v13/${id}.ogg?v=${TAG}`,import.meta.url).href])));
/** Scale that fits the ship's longest side to 1 unit (the view scales the player group to its pixel size). */
export function fitScale(size){return 1/Math.max(size.x,size.z,1e-6);}
