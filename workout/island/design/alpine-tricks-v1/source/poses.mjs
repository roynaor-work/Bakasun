// SPDX-License-Identifier: CC0-1.0
// Original alpine-tricks-v1 choreography. Angles radians; lengths metres.
export const BONE_NAMES=Object.freeze(['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']);
export const clamp=x=>Math.max(0,Math.min(1,x));
export const smooth=x=>(x=clamp(x))*x*x*(10+x*(-15+6*x));
export const curve=(u,keys)=>{
  if(u<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++)if(u<=keys[i][0]){const [a,x]=keys[i-1],[b,y]=keys[i];return x+(y-x)*smooth((u-a)/(b-a));}
  return keys.at(-1)[1];
};
const win=(u,a,b,c,d)=>smooth((u-a)/(b-a))*(1-smooth((u-c)/(d-c)));
export const CLIPS=[
  {id:'ski_ready',label:'עמידת סקי · מוכנים לזינוק',durationSeconds:2.4,loop:true,category:'ready'},
  {id:'glide',label:'גלישה ישרה',durationSeconds:2.4,loop:true,category:'ground'},
  {id:'turn_left',label:'פנייה שמאלה',durationSeconds:3.2,loop:true,category:'turn',sign:1},
  {id:'turn_right',label:'פנייה ימינה',durationSeconds:3.2,loop:true,category:'turn',sign:-1},
  {id:'brake',label:'בלימה · מחרשה',durationSeconds:3.6,loop:false,category:'brake'},
  {id:'jump',label:'קפיצה · עלייה, שיא ונחיתה',durationSeconds:3.6,loop:false,category:'air'},
  {id:'air_180',label:'סיבוב 180 באוויר',durationSeconds:4,loop:false,category:'air',spin:Math.PI},
  {id:'air_360',label:'סיבוב 360 באוויר',durationSeconds:4.8,loop:false,category:'air',spin:2*Math.PI},
  {id:'perfect_landing',label:'נחיתה מושלמת',durationSeconds:2.8,loop:false,category:'landing'},
  {id:'soft_fall_recover',label:'נפילה רכה · החלקה וקימה',durationSeconds:7.2,loop:false,category:'fall'},
  {id:'victory',label:'ניצחון · ידיים למעלה',durationSeconds:4,loop:false,category:'victory'},
  {id:'gate_exit',label:'עמידה ביציאה מהשער',durationSeconds:2.8,loop:true,category:'gate'}
].map(c=>({...c,kind:'motion',sampleHz:30,events:c.category==='air'?[
  {name:'compression',time:2/30+(c.durationSeconds-4/30)*.16},
  {name:'takeoff',time:2/30+(c.durationSeconds-4/30)*.25},
  {name:'apex',time:c.durationSeconds*.5},
  {name:'landing',time:2/30+(c.durationSeconds-4/30)*.75},
  {name:'settled',time:2/30+(c.durationSeconds-4/30)*.98}
]:c.category==='fall'?[
  {name:'balance-lost',time:1.08},{name:'soft-side-contact',time:2.3},
  {name:'slide',time:3.1},{name:'get-up',time:4.7},{name:'recovered',time:6.55}
]:c.id==='perfect_landing'?[{name:'landing',time:0},{name:'absorbed',time:.7},{name:'settled',time:2.4}]:[]}));
const BY_ID=Object.fromEntries(CLIPS.map(c=>[c.id,c]));
export function sampleParameters(id,seconds,sport='ski',{wrap=false}={}){
  const clip=BY_ID[id];if(!clip)throw Error('Unknown clip '+id);
  const t=wrap&&clip.loop?((seconds%clip.durationSeconds)+clip.durationSeconds)%clip.durationSeconds:seconds;
  // Two stationary samples at each boundary give exact zero endpoint tangents.
  const u=clamp((t-2/30)/(clip.durationSeconds-4/30));
  const breath=Math.sin(Math.PI*u)**2;
  const p={name:id,u,sport,pelvisY:.473,pelvisX:0,pelvisZ:.013,hipsPitch:.17,hipsRoll:0,hipsYaw:0,spinePitch:.13,chestPitch:-.035,chestRoll:0,chestYaw:0,headPitch:-.10,
    rootYaw:0,rootPitch:0,rootRoll:0,rootX:0,rootZ:0,airHeight:0,edge:0,equipmentYaw:0,equipmentPitch:0,footLift:0,stance:.127,handY:.720,handZ:.205,handSpread:.305,armPhase:0,grab:0,celebrate:0,fall:0,recover:0,worldPelvisY:null,brakeYaw:0};
  if(id==='ski_ready'){
    p.pelvisY=.425+.003*breath;p.pelvisZ=-.025;p.hipsPitch=.29;p.spinePitch=.15;
    p.handY=.60;p.handZ=.25;p.handSpread=.23;p.headPitch=-.15;
  }else if(id==='glide'){
    p.pelvisY+=.004*breath;p.hipsPitch+=.012*breath;p.armPhase=.008*breath;
  }else if(clip.category==='turn'){
    const load=win(u,.04,.36,.64,.96),s=clip.sign;
    p.edge=s*.18*load;p.pelvisX=s*.10*load;p.pelvisY-=.035*load;
    p.hipsRoll=-s*.20*load;p.chestRoll=s*.065*load;p.hipsYaw=s*.035*load;
    p.chestYaw=-s*.08*load;p.hipsPitch+=.075*load;p.handSpread+=.025*load;
  }else if(id==='brake'){
    const load=smooth(u/.60);
    p.brakeYaw=-.20*load;p.pelvisY-=.065*load;p.pelvisZ-=.04*load;
    p.hipsPitch+=.08*load;p.spinePitch-=.07*load;p.handY-=.08*load;p.handZ+=.10*load;
  }else if(clip.category==='air'){
    const a=clamp((u-.25)/.5),fly=win(u,.25,.36,.64,.75),land=win(u,.75,.83,.86,.98);
    // C1 lift curve, zero vertical speed at snow contact, no teleport on landing.
    p.airHeight=.68*16*a*a*(1-a)*(1-a);
    p.pelvisY=curve(u,[[0,.473],[.16,.36],[.25,.473],[.42,.40],[.58,.40],[.75,.473],[.83,.35],[1,.473]]);
    p.hipsPitch+=.23*fly+.13*land;p.spinePitch+=.07*fly;p.footLift=.035*fly;
    p.handSpread+=.035*fly;p.handY-=.04*fly;p.handZ+=.035*fly;
    p.rootYaw=(clip.spin??0)*smooth(a);
    p.chestYaw=(clip.spin?.10:0)*Math.sin(2*Math.PI*a)*fly;
  }else if(id==='perfect_landing'){
    // Begins at flat-ski touchdown; flexion absorbs then releases the impact.
    const absorb=win(u,0,.26,.34,.92);
    p.pelvisY-=.13*absorb;p.hipsPitch+=.17*absorb;p.spinePitch+=.06*absorb;
    p.handY-=.10*absorb;p.handZ+=.07*absorb;
  }else if(id==='soft_fall_recover'){
    const f=win(u,.10,.32,.54,.90);
    p.fall=f;p.recover=u>.54?f:0;
    p.rootRoll=1.34*f;p.rootPitch=.07*f;
    p.worldPelvisY=.473-.25*f;p.pelvisY=.473-.10*f;
    p.hipsPitch+=.18*f;p.spinePitch+=.10*f;p.handY-=.06*f;p.handZ-=.13*f;
    p.handSpread-=.04*f;p.footLift=.025*f;
    // Deliberate gentle slide; trajectory stays in the asset for preview/export.
    p.rootZ=curve(u,[[0,0],[.18,0],[.56,.45],[.93,.45],[1,.45]]);
    p.headPitch=-.10+.07*f;
  }else if(id==='victory'){
    const raise=win(u,.03,.32,.72,.98);
    p.celebrate=raise;p.handY=.72+.48*raise;p.handZ=.205-.15*raise;
    p.handSpread=.305+.025*raise;p.spinePitch=.13-.10*raise;
    p.hipsRoll=.025*Math.sin(2*Math.PI*u)*raise;p.pelvisY+=.006*breath;
  }else if(id==='gate_exit'){
    p.pelvisY=.505+.002*breath;p.pelvisZ=.005;p.hipsPitch=.08;p.spinePitch=.06;
    p.handY=.68;p.handZ=.13;p.handSpread=.29;p.headPitch=-.06;
  }
  return p;
}
