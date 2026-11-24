/** Aliens v24.9 (Roy, 22/11/2026, after v24.8 on the phone): "the regular fire goes through the ships, that is not right / there is also text
 * that gets in the way now and then / I saw no laser fire at all".
 * What was found (v24.8):
 *  1. Regular fire through ships. v24.5 made every cannon round of kind 1 a piercing beam, and a round is kind 1 not only while the laser
 *     bonus runs but also for a purchased laser rank and for the hangar's weapon 2 ("a permanent laser"). For such a player every ordinary
 *     press of the fire button, for the whole game, sent a round through up to 4 ships: his regular fire went through the ships.
 *     v24.9 (?alienPierceFix=0 keeps v24.8): a cannon/wing round pierces only while the laser bonus clock runs. With a permanent laser and no
 *     bonus the round stops on its first hull (v24.4) and gets the v24.4 first-hull damage compensation, so the damage on the front ship is kept.
 *  2. Text over the play area. With the kid captions (KUX-032) a two-line banner (a 23 px emoji strip and a name) sat under the top centre for
 *     2 s after EVERY press of a button and for the first 6 s, the notices line ("hit on the ship", "wave 2", the pickup's name) stayed at
 *     least 1.4 s, 14 px on a dark plate, and the captions beside the buttons never faded.
 *     v24.9 (?alienText=old keeps v24.8): one short line, 11 px, at the top edge under the wave dots, for 1 s; no banner at all (the captions
 *     beside the buttons are the opening hint); "hit on the ship" has no text (the red flash says it); the button captions fade after the
 *     opening seconds; the boss plate is one thin bar with a short label.
 *  3. No laser seen. In stage 1 the bonus rotation reaches the laser as the third bonus (kill 30 of ~36): measured 0 lasers in 6 of 6 games.
 *     And the beam lit only on a NEW press: a finger already on the fire button when the bonus was taken (the usual way to play) lit nothing.
 *     v24.9 (?alienLaserSeen=0 keeps v24.8): a laser token of its own falls toward the ship a few seconds into wave 1 (again if it was
 *     missed; it gives 8 s of laser with a beam at 0.4 of the damage, a rotation bonus 16 s at full damage, so stage 1 keeps most of
 *     its length), the beam lights the moment the bonus is taken and stays lit while a fire button is down, and a chip at the
 *     top edge shows the laser icon and the seconds left. */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
const here=()=>globalThis.location?.search||'';
export function alienPierceFixEnabled(search=here()){return param('alienPierceFix',search)!=='0';}
export function alienTextCompact(search=here()){return param('alienText',search)!=='old';}
export function alienLaserSeenEnabled(search=here()){return param('alienLaserSeen',search)!=='0';}
export const LASER_SEEN=Object.freeze({
 firstAt:5,      // seconds into wave 1 when the first laser token appears (it falls about 3.5 s to the ship)
 waveAt:7,       // seconds into a later gift wave
 everyWaves:99,  // a token of its own in wave 1 only (2 = waves 1, 3, 5); later lasers come from the bonus rotation
 giftSeconds:8,  // the token of its own gives a shorter laser than a rotation bonus (16 s), so stage 1 keeps its length
 giftPower:.4,   // and its beam deals this share of a rotation bonus beam's damage
 retry:5,        // a missed token comes again after this long
 edge:44         // keep the token this far from the side edges
});
export function laserSeenConfig(balance){return {...LASER_SEEN,...(balance?.laserSeen||{})};}
/** Is a laser token due now? Pure: one per gift wave, not while one is on screen or the laser is running. */
export function laserGiftDue({wave,waveClock,given,laserTime,pickups,aliens,time,retryAt,cfg=LASER_SEEN}){
 if(given||laserTime>0||pickups>0||!(aliens>0)||time<(retryAt||0))return false;
 if((wave-1)%Math.max(1,cfg.everyWaves)!==0)return false;
 return waveClock>=(wave<=1?cfg.firstAt:cfg.waveAt);
}
/** The notice line in the compact text: shorter names, nothing for a hit on the ship. */
export function compactNotice(notice,kind){
 if(!notice||kind==='player-hit')return null;
 const short={'מחסנית וולקן · הוולקן קר':'מחסנית וולקן','הבוס משנה התקפה':'התקפה חדשה'};
 return {...notice,text:short[notice.text]||notice.text.replace(/^תחמושת · /,'')};
}
export const COMPACT_NOTICE_SECONDS=1;
