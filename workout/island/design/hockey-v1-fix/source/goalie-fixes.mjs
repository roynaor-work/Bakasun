// SPDX-License-Identifier: CC0-1.0
// מקור: תיקוני קינמטיקה מקוריים של Codex, 12/11/2026, המבוססים על קליפי
// hockey-v1 בקומיט dc99f03416ca279b549b7f2db927ef7a6ac401e0 של Bakasun.
// אין כאן שינוי במדדי QA. מסלול ומהירות השוער נשמרים; החגיגה הופכת לפירואט על להב.
import {qaxis,qmul,qnorm,qrotate,qslerp,jointWorld,normaliseSoccerClip,sampleCanonical} from '../../../minigames/athletes-core.mjs';
const DEG=Math.PI/180,TAU=2*Math.PI;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=u=>{u=clamp(u);return u*u*u*(10+u*(-15+6*u));};
const inv=q=>[-q[0],-q[1],-q[2],q[3]];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const rounded=v=>+v.toFixed(7);
const xyz=(x=0,y=0,z=0)=>qmul(qmul(qaxis([0,0,1],z*DEG),qaxis([0,1,0],y*DEG)),qaxis([1,0,0],x*DEG));
const poseFromKey=k=>({rot:structuredClone(k.rotations),hips:[...k.hipsOffsetMeters]});
const keyFromPose=(k,p)=>({...k,rotations:Object.fromEntries(Object.entries(p.rot).map(([n,q])=>[n,qnorm(q).map(rounded)])),hipsOffsetMeters:p.hips.map(rounded)});

// אותו פתרון שתי עצמות ואורכי הרגל הקנוניים כבקובץ המקור; אין שינוי שלד.
function solveLeg(p,side,target,yaw=0) {
 const sign=side==='Left'?1:-1;
 const dx=target[0]-p.hips[0]-.1*sign,dy=target[1]-.86-p.hips[1],dz=target[2]-p.hips[2];
 const vertical=Math.hypot(dx,dy),d=clamp(Math.hypot(vertical,dz),.16,.779);
 const bend=Math.acos(clamp((d*d-.41**2-.37**2)/(2*.41*.37),-1,1));
 const lift=Math.atan2(dz,vertical)+Math.atan2(.37*Math.sin(bend),.41+.37*Math.cos(bend));
 p.rot[side+'UpLeg']=qmul(qaxis([0,0,1],Math.atan2(dx,-dy)),qaxis([1,0,0],-lift));
 p.rot[side+'Leg']=qaxis([1,0,0],bend);
 p.rot[side+'Foot']=qmul(inv(qmul(p.rot[side+'UpLeg'],p.rot[side+'Leg'])),xyz(0,yaw,0));
}

export const changesHe={
 goalie_slide_left:[
  'התאמת העברת האגן לתנועת בסיס הלהבים, עם פתרון רגליים מחדש ושמירת רוחב בסיס ומסלול.',
  'הטיית גו צדית הדרגתית של 3 מעלות לתוך ההחלקה, והפחתת כריעה רגעית מ-25 ל-18 מ״מ.',
  'העברת משקל ברמפת מינימום-jerk; פיסוק בסיס 46 ס״מ התואם לעמידת השוער בכניסה וביציאה.'
 ],
 goalie_slide_right:[
  'התאמת העברת האגן לתנועת בסיס הלהבים, עם פתרון רגליים מחדש ושמירת רוחב בסיס ומסלול.',
  'הטיית גו צדית הדרגתית של 3 מעלות לתוך ההחלקה, והפחתת כריעה רגעית מ-25 ל-18 מ״מ.',
  'העברת משקל ברמפת מינימום-jerk; פיסוק בסיס 46 ס״מ התואם לעמידת השוער בכניסה וביציאה.'
 ],
 celebrate_3:[
  'החלפת גלישת הסיבוב בפירואט: מרכז להב שמאל קבוע בעולם; רגל ימין מורמת בכל זמן הסיבוב, וחלונות התמיכה מתארים את המגע בפועל.',
  'כניסה ויציאה מפוזת ready_1 המדויקת, הרמת יד שמאל בלבד ורגל חופשית גבוהה יותר; יד ימין שומרת על גובה המקל.',
  'הקדמת העברת המשקל לפני הסיבוב, רמפת סיבוב מינימום-jerk וחזרה איטית יותר לשתי רגליים.'
 ]
};

function reviseGoalie(id,state,attempt) {
 const sign=id.endsWith('_left')?1:-1;
 const out=structuredClone(state);
 out.keyframes=state.keyframes.map(k=>{
  const p=poseFromKey(k),u=k.time;
  let e=Math.sin(Math.PI*u)**2;
  if(attempt===3)e=u<.5?smooth(2*u):smooth(2*(1-u));
  const halfWidth=attempt===3?.23:.25;
  p.hips[0]=sign*.1*e;
  p.hips[1]=-.21-(attempt===1?.025:attempt===2?.018:.014)*e;
  if(attempt>=2)p.rot.Chest=qmul(xyz(0,0,-sign*(attempt===3?2:3)*e),p.rot.Chest);
  for(const side of ['Left','Right'])solveLeg(p,side,[(side==='Left'?1:-1)*halfWidth+sign*.1*e,.08,.02],sign*90);
  // שמירת כיוון המקל בעולם לאחר שינוי הגו, בלי להזיז את היד וללא שינוי אירועים.
  const oldW=jointWorld(poseFromKey(k)),w=jointWorld(p);
  p.rot.RightHand=qmul(inv(w.RightForeArm.q),oldW.RightHand.q);
  // הטיית הידית לצד פותרת במדויק גובה להב 32 מ״מ, כמו בקובץ המקור.
  const nw=jointWorld(p),tilt=-Math.acos(clamp((nw.RightHand.p[1]-.032)/1.28,-.99,.99));
  p.rot.RightHand=qmul(inv(nw.RightForeArm.q),xyz(0,0,tilt/DEG));
  return keyFromPose(k,p);
 });
 return out;
}

function reviseCelebration(state,attempt,pack) {
 const out=structuredClone(state),idle=normaliseSoccerClip('ready_1',pack.states.ready_1,'hockey-v1');
 const initial=sampleCanonical(idle,0),pivot=[.15,0,.03];
 const spinStart=attempt===1?.1:attempt===2?.15:.2,spinEnd=attempt===3?.8:.85;
 const liftStart=attempt===3?.06:.02,liftEnd=attempt===3?.94:.98;
 const liftAt=u=>u<spinStart?smooth((u-liftStart)/(spinStart-liftStart)):u>spinEnd?1-smooth((u-spinEnd)/(liftEnd-spinEnd)):1;
 out.keyframes=state.keyframes.map(k=>{
  const u=k.time,v=clamp((u-spinStart)/(spinEnd-spinStart)),yaw=TAU*smooth(v),lift=liftAt(u);
  const p=attempt===1?poseFromKey(k):structuredClone(initial);
  // בפירואט כל הגוף מסתובב סביב נקודת מגע שמאל; אין תרגום של תרחיש יחוס.
  p.rot.Root=qaxis([0,1,0],yaw);
  p.hips=[attempt>=2?.12*lift:0,attempt===1?-.14+.02*lift:initial.hips[1],0];
  if(attempt>=2)p.rot.LeftArm=qmul(p.rot.LeftArm,xyz(-(attempt===3?64:72)*lift,0,0));
  solveLeg(p,'Left',[.15,.08,.03],0);
  solveLeg(p,'Right',[-.15,.08+(attempt===1?.14:attempt===2?.18:.16)*lift,.03+(attempt===3?-.04:0)*lift],0);
  // הזזה מקומית זו היא מיקום אגן גיאומטרי, לא נתון מדידה; היא שומרת נקודת להב קבועה.
  const localPivot=qrotate(inv(p.rot.Root),pivot),delta=sub(localPivot,pivot);
  p.hips[0]+=delta[0];p.hips[2]+=delta[2];
  // גובה יד ימין מכתיב את זווית הידית. ימין אוחזת במקל לאורך כל החגיגה.
  const w=jointWorld(p),tilt=-Math.acos(clamp((w.RightHand.p[1]-.032)/1.28,-.99,.99));
  p.rot.RightHand=qmul(inv(w.RightForeArm.q),qmul(p.rot.Root,xyz(0,0,tilt/DEG)));
  return keyFromPose(k,p);
 });
 out.speedMps=0;out.referenceVelocityMps=[0,0,0];
 out.referenceRootMotion=state.referenceRootMotion.map(k=>({...k,translationMeters:[0,0,0]}));
 // רגל שמאל נתמכת לאורך כל הקליפ. ימין נוגעת רק לפני ההרמה ואחרי הנחיתה.
 const duration=state.durationSeconds;
 const support=(bone,a,b)=>({bone,start:rounded(a*duration),end:rounded(b*duration),contact:'blade',timeUnit:'seconds',localPointMeters:[0,-.08,0],icePlaneMeters:0,edge:'flat',allowSlide:true});
 out.supports=[support('LeftFoot',0,1),support('RightFoot',0,liftStart),support('RightFoot',liftEnd,1)];
 out.events=[...state.events,{timeSeconds:rounded(liftStart*duration),name:'free_blade_lift',bone:'RightFoot',domain:'presentation',labelHe:'הרמת הלהב החופשי לפני הפירואט'},{timeSeconds:rounded(liftEnd*duration),name:'free_blade_land',bone:'RightFoot',domain:'presentation',labelHe:'נחיתת הלהב החופשי אחרי הפירואט'}];
 return out;
}

export function revise(id,state,attempt,pack) {
 if(![1,2,3].includes(attempt))throw new RangeError('מספר ניסיון חייב להיות 1, 2 או 3');
 if(id==='goalie_slide_left'||id==='goalie_slide_right')return reviseGoalie(id,state,attempt);
 if(id==='celebrate_3')return reviseCelebration(state,attempt,pack);
 return structuredClone(state);
}
