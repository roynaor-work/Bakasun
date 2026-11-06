/** GPT soccer v8 (08/11 pack): motion clips and the evening stadium.
 * Both parts are presentation only and fall back silently to what shipped before:
 * `?soccerV8=0` switches the whole thing off, `config.soccer.v8.motion/stadium=false` each part. The ball, ownership and the result
 * stay with the simulation; clip events only time visuals.
 * Motion: assets/soccer-v8/clips.json is built from the pack's player.glb/keeper.glb by tools/soccer-v8-clips.mjs (same 18 canonical bones
 * and rest pose as the v7 characters, so the v7 compiler reads it unchanged). */
export const soccerV8Enabled=(config,part,search=globalThis.location?.search||'')=>new URLSearchParams(search).get('soccerV8')!=='0'&&config?.v8?.[part]!==false;
export const soccerV8ClipsUrl=()=>new URL('../assets/soccer-v8/clips.json',import.meta.url).href;
export const SOCCER_V8_PREFIX='v8_';

/** Rename the pack's states with the v8_ prefix so they never replace a v7 or library state of the same name. */
export function soccerV8States(json){
  if(!json||json.schemaVersion!==1||!json.states)throw Error('Soccer v8 clips: unexpected file');
  return Object.fromEntries(Object.entries(json.states).map(([name,state])=>[SOCCER_V8_PREFIX+name,{...state,clip:SOCCER_V8_PREFIX+name}]));
}
/** Horizontal ball speed (m/s) above which a ground pass plays the long pass clip. */
export const SOCCER_V8_LONG_PASS_SPEED=10.5;
/** Which v8 action clip fits a kick the simulation has just released (null when v8 is not loaded). */
export function soccerV8KickClip(state,has){
  const shot=state.event?.type==='shot';
  const name=shot?'shot':state.ball.flight?'pass_loft':Math.hypot(state.ball.vx||0,state.ball.vz||0)>SOCCER_V8_LONG_PASS_SPEED?'pass_long':'pass_short';
  return has(SOCCER_V8_PREFIX+name)?SOCCER_V8_PREFIX+name:null;
}
/** Keeper dive clip. `left` is the keeper's own left (the pack names sides from the keeper's point of view), the row comes
 * from the ball height when the dive starts (goal height 2.3 m). */
export function soccerV8DiveClip(left,ballHeight,has){
  const row=ballHeight>1.35?'high':ballHeight>.6?'middle':'low',name=`${SOCCER_V8_PREFIX}keeper_dive_${row}_${left?'left':'right'}`;
  return has(name)?name:null;
}
/** Time (seconds) of a named event inside a state, or null. */
export const soccerV8EventTime=(state,name)=>state?.events?.find(e=>e.name===name)?.timeSeconds??null;
/** Entry point and speed for a dive. The preparation (crouch) is mostly skipped, the push-off to the glove contact plays in
 * `reachSeconds`, and the landing and the getting up play near real time. */
export function soccerV8DivePlan(state,{lead=.1,reachSeconds=.5,settleRate=1.15}={}){
  const takeoff=soccerV8EventTime(state,'visual_takeoff')??soccerV8EventTime(state,'visual_contact')*.45,contact=soccerV8EventTime(state,'visual_contact');
  if(contact===null)return null;
  const at=Math.max(0,takeoff-lead);return {at,contact,rate:Math.max(1,(contact-at)/reachSeconds),settleRate};
}
