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
