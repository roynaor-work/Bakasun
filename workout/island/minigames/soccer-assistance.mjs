// Pure helpers for human control. Coordinates are metres in the pitch X/Z plane.
import {passLaneClearance,passInterceptionClearance} from './soccer-teamplay.mjs?v=island-v2-20261107-11';
// They never change a player, ball, input, save, RNG or wall clock.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const radians=degrees=>degrees*Math.PI/180;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const unit=(x,z,fallback={x:1,z:0})=>{const d=Math.hypot(x,z);return d>1e-8?{x:x/d,z:z/d}:fallback;};
const signedAngle=(a,b)=>Math.atan2(a.x*b.z-a.z*b.x,a.x*b.x+a.z*b.z);
const rotate=(v,a)=>({x:v.x*Math.cos(a)-v.z*Math.sin(a),z:v.x*Math.sin(a)+v.z*Math.cos(a)});
const setting=(c,section,key,fallback)=>finite(c?.assistance?.[section]?.[key],fallback);

/** Seconds a human ground pass takes. It grows gently with distance, so a short
 * pass is not a rocket and a long one still arrives before a defender can react.
 * Opponent passes keep passing.groundTravelSeconds (they never call this). */
export function groundPassSeconds(range,c){
  const base=setting(c,'passing','travelBaseSeconds',0),perMetre=setting(c,'passing','travelPerMetre',0);
  if(!(base>0))return finite(c.passing.groundTravelSeconds,0.55);
  return clamp(base+perMetre*Math.max(0,finite(range)),0.3,1.2);
}

/** Error of the kick itself, in radians: a small base wobble that grows with the
 * nearest defender's pressure and the kicker's running speed. `noise` is a
 * deterministic value in [-1,1] supplied by the caller (never Math.random). */
export function passExecutionError(state,c,noise=0){
  const p=state.players.find(player=>player.id===state.controlled);
  if(!p)return 0;
  const base=setting(c,'passing','baseErrorDegrees',0.4),extra=setting(c,'passing','pressureErrorDegrees',1.8);
  let near=Infinity;
  for(const o of state.players)if(o.team!==p.team&&o.role!=='keeper')near=Math.min(near,distance(o,p));
  const pressure=near===Infinity?0:1-clamp((near-1.2)/2.4,0,1);
  const top=Math.max(1,finite(c.players?.speed,5.3)),run=clamp(Math.hypot(finite(p.vx),finite(p.vz))/top,0,1);
  const load=clamp(pressure*0.6+run*0.4,0,1);
  return radians((base+extra*load)*clamp(finite(noise),-1,1));
}

/** Optional config.assistance overrides. A tap or short pass goes to the team-mate
 * the stick points at (nearest bearing inside the intent cone), to where they will be,
 * at whatever distance that is. Open lanes only break near-ties, so intent wins.
 * Manual drags and lofted balls always retain the requested direction. */
export function assistedPassDestination(state,c,power=0){
  const p=state.players.find(player=>player.id===state.controlled),b=state.ball;
  if(!p)throw Error('A controlled soccer player is required');
  const q=clamp(finite(power),0,1),passing=c.passing;
  const fallback=unit(finite(p.fx,1),finite(p.fz));
  const manual=!!(state.passAim?.manual||state.aim?.manual);
  const raw=state.passAim?.manual?state.passAim:state.aim;
  const aim=unit(finite(raw?.x),finite(raw?.z),fallback);
  const loft=q*passing.chargeSeconds>=passing.loftThresholdSeconds;
  const minRange=Math.max(0,passing.minDistance),maxRange=Math.max(minRange,passing.maxDistance);
  let range=minRange+(maxRange-minRange)*q,direction=aim,target=null,correction=0;
  const requestedRange=range;
  const cone=radians(clamp(setting(c,'passing','coneDegrees',38),0,80));
  const maxCorrection=radians(clamp(setting(c,'passing','maxCorrectionDegrees',38),0,cone*180/Math.PI));
  const maxAssistRange=clamp(setting(c,'passing','maxAssistDistance',20),0,maxRange);
  const minAssistRange=Math.max(0,setting(c,'passing','minAssistDistance',1.3));
  const receiverZone=Math.max(0,setting(c,'passing','receiverZone',0.85));
  const maxLead=Math.max(0,setting(c,'passing','maxLeadDistance',1.6));
  const laneWeight=Math.max(0,setting(c,'passing','laneWeight',0.35)),laneNeed=Math.max(0.1,setting(c,'passing','laneClearance',1.5));
  const blockerReach=Math.max(0,setting(c,'passing','mateInLane',1.1));
  const leadSeconds=Math.max(0,finite(passing.leadSeconds));
  const opponents=state.players.filter(o=>o.team!==p.team&&o.role!=='keeper'&&!(o.recover>0));
  const candidates=[];
  let best=Infinity;
  if(!manual&&!loft&&maxCorrection>0){
    for(const member of state.players){
      if(member.team!==p.team||member.id===p.id||member.recover>0)continue;
      const actualDistance=distance(member,b);
      if(actualDistance<minAssistRange||actualDistance>maxAssistRange)continue;
      const actual=unit(member.x-b.x,member.z-b.z);
      // Intent is judged on where the team-mate is, so a fast runner cannot pull
      // the choice into the cone from outside it.
      if(Math.abs(signedAngle(aim,actual))>cone+1e-10)continue;
      const lx=finite(member.vx)*leadSeconds,lz=finite(member.vz)*leadSeconds;
      const leadLength=Math.hypot(lx,lz),capScale=leadLength>maxLead?maxLead/leadLength:1;
      // Lead the runner as far as the cone allows; a close team-mate running across
      // would otherwise swing the point out of the cone and lose the pass.
      let x=member.x,z=member.z,d=actualDistance,angle=signedAngle(aim,actual);
      for(const fraction of [1,0.7,0.4,0.15]){
        const px=member.x+lx*capScale*fraction,pz=member.z+lz*capScale*fraction,pd=Math.hypot(px-b.x,pz-b.z),pa=signedAngle(aim,unit(px-b.x,pz-b.z));
        if(pd>=minAssistRange&&pd<=maxAssistRange&&Math.abs(pa)<=cone+1e-10){x=px;z=pz;d=pd;angle=pa;break;}
      }
      if(d<minAssistRange||d>maxAssistRange||Math.abs(angle)>cone+1e-10)continue;
      const turn=clamp(angle,-maxCorrection,maxCorrection),miss=d*Math.abs(Math.sin(angle-turn));
      if(miss>receiverZone)continue;
      const point={x,z},seconds=groundPassSeconds(d,c);
      let lane=Infinity,landing=Infinity;
      // The idle beginner helper (state.laneAware false) keeps the plain angular choice.
      if(state.laneAware!==false)for(const o of opponents){lane=Math.min(lane,passInterceptionClearance(o,b,point,seconds));landing=Math.min(landing,distance(o,point));}
      const laneCost=lane<laneNeed?(laneNeed-lane)/laneNeed:0,landingCost=landing<2?(2-landing)/2*0.5:0;
      const rangeCost=q>0?Math.abs(d-requestedRange)/Math.max(1,maxRange)*q*0.25:0;
      const intent=Math.abs(signedAngle(aim,actual));
      // Intent is the bearing to where the team-mate is, not to his predicted point.
      const score=intent/Math.max(cone,1e-6)+laneWeight*(laneCost+landingCost)+rangeCost+d*0.0005;
      candidates.push({member,x,z,d,angle,turn,score});
      if(score<best-1e-10||Math.abs(score-best)<=1e-10&&(target===null||member.id<target)){best=score;target=member.id;}
    }
    let chosen=candidates.find(entry=>entry.member.id===target);
    // A team-mate standing on the line would take the ball first: he is the receiver.
    if(chosen&&blockerReach>0){
      let nearer=null;
      for(const entry of candidates){
        if(entry===chosen||entry.member.role==='keeper'||entry.d>=chosen.d-0.5)continue;
        const lane=passLaneClearance(entry.member,b,{x:chosen.x,z:chosen.z});
        if(lane<=blockerReach&&(nearer===null||entry.d<nearer.d))nearer=entry;
      }
      if(nearer)chosen=nearer;
    }
    if(chosen){direction=rotate(aim,chosen.turn);range=chosen.d;target=chosen.member.id;correction=chosen.turn;}
    else target=null;
  }
  // Clip along the chosen ray, rather than clamping axes and changing aim.
  const hx=c.pitch.length/2,hz=c.pitch.width/2,inset=c.physics.ballRadius;
  const rayLimit=(value,delta,half)=>Math.abs(delta)<1e-10?Infinity:Math.max(0,((delta>0?half-inset:-half+inset)-value)/delta);
  range=Math.min(range,rayLimit(b.x,direction.x,hx),rayLimit(b.z,direction.z,hz));
  const x=b.x+direction.x*range,z=b.z+direction.z*range;
  if(target!==null&&distance(state.players.find(member=>member.id===target),{x,z})>receiverZone+maxLead){target=null;}
  const assisted=target!==null;
  if(manual||loft){
    // Identify a genuinely nearby landing receiver without steering the ray.
    // This permits receiver selection and run/header cues for a deliberate cross.
    const landingZone=clamp(setting(c,'passing','landingReceiverZone',1.8),0,2.2);
    let closest=Infinity;
    for(const member of state.players){
      if(member.team!==p.team||member.id===p.id||member.recover>0||distance(member,b)>maxRange)continue;
      let lx=finite(member.vx)*Math.max(0,finite(passing.leadSeconds)),lz=finite(member.vz)*Math.max(0,finite(passing.leadSeconds));
      const lead=Math.hypot(lx,lz),scale=lead>maxLead?maxLead/lead:1;
      const miss=Math.hypot(member.x+lx*scale-x,member.z+lz*scale-z);
      if(miss<=landingZone&&(miss<closest-1e-10||Math.abs(miss-closest)<=1e-10&&(target===null||member.id<target))){target=member.id;closest=miss;}
    }
  }
  return {x,z,distance:range,target,kind:loft?'loft':'ground',assisted,correctionRadians:correction};
}

/** Short prediction scores who can actually meet the moving ball. The candidate
 * never acquires possession here; normal local contact must still occur. */
/** Pointer-style switch (eFootball/EA reference): with the stick held, the nearest teammate inside a
 * cone around the stick direction. Returns null when the stick is neutral or nobody is in the cone. */
export function directionalSwitchTarget(state,{moveX=0,moveZ=0},{cone=.82,minStick=.45}={}){
  const len=Math.hypot(finite(moveX),finite(moveZ));if(len<minStick)return null;
  const current=state.players.find(p=>p.id===state.controlled);if(!current)return null;
  const ux=moveX/len,uz=moveZ/len;
  // Narrow cone first (about 35 degrees), then a wide one (about 70 degrees) before giving up.
  for(const limit of [cone,.34]){const id=pick(state,current,ux,uz,limit);if(id!==null)return id;}
  return null;
}
function pick(state,current,ux,uz,cone){
  let best=null,bestScore=Infinity;
  {for(const p of state.players){
    if(p.team!==current.team||p.id===current.id||p.role==='keeper'||finite(p.recover)>0||finite(p.slideTime)>0)continue;
    const dx=p.x-current.x,dz=p.z-current.z,d=Math.hypot(dx,dz);if(d<.5)continue;
    const dot=(dx*ux+dz*uz)/d;if(dot<cone)continue;
    // Closer along the stick wins; a sideways offset costs more than a few metres of range.
    const score=d*(1+(1-dot)*3);if(score<bestScore){bestScore=score;best=p;}
  }}
  return best?best.id:null;
}

export function selectControlledPlayer(state,c,{moveX=0,moveZ=0,manual=false,path=manual,directional=false}={}){
  if(manual&&directional){const id=directionalSwitchTarget(state,{moveX,moveZ});if(id!==null)return id;}
  const players=state.players,b=state.ball,current=players.find(p=>p.id===state.controlled),team=current?.team??0;
  const eligible=p=>p.team===team&&p.role!=='keeper'&&finite(p.recover)<=0&&finite(p.slideTime)<=0&&(!manual||p.id!==state.controlled);
  const owner=b.owner==null?null:players.find(p=>p.id===b.owner);
  if(!manual&&current&&(owner?.team===team||state.passTarget?.player===current.id||state.switchCooldown>0))return current.id;
  const horizon=clamp(setting(c,'selection','predictionSeconds',0.38),0,0.8);
  const lookahead=Math.min(.8,horizon*2),hx=c.pitch.length/2,hz=c.pitch.width/2;
  const projected={x:clamp(b.x+finite(b.vx)*horizon,-hx,hx),z:clamp(b.z+finite(b.vz)*horizon,-hz,hz)};
  const intentLength=Math.hypot(finite(moveX),finite(moveZ)),intent=unit(finite(moveX),finite(moveZ));
  const intentWeight=Math.max(0,setting(c,'selection','intentWeight',0.42));
  const minimumGain=Math.max(0,setting(c,'selection','minimumGainSeconds',0.16));
  const score=p=>{
    const speed=Math.max(1,finite(c.players.speed,5.3)+(finite(p.speed,1)-1)*finite(c.players.speedPerRank));
    let intercept=Infinity,meetingX=b.x,meetingZ=b.z;
    // Compare reachable meetings along the ball's path, rather than only the
    // distance to one future point. This keeps a nearby player on an incoming
    // ball and selects the runner ahead of an outgoing pass before it goes past.
    // Without `path` (an idle child) the single projected point is retained.
    if(!path){intercept=distance(p,projected)/speed;meetingX=projected.x;meetingZ=projected.z;}
    else for(let sample=0;sample<=6;sample++){
      const at=lookahead*sample/6,flight=b.flight;
      let x,z,y;
      if(flight&&flight.duration>0){
        const u=clamp((finite(flight.age)+at)/flight.duration,0,1);
        x=flight.fromX+(flight.x-flight.fromX)*u;z=flight.fromZ+(flight.z-flight.fromZ)*u;
        y=c.physics.ballRadius+4*flight.height*u*(1-u);
      }else{
        const drag=b.y<=c.rules.pickupHeight?finite(c.ball?.grassFriction):finite(c.ball?.airDrag);
        const travel=drag>1e-8?(1-Math.exp(-drag*at))/drag:at;
        x=b.x+finite(b.vx)*travel;z=b.z+finite(b.vz)*travel;
        y=Math.max(c.physics.ballRadius,finite(b.y)+finite(b.vy)*at-.5*finite(c.ball?.gravity,c.physics.gravity)*at*at);
      }
      x=clamp(x,-hx,hx);z=clamp(z,-hz,hz);
      const range=Math.hypot(x-p.x,z-p.z),arrival=Math.max(0,range-c.physics.pickupRadius)/speed;
      const heightDelay=y>c.aerial.maxHeight?.35:0;
      const meeting=at+Math.max(0,arrival-at)*3+heightDelay;
      if(meeting<intercept){intercept=meeting;meetingX=x;meetingZ=z;}
    }
    const toward=unit(meetingX-p.x,meetingZ-p.z);
    const momentum=(finite(p.vx)*toward.x+finite(p.vz)*toward.z)/speed;
    const direction=unit(p.x-(current?.x??b.x),p.z-(current?.z??b.z));
    const intentBias=intentLength>0.2?Math.max(0,intent.x*direction.x+intent.z*direction.z)*intentWeight:0;
    return intercept-Math.max(-0.2,Math.min(0.2,momentum*0.12))-intentBias;
  };
  let best=null,bestScore=Infinity,currentScore=Infinity;
  for(const p of players){if(!eligible(p))continue;const s=score(p);if(p===current)currentScore=s;if(s<bestScore-1e-10||Math.abs(s-bestScore)<=1e-10&&(best===null||p.id<best.id)){best=p;bestScore=s;}}
  if(!best)return current?.id??null;
  // Retain control through small changes in relative distance. The caller may
  // additionally require a stable candidate for autoSwitchSeconds.
  return !manual&&current&&currentScore-bestScore<minimumGain?current.id:best.id;
}

/** Buffers wait for this real local window; prediction never expands reach. */
export function canContactBall(p,b,c,{kind='foot'}={}){
  if(!p||!b||b.owner!=null&&b.owner!==p.id||p.cooldown>0||p.recover>0||p.slideTime>0)return false;
  if(![p.x,p.z,b.x,b.z,b.y].every(Number.isFinite))return false;
  if(kind==='head'){
    const reach=Math.min(c.aerial.reach,Math.max(0,setting(c,'contact','headReach',1.2)));
    return b.owner==null&&b.y>=c.aerial.minHeight&&b.y<=c.aerial.maxHeight&&distance(p,b)<=reach;
  }
  const radius=Math.min(1.1,Math.max(0,finite(c.physics.pickupRadius)+setting(c,'contact','footSlack',0.12)));
  return b.y>=c.physics.ballRadius-0.01&&b.y<=c.rules.pickupHeight&&distance(p,b)<=radius;
}

/** A first touch retains the runner's momentum and orientation. Only a small
 * bounded impulse from the incoming ball is transferred; positions never move. */
export function receiveBallMotion(p,b,c){
  const retain=clamp(setting(c,'contact','momentumRetention',0.97),0,1);
  const transfer=clamp(setting(c,'contact','incomingTransfer',0.035),0,0.12);
  const maxImpulse=clamp(setting(c,'contact','maxImpulse',0.42),0,0.8);
  let ix=(finite(b.vx)-finite(p.vx))*transfer,iz=(finite(b.vz)-finite(p.vz))*transfer;
  const impulse=Math.hypot(ix,iz);if(impulse>maxImpulse){ix*=maxImpulse/impulse;iz*=maxImpulse/impulse;}
  let vx=finite(p.vx)*retain+ix,vz=finite(p.vz)*retain+iz;
  const ceiling=Math.max(Math.hypot(finite(p.vx),finite(p.vz)),finite(c.players.speed,5.3));
  const speed=Math.hypot(vx,vz);if(speed>ceiling){vx*=ceiling/speed;vz*=ceiling/speed;}
  const facing=unit(finite(p.fx),finite(p.fz),unit(vx,vz));
  return {vx,vz,fx:facing.x,fz:facing.z};
}

/** Owned ground balls approach the foot over several ticks. No capture, remote
 * attraction or change to the player's path happens in this helper. */
export function followDribbleBall(p,b,dt,c,{sprintLead=false}={}){
  const patch={x:b.x,z:b.z,y:b.y,vx:finite(b.vx),vz:finite(b.vz),vy:finite(b.vy),owner:b.owner};
  if(!(dt>0)||!Number.isFinite(dt)||b.owner!==p.id||p.hands)return patch;
  const releaseDistance=clamp(setting(c,'dribble','releaseDistance',1.3),c.physics.pickupRadius,1.6);
  if(distance(p,b)>releaseDistance)return {...patch,owner:null};
  const step=Math.min(dt,0.05),facing=unit(finite(p.fx),finite(p.fz));
  const running=Math.hypot(finite(p.vx),finite(p.vz))/Math.max(1,finite(c.players.speed,5.3));
  // Walking keeps the close touch. At sprint speed the foot puts the ball a
  // little farther ahead, inside the same heavy-touch release distance.
  const alignment=running>.01?(finite(p.vx)*facing.x+finite(p.vz)*facing.z)/(running*Math.max(1,finite(c.players.speed,5.3))):1;
  const lead=sprintLead?c.physics.dribbleOffset*(1+.32*clamp(running,0,1.45))*clamp(.78+.22*alignment,.58,1):c.physics.dribbleOffset;
  const target={x:p.x+facing.x*lead,z:p.z+facing.z*lead};
  const ex=target.x-b.x,ez=target.z-b.z,rate=Math.max(0,setting(c,'dribble','settleRate',17));
  const speedLimit=Math.max(0,setting(c,'dribble','maxCorrectionSpeed',7));
  let rx=ex*rate,rz=ez*rate,relative=Math.hypot(rx,rz);
  if(relative>speedLimit){rx*=speedLimit/relative;rz*=speedLimit/relative;}
  const blend=1-Math.exp(-Math.max(0,setting(c,'dribble','velocityResponse',24))*step);
  let vx=patch.vx+(finite(p.vx)+rx-patch.vx)*blend,vz=patch.vz+(finite(p.vz)+rz-patch.vz)*blend;
  const travel=Math.hypot(vx-finite(p.vx),vz-finite(p.vz));
  if(travel>speedLimit){vx=finite(p.vx)+(vx-finite(p.vx))*speedLimit/travel;vz=finite(p.vz)+(vz-finite(p.vz))*speedLimit/travel;}
  // Once a stationary foot is reached, do not oscillate through it.
  let dx=vx*step,dz=vz*step;
  if(Math.hypot(finite(p.vx),finite(p.vz))<0.05&&(dx*ex+dz*ez)>0&&Math.hypot(dx,dz)>Math.hypot(ex,ez)){dx=ex;dz=ez;vx=dx/step;vz=dz/step;}
  const y=b.y+(c.physics.ballRadius-b.y)*(1-Math.exp(-Math.max(0,setting(c,'dribble','heightResponse',20))*step));
  return {x:b.x+dx,z:b.z+dz,y,vx,vz,vy:(y-b.y)/step,owner:b.owner};
}

/** A loose ball uses its actual threat and selected role, not the last owner's
 * team. This avoids exposing keeper actions on a field player's free ball. */
export function soccerActionContext(state,c){
  const p=state.players.find(player=>player.id===state.controlled),b=state.ball;
  if(!p)return 'loose';
  const owner=b.owner==null?null:state.players.find(player=>player.id===b.owner);
  if(p.role==='keeper'||state.role==='keeper')return p.hands||owner?.team===p.team?'attack':'keeper';
  if(owner)return owner.team===p.team?'attack':'defense';
  const direction=state.attackDir*(p.team===0?1:-1),ownEnd=-direction*c.pitch.length/2;
  const threat=(b.x-ownEnd)*direction<(c.pitch.play||c.pitch).penaltyDepth+1&&finite(b.vx)*direction<0;
  return threat?'defense':'loose';
}

/** Seconds a better-placed team-mate must stay the best candidate before control moves to him (v2).
 * A clearly closer one (ai.switchFast = [[metres, factor], ...], widest first) takes over sooner; a marginal
 * one waits the full autoSwitchSeconds. `recentlyLeft` (he is the player control just left) always waits
 * the full time, so a faster takeover cannot become flicker between two players. */
export function autoSwitchDwell(c,advantage,recentlyLeft=false){
 const full=finite(c.autoSwitchSeconds,0.5);
 if(recentlyLeft)return full;
 const table=Array.isArray(c.ai?.switchFast)?c.ai.switchFast:[[3,.5],[2,.75]];
 for(const [metres,factor] of table)if(advantage>=metres)return full*clamp(finite(factor,1),0.2,1);
 return full;
}
