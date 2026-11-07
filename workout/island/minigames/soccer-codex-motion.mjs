/** Codex soccer motion library v9 (48 original clips): the clips the game plays, chosen by state.
 * Presentation only; the ball, ownership and the result stay with the simulation. Falls back silently to what shipped before:
 * `?soccerMotionV9=0` switches it off (not to be confused with `?soccerMotion=0`, the arm/slide work), `config.soccer.codexMotion=false` too.
 * assets/soccer-v9/clips.json is built by tools/soccer-v9-clips.mjs (same 18 bones and rest pose as the v7/v8 characters). */
export const soccerCodexMotionEnabled=(config,search=globalThis.location?.search||'')=>new URLSearchParams(search).get('soccerMotionV9')!=='0'&&config?.codexMotion!==false;
export const soccerCodexClipsUrl=()=>new URL('../assets/soccer-v9/clips.json',import.meta.url).href;
export const SOCCER_CODEX_PREFIX='v9_';
export function soccerCodexStates(json){
  if(!json||json.schemaVersion!==1||!json.states)throw Error('Soccer v9 clips: unexpected file');
  return Object.fromEntries(Object.entries(json.states).map(([name,state])=>[SOCCER_CODEX_PREFIX+name,{...state,clip:SOCCER_CODEX_PREFIX+name}]));
}
/** Speed ladder with the library's walk (1.0 m/s) and jog (2.6 m/s) in place of the v7 run_1..run_3, which were runs slowed down.
 * All clips share one foot phase (left foot plants at 0, right at half), so a rung change keeps the feet from popping. */
export const SOCCER_CODEX_LADDER=Object.freeze([['v9_walk',1],['v9_jog',2.6],['run_4',4.2],['run_5',5.4],['sprint',7.2]]);
/** Rung boundaries (m/s). Walk to jog is at 1.55, not the midpoint 1.8: a walk is played up to 1.55x and a jog down to 0.6x. */
export const SOCCER_CODEX_BOUNDS=Object.freeze([1.55,3.4,4.8,6.3]);
/** Rung index for a speed with hysteresis (stay until clearly past the boundary between two rungs). */
export function soccerLadderRung(ladder,speed,current=-1,fixed=null){
  const bounds=fixed||ladder.slice(1).map((rung,i)=>(ladder[i][1]+rung[1])/2);
  let index=bounds.findIndex(b=>speed<b);if(index<0)index=bounds.length;
  if(current>=0&&Math.abs(index-current)===1){const edge=bounds[Math.min(index,current)];if(Math.abs(speed-edge)<.25)index=current;}
  return index;
}
/** A shot hit at least this hard plays the long shot; a ground pass released while running plays the running pass. */
export const SOCCER_CODEX_LONG_SHOT_POWER=.75,SOCCER_CODEX_RUNNING_PASS_SPEED=3.2;
export function soccerCodexKickClip(state,speed,has){
  const event=state.event,shot=event?.type==='shot';
  const name=shot?(event.power>=SOCCER_CODEX_LONG_SHOT_POWER?'long_shot':null):!state.ball.flight&&speed>=SOCCER_CODEX_RUNNING_PASS_SPEED?'running_pass':null;
  return name&&has(SOCCER_CODEX_PREFIX+name)?SOCCER_CODEX_PREFIX+name:null;
}
export function soccerCodexKeeperCatch(ballHeight,has){
  const name=SOCCER_CODEX_PREFIX+(ballHeight>1?'goalkeeper_catch_high':'goalkeeper_catch_low');
  return has(name)?name:null;
}
/** Idle variety: relaxed -> scan -> weight shift, each held for a few seconds, offset per player so a team never idles in step. */
export const SOCCER_CODEX_IDLES=Object.freeze(['v9_idle_relaxed','v9_idle_scan','v9_idle_weight_shift']);
export const soccerCodexIdleHold=id=>4.6+(id%4)*.7;
export function soccerCodexNextIdle(current){const i=SOCCER_CODEX_IDLES.indexOf(current);return SOCCER_CODEX_IDLES[(i+1)%SOCCER_CODEX_IDLES.length];}
export const SOCCER_CODEX_CELEBRATIONS=Object.freeze(['v9_celebrate_pump','v9_celebrate_hop','v9_celebrate_turn','v9_celebrate_clap']);
/** Once-clips that must play to the end (or until the player clearly moves off): brake, keeper catches. */
export const soccerCodexHeld=state=>state.startsWith('v9_celebrate')||state.startsWith('v9_goalkeeper_catch')||state==='v9_running_pass'||state==='v9_long_shot';
/** Brake after a sudden stop from at least this speed. */
export const SOCCER_CODEX_BRAKE_FROM=3;
