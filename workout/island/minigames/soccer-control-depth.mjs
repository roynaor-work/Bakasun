// Pure, bounded control geometry. Input and simulation state are never changed.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>Number.isFinite(n)?n:0;

/** Feather the centre of a touch stick without losing its full-speed edge.
 * Keyboard diagonals are normalised here too; rotating the pitch preserves the
 * same response because the dead zone is radial rather than per-axis. */
export function analogControl(moveX,moveZ,c){
 const x=finite(moveX),z=finite(moveZ),raw=Math.hypot(x,z);
 const dead=clamp(finite(c.controls?.deadzone),0,.45);
 if(raw<=dead||!raw)return {x:0,z:0,length:0};
 const length=Math.pow(clamp((raw-dead)/(1-dead),0,1),1.18);
 return {x:x/raw*length,z:z/raw*length,length};
}

/** A committed slide covers the configured distance, with a fast extension and
 * a slowing finish. The curve integrates to one, so it adds no extra reach. */
export function slideVelocityScale(remaining,c){
 const duration=Math.max(1e-6,finite(c.slide?.seconds));
 const progress=1-clamp(finite(remaining)/duration,0,1);
 return 1.45-.9*progress;
}

/** First swept local contact in this fixed tick. A high ball or a ball reached
 * after the extended-foot phase cannot be won by the sliding body. The caller
 * still applies normal team, keeper-hands, skill, and possession rules. */
export function sweptSlideContact(from,to,ballFrom,ballTo,c,{elapsed=0,dt=1/60,owner=null}={}){
 if(![from?.x,from?.z,to?.x,to?.z,ballFrom?.x,ballFrom?.z,ballFrom?.y,ballTo?.x,ballTo?.z,ballTo?.y,elapsed,dt].every(Number.isFinite)||!(dt>0))return null;
 const duration=c.slide.seconds,activeEnd=duration*.82;
 if(elapsed>=activeEnd)return null;
 const end=clamp((activeEnd-elapsed)/dt,0,1);
 const px=from.x-ballFrom.x,pz=from.z-ballFrom.z;
 const dx=(to.x-from.x)-(ballTo.x-ballFrom.x),dz=(to.z-from.z)-(ballTo.z-ballFrom.z);
 const radius=Math.max(0,c.slide.reach),a=dx*dx+dz*dz,b=px*dx+pz*dz,q=px*px+pz*pz-radius*radius;
 let time=0,exit=end;
 if(q>0){
  if(a<1e-12)return null;
  const discriminant=b*b-a*q;if(discriminant<0)return null;
  time=(-b-Math.sqrt(discriminant))/a;
  if(time<0||time>end)return null;
  exit=Math.min(exit,(-b+Math.sqrt(discriminant))/a);
 }else if(a>1e-12){
  exit=Math.min(exit,(-b+Math.sqrt(Math.max(0,b*b-a*q)))/a);
 }
 const dy=ballTo.y-ballFrom.y;
 if(ballFrom.y+dy*time>c.rules.pickupHeight&&dy<0)time=Math.max(time,(c.rules.pickupHeight-ballFrom.y)/dy);
 if(ballFrom.y+dy*time<c.physics.ballRadius-.01&&dy>0)time=Math.max(time,(c.physics.ballRadius-.01-ballFrom.y)/dy);
 if(time>exit)return null;
 const height=ballFrom.y+dy*time;
 if(height<c.physics.ballRadius-.01||height>c.rules.pickupHeight)return null;
 const age=elapsed+time*dt,late=age>duration*.58;
 const x=from.x+(to.x-from.x)*time,z=from.z+(to.z-from.z)*time;
 const ox=x-(owner?.x??ballFrom.x),oz=z-(owner?.z??ballFrom.z),length=Math.hypot(ox,oz)||1;
 const behind=!!owner&&(ox*finite(owner.fx)+oz*finite(owner.fz))/length<-(c.steal?.behindCosine??.35);
 return {time,x,z,late,behind,risk:clamp((late ? .35 : 0)+(behind ? .65 : 0),0,1)};
}

/** A missed or rear approach leaves the tackler committed for longer. A clean
 * win uses the existing recovery; an attempted tackle never repeats mid-slide. */
export function slideRecoverySeconds(c,{won=false,behind=false,late=false}={}){
 return c.slide.recoverSeconds*(1+(won?0:.2)+(behind ? .25 : 0)+(late ? .15 : 0));
}
