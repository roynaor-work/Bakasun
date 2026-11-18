/** Aliens v24.4 hull contact (Roy, 18/11/2026, after v24.3 on the phone: "not right, the fire still goes through").
 * Phone fix C (v24.3) already stops every cannon, Vulcan and laser round at its FIRST contact, but the contact was the model's hit circle
 * (radius + shotRadius), and what the phone shows is bigger than that:
 *  - alien-view.mjs draws each 3D ship 1.65 x the hit diameter wide (its line `pixels=min(boss?100:62,radius*2*height/480*1.65)`), so a round
 *    that runs through the outer rim of a saucer (about 3 px each side on a small ship, 6 px on a big one, 12 px on a boss) misses it in the
 *    model, flies on, and hits the ship in the row behind: on screen the round went through the first ship;
 *  - the v25 Vulcan round is drawn as three plasma pellets that fan out with distance (alien-v25-draw.mjs, pelletOffsets: 11 px either side at
 *    the formation), but only the middle one was tested, so the side pellets flew through ships.
 * v24.4: the contact is what is drawn. The hull radius is the drawn half-width of the ship (the shield bubble, 1.12 x, when it is up), never
 * smaller than the old circle; the first contact still wins and the round still stops there (phone fix C): nothing pierces. A Vulcan side pellet
 * that reaches a hull sticks in it too (it is hidden from then on, with a small impact flash), but only the middle pellet deals damage, as before,
 * so the Vulcan's damage per second is unchanged. ?alienHull=0 restores the v24.3 hit circle and the pellets exactly.
 * Units: the hit test's (x stretched by the screen aspect = CSS pixels / (screen height / 480)). */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function alienHullEnabled(search=globalThis.location?.search||''){return param('alienHull',search)!=='0'&&param('phoneFixes',search)!=='0';}
/** alien-view.mjs: drawn ship width in CSS pixels = min(cap, radius*2*pxPerUnit*VIEW_SCALE); cap 62 px, 100 px for a boss. */
export const VIEW_SCALE=1.65,VIEW_CAP=62,VIEW_BOSS_CAP=100,SHIELD_SCALE=1.12;
/** Drawn half-width of an alien in hit units. pxPerUnit = screen CSS height / config height (0 = no 3D view: the canvas fallback draws the hit circle). */
export function alienHullRadius(a,pxPerUnit){
 if(!(pxPerUnit>0))return 0;
 const pixels=Math.min(a.boss?VIEW_BOSS_CAP:VIEW_CAP,a.radius*2*pxPerUnit*VIEW_SCALE);
 return pixels/2/pxPerUnit*(a.shield>0?SHIELD_SCALE:1);
}
/** How far the outer Vulcan pellet is drawn from the round's centre at `distance` from the ship (alien-v25.mjs pelletOffsets). */
export function pelletReach(distance,cfg){
 const n=Math.max(1,Math.round(cfg?.pellets||1));if(n<2)return 0;
 return (n-1)/2*(3+Math.max(0,distance)*Math.tan(cfg?.pelletSpread||0));
}
/** The contact radius of round `s` against alien `a`: the old circle, or the drawn hull when larger. */
export function hullContactRadius(a,{shotRadius,pxPerUnit=0}){return Math.max(a.radius+shotRadius,alienHullRadius(a,pxPerUnit));}
