// Soccer rules v1 (sports-deep-fable M3, 11/11/2026): fouls on slide tackles, the free kick and
// penalty that follow, the through ball and the rival's own slide tackle. Pure helpers: they read
// visible positions and the config and never change a player, the ball, the input or the RNG.
import {passLaneClearance,passInterceptionClearance} from './soccer-teamplay.mjs?v=island-v2-20261107-10';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>Number.isFinite(n)?n:0;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** 'v1' = fouls, free kicks, penalties, through balls, rival slides; 'off' = the match as it was.
 * Resolution order: explicit option, then the page's `?soccerRules=v1|0`, then 'v1'. */
export function resolveSoccerRules(option){
  const pick=value=>value==='v1'?'v1':value==='0'||value==='off'||value===false?'off':null;
  const search=globalThis.location?.search;
  const fromUrl=typeof search==='string'?pick(new URLSearchParams(search).get('soccerRules')):null;
  return pick(option)||fromUrl||'v1';
}

/** A slide that reaches the ball, loses the duel and stops inside rules.foul.reach of the carrier
 * went through the man: a foul. Late (after lateShare of the slide) or from behind it always is;
 * a fair front challenge is a foul only with rules.foul.frontChance (the caller's deterministic
 * `roll` in [0,1) decides). A won ball or a foot that never reached the ball is play on. */
export function slideFoul(contact,won,tackler,owner,c,roll=0){
  if(won||!contact||!owner||!tackler||owner.hands||owner.team===tackler.team)return null;
  const f=c.rules?.foul||{},reach=finite(f.reach)||1.3;
  if(Math.hypot(finite(contact.x)-owner.x,finite(contact.z)-owner.z)>reach)return null;
  if(!contact.late&&!contact.behind&&finite(roll)>=(Number.isFinite(f.frontChance)?f.frontChance:.6))return null;
  return {late:!!contact.late,behind:!!contact.behind};
}

/** Where play restarts after a foul: a penalty when the ball was inside the tackler's own area,
 * otherwise a free kick where the ball was (kept a step inside the lines so the layout fits). */
export function foulRestart(tackler,ball,state,c){
  const hx=c.pitch.length/2,hz=c.pitch.width/2,d=state.attackDir*(tackler.team===0?1:-1);
  const ownBox=ball.x*d>=-hx&&ball.x*d<=-hx+c.pitch.penaltyDepth&&Math.abs(ball.z)<=c.pitch.penaltyWidth/2;
  if(ownBox)return {type:'penalty',team:1-tackler.team,...penaltySpot(1-tackler.team,state,c)};
  return {type:'freeKick',team:1-tackler.team,x:clamp(ball.x,-hx+1,hx-1),z:clamp(ball.z,-hz+1,hz-1)};
}
export function penaltySpot(teamId,state,c){
  const d=state.attackDir*(teamId===0?1:-1);
  return {x:d*(c.pitch.length/2-c.pitch.penaltySpot),z:0};
}

/** Through ball: the receiver is already running at goal (forward speed above passing.throughSpeed, 3.5 m/s = a run; at 2 a 2 m/s jogger got
 * a ball led 1.5 m past the assisted lead and turned back for it)
 * and no defender stands within passing.throughLaneRadius of the ball's path or of his own run, so
 * the pass goes passing.throughLeadSeconds ahead of him instead of the ordinary lead. Null = normal pass. */
export function throughBallPoint(ball,mate,players,c,d){
  const t=c.passing,lead=finite(t.throughLeadSeconds),speed=finite(t.throughSpeed)||2,radius=finite(t.throughLaneRadius)||1.2;
  if(!(lead>0)||!mate||mate.role==='keeper')return null;
  const vx=finite(mate.vx),vz=finite(mate.vz);
  if(vx*d<speed)return null;
  const hx=c.pitch.length/2,hz=c.pitch.width/2,inset=1;
  // A runner brushing past the carrier is a normal pass: the receiver starts at least 3 m away.
  if(distance(mate,ball)<3)return null;
  // Never lead into the keeper's hands: the point stays short of the goal area line.
  const point={x:clamp(mate.x+vx*lead,-hx+inset,hx-inset),z:clamp(mate.z+vz*lead,-hz+inset,hz-inset)};
  if(point.x*d>hx-c.pitch.goalAreaDepth-.5)point.x=d*(hx-c.pitch.goalAreaDepth-.5);
  // The ball itself goes forward, a real pass length, not a nudge beside the carrier.
  if(distance(point,mate)<.8||(point.x-ball.x)*d<3||distance(point,ball)<4)return null;
  // The ball still rolls run/f metres past the point (throughBallSpeed): that stop must stay on the pitch.
  const f=Number.isFinite(c.ball?.grassFriction)?c.ball.grassFriction:c.physics.friction,run=Math.max(speed,Math.hypot(vx,vz)),range=distance(point,ball)||1,roll=run/Math.max(.05,f);
  const stop={x:point.x+(point.x-ball.x)/range*roll,z:point.z+(point.z-ball.z)/range*roll};
  if(Math.abs(stop.x)>hx-inset||Math.abs(stop.z)>hz-inset)return null;
  // Static lanes (ball path and the runner's path) plus the defenders' observed motion over the lead time.
  for(const o of players){
    if(o.team===mate.team||o.role==='keeper'||o.recover>0)continue;
    if(distance(o,point)<radius||passLaneClearance(o,ball,point)<radius||passLaneClearance(o,mate,point)<radius||passInterceptionClearance(o,ball,point,lead)<radius)return null;
  }
  return point;
}

/** Where a runner meets a through ball: the earliest point on the rolling ball's path he can reach
 * within three seconds; if the ball is still outrunning him, he chases its path (where it will be),
 * never back to the aimed point behind the ball. Reads the ball's observed velocity only. */
export function throughMeetPoint(p,b,c,speed){
  const f=Math.max(1e-6,Number.isFinite(c.ball?.grassFriction)?c.ball.grassFriction:c.physics.friction),reach=c.physics.pickupRadius*.6;
  const hx=c.pitch.length/2-c.rules.playerBoundary,hz=c.pitch.width/2-c.rules.playerBoundary,vx=finite(b.vx),vz=finite(b.vz),pace=Math.max(1,finite(speed))*.95;
  let x=b.x,z=b.z;
  for(let t=0;t<=3;t+=1/30){
    const travel=(1-Math.exp(-f*t))/f;x=clamp(b.x+vx*travel,-hx,hx);z=clamp(b.z+vz*travel,-hz,hz);
    if(Math.hypot(x-p.x,z-p.z)<=pace*t+reach)return {x,z,time:t};
  }
  return {x,z,time:3};
}

/** Weight of a through ball: at the lead point the ball still rolls at passing.throughArrivalRatio times
 * the runner's pace (his speed now, at least three quarters of a full run), so he runs onto a ball he can
 * catch a stride or two later instead of chasing one faster than him. With exponential grass friction f
 * the launch speed is distance*f + that arrival speed. */
export function throughBallSpeed(range,mate,c){
  const f=Number.isFinite(c.ball?.grassFriction)?c.ball.grassFriction:c.physics.friction,ratio=finite(c.passing.throughArrivalRatio)||1.15;
  const run=Math.max(finite(c.passing.throughSpeed)||2,Math.hypot(finite(mate?.vx),finite(mate?.vz)),.75*(finite(c.players?.speed)||5.3));
  return Math.max(0,finite(range))*f+run*ratio;
}

/** Rival slide tackle (stage >= ai.slide.fromStage): a defender chasing the child's carrier from
 * ai.slide.minDistance to maxDistance, roughly facing the ball, may slide. Returns the slide aim or
 * null; the caller decides with its own deterministic roll and ai.slide.rate per second. */
export function aiSlideAim(p,owner,ball,c,stage){
  // Only at a carrier who is running, and not in the first moments of a possession (a slide at a
  // standing carrier, at kickoff or on a first touch reads as random; the standing steal covers those).
  const a=c.ai?.slide;if(!a||!owner||owner.hands||owner.team===p.team||p.role==='keeper'||finite(owner.hold)<(a.minHoldSeconds??.5)||Math.hypot(finite(owner.vx),finite(owner.vz))<1.5)return null;
  if(stage<(a.fromStage??2)||p.slideCooldown>0||p.recover>0||p.slideTime>0||p.cooldown>0)return null;
  const range=distance(p,ball);if(range<(a.minDistance??1)||range>(a.maxDistance??2.1))return null;
  const dx=ball.x-p.x,dz=ball.z-p.z,len=Math.hypot(dx,dz)||1,speed=Math.hypot(finite(p.vx),finite(p.vz));
  // Only a moving defender slides, and only toward a ball in front of him.
  if(speed<1.5||(finite(p.fx)*dx+finite(p.fz)*dz)/len<.6)return null;
  return {x:dx/len,z:dz/len};
}
