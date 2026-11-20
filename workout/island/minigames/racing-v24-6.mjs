// racing-v24.6 (Roy after v24.5 on the phone, 20/11/2026): "the start is fine. Take out the strange noise on a downshift or when slowing down, it does not fit,
// find one you already have. There is a faint background noise in the air. There is a tapping noise in the air on downshifts".
// What was found (tools/racing-audio-v24-6.mjs renders the session's engine offline from the real race model and measures it):
//  - slowing down: v24.5 lifts before every tight corner (GEARS). The lift drops the throttle the audio engine is given from 1 to .15 with the revs above .55,
//    which is the backfire rule: one Codex exhaust pop (exhaust-pop-1..3.ogg: a crackle, a third of its energy at 2-5 kHz) and a burst of the white-noise layer
//    at .1 (the loudest the noise layer ever is) on every lift, about 1.4 times a lap: "the strange noise when slowing down";
//  - the downshifts that follow every .32 s each gave the 'a' style rev blip (the note jumps 6% and slides back in 0.12 s), and one downshift in five is followed
//    0.35 s later by an upshift (the box finds the gear too low): its low thump and its 10% rpm dip. Three or four short jerks in a second: "a tapping noise";
//  - driving: the road noise (the white-noise loop through a wide band-pass, Q .62 at 150-400 Hz, up to .012 at the top speed) is the only noise left in a straight
//    line since v24.5: "a faint noise in the air".
// v24.6 (?racingAudioV246=0 keeps v24.5): no backfire on a lift (neither the pop nor the noise burst); a downshift adds nothing to the engine note, which already
// climbs with the rpm the box gives it (the sound we already have: the engine itself); an upshift within REENGAGE seconds of a downshift is silent (no thump,
// no dip); no road noise while driving. The drift, boost and braking layers, the pit sounds and Roy's recordings (assets/racing-rec) are not touched.
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export function racingV246Flags(search){return Object.freeze({audio:read(search).get('racingAudioV246')!=='0'});}
export const REENGAGE=.6;
