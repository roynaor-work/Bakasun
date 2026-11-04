// Pure, bounded control geometry for the human player: slide-tackle variants,
// swept tackle contact and recovery. Input and simulation state are never changed.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>Number.isFinite(n)?n:0;

export const SLIDE_KINDS=Object.freeze(['straight','lateral','fast']);

/** One authored variant per situation (design/motion2/soccer tackles): a fast
 * slide from a sprint, a lateral slide across the carrier's path, otherwise the
 * straight slide. Reads the tackler's visible velocity and facing only. */
export function chooseSlideKind(p,aim,c){
 const variants=c.slide?.variants;if(!variants)return 'straight';
 const vx=finite(p.vx),vz=finite(p.vz),speed=Math.hypot(vx,vz),base=Math.max(.1,finite(c.players?.speed)||5.3);
 const ax=finite(aim?.x),az=finite(aim?.z),al=Math.hypot(ax,az)||1;
 const hx=speed>.3?vx/speed:finite(p.fx),hz=speed>.3?vz/speed:finite(p.fz),hl=Math.hypot(hx,hz)||1;
 const angle=Math.acos(clamp((hx*ax+hz*az)/(hl*al),-1,1));
 if(variants.fast&&speed>=base*(c.slide.fastSpeedRatio??1.15)&&angle<=(c.slide.fastAngleDegrees??35)*Math.PI/180)return 'fast';
 if(variants.lateral&&angle>=(c.slide.lateralAngleDegrees??55)*Math.PI/180)return 'lateral';
 return 'straight';
}

/** Variant parameters with the base slide as the fallback for every field. */
export function slideVariant(c,kind){
 const base=c.slide,v=base?.variants?.[kind]||{};
 return {kind:base?.variants?.[kind]?kind:'straight',seconds:v.seconds??base.seconds,distance:v.distance??base.distance,reach:v.reach??base.reach,recoverSeconds:v.recoverSeconds??base.recoverSeconds,cooldownSeconds:v.cooldownSeconds??base.cooldownSeconds,baseChance:v.baseChance??base.baseChance};
}

/** A committed slide covers the configured distance, with a fast extension and
 * a slowing finish. The curve integrates to one, so it adds no extra reach. */
export function slideVelocityScale(remaining,seconds){
 const duration=Math.max(1e-6,finite(seconds));
 const progress=1-clamp(finite(remaining)/duration,0,1);
 return 1.45-.9*progress;
}

/** First swept local contact in this fixed tick between the sliding foot and the
 * moving ball. A high ball, or a ball reached after the extended-foot phase,
 * cannot be won. The caller applies team, keeper-hands, skill and possession rules. */
export function sweptSlideContact(from,to,ballFrom,ballTo,c,variant,{elapsed=0,dt=1/60,owner=null}={}){
 if(![from?.x,from?.z,to?.x,to?.z,ballFrom?.x,ballFrom?.z,ballFrom?.y,ballTo?.x,ballTo?.z,ballTo?.y,elapsed,dt].every(Number.isFinite)||!(dt>0))return null;
 const duration=variant.seconds,activeEnd=duration*(c.slide.activeShare??.82);
 if(elapsed>=activeEnd)return null;
 const end=clamp((activeEnd-elapsed)/dt,0,1);
 const px=from.x-ballFrom.x,pz=from.z-ballFrom.z;
 const dx=(to.x-from.x)-(ballTo.x-ballFrom.x),dz=(to.z-from.z)-(ballTo.z-ballFrom.z);
 const radius=Math.max(0,variant.reach),a=dx*dx+dz*dz,b=px*dx+pz*dz,q=px*px+pz*pz-radius*radius;
 let time=0,exit=end;
 if(q>0){
  if(a<1e-12)return null;
  const discriminant=b*b-a*q;if(discriminant<0)return null;
  time=(-b-Math.sqrt(discriminant))/a;
  if(time<0||time>end)return null;
  exit=Math.min(exit,(-b+Math.sqrt(discriminant))/a);
 }else if(a>1e-12)exit=Math.min(exit,(-b+Math.sqrt(Math.max(0,b*b-a*q)))/a);
 const dy=ballTo.y-ballFrom.y;
 if(ballFrom.y+dy*time>c.rules.pickupHeight&&dy<0)time=Math.max(time,(c.rules.pickupHeight-ballFrom.y)/dy);
 if(ballFrom.y+dy*time<c.physics.ballRadius-.01&&dy>0)time=Math.max(time,(c.physics.ballRadius-.01-ballFrom.y)/dy);
 if(time>exit)return null;
 const height=ballFrom.y+dy*time;
 if(height<c.physics.ballRadius-.01||height>c.rules.pickupHeight)return null;
 const age=elapsed+time*dt,late=age>duration*(c.slide.lateShare??.58);
 const x=from.x+(to.x-from.x)*time,z=from.z+(to.z-from.z)*time;
 const ox=x-(owner?.x??ballFrom.x),oz=z-(owner?.z??ballFrom.z),length=Math.hypot(ox,oz)||1;
 const behind=!!owner&&(ox*finite(owner.fx)+oz*finite(owner.fz))/length<-(c.steal?.behindCosine??.35);
 return {time,x,z,late,behind,risk:clamp((late?.35:0)+(behind?.65:0),0,1)};
}

/** A missed or rear tackle leaves the tackler down for longer; a clean win uses
 * the variant's own recovery. */
export function slideRecoverySeconds(variant,{won=false,behind=false,late=false}={}){
 return variant.recoverSeconds*(1+(won?0:.2)+(behind?.25:0)+(late?.15:0));
}
