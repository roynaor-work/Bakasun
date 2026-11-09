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
export function navalWideYaw(dx,config){
 const w=config.aimControls?.wide||{},a=w.fine??.12,b=w.grow??.001,d=Math.abs(dx);
 return Math.sign(dx)*(a*d+b*d*d)*Math.PI/180;
}
