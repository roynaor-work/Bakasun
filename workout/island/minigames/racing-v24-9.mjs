// racing-v24.9 (Roy after v24.8 on the phone, 22/11/2026): "there is suddenly a permanent caption about changing tyres, it is not relevant, it should not appear /
// maybe also give an option to drift, because there are very hard corners / in the races a caption appears in the middle of the race about an overtake and so on,
// it hides and disturbs". One place for this round's flags; each one has an address value that brings v24.8 back exactly.
//  ?racingTyreHud=old  the tyre wear meter beside the speedometer for the whole race and the "⏱ החלפת צמיגים בסוף ההקפה" notice from the start of the stop lap
//                      (in a two-lap race: from the start of the race, which is the "permanent caption"). Default: nothing about tyres is on the screen unless the
//                      car is in the pit lane (the stop itself stays automatic; the timing tower still tags the cars that are in the pits)
//  ?racingText=old     the toast and the broadcast card in the middle of the screen, over the road (overtake, lap, fastest lap, ERS full, pit messages, "off the
//                      track") and the slipstream tag above the car. Default: one small chip in the top left corner under the position and lap block (an icon and
//                      two or three words, CHIP seconds), never over the road; the lap and the position are already in that block and in the timing tower
//  ?racingDrift=0      no drift button. Default: a "דריפט" button above the speedometer (keyboard: X). Held with the wheel turned, the car slides: the tyres let go
//                      for a moment (the path runs wide of the nose), the car then turns tighter than the grip limit of v24.7 (DRIFT.aLat against TIGHT.aLat), loses
//                      speed far slower than on the brake (DRIFT.decel against 27 m/s^2) and smokes. A long clean drift charges the ERS when it is released
//                      (DRIFT.ers units a second of drift, from DRIFT.clean seconds); a drift that is held too long (DRIFT.fade) loses its grip again, and one that ends on
//                      the gravel gives nothing. No automatic turbo after the corner (v23 had one; Roy took it out in v24). The computer drivers do not drift.
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export function racingV249Flags(search){
 const q=read(search);
 return Object.freeze({tyreHud:q.get('racingTyreHud')==='old'?'old':'pit',text:q.get('racingText')==='old'?'old':'corner',drift:q.get('racingDrift')!=='0'});
}
/** The race-model part (createRacing config). The pure model keeps the v23 drift (uncapped turn, drift boost) unless the config asks. */
export function v249PhysicsConfig(flags=racingV249Flags(),turbo='v24'){return {drift249:flags.drift&&turbo!=='v23'};}
/** Whether the session shows the drift button: not with ?racingTurbo=v23, where the brake button is the v23 "drift / brake" itself. */
export const driftOn=(flags=racingV249Flags(),turbo='v24')=>flags.drift&&turbo!=='v23';
/** The drift. aLat = the lateral acceleration a sliding car holds (m/s^2, x tyre grip, wear and aero like TIGHT.aLat = 28): the tightest line at speed v is
 * v^2 / aLat, so 34 m/s -> 28 m (41 m on grip), 28 -> 19 m (28 m), 22 -> 12 m (17 m). decel = what the slide costs (m/s^2, with or without the gas: the engine
 * neither pulls nor brakes a sliding car; the brake takes 27). slip = the slide angle at full lock (rad): the path lags the nose, so the car first runs about a metre
 * and a half wide: the short loss of grip. After `fade` seconds of one drift the grip falls over `fadeOver` seconds to `faded` of aLat (under the grip limit: a drift
 * held all the way round a long corner pushes wide). A release on the asphalt after `clean` seconds of one drift or more gives ers x seconds (at most `fade` seconds
 * count) to the ERS meter (0-100; the boost spends 29 a second): 4.8 for the shortest clean drift, 14.4 for the longest. Tuned with tools/racing-v24-9-sim.mjs. */
export const DRIFT=Object.freeze({aLat:42,decel:2.6,slip:.26,fade:2.4,fadeOver:.8,faded:.6,clean:.8,ers:6});
/** The grip a drift has after t seconds of it (m/s^2 before the tyre, wear and aero factors). */
export const driftGrip=t=>DRIFT.aLat*(1-(1-DRIFT.faded)*Math.max(0,Math.min(1,((Number.isFinite(t)?t:0)-DRIFT.fade)/DRIFT.fadeOver)));
/** The ERS a released drift of `seconds` gives: nothing under DRIFT.clean seconds or when it did not end on the asphalt. */
export const driftReward=(seconds,clean=true)=>clean&&seconds>=DRIFT.clean-1e-6?+(DRIFT.ers*Math.min(DRIFT.fade,seconds)).toFixed(2):0;
/** The controls send {slide} from the drift button (and {drift} from the brake button, which racing-v24 playerInput already turned into a plain brake). The drift
 * button alone slides; with the brake held too the car just brakes. */
export function driftInput(input,sample,on=true){
 if(!on||!input||!sample?.slide||input.brake)return input;
 return {...input,drift:true,brake:false};
}
/** Seconds a corner chip stays, and the chips: [icon, short text]. The texts are short on purpose: the chip is 160 px wide at most. */
export const CHIP=Object.freeze({seconds:1.6,max:22});
const CHIPS=Object.freeze({up:['▲','מקום'],down:['▼','מקום'],lap:['🏁','הקפה'],fastest:['⏱','הקפה מהירה'],ers:['⚡','מלא'],pickup:['⚡','+31'],boostPad:['⚡','בוסט'],offroad:['⚠','מחוץ למסלול'],recover:['↩','חוזרים למסלול'],
 pitIn:['🔧','נכנסים לצמיגים'],pitChange:['🔧','מחליפים צמיגים'],pitDone:['✓','צמיגים חדשים'],pitCancel:['✕','העצירה בוטלה'],drift:['⚡','דריפט'],draft:['»','סלפה']});
/** A chip for a HUD message: {kind, icon, text}. `detail` is appended (a place, a lap time, the ERS gained). Unknown kinds give null (nothing is shown). */
export function chipFor(kind,detail=''){
 const c=CHIPS[kind];if(!c)return null;
 const text=(c[1]+(detail!==''&&detail!==undefined&&detail!==null?' '+detail:'')).slice(0,CHIP.max);
 return {kind,icon:c[0],text};
}
/** The chip of a broadcast card (racing-broadcast broadcastEvents): a position change says the new place, a lap its number, the fastest lap its time. */
export function chipForCard(card){
 if(!card)return null;
 if(card.kind==='up'||card.kind==='down')return chipFor(card.kind,String(card.title||'').replace(/[^\d]/g,''));
 if(card.kind==='lap')return chipFor('lap',/אחרונה/.test(card.title||'')?'אחרונה':String(card.title||'').replace(/[^\d/]/g,''));
 if(card.kind==='fastest')return chipFor('fastest',String(card.sub||card.title||'').match(/\d+:\d+(\.\d+)?/)?.[0]||'');
 return null;
}
/** The chip of a pit event of the player's car (the pit HUD's toast line in the old layout). The announcement of the automatic stop a lap ahead is not shown:
 * nothing about tyres is on the screen until the car is in the pit lane. */
export function chipForPit(event){
 if(!event||event.car!=='player')return null;
 return event.type==='pitIn'?chipFor('pitIn'):event.type==='pitChange'?chipFor('pitChange'):event.type==='pitDone'?chipFor('pitDone'):event.type==='pitCancel'?chipFor('pitCancel'):null;
}
