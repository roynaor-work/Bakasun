// Pure helpers for human control. Coordinates are metres in the pitch X/Z plane.
// They never change a player, ball, input, save, RNG or wall clock.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const radians=degrees=>degrees*Math.PI/180;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const unit=(x,z,fallback={x:1,z:0})=>{const d=Math.hypot(x,z);return d>1e-8?{x:x/d,z:z/d}:fallback;};
const signedAngle=(a,b)=>Math.atan2(a.x*b.z-a.z*b.x,a.x*b.x+a.z*b.z);
const rotate=(v,a)=>({x:v.x*Math.cos(a)-v.z*Math.sin(a),z:v.x*Math.sin(a)+v.z*Math.cos(a)});
const setting=(c,section,key,fallback)=>finite(c?.assistance?.[section]?.[key],fallback);

/** Optional config.assistance overrides. Ground assistance is deliberately much
 * narrower and shorter than an unrestricted teammate lock. Manual drags and
 * lofted balls always retain the requested direction. */
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
  const cone=radians(clamp(setting(c,'passing','coneDegrees',28),0,80));
  const maxCorrection=radians(clamp(setting(c,'passing','maxCorrectionDegrees',18),0,cone*180/Math.PI));
  const maxAssistRange=clamp(setting(c,'passing','maxAssistDistance',10),0,maxRange);
  const minAssistRange=Math.max(0,setting(c,'passing','minAssistDistance',1.3));
  const receiverZone=Math.max(0,setting(c,'passing','receiverZone',0.85));
  const maxLead=Math.max(0,setting(c,'passing','maxLeadDistance',0.85));
  let best=Infinity;
  if(!manual&&!loft&&maxCorrection>0){
    for(const member of state.players){
      if(member.team!==p.team||member.id===p.id||member.recover>0)continue;
      const actualDistance=distance(member,b);
      if(actualDistance<minAssistRange||actualDistance>maxAssistRange)continue;
      // First test the actual teammate, then their limited lead. A fast runner
      // cannot pull assistance into the cone from outside it.
      const actual=unit(member.x-b.x,member.z-b.z);
      if(Math.abs(signedAngle(aim,actual))>cone+1e-10)continue;
      let lx=finite(member.vx)*Math.max(0,finite(passing.leadSeconds)),lz=finite(member.vz)*Math.max(0,finite(passing.leadSeconds));
      const leadLength=Math.hypot(lx,lz),leadScale=leadLength>maxLead?maxLead/leadLength:1;
      const x=member.x+lx*leadScale,z=member.z+lz*leadScale;
      const d=Math.hypot(x-b.x,z-b.z),wanted=unit(x-b.x,z-b.z),angle=signedAngle(aim,wanted);
      if(d<minAssistRange||d>maxAssistRange||Math.abs(angle)>cone+1e-10)continue;
      const turn=clamp(angle,-maxCorrection,maxCorrection),corrected=rotate(aim,turn);
      // A capped turn must still enter a local receiving zone. Otherwise retain
      // the raw pass, without assigning an unrelated teammate to run after it.
      const miss=d*Math.abs(Math.sin(angle-turn));
      if(miss>receiverZone)continue;
      const score=Math.abs(angle)*4+Math.abs(d-requestedRange)*0.06+d*0.005;
      if(score<best-1e-10||Math.abs(score-best)<=1e-10&&(target===null||member.id<target)){
        best=score;direction=corrected;range=d;target=member.id;correction=turn;
      }
    }
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
export function selectControlledPlayer(state,c,{moveX=0,moveZ=0,manual=false}={}){
  const players=state.players,b=state.ball,current=players.find(p=>p.id===state.controlled),team=current?.team??0;
  const candidates=players.filter(p=>p.team===team&&p.role!=='keeper'&&finite(p.recover)<=0&&finite(p.slideTime)<=0&&(!manual||p.id!==state.controlled));
  if(!candidates.length)return current?.id??null;
  const owner=b.owner==null?null:players.find(p=>p.id===b.owner);
  if(!manual&&(owner?.team===team||state.passTarget?.player===current?.id||state.switchCooldown>0))return current?.id??candidates[0].id;
  const horizon=clamp(setting(c,'selection','predictionSeconds',0.38),0,0.8);
  const projected={x:clamp(b.x+finite(b.vx)*horizon,-c.pitch.length/2,c.pitch.length/2),z:clamp(b.z+finite(b.vz)*horizon,-c.pitch.width/2,c.pitch.width/2)};
  const intentLength=Math.hypot(finite(moveX),finite(moveZ)),intent=unit(finite(moveX),finite(moveZ));
  const intentWeight=Math.max(0,setting(c,'selection','intentWeight',0.42));
  const minimumGain=Math.max(0,setting(c,'selection','minimumGainSeconds',0.16));
  const score=p=>{
    const speed=Math.max(1,finite(c.players.speed,5.3)+(finite(p.speed,1)-1)*finite(c.players.speedPerRank));
    const intercept=distance(p,projected)/speed;
    const toward=unit(projected.x-p.x,projected.z-p.z);
    const momentum=(finite(p.vx)*toward.x+finite(p.vz)*toward.z)/speed;
    const direction=unit(p.x-(current?.x??b.x),p.z-(current?.z??b.z));
    const intentBias=intentLength>0.2?Math.max(0,intent.x*direction.x+intent.z*direction.z)*intentWeight:0;
    return intercept-Math.max(-0.2,Math.min(0.2,momentum*0.12))-intentBias;
  };
  let best=null,bestScore=Infinity;
  for(const p of candidates){const s=score(p);if(s<bestScore-1e-10||Math.abs(s-bestScore)<=1e-10&&(best===null||p.id<best.id)){best=p;bestScore=s;}}
  // Retain control through small changes in relative distance. The caller may
  // additionally require a stable candidate for autoSwitchSeconds.
  return !manual&&current&&candidates.some(p=>p.id===current.id)&&score(current)-bestScore<minimumGain?current.id:best.id;
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
export function followDribbleBall(p,b,dt,c){
  const patch={x:b.x,z:b.z,y:b.y,vx:finite(b.vx),vz:finite(b.vz),vy:finite(b.vy),owner:b.owner};
  if(!(dt>0)||!Number.isFinite(dt)||b.owner!==p.id||p.hands)return patch;
  const releaseDistance=clamp(setting(c,'dribble','releaseDistance',1.3),c.physics.pickupRadius,1.6);
  if(distance(p,b)>releaseDistance)return {...patch,owner:null};
  const step=Math.min(dt,0.05),facing=unit(finite(p.fx),finite(p.fz));
  const target={x:p.x+facing.x*c.physics.dribbleOffset,z:p.z+facing.z*c.physics.dribbleOffset};
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
  const threat=(b.x-ownEnd)*direction<c.pitch.penaltyDepth+1&&finite(b.vx)*direction<0;
  return threat?'defense':'loose';
}
