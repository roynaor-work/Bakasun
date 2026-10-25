/** Street Slam body poses for the shared PoseRig (front view, 200x200, floor 182;
 * x>100 = the character's left side, the third value = forward depth).
 * The engine owns timing; these functions only shape the body. */
const BASE={hip:[100,113],neck:[100,62],head:[100,39],le:[75,92,10],re:[128,87,16],lh:[81,115,17],rh:[130,108,25],lk:[88,145,6],rk:[116,145,-6],lf:[87,179],rf:[120,179],lt:[87,183,12],rt:[120,183,12]};
const TAU=Math.PI*2;
const pt=(x,y,z=0)=>[x,y,z];

function legsRun(phase,amp=1){
 const s=Math.sin(phase*TAU),up=Math.max(0,s),down=Math.max(0,-s);
 return {lk:pt(90,141-6*up*amp,24*s*amp),lf:pt(89,179-14*up*amp,8*s*amp),rk:pt(112,141-6*down*amp,-24*s*amp),rf:pt(113,179-14*down*amp,-8*s*amp),
  lt:pt(89,183-14*up*amp,8*s*amp+12),rt:pt(113,183-14*down*amp,-8*s*amp+12)};
}
function legsStand(bend=0){return {lk:pt(89,145+bend*.4,6+bend*.8),rk:pt(113,145+bend*.4,6+bend*.8),lf:pt(88,179),rf:pt(114,179),lt:pt(88,183,12),rt:pt(114,183,12)};}

export function slamPose(anim,{t=0,phase=0,speed=0,dribble=0,defending=false,airborne=false,hasBall=false}={}){
 const run=speed>.6,amp=Math.min(1,speed/4.5);
 const sw=Math.sin(phase*TAU);
 switch(anim){
  case 'run':return {...BASE,hip:pt(100,115),neck:pt(100,63,7),head:pt(100,41,9),...legsRun(phase,amp),
   le:pt(77,90,-16*sw*amp),lh:pt(80,110,-10*sw*amp+12),re:pt(123,90,16*sw*amp),rh:pt(120,110,10*sw*amp+12)};
  case 'dribble':{const h=Math.abs(Math.sin(dribble*Math.PI));
   return {...BASE,hip:pt(100,117),neck:pt(100,64,8),head:pt(100,42,9),...(run?legsRun(phase,amp):legsStand(8)),
    le:pt(76,88,run?-12*sw*amp:12),lh:pt(78,106,run?-6*sw*amp+16:22),re:pt(126,90,22),rh:pt(130,104+10*(1-h),30)};}
  case 'shoot':{
   if(!airborne)return {...BASE,hip:pt(100,123),neck:pt(100,68,6),head:pt(100,45,7),lk:pt(89,152,20),rk:pt(112,152,20),lf:pt(88,180),rf:pt(113,180),lt:pt(88,183,12),rt:pt(113,183,12),
    le:pt(86,82,24),lh:pt(95,68,30),re:pt(114,82,24),rh:pt(105,68,30)};
   const follow=t>.3;
   return {...BASE,hip:pt(100,112),neck:pt(100,60,2),head:pt(100,37,3),lk:pt(95,146,6),rk:pt(107,146,10),lf:pt(95,174),rf:pt(107,175),lt:pt(95,177,10),rt:pt(107,178,12),
    le:pt(88,44,14),lh:follow?pt(97,24,30):pt(96,20,14),re:pt(112,44,14),rh:follow?pt(103,22,32):pt(104,18,14)};}
  case 'dunk':{
   if(!airborne)return slamPose('dribble',{phase,speed:Math.max(speed,3),dribble:.5});
   return {...BASE,hip:pt(100,110),neck:pt(100,58,8),head:pt(100,35,10),lk:pt(93,128,34),lf:pt(92,160,18),rk:pt(110,148,-6),rf:pt(111,178,-14),lt:pt(92,163,28),rt:pt(111,182,-4),
    le:pt(70,70,10),lh:pt(60,86,14),re:pt(112,40,22),rh:pt(106,10,34)};}
  case 'block':return {...BASE,hip:pt(100,112),neck:pt(100,60),head:pt(100,37,2),lk:pt(92,140,14),rk:pt(110,140,14),lf:pt(91,172,4),rf:pt(111,172,4),lt:pt(91,175,14),rt:pt(111,175,14),
   le:pt(86,38,6),lh:pt(84,12,10),re:pt(114,38,6),rh:pt(116,12,10)};
  case 'steal':return {...BASE,hip:pt(100,121),neck:pt(100,68,20),head:pt(100,47,24),lk:pt(91,149,22),rk:pt(112,151,-10),lf:pt(90,180,14),rf:pt(113,180,-8),lt:pt(90,183,26),rt:pt(113,183,4),
   le:pt(80,90,-6),lh:pt(80,110,-4),re:pt(118,90,32),rh:pt(118,108,54)};
  case 'pass':return {...BASE,hip:pt(100,116),neck:pt(100,63,6),head:pt(100,41,8),...legsStand(6),
   le:pt(86,84,30),lh:pt(94,80,54),re:pt(114,84,30),rh:pt(106,80,54)};
  case 'land':return {...BASE,hip:pt(100,124),neck:pt(100,69,8),head:pt(100,47,10),lk:pt(88,152,22),rk:pt(113,152,22),lf:pt(87,180),rf:pt(114,180),lt:pt(87,183,12),rt:pt(114,183,12),
   le:pt(78,90,18),lh:pt(82,108,28),re:pt(122,90,18),rh:pt(118,108,28)};
  case 'celebrate':{const up=Math.abs(Math.sin(t*7));
   return {...BASE,hip:pt(100,114-up*3),neck:pt(100,62),head:pt(100,38,-2),...legsStand(4),
    le:pt(78,42),lh:pt(70,18,6),re:pt(122,42),rh:pt(130,18,6)};}
  default:
   if(defending)return {...BASE,hip:pt(100,121),neck:pt(100,66,8),head:pt(100,44,10),lk:pt(84,150,10),rk:pt(116,150,10),lf:pt(81,180),rf:pt(119,180),lt:pt(81,183,12),rt:pt(119,183,12),
    le:pt(70,84,16),lh:pt(60,96,24),re:pt(130,84,16),rh:pt(140,96,24)};
   if(run)return slamPose('run',{phase,speed});
   return {...BASE,...legsStand(4),hip:pt(100,114)};
 }
}

/** Exponential blend toward the target pose; keeps 3-value joints. */
export function blendPose(current,target,k){
 if(!current)return structuredClone(target);
 for(const key of Object.keys(target)){
  const a=current[key],b=target[key];if(!a){current[key]=[...b];continue;}
  for(let i=0;i<b.length;i++)a[i]=(a[i]??0)+(b[i]-(a[i]??0))*k;
  if(a.length>b.length)a.length=b.length;
 }
 return current;
}
