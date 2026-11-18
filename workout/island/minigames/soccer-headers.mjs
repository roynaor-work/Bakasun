/** Codex soccer-header-v1 (PR 416, QA 95.4-98.5, 0 red metrics): six header clips the game plays when the simulation heads the ball.
 * Presentation only: the ball, ownership and the result stay with the simulation (`p.headerTime`, event `header` / `clearance`).
 * `?soccerHeaders=0` (or config.soccer.headers=false) returns the previous look exactly: the shared body keeps its own `header` clip.
 * assets/soccer-v22/headers.json is built by tools/soccer-v22-headers-clips.mjs (core range only, same 18 bones as the other Codex packs). */
export const soccerHeadersEnabled=(config,search=globalThis.location?.search||'')=>new URLSearchParams(search).get('soccerHeaders')!=='0'&&config?.headers!==false;
export const soccerHeaderClipsUrl=()=>new URL('../assets/soccer-v22/headers.json',import.meta.url).href;
export const SOCCER_HEADER_PREFIX='v22_';
export const SOCCER_HEADER_IDS=Object.freeze(['header_stand_goal','header_jump_goal','header_jump_left','header_jump_right','header_clear','header_dive']);
export function soccerHeaderStates(json){
  if(!json||json.schemaVersion!==1||!json.states)throw Error('Soccer v22 header clips: unexpected file');
  return Object.fromEntries(Object.entries(json.states).map(([name,state])=>[SOCCER_HEADER_PREFIX+name,{...state,clip:SOCCER_HEADER_PREFIX+name}]));
}
export const soccerHeaderState=name=>typeof name==='string'&&name.startsWith(SOCCER_HEADER_PREFIX+'header_');
/** The simulation releases the ball on the first frame of `headerTime`, so the clip is entered this long before its own contact (a longer
 * lead would put the visible contact after the ball has left). The way out is a full 6 frames (0.2 s at 30 Hz) of crossfade to the run or the idle. */
export const SOCCER_HEADER_LEAD=.1,SOCCER_HEADER_ENTRY_FADE=.1,SOCCER_HEADER_EXIT_FADE=.2;
/** Seconds after contact during which a header clip is held even if the player sets off at once (the head and torso follow through). */
export const SOCCER_HEADER_FOLLOW=.3;
/** Ball lower than this at the strike (and a player at speed): the diving header; up to STAND_MAX_HEIGHT: standing; above: the jumping one. */
export const SOCCER_HEADER_DIVE_MAX_HEIGHT=1.2,SOCCER_HEADER_DIVE_MIN_SPEED=3.6,SOCCER_HEADER_STAND_MAX_HEIGHT=1.52;
/** Turn of the body (rad, positive = to the anatomical left, as the cut clips) from the approach to the header direction that picks a side clip. */
export const SOCCER_HEADER_SIDE_TURN=.45;
/** Which clip for this header: clearance (own half, ball sent back or wide), dive (low ball, running), standing (chest-to-head height ball),
 * otherwise a jump whose side comes from the turn of the body. Null when the pack is not loaded. */
export function soccerHeaderClip({clear=false,ballHeight=1.45,speed=0,turn=0},has){
  const pick=id=>has(SOCCER_HEADER_PREFIX+id)?SOCCER_HEADER_PREFIX+id:null;
  if(clear)return pick('header_clear');
  if(ballHeight<SOCCER_HEADER_DIVE_MAX_HEIGHT&&speed>=SOCCER_HEADER_DIVE_MIN_SPEED)return pick('header_dive');
  if(ballHeight<=SOCCER_HEADER_STAND_MAX_HEIGHT)return pick('header_stand_goal');
  return pick(turn>SOCCER_HEADER_SIDE_TURN?'header_jump_left':turn<-SOCCER_HEADER_SIDE_TURN?'header_jump_right':'header_jump_goal');
}
/** Was it a clearance: the event the simulation just raised for this player, or a header that sends the ball back towards the own goal. */
export function soccerHeaderIsClear(p,s){
  if(s.event&&s.event.player===p.id&&(s.event.type==='clearance'||s.event.type==='header'))return s.event.type==='clearance';
  const dir=(s.attackDir||1)*(p.team===0?1:-1);return (s.ball.vx||0)*dir<0;
}
/** Entry plan: where in the clip to start so that its contact meets the simulation's strike. */
export function soccerHeaderPlan(state){
  const contact=state?.ballContacts?.[0]?.atSeconds??state?.events?.find(e=>e.name==='visual_contact')?.timeSeconds??0;
  return {contact,at:Math.max(0,contact-SOCCER_HEADER_LEAD),land:state?.events?.find(e=>e.name==='visual_land')?.timeSeconds??null,takeoff:state?.events?.find(e=>e.name==='visual_takeoff')?.timeSeconds??null};
}
/** Events (visual_takeoff, visual_contact, visual_land) passed between two clip times, first to last. */
export function soccerHeaderEvents(state,from,to){
  if(!state?.events)return [];
  return state.events.filter(e=>e.timeSeconds>from+1e-9&&e.timeSeconds<=to+1e-9).sort((a,b)=>a.timeSeconds-b.timeSeconds);
}
/** The phase a header clip is in at time t: prep -> takeoff -> contact -> land -> recover (events a clip lacks are skipped). */
export function soccerHeaderPhase(state,t){
  const plan=soccerHeaderPlan(state);let phase='prep';
  if(plan.takeoff!==null&&t>=plan.takeoff)phase='takeoff';
  if(t>=plan.contact)phase='contact';
  if(plan.land!==null&&t>=plan.land)phase='land';
  if(t>=plan.contact+SOCCER_HEADER_FOLLOW&&(plan.land===null||t>=plan.land))phase='recover';
  return phase;
}

// ---- Codex soccer-keeper-crowd-v1 (PR 418): the beaten keeper -----------------------------------------------------------------------------
/** `?soccerKeeperCrowd=0` (or config.keeperCrowd=false) returns the previous look: the beaten keeper stands in a restless idle. */
export const soccerKeeperCrowdEnabled=(config,search=globalThis.location?.search||'')=>new URLSearchParams(search).get('soccerKeeperCrowd')!=='0'&&config?.keeperCrowd!==false;
export const soccerKeeperClipsUrl=()=>new URL('../assets/soccer-v22/keeper.json',import.meta.url).href;
export const SOCCER_KEEPER_AFTER_GOAL=SOCCER_HEADER_PREFIX+'keeper_after_goal',SOCCER_KEEPER_DISAPPOINTED=SOCCER_HEADER_PREFIX+'disappointed';
export function soccerKeeperStates(json){
  if(!json||json.schemaVersion!==1||!json.states)throw Error('Soccer v22 keeper clips: unexpected file');
  return Object.fromEntries(Object.entries(json.states).map(([name,state])=>[SOCCER_HEADER_PREFIX+name,{...state,clip:SOCCER_HEADER_PREFIX+name}]));
}
/** The beaten keeper drops his head and a hand to the grass for 2.5 s (keeper_after_goal); if the goal phase lasts longer he moves on to the
 * looping `disappointed`. Returns the clip to switch to, or null when nothing changes. */
export const SOCCER_KEEPER_AFTER_GOAL_FADE=.25;
export function soccerKeeperDejectedNext(state,time,durationSeconds,has){
  return state===SOCCER_KEEPER_AFTER_GOAL&&time>=durationSeconds-.03&&has(SOCCER_KEEPER_DISAPPOINTED)?SOCCER_KEEPER_DISAPPOINTED:null;
}
