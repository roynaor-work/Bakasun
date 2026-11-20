// racing-v24.7 (Roy after v24.6 on the phone, 20/11/2026): "I do not want the race to lower the speed by itself / you lower the speed / I want it to be necessary
// to lower the speed in some of the corners". Plus two Codex packages: racing-audio-v6 and racing-tracks-v3. One place for this round's flags.
//  ?racingAutoLift=1   brings back the v24.5 downshift assist (the car lifts and engine-brakes before a tight corner by itself). Default: the player's speed is never
//                      lowered automatically; it falls only on the brake (and on gravel, or in a contact). The box still comes down through the gears while the
//                      player brakes (BRAKE_DOWN seconds a gear), so the engine is heard going down and up again.
//  ?racingTight=0      v24.6 grip: the car turns as tightly at full speed as its steering allows (about a 43 m radius at 40 m/s). Default: above the tyre's grip
//                      (TIGHT.aLat m/s^2, lower on worn tyres) the front pushes wide (understeer): the car runs out of the corner onto the run-off and the gravel
//                      unless the player braked first, and the tyres scrub (the player's car only; no speed is taken away by the rule itself).
//  ?racingTracksV3=0   stages 7-12 and 19-24 run on the v24.6 circuits. Default: the six Codex circuits of design/racing-tracks-v3 (assets/racing-tracks-v3) there,
//                      with their own sky, colours and trackside models.
//  ?racingAudioV6=0    the v24.6 sounds everywhere. Default: the Codex v6 kit (assets/racing-audio-v6) for the pit limiter, the brake and the tyre scrub
//                      (see V6 in racing-samples.mjs for what was left out of the package and why).
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export function racingV247Flags(search){
 const q=read(search);
 const a=Number(q.get('racingTightA'));   // ?racingTightA=<m/s^2> tunes the grip limit (measurement)
 return Object.freeze({autoLift:q.get('racingAutoLift')==='1',tight:q.get('racingTight')!=='0',tightA:a>=10&&a<=60?a:TIGHT.aLat,tracksV3:q.get('racingTracksV3')!=='0',audioV6:q.get('racingAudioV6')!=='0'});
}
/** The race-model part (createRacing config), merged after v245PhysicsConfig: `gears` (the v24.5 lift) stays only with ?racingAutoLift=1. */
export function v247PhysicsConfig(flags=racingV247Flags(),gears=true){
 return {gears:!!gears&&flags.autoLift,brakeDown:!flags.autoLift,tight:flags.tight?flags.tightA:0};
}
/** Seconds a gear while the player holds the brake (0.6 s otherwise): the box follows the falling speed closely enough to be heard. */
export const BRAKE_DOWN=.3;
/** Understeer: the lateral acceleration the tyres give (m/s^2, x tyre grip and wear, x the aero upgrade). Above it the yaw rate is capped hard at aLat / speed, so the
 * tightest line at speed v has the radius v^2 / aLat: 40 m/s -> 57 m, 34 -> 41 m, 28 -> 28 m, 22 -> 17 m. `wide` 0..1 is how far over the limit the wheel asks
 * (the tyre scrub sound and the HUD); `full` = the over-ask (m/s^2) that reads as 1. */
export const TIGHT=Object.freeze({aLat:28,full:10});
/** The v3 circuits by stage slot (stage index % 6): [name, look]. The stage picker's line comes from data/strings (the v2 circuit's name and light); on a v3 stage
 * its first part becomes the v3 circuit's name and its light the circuit's look (racing-tracks.mjs gives the same stages the v3 circuits; a test keeps the names equal). */
export const V3_STAGES=Object.freeze([['מפרץ המגדלור','חוף'],['סיבוב הארזים','יער'],['מכתש הנחושת','מדבר'],['רציף ניאון','עיר בלילה'],['מעבר העננים','הרים'],['קו הקרח','שלג']]);
export const v3StageOn=(stage,search)=>{const q=read(search),n=Math.floor(Number(stage)||0);return n>=1&&n<=30&&Math.floor((n-1)/6)%2===1&&racingV247Flags(search).tracksV3&&!['v1','f1'].includes(q.get('racingTracks'));};
export function racingStageFeature(stage,text,search){
 if(!v3StageOn(stage,search)||typeof text!=='string')return text;
 const parts=text.split(' · '),[name,look]=V3_STAGES[(Math.floor(stage)-1)%6];if(parts.length<3)return text;
 parts[0]=name;parts[2]=look;return parts.join(' · ');
}
