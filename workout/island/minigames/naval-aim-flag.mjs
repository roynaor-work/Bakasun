/** Kill switch for the 06/11/2026 aim-direction fix: `?navalAim=v1` restores the
 * old behaviour (camera glued to the turret, speed-blended gain). */
import {polishLegacy} from './polish-flag.mjs';
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
