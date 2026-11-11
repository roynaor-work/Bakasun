/** Soccer feel v2 (11/11/2026, Roy's phone test of M3: "the slide tackle looks distorted and unnatural", "players react slowly in
 * movement when defending or when a ball suddenly reaches them"). Two halves share this one switch:
 *  presentation: the repaired Codex motion-fix-v12 clips for the slide (v8 `slide`, v9 `slide_miss` + `quick_getup`) and the keeper dives
 *    (v11 `keeper_dive_left/right`, v8 `keeper_dive_*`), fitted to the simulation's own slide / recovery / dive clocks, body held where it landed;
 *  simulation: receivers and defenders move at a pass release, faster player switch after a turnover, pass-lane cover and rival off-ball runs.
 * `?soccerFeel=0` (or the option 'v1'/'0') restores the match and the clips exactly as they were. Pure: the URL is read only when a browser
 * location exists; everything below is unit-tested without a renderer. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function resolveSoccerFeel(option,search=globalThis.location?.search){
  const pick=value=>value==='v2'?'v2':value==='0'||value==='v1'||value==='off'?'v1':null;
  const fromUrl=typeof search==='string'?pick(new URLSearchParams(search).get('soccerFeel')):null;
  return pick(option)||fromUrl||'v2';
}
export const soccerFeelEnabled=(option,search)=>resolveSoccerFeel(option,search)==='v2';
/** Defaults for the simulation half; `config.feel` overrides field by field (data/config.json, minigames.soccer.feel). */
export const SOCCER_FEEL_DEFAULTS=Object.freeze({
  /** Seconds a rival pass is in flight before the defending team re-plans around it (after this the presser runs to the intercept point and a
   * second defender marks the receiver), per difficulty: a child-level rival reacts like a child. */
  reaction:{easy:.24,normal:.18,hard:.12},
  /** The child's AI team-mates: null = the difficulty's reaction; a number slows them down so the rival keeps its attack (tuned by the sim). */
  teamReaction:null,
  /** Whether the child's team also screens the pass lane (false keeps the rival's attack as tuned; the rival always screens). */
  laneTeam0:true,
  /** Auto-switch dwell right after the ball changes team (seconds); the normal dwell (autoSwitchSeconds, 0.5) returns after turnoverWindow. */
  switchTurnoverSeconds:.12,turnoverWindow:1,
  /** The controlled receiver runs onto a pass by himself (stick idle) from this far, instead of only inside receiveRunDistance (3.2 m). */
  receiveRunDistance:9,
  /** Rival off-ball runs (the design attack runs the child's team already has) from this stage, only while the carrier has this much free
   * space ahead (metres to the nearest opponent in front). */
  rivalRunsFromStage:3,rivalRunSpace:4,
  /** A second defender screens the pass lane toward the most advanced attacker: lane fraction from the carrier, goal-side offset (m). */
  laneFraction:.55,laneGoalSide:.9,
});
export const soccerFeelConfig=config=>({...SOCCER_FEEL_DEFAULTS,...(config?.feel||{}),reaction:{...SOCCER_FEEL_DEFAULTS.reaction,...(config?.feel?.reaction||{})}});

// ---- clips -----------------------------------------------------------------------------------------------------------------------------------
/** The repaired dive and slide clips carry the body's travel as hips root motion (v8 dives up to 0.98 m sideways). The simulation already
 * moves the player (slide distance, keeper dive speed), so the clip's horizontal root is dropped and only the drop to the ground stays: the
 * body lands where the engine says it does. Returns a new state; the input is untouched. */
export function flattenRootMotion(state){
  return {...state,keyframes:state.keyframes.map(k=>({...k,hipsOffsetMeters:[0,(k.hipsOffsetMeters||[0,0,0])[1],0]}))};
}
export const SOCCER_FEEL_FLATTEN=/^(slide|keeper_dive_|slide_miss$|quick_getup$|goalkeeper_getup$)/;
const eventTime=(state,name)=>state?.events?.find(e=>e.name===name)?.timeSeconds??null;
/** Which repaired dive to play: the v11 dives (96.7) for a ball the keeper can reach with a low or middle dive, the v8 repaired row for a high
 * ball (or when v11 is missing). `left` is the keeper's own left; the centre clips are for a ball straight at him. */
export function soccerFeelDiveClip(left,ballHeight,has,{centre=false}={}){
  if(ballHeight<=1.35&&!centre){const v11=`v11_keeper_dive_${left?'left':'right'}`;if(has(v11))return v11;}
  const row=ballHeight>1.35?'high':ballHeight>.6?'middle':'low',side=centre&&row!=='low'?'center':left?'left':'right',name=`v8_keeper_dive_${row}_${side}`;
  return has(name)?name:null;
}
/** Fit a dive clip to the simulation's dive: the push-off (takeoff, or 45% of the way to the glove contact when the clip has none) starts
 * `lead` seconds before the entry, the glove contact arrives at `reachShare` of the simulated dive (0.65 s), the landing and the getting up
 * play at `settleRate`. `land` and `stand` (last foot plant) tell the view when the body is on the ground and when it is back on its feet. */
export function soccerFeelDivePlan(state,diveSeconds=.65,{lead=.1,reachShare=.7,settleRate=1.05}={}){
  const contact=eventTime(state,'visual_contact')??eventTime(state,'visual_catch');
  if(!(contact>0))return null;
  const takeoff=eventTime(state,'visual_takeoff')??contact*.45,at=Math.max(0,takeoff-lead),land=eventTime(state,'visual_land')??Math.min(state.durationSeconds,contact+.45);
  const stand=Number.isFinite(state.standSeconds)?state.standSeconds:state.durationSeconds;
  return {at,contact,land,stand,duration:state.durationSeconds,rate:Math.max(1,(contact-at)/Math.max(.1,diveSeconds*reachShare)),settleRate};
}
/** Slide timeline over the repaired clips. Three parts of one virtual time axis:
 *  slide: the simulation's slideTime (counts down from the variant's seconds) drives the clip from `lead` before the takeoff to the landing;
 *  recover: the simulation's recovery clock drives the landing-to-standing part at a rate that fits it into recovery + grace (never below 1x);
 *  tail: once the simulation lets go, a standing player finishes the clip at that rate; a moving one blends into the run.
 * won = the v8 `slide` all the way (it gets up by itself); lost = v9 `slide_miss` (lies down) then v9 `quick_getup`. */
export function soccerFeelSlidePlan(states,{lead=.14}={}){
  const slide=states.v8_slide,miss=states.v9_slide_miss,getup=states.v9_quick_getup;
  if(!slide)return null;
  const stand=s=>Number.isFinite(s.standSeconds)?s.standSeconds:s.durationSeconds;
  const won={slide:{clip:'v8_slide',from:Math.max(0,(eventTime(slide,'visual_takeoff')??.5)-lead),to:eventTime(slide,'visual_land')??1.16},recover:[],tail:null};
  // The tail after the last foot plant is the clip settling into a stand; a quarter second of it is enough before locomotion takes over.
  won.recover=[{clip:'v8_slide',from:won.slide.to,to:stand(slide)}];won.tail={clip:'v8_slide',from:stand(slide),to:Math.min(slide.durationSeconds,stand(slide)+.25)};
  let lost=null;
  if(miss&&getup){
    lost={slide:{clip:'v9_slide_miss',from:Math.max(0,(eventTime(miss,'visual_takeoff')??.2)-lead),to:eventTime(miss,'visual_land')??1},recover:[],tail:null};
    // 0.3 s of lying after the fall, then the whole get-up: the full 0.8 s of lying forced the get-up to 2.2x (27.6 degrees per frame, measured).
    lost.recover=[{clip:'v9_slide_miss',from:lost.slide.to,to:Math.min(miss.durationSeconds,lost.slide.to+.3)},{clip:'v9_quick_getup',from:0,to:getup.durationSeconds}];
    lost.tail={clip:'v9_quick_getup',from:getup.durationSeconds,to:getup.durationSeconds};
  }
  return {won,lost:lost||won};
}
const partsLength=parts=>parts.reduce((n,p)=>n+(p.to-p.from),0);
/** Clip and time for `seconds` of virtual progress through `parts` (then into `tail`). Returns {clip,time,done}. */
export function slideFeelCursor(parts,tail,seconds){
  let left=Math.max(0,seconds);
  for(const part of parts){const span=part.to-part.from;if(left<=span)return {clip:part.clip,time:part.from+left,done:false};left-=span;}
  if(tail){const span=tail.to-tail.from;if(left<span)return {clip:tail.clip,time:tail.from+left,done:false};return {clip:tail.clip,time:tail.to,done:true};}
  const last=parts.at(-1);return {clip:last.clip,time:last.to,done:true};
}
/** Rate for the recovery parts: fit them into the simulated recovery plus the grace, never slower than real time. */
export const slideFeelRecoverRate=(parts,recoverSeconds,grace)=>Math.max(1,partsLength(parts)/Math.max(.05,recoverSeconds+grace));

// ---- simulation ------------------------------------------------------------------------------------------------------------------------------
/** Auto-switch dwell right after a turnover: the child is looking at the ball, the switch should follow it at once. */
export function feelSwitchDwell(feel,dwell,elapsed,turnoverAt){
  return Number.isFinite(turnoverAt)&&elapsed-turnoverAt<=feel.turnoverWindow?Math.min(dwell,feel.switchTurnoverSeconds):dwell;
}
/** Point on the pass path (from the ball toward its destination) a defender can reach: the nearest point of the segment to him, pulled
 * toward the destination by the ball's head start (it is already moving); never behind the ball. */
export function passInterceptPoint(defender,ball,target,headStart=.25){
  const dx=target.x-ball.x,dz=target.z-ball.z,len2=dx*dx+dz*dz;
  if(!(len2>1e-6))return {x:target.x,z:target.z};
  const t=clamp(((defender.x-ball.x)*dx+(defender.z-ball.z)*dz)/len2,0,1),u=clamp(t+headStart,0,1);
  return {x:ball.x+dx*u,z:ball.z+dz*u};
}
/** Free space in front of a carrier: distance to the nearest opponent (not keeper) ahead of him, Infinity when none. */
export function spaceAhead(owner,players,d){
  let best=Infinity;
  for(const q of players)if(q.team!==owner.team&&q.role!=='keeper'&&(q.x-owner.x)*d>-.5)best=Math.min(best,Math.hypot(q.x-owner.x,q.z-owner.z));
  return best;
}
