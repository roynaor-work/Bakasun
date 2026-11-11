/** Kill switch for the 06/11/2026 aim-direction fix: `?navalAim=v1` restores the
 * old behaviour (camera glued to the turret, speed-blended gain). */
import {polishLegacy,polishValue} from './polish-flag.mjs';
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
export function navalWideYaw(dx,config,avail=Infinity){
 const w=config.aimControls?.wide||{},a=w.fine??.12,b=w.grow??.001,d0=w.keepPixels??60,full=w.fullReach??380,d=Math.abs(dx);
 // 11/11/2026: the aim pad sits at the screen edge, so the drag toward the edge had 4x less room than away from it (144 px vs 700 px on a phone).
 // Beyond `keepPixels` the remaining room is stretched so that reaching the screen edge always means `fullReach` virtual pixels (about 190 degrees).
 let e=Math.min(d,full);if(Number.isFinite(avail)&&avail>d0&&avail<full&&d>d0)e=Math.min(full,d0+(d-d0)*(full-d0)/(avail-d0));
 return Math.sign(dx)*(a*e+b*e*e)*Math.PI/180;
}
/** Yaw range reachable from a thumb-down point: degrees to each side for a drag to the screen edge. */
export function navalPadReach(startX,width,config){
 const w=config.aimControls?.wide||{};return {right:navalWideYaw(width-startX,config,width-startX)*180/Math.PI,left:navalWideYaw(-startX,config,startX)*180/Math.PI,full:w.fullReach??380};
}
export const navalTapAim=search=>!polishLegacy('navalAim',search)&&polishValue('navalAim',search)!=='v19'&&polishValue('navalAim',search)!=='v20';
export const navalEdgeReach=search=>!polishLegacy('navalAim',search)&&polishValue('navalAim',search)!=='v19'&&polishValue('navalAim',search)!=='v20';
