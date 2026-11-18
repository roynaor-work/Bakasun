// racing-v24.4 (Roy after v24.3 on the phone, 18/11/2026): "a better sound when there is an overtake / at the start an engine standing still / check the noise of a
// real Formula 1 race / still no real change of the wheels / remove the change button / still an annoying noise when the car leaves the track a little, the same
// noise in the pit lane". One place for this round's flags; each one has an address value that brings v24.3 back exactly.
//  ?racingPitSeq=0    the v1 crew at the box (racing-pit-crew.mjs), the big "החלפת צמיגים" button, the 0.8 s wait for the tap and the 2 s change. Default: the Codex pit
//                     sequence v2 (racing-pit-seq.mjs): four old wheels off, four new wheels on, two jacks, no button; the stop is PIT_SEQ.stop + PIT_SEQ.change seconds
//  ?racingAudioV5=0   the v24.3 edge and pit sounds: the kerb rumble sample every 0.7 s whenever the car is near the edge (also all along the pit lane, which lies beyond
//                     the asphalt), the procedural gravel noise (white noise at 620 Hz, the loudest layer) from 0.4 m off the edge, and the v4 brake loops. Default: the
//                     Codex v5 loops (design/racing-audio-v5, CC0): gravel or grass by speed only where the car really is on gravel or grass (the run-off of the F1
//                     circuits is asphalt), nothing on the kerb, the pit lane engine, limiter, bay and crew loops in the pit lane, the v5 brake loops
//  ?racingIdle=0      no idle engine on the grid. Default: an idling engine (a burble about 80 Hz with its firing harmonics) from the moment the race screen opens,
//                     revs held up while the start lights come on, and it hands over to the driving engine as the car moves
//  ?racingPass=v24    the v2 "whoosh" sample on an overtake and fixed-pitch rival engines. Default: the passed car's engine sweeps past (doppler: pitch falls as it goes
//                     from beside to behind, pan follows), and every rival engine voice carries the doppler of its own approach speed
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export function racingV244Flags(search){
 const q=read(search);
 return Object.freeze({pitSeq:q.get('racingPitSeq')!=='0',audioV5:q.get('racingAudioV5')!=='0',idle:q.get('racingIdle')!=='0',pass:q.get('racingPass')==='v24'?'v24':'v244'});
}
/** the player's stop with the sequence: no tap, a short settle, then the change (the sequence's jack up .. hand signal, 1.84 s at 1x, played at 0.77x so a child sees it) */
export const PIT_SEQ=Object.freeze({stop:.1,change:2.4});
/** where the car is relative to the asphalt for the surface sounds: 'kerb' on the painted kerb, 'runoff' the asphalt run-off of the F1 circuits (no surface noise),
 * 'gravel' the gravel trap, 'grass' off a circuit without run-off; null on the road or in the pit lane. beyond = metres beyond the asphalt edge. */
export function surfaceAt({lateral=0,halfWidth=6,f1=false,pit=false}={}){
 if(pit)return null;const beyond=Math.abs(lateral)-halfWidth;
 if(beyond<=-.8)return null;if(beyond<=.9)return 'kerb';
 if(!f1)return 'grass';return beyond<4.6?'runoff':'gravel';
}
