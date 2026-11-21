/** Ships v24.1 (Roy, 14/11/2026, after v24 on the phone). Pure rules (no clock, no DOM, random passed in), shared by the model, the HUD
 * and the tests. Each part has its own switch back to v24:
 *  - Radar lock (`?navalRadar=v24`): "it is nice to be able to close on a target, but it needs time to lock, not at once, like a radar that
 *    locks and takes time". A tap on a hull (or the Lock button) starts an acquisition: a gauge fills for 0.8 to 1.5 s (longer for a far
 *    hull and a later stage), and only then the turret locks and turns by itself. A hull out of the radar's range cannot be acquired, and a
 *    lock (or an acquisition) breaks when its hull leaves the range. A tap on Fire during the acquisition waits for the lock.
 *  - Air at the end (`?navalAirEnd=v24`): "the screen ended while the helicopter was still in the air". When the fleet is down while an
 *    aircraft is still up, no new aircraft come, the clock stands still and the stage ends only when the sky is clear (shot down with the
 *    Vulcan, or flown away; a helicopter leaves after its own time, so this never lasts long).
 *  - No "hit or not" (`?navalHint=v24`): "there is no need to show hit or not, but the aiming itself can be improved". The v24 words under
 *    the aim ring ("hit", "will not hit", "turning") and its hit-chance colours are gone: the ring only shows where the hull will be (lead).
 *    The aim itself: the radar's gun holds fire after the kill (no shell leaves for a hull that the shells already flying will sink, the
 *    shells v24 sent into the empty sea; part of `?navalRadar=v24`), and the turret swings toward the hull while the radar acquires it.
 *    (A finer held aim, slower near the hull with a magnet on the forecast solution, was measured with a child's hand and gave no gain,
 *    so it is not in.)
 *  - Submarine (`?navalSub=v24`, `?navalSub=v23`): "the submarine came out of the water; it should never come out, and only a torpedo
 *    hits it". A v24.1 submarine stays under water for the whole stage (only its tower top and periscope break the surface), so only the
 *    torpedo reaches it; the stage carries enough torpedoes for every submarine, and an empty tube reloads one while a submarine is out. */
import {polishValue} from './polish-flag.mjs?v=island-v2-20261107-22';
/** Phone fixes B: one full radar acquisition per shot; either URL switch restores v24.1. */
export const navalPhoneFixB=search=>polishValue('phoneFixes',search)!=='0'&&polishValue('phoneFixB',search)!=='0';
export const navalRadarV241=search=>polishValue('navalRadar',search)!=='v24';
export const navalAirEndV241=search=>polishValue('navalAirEnd',search)!=='v24';
export const navalHintV241=search=>polishValue('navalHint',search)!=='v24';
export const navalSubDeepV241=search=>!['v23','v24'].includes(polishValue('navalSub',search));
export const NAVAL_V241_DEFAULTS=Object.freeze({
 // Lock time = (stage base + distance share) x difficulty, clamped to [min, max]: 0.8 s for a near hull at stage 1, 1.5 s for a far hull late.
 // range: the radar's reach in sea units, shorter than the cannon's longest shell (about 392) so that a far hull asks to sail closer before
 // it can be locked (at the start of a stage the fleet is about 280 away); a lock breaks past range + `breakMargin` for longer than
 // `graceSeconds`. `turnRate`: while the radar acquires, the turret already swings toward the hull's bearing (the aim stays the player's
 // while a finger drags). Beeps every `beepFirst` s at the start, every `beepLast` s at the end.
 radar:Object.freeze({min:.8,max:1.5,stageFirst:.8,stageLast:1.05,distanceShare:.45,near:100,range:340,breakMargin:15,graceSeconds:.3,
  difficulty:Object.freeze({easy:.9,normal:1,hard:1.1}),turnRate:3.2,turnMaxDeg:110,beepFirst:.34,beepLast:.08,lostSeconds:1.4}),
 // Torpedoes for a stage with deep submarines: enough hits for every submarine plus `spare`, never fewer than v24's 3..5; an empty stock
 // reloads one torpedo every `reloadSeconds` while a submarine is out.
 sub:Object.freeze({spare:2,reloadSeconds:5,pingSeconds:7})
});
export function navalV241Config(balance){const b=balance?.v241||{};return {radar:{...NAVAL_V241_DEFAULTS.radar,...(b.radar||{}),difficulty:{...NAVAL_V241_DEFAULTS.radar.difficulty,...(b.radar?.difficulty||{})}},sub:{...NAVAL_V241_DEFAULTS.sub,...(b.sub||{})}};}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** The radar's reach (one for every weapon: the radar does not change with the gun; `kind` is kept for a per-weapon reach in config). */
export function navalRadarRange(kind,cfg=NAVAL_V241_DEFAULTS.radar){return cfg[['range','missileRange','torpedoRange'][kind]]??cfg.range;}
/** Seconds the radar needs to lock a hull `distance` sea units away at `stage` (1..30), for the model's difficulty name. */
export function navalRadarSeconds(distance,stage=1,difficulty='normal',cfg=NAVAL_V241_DEFAULTS.radar,kind=0){
 const s=clamp(((Number(stage)||1)-1)/29,0,1),u=clamp(((Number(distance)||0)-cfg.near)/Math.max(1,navalRadarRange(kind,cfg)-cfg.near),0,1);
 const base=cfg.stageFirst+(cfg.stageLast-cfg.stageFirst)*s,scale=cfg.difficulty[difficulty]??1;
 return clamp((base+cfg.distanceShare*u)*scale,cfg.min,cfg.max);
}
/** Seconds between two radar beeps at acquisition progress `p` (0..1): slow at first, fast near the lock. */
export function navalRadarBeep(p,cfg=NAVAL_V241_DEFAULTS.radar){const u=clamp(p,0,1);return cfg.beepFirst+(cfg.beepLast-cfg.beepFirst)*u*u;}
/** True while a hull `distance` away is inside the radar's reach (with the break margin when it is already held). */
export function navalRadarInRange(distance,kind=0,held=false,cfg=NAVAL_V241_DEFAULTS.radar){return distance<=navalRadarRange(kind,cfg)+(held?cfg.breakMargin:0);}
/** Torpedoes for a stage with deep submarines: hits for each submarine (`hpList` / `damage`) + spare, never fewer than the v24 stock. */
export function navalDeepTorpedoes(v24Stock,hpList,damage,cfg=NAVAL_V241_DEFAULTS.sub){const need=(hpList||[]).reduce((n,hp)=>n+Math.ceil(hp/Math.max(1e-6,damage)-1e-9),0);return Math.max(v24Stock,need+(need?cfg.spare:0));}
/** True when the sky still holds an aircraft that keeps the stage open: attacking, flying away or still falling into the sea. */
export function navalSkyBusy(air){return (air||[]).some(a=>a&&(a.state!=='down'||a.h>0));}
export const NAVAL_V241_COLORS=Object.freeze({radar:'#FFD166',locked:'#62E6AA',lost:'#FF6B5C',aim:'#CFF3FF',air:'#FFB547'});
export const NAVAL_V241_WORDS=Object.freeze({range:'מחוץ לטווח המכ״ם',lost:'הנעילה אבדה',track:'המכ״ם איבד את המטרה · האטו',air:'מסוק באוויר · הפילו אותו בוולקן',plane:'מטוס באוויר · הפילו אותו בוולקן',leaving:'כלי הטיס מתרחק'});
