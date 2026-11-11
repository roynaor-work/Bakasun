/** Original canonical-18 soccer authoring, CC0-1.0.
 * Analytic targets are authored independently of v8 keyframes and real athletes.
 * Times are seconds; the baker samples these curves at 30 Hz. */
import {pose,curve,smooth,I,slerp} from './rig.mjs';
const sole=[0,-.08,0], palm=[0,-.055,.045];
const event=(time,type,bone,local=sole)=>({time,type,bone,local});
const support=(bone,start,end,x,z)=>({bone,start,end,anchor:[x,0,z]});
const both=(duration,x=.2,z=0)=>[support('LeftFoot',0,duration,x,z),support('RightFoot',0,duration,-x,z)];
const planted=(x=.2,z=0)=>[event(0,'plant','LeftFoot'),event(0,'plant','RightFoot')];
const cv=curve;
const wrap=(duration,fn)=>t=>fn(Math.max(0,Math.min(1,t/duration)));
export const definitions=[];
const add=d=>definitions.push(d);

// A deliberately missed straight slide: the sagittal trajectory avoids the
// across-body reaching arm from a successful tackle. Both arm chains stay on
// their original sides of the pelvis; intentional sole skid is marked below.
{
 const duration=1.8;
 const travel=t=>[0,0,cv([[0,0],[.10,.15],[.68,1.18],[1,1.30]],t/duration)];
 add({id:'slide_miss',label:'גלישה מוחטאת',category:'slide',role:'field',duration,loop:false,travel,
  sample:wrap(duration,u=>{const z=travel(u*duration)[2],hipZ=cv([[0,0],[.18,0],[.56,.08],[1,.06]],u);return pose({hips:[0,cv([[0,.73],[.12,.66],[.33,.35],[.58,.16],[1,.16]],u),hipZ],lean:cv([[0,10],[.16,-8],[.45,-34],[1,-26]],u),
   leftFoot:u<=.10?[.15,.08,.13-z]:cv([[0,[.15,.08,.13]],[.10,[.15,.08,-.02]],[.24,[.15,.13,.28]],[.58,[.15,.08,.80]],[1,[.15,.08,.80]]],u),
   rightFoot:u<=.10?[-.15,.08,-.14-z]:cv([[0,[-.15,.08,-.14]],[.10,[-.15,.08,-.29]],[.25,[-.15,.18,.14]],[.58,[-.15,.08,.42]],[1,[-.15,.08,.42]]],u),
   leftHand:cv([[0,[.25,.91,.15]],[.22,[.31,.69,.05]],[.52,[.31,.19,-.02]],[1,[.30,.10,-.08]]],u),
   rightHand:cv([[0,[-.25,.91,.06]],[.22,[-.31,.69,.02]],[.52,[-.31,.19,-.02]],[1,[-.30,.10,-.08]]],u),
   leftElbow:[1,-.3,-.2],rightElbow:[-1,-.3,-.2],head:8});}),
  supports:[support('LeftFoot',0,.18,.15,.13),support('RightFoot',0,.18,-.15,-.14)],
  events:[...planted(),event(.2,'takeoff','Hips',[0,0,0]),event(1,'land','Hips',[0,-.16,0])],
  metricsTargets:{deliberateSlide:[[.2,duration]],armMidlineCrossingFrames:0},
  notes:'Original straight missed tackle: hips sink before forward skid, hands brace on their own sides. Sole translation from 0.20s is intentional sliding, never labelled a planted foot.'});
}
{
 const duration=1.3;
 add({id:'quick_getup',label:'קימה מהירה מהגלישה',category:'slide',role:'field',duration,loop:false,
  sample:wrap(duration,u=>pose({hips:cv([[0,[0,.16,.06]],[.20,[0,.28,.14]],[.44,[0,.48,.12]],[.70,[0,.69,.04]],[1,[0,.78,0]]],u),lean:cv([[0,-26],[.20,35],[.46,28],[.72,12],[1,5]],u),
   leftFoot:cv([[0,[.15,.08,.80]],[.24,[.15,.08,.80]],[.40,[.18,.19,.31]],[.65,[.15,.08,.12]],[1,[.15,.08,.12]]],u),
   rightFoot:cv([[0,[-.15,.08,.42]],[.10,[-.15,.08,.42]],[.17,[-.16,.12,.22]],[.24,[-.15,.08,.16]],[1,[-.15,.08,.16]]],u),
   leftHand:cv([[0,[.30,.10,-.08]],[.10,[.31,.22,.21]],[.2,[.30,.24,.34]],[.34,[.31,.38,.27]],[.45,[.31,.45,.19]],[.7,[.28,.76,.17]],[1,[.24,.86,.15]]],u),
   rightHand:cv([[0,[-.30,.10,-.08]],[.10,[-.31,.22,.21]],[.2,[-.30,.24,.34]],[.34,[-.31,.38,.27]],[.45,[-.31,.45,.19]],[.7,[-.28,.76,.17]],[1,[-.24,.86,.12]]],u),leftElbow:cv([[0,[1,-.3,-.2]],[.16,[.6,-.6,-.4]],[1,[.6,-.6,-.4]]],u),rightElbow:cv([[0,[-1,-.3,-.2]],[.16,[-.6,-.6,-.4]],[1,[-.6,-.6,-.4]]],u),head:cv([[0,8],[.4,-5],[1,0]],u)})),
  supports:[support('LeftFoot',0,.24*duration,.15,.80),support('RightFoot',0,.10*duration,-.15,.42),support('RightFoot',.24*duration,duration,-.15,.16),support('LeftFoot',.65*duration,duration,.15,.12)],
  events:[...planted(),event(.24*duration,'plant','RightFoot'),event(.65*duration,'plant','LeftFoot')],
  notes:'Independent rapid recovery: arms sweep forward as the right foot tucks under first; the left sole stays down until the right plants, then weight shifts over it and the left foot steps back beneath the chest.'});
}
{
 const duration=2;
 add({id:'goalkeeper_ready',label:'שוער: היכון ובדיקת שטח',category:'keeper',role:'keeper',duration,loop:true,
  sample:wrap(duration,u=>{const s=Math.sin(u*2*Math.PI);return pose({hips:[.006*s,.716+.005*Math.sin(u*4*Math.PI),0],lean:10,twist:-2*s,headYaw:8*s,leftFoot:[.22,.08,.025],rightFoot:[-.22,.08,.025],leftHand:[.255,1.015+.012*s,.295],rightHand:[-.255,1.015-.012*s,.295],leftElbow:[.55,-.7,-.5],rightElbow:[-.55,-.7,-.5]});}),
  supports:both(duration,.22,.025),events:planted(),notes:'Compact split-set variation: low centre of mass, wrists in front of thighs, subtle scanning and reciprocal glove preparation. Both soles anchored.'});
}
{
 const duration=1.6,release=29/30;
 add({id:'goalkeeper_roll',label:'שוער: גלגול ביד',category:'keeper',role:'keeper',duration,loop:false,ballKind:'roll',
  sample:wrap(duration,u=>pose({hips:cv([[0,[0,.72,0]],[.22,[.025,.64,.02]],[.46,[.04,.49,.10]],[.60,[.04,.44,.15]],[.80,[.025,.62,.12]],[1,[0,.72,.08]]],u),lean:cv([[0,8],[.25,18],[.48,42],[.60,51],[.8,24],[1,8]],u),
   leftFoot:cv([[0,[.20,.08,.025]],[.12,[.20,.08,.025]],[.24,[.21,.16,.18]],[.36,[.21,.08,.32]],[1,[.21,.08,.32]]],u),rightFoot:[-.20,.08,.025],
   leftHand:cv([[0,[.13,1.04,.32]],[.24,[.24,.99,.28]],[.48,[.32,.99,.39]],[.65,[.32,.99,.42]],[1,[.26,.99,.31]]],u),
   rightHand:cv([[0,[-.13,1.04,.32]],[.22,[-.30,.87,.08]],[.42,[-.30,.62,-.04]],[release/duration,[-.24,.34,.54]],[.76,[-.23,.79,.44]],[1,[-.26,.99,.31]]],u),leftElbow:[.5,-.8,-.4],rightElbow:[-.6,-.65,-.8],head:-3})),
  supports:[support('RightFoot',0,duration,-.20,.025),support('LeftFoot',0,.12*duration,.20,.025),support('LeftFoot',.36*duration,duration,.21,.32)],
  events:[...planted(),event(0,'contact','RightHand',palm),event(release,'release','RightHand',palm),event(.36*duration,'plant','LeftFoot')],
  notes:'Low underarm bowling delivery with a planted trail foot, forward lunge and deep hip hinge; the hand sweeps forward at shin height before release.'});
}
{
 const duration=1.2,strike=17/30;
 add({id:'goalkeeper_short_pass',label:'שוער: מסירה קצרה ברגל',category:'keeper',role:'keeper',duration,loop:false,ballKind:'kick',
  sample:wrap(duration,u=>pose({hips:[cv([[0,0],[.25,.055],[.72,.035],[1,0]],u),cv([[0,.73],[.25,.705],[.65,.72],[1,.74]],u),cv([[0,0],[.7,.035],[1,.015]],u)],yaw:cv([[0,0],[.26,-12],[strike/duration,5],[.7,17],[1,0]],u),twist:cv([[0,0],[.25,7],[.7,-9],[1,0]],u),lean:cv([[0,5],[.3,8],[.7,14],[1,6]],u),leftFoot:[.20,.08,.04],
   rightFoot:cv([[0,[-.20,.08,-.04]],[.10,[-.20,.08,-.04]],[.27,[-.18,.16,-.25]],[strike/duration,[-.16,.12,.31]],[.68,[-.14,.27,.47]],[.91,[-.18,.08,.12]],[1,[-.18,.08,.12]]],u),rightFootYaw:cv([[0,0],[.10,0],[.27,15],[.5,28],[.8,13],[.91,0],[1,0]],u),leftFootYaw:0,leftHand:[.28,.91,.12],rightHand:cv([[0,[-.27,.94,.20]],[.32,[-.29,1.00,-.04]],[.7,[-.29,1.00,.29]],[1,[-.27,.94,.20]]],u)})),
  supports:[support('LeftFoot',0,duration,.20,.04),support('RightFoot',0,.1*duration,-.20,-.04),support('RightFoot',.91*duration,duration,-.18,.12)],
  events:[...planted(),event(strike,'contact','RightFoot',[-.025,-.035,.14]),event(strike,'release','RightFoot',[-.025,-.035,.14]),event(.91*duration,'plant','RightFoot')],
  metricsTargets:{anticipation:.27*duration,contact:strike,followThrough:.68*duration,weightShiftMin:.035,followThroughMin:.10},
  notes:'Keeper-specific compact inside-foot distribution. Left support receives weight before the backswing; the right ankle opens and travels forward after release.'});
}
{
 const duration=1.7,release=29/30;
 add({id:'goalkeeper_overarm_throw',label:'שוער: זריקה מעל הכתף',category:'keeper',role:'keeper',duration,loop:false,ballKind:'throw',
  sample:wrap(duration,u=>pose({hips:cv([[0,[0,.72,0]],[.3,[.015,.69,.02]],[.57,[.01,.72,.09]],[.78,[0,.74,.13]],[1,[0,.72,.08]]],u),yaw:cv([[0,0],[.28,-24],[.57,8],[.73,28],[1,0]],u),twist:cv([[0,0],[.28,10],[.65,-12],[1,0]],u),lean:cv([[0,8],[.28,-6],[.6,12],[.75,18],[1,8]],u),
   leftFoot:cv([[0,[.20,.08,.025]],[.10,[.20,.08,.025]],[.22,[.21,.17,.20]],[.34,[.21,.08,.36]],[1,[.21,.08,.36]]],u),rightFoot:[-.20,.08,.025],leftFootYaw:0,rightFootYaw:0,
   leftHand:cv([[0,[.13,1.04,.32]],[.26,[.29,1.20,.30]],[.48,[.31,1.17,.35]],[.70,[.28,.98,.27]],[1,[.26,.99,.31]]],u),
   rightHand:cv([[0,[-.13,1.04,.32]],[.20,[-.31,1.28,.03]],[.36,[-.33,1.48,-.15]],[release/duration,[-.20,1.51,.32]],[.76,[-.13,1.02,.42]],[1,[-.26,.99,.31]]],u),leftElbow:[.5,-.5,-.5],rightElbow:cv([[0,[-.5,-.7,-.5]],[.36,[-.7,.15,-.6]],[.57,[-.6,.2,.2]],[.8,[-.5,-.5,-.3]],[1,[-.5,-.7,-.5]]],u)})),
  supports:[support('RightFoot',0,duration,-.2,.025),support('LeftFoot',0,.1*duration,.2,.025),support('LeftFoot',.34*duration,duration,.21,.36)],
  events:[...planted(),event(0,'contact','RightHand',palm),event(release,'release','RightHand',palm),event(.34*duration,'plant','LeftFoot')],notes:'Original step-through overarm distribution: glove travels behind the shoulder, pelvis leads the throw, then the arm continues forward and down.'});
}
function airborne({id,label,punch=false}){
 const duration=1.5,contact=19/30,takeoff=9/30,land=31/30;
 add({id,label,category:'keeper',role:'keeper',duration,loop:false,ballKind:punch?'punch':'catch',
  sample:wrap(duration,u=>pose({hips:[0,cv([[0,.72],[.15,.63],[.28,.83],[.42,1.03],[.52,.98],[land/duration,.65],[.85,.72],[1,.72]],u),0],lean:cv([[0,8],[.2,4],[.42,-4],[.6,4],[1,8]],u),yaw:punch?cv([[0,0],[.25,14],[.42,-12],[.65,-8],[1,0]],u):0,twist:punch?cv([[0,0],[.25,-7],[.5,8],[1,0]],u):0,
   leftFoot:cv([[0,[.20,.08,.04]],[takeoff/duration,[.20,.08,.04]],[.42,[.19,.40,-.02]],[.52,[.20,.34,.04]],[land/duration,[.20,.08,.04]],[1,[.20,.08,.04]]],u),
   rightFoot:cv([[0,[-.20,.08,.04]],[takeoff/duration,[-.20,.08,.04]],[.42,[-.19,.38,-.05]],[.52,[-.20,.32,.04]],[land/duration,[-.20,.08,.04]],[1,[-.20,.08,.04]]],u),leftFootYaw:0,rightFootYaw:0,
   leftHand:cv([[0,[.26,1.00,.29]],[.19,[.25,1.10,.25]],[contact/duration,punch?[.26,1.33,.24]:[.11,1.91,.18]],[.56,punch?[.27,1.21,.31]:[.12,1.45,.31]],[.78,[.15,1.02,.35]],[1,[.15,1.05,.34]]],u),
   rightHand:cv([[0,[-.26,1.00,.29]],[.19,[-.25,1.12,.25]],[contact/duration,punch?[-.21,1.88,.19]:[-.11,1.91,.18]],[.56,punch?[-.21,1.53,.38]:[-.12,1.45,.31]],[.78,[-.15,1.02,.35]],[1,[-.15,1.05,.34]]],u),leftElbow:[.5,.2,-.5],rightElbow:[-.5,.2,-.5],head:-8})),
  supports:[support('LeftFoot',0,takeoff,.2,.04),support('RightFoot',0,takeoff,-.2,.04),support('LeftFoot',land,duration,.2,.04),support('RightFoot',land,duration,-.2,.04)],
  events:[...planted(),event(takeoff,'takeoff','Hips',[0,0,0]),event(contact,'contact','RightHand',palm),...(punch?[event(contact,'release','RightHand',palm)]:[event(contact,'contact','LeftHand',palm)]),event(land,'land','LeftFoot'),event(land,'plant','RightFoot')],
  notes:punch?'Short countermovement jump and dominant-glove punch; shoulders rotate into the strike, the fist continues through, then both feet cushion the landing.':'Two-handed high collection after a compact vertical spring. Gloves meet above the forehead and lower together into a secure chest gather during the flexed-knee landing.'});
}
airborne({id:'goalkeeper_catch_high',label:'שוער: תפיסה גבוהה'});
airborne({id:'goalkeeper_punch',label:'שוער: אגרוף',punch:true});
{
 const duration=1.5,contact=19/30;
 add({id:'goalkeeper_catch_low',label:'שוער: תפיסה נמוכה',category:'keeper',role:'keeper',duration,loop:false,ballKind:'catch',
  sample:wrap(duration,u=>pose({hips:[0,cv([[0,.72],[.2,.60],[contact/duration,.41],[.56,.44],[.8,.65],[1,.72]],u),cv([[0,0],[.42,.05],[.65,.07],[1,0]],u)],lean:cv([[0,8],[.2,19],[contact/duration,38],[.62,30],[1,8]],u),leftFoot:[.23,.08,.04],rightFoot:[-.23,.08,.04],leftHand:cv([[0,[.26,1.0,.29]],[.22,[.23,.83,.35]],[contact/duration,[.12,.37,.45]],[.58,[.12,.53,.41]],[.8,[.13,.94,.34]],[1,[.13,1.04,.32]]],u),rightHand:cv([[0,[-.26,1.0,.29]],[.22,[-.23,.83,.35]],[contact/duration,[-.12,.37,.45]],[.58,[-.12,.53,.41]],[.8,[-.13,.94,.34]],[1,[-.13,1.04,.32]]],u),leftElbow:[.6,-.8,-.2],rightElbow:[-.6,-.8,-.2],head:8})),supports:both(duration,.23,.04),events:[...planted(),event(contact,'contact','LeftHand',palm),event(contact,'contact','RightHand',palm)],notes:'Grounded low scoop: wide stable feet, deep knee flexion and forward trunk hinge bring both gloves behind the low ball; elbows close as the ball is gathered upward.'});
}
{
 const duration=1.6;
 add({id:'goalkeeper_getup',label:'שוער: קימה אחרי צלילה',category:'keeper',role:'keeper',duration,loop:false,
  sample:wrap(duration,u=>{const p=pose({hips:cv([[0,[-.12,.22,0]],[.2,[-.09,.28,.02]],[.4,[-.04,.43,.04]],[.62,[0,.60,.025]],[.85,[0,.72,0]],[1,[0,.72,0]]],u),roll:cv([[0,55],[.2,48],[.4,22],[.65,3],[1,0]],u),lean:cv([[0,5],[.32,27],[.60,22],[1,8]],u),
   leftFoot:cv([[0,[.16,.12,-.34]],[.2,[.16,.12,-.34]],[.45,[.21,.18,-.08]],[.64,[.22,.08,.025]],[1,[.22,.08,.025]]],u),rightFoot:cv([[0,[-.18,.10,-.28]],[.16,[-.18,.10,-.28]],[.32,[-.22,.14,-.12]],[.44,[-.22,.08,.025]],[1,[-.22,.08,.025]]],u),
   leftHand:cv([[0,[-.10,.22,.18]],[.2,[-.08,.26,.20]],[.44,[.23,.50,.27]],[.72,[.26,.86,.31]],[1,[.255,1.015,.295]]],u),rightHand:cv([[0,[-.50,.10,.22]],[.22,[-.43,.12,.23]],[.44,[-.32,.41,.30]],[.72,[-.27,.86,.31]],[1,[-.255,1.015,.295]]],u),leftElbow:[.5,-.5,-.3],rightElbow:[-.6,-.3,-.4]});p.rotations.LeftFoot=slerp(I,p.rotations.LeftFoot,smooth((u-.30)/.34));p.rotations.RightFoot=slerp(I,p.rotations.RightFoot,smooth((u-.20)/.24));return p;}),
  supports:[support('RightFoot',.44*duration,duration,-.22,.025),support('LeftFoot',.64*duration,duration,.22,.025)],events:[event(0,'land','Hips',[-.12,-.08,0]),event(.2*duration,'plant','RightHand',[0,-.055,0]),event(.44*duration,'plant','RightFoot'),event(.64*duration,'plant','LeftFoot')],notes:'Side-lying recovery rather than a repeated dive: lower glove pushes from the turf, the near knee comes under the pelvis, then a staggered two-foot rise returns to readiness.'});
}
{
 const duration=1.8,takeoff=.4,land=.8;
 add({id:'celebrate_hop',label:'חגיגה: ניתור ושתי פעימות',category:'celebration',role:'field',duration,loop:false,
  sample:wrap(duration,u=>pose({hips:[0,cv([[0,.78],[.15,.68],[.34,1.02],[.45,.68],[.62,.77],[.74,.81],[1,.78]],u),0],lean:cv([[0,4],[.15,8],[.34,-3],[.6,5],[1,4]],u),leftFoot:cv([[0,[.14,.08,.02]],[takeoff/duration,[.14,.08,.02]],[.34,[.14,.35,.01]],[land/duration,[.14,.08,.02]],[1,[.14,.08,.02]]],u),rightFoot:cv([[0,[-.14,.08,-.02]],[takeoff/duration,[-.14,.08,-.02]],[.34,[-.14,.32,-.01]],[land/duration,[-.14,.08,-.02]],[1,[-.14,.08,-.02]]],u),
   leftHand:cv([[0,[.24,.86,.13]],[.15,[.25,.91,.13]],[.34,[.24,1.38,.28]],[.5,[.22,1.00,.27]],[.7,[.24,1.18,.30]],[1,[.24,.86,.13]]],u),rightHand:cv([[0,[-.24,.86,.13]],[.15,[-.25,.91,.13]],[.34,[-.24,1.38,.28]],[.5,[-.22,1.00,.27]],[.7,[-.24,1.18,.30]],[1,[-.24,.86,.13]]],u),leftElbow:[.5,-.2,-.6],rightElbow:[-.5,-.2,-.6]})),
  supports:[support('LeftFoot',0,takeoff,.14,.02),support('RightFoot',0,takeoff,-.14,-.02),support('LeftFoot',land,duration,.14,.02),support('RightFoot',land,duration,-.14,-.02)],events:[...planted(),event(takeoff,'takeoff','Hips',[0,0,0]),event(land,'land','LeftFoot'),event(land,'plant','RightFoot')],notes:'Original small celebratory vertical hop followed by two compact forward hand pulses; no named athlete or recognisable signature routine.'});
}
{
 const duration=1.6;
 add({id:'celebrate_clap',label:'חגיגה: מחיאות כפיים לקבוצה',category:'celebration',role:'field',duration,loop:true,
  sample:wrap(duration,u=>{const close=cv([[0,0],[.14,0],[.22,1],[.32,0],[.42,0],[.50,1],[.60,0],[.70,0],[.78,1],[.88,0],[1,0]],u),s=Math.sin(u*2*Math.PI);return pose({hips:[.012*s,.78+.004*Math.sin(u*4*Math.PI),0],twist:3*s,headYaw:8*s,leftFoot:[.14,.08,.03],rightFoot:[-.14,.08,-.03],leftHand:[.26-.225*close,1.10,.32],rightHand:[-.26+.225*close,1.10,.32],leftElbow:[.5,-.6,-.7],rightElbow:[-.5,-.6,-.7]});}),supports:[support('LeftFoot',0,duration,.14,.03),support('RightFoot',0,duration,-.14,-.03)],events:planted(),notes:'Three irregularly spaced chest-height claps and a small teammate-facing scan. A restrained original loop with closed, anchored stance.'});
}
{
 const duration=1.8;
 add({id:'celebrate_pump',label:'חגיגה: פעימת אגרוף קומפקטית',category:'celebration',role:'field',duration,loop:false,
  sample:wrap(duration,u=>pose({hips:[cv([[0,0],[.2,.04],[.5,.05],[.8,.02],[1,0]],u),.78,0],yaw:cv([[0,0],[.28,-10],[.55,12],[1,0]],u),twist:cv([[0,0],[.28,15],[.55,-8],[1,0]],u),leftFoot:[.15,.08,.025],rightFoot:[-.15,.08,-.025],leftFootYaw:0,rightFootYaw:0,
   leftHand:cv([[0,[.24,.86,.13]],[.3,[.25,.97,.21]],[.65,[.25,.96,.16]],[1,[.24,.86,.13]]],u),rightHand:cv([[0,[-.24,.86,.13]],[.18,[-.27,1.18,.22]],[.32,[-.24,1.43,.23]],[.45,[-.23,1.24,.27]],[.58,[-.23,1.42,.25]],[.75,[-.25,1.09,.25]],[1,[-.24,.86,.13]]],u),leftElbow:[.5,-.6,-.6],rightElbow:[-.6,-.1,-.6]})),supports:[support('LeftFoot',0,duration,.15,.025),support('RightFoot',0,duration,-.15,-.025)],events:planted(),notes:'Two short unilateral fist pulses with a small opposing shoulder/hip turn and both soles grounded; independently authored rather than a real-player imitation.'});
}
{
 const duration=2;
 add({id:'celebrate_turn',label:'חגיגה: צעד צד וסיבוב כתפיים',category:'celebration',role:'field',duration,loop:false,
  sample:wrap(duration,u=>pose({hips:[cv([[0,0],[.24,.08],[.48,.08],[.72,0],[1,0]],u),cv([[0,.78],[.24,.75],[.48,.79],[.72,.76],[1,.78]],u),0],yaw:cv([[0,0],[.28,27],[.48,18],[.72,-14],[1,0]],u),twist:cv([[0,0],[.28,-14],[.48,8],[.72,12],[1,0]],u),
   leftFoot:cv([[0,[.14,.08,.02]],[.08,[.14,.08,.02]],[.16,[.23,.16,.05]],[.24,[.30,.08,.07]],[.52,[.30,.08,.07]],[.64,[.22,.16,.04]],[.76,[.14,.08,.02]],[1,[.14,.08,.02]]],u),rightFoot:cv([[0,[-.14,.08,-.02]],[.28,[-.14,.08,-.02]],[.37,[-.05,.14,-.07]],[.46,[-.02,.08,-.08]],[.68,[-.02,.08,-.08]],[.78,[-.10,.14,-.04]],[.88,[-.14,.08,-.02]],[1,[-.14,.08,-.02]]],u),leftFootYaw:0,rightFootYaw:0,
   leftHand:cv([[0,[.24,.86,.13]],[.28,[.33,1.12,.24]],[.5,[.31,1.05,.32]],[.72,[.24,1.17,.24]],[1,[.24,.86,.13]]],u),rightHand:cv([[0,[-.24,.86,.13]],[.28,[-.18,1.15,.32]],[.5,[-.17,1.06,.22]],[.72,[-.28,1.14,.30]],[1,[-.24,.86,.13]]],u)})),
  supports:[support('LeftFoot',0,.08*duration,.14,.02),support('LeftFoot',.24*duration,.52*duration,.30,.07),support('LeftFoot',.76*duration,duration,.14,.02),support('RightFoot',0,.28*duration,-.14,-.02),support('RightFoot',.46*duration,.68*duration,-.02,-.08),support('RightFoot',.88*duration,duration,-.14,-.02)],events:[...planted(),event(.24*duration,'plant','LeftFoot'),event(.46*duration,'plant','RightFoot'),event(.76*duration,'plant','LeftFoot'),event(.88*duration,'plant','RightFoot')],notes:'Original four-step side shuffle with alternating shoulder accents and compact hands, returning to the starting stance without a signature pose.'});
}
{
 const duration=2.2;
 add({id:'disappointed',label:'אכזבה והחזרת ריכוז',category:'celebration',role:'field',duration,loop:false,
  sample:wrap(duration,u=>pose({hips:[0,cv([[0,.78],[.3,.75],[.6,.75],[1,.78]],u),0],lean:cv([[0,4],[.3,18],[.58,16],[1,4]],u),head:cv([[0,0],[.25,20],[.6,19],[1,0]],u),headYaw:cv([[0,0],[.35,8],[.55,-6],[1,0]],u),leftFoot:[.14,.08,.03],rightFoot:[-.14,.08,-.03],leftHand:cv([[0,[.24,.86,.13]],[.3,[.22,.79,.23]],[.65,[.22,.80,.23]],[1,[.24,.86,.13]]],u),rightHand:cv([[0,[-.24,.86,.13]],[.3,[-.22,.79,.23]],[.65,[-.22,.80,.23]],[1,[-.24,.86,.13]]],u)})),supports:[support('LeftFoot',0,duration,.14,.03),support('RightFoot',0,duration,-.14,-.03)],events:planted(),notes:'A brief downcast head, softened knees and lowered shoulders followed by a deliberate refocus. Hands stay close to the thighs throughout.'});
}
{
 const duration=1.8,release=29/30;
 add({id:'throw_in',label:'זריקת חוץ בשתי ידיים',category:'celebration',role:'field',duration,loop:false,ballKind:'throw',
  sample:wrap(duration,u=>pose({hips:[0,cv([[0,.77],[.12,.79],[.22,.80],[.34,.79],[.48,.77],[.66,.79],[1,.77]],u),cv([[0,0],[.24,-.04],[.66,.05],[1,0]],u)],lean:cv([[0,2],[.12,0],[.22,-3],[.30,-17],[.45,-8],[release/duration,11],[.7,20],[1,3]],u),leftFoot:[.17,.08,.09],rightFoot:[-.17,.08,-.12],
   leftHand:cv([[0,[.11,1.30,.29]],[.10,[.11,1.62,.28]],[.18,[.11,1.70,.16]],[.22,[.11,1.70,.04]],[.30,[.11,1.70,-.14]],[.40,[.11,1.70,-.10]],[release/duration,[.10,1.65,.27]],[.69,[.13,1.21,.44]],[1,[.24,.87,.14]]],u),
   rightHand:cv([[0,[-.11,1.30,.29]],[.10,[-.11,1.62,.28]],[.18,[-.11,1.70,.16]],[.22,[-.11,1.70,.04]],[.30,[-.11,1.70,-.14]],[.40,[-.11,1.70,-.10]],[release/duration,[-.10,1.65,.27]],[.69,[-.13,1.21,.44]],[1,[-.24,.87,.14]]],u),leftElbow:[.4,.5,.3],rightElbow:[-.4,.5,.3],head:cv([[0,-3],[.3,-10],[.55,-3],[1,0]],u)})),
  supports:[support('LeftFoot',0,duration,.17,.09),support('RightFoot',0,duration,-.17,-.12)],events:[...planted(),event(0,'contact','LeftHand',palm),event(0,'contact','RightHand',palm),event(release,'release','LeftHand',palm),event(release,'release','RightHand',palm)],notes:'Legal two-hand throw-in: both feet remain on the ground, the ball first lifts in front of the face to above the crown, then travels behind the head, and both arms release together before following forward.'});
}
if(definitions.length!==16)throw new Error(`Expected 16 keeper/misc definitions, got ${definitions.length}`);
