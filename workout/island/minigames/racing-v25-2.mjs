// racing-v25.2 (QA scan of v25.1, 28/11/2026; Roy earlier: a permanent caption in the races "hides and disturbs"). One place for this round's flags;
// each one has an address value that brings v25.1 back exactly.
//  ?racingDriftTip=old  the drift tip above the drift button from 0:02 to 0:12 of the first race. Default: the tip waits for the first hard turn at speed
//                       (the wheel past DRIFT_TIP.steer at DRIFT_TIP.speed m/s or more), stays DRIFT_TIP.seconds seconds and never comes back
//  ?racingGauge=old     the speedometer, the gear and the ERS tag in the bottom centre, beside the car and over the road. Default: a small cluster on the right
//                       edge under the track map, off the road ahead (screen[data-racing-gauge=side]; racing-v24.css)
//  ?racingCredit=old    the "קרדיט לדגם" link inside the race screen, which opens a browser tab in the middle of a race. Default: no link in the race; the
//                       credit line itself is printed on the race intro card (or on the podium when the broadcast is off): plain text, nothing to tap
//  ?racingLabels=old    the slipstream chip "» סלפה" (also on the standing grid) and the driving hint over the start lights during the countdown. Default: the
//                       chip says "💨 רוח גבית" and only shows in the race at speed; the hint is not drawn while the start lights count
//  ?racingContact=old   the contact of two cars is one 2.55 m circle, so a rival right behind the player's car at the start stood with its nose inside it. Default:
//                       the player's car and a car in its lane keep a car's length nose to tail (createRacing config noseTail; racing-physics.mjs)
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export function racingV252Flags(search){
 const q=read(search),old=k=>q.get(k)==='old';
 return Object.freeze({driftTip:old('racingDriftTip')?'old':'corner',gauge:old('racingGauge')?'old':'side',credit:old('racingCredit')?'old':'intro',labels:old('racingLabels')?'old':'clear',contact:old('racingContact')?'old':'long'});
}
/** The race-model part (createRacing config). */
export const v252PhysicsConfig=(flags=racingV252Flags())=>({noseTail:flags.contact!=='old'});
/** The drift tip: seconds on the screen, how far the wheel is turned (0-1) and how fast the car goes (m/s) for a "hard turn", the first second and a half of the
 * race never shows it; oldUntil = the v25.1 window (from `after` to `oldUntil` seconds of the race). */
export const DRIFT_TIP=Object.freeze({seconds:3,steer:.55,speed:18,after:1.5,oldUntil:12});
/** One frame of the drift tip. `tip` = {shownAt:null|seconds, done:false} (mutated); `s` = {racing, time, steer, speed, drifting, pit}.
 * Returns {show, done}: done = the tip is finished for good (the caller stores it and removes the element). */
export function driftTipStep(tip,s,mode='corner'){
 if(tip.done)return {show:false,done:true};
 const racing=!!s.racing,time=Number(s.time)||0;
 if(mode==='old'){
  if(s.drifting||(racing&&time>=DRIFT_TIP.oldUntil)){tip.done=true;return {show:false,done:true};}
  return {show:racing&&time>DRIFT_TIP.after&&time<DRIFT_TIP.oldUntil&&!s.pit,done:false};
 }
 if(s.drifting){tip.done=true;return {show:false,done:true};}
 if(tip.shownAt===null||tip.shownAt===undefined){
  if(racing&&time>DRIFT_TIP.after&&!s.pit&&Math.abs(Number(s.steer)||0)>=DRIFT_TIP.steer&&(Number(s.speed)||0)>=DRIFT_TIP.speed)tip.shownAt=time;
  else return {show:false,done:false};
 }
 if(time>=tip.shownAt+DRIFT_TIP.seconds){tip.done=true;return {show:false,done:true};}
 return {show:racing&&!s.pit,done:false};
}
/** The slipstream chip of this round: a name a child reads (the v24.9 chip said "» סלפה"). */
export const DRAFT_CHIP=Object.freeze({kind:'draft',icon:'💨',text:'רוח גבית'});
/** Whether the slipstream chip shows: in the race and moving (never on the standing grid). */
export const draftChipOn=(s,mode='clear')=>(Number(s.draft)||0)>.15&&(mode==='old'||(!!s.racing&&(Number(s.speed)||0)>=12));
/** The credit of the car model as plain text (CC-BY 4.0 asks for the name, the author and the licence; the full page stays at assets/racing/credits.html). */
export const CREDIT_LINE='דגם המכונית: Car Concept מאת Eric Chadwick, Darmstadt Graphics Group · רישיון CC BY 4.0';
