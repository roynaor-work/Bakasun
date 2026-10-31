import {rollBall} from './soccer-physics.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const unit=(x,z,fallback={x:1,z:0})=>{const length=Math.hypot(x,z);return length>1e-9?{x:x/length,z:z/length}:fallback;};
const angle=(a,b)=>Math.atan2(a.x*b.z-a.z*b.x,a.x*b.x+a.z*b.z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const rayLimit=(value,delta,half,inset)=>Math.abs(delta)<1e-10?Infinity:Math.max(0,((delta>0?half-inset:-half+inset)-value)/delta);

/** A pass must land inside the grass, with room for its first bounce. This is a
 * landing target, not an invisible wall: later tackles and shots remain free. */
export function safeLoftPoint(point,c){
 const margin=Math.max(finite(c.physics.ballRadius)*4,.75),hx=c.pitch.length/2,hz=c.pitch.width/2;
 return {x:clamp(finite(point.x),-hx+Math.min(margin,hx*.25),hx-Math.min(margin,hx*.25)),z:clamp(finite(point.z),-hz+Math.min(margin,hz*.25),hz-Math.min(margin,hz*.25))};
}

/** Power chooses range along the requested direction. Only an automatic aim may
 * turn slightly to a teammate already near that landing point; a manual drag
 * keeps its ray until that ray would leave the pitch. No hidden AI intent. */
export function loftDestination(state,c,power=0,{aim:requestedAim,point}={}){
 const p=state.players.find(player=>player.id===state.controlled),b=state.ball;
 if(!p)throw Error('A controlled soccer player is required');
 const q=clamp(finite(power),0,1),passing=c.passing;
 const fallback=unit(finite(p.fx,state.attackDir*(p.team===0?1:-1)),finite(p.fz));
 const raw=requestedAim||state.passAim?.manual&&state.passAim||state.aim||fallback;
 const aim=unit(finite(raw.x),finite(raw.z),fallback),manual=!!raw.manual;
 const min=Math.max(0,finite(passing.minDistance,5)),max=Math.max(min,finite(passing.maxDistance,22));
 const requestedRange=min+(max-min)*q;
 const hx=c.pitch.length/2,hz=c.pitch.width/2,margin=Math.max(c.physics.ballRadius*4,.75);
 const inside=Math.abs(b.x)<=hx-margin&&Math.abs(b.z)<=hz-margin;
 const range=inside?Math.min(requestedRange,rayLimit(b.x,aim.x,hx,margin),rayLimit(b.z,aim.z,hz,margin)):requestedRange;
 let landing=safeLoftPoint(point||{x:b.x+aim.x*range,z:b.z+aim.z*range},c),target=null,assisted=false,correction=0;
 const originalLanding=landing;let bestReceiver=null,bestTurn=0;
 const zone=clamp(finite(c.assistance?.passing?.landingReceiverZone,1.8),0,2.2);
 const maxTurn=clamp(finite(c.assistance?.passing?.maxCorrectionDegrees,18),0,28)*Math.PI/180;
 const maxLead=Math.max(0,finite(c.assistance?.passing?.maxLeadDistance,.85));
 let best=Infinity;
 for(const member of state.players){
  if(member.team!==p.team||member.id===p.id||member.recover>0||member.slideTime>0)continue;
  const actualDistance=distance(member,b);
  if(actualDistance<1.3||actualDistance>max+zone)continue;
  let lx=finite(member.vx)*Math.min(.35,Math.max(0,finite(passing.leadSeconds))),lz=finite(member.vz)*Math.min(.35,Math.max(0,finite(passing.leadSeconds)));
  const lead=Math.hypot(lx,lz),scale=lead>maxLead?maxLead/lead:1;
  const receiver=safeLoftPoint({x:member.x+lx*scale,z:member.z+lz*scale},c);
  // A player outside the grass cannot become an assisted destination merely
  // because their clamped projection happens to sit inside it.
  if(Math.abs(member.x)>hx-c.physics.ballRadius||Math.abs(member.z)>hz-c.physics.ballRadius)continue;
  const miss=distance(receiver,originalLanding),turn=angle(aim,unit(receiver.x-b.x,receiver.z-b.z,aim));
  if(miss>zone||Math.abs(turn)>maxTurn+1e-10)continue;
  const score=miss+Math.abs(turn)*.5;
  if(score<best-1e-10||Math.abs(score-best)<=1e-10&&(target===null||member.id<target)){
   best=score;target=member.id;
   bestReceiver=receiver;bestTurn=turn;
  }
 }
 if(bestReceiver&&!manual&&!point){landing=bestReceiver;assisted=distance(landing,originalLanding)>1e-8;correction=bestTurn;}
 return {...landing,distance:distance(landing,b),target,kind:'loft',assisted,correctionRadians:correction};
}

/** Solve the same fixed-step Euler flight used by rollBall, including its air
 * drag and the final ground-friction step. The Nth sample is the first landing
 * at the requested point; gravity, launch speed and time therefore agree. */
export function createLoftFlight(ball,destination,c,power=0){
 const target=safeLoftPoint(destination,c),q=clamp(finite(power),0,1),r=c.physics.ballRadius,g=c.ball.gravity;
 const dt=c.match.fixedStep,range=distance(ball,target),nominal=c.passing.minDistance+(c.passing.maxDistance-c.passing.minDistance)*q;
 const configured=Math.max(.45,finite(c.passing.loftMinSeconds,1.05)+q*finite(c.passing.loftExtraSeconds,.45));
 const duration=Math.max(.35,configured*Math.sqrt(Math.min(1,range/Math.max(1,nominal))));
 const steps=Math.max(8,Math.ceil(duration/dt)),time=steps*dt,fromY=Math.max(r,finite(ball.y,r));
 const vy=(r-fromY)/time+g*dt*(steps-1)/2;
 let attenuation=1,travel=0,height=fromY-r;
 for(let i=1;i<=steps;i++){
  travel+=dt*attenuation;
  const y=fromY+vy*i*dt-g*dt*dt*i*(i-1)/2;
  height=Math.max(height,y-r);
  attenuation*=Math.exp(-(y<=r+c.rules.groundThreshold?c.ball.grassFriction:c.ball.airDrag)*dt);
 }
 const vx=(target.x-ball.x)/travel,vz=(target.z-ball.z)/travel;
 return {flight:{kind:'physical-loft',age:0,duration:time,height,fromX:ball.x,fromY,fromZ:ball.z,x:target.x,z:target.z},vx,vz,vy,curve:0};
}

/** Consume one normal fixed simulation step. Bouncing passes lose energy at
 * contact and retain at most enough horizontal energy to settle before a line.
 * This prevents the old boundary-clipped landing + 62% speed from rolling out. */
export function stepLoftBall(ball,dt,c){
 const flight=ball.flight;
 if(flight?.kind!=='physical-loft')return false;
 const descending=ball.vy<0;
 rollBall(ball,dt,c);flight.age+=dt;
 const r=c.physics.ballRadius;
 // The planned landing time is not a contact event. A deflection may make the
 // actual first ground contact earlier or later; never damp a ball in midair.
 if(!descending||ball.y>r+1e-7)return false;
 // Floating point equality must not defer a contact for a whole extra tick.
 if(ball.y<=r+1e-7){ball.y=r;if(ball.vy<0)ball.vy=Math.abs(ball.vy)>c.ball.bounceThreshold?-ball.vy*c.ball.bounce:0;}
 const carry=clamp(finite(c.ball.landingCarry,.62),0,1);ball.vx*=carry;ball.vz*=carry;
 const speed=Math.hypot(ball.vx,ball.vz);
 if(speed>0){
  const direction={x:ball.vx/speed,z:ball.vz/speed},inset=r+.05;
  const room=Math.min(rayLimit(ball.x,direction.x,c.pitch.length/2,inset),rayLimit(ball.z,direction.z,c.pitch.width/2,inset));
  const friction=Math.max(0,c.ball.grassFriction),bounce=clamp(c.ball.bounce,0,.95),g=c.ball.gravity;
  const airborne=2*Math.max(0,ball.vy)/(g*(1-bounce))+8*c.match.fixedStep;
  const ground=friction>0?c.match.fixedStep/(1-Math.exp(-friction*c.match.fixedStep)):Infinity;
  const maximum=Number.isFinite(ground)?Math.max(0,room)*.95/(airborne+ground):0;
  if(speed>maximum){const scale=maximum/speed;ball.vx*=scale;ball.vz*=scale;}
 }
 ball.flight=null;return true;
}
