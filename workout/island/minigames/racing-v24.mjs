// racing-v24 (Roy after v23 on the phone, 14/11/2026): one place for the flags and the shared numbers of this round. Every change has an address flag that brings
// back exactly what v23 did; the pure race model keeps the v23 behaviour unless its config asks for the new one (the session sends the new one by default), so the
// older tests and simulations keep measuring what they measured.
//  ?racingTurbo=v23      the brake button is "drift / brake" again: braking in a corner drifts and the release gives a drift boost ("after every corner a second of turbo and
//                        then a noise"), the gear shift points move with the steering, and the blow-off plays at the end of every boost
//  ?racingRecover=v23    the off-track flip flies back to the centre line while it rolls ("it flips back onto the track"); v24 rolls once where it is, then the car vanishes
//                        for a moment and is set down softly on its wheels on the centre line
//  ?racingOffSlow=0      the grass stops a slow car (8 m/s^2 of drag beats the engine at low speed: "off the track not fast, no way to drive back") and no pull or soft return
//  ?racingPit=0          no tyre wear and no pit stops
//  ?racingFormulaAll=0   two rivals with the formula model, the rest the light silhouette ("look like a toy")
//  ?racingBrakeAuto=v23  the turn itself bleeds speed (the cornering scrub); v24 slows only on the brake
//  ?racingBump=v23       the old soft contact; v24 bounces the cars apart with a knock and costs both of them speed
//  ?racingHiss=v23       the wind loop and the engine's noise layer as before (a constant "air" hiss even standing still)
//  ?racingAudioV4=0      the Codex v4 brake, bump and scrape samples off (the v2/v3 squeals again)
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export function racingV24Flags(search){
 const q=read(search),v23=key=>q.get(key)==='v23',off=key=>q.get(key)==='0';
 return Object.freeze({turbo:v23('racingTurbo')?'v23':'v24',recover:v23('racingRecover')?'v23':'v24',offSlow:!off('racingOffSlow'),pit:!off('racingPit'),formulaAll:!off('racingFormulaAll'),
  brakeAuto:v23('racingBrakeAuto')?'v23':'v24',bump:v23('racingBump')?'v23':'v24',hiss:v23('racingHiss')?'v23':'v24',audioV4:!off('racingAudioV4')});
}
/** The race-model part of the flags (createRacing config). v23 values are the pure model's defaults. */
export function v24PhysicsConfig(flags=racingV24Flags()){
 return {shiftInput:flags.turbo==='v23',recover:flags.recover,offSlow:flags.offSlow,pit:flags.pit,cornerSlow:flags.brakeAuto==='v23',bump:flags.bump};
}
/** The controls send {brake, drift} from the one button. v24: the button only brakes (no drift, so no drift boost after a corner); keyboard Space the same. */
export function playerInput(sample,flags=racingV24Flags()){
 if(flags.turbo==='v23'||!sample||!sample.drift)return sample;
 return {...sample,drift:false,brake:true};
}

// ---- recovery after the off-track flip (v24): one roll where the car is, a short rest, a vanish while the camera glides to the road, a soft drop on the wheels
export const RECOVER=Object.freeze({rest:.25,vanish:.4,drop:.3,dropHeight:.35,maxBeyond:9.4,sideDecay:7,alongDecay:3.2});
// ---- slow off-track (v24): drag that never beats the engine at walking pace, a pull towards the road, and a soft return after a while
export const OFF_SLOW=Object.freeze({slow:8,dragFull:20,pull:.9,nudge:.45,returnAfter:6,stuckRate:2});
// ---- tyres and pits (v24): wear per metre, how much grip and top speed a worn tyre costs, the pit lane speed, the stop
export const PIT=Object.freeze({minLaps:3,speed:20,entryDecel:14,stopDecel:9,leaveAccel:8,exitAccel:9,stopAI:[2.2,2.8],tapWait:.8,change:2,
 wear:1.05e-4,cornerWear:.9,brakeWear:.6,wornAt:.75,topLoss:.07,gripLoss:.2,aiCornerLoss:.22,autoTyre:.3,
 entryBefore:20,entryLength:55,exitLength:55,boxMargin:45});
/** Tyre state 0..1 (1 = new) -> how worn, 0 (fresh) .. 1 (finished). Grip and top speed fade gradually from PIT.wornAt down. */
export const tyreWorn=tyre=>Math.max(0,Math.min(1,(PIT.wornAt-(Number.isFinite(tyre)?tyre:1))/PIT.wornAt));
/** The pit lane of a circuit, the same one racing-f1.mjs paints: along the main straight on the side -1 (negative lateral), the lane line at 7.6 m beyond the asphalt.
 * Distances are race metres (s). entry..lane0 = the entry ramp, lane0..lane1 = the lane at the pit speed, lane1..exit = the exit ramp. boxS(i, n) = where car i stops. */
export function pitLane(track){
 const half=track.width/2,main=track.mainStraight&&track.mainStraight.length>=150?track.mainStraight:null;
 const len=main?Math.min(260,main.length-24):210,S0=main?main.from+12:track.length-60;
 // the entry ramp starts 8 m before the straight (the exit of the last corner) and reaches the lane 35 m into the pit; the exit ramp mirrors it at the far end
 const entry=S0-PIT.entryBefore,lane0=entry+PIT.entryLength,lane1=S0+len+PIT.entryBefore-PIT.exitLength,exit=lane1+PIT.exitLength;
 // twelve boxes along the lane, the last one 25 m before the exit ramp so the car is at the pit speed again when it leaves the lane
 const boxFrom=lane0+12,boxTo=Math.max(boxFrom+12,lane1-25);
 // the painted lane is 4.8..10.4 m beyond the asphalt with its line at 7.6: the fast lane centre 6.2 m out, the boxes (working lane) 9 m out, so a car that drives
 // through never meets a car that stands in its box
 return Object.freeze({S0,len,lat:-(half+6.2),boxLat:-(half+9),entry,lane0,lane1,exit,length:track.length,boxS:(i,n)=>boxFrom+(boxTo-boxFrom)*(i+.5)/Math.max(1,n)});
}
/** Smoothstep 0..1 and its slope (for the lateral path of the ramps and the car's heading on them). */
export const ease=u=>{const t=Math.max(0,Math.min(1,u));return t*t*(3-2*t);};
export const easeSlope=u=>{const t=Math.max(0,Math.min(1,u));return 6*t*(1-t);};
