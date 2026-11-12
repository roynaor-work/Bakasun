// SPDX-License-Identifier: CC0-1.0
// מקור: תיקוני תנועה מקוריים ל-PR 414, Codex, 12/11/2026.
// הגאומטריה נגזרת מ-build-clips.mjs המקורי (CC0). מהירויות, מסלולים וחלונות מגע נשמרים.
import {qaxis,qmul,qnorm,qrotate} from '../../../minigames/athletes-core.mjs';
const DEG=Math.PI/180,TAU=2*Math.PI;
const ids=new Set(['skate_glide','skate_crossover_left','skate_crossover_right','skate_stop_left','skate_stop_right','skate_turn_45','skate_turn_90','skate_turn_180']);
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const bell=u=>Math.sin(Math.PI*clamp(u))**2;
const pulse=(u,a,p,b)=>u<p?smooth((u-a)/(p-a)):1-smooth((u-p)/(b-p));
function blend(a,b,t){
  if(a.reduce((n,v,i)=>n+v*b[i],0)<0)b=b.map(v=>-v);
  return qnorm(a.map((v,i)=>v*(1-t)+b[i]*t));
}
function leg(key,side,target,yaw){
  const s=side==='Left'?1:-1,h=key.hipsOffsetMeters;
  const dx=target[0]-h[0]-.1*s,dy=target[1]-.86-h[1],dz=target[2]-h[2];
  const vertical=Math.hypot(dx,dy),distance=clamp(Math.hypot(vertical,dz),.16,.779);
  const bend=Math.acos(clamp((distance*distance-.41**2-.37**2)/(2*.41*.37),-1,1));
  const lift=Math.atan2(dz,vertical)+Math.atan2(.37*Math.sin(bend),.41+.37*Math.cos(bend));
  key.rotations[side+'UpLeg']=qmul(qaxis([0,0,1],Math.atan2(dx,-dy)),qaxis([1,0,0],-lift));
  key.rotations[side+'Leg']=qaxis([1,0,0],bend);
  flatFoot(key,side,yaw);
}
function flatFoot(key,side,yaw){
  const lower=qmul(key.rotations[side+'UpLeg'],key.rotations[side+'Leg']);
  key.rotations[side+'Foot']=qmul(inverse(lower),qaxis([0,1,0],yaw));
}
export const descriptions={
  1:'כיוון להבים מקביל למסלול בגלישה, בחצייה ובפנייה; בבלימה הלהבים מתיישרים לרוחב מסלול ההתקדמות. זמני המגע ומסלול הגוף נשמרו.',
  2:'בנוסף: ביטול רטט כפות רגליים בגלישה, הסרת סריקה קדימה-אחורה בפנייה, ריכוך מסלול חציית הלהב לקראת מגע, והקדמת העמקת הבלימה.',
  3:'בנוסף: כניסה ויציאה הדרגתיות של הזרועות לכיוון עמידת מוכנות, תוך שמירת טווח נדנוד הזרועות ותקן הפיסוק.'
};
export function revise(id,state,attempt,pack){
  if(!ids.has(id))return state;
  const out=structuredClone(state),cross=id.includes('crossover'),stop=id.includes('stop'),turn=id.includes('turn');
  const dir=id.endsWith('right')?-1:1;
  const idle=pack.states.ready_1.keyframes[0];
  for(const key of out.keyframes){
    const u=key.time,e=bell(u);
    let yaw=0;
    if(cross)yaw=Math.atan2(dir*.6,Math.sqrt(state.speedMps**2-.36));
    if(stop){
      // ההחלקה הצדית בבלימה מכוונת. אחרי סיבוב גוף 65°, עוד 25° מעמידים את הלהב לרוחב המסלול.
      const bodyTurn=65*smooth(u/.55);
      yaw=dir*25* smooth(u/.55)*DEG;
      if(attempt>=2){
        const crouch=pulse(u,0,.4,1);
        key.hipsOffsetMeters[1]=-.14-.055*crouch;
        key.hipsOffsetMeters[0]=dir*.018*crouch;
        for(const side of ['Left','Right']){
          const s=side==='Left'?1:-1;
          leg(key,side,[s*(.15+.05*crouch),.08,(s>0?.08:-.07)*crouch],yaw);
        }
      }
    }
    if(attempt>=2&&id==='skate_glide'){
      for(const side of ['Left','Right'])leg(key,side,[side==='Left'?.15:-.15,.08,.03],0);
    }else if(attempt>=2&&turn){
      for(const side of ['Left','Right']){
        const s=side==='Left'?1:-1;
        leg(key,side,[s*(.15+.025*e),.08,.03],0);
      }
    }else if(attempt>=2&&cross){
      for(const side of ['Left','Right']){
        const s=side==='Left'?1:-1,ph=(u+(s>0?0:.5))%1;
        const recovery=ph<.5?bell(ph*2):0;
        leg(key,side,[s*.15-dir*.28*recovery,.08+.075*recovery,.02+.16*recovery],yaw);
      }
    }
    for(const side of ['Left','Right'])flatFoot(key,side,yaw);
    if(attempt>=3){
      const gate=1-smooth(Math.min(u,1-u)/.15);
      // החלקה חד-ידית אל אחיזת מוכנות חלקית. 65% שומר פיסוק מתחת 24°.
      for(const side of ['Left','Right'])for(const part of ['Arm','ForeArm']){
        const bone=side+part;
        key.rotations[bone]=blend(key.rotations[bone],idle.rotations[bone],.65*gate);
      }
      // תיקון אוריינטציית היד שומר את להב המקל מעל הקרח אחרי שינוי הזרוע.
      const rot=key.rotations;
      let q=qmul(qmul(qmul(rot.Root,rot.Hips),rot.Spine),rot.Chest);
      q=qmul(qmul(q,rot.RightArm),rot.RightForeArm);
      const world=worldJoints(key);
      const tilt=-Math.acos(clamp((world.RightHand[1]-.032)/1.28,-.99,.99));
      const rootYaw=Math.atan2(qrotate(rot.Root,[0,0,1])[0],qrotate(rot.Root,[0,0,1])[2]);
      rot.RightHand=qmul(inverse(q),qmul(qaxis([0,1,0],rootYaw),qaxis([0,0,1],tilt)));
    }
    for(const bone of Object.keys(key.rotations))key.rotations[bone]=qnorm(key.rotations[bone]).map(v=>+v.toFixed(7));
  }
  if(out.loop)out.keyframes[out.keyframes.length-1]={...structuredClone(out.keyframes[0]),time:1};
  return out;
}
// אותו FK קנוני כמו jointWorld; השימוש הישיר שומר את צירי המקל המקוריים.
import {jointWorld} from '../../../minigames/athletes-core.mjs';
function worldJoints(key){return Object.fromEntries(Object.entries(jointWorld({rot:key.rotations,hips:key.hipsOffsetMeters})).map(([b,w])=>[b,w.p]));}
