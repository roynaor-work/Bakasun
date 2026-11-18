// racing-v24.5 (Roy after v24.4 on the phone, 18/11/2026): "lower the control of the car the more the tyres wear / more long round corners, and in a big long
// corner the car drifts a little, only from the inertia of the turn / real circuits have a width beside the track where the speed does not drop / he should hear
// the engine go up and down through the gears, so in some places a downshift, so he can shift up again / a kind of noise, like the air while driving: fix it".
// One place for this round's flags; each one has an address value that brings v24.4 back exactly.
//  ?racingTyreFeel=v244  a worn tyre costs only top speed and the soft grip cap (from 75% down). Default (the player's car): the control fades with the wear from the
//                        first metre (TYRE): the wheel answers slower, turns the car less and the grip cap falls; a worn tyre also slides more in a long corner
//  ?racingCarry=v244     the car goes exactly where it points in every corner. Default: in a long, steady corner the inertia carries it a little wide (a slip angle that
//                        builds over about a second of sustained cornering load, CARRY.max at most, gone when the load drops; no speed lost)
//  ?racingShoulder=v244  off-road (grass drag, 19 m/s limit) from 0.4 m beyond the asphalt. Default: the run-off beside the track (SHOULDER metres, the painted asphalt
//                        run-off of the Formula 1 circuits) keeps the speed; only the gravel/grass beyond it slows the car
//  ?racingGears=v244     the car slows only on the brake, so it sits in 7th gear. Default: before a tight corner the car lifts and engine-brakes to the corner speed
//                        (GEARS.decel, a tyre-dependent corner speed), the box comes down a gear every GEARS.downDwell s and shifts up again out of the corner
//  ?racingRound=v244     the v24.4 circuits (chicane wiggles on every straight, 17 m hairpins). Default: the hairpins opened into long round corners (the centre line
//                        smoothed, ROUND.sigma raw metres) and the straights get one long sweeper instead of the 70 m chicanes
//  ?racingAir=v244       the white-noise "air" bed (road + exhaust noise, the wind loop above 12 m/s, the top-speed wind and the boost hiss). Default: no air bed while
//                        driving; the tyre rumble is a low (under 300 Hz) layer, the boost a short soft low push
//  ?racingRec=0          the synthesized idle on the grid and the synthesized doppler overtake. Default: Roy's own recordings (assets/racing-rec): his idling engine on
//                        the grid, his engine driving away when a car is passed (racing-samples REC). His accelerate-and-shift take is not used (see the README there)
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export function racingV245Flags(search){
 const q=read(search),old=key=>q.get(key)==='v244';
 return Object.freeze({tyreFeel:!old('racingTyreFeel'),carry:!old('racingCarry'),shoulder:!old('racingShoulder'),gears:!old('racingGears'),round:!old('racingRound'),air:old('racingAir')?'v244':'v245',rec:q.get('racingRec')!=='0'});
}
/** The race-model part (createRacing config). The pure model keeps v24.4 unless the config asks (the session asks unless the address says v244). */
export function v245PhysicsConfig(flags=racingV245Flags()){
 return {tyreFeel:flags.tyreFeel,carry:flags.carry,shoulder:flags.shoulder,gears:flags.gears};
}
/** Tyre feel: w = tyreWear(tyre) 0 (new) .. 1 (TYRE.full of the tyre used and more), linear from the first metre, so the child feels it lap by lap. At w the wheel
 * turns the car (1 - steer*w) as much, answers (1 - response*w) as fast, the grip cap is (1 - grip*w), the corner speed of the downshift assist (1 - grip*w)
 * and the inertia slide in a long corner (1 + carry*w) as big. tyreControl = the steering authority left (1 .. 1 - TYRE.steer). */
export const TYRE=Object.freeze({full:.65,steer:.3,response:.5,grip:.25,carry:.7});
export const tyreWear=tyre=>Math.max(0,Math.min(1,(1-(Number.isFinite(tyre)?tyre:1))/TYRE.full));
export const tyreControl=tyre=>1-TYRE.steer*tyreWear(tyre);
/** Inertia in a long corner: lateral load over `load` m/s^2 (full slip at `full`) held for `build` s grows the slip angle to `max` rad (x (1 + TYRE.carry w) on worn
 * tyres) at `rise` 1/s; it relaxes at `relax` 1/s once the load drops. A slip angle of .04 rad at 35 m/s carries the car wide at 1.4 m/s: the child steers a touch more. */
export const CARRY=Object.freeze({load:9,full:26,build:.9,max:.042,rise:1.6,relax:3.5});
/** The run-off beside the asphalt that keeps the speed (metres beyond the edge): the F1 run-off is painted asphalt to 4.6 m (racing-v24-4 surfaceAt), a plain circuit
 * has a short verge. */
export const SHOULDER=Object.freeze({f1:3.9,plain:1.4});
export const shoulderOf=track=>track?.f1?SHOULDER.f1:SHOULDER.plain;
/** Downshift assist: corner speed sqrt(aLat * R) over the next `look` metres (with the braking distance at `decel`), lift and engine-brake when the car is `margin`
 * m/s faster than that; the box comes down a gear at most every `downDwell` s while lifting (it holds a gear 0.6 s otherwise). aLat falls with the tyre control. */
export const GEARS=Object.freeze({aLat:24,decel:7.5,margin:1.5,look:110,downDwell:.32,minCorner:14});
/** Long round corners: Gaussian smoothing of the raw Codex centre line (sigma in raw metres, about 4 m between raw points); the long straights get one long S of
 * up to `period` raw metres (`amp` raw metres, never tighter than `minR` raw metres) instead of the 70 m chicane periods; straights under `min` raw metres stay straight. aiCorner scales the computer's corner law
 * on these circuits (racing-tracks V2_AI_CORNER). */
export const ROUND=Object.freeze({keepFade:25,sigma:18,period:190,amp:15,min:150,minR:45,aiCorner:.85});
export const racingRoundOn=search=>racingV245Flags(search).round;
