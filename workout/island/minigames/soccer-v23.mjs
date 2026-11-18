/** Soccer v23 (13/11/2026): Roy's phone test of v22. Every change has its own URL switch that brings back v22 exactly:
 *  `?soccerSwitch=v22`  player switch: the switch fires on the press (it fired on the release), a held stick survives a change of
 *                       control state (attack <-> defence used to drop it until the thumb was lifted), the newly selected player answers
 *                       the stick at once (a short burst of turn and acceleration) and his held one-shot clips give way to the run.
 *  `?soccerGlitch=v22`  animation flicker: hysteresis on the idle/move edge, a minimum dwell between locomotion clips, no turn clip from a
 *                       standstill (the keeper's ready/walk and the jog/turn/idle churn measured in the real-touch run).
 *  `?soccerPitch=v22`   markings and set pieces in real proportion (penalty area, goal area, penalty mark, arcs, centre circle and the
 *                       goal-kick spot drawn from the same numbers the simulation uses).
 *  `?soccerAir=v22`     high balls: a "הגבהה" (lob) button in attack, the header prompt when a high ball comes, a header press that is kept
 *                       until the ball arrives, aimed at goal in attack and away from goal in defence.
 *  `?soccerTapSound=v22` the shell's 580->740 Hz button chirp on every action-button press.
 * Pure: the URL is read only when a browser location exists. */
const read=(name,search=globalThis.location?.search)=>{try{return typeof search==='string'?new URLSearchParams(search).get(name):null;}catch{return null;}};
const version=(name,option,search)=>{const pick=v=>v==='v22'||v==='0'||v==='off'?'v22':v==='v23'||v==='1'?'v23':null;return pick(option)||pick(read(name,search))||'v23';};
export const soccerSwitchVersion=(option,search)=>version('soccerSwitch',option,search);
export const soccerGlitchVersion=(option,search)=>version('soccerGlitch',option,search);
export const soccerPitchVersion=(option,search)=>version('soccerPitch',option,search);
export const soccerAirVersion=(option,search)=>version('soccerAir',option,search);
export const soccerTapSoundVersion=(option,search)=>version('soccerTapSound',option,search);

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=n=>Math.round(n*1000)/1000;

// ---- 1. switch ------------------------------------------------------------------------------------------------------------------------
/** The first moments after a selection: the new player turns and accelerates like this, then the controlled-player motion takes over.
 * Measured (real-touch run, 844x390): a selected team-mate running across the stick needed 180-320 ms to point his velocity at it. */
export const SOCCER_SWITCH_SNAP=Object.freeze({seconds:.22,acceleration:38,deceleration:30,turnRate:40,turnDrive:.8});
/** Motion parameters for the controlled player `since` seconds after he was selected (null once the burst is over). */
export function switchSnapMotion(base,since,snap=SOCCER_SWITCH_SNAP){
  if(!(since>=0)||since>=snap.seconds)return null;
  return {...base,acceleration:Math.max(base.acceleration,snap.acceleration),deceleration:Math.max(base.deceleration,snap.deceleration),turnRate:Math.max(base.turnRate,snap.turnRate),turnDrive:Math.max(base.turnDrive??.4,snap.turnDrive)};
}

// ---- 2. animation flicker -------------------------------------------------------------------------------------------------------------
/** Hysteresis on "is he moving": a stopped player sets off above `start`, a moving one stops below `stop` (m/s). The single 0.2 m/s edge
 * flipped the keeper between ready and walk every 8-10 frames while he shuffled on his line. */
export const SOCCER_MOVE_EDGE=Object.freeze({start:.42,stop:.16});
export function movingWithHysteresis(speed,wasMoving,edge=SOCCER_MOVE_EDGE){return wasMoving?speed>edge.stop:speed>edge.start;}
/** A locomotion clip is kept at least this long before another locomotion clip replaces it (s); actions, slides, dives and headers are
 * never delayed by it. */
export const SOCCER_LOCOMOTION_DWELL=.18;
/** A turn clip only from a real run: from a walk or a standstill the next run step blends straight in (decelerate -> idle -> walk -> turn
 * -> jog inside 0.55 s was the "stutter" of a player setting off). */
export const SOCCER_TURN_MIN_SPEED=2.2;

/** One per character: the v23 locomotion gate (null with `?soccerGlitch=v22`). `update` runs every animation frame with the body speed. */
export function createLocomotionGate({enabled=soccerGlitchVersion()==='v23',edge=SOCCER_MOVE_EDGE,dwell=SOCCER_LOCOMOTION_DWELL}={}){
  if(!enabled)return null;
  let moving=false,since=99,slow=0,last=null;
  return {
    update(speed,dt){moving=movingWithHysteresis(speed,moving,edge);since+=Math.max(0,dt);slow=slow*Math.exp(-Math.max(0,dt)/.15)+(last===null?0:Math.max(0,last-speed));last=speed;return moving;},
    get moving(){return moving;},
    /** A real slow-down (about 1.2 m/s shed inside 0.15 s), not one frame 0.15 m/s slower (that fired the decelerate clip on every small step). */
    get decelerating(){return slow>1.2;},
    turnAllowed:speed=>speed>=SOCCER_TURN_MIN_SPEED,
    canChange:()=>since>=dwell,
    changed(){since=0;},
  };
}
/** The rendered body turns at most this fast (rad/s): 20 degrees a frame at 60 Hz. The 18/s exponential alone put 47 degrees into the first
 * frame of a reversal (16 yaw snaps a minute over 30 degrees, measured). Slides and dives keep their own, faster, lock. */
export const SOCCER_YAW_MAX_RATE=20*Math.PI/180*60;
export function capYawStep(step,dt,rate=SOCCER_YAW_MAX_RATE){const max=rate*Math.max(0,dt);return step>max?max:step<-max?-max:step;}
/** v10 180-degree cuts whip an arm 30-33 degrees in one frame (6.6 pops a minute in the real-touch run): play the 135-degree cut instead. */
export function softenCut(name,has){return typeof name==='string'&&name.includes('_cut_180_')&&has(name.replace('_cut_180_','_cut_135_'))?name.replace('_cut_180_','_cut_135_'):name;}
/** How long a held one-shot clip (a cut, a first touch, the brake) keeps a moving player before the run takes over: the selected player
 * gives it up once its authored contact has passed, so a fresh selection is never stuck in another clip (v22: 0.7 s, 0.2 s for the brake). */
export function heldClipRelease(state,controlled){
  if(!controlled)return state==='v9_run_brake'?.2:.7;
  if(state==='v9_run_brake')return .06;
  if(typeof state==='string'&&state.startsWith('v10_first_touch_'))return .45;
  return .22;
}

/** Control feel (the same `?soccerGlitch=v22` switch): the mobile football games checked (FIFA Mobile, Dream League Soccer) keep the player at
 * full pace while a shot or pass is charged and answer the stick crisply; v22 halved the speed for every held kick or pass button (a lob is a
 * 0.32 s hold) and the selected player stopped and turned a little softly. */
export const SOCCER_CONTROL_V23=Object.freeze({chargeSpeedMultiplier:.85,controlled:{acceleration:26,deceleration:22,turnRate:22}});
export function applySoccerControlV23(config,option){
  if(soccerGlitchVersion(option)!=='v23'||config.controlV23)return config;
  return {...config,controlV23:true,chargeSpeedMultiplier:Math.max(config.chargeSpeedMultiplier??.5,SOCCER_CONTROL_V23.chargeSpeedMultiplier),
    players:{...config.players,controlled:{...config.players.controlled,...Object.fromEntries(Object.entries(SOCCER_CONTROL_V23.controlled).map(([k,v])=>[k,Math.max(config.players.controlled?.[k]??0,v)]))}}};
}

// ---- 3/4. pitch markings and set pieces -------------------------------------------------------------------------------------------------
/** Real markings, scaled to the match's pitch the way federations scale them for smaller formats (FFF football a 8: pitch 60-70 x 45-50 m,
 * area 26 x 13 m, mark 9 m, goal 6 x 2.10 m; FA 9v9: pitch 73 x 46 m, area 29 x 12 m, goal area 13 x 4 m, mark 8 m, arc and centre circle
 * 6 m). Lengths along the pitch follow its length, widths its width, from the full-size 105 x 68 m Laws of the Game numbers. The goal is
 * the real 7.32 x 2.44 m relative to the 1.8 m players, at most 17% of the pitch width; the area is never narrower than 3.4 goals. */
export const SOCCER_FULL_PITCH=Object.freeze({length:105,width:68,penaltyDepth:16.5,penaltyWidth:40.32,goalAreaDepth:5.5,goalAreaWidth:18.32,penaltySpot:11,arcRadius:9.15,centreRadius:9.15,cornerRadius:1,goalWidth:7.32,goalHeight:2.44});
export function soccerPitchV23(pitch){
  const F=SOCCER_FULL_PITCH,kl=pitch.length/F.length,kw=pitch.width/F.width,k=Math.sqrt(kl*kw);
  const goalWidth=round(Math.min(F.goalWidth,pitch.width*.175)),goalHeight=F.goalHeight;
  const penaltyWidth=round(Math.max(F.penaltyWidth*kw,goalWidth*3.4)),goalAreaWidth=round(Math.max(F.goalAreaWidth*kw,goalWidth+2*1.5));
  return {...pitch,goalWidth,goalHeight,penaltyDepth:round(F.penaltyDepth*kl),penaltyWidth,penaltySpot:round(F.penaltySpot*kl),goalAreaDepth:round(F.goalAreaDepth*kl),goalAreaWidth,
    arcRadius:round(F.arcRadius*k),centreRadius:round(F.centreRadius*k),cornerRadius:round(Math.max(.6,F.cornerRadius*k)),v23:true,
    // The AI's positions, runs, crosses and the keeper's sweep stay on the tuned numbers (pitch.play): with the real area the stage-8 rival
    // scored 7.5 goals a match instead of 3.2 (40 simulated matches; the area, not the goal, did it). Rules, restarts and lines use the real ones.
    play:pitch.play||{penaltyDepth:pitch.penaltyDepth,penaltyWidth:pitch.penaltyWidth,penaltySpot:pitch.penaltySpot,goalWidth:pitch.goalWidth}};
}
/** Apply the v23 markings to a (squad-expanded) soccer config. The camera, AI and rules read config.pitch, so this is the one place. */
export function applySoccerPitchV23(config,option){
  if(soccerPitchVersion(option)!=='v23'||config.pitch?.v23)return config;
  // The real goal is wider than the tuned one: the keeper's reach grows with it, so the save rate stays what the stages were tuned on.
  const pitch=soccerPitchV23(config.pitch),grow=pitch.goalWidth/config.pitch.goalWidth,ai=config.ai||{};
  return {...config,pitch,ai:{...ai,keeperBaseReach:round((ai.keeperBaseReach??1)*grow),keeperReachScale:round((ai.keeperReachScale??0)*grow)}};
}
/** Where a goal kick is placed: on the goal-area line, a step in from its corner (Law 16: anywhere in the goal area; the corner itself put the
 * ball outside the area the game drew). */
export function goalKickSpot(side,zSide,pitch){
  const hx=pitch.length/2,inset=Math.min(.9,pitch.goalAreaWidth*.08);
  return {x:side*(hx-pitch.goalAreaDepth+.45),z:zSide*(pitch.goalAreaWidth/2-inset)};
}
/** Pitch-line geometry the view draws (centre x, z, size along x, size along z) for one end `d` (+1/-1), from the config the simulation uses. */
export function soccerMarkingRects(pitch,d,lineWidth=.12){
  const hx=pitch.length/2,lw=lineWidth,rects=[];
  for(const [depth,width] of [[pitch.penaltyDepth,pitch.penaltyWidth],[pitch.goalAreaDepth,pitch.goalAreaWidth]]){
    rects.push({x:d*(hx-depth),z:0,sx:lw,sz:width},{x:d*(hx-depth/2),z:-width/2,sx:depth,sz:lw},{x:d*(hx-depth/2),z:width/2,sx:depth,sz:lw});
  }
  return rects;
}
/** The penalty arc ("D"): the part of the circle of `arcRadius` around the mark that lies outside the area, as [start, length] angles. */
export function penaltyArcAngles(pitch){
  const r=pitch.arcRadius||9.15*pitch.length/105,outside=pitch.penaltyDepth-pitch.penaltySpot;
  if(!(r>outside))return null;const half=Math.acos(clamp(outside/r,-1,1));return {radius:r,half};
}

// ---- 5. high balls --------------------------------------------------------------------------------------------------------------------
/** Lob button: the charge starts at the loft threshold (a tap is already a high ball), a hold adds range like the pass button. */
export const SOCCER_LOB=Object.freeze({minPower:.42,headerWindow:1.1,promptSeconds:1.1,promptReach:3.2,autoAfterSeconds:.35});
/** A high ball the controlled player can meet: the first time on the flight (or on the ballistic arc) the ball is at header height within
 * `reach` of where he can be by then. Returns {t, x, z, y} or null. Pure, for the header prompt and the assisted run. */
export function aerialMeet(player,ball,c,{horizon=SOCCER_LOB.promptSeconds,speed=5.3,reach=SOCCER_LOB.promptReach}={}){
  const a=c.aerial||{},minH=a.minHeight??1,maxH=a.maxHeight??2.4,g=c.ball?.gravity??c.physics?.gravity??12,step=1/30;
  for(let t=step;t<=horizon+1e-9;t+=step){
    let x,z,y;
    if(ball.flight&&ball.flight.duration>0){const f=ball.flight,u=clamp(((f.age||0)+t)/f.duration,0,1);x=f.fromX+(f.x-f.fromX)*u;z=f.fromZ+(f.z-f.fromZ)*u;y=(c.physics?.ballRadius??.11)+4*f.height*u*(1-u);if(u>=1&&y<minH)break;}
    else{x=ball.x+(ball.vx||0)*t;z=ball.z+(ball.vz||0)*t;y=(ball.y||0)+(ball.vy||0)*t-.5*g*t*t;if(y<minH&&(ball.vy||0)-g*t<0)break;}
    if(y<minH||y>maxH)continue;
    const gap=Math.hypot(x-player.x,z-player.z);
    if(gap<=Math.min(reach,(a.reach??1.5)+speed*t))return {t:round(t),x:round(x),z:round(z),y:round(y)};
  }
  return null;
}
/** Header direction: at goal (between the posts, a little away from the keeper's side) in attack; in defence away from the own goal and wide. */
export function headerAim(player,ball,attackDir,team,pitch,{defending=false,stick=null}={}){
  const d=attackDir*(team===0?1:-1),hx=pitch.length/2;
  if(defending){const wide=Math.sign(ball.z||player.z||1);const x=d*8,z=wide*6;const l=Math.hypot(x,z)||1;return {x:x/l,z:z/l,manual:false,clear:true};}
  let tz=clamp(-ball.z*.35,-pitch.goalWidth*.3,pitch.goalWidth*.3);
  if(stick&&Math.hypot(stick.x,stick.z)>.3)tz=clamp(tz+Math.sign(stick.z)*pitch.goalWidth*.22,-pitch.goalWidth*.38,pitch.goalWidth*.38);
  const x=d*hx-ball.x,z=tz-ball.z,l=Math.hypot(x,z)||1;return {x:x/l,z:z/l,manual:false,clear:false};
}

// ---- 6. tap sound ---------------------------------------------------------------------------------------------------------------------
/** The island shell plays its "button" chirp on every pointerdown on a button of the open game. Soccer's action buttons are pressed many
 * times a minute (steal, slide, pass, switch) and that rising 580->740 Hz sine read as a little whistle at every steal attempt. */
export const SOCCER_QUIET_BUTTON_SELECTOR='.soccer-controls button';
/** The shell asks before its chirp: a soccer action button stays quiet in v23 (the kick, pass and whistle samples are the feedback). */
export function soccerQuietButton(target,version=soccerTapSoundVersion()){return version==='v23'&&Boolean(target?.closest?.(SOCCER_QUIET_BUTTON_SELECTOR));}
