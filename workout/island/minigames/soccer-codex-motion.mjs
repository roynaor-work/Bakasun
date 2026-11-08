/** Codex soccer motion library v9 (48 original clips): the clips the game plays, chosen by state.
 * Presentation only; the ball, ownership and the result stay with the simulation. Falls back silently to what shipped before:
 * `?soccerMotionV9=0` switches it off (not to be confused with `?soccerMotion=0`, the arm/slide work), `config.soccer.codexMotion=false` too.
 * assets/soccer-v9/clips.json is built by tools/soccer-v9-clips.mjs (same 18 bones and rest pose as the v7/v8 characters). */
export const soccerCodexMotionEnabled=(config,search=globalThis.location?.search||'')=>new URLSearchParams(search).get('soccerMotionV9')!=='0'&&config?.codexMotion!==false;
/** `?soccerRunV9=0` (or config.codexRun=false) keeps the v7 runs (run_4, run_5, sprint) and only the Codex walk and jog below them. */
export const soccerCodexRunEnabled=(config,search=globalThis.location?.search||'')=>new URLSearchParams(search).get('soccerRunV9')!=='0'&&config?.codexRun!==false;
export const soccerCodexClipsUrl=()=>new URL('../assets/soccer-v9/clips.json',import.meta.url).href;
export const SOCCER_CODEX_PREFIX='v9_';
export function soccerCodexStates(json){
  if(!json||json.schemaVersion!==1||!json.states)throw Error('Soccer v9 clips: unexpected file');
  return Object.fromEntries(Object.entries(json.states).map(([name,state])=>[SOCCER_CODEX_PREFIX+name,{...state,clip:SOCCER_CODEX_PREFIX+name}]));
}
/** Speed ladder with the library's walk (1.0 m/s) and jog (2.6 m/s) in place of the v7 run_1..run_3, which were runs slowed down.
 * All clips share one foot phase (left foot plants at 0, right at half), so a rung change keeps the feet from popping. */
export const SOCCER_CODEX_LADDER=Object.freeze([['v9_walk',1],['v9_jog',2.6],['run_4',4.2],['run_5',5.4],['sprint',7.2]]);
/** Ladder with the library's own run (4.5 m/s) and sprint (7.2 m/s) as well: the runs the controlled player is on 89% of the time. */
export const SOCCER_CODEX_RUN_LADDER=Object.freeze([['v9_walk',1],['v9_jog',2.6],['v9_run',4.5],['v9_sprint',7.2]]);
export const SOCCER_CODEX_RUN_BOUNDS=Object.freeze([1.55,3.5,6]);
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

// ---- Codex v10 (30 clips): corrected idle and run, short cuts, short first touches ------------------------------------------------
/** `?soccerMotionV10=0` (or config.soccer.codexV10=false) switches the v10 clips off and keeps v9. */
export const soccerMotionV10Enabled=(config,search=globalThis.location?.search||'')=>new URLSearchParams(search).get('soccerMotionV10')!=='0'&&config?.codexV10!==false&&soccerCodexMotionEnabled(config,search);
export const soccerV10ClipsUrl=()=>new URL('../assets/soccer-v10/clips.json',import.meta.url).href;
export const SOCCER_V10_PREFIX='v10_';
/** A clip whose neighbouring keys differ by more than this (degrees per 1/30 s, worst bone) snaps visibly (measured: the v10 cuts of 45,
 * 90 and 135 degrees and the brake-and-reaccelerate whip an arm 76-113 degrees in one key). They are left out unless `?soccerCuts=all`. */
export const SOCCER_V10_MAX_KEY_DEG=70;
export function soccerV10States(json,search=globalThis.location?.search||''){
  if(!json||json.schemaVersion!==1||!json.states)throw Error('Soccer v10 clips: unexpected file');
  const all=new URLSearchParams(search).get('soccerCuts')==='all';
  return Object.fromEntries(Object.entries(json.states).filter(([,state])=>all||!(state.maxKeyDeg>SOCCER_V10_MAX_KEY_DEG)).map(([name,state])=>[SOCCER_V10_PREFIX+name,{...state,clip:SOCCER_V10_PREFIX+name}]));
}
export const SOCCER_V10_IDLES=Object.freeze(['v10_idle_relaxed','v10_idle_scan','v10_idle_weight_shift']);
/** The run ladder with the corrected v10 run (hips 2.5 cm peak to peak, elbows 90 to 110 degrees) in place of the v9 run. */
export const soccerRunLadder=useV10=>useV10?Object.freeze(SOCCER_CODEX_RUN_LADDER.map(([name,speed])=>[name==='v9_run'?'v10_run':name,speed])):SOCCER_CODEX_RUN_LADDER;
/** A turn this big (radians, accumulated over about 0.2 s) at a run plays a cut; the cut is the nearest of 45, 90, 135, 180 degrees.
 * Positive yaw change = a turn to the player's anatomical left (+X), as in the clips. */
export const SOCCER_V10_CUT_MIN=.61,SOCCER_V10_CUT_MIN_SPEED=3,SOCCER_V10_TURN_RATE=16,SOCCER_V10_CUT_MIN_STEP=.05;
/** The simulation turns a player by an exponential approach to his wanted heading (turnRate 14-18 per second), so what is still to turn is
 * about angular speed / turnRate. The cut is chosen from what has turned so far plus that remainder, which is known on the first frame of a
 * sharp turn; `omega` is the signed angular speed in rad/s. */
export function soccerV10CutClip(accumulated,has,omega=0){
  const total=accumulated+omega/SOCCER_V10_TURN_RATE,a=Math.abs(total);if(!(a>=SOCCER_V10_CUT_MIN))return null;
  const angle=a<1.18?45:a<1.96?90:a<2.74?135:180,name=`v10_cut_${angle}_${total>0?'left':'right'}`;
  return has(name)?name:null;
}
/** The short first touch for a ball that has just reached a player: surface from the ball's height (chest 1.05-1.6 m, thigh 0.45-1.05 m,
 * foot below), running version when he was moving at least 2 m/s. The inside of the foot is the default on the ground; every third player
 * (by id) uses the outside. */
export function soccerV10FirstTouchClip(height,speed,id,has){
  const surface=height>=1.05?'chest':height>=.45?'thigh':(id%3===0?'outside':'inside'),name=`v10_first_touch_${surface}_${speed>=2?'running':'standing'}_quick`;
  return has(name)?name:null;
}
/** Clips that play to their end: the v9 held ones plus the cuts and the first touches. */
export const soccerV10Held=state=>state.startsWith('v10_cut_')||state.startsWith('v10_first_touch_');
/** What the match loaded, as a line for the load report and the debug view. */
export function soccerMotionLoadSummary(counts,errors){return `motion clips: v8 ${counts.v8}, v9 ${counts.v9}, v10 ${counts.v10}`+(errors.length?` · skipped: ${errors.join('; ')}`:'');}
