/** Soccer control latency, headless: the real gesture recognizer feeding the real
 * model on a 60 Hz frame clock (event -> rAF sample -> fixed step -> render copy).
 * Usage: node tools/ctrl-soccer-sim.mjs [out.json]
 * "frames" are counted from the frame whose sample first sees the event, so the
 * wait for that frame (0..1 frame, avg 0.5) is reported separately. */
import {readFile,writeFile} from 'node:fs/promises';
import {createSoccer} from '../minigames/soccer.mjs';
import {createSoccerGestureRecognizer,soccerDesignControlPlan} from '../minigames/soccer-design-controls.mjs';

const json=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const config=(await json('../data/config.json')).minigames.soccer,interaction=await json('../design/controls/interaction.json'),controls=await json('../design/controls/soccer.json');
const FRAME=1000/60,dt=1/60,round=(n,d=1)=>Math.round(n*10**d)/10**d;

function fixture({owner=true,ballX=null}={}){
  const game=createSoccer({config,stage:1,difficulty:'normal',seed:19,random:()=>0.5}),s=game.getState();
  game.clearInput();s.attackDir=1;s.controlled=0;s.switchCooldown=1e9;s.passTarget=null;s.mode='attack';
  for(const p of s.players)Object.assign(p,{x:p.team===0?-12:12,z:(p.id%3-1)*8,recover:p.id===0?0:1e9,cooldown:0,vx:0,vz:0,slideTime:0,hands:false,fx:p.team===0?1:-1,fz:0});
  Object.assign(s.players[0],{x:0,z:0});
  Object.assign(s.ball,owner?{owner:0,x:config.physics.dribbleOffset,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:100,lastTeam:0,lastPlayer:0,flight:null,shot:null,thrower:null}:{owner:null,x:ballX??6,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:0,lastTeam:1,lastPlayer:3,flight:null});
  return {game,s};
}
function rig(opts){
  const f=fixture(opts),{game,s}=f;let clock=0;
  const rec=createSoccerGestureRecognizer({thresholds:interaction.gesture_thresholds,feel:config.controls.stick||null,onCancel:()=>game.clearInput()});
  rec.setEnabled(true);rec.setState('attack',['stick','kick','pass','sprint','switch']);
  const stickRect={left:12,top:274,width:104,height:104,right:116,bottom:378},rect=(x,y,w,h)=>({left:x,top:y,width:w,height:h,right:x+w,bottom:y+h});
  const centre={x:stickRect.left+52,y:stickRect.top+52};
  const buttons={kick:rect(752,298,80,80),pass:rect(680,314,64,64),sprint:rect(752,226,80,64)};
  const sample=()=>rec.sample(1,clock,{kick:{x:1,z:0},pass:{x:1,z:0}});
  /** One display frame: sample, fixed step, presentation copy. */
  function frame(){const input=sample();game.update(dt,input);clock+=FRAME;const p=s.players[0],r=game.renderState().players[0];return {input,x:p.x,z:p.z,vx:p.vx,vz:p.vz,rx:r.x,rz:r.z,speed:Math.hypot(p.vx,p.vz)};}
  return {game,s,rec,frame,centre,buttons,get clock(){return clock;},stickRect};
}
const firstFrame=(frames,pred)=>{const i=frames.findIndex(pred);return i<0?null:i+1;};
const ms=n=>n===null?null:round(n*FRAME);

const out={measuredAt:'headless',frameMs:round(FRAME,2)};

// 1. Stick tilt -> motion. Full tilt right (+52 px) from the stick centre.
{
  const r=rig(),top=r.s.players[0].x,speedMax=config.players.speed+(r.s.players[0].speed-1)*config.players.speedPerRank;
  r.rec.beginStick(1,r.centre.x+52,r.centre.y,r.stickRect,r.clock);
  const frames=[];for(let i=0;i<30;i++)frames.push(r.frame());
  const vis=(f,d)=>Math.hypot(f.rx-top,f.rz)>d;
  out.tilt={
    sampledInputX:frames[0].input.moveX,
    speedByFrame:frames.slice(0,10).map(f=>round(f.speed,2)),
    steadySpeed:round(frames[29].speed,2),
    firstModelMotionFrames:firstFrame(frames,f=>Math.abs(f.x-top)>1e-6),
    firstRenderedMotionFrames:firstFrame(frames,f=>vis(f,1e-4)),
    renderedMoved2cmFrames:firstFrame(frames,f=>vis(f,.02)),
    renderedMoved5cmFrames:firstFrame(frames,f=>vis(f,.05)),
    reach63Frames:firstFrame(frames,f=>f.speed>=speedMax*.63),
    reach90Frames:firstFrame(frames,f=>f.speed>=speedMax*.9),
  };
  out.tilt.firstRenderedMotionMs=ms(out.tilt.firstRenderedMotionFrames);out.tilt.renderedMoved5cmMs=ms(out.tilt.renderedMoved5cmFrames);out.tilt.reach63Ms=ms(out.tilt.reach63Frames);out.tilt.reach90Ms=ms(out.tilt.reach90Frames);
  // Release at steady speed: frames to stop and the extra distance.
  const x0=frames[29].x;r.rec.end(1,r.centre.x+52,r.centre.y,r.clock);
  const stop=[];for(let i=0;i<40;i++)stop.push(r.frame());
  out.release={speedByFrame:stop.slice(0,10).map(f=>round(f.speed,2)),slideDistanceM:round(stop[39].x-x0,3),framesToBelow10pct:firstFrame(stop,f=>f.speed<speedMax*.1),framesToBelow5pct:firstFrame(stop,f=>f.speed<speedMax*.05)};
  out.release.below10Ms=ms(out.release.framesToBelow10pct);
}

// 2. Response curve: stick offset (px from centre) -> input magnitude and steady speed.
{
  const rows=[];
  for(const px of [2,4,5,6,8,10,13,16,20,26,32,39,46,52,60]){
    const r=rig();r.rec.beginStick(1,r.centre.x+px,r.centre.y,r.stickRect,r.clock);let last;for(let i=0;i<60;i++)last=r.frame();
    rows.push({px,input:round(Math.hypot(last.input.moveX,last.input.moveZ),3),speed:round(last.speed,2)});
  }
  out.curve=rows;
}

// 3. Direction reversal: full right, then full left (flick).
{
  const r=rig();r.rec.beginStick(1,r.centre.x+52,r.centre.y,r.stickRect,r.clock);for(let i=0;i<40;i++)r.frame();
  r.rec.move(1,r.centre.x-52,r.centre.y,r.clock,[]);const frames=[];for(let i=0;i<40;i++)frames.push(r.frame());
  out.reversal={framesToVxNegative:firstFrame(frames,f=>f.vx<0),framesToFullLeft:firstFrame(frames,f=>f.vx<-config.players.speed*.9),vxByFrame:frames.slice(0,12).map(f=>round(f.vx,2))};
  out.reversal.toNegativeMs=ms(out.reversal.framesToVxNegative);
}

// 4. Multi-touch: stick + sprint + kick together in one sample.
{
  const r=rig();
  const a=r.rec.beginStick(1,r.centre.x+40,r.centre.y,r.stickRect,r.clock),b=r.rec.begin('sprint',2,792,258,r.buttons.sprint,r.clock),c=r.rec.begin('kick',3,792,338,r.buttons.kick,r.clock);
  const f=r.frame();
  out.multiTouch={accepted:[a,b,c],sample:{moveX:round(f.input.moveX,2),sprintHeld:f.input.sprintHeld,kickHeld:f.input.kickHeld}};
  const frames=[f];for(let i=0;i<20;i++)frames.push(r.frame());
  out.multiTouch.sprintHeldAfter20=frames[20].input.sprintHeld;out.multiTouch.kickHeldAfter20=frames[20].input.kickHeld;
  out.multiTouch.charging=r.s.charging;
}

// 5. Kick and pass: press -> ball leaves (frames), tap and charged.
function kickRun(kind,holdFrames){
  const r=rig();const node=r.buttons[kind==='pass'?'pass':'kick'],name=kind==='pass'?'pass':'kick';
  r.rec.begin(name,9,node.left+40,node.top+40,node,r.clock);
  const frames=[];for(let i=0;i<holdFrames;i++)frames.push(r.frame());
  r.rec.end(9,node.left+40,node.top+40,r.clock);
  for(let i=0;i<20;i++)frames.push(r.frame());
  const left=frames.findIndex(()=>r.s.ball.owner===null&&Math.hypot(r.s.ball.vx,r.s.ball.vz)>1);
  const ev=r.game.drainEvents().find(e=>['shot','pass','loft'].includes(e.type));
  // The ball's first speed appears in the step after the release was sampled.
  let leave=null;{const q=rig();q.rec.begin(name,9,node.left+40,node.top+40,node,q.clock);for(let i=0;i<holdFrames;i++){q.frame();}q.rec.end(9,node.left+40,node.top+40,q.clock);for(let i=0;i<20;i++){q.frame();if(q.s.ball.owner===null&&Math.hypot(q.s.ball.vx,q.s.ball.vz)>1){leave=i+1;break;}}}
  return {holdFrames,releaseToBallFrames:leave,releaseToBallMs:ms(leave),pressToBallMs:leave===null?null:ms(holdFrames+leave),event:ev?.type||null,power:ev?.power!==undefined?round(ev.power,2):null};
}
out.kick={tap1:kickRun('shot',1),tap3:kickRun('shot',3),charged30:kickRun('shot',30)};
out.pass={tap1:kickRun('pass',1),tap3:kickRun('pass',3),charged30:kickRun('pass',30)};

// 6. Input buffer: press shoot while the ball is still travelling toward the player.
{
  const rows=[];
  for(const early of [0,3,6,9,12,15,18,24]){
    const r=rig({owner:false,ballX:0.9});r.s.ball.vx=-0;r.s.ball.grace=0;
    // Ball held out of reach, loose, arrives by teleport after `early` frames.
    const p=r.s.players[0];Object.assign(r.s.ball,{x:4,z:0,vx:0,vz:0,owner:null,lastTeam:1,lastPlayer:3,grace:0});
    const node=r.buttons.kick;r.rec.begin('kick',5,node.left+40,node.top+40,node,r.clock);let shot=null;
    for(let i=0;i<early+1;i++){r.frame();}
    // Ball arrives at the foot now; release right away (tap).
    Object.assign(r.s.ball,{x:p.x+.4,z:p.z,vx:0,vz:0});r.rec.end(5,node.left+40,node.top+40,r.clock);
    for(let i=0;i<20;i++){r.frame();if(r.game.drainEvents().some(e=>e.type==='shot')){shot=i+1;break;}}
    rows.push({pressedFramesBeforeBall:early,pressedMsBeforeBall:ms(early),shotFiredAfterBallFrames:shot});
  }
  out.buffer=rows;
}


// 6b. Tap while the player still owns the ball but is in kick cooldown (one-two return).
{
  const rows=[];
  for(const [name,node,kind] of [['kick',null,'shot'],['pass',null,'pass']])for(const cd of [.05,.1,.15,.25]){
    const r=rig();r.s.players[0].cooldown=cd;const b=r.buttons[name];
    r.rec.begin(name,5,b.left+40,b.top+40,b,r.clock);r.frame();r.rec.end(5,b.left+40,b.top+40,r.clock);
    let fired=null;for(let i=0;i<30;i++){r.frame();if(r.game.drainEvents().some(e=>e.type===kind||(kind==='pass'&&e.type==='loft'))){fired=i+1;break;}}
    rows.push({action:name,cooldownLeftMs:Math.round(cd*1000),firedAfterFrames:fired,firedAfterMs:ms(fired)});
  }
  out.cooldownTap=rows;
}

// 6c. Switching: manual press and automatic (loose ball, a team-mate clearly nearer).
{
  const setup=()=>{const r=rig({owner:false});const s=r.s;s.switchCooldown=0;s.mode='defense';
    Object.assign(s.ball,{owner:null,x:6,z:0,vx:0,vz:0,grace:100,lastTeam:1,lastPlayer:3});
    Object.assign(s.players[0],{x:-6,z:0,recover:0,cooldown:0});Object.assign(s.players[1],{x:5,z:1.5,recover:0,cooldown:0});return r;};
  {const r=setup(),b=r.buttons.sprint;let frames=null;
    const stick=r.rec.beginStick(1,r.centre.x+30,r.centre.y,r.stickRect,r.clock);void stick;
    for(let i=0;i<120;i++){r.frame();if(r.s.controlled!==0){frames=i+1;break;}}
    out.autoSwitch={framesWhileMoving:frames,ms:ms(frames),autoSwitchSeconds:config.autoSwitchSeconds,candidateNearerByM:round(Math.hypot(-6-6,0)-Math.hypot(5-6,1.5),1)};}
  {const r=setup(),sw=r.buttons.sprint;let frames=null;
    r.rec.begin('switch',4,700,340,{left:608,top:314,width:64,height:64,right:672,bottom:378},r.clock);r.frame();r.rec.end(4,640,346,r.clock);
    for(let i=0;i<30;i++){if(r.s.controlled!==0){frames=i+1;break;}r.frame();}
    out.manualSwitch={framesAfterPress:frames,ms:ms(frames)};}
}

// 7. Aim: manual swipe retains its direction after release; assist cone.
{
  const r=rig();const node=r.buttons.kick;r.rec.begin('kick',7,node.left+40,node.top+40,node,r.clock);
  r.rec.move(7,node.left+40+30,node.top+40-30,r.clock);const f1=r.frame();
  r.rec.end(7,node.left+70,node.top+10,r.clock);const f2=r.frame();
  out.aim={manualWhileHeld:f1.input.kickAim.manual,xz:[round(f1.input.kickAim.x,2),round(f1.input.kickAim.z,2)],afterReleaseManual:f2.input.kickAim.manual,afterReleaseXZ:[round(f2.input.kickAim.x,2),round(f2.input.kickAim.z,2)],assistDegrees:config.aimAssistDegrees,passConeDegrees:config.passConeDegrees};
}

// 8. Stick-only one-finger action transfer dwell (contract: 120 ms).
out.transferDwellMs=120;out.deadzone=interaction.gesture_thresholds.stick_dead_zone;out.accel={acceleration:config.players.acceleration,deceleration:config.players.deceleration,turnRate:config.players.turnRate,fixedStepMs:round(config.match.fixedStep*1000,2)};
out.sprintGate={on:interaction.gesture_thresholds.one_finger_sprint_on,off:interaction.gesture_thresholds.one_finger_sprint_off,holdMs:interaction.gesture_thresholds.one_finger_sprint_hold_ms};
const text=JSON.stringify(out,null,1);console.log(text);
if(process.argv[2])await writeFile(process.argv[2],text);
