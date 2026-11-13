/** Kill switch for the 06/11/2026 aim-direction fix: `?navalAim=v1` restores the
 * old behaviour (camera glued to the turret, speed-blended gain). */
import {polishLegacy,polishValue} from './polish-flag.mjs?v=island-v2-20261107-11';
export const navalAimLegacy=search=>polishLegacy('navalAim',search);
/** Camera yaw trails the turret so the landing mark moves with the finger, never against it.
 * The lead is capped so the mark cannot leave the screen; it closes at `rate` per second. */
export function navalFollowYaw(camYaw,turretYaw,dt,config,aiming){
 if(!aiming||!Number.isFinite(camYaw))return turretYaw;
 const f=config.aimControls?.follow||{},cap=(f.maxLeadDegrees??12)*Math.PI/180,rate=f.rate??6;
 const d=Math.atan2(Math.sin(turretYaw-camYaw),Math.cos(turretYaw-camYaw)),next=d*Math.exp(-rate*Math.max(0,dt));
 return turretYaw-Math.max(-cap,Math.min(cap,next));
}
/** Thumb-lift filter: the last `lagMs` before the finger leaves the glass is jitter from lifting, not intent.
 * The release uses the aim as it stood `lagMs` earlier (only after an engaged drag longer than the lag). */
export function navalReleaseSample(g,lagMs){
 if(!(lagMs>0)||!g?.engaged||!g.hist?.length)return g;
 const cut=g.lastT-lagMs;let pick=null;for(let i=g.hist.length-1;i>=0;i--)if(g.hist[i].t<=cut){pick=g.hist[i];break;}
 if(pick)g.aim={yaw:pick.yaw,elevation:pick.elevation};return g;
}

/** 09/11/2026 (Roy): aiming far off the bow was too hard: the fixed 0.12 deg/px needed 330 px of thumb for 40 degrees.
 * Yaw is now a smooth, reversible function of the drag distance from where the thumb went down: fine near the start
 * (0.12 deg/px), progressively wider (0.001 deg/px per px), so about 140 px reach 36 degrees and 250 px reach 87.
 * `?navalAim=v19` restores the v9 fixed gain, `?navalAim=v1` the original. */
export const navalAimWide=search=>!polishLegacy('navalAim',search)&&polishValue('navalAim',search)!=='v19';
export function navalWideYaw(dx,config){
 const w=config.aimControls?.wide||{},a=w.fine??.12,b=w.grow??.001,d=Math.abs(dx);
 return Math.sign(dx)*(a*d+b*d*d)*Math.PI/180;
}

/** 11/11/2026 (Roy, after v20 on the phone): "the aiming still is not fixed". Measured through the real touch path at 844x390:
 * the Fire button sits 62 px from the right edge, so a thumb drag to the right reached 11 degrees and no more, whatever the gain.
 * Spin mode: the first `finePx` of thumb travel aim pixel for pixel (fine), and past `deadPx` the turret keeps turning while the
 * thumb is held out, faster the farther it is (up to `maxDegPerSecond`). The turret can turn all the way round in both directions
 * from the Fire button itself; bringing the thumb back stops the turn. `?navalAim=v20` restores the v20 distance gain,
 * `?navalAim=v19` the v9 fixed gain, `?navalAim=v1` the original. */
export const navalAimSpin=search=>!polishLegacy('navalAim',search)&&!['v19','v20'].includes(polishValue('navalAim',search));
export function navalSpinConfig(config){const s=config?.aimControls?.spin||{};return {finePerPx:s.finePerPx??.12,finePx:s.finePx??22,deadPx:s.deadPx??22,spanPx:s.spanPx??56,maxRate:s.maxDegPerSecond??150,curve:s.curve??1.4,maxStep:s.maxStepSeconds??.1};}
/** Position part of the yaw (radians): pixel for pixel up to `finePx`, then held. */
export function navalSpinFine(dx,config){const c=navalSpinConfig(config),d=Math.max(-c.finePx,Math.min(c.finePx,Number.isFinite(dx)?dx:0));return d*c.finePerPx*Math.PI/180;}
/** Turn rate (radians per second) from the thumb's distance beyond the dead band: zero inside it, `maxRate` at `deadPx+spanPx`. */
export function navalSpinRate(dx,config){const c=navalSpinConfig(config),x=Number.isFinite(dx)?dx:0,d=Math.abs(x)-c.deadPx;if(d<=0)return 0;const u=Math.min(1,d/Math.max(1,c.spanPx));return Math.sign(x)*Math.pow(u,c.curve)*c.maxRate*Math.PI/180;}
/** One frame of the held turn. Frames longer than `maxStepSeconds` (a hidden tab) count as one short step. */
export function navalSpinStep(spin,dx,dt,config){const c=navalSpinConfig(config);return (spin||0)+navalSpinRate(dx,config)*Math.max(0,Math.min(c.maxStep,Number.isFinite(dt)?dt:0));}
/** Camera follow settings for spin mode: a faster follow and a smaller lead, so the landing mark stays near the middle while the turret turns. */
export function navalSpinFollow(config){const f=config?.aimControls?.follow||{},s=config?.aimControls?.spin||{};return {...f,rate:s.followRate??7,maxLeadDegrees:s.followLeadDegrees??30};}
/** Where to draw an edge arrow for a point that left the screen (or is behind the camera): null while it is on screen. */
export function navalEdgeHint(q,width,height,inset=26){
 if(!q||!Number.isFinite(q.x)||!Number.isFinite(q.y))return null;const behind=!(q.depth>0);
 const cx=width/2,cy=height/2;let dx=q.x-cx,dy=q.y-cy;if(behind){dx=-dx;dy=Math.abs(dy)||1;}
 if(!behind&&q.x>=inset&&q.x<=width-inset&&q.y>=inset&&q.y<=height-inset)return null;
 const len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,tx=ux!==0?(cx-inset)/Math.abs(ux):Infinity,ty=uy!==0?(cy-inset)/Math.abs(uy):Infinity,t=Math.min(tx,ty);
 return {x:cx+ux*t,y:cy+uy*t,angle:Math.atan2(uy,ux),behind};
}
