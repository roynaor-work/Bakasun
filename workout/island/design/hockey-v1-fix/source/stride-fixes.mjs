// SPDX-License-Identifier: CC0-1.0
// מקור: יצירה מקורית עבור תיקון hockey-v1, על נתוני CC0 של PR #414.
// שיפור כיוון להבים ופתרון רגליים; מהירות, תמיכות ומסלול המקור נשמרים.
import {qaxis, qmul, qrotate, qnorm, jointWorld} from '../../../minigames/athletes-core.mjs';

const TAU = 2 * Math.PI;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = v => {v = clamp(v); return v*v*v*(10+v*(-15+6*v));};
const deriv = v => 30 * clamp(v)**2 * (1-clamp(v))**2;
const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const mul = (a,s) => a.map(v=>v*s);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const unit = a => mul(a,1/(Math.hypot(...a)||1));
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const inv = q => [-q[0],-q[1],-q[2],q[3]];
const round = a => qnorm(a).map(v=>+v.toFixed(7));
const IDS = new Set(['skate_push_slow','skate_push_medium','skate_push_fast','skate_backward']);
export const descriptions = [
  'יישור כיוון הלהב למהירותו בעולם בעת הדחיפה, במקום זווית שרירותית; הלהב שטוח במגע והקרסול נשאר במסלול המקור.',
  'בנוסף, פתרון שתי עצמות מדויק במישור הברך: הקרסול מגיע ליעד וגובה הלהב בקרח נשמר בלי קירוב גלגול.',
  'בנוסף, החזרת רגל בגובה 45 מ״מ במקום 55 מ״מ ונדנוד אגן של 12 מ״מ במקום 22 מ״מ, להפחתת תנועות עודפות; קצב ומהירות המקור נשמרים.'
];

// מסגרת אורתונורמלית שבה ‎-Y הוא כיוון העצם ו-X הוא ציר הברך.
function frameAlong(direction, hinge) {
  const y=mul(unit(direction),-1),x=unit(sub(hinge,mul(y,dot(hinge,y)))),z=cross(x,y);
  const [m00,m10,m20]=x,[m01,m11,m21]=y,[m02,m12,m22]=z,tr=m00+m11+m22;
  let q,s;
  if(tr>0){s=Math.sqrt(tr+1)*2;q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
  else if(m00>m11&&m00>m22){s=Math.sqrt(1+m00-m11-m22)*2;q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
  else if(m11>m22){s=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
  else{s=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}
  return qnorm(q);
}
function solveLeg(pose,side,target) {
  const w=jointWorld(pose),hip=w[side+'UpLeg'].p,delta=sub(target,hip),d=Math.hypot(...delta),axis=unit(delta);
  if(d>=.7799||d<=.0401)throw Error('יעד הרגל מחוץ לטווח האנטומי');
  const along=(.41**2-.37**2+d*d)/(2*d),centre=add(hip,mul(axis,along));
  const pole=add(hip,[0,-.2,.4]),off=sub(pole,centre),bend=unit(sub(off,mul(axis,dot(off,axis))));
  const knee=add(centre,mul(bend,Math.sqrt(Math.max(0,.41**2-along**2))));
  const upper=sub(knee,hip),lower=sub(target,knee),hinge=unit(cross(upper,lower));
  const uq=frameAlong(upper,hinge),lq=frameAlong(lower,hinge);
  pose.rot[side+'UpLeg']=qmul(inv(w.Hips.q),uq);
  pose.rot[side+'Leg']=qmul(inv(uq),lq);
}
function footMotion(id,state,u,side,attempt) {
  const s=side==='Left'?1:-1,back=id==='skate_backward',extent=id==='skate_push_slow'?.14:id==='skate_push_fast'?.24:.19;
  const ph=((u+(s<0?.5:0))%1+1)%1,push=ph<.56,v=push?ph/.56:(ph-.56)/.44;
  const ext=push?smooth(v):1-smooth(v),extSpeed=(push?deriv(v)/.56:-deriv(v)/.44)/state.durationSeconds;
  const lift=push?0:(attempt===3?.045:.055)*Math.sin(Math.PI*clamp(v))**2;
  const target=[s*(.13+extent*ext),.08+lift,(back?1:-1)*(.1*ext-.045)];
  // על הקרח הלהב נע לאורך צירו. בהחזרה הוא מתיישר להנחה הבאה.
  const vx=push?s*extent*extSpeed:0,vz=(back?-state.speedMps:state.speedMps)+(push?(back?1:-1)*.1*extSpeed:0);
  const yaw=Math.atan2(back?-vx:vx,back?-vz:vz);
  return {target,yaw};
}
function keepStickAboveIce(pose) {
  const w=jointWorld(pose),tilt=-Math.acos(clamp((w.RightHand.p[1]-.032)/1.28,-.99,.99));
  // המקל המקורי מוחזק ביד ימין; המפרק מיישר את הלהב אופקית בגובה המקור.
  pose.rot.RightHand=qmul(inv(w.RightForeArm.q),qaxis([0,0,1],tilt));
}
export function revise(id,state,attempt,pack) {
  if(!IDS.has(id))return state;
  if(![1,2,3].includes(attempt))throw Error('ניסיון חייב להיות 1, 2 או 3');
  const fixed=structuredClone(state);
  for(const k of fixed.keyframes) {
    const u=k.time,p={rot:k.rotations,hips:k.hipsOffsetMeters};
    if(attempt===3)p.hips[0]=.012*Math.sin(TAU*u);
    for(const side of ['Left','Right']) {
      const {target,yaw}=footMotion(id,state,u,side,attempt);
      if(attempt>=2)solveLeg(p,side,target);
      const w=jointWorld(p);
      p.rot[side+'Foot']=qmul(inv(w[side+'Leg'].q),qaxis([0,1,0],yaw));
    }
    keepStickAboveIce(p);
    for(const b of Object.keys(p.rot))p.rot[b]=round(p.rot[b]);
    k.hipsOffsetMeters=p.hips.map(v=>+v.toFixed(7));
  }
  if(fixed.loop)fixed.keyframes[fixed.keyframes.length-1]={...structuredClone(fixed.keyframes[0]),time:1};
  return fixed;
}
