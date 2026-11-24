/** Soccer v24.1 (14/11/2026): Roy after v24 ("בכדור רגל לא ראיתי שום רדאר / וגם למען האמת לא צריך אחד כזה"; "גם כאשר יש הגבהה והיא לא
 * גבוהה אפשר גם במקום לנגוח או לבעוט / או אם המסירה גבוהה גם לעשות מספרת") and his open notes on the players (get-up after a slide is long,
 * falls and get-ups without a foul, the keeper's dives at one height, a whistle when a tackle is a foul). Every change has its own URL switch
 * that brings back v24 exactly, and `?soccerV241=0` turns all of them off at once:
 *  `?soccerRadar=1`       the v24 radar in the corner (default: no radar).
 *  `?soccerAirChoice=0`   high balls as in v24 (the kick button heads, nothing else). Default: the kick button and the fourth button offer
 *                         two ways to meet the ball, by its height when it comes down to the player: volley, header or backward scissor kick.
 *  `?soccerFouls=v24`     no fouls on standing tackles and no reaction of the carrier (default: a tackle from behind can be a foul, the
 *                         referee whistles, the fouled carrier falls and gets up; a clean tackle only makes him stumble).
 *  `?soccerWhistleV1=0`   one whistle sample for every call (default: Codex soccer-whistle-crowd-v1: kickoff, foul, short, half and full time).
 *  `?soccerTackleV2=0`    the v24 slide clip, its 0.5 s longer get-up in the full match and the v8/v11 keeper dives (default: Codex
 *                         soccer-tackle-keeper-v2: slide + quick get-up, stumble, foul fall + get-up, keeper dives low / middle / high).
 *  `?soccerKicksV2=0`     the v8/v9 kick and pass clips (default: Codex soccer-kicks-v2, 14 distinct kicks and passes by situation).
 * Engine rules (fouls, high balls, the slide recovery) follow soccer-full.mjs: on in a page unless switched off, off in node unless an
 * option or `search` asks, so every contract written for the v24 match keeps testing the v24 match. Pure: no three.js and no DOM. */
const read=(name,search)=>{try{const q=typeof search==='string'?search:globalThis.location?.search;return typeof q==='string'?new URLSearchParams(q).get(name):null;}catch{return null;}};
const hasPage=search=>typeof (typeof search==='string'?search:globalThis.location?.search)==='string';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=n=>Math.round(n*1000)/1000;
const finite=n=>Number.isFinite(n)?n:0;
const master=search=>read('soccerV241',search)!=='0';
export const SOCCER_V241_TAG='island-v2-20261107-24';

// ---- switches ----------------------------------------------------------------------------------------------------------------------------
/** The radar comes back only when asked (`?soccerRadar=1`) or with every v24.1 change off. */
export const soccerRadarEnabled=search=>read('soccerRadar',search)==='1'||!master(search);
/** A view/audio switch: in a page on unless its own flag or the master switch says 0; without a page (node) off unless a `search` is given. */
const view=(name,search)=>hasPage(search)&&master(search)&&read(name,search)!=='0';
export const soccerWhistleV1Enabled=search=>view('soccerWhistleV1',search);
export const soccerTackleV2Enabled=search=>view('soccerTackleV2',search);
export const soccerKicksV2Enabled=search=>view('soccerKicksV2',search);
/** Codex soccer-locomotion-v2 for the standing and walking players (`?soccerLocoV2=0` = the v10 idles and the v9 walk). */
export const soccerLocoV2Enabled=search=>view('soccerLocoV2',search);
/** Engine rules: an explicit option wins (true/false or 'v241'/'v24'), then the page's flags (on unless switched off), and without a page
 * (node) off unless asked. */
function engineRule(option,name,offValue,search){
  const pick=v=>v===true||v==='v241'||v==='1'?true:v===false||v==='v24'||v==='0'||v==='off'?false:null;
  const chosen=pick(option);if(chosen!==null)return chosen;
  if(!hasPage(search))return false;
  if(!master(search))return false;
  const value=read(name,search);return !(value==='0'||value===offValue||value==='off');
}
export const soccerAirChoiceEnabled=(option,search)=>engineRule(option,'soccerAirChoice','v24',search);
export const soccerFoulsV241Enabled=(option,search)=>engineRule(option,'soccerFouls','v24',search);
/** The shorter slide recovery goes with the quick get-up clip (one switch for both: the old clip stretched over 0.8 s would pop). */
export const soccerSlideRecoverV241Enabled=(option,search)=>engineRule(option,'soccerTackleV2','v24',search);
/** One object for the engine: which v24.1 rules this match plays (options win over the page). */
export function soccerV241Rules(options={},search){
  const v=options===true||options===false?{air:options,fouls:options,recover:options,level:options}:options||{};
  return {air:soccerAirChoiceEnabled(v.air,search),fouls:soccerFoulsV241Enabled(v.fouls,search),recover:soccerSlideRecoverV241Enabled(v.recover,search),level:soccerLevelV241Enabled(v.level,search)};
}
/** One line of every switch for the load report and the tests. */
export function soccerV241Flags(search){
  return {radar:soccerRadarEnabled(search),whistleV1:soccerWhistleV1Enabled(search),tackleV2:soccerTackleV2Enabled(search),kicksV2:soccerKicksV2Enabled(search),locoV2:soccerLocoV2Enabled(search),...soccerV241Rules({},search)};
}
export const soccerV241Url=path=>new URL('../assets/soccer-v241/'+path,import.meta.url).href;

// ---- 1. high balls: volley, header, backward scissor ----------------------------------------------------------------------------------
/** Ball-centre heights (m) at the contact, from Codex soccer-volley-scissor-v1 (catalog.selection: volley 0.5-1.2, header 1.5-2.2, scissor
 * 1.8-2.4) widened where the shipped header clips reach (v22: stand to 1.52, jump above, dive below 1.2). `reach` is the horizontal distance
 * from the player's centre at which the strike happens; `power` the shot power (0..1, the engine's shot formula), `lift` the ball's vertical
 * speed, `seconds` the action clock (as aerial.seconds for a header), `recover` how long the scissor kicker lies on his back afterwards.
 * Measured (tools/soccer-v24.1 sim, 155 of the child's lobs in 11 v 11): the lob peaks at 1.4-2.7 m and its receiver can head it from 0.8 to
 * 1.35 m, so a lob is "not high" (the volley is offered next to the header); punts and long balls are met at scissor height. */
export const SOCCER_AIR_V241=Object.freeze({
  volley:Object.freeze({min:.45,max:1.25,reach:1.15,power:.82,lift:1.1,seconds:.55}),
  header:Object.freeze({min:.8,max:2.4}),
  scissor:Object.freeze({min:1.7,max:2.45,reach:1.35,power:.92,lift:.9,seconds:.6,recover:1.05}),
  low:1.2,divingHeaderMin:.8,
  /** the scissor kick is for a high ball: its path peaks at least this high (the child's lobs peak at 1.4-2.7 m, punts and long balls 4-9 m)
   * and he is almost under it when it drops to scissor height (cap on the meet distance, m) */
  scissorApex:3,scissorCap:2.2,
  /** a press keeps the action armed this long at most (s), like SOCCER_LOB.headerWindow; the buttons show a choice this long ahead */
  armSeconds:1.15,prompt:1.1,
  /** a second way that drops out stays on the fourth button this long (s) while the first way holds (soccerAirSteady) */
  altGrace:.2,
});
/** Labels and icons the buttons show (the session owns the DOM). */
export const SOCCER_AIR_LABELS=Object.freeze({volley:'בעיטת עף',header:'נגיחה',scissor:'מספרת'});
/** The two ways to meet the high ball, from where each action can meet it (`meets`: the earliest point of its height band he can reach):
 *  - he can reach it at scissor height: a high ball, the header first and the scissor kick second ("אם המסירה גבוהה גם לעשות מספרת");
 *  - he can head it from chest height up: the header first and the volley second ("גם כאשר יש הגבהה והיא לא גבוהה אפשר גם במקום לנגוח ... לבעוט");
 *  - lower: the volley first and a diving header second while the head can still get there.
 * Returns {primary, alt} (alt may be null) or null when no high ball can be met. */
export function soccerAirChoice(meets,A=SOCCER_AIR_V241){
  const {header,volley,scissor}=meets||{};
  if(scissor&&header)return {primary:'header',alt:'scissor'};
  if(header&&header.y>=A.low)return {primary:'header',alt:volley?'volley':null};
  if(volley)return {primary:'volley',alt:header&&header.y>=A.divingHeaderMin?'header':null};
  if(header)return {primary:'header',alt:null};
  return null;
}
/** Buttons for the controlled player now: each action's meet inside the prompt window and the two choices (null when no high ball can be met).
 * `header` is the engine's header contact for this player ({min, max, reach}: the team-mate cross values on the child's side). */
export function soccerAirOptions(player,ball,c,{speed=5.3,horizon=SOCCER_AIR_V241.prompt,header=null}={}){
  if(!player||!ball||ball.owner!=null)return null;
  const meets={header:soccerAirMeet('header',player,ball,c,{horizon,speed,header}),volley:soccerAirMeet('volley',player,ball,c,{horizon,speed}),scissor:soccerAirApex(ball,c)>=SOCCER_AIR_V241.scissorApex?soccerAirMeet('scissor',player,ball,c,{horizon,speed}):null};
  const choice=soccerAirChoice(meets);if(!choice)return null;
  return {...choice,arrival:meets[choice.primary],meets};
}
/** The buttons hold still while the ball comes down: the way shown first stays first while he can still meet the ball that way, and the second
 * way stays second while it is still possible (a way he can no longer reach gives its place to the fresh choice). Measured in 11 v 11
 * (tools/soccer-v241-sim.mjs --n 6 --stages 2,4 --press 0: 34 high balls while the child bot runs on its own): without this the kick button
 * changed between "עף" and "נגיחה" in 15 of them, because the earliest header meet crosses 1.2 m back and forth as he runs (the real-touch
 * run saw 6 changes in one second on one ball); with it 3, each when the first way went out of reach. `prev` = last tick's options for the
 * same player (null starts afresh); the second way keeps soccerAirChoice's pairs (a diving header next to a volley only from its height, the
 * scissor kick only next to a header). A second way that drops out stays on the fourth button `altGrace` seconds more while the first way
 * holds (fourth-button changes 58 → 37 in those balls, back and forth inside a quarter second 6 → 3, mostly at the 2.2 m scissor reach); a
 * press in that time arms it toward the first way's meeting point (armAir). `now` = the match clock; the result carries `altSeen`. */
export function soccerAirSteady(prev,next,{now=0}={},A=SOCCER_AIR_V241){
  if(!next)return null;
  if(!prev)return {...next,altSeen:next.alt?now:null};
  const m=next.meets||{},can=k=>Boolean(k&&m[k]),primary=can(prev.primary)?prev.primary:next.primary;
  const ok=k=>k!==primary&&can(k)&&!(primary==='volley'&&k==='header'&&m.header.y<A.divingHeaderMin)&&!(k==='scissor'&&primary!=='header');
  let alt=ok(prev.alt)?prev.alt:[next.primary,next.alt].find(ok)??null,altSeen=alt?now:null;
  if(!alt&&prev.alt&&primary===prev.primary&&prev.altSeen!=null&&now-prev.altSeen<A.altGrace){alt=prev.alt;altSeen=prev.altSeen;}
  return {...next,primary,alt,arrival:m[primary],altSeen};
}
/** The highest point of the ball's path from now on (its flight's apex, or the free arc's), metres above the grass. */
export function soccerAirApex(ball,c){
  const r=c.physics?.ballRadius??.11,g=c.ball?.gravity??c.physics?.gravity??12;
  if(ball?.flight&&ball.flight.duration>0){const f=ball.flight,u=clamp(finite(f.age)/f.duration,0,1);return u<=.5?r+f.height:r+4*f.height*u*(1-u);}
  const vy=finite(ball?.vy);return finite(ball?.y)+(vy>0?vy*vy/(2*g):0);
}
/** The ball `t` seconds from now on the same model the engine plays (soccer-v23 aerialMeet): a lofted flight on its parabola, otherwise the
 * free ballistic arc. Null once a flight has landed. */
function ballAt(ball,t,g,r){
  if(ball.flight&&ball.flight.duration>0){
    const f=ball.flight,u=clamp((finite(f.age)+t)/f.duration,0,1);if(u>=1&&t>0)return null;
    return {x:f.fromX+(f.x-f.fromX)*u,z:f.fromZ+(f.z-f.fromZ)*u,y:r+4*f.height*u*(1-u),falling:u>=.5};
  }
  const vy=finite(ball.vy)-g*t,y=finite(ball.y)+finite(ball.vy)*t-.5*g*t*t;
  if(y<r&&t>0)return null;
  return {x:ball.x+finite(ball.vx)*t,z:ball.z+finite(ball.vz)*t,y,falling:vy<=0};
}
/** Contact window of one action: the ball is inside its height band and within its reach (header: the engine's canHead). */
export function soccerAirContact(kind,player,ball,A=SOCCER_AIR_V241){
  const w=A[kind];if(!w||kind==='header'||!player||!ball||ball.owner!=null)return false;
  return ball.y>=w.min&&ball.y<=w.max&&Math.hypot(ball.x-player.x,ball.z-player.z)<=w.reach;
}
/** Where the armed action meets the ball (the assisted run while the stick is idle): the first point of its height band he can reach. */
export function soccerAirMeet(kind,player,ball,c,{horizon=SOCCER_AIR_V241.armSeconds,speed=5.3,header=null}={}){
  const w=kind==='header'?header||{min:c.aerial?.minHeight??1,max:c.aerial?.maxHeight??2.4,reach:c.aerial?.reach??1.5}:SOCCER_AIR_V241[kind];if(!w||!player||!ball||ball.owner!=null)return null;
  const g=c.ball?.gravity??c.physics?.gravity??12,r=c.physics?.ballRadius??.11,step=1/30;
  for(let t=step;t<=horizon+1e-9;t+=step){
    const q=ballAt(ball,t,g,r);if(!q)break;
    if(q.y<w.min||q.y>w.max)continue;
    const gap=Math.hypot(q.x-player.x,q.z-player.z);
    if(gap<=Math.min(kind==='scissor'?SOCCER_AIR_V241.scissorCap:3.2,w.reach+speed*t))return {t:round(t),x:round(q.x),z:round(q.z),y:round(q.y)};
  }
  return null;
}
/** Shot of a volley or scissor kick: straight at goal (between the posts, away from the keeper's side like a header), the stick nudging it to
 * one side. Returns the unit aim {x, z}. */
export function soccerAirAim(player,ball,attackDir,team,pitch,{stick=null,keeper=null}={}){
  const d=attackDir*(team===0?1:-1),hx=pitch.length/2,half=pitch.goalWidth/2;
  let tz=keeper?clamp(-Math.sign(keeper.z||ball.z||1)*half*.55,-half*.7,half*.7):clamp(-ball.z*.35,-half*.6,half*.6);
  if(stick&&Math.hypot(stick.x,stick.z)>.3)tz=clamp(tz+Math.sign(stick.z)*half*.4,-half*.75,half*.75);
  const x=d*hx-ball.x,z=tz-ball.z,l=Math.hypot(x,z)||1;return {x:x/l,z:z/l};
}
/** Which foot meets a volley: the ball's side of the body (anatomical right = (-fz, fx) rotated: the right foot when the ball is on the right). */
export function soccerVolleyFoot(player,ball){
  const rx=finite(player.fz),rz=-finite(player.fx),side=(ball.x-player.x)*rx+(ball.z-player.z)*rz;
  return side>=0?'right':'left';
}

// ---- 2. fouls on standing tackles and the carrier's reaction -------------------------------------------------------------------------
/** A standing tackle can go through the man. The child's tackle from behind (the approach the duel already treats as harder, soccer-physics
 * stealApproach) is a foul with `lostChance` when he misses the ball and `wonChance` when he gets it; from the front or the side his tackle is
 * never a foul. A rival who takes the ball from the child's carrier fouls with `aiChance` from behind and `aiFrontChance` otherwise (measured
 * in 6 simulated 11 v 11 matches: the rival never fouled the child at all in v24, slides included, while the child was whistled 1.5 times a
 * match). The roll is the caller's deterministic one. */
export const SOCCER_FOULS_V241=Object.freeze({lostChance:.45,wonChance:.12,aiChance:.35,aiFrontChance:.14,
  /** the fouled carrier falls and gets up (Codex fall_foul 1.2 s + getup_foul 0.8 s, played at `fallRate`); a clean tackle makes him stumble */
  fallSeconds:2,fallRate:1.25,stumbleSeconds:.5});
export function soccerStandingFoul({behind,won,ai=false,roll=0,owner}={},F=SOCCER_FOULS_V241){
  if(!owner||owner.hands||owner.role==='keeper')return null;
  const chance=ai?(behind?F.aiChance:F.aiFrontChance):behind?(won?F.wonChance:F.lostChance):0;
  return finite(roll)<chance?{kind:'steal',behind:!!behind,late:false}:null;
}
/** Seconds the fouled carrier stays down in the simulation (the fall and the get-up at fallRate). */
export const soccerFouledSeconds=(F=SOCCER_FOULS_V241)=>round(F.fallSeconds/F.fallRate);
/** The same deterministic roll the slide fouls use (tick, player, seed): the shared RNG sequence is never touched. */
export function soccerFoulRoll(tick,id,seed,salt=0){return ((Math.imul((tick*197+id+salt*7919)^seed,2654435761)>>>0)%10000)/10000;}

// ---- 2b. the rival's level (Roy after v24: "רמת המשחק צריכה לעלות / הסידור של המשחק והרמה של הקבוצה צריכה לעלות") --------------------
/** Measured in the headless 11 v 11 (tools/soccer-gameplay-sim.mjs, human bot, stages 2/4/5): the rival kept the ball 3.1-3.7 s a spell with
 * 0.9-1.5 passes, shot 0.25-1.25 times a match, and 72% of its spells ended in the child's standing tackle (tools/soccer-v241-sim.mjs
 * spells): its carrier ran straight into the press and passed only when nobody was near. From `fromStage` the rival carrier now swerves away
 * from a presser inside `evadeRange` and, pressed inside `escapeRange`, lays the ball off to a free team-mate (clear by `mateClearance`, a
 * lane `laneClearance` wide) at `escapeRate` per second; both grow with the stage up to `maxStage`. The pass budget per spell is
 * `buildPasses` (v24: 3) and the shooting corridor `shotCorridor` goals wide (v24 full: 1.7). Stage 1 (the first match) is unchanged. */
export const SOCCER_LEVEL_V241=Object.freeze({fromStage:2,maxStage:7,evadeRange:3.4,evade:Object.freeze([.55,1]),evadeForward:4,escapeRange:2.8,escapeHold:.25,escapeRate:Object.freeze([1.6,5.5]),mateClearance:1.1,laneClearance:.35,maxBack:8,forwardWeight:.12,shootRange:Object.freeze([20,24]),buildPasses:6,shotCorridor:2.2});
export const soccerLevelV241Enabled=(option,search)=>engineRule(option,'soccerLevel','v24',search);
/** The stage's values (null below fromStage): linear from the first to the second number of each pair between fromStage and maxStage. */
export function soccerLevelV241(stage,L=SOCCER_LEVEL_V241){
  if(!(stage>=L.fromStage))return null;
  const u=clamp((stage-L.fromStage)/Math.max(1,L.maxStage-L.fromStage),0,1),mix=([a,b])=>round(a+(b-a)*u);
  return {evadeRange:L.evadeRange,evade:mix(L.evade),evadeForward:L.evadeForward,escapeRange:L.escapeRange,escapeHold:L.escapeHold,escapeRate:mix(L.escapeRate),mateClearance:L.mateClearance,laneClearance:L.laneClearance,maxBack:L.maxBack,forwardWeight:L.forwardWeight,shootRange:mix(L.shootRange)};
}

// ---- 3. slide recovery ----------------------------------------------------------------------------------------------------------------
/** Full match: v24 added 0.5 s to every slide's get-up so the old fall-and-rise clip would not pop (soccer-full slideRecoverExtra). With the
 * Codex slide + quick get-up (1.6 s of clip, contact at 0.5) the get-up needs only `extra` (0.8 s recovery for a won slide, 0.25 s sooner on
 * its feet than v24's 1.1 s; a lost one 0.96 s instead of 1.32 s). */
export const SOCCER_SLIDE_V241=Object.freeze({extra:.2});

// ---- 4. clips (Codex packs, assets/soccer-v241/clips/*.json, tools/soccer-v241-clips.mjs) ---------------------------------------------
export const SOCCER_V241_PREFIX='v241_';
/** The runtime files (every one carries only the clips the game plays). */
export const SOCCER_V241_CLIP_FILES=Object.freeze({tackle:'clips/tackle.json',aerial:'clips/aerial.json',kicks:'clips/kicks.json',loco:'clips/loco.json'});
/** Slide: Codex slide_tackle (contact 0.5, on the side 0.8) + getup_fast (0.6 s) joined at their matching pose: one 1.6 s timeline. */
export const SOCCER_V241_SLIDE=Object.freeze({clip:'v241_slide',contact:.5,end:1.6,lead:.06});
/** Time on the slide timeline: the slide clock runs to the contact, the recovery clock the rest (fall, side, quick get-up). */
export function soccerV241SlideTime(phase,progress,S=SOCCER_V241_SLIDE){
  const u=clamp(Number.isFinite(progress)?progress:0,0,1);
  return phase==='slide'?S.contact*u:S.contact+(S.end-S.contact)*u;
}
/** The fouled carrier: fall_foul (1.2 s) + getup_foul (0.8 s); a clean tackle: stumble_light (0.5 s, he keeps moving). */
export const SOCCER_V241_FALL=Object.freeze({clip:'v241_fall_foul',end:2}),SOCCER_V241_STUMBLE=Object.freeze({clip:'v241_stumble',end:.5,follow:.32});
/** Keeper dives (dive + getup_keeper joined): the row from the ball's height when the dive starts, the side as the engine dives. */
export const SOCCER_V241_DIVE_ROWS=Object.freeze({low:.5,high:1.4});
export function soccerV241DiveClip(left,ballHeight,has){
  const row=ballHeight<SOCCER_V241_DIVE_ROWS.low?'low':ballHeight>SOCCER_V241_DIVE_ROWS.high?'high':'mid',name=`${SOCCER_V241_PREFIX}keeper_dive_${row}_${left?'left':'right'}`;
  return has(name)?name:null;
}
/** Volley (right / left foot) and the backward scissor (with its landing on the back and the get-up). `lead` = seconds entered before the
 * authored contact (the simulation has just struck), `follow` = the part after the contact a player who sets off again keeps. */
export const SOCCER_V241_AIR_CLIPS=Object.freeze({
  volley:Object.freeze({right:'v241_volley_right',left:'v241_volley_left',lead:.14,follow:.38,rate:1.15}),
  scissor:Object.freeze({clip:'v241_scissor',lead:.22,rate:1.2}),
});
/** Kicks and passes (Codex soccer-kicks-v2): the clip for the simulation's event, read from the state at the strike (presentation only).
 * Shots: a hard one (power >= powerShot) lands on the kicking foot, a shot on the run keeps running; otherwise the angle to goal picks the
 * finish (a bending one from the side, a placed one in front of goal, a chip over a keeper off his line) and every fifth shot by a player is
 * struck with the weaker foot. Passes: a through ball, a long pass, a short side-foot pass; a loft from the wing is a cross. Null keeps the
 * v8/v9 choice (a punt, a clip that is not loaded, another event). */
export const SOCCER_V241_KICK=Object.freeze({powerShot:.72,runningSpeed:3.4,wideShare:.22,placedDistance:16,chipKeeperOut:5.5,longPass:18,wingShare:.28,lead:.05,follow:.34,rate:1.2});
export function soccerV241KickClip({event:e,player:p,ball,attackDir=1,pitch,speed=0,keeper=null},has){
  if(!e||!p||e.player!==p.id||!pitch)return null;
  const pick=id=>has(SOCCER_V241_PREFIX+id)?SOCCER_V241_PREFIX+id:null,K=SOCCER_V241_KICK,d=attackDir*(p.team===0?1:-1),hx=pitch.length/2;
  if(e.type==='shot'){
    if(e.punt)return null;
    const power=finite(e.power);
    if(power>=K.powerShot)return pick('power_landing');
    if(speed>=K.runningSpeed)return pick('running_kick');
    if(((finite(e.id)+p.id)%5)===4)return pick('weak_foot');
    const ahead=hx-finite(ball?.x)*d,wide=Math.abs(finite(ball?.z))>pitch.width*K.wideShare;
    if(keeper&&Math.abs(keeper.x*d-hx)>K.chipKeeperOut&&ahead<26)return pick('chip');
    if(wide)return pick((finite(ball?.z)*d>0)===(p.id%2===0)?'inside_curve':'outside_kick');
    return pick(ahead<K.placedDistance?'placed_kick':'inside_curve');
  }
  if(e.type==='loft')return pick(Math.abs(finite(ball?.z))>pitch.width*K.wingShare&&finite(e.x)*d>hx-(pitch.penaltyDepth||16.5)*1.4?'wing_cross':'lift_pass');
  if(e.type==='pass'){
    if(e.kind==='through')return pick('through_pass');
    return pick(finite(e.distance)>=K.longPass?'long_pass':'short_inside_pass');
  }
  return null;
}
/** Locomotion-v2 (Codex, QA 99.9-100 for the idles, 91.8 the walk): the arms hang 5-6 cm outside the shoulder line and open 4.7-7 degrees,
 * where the shipped v10 idles open 12-14 degrees (hands 9.5-10 cm out) and the v9 walk 15 degrees (athletes-core gaitMetrics, measured).
 * The walk replaces the ladder's first rung at the same 1 m/s and foot phase (left strike at 0, right at half the cycle). Its jog, run and
 * sprint are not used: cycles of 1.65 / 2.2 / 3.2 m/s where the game runs 2.6 / 4.5 / 7.2 m/s (the legs would race or the feet skate). */
export const SOCCER_V241_IDLES=Object.freeze(['v241_idle_relaxed','v241_idle_scan','v241_idle_weight_shift']),SOCCER_V241_WALK='v241_walk';
/** One-shot clips the state machine plays through their contact; a player who sets off again leaves them `follow` after it. */
export const soccerV241Held=state=>typeof state==='string'&&state.startsWith(SOCCER_V241_PREFIX)&&!state.startsWith(SOCCER_V241_PREFIX+'keeper_dive')&&state!==SOCCER_V241_SLIDE.clip&&state!==SOCCER_V241_FALL.clip&&!SOCCER_V241_IDLES.includes(state)&&state!==SOCCER_V241_WALK;
/** Validate and prefix one runtime file (schema 1, states with keyframes, the 18 canonical bones). */
export function soccerV241ClipStates(json,expected=[]){
  if(!json||json.schemaVersion!==1||!json.states)throw Error('Soccer v24.1 clips: unexpected file');
  for(const id of expected)if(!json.states[id]?.keyframes?.length)throw Error('Soccer v24.1 clips: missing '+id);
  return Object.fromEntries(Object.entries(json.states).map(([name,state])=>[SOCCER_V241_PREFIX+name,{...state,clip:SOCCER_V241_PREFIX+name}]));
}
export const SOCCER_V241_EXPECTED=Object.freeze({
  tackle:Object.freeze(['slide','stumble','fall_foul','keeper_dive_low_left','keeper_dive_low_right','keeper_dive_mid_left','keeper_dive_mid_right','keeper_dive_high_left','keeper_dive_high_right']),
  aerial:Object.freeze(['volley_right','volley_left','scissor']),
  kicks:Object.freeze(['power_landing','inside_curve','outside_kick','placed_kick','weak_foot','chip','running_kick','short_inside_pass','long_pass','through_pass','lift_pass','wing_cross']),
  loco:Object.freeze(['idle_relaxed','idle_weight_shift','idle_scan','walk']),
});

// ---- 4b. the referee (Codex soccer-referee-v1, QA 93.7-100: idle, jog, whistle, point_penalty, advantage, yellow_card, goal_signal) ------
/** `?soccerReferee=0` = no referee on the pitch (v24). Full match only. The referee keeps the diagonal: `behind` metres behind the ball
 * (the attack's way), `far` metres on the far side from the broadcast camera so he never stands between the camera and play, inside the
 * pitch by `inset`; he jogs at most `maxSpeed` (the pack's jog is authored at `jogSpeed`; played up to `maxRate` times) and stops for a call.
 * A call: a foul = the whistle (a late or rear slide = the yellow card), a penalty = he points to the spot, an advantage = both arms
 * forward, a goal = the goal signal; each held `hold` seconds facing where it happened. */
export const soccerRefereeEnabled=search=>view('soccerReferee',search);
export const SOCCER_REFEREE=Object.freeze({height:1.8,behind:9,far:12,inset:2.5,maxSpeed:2.6,accel:3.5,jogSpeed:1,maxRate:2.6,arrive:1.2,fade:.25,
  hold:Object.freeze({whistle:2.2,yellow_card:3.4,point_penalty:2.8,advantage:2.4,goal_signal:2.8})});
export const soccerRefereeUrl=()=>soccerV241Url('referee/referee.glb');
/** Where the referee wants to be: behind the ball and on the far side of play from the camera (camera z = ball z + attackDir * distance). */
export function soccerRefereeTarget(ball,attackDir,pitch,R=SOCCER_REFEREE){
  const hx=pitch.length/2-R.inset,hz=pitch.width/2-R.inset,lead=Math.sign(finite(ball.vx))||attackDir||1;
  return {x:clamp(finite(ball.x)-lead*R.behind,-hx,hx),z:clamp(finite(ball.z)-(attackDir||1)*R.far,-hz,hz)};
}
/** One step of the referee toward `target`: capped acceleration and speed, no move while a call is held. Returns the new {x, z, vx, vz}. */
export function soccerRefereeStep(ref,target,dt,{hold=false}={},R=SOCCER_REFEREE){
  if(!(dt>0))return {...ref};
  const dx=target.x-ref.x,dz=target.z-ref.z,dist=Math.hypot(dx,dz),want=hold||dist<R.arrive?0:Math.min(R.maxSpeed,dist*1.2);
  const wx=dist>1e-6?dx/dist*want:0,wz=dist>1e-6?dz/dist*want:0,ax=wx-ref.vx,az=wz-ref.vz,a=Math.hypot(ax,az),cap=R.accel*dt,k=a>cap?cap/a:1;
  const vx=ref.vx+ax*k,vz=ref.vz+az*k;return {x:ref.x+vx*dt,z:ref.z+vz*dt,vx,vz};
}
/** The gesture for a match event (null: none). */
export function soccerRefereeCall(event){
  if(!event)return null;
  if(event.type==='foul')return event.penalty?'point_penalty':event.kind==='slide'&&(event.late||event.behind)?'yellow_card':'whistle';
  if(event.type==='advantage')return 'advantage';
  if(event.type==='goal')return 'goal_signal';
  return null;
}

// ---- 5. whistles (Codex soccer-whistle-crowd-v1) -------------------------------------------------------------------------------------
/** The referee's whistle for each call. The files are -23 LUFS like the shipped soccer bank; played at the shipped whistle's gain. A standing
 * tackle foul gets the short blast, a slide foul or a penalty the sharp one; half and full time two and three blasts. */
export const SOCCER_WHISTLE_V1=Object.freeze({
  'v241/whistle-kickoff':Object.freeze({file:'whistle-kickoff.ogg',seconds:1.2}),
  'v241/whistle-foul':Object.freeze({file:'whistle-foul.ogg',seconds:1.35}),
  'v241/whistle-short':Object.freeze({file:'whistle-short.ogg',seconds:.65}),
  'v241/whistle-halftime':Object.freeze({file:'whistle-halftime.ogg',seconds:1.95}),
  'v241/whistle-fulltime':Object.freeze({file:'whistle-fulltime.ogg',seconds:2.55}),
});
export function soccerWhistleCue(reason,detail={}){
  switch(reason){
    case 'kickoff':case 'play':case 'restart':case 'shootout':return 'v241/whistle-kickoff';
    case 'foul':return detail.kind==='steal'&&!detail.penalty?'v241/whistle-short':'v241/whistle-foul';
    case 'penalty':return 'v241/whistle-foul';
    case 'halftime':return 'v241/whistle-halftime';
    case 'fulltime':return 'v241/whistle-fulltime';
    default:return null;
  }
}
