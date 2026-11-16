/** Basketball v24.1 (14/11/2026): Roy's three notes after v24, each behind its own URL switch that brings back v24 exactly.
 *  `?hoopsWhistleV241=0`  hoops-referee-audio-v1 (Codex, CC0): a short referee whistle when the ball is stolen (a steal or an intercepted
 *                         pass) and the long foul whistle on a foul. v24: no whistle on a steal (a shoe squeak), the old sample on fouls.
 *  `?hoopsCrowd3d=0`      hoops-crowd-3d-v1 (Codex, CC0): 3D fans with three levels of detail in place of the flat cards ("the crowd is
 *                         cardboard"), on the seats the broadcast camera sees, inside a triangle budget per quality tier.
 *                         `?hoopsCrowd3d=full`: Codex's own 70K budget and its three levels, for a comparison on a phone.
 *  `?hoopsBodyV2=0`       athlete-body-v2 (Codex, CC0) for the three basketball bodies: the same upgraded shared body as soccer v24 (hands
 *                         with a thumb and finger groups, the number on the back and the shorts). v24: the v22 body.
 *  `?hoopsMotionV13=0`    hoops-motion-v13 (Codex, CC0): the natural locomotion (idle, jog/run/sprint, dribbles, the jump shot) on the
 *                         basketball bodies, strides fitted to the guard / wing / centre proportions. v24: the repaired v12 clips everywhere.
 *  `?hoopsReferee=0`      hoops-ref-scoreboard-v1 (Codex, CC0): a referee on the far sideline who makes the calls the whistles sound.
 *  `?hoopsV241=0`         every switch above at once (v24 exactly).
 * Pure: the URL is read only when a browser location exists, three.js only in the view modules. */
const read=(name,search)=>{try{return new URLSearchParams(search??globalThis.location?.search??'').get(name);}catch{return null;}};
const allOff=search=>read('hoopsV241',search)==='0';
const on=(name,search)=>!allOff(search)&&read(name,search)!=='0';
export const hoopsWhistleV241Enabled=search=>on('hoopsWhistleV241',search);
/** 'budget' (default), 'full' or 'off'. */
export const hoopsCrowd3dMode=search=>{if(allOff(search))return 'off';const v=read('hoopsCrowd3d',search);return v==='0'||v==='off'?'off':v==='full'?'full':'budget';};
export const hoopsBodyV2Enabled=search=>on('hoopsBodyV2',search);
export const hoopsMotionV13Enabled=search=>on('hoopsMotionV13',search);
export const hoopsRefereeEnabled=search=>on('hoopsReferee',search);
/** One line of the switches for the load report, the metrics and the tests. */
export function hoopsV241Flags(search){return {whistle:hoopsWhistleV241Enabled(search),crowd3d:hoopsCrowd3dMode(search),bodyV2:hoopsBodyV2Enabled(search),motionV13:hoopsMotionV13Enabled(search),referee:hoopsRefereeEnabled(search)};}
export const hoopsV241Url=path=>new URL('../assets/hoops-v241/'+path,import.meta.url).href;

// ---- 1. referee whistles (design/hoops-referee-audio-v1) ------------------------------------------------------------------------------
/** The two whistles the game uses (runtime copies in assets/hoops-v241/referee-audio; OGG first, MP3 when the browser cannot decode OGG).
 * `volume` is the pack's recommended linear gain after its -23 LUFS normalisation: about -30 LUFS in the hall, between the swish (-27) and
 * the crowd (-32) of design/audio/mix.json. The v24 whistle sample measured -13 LUFS at its gain (the loudest thing in the mix). */
export const HOOPS_REFEREE_WHISTLES=Object.freeze({
  steal:Object.freeze({id:'whistle-steal-short',seconds:.55,volume:.46}),
  foul:Object.freeze({id:'whistle-foul-long',seconds:1.45,volume:.46}),
});
/** Which pack whistle an engine event gets (v24.1), null for none. A steal and an intercepted pass take the short whistle, a foul the long one;
 * violations, timeouts and the opening tip keep the v24 rules and sample (sports-audio-rules.mjs). Pure. */
export function hoopsRefereeWhistle(event){
  const type=event?.type;
  if(type==='steal'||type==='interception')return 'steal';
  if(type==='foul')return 'foul';
  return null;
}
