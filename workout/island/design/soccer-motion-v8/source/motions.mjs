/** Original soccer v8 authoring. Canonical motion2 poses are refined and baked,
 * never loaded by the game. All coordinates are metres, +Y up, +Z forward,
 * +X anatomical left; local quaternions use xyzw. */
import {readFileSync} from 'node:fs';
const design=new URL('../../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,design),'utf8'));
const canonical=read('motion/soccer.json');
const kicks=read('motion2/soccer/kicks-locomotion.json').states;
const receives=read('motion2/soccer/throws-receives.json').states;
export const bones=canonical.skeleton.bones.map(b=>({name:b.name,parent:b.parent,rest:b.restTranslationMeters}));
const names=bones.map(b=>b.name), I=[0,0,0,1], down=[0,-1,0];
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const length=a=>Math.hypot(...a);
const unit=a=>length(a)>1e-10?mul(a,1/length(a)):[0,0,0];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const smooth=t=>(t=clamp(t,0,1),t*t*(3-2*t));
export function qm([x,y,z,w],[a,b,c,d]){return [w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];}
const qi=q=>[-q[0],-q[1],-q[2],q[3]];
export const rotate=(q,v)=>qm(qm(q,[...v,0]),qi(q)).slice(0,3);
export function euler(x=0,y=0,z=0){const r=Math.PI/360;return qm(qm([Math.sin(x*r),0,0,Math.cos(x*r)],[0,Math.sin(y*r),0,Math.cos(y*r)]),[0,0,Math.sin(z*r),Math.cos(z*r)]);}
export function slerp(a,b,t){let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d;}if(d>.9995)return unit(lerp(a,b,t));const angle=Math.acos(clamp(d,-1,1)),s=Math.sin(angle);return a.map((v,i)=>(v*Math.sin((1-t)*angle)+b[i]*Math.sin(t*angle))/s);}
function aim(a,b){const aa=unit(a),bb=unit(b),d=dot(aa,bb);if(d<-.999999)return [1,0,0,0];return unit([...cross(aa,bb),1+d]);}
export function forwardPose(pose){const world={};for(const b of bones){const parent=world[b.parent]||{position:[0,0,0],rotation:I};const rest=b.name==='Hips'?pose.hips:b.rest;world[b.name]={position:add(parent.position,rotate(parent.rotation,rest)),rotation:qm(parent.rotation,pose.rotations[b.name])};}return world;}
export const point=(pose,bone,local=[0,0,0])=>{const b=forwardPose(pose)[bone];return add(b.position,rotate(b.rotation,local));};
function twoBone(pose,upper,lower,end,target,pole,orientation=I){
 const world=forwardPose(pose),origin=world[upper].position,parent=world[bones.find(b=>b.name===upper).parent].rotation;
 const l1=length(bones.find(b=>b.name===lower).rest),l2=length(bones.find(b=>b.name===end).rest);
 const delta=sub(target,origin),distance=clamp(length(delta),Math.abs(l1-l2)+.001,l1+l2-(upper.includes('Arm')?.012:.001)),axis=unit(delta);
 let bend=sub(pole,mul(axis,dot(pole,axis)));if(length(bend)<.01)bend=cross(axis,[1,0,0]);bend=unit(bend);
 const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 const joint=add(origin,add(mul(axis,along),mul(bend,height))),actual=add(origin,mul(axis,distance));
 const qUpper=aim(down,sub(joint,origin)),qLower=aim(down,sub(actual,joint));
 pose.rotations[upper]=qm(qi(parent),qUpper);pose.rotations[lower]=qm(qi(qUpper),qLower);pose.rotations[end]=qm(qi(qLower),orientation);
 return actual;
}
function pose({hips=[0,.82,0],yaw=0,roll=0,lean=0,hipPitch,spinePitch,chestPitch,chest=0,head=0,leftFoot=[.12,.08,.02],rightFoot=[-.12,.08,-.02],leftHand=[.31,.88,.13],rightHand=[-.31,.88,.13],leftFootYaw=0,rightFootYaw=0,leftHandAim=I,rightHandAim=I,leftKnee=[.06,0,1],rightKnee=[-.06,0,1],leftElbow=[1,-.2,.35],rightElbow=[-1,-.2,.35]}={}){
 const p={hips:[...hips],rotations:Object.fromEntries(names.map(n=>[n,[...I]]))};p.rotations.Hips=euler(hipPitch??lean*.35,yaw,roll);p.rotations.Spine=euler(spinePitch??lean*.35,0,0);p.rotations.Chest=euler(chestPitch??(lean*.3+chest),0,0);p.rotations.Head=euler(head,0,0);
 twoBone(p,'LeftUpLeg','LeftLeg','LeftFoot',leftFoot,leftKnee,euler(0,leftFootYaw,0));twoBone(p,'RightUpLeg','RightLeg','RightFoot',rightFoot,rightKnee,euler(0,rightFootYaw,0));
 twoBone(p,'LeftArm','LeftForeArm','LeftHand',leftHand,leftElbow,leftHandAim);twoBone(p,'RightArm','RightForeArm','RightHand',rightHand,rightElbow,rightHandAim);return p;
}
function keeperElbow(sign,w,raised=true){return [sign*(.35-.25*w+.8*Math.sin(Math.PI*w)),-1+(raised?2:.7)*w,-.5+(raised?.7:1.5)*w+.7*Math.sin(Math.PI*w)];}
const fieldPose=settings=>pose({leftElbow:[.22,-.8,-.7],rightElbow:[-.22,-.8,-.7],...settings});
function value(keys,t){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const a=keys[i-1],b=keys[i],u=smooth((t-a[0])/(b[0]-a[0]));return Array.isArray(a[1])?lerp(a[1],b[1],u):a[1]+(b[1]-a[1])*u;}return keys.at(-1)[1];}
const ev=(time,type,bone,local=[0,0,0],extra={})=>({time,type,bone,local,...extra});
const support=(bone,start,end,anchor)=>({bone,start,end,anchor});
const R=.11;const gloveLocal=[0,-.06,.0455];
const footLocal=[0,-.025,.13],sole=[0,-.08,0],palm=[0,-.05,0];
const definitions=[];
function addDefinition(d){definitions.push(d);return d;}
function refineSourcePose(p,id,u){
 if(!['pass_long','pass_loft','shot','receive_chest'].includes(id))return p;
 const before=forwardPose(p),left=before.LeftFoot.position,right=before.RightFoot.position,leftOrientation=before.LeftFoot.rotation,rightOrientation=before.RightFoot.rotation;
 if(id==='receive_chest'){
  const open=value([[0,0],[.24,1],[.42,0],[1,0]],u),absorb=value([[0,0],[.42,0],[.66,1],[1,0]],u);
  p.hips=add(p.hips,[0,-.055*absorb,-.04*absorb]);
  p.rotations.Spine=qm(euler(-4*open+7*absorb),p.rotations.Spine);p.rotations.Chest=qm(euler(-5*open+10*absorb),p.rotations.Chest);p.rotations.Head=qm(euler(4*absorb),p.rotations.Head);
  twoBone(p,'LeftUpLeg','LeftLeg','LeftFoot',left,[.04,0,1],leftOrientation);twoBone(p,'RightUpLeg','RightLeg','RightFoot',right,[-.04,0,1],rightOrientation);
  const lh=[.36+.04*open,1.02+.035*open-.05*absorb,.08-.08*absorb],rh=[-lh[0],lh[1],lh[2]];
  // Preserve the source contact pose and its known chest sphere exactly.
  const armWeight=open+absorb;
  twoBone(p,'LeftArm','LeftForeArm','LeftHand',lerp(before.LeftHand.position,lh,clamp(armWeight,0,1)),[.25,-.8,-.6],before.LeftHand.rotation);
  twoBone(p,'RightArm','RightForeArm','RightHand',lerp(before.RightHand.position,rh,clamp(armWeight,0,1)),[-.25,-.8,-.6],before.RightHand.rotation);
  return p;
 }
 const strike=id==='shot'?.38:id==='pass_long'?.45:.43;
 const back=value([[0,0],[.08,0],[.22,1],[strike,0],[1,0]],u),follow=value([[0,0],[strike,0],[id==='shot'?.59:.64,1],[.91,0],[1,0]],u);
 const power=id==='shot',loft=id==='pass_loft',yaw=value([[0,0],[.21,power?-25:loft?-17:-20],[strike,power?9:loft?5:7],[.64,power?30:loft?24:25],[.91,0],[1,0]],u);
 const lean=power?14*follow+7*Math.sin(Math.PI*u):loft?-10*back-8*follow:8*follow;
 p.hips=add(p.hips,[.033*back+.026*follow,-.015*back,(power?.06:.04)*follow-.025*back]);
 p.rotations.Hips=qm(euler(lean*.3,yaw,0),p.rotations.Hips);p.rotations.Spine=qm(euler(lean*.35,-yaw*.18,0),p.rotations.Spine);p.rotations.Chest=qm(euler(lean*.35,-yaw*.2,0),p.rotations.Chest);p.rotations.Head=qm(euler(power?5*follow:0),p.rotations.Head);
 const rightTarget=add(right,[(power?.17:loft?.07:.05)*follow,(power?.10:loft?.09:.06)*back+(power?.12:loft?.18:.025)*follow,-(power?.14:loft?.08:.12)*back+(power?.14:loft?.08:.15)*follow]);
 twoBone(p,'LeftUpLeg','LeftLeg','LeftFoot',left,[.04,0,1],leftOrientation);const extension=smooth((u-strike-.018)/.1)*(1-smooth((u-.64)/.23)),rightHip=forwardPose(p).RightUpLeg.position,straight=add(rightHip,[power?.09:loft?-.035:.015,loft?-.30:power?-.39:-.46,loft?.715:power?.666:.625]),strikeFoot=euler(power?24:loft?-6:15,yaw*.45,0);twoBone(p,'RightUpLeg','RightLeg','RightFoot',lerp(rightTarget,straight,extension),[-.04,0,1],slerp(rightOrientation,strikeFoot,extension));
 const lh=[.29+.15*back+.02*follow,.88+.20*back+.08*follow,.12-.06*back-.2*follow],rh=[-.29-.03*back-.05*follow,.88+.10*back+.20*follow,.12-.24*back+.20*follow];
 twoBone(p,'LeftArm','LeftForeArm','LeftHand',lh,[.25,-.8,-.6],before.LeftHand.rotation);twoBone(p,'RightArm','RightForeArm','RightHand',rh,[-.25,-.8,-.6],before.RightHand.rotation);
 return p;
}
function sourceClip(id,label,source,{role='field',duration=source.durationSeconds,loop=source.loop,ballKind='kick',notes='',...extra}={}){
 const rawSample=t=>{const time=t/duration,keys=source.keyframes;let hi=keys.findIndex(k=>k.time>=time);if(hi<0)hi=keys.length-1;if(hi===0)return {hips:add([0,.86,0],keys[0].hipsOffsetMeters),rotations:structuredClone(keys[0].rotations)};const a=keys[hi-1],b=keys[hi],u=smooth((time-a.time)/(b.time-a.time));return {hips:add([0,.86,0],lerp(a.hipsOffsetMeters,b.hipsOffsetMeters,u)),rotations:Object.fromEntries(names.map(n=>[n,slerp(a.rotations[n],b.rotations[n],u)]))};};
 const sample=t=>{const p=refineSourcePose(rawSample(t),id,t/duration);if(ballKind==='kick'){const u=t/duration,w=1-smooth((u-.18)/.12);if(w>0){const fk=forwardPose(p),f=rotate(fk.RightFoot.rotation,[0,0,1]),flat=euler(0,Math.atan2(f[0],f[2])*180/Math.PI,0),q=slerp(fk.RightFoot.rotation,flat,w);const originalSole=add(fk.RightFoot.position,rotate(fk.RightFoot.rotation,sole)),ankle=sub(originalSole,rotate(q,sole)),kneePole=sub(fk.RightLeg.position,fk.RightUpLeg.position);twoBone(p,'RightUpLeg','RightLeg','RightFoot',ankle,kneePole,q);}}return p;};
 const events=source.ballContacts.map(c=>ev(c.time*duration,c.event.includes('release')?'release':'contact',c.bone,c.localPointMeters,{sourceCenter:c.ballCenterMeters}));
 // A strike has both physical touch and ownership-release presentation points.
 if(ballKind==='kick')for(const e of [...events])events.push({...e,type:'release'});
 const supports=source.supportContacts.map(s=>support(s.bone,s.startTime*duration,s.endTime*duration,s.anchorMeters));
 for(const s of supports){events.push(ev(s.start,'plant',s.bone,sole));}
 const travel=source.keyframes.some(k=>length(k.referenceRootTranslationMeters)>.01)?source.keyframes.map(k=>({time:k.time*duration,position:k.referenceRootTranslationMeters})):undefined;
 return addDefinition({id,label,role,duration,loop,sample,events,supports,travel,ballKind,notes:notes||source.notes,...extra});
}
addDefinition({id:'idle',label:'עמידת מוצא',role:'field',duration:1.8,loop:true,sample:t=>fieldPose({hips:[0,.825+.003*Math.sin(t/1.8*Math.PI*2),0],leftHand:[.23,.84,.12],rightHand:[-.23,.84,.12]}),events:[ev(0,'plant','LeftFoot',sole),ev(0,'plant','RightFoot',sole)],supports:[support('LeftFoot',0,1.8,[.12,0,.02]),support('RightFoot',0,1.8,[-.12,0,-.02])],ballKind:'stationary',notes:'Relaxed, balanced two-foot stance. Feet remain anchored throughout breathing loop.'});
const ready=t=>pose({hips:[0,.735+.003*Math.sin(t/1.6*Math.PI*2),0],leftFoot:[.2,.08,0],rightFoot:[-.2,.08,0],leftHand:[.31,1.01,.32],rightHand:[-.31,1.01,.32],leftElbow:[.35,-1,-.5],rightElbow:[-.35,-1,-.5],lean:8});
addDefinition({id:'keeper_ready',label:'עמידת שוער',role:'keeper',duration:1.6,loop:true,sample:ready,events:[ev(0,'plant','LeftFoot',sole),ev(0,'plant','RightFoot',sole)],supports:[support('LeftFoot',0,1.6,[.2,0,0]),support('RightFoot',0,1.6,[-.2,0,0])],ballKind:'stationary',notes:'Low athletic goalkeeper set. Elbows soft, palms forward, both knees flexed.'});
sourceClip('pass_short','מסירה קצרה',kicks.pass_short,{duration:.72,notes:'Compact inside-foot pass; ankle opens into contact, left support remains planted and arms counterbalance.'});
sourceClip('pass_long','מסירה ארוכה',kicks.pass_long,{duration:1.04,exitSpeed:8,notes:'Driven long instep pass; larger pelvic rotation and follow-through than the short pass, low ball exit.'});
sourceClip('pass_loft','מסירה בגובה',kicks.corner_kick,{duration:1.12,exitSpeed:5.5,loft:2.1,notes:'Open hip and lifted instep delivery; the distinct elevated ball arc and high follow-through distinguish it from a driven long pass.'});
sourceClip('shot','בעיטה לשער',kicks.kick_power,{duration:.9,exitSpeed:11,loft:.5,notes:'Loaded right-leg strike with fast hip unwind, extended instep and across-body follow-through.'});
sourceClip('receive_chest','קבלה בחזה',receives.receive_chest,{duration:.94,ballKind:'receive',notes:'Chest opens before impact, then retracts as knees absorb momentum; arms stay outside the ball channel.'});
// Foot receive: withdraw the receiving foot on impact, keeping the support leg fixed.
addDefinition({id:'receive_foot',label:'קבלה בכף הרגל',role:'field',duration:1.04,loop:false,sample:t=>{const u=t/1.04;return fieldPose({hips:value([[0,[0,.82,0]],[.38,[.025,.785,-.015]],[.62,[.035,.77,-.025]],[1,[0,.82,0]]],u),rightFoot:value([[0,[-.12,.08,-.02]],[.25,[-.15,.135,.27]],[.42,[-.15,.14,.34]],[.63,[-.15,.135,.19]],[.88,[-.12,.08,-.02]]],u),leftHand:[.34,.92,.08],rightHand:[-.38,.9,.08],rightFootYaw:28,lean:value([[0,0],[.42,7],[.65,12],[1,0]],u)});},events:[ev(0,'plant','LeftFoot',sole),ev(.42*1.04,'contact','RightFoot',[.035,-.015,.08]),ev(.42*1.04+.18,'release','RightFoot',[.035,-.015,.08]),ev(.88*1.04,'plant','RightFoot',sole)],supports:[support('LeftFoot',0,1.04,[.12,0,.02]),support('RightFoot',.88*1.04,1.04,[-.12,0,-.02])],ballKind:'receive_foot',notes:'Receiving ankle is open; the raised foot gives ground contact a visible cushioning withdrawal before replanting.'});
// Advancing receive: the reference travel is separate from native in-place skin animation.
addDefinition({id:'first_touch_moving',label:'מגע ראשון בתנועה',role:'field',duration:1.16,loop:false,sample:t=>{const u=t/1.16,z=1.14*smooth(u),leftFoot=u<=.32?[.12,.08,.12-z]:u>=.82?[.12,.08,1.16-z]:value([[.32,[.12,.08,.12-1.14*smooth(.32)]],[.55,[.12,.19,-.06]],[.82,[.12,.08,1.16-1.14*smooth(.82)]]],u),rightFoot=u>=.72?[-.12,.08,1.10-z]:value([[0,[-.12,.08,-.12]],[.36,[-.14,.14,.31]],[.51,[-.14,.13,.28]],[.72,[-.12,.08,1.10-1.14*smooth(.72)]]],u);return fieldPose({hips:[0,value([[0,.805],[.35,.77],[.58,.79],[1,.81]],u),value([[0,0],[.36,.025],[.6,.03],[1,0]],u)],leftFoot,rightFoot,leftHand:value([[0,[.28,.9,.16]],[.45,[.34,.94,.22]],[.72,[.28,.92,-.08]],[1,[.28,.88,.12]]],u),rightHand:value([[0,[-.28,.9,.0]],[.45,[-.34,.94,-.12]],[.72,[-.31,.94,.22]],[1,[-.28,.88,.12]]],u),lean:value([[0,6],[.36,14],[.6,13],[1,8]],u)});},events:[ev(0,'plant','LeftFoot',sole),ev(.36*1.16,'contact','RightFoot',footLocal),ev(.36*1.16,'release','RightFoot',footLocal),ev(.72*1.16,'plant','RightFoot',sole),ev(.82*1.16,'plant','LeftFoot',sole)],supports:[support('LeftFoot',0,.32*1.16,[.12,0,.12]),support('RightFoot',.72*1.16,1.16,[-.12,0,1.10]),support('LeftFoot',.82*1.16,1.16,[.12,0,1.16])],travel:Array.from({length:37},(_,i)=>({time:1.16*i/36,position:[0,0,1.14*smooth(i/36)]})),ballKind:'moving_touch',notes:'The player advances into the pass, guides the first touch forward and accelerates after it. Smooth optional travel and explicit early/late sole anchors demonstrate actual moving control.'});
sourceClip('dribble','כדרור',kicks.dribble_run,{duration:.88,ballKind:'dribble',notes:'Alternating close-control touches on free feet with two running steps. Reference travel is optional simulation guidance, distinct from native in-place animation.'});
sourceClip('turn_with_ball','פנייה עם כדור',kicks.turn_with_ball,{duration:1.05,ballKind:'turn',notes:'Inside-foot drag around a stable left support; pelvis leads a 65-degree turn before a balanced exit.'});
addDefinition({id:'shield',label:'שמירה על הכדור',role:'field',duration:1.32,loop:true,sample:t=>{const u=t/1.32,w=Math.sin(u*Math.PI*2);const p=fieldPose({hips:[.075+.02*w,.64-.012*w,-.01],yaw:52+4*w,roll:-21-3*w,leftFoot:[.26,.08,.08],rightFoot:[-.25,.08,-.10],leftHand:[.45,.97,.08],rightHand:[-.23,.84,.02],lean:18+3*w,head:-5,leftFootYaw:32,rightFootYaw:25});p.rotations.Spine=qm(euler(0,0,-9),p.rotations.Spine);p.rotations.Chest=qm(euler(0,0,-7),p.rotations.Chest);p.rotations.Head=euler(-5,-20,14);return p;},events:[ev(0,'plant','LeftFoot',sole),ev(0,'plant','RightFoot',sole)],supports:[support('LeftFoot',0,1.32,[.26,0,.08]),support('RightFoot',0,1.32,[-.25,0,-.10])],ballKind:'shield',notes:'A staggered bent-knee base, lowered pelvis and a shoulder turned into the hypothetical challenger. The near arm balances the loaded hip while the ball stays protected beside the far foot.'});
const cutDuration=1.2,cutTravel=u=>[.52*smooth((u-.35)/.65),0,.22*smooth((u-.35)/.65)];
addDefinition({id:'cut',label:'חיתוך עם כדור',role:'field',duration:cutDuration,loop:false,sample:t=>{const u=t/cutDuration,tr=cutTravel(u),l= u<=.48?sub([.21,.08,.02],tr):u>=.78?sub([.61,.08,.24],tr):value([[.48,sub([.21,.08,.02],cutTravel(.48))],[.62,[.23,.21,.08]],[.78,sub([.61,.08,.24],cutTravel(.78))]],u),r=u<=.12?[-.12,.08,-.02]:u>=.63?sub([.39,.08,.22],tr):value([[.12,[-.12,.08,-.02]],[.25,[-.22,.14,.25]],[.34,[-.19,.13,.34]],[.47,[.02,.16,.30]],[.63,sub([.39,.08,.22],cutTravel(.63))]],u);return fieldPose({hips:value([[0,[0,.81,0]],[.22,[.10,.72,.015]],[.34,[.22,.68,.025]],[.47,[.24,.70,.04]],[.64,[.18,.77,.025]],[.78,[.06,.79,.01]],[1,[0,.81,0]]],u),yaw:value([[0,0],[.28,-18],[.47,32],[.73,26],[1,0]],u),roll:value([[0,0],[.24,5],[.34,-18],[.47,-25],[.64,-18],[.85,-5],[1,0]],u),leftFoot:l,rightFoot:r,leftHand:value([[0,[.28,.86,.14]],[.27,[.39,.98,.2]],[.5,[.30,.94,-.09]],[.75,[.32,.91,.18]],[1,[.28,.86,.14]]],u),rightHand:value([[0,[-.27,.86,.13]],[.28,[-.3,.92,-.08]],[.5,[-.38,1.0,.23]],[.75,[-.28,.9,-.02]],[1,[-.27,.86,.13]]],u),lean:value([[0,4],[.28,10],[.47,18],[.7,13],[1,4]],u),rightFootYaw:value([[0,0],[.34,-48],[.48,-22],[.63,-12],[1,0]],u)});},events:[ev(0,'plant','LeftFoot',sole),ev(0,'plant','RightFoot',sole),ev(.34*cutDuration,'contact','RightFoot',[.045,-.015,.065]),ev(.34*cutDuration,'release','RightFoot',[.045,-.015,.065]),ev(.63*cutDuration,'plant','RightFoot',sole),ev(.78*cutDuration,'plant','LeftFoot',sole)],supports:[support('LeftFoot',0,.48*cutDuration,[.21,0,.02]),support('RightFoot',0,.12*cutDuration,[-.12,0,-.02]),support('RightFoot',.63*cutDuration,cutDuration,[.39,0,.22]),support('LeftFoot',.78*cutDuration,cutDuration,[.61,0,.24])],travel:Array.from({length:49},(_,i)=>({time:cutDuration*i/48,position:cutTravel(i/48)})),ballKind:'cut',notes:'The support knee loads before an inside-foot change of direction. A lateral push-off, diagonal reference travel and two new grounded steps carry the body after the ball instead of leaving the pelvis stationary.'});
// Complete slide with side landing and a supported rise, rather than popping to standing.
addDefinition({id:'slide',label:'החלקה וגלישה',role:'field',duration:3.35,loop:false,sample:t=>{const u=t/3.35,hip=value([[0,[0,.81,0]],[.1,[0,.66,.03]],[.23,[.04,.31,.17]],[.3,[.1,.17,.25]],[.34,[.1,.17,.25]],[.56,[.12,.17,.27]],[.68,[.07,.34,.18]],[.82,[.02,.64,.06]],[1,[0,.81,0]]],u);return pose({hips:hip,roll:value([[0,0],[.2,40],[.34,71],[.56,70],[.68,38],[.82,0],[1,0]],u),lean:value([[0,8],[.25,-12],[.56,-12],[.72,19],[1,0]],u),leftFoot:value([[0,[.12,.08,.02]],[.1,[.12,.08,.02]],[.2,[.22,.12,-.08]],[.34,[.36,.12,.08]],[.56,[.36,.12,.1]],[.72,[.2,.08,.12]],[1,[.12,.08,.02]]],u),rightFoot:value([[0,[-.12,.08,-.02]],[.18,[-.12,.17,.36]],[.3,[-.06,.11,.99]],[.48,[-.08,.11,1.0]],[.65,[-.18,.08,.4]],[.82,[-.12,.08,-.02]]],u),leftHand:value([[0,[.3,.9,.1]],[.23,[.3,.35,-.05]],[.45,[.34,.30,-.02]],[.6,[.32,.09,.3]],[.73,[.37,.09,.26]],[.84,[.34,.60,.16]],[1,[.3,.87,.12]]],u),rightHand:value([[0,[-.3,.9,.1]],[.25,[-.46,.125,.38]],[.34,[-.49,.055,.45]],[.59,[-.49,.055,.45]],[.7,[-.33,.08,.30]],[.84,[-.33,.58,.2]],[1,[-.3,.87,.12]]],u),leftHandAim:slerp(I,euler(-90),smooth((u-.46)/.12)*(1-smooth((u-.74)/.1))),rightHandAim:slerp(I,euler(-90),smooth((u-.16)/.14)*(1-smooth((u-.73)/.12))),leftElbow:[1,.3,.2],rightElbow:[-.3,1,.1],leftKnee:[1,0,.3],rightKnee:[-.1,.2,1]});},events:[ev(0,'plant','LeftFoot',sole),ev(.15*3.35,'takeoff','Hips'),ev(.3*3.35,'contact','RightFoot',footLocal),ev(.3*3.35,'release','RightFoot',footLocal),ev(.34*3.35,'land','Hips',[-.165,-.015,0]),ev(.72*3.35,'plant','LeftFoot',sole)],supports:[support('LeftFoot',0,.1*3.35,[.12,0,.02])],travel:Array.from({length:49},(_,i)=>{const u=i/48;return {time:3.35*u,position:[0,0,1.18*smooth((u-.12)/.36)]};}),ballKind:'slide',notes:'Leading leg extends into a low tackle, pelvis settles on the protected side, one hand supports the landing and both hands help the paced rise. Reference travel demonstrates forward sliding; no foot plant is declared during slide.'});
// Distribution is a stepped overarm action. The ball follows the actual palm
// while held, then leaves at the explicit release cue.
const throwDuration=1.8;
const throwPalm=t=>{const keys=[[0,palmOrientation([1,0,0])],[.13,palmOrientation([1,0,0])],[.23,palmOrientation([0,1,0])],[.35,palmOrientation([.25,.4,-.85])],[.48,palmOrientation([.15,.65,.7])],[.6,palmOrientation([0,.1,1])],[.8,palmOrientation([0,.1,1])],[1,I]],u=t/throwDuration;let i=1;while(i<keys.length-1&&u>keys[i][0])i++;return slerp(keys[i-1][1],keys[i][1],smooth((u-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));};const throwNormal=t=>rotate(throwPalm(t),[0,0,1]);
addDefinition({id:'keeper_throw',label:'הוצאה מהיד של שוער',role:'keeper',duration:throwDuration,loop:false,sample:t=>{const u=t/throwDuration,normal=throwNormal(t),rq=throwPalm(t),lq=slerp(palmOrientation([-1,0,0]),I,smooth((u-.12)/.2));return pose({hips:value([[0,[0,.735,0]],[.26,[-.015,.73,-.045]],[.48,[0,.77,.03]],[.6,[.02,.77,.12]],[.76,[.035,.74,.18]],[.9,[0,.735,.03]],[1,[0,.735,0]]],u),yaw:value([[0,0],[.34,-25],[.48,-13],[.6,16],[.76,24],[1,0]],u),hipPitch:value([[0,3],[.34,-4],[.6,9],[.76,15],[1,3]],u),spinePitch:3,chestPitch:2,head:3,leftFoot:value([[0,[.2,.08,0]],[.13,[.2,.08,0]],[.23,[.2,.15,.2]],[.34,[.2,.08,.35]],[.76,[.2,.08,.35]],[.88,[.2,.15,.12]],[.95,[.2,.08,0]],[1,[.2,.08,0]]],u),rightFoot:[-.2,.08,0],leftHand:value([[0,[.1555,1.12,.38]],[.13,[.1555,1.12,.38]],[.34,[.36,1.18,.38]],[.48,[.39,1.14,.45]],[.62,[.32,1.05,.4]],[.8,[.3,.94,.23]],[1,[.31,1.01,.32]]],u),rightHand:value([[0,[-.1555,1.12,.38]],[.13,[-.1555,1.12,.38]],[.23,[-.48,1.22,.24]],[.34,[-.40,1.47,-.25]],[.48,[-.40,1.66,-.02]],[.54,[-.38,1.64,.28]],[.6,[-.04,1.54,.49]],[.76,[.12,1.1,.52]],[.9,[-.25,.96,.3]],[1,[-.31,1.01,.32]]],u),leftHandAim:lq,rightHandAim:rq,leftElbow:[.35,-1,-.5],rightElbow:keeperElbow(-1,.8*smooth((u-.2)/.13)*(1-smooth((u-.64)/.2)))});},events:[ev(0,'contact','LeftHand',gloveLocal,{normal:[-1,0,0]}),ev(0,'contact','RightHand',gloveLocal,{normal:[1,0,0]}),ev(.6*throwDuration,'release','RightHand',gloveLocal,{normal:throwNormal(.6*throwDuration)}),ev(0,'plant','LeftFoot',sole),ev(0,'plant','RightFoot',sole),ev(.34*throwDuration,'plant','LeftFoot',sole),ev(.95*throwDuration,'plant','LeftFoot',sole)],supports:[support('RightFoot',0,throwDuration,[-.2,0,0]),support('LeftFoot',0,.13*throwDuration,[.2,0,0]),support('LeftFoot',.34*throwDuration,.76*throwDuration,[.2,0,.35]),support('LeftFoot',.95*throwDuration,throwDuration,[.2,0,0])],ballKind:'throw',heldNormalAt:throwNormal,notes:'Opposing palms gather at chest height. The left foot steps into a dominant-right overarm wind-up, pelvis unwinds, the palm releases above the shoulder and the arm follows across the body.'});

addDefinition({id:'block',label:'מחסום הגנתי',role:'field',duration:1.3,loop:false,sample:t=>{const u=t/1.3;return fieldPose({hips:value([[0,[0,.79,0]],[.25,[.16,.74,.005]],[.46,[.22,.72,.02]],[.6,[.21,.70,-.025]],[.8,[.1,.76,0]],[1,[0,.79,0]]],u),yaw:value([[0,0],[.3,28],[.55,32],[.8,13],[1,0]],u),roll:value([[0,0],[.4,-8],[.6,-6],[1,0]],u),lean:value([[0,7],[.36,12],[.55,-4],[.8,6],[1,7]],u),leftFoot:value([[0,[.12,.08,.02]],[.08,[.12,.08,.02]],[.17,[.24,.15,.02]],[.25,[.32,.08,.02]],[.67,[.32,.08,.02]],[.77,[.22,.14,.02]],[.86,[.12,.08,.02]],[1,[.12,.08,.02]]],u),rightFoot:value([[0,[-.12,.08,-.02]],[.26,[-.12,.08,-.02]],[.35,[.03,.13,-.02]],[.42,[.13,.08,-.02]],[.72,[.13,.08,-.02]],[.82,[.0,.14,-.02]],[.93,[-.12,.08,-.02]],[1,[-.12,.08,-.02]]],u),leftHand:[.17+value([[0,0],[.25,.16],[.46,.22],[.6,.21],[.8,.1],[1,0]],u),.94,.18],rightHand:[-.17+value([[0,0],[.25,.16],[.46,.22],[.6,.21],[.8,.1],[1,0]],u),.94,.18],leftHandAim:euler(0,0,-65),rightHandAim:euler(0,0,65),leftElbow:[.5,-1,-.25],rightElbow:[-.5,-1,-.25]});},events:[ev(0,'plant','LeftFoot',sole),ev(0,'plant','RightFoot',sole),ev(.25*1.3,'plant','LeftFoot',sole),ev(.42*1.3,'plant','RightFoot',sole),ev(.46*1.3,'contact','Chest',[0,.02,.12]),ev(.46*1.3,'release','Chest',[0,.02,.12]),ev(.86*1.3,'plant','LeftFoot',sole),ev(.93*1.3,'plant','RightFoot',sole)],supports:[support('LeftFoot',0,.08*1.3,[.12,0,.02]),support('LeftFoot',.25*1.3,.67*1.3,[.32,0,.02]),support('LeftFoot',.86*1.3,1.3,[.12,0,.02]),support('RightFoot',0,.26*1.3,[-.12,0,-.02]),support('RightFoot',.42*1.3,.72*1.3,[.13,0,-.02]),support('RightFoot',.93*1.3,1.3,[-.12,0,-.02])],ballKind:'block',notes:'A defensive lateral closed-leg step, arms held close, braced torso contact and a deflected ball. This shot/body block is separate from the possession-protection shield loop.'});

// Every goal zone has its own contact height, travel, launch and landing path.
// Anatomical left is +X. A central low save collapses forward, a central high
// save is a vertical spring; these are not mirrored copies of side dives.
for(const [row,rowLabel,y] of [['low','נמוך',.3],['middle','אמצע',1.15],['high','גבוה',1.98]])for(const [col,colLabel,sign] of [['left','שמאל',1],['center','מרכז',0],['right','ימין',-1]]){
 const side=sign!==0,high=row==='high',low=row==='low',duration=high?3.35:low?3.05:3.2;
 const impact=.36*duration,land=(side||high?.55:.58)*duration,ballCenter=[sign*(low?1.58:high?1.7:1.68),y,side?.35:low?.72:high?.5:1.08];
 const dominant=sign<0?'RightHand':'LeftHand';
 const baseHip=[0,.735,0],endHip=[0,.735,0];
 const contactHip=side?[sign*(low?.54:high?.82:.69),low?.32:high?1.46:.92,.15]:[0,low?.38:high?1.18:.69,low?.18:.06];
 const landedHip=side?[sign*(low?.83:.98),.192,.07]:[0,low?.32:.64,low?.24:.09];
 const contactRoll=side?sign*(low?-78:high?-50:-70):0;
 const sample=t=>{const u=t/duration;
  if(!side&&!high)return centerDivePose(u,row,ballCenter);
  const hp=value([[0,baseHip],[.1,[sign*-.05,.65,0]],[.2,[sign*.12,high?.88:.63,.015]],[.36,contactHip],[.55,landedHip],[.65,landedHip],[.78,[sign*.43,.46,.06]],[.9,[sign*.1,.68,.02]],[1,endHip]],u);
  const roll=value([[0,0],[.1,sign*5],[.36,contactRoll],[.55,side?sign*-86:0],[.65,side?sign*-82:0],[.78,side?sign*-28:0],[.9,0],[1,0]],u);
  let lfoot=value([[0,[.2,.08,0]],[.1,[.2,.08,0]],[.2,[.17,.12,-.03]],[.36,side?[sign*.13,low?.20:high?.67:.34,-.12]:[.19,high?.49:.08,-.06]],[.55,side?[sign*.30,.16,-.10]:[.19,.08,-.06]],[.65,side?[sign*.30,.14,-.1]:[.19,.08,-.06]],[.78,[.24,.08,.05]],[1,[.2,.08,0]]],u);
  let rfoot=value([[0,[-.2,.08,0]],[.1,[-.2,.08,0]],[.2,[-.17,.12,-.03]],[.36,side?[sign*.20,low?.13:high?.55:.25,.13]:[-.19,high?.49:.08,-.06]],[.55,side?[sign*.38,.12,.17]:[-.19,.08,-.06]],[.65,side?[sign*.38,.12,.17]:[-.19,.08,-.06]],[.78,[-.21,.08,-.06]],[1,[-.2,.08,0]]],u);
  // Wrists sit 16cm behind ball centre: 5cm hand surface + 11cm radius.
  const reachDir=unit([side?sign:-.45,high?.65:low?-.1:.1,.32]);
  const wrist=wristForBall(ballCenter,reachDir);
  const other=side?add(wrist,[-sign*.12,high?.04:.035,-.05]):wristForBall(ballCenter,unit([.45,.65,.32]));
  let lh=value([[0,[.31,1.01,.32]],[.1,[.38,.94,.26]],[.36,sign<0?other:wrist],[.44,sign<0?add(other,[0,-.04,0]):add(wrist,[0,-.04,0])],[.56,side?[sign*1.19,.055,.25]:[.25,.28,.56]],[.65,side?[sign*1.12,.055,.22]:[.25,.24,.5]],[.78,[.42,.34,.25]],[.9,[.4,.8,.29]],[1,[.31,1.01,.32]]],u);
  let rh=value([[0,[-.31,1.01,.32]],[.1,[-.38,.94,.26]],[.36,sign<0?wrist:other],[.44,sign<0?add(wrist,[0,-.04,0]):add(other,[0,-.04,0])],[.56,side?[sign*1.03,.055,.42]:[-.25,.28,.56]],[.65,side?[sign*.91,.055,.36]:[-.25,.24,.5]],[.78,[-.36,.31,.32]],[.9,[-.4,.8,.29]],[1,[-.31,1.01,.32]]],u);
  const reach=smooth((u-.15)/.16)*(1-smooth((u-.44)/.14)),hAim=slerp(I,palmOrientation(reachDir),reach);
  const grounded=smooth((u-.44)/.1)*(1-smooth((u-.76)/.15));const handAim=slerp(hAim,euler(-90),grounded),otherHandAim=slerp(slerp(I,palmOrientation(unit([.45,.65,.32])),reach),euler(-90),grounded);
  return pose({hips:hp,roll,lean:side?0:low?value([[0,8],[.36,30],[.6,34],[1,8]],u):8,leftFoot:lfoot,rightFoot:rfoot,leftHand:lh,rightHand:rh,leftHandAim:handAim,rightHandAim:side?handAim:otherHandAim,leftElbow:keeperElbow(1,smooth((u-.12)/.14)*(1-smooth((u-.78)/.14))),rightElbow:keeperElbow(-1,smooth((u-.12)/.14)*(1-smooth((u-.78)/.14))),leftKnee:[.5,.5,.6],rightKnee:[-.5,.5,.6]});
 };
 addDefinition({id:`keeper_dive_${row}_${col}`,label:`צלילת שוער · ${rowLabel} ${colLabel}`,role:'keeper',duration,loop:false,sample,zone:{row,col,label:`${rowLabel} ${colLabel}`,center:ballCenter},events:[ev(0,'plant','LeftFoot',sole),ev(0,'plant','RightFoot',sole),ev(.13*duration,!side&&low?'release':'takeoff',side?(sign>0?'RightFoot':'LeftFoot'):'Hips',undefined,!side&&low?{supportOnly:true}:{}),ev(impact,'contact',dominant,gloveLocal,{desiredCenter:ballCenter}),ev(.44*duration,'release',dominant,gloveLocal),ev(land,'land',side?'Hips':high?'LeftFoot':'LeftHand',side?[sign*.18,-.06,0]:high?[0,-.08,0]:[0,0,-.052]),ev(.9*duration,'plant','LeftFoot',sole),ev(.9*duration,'plant','RightFoot',sole)],supports:[support('LeftFoot',0,.1*duration,[.2,0,0]),support('RightFoot',0,.1*duration,[-.2,0,0])],ballKind:'save',notes:`${rowLabel} ${colLabel}: ${side?'lateral push and extended save followed by side landing, hand-supported rise and a return to the set position':'central '+(high?'vertical spring with two-handed reach and flexed-knee landing':low?'forward low collapse, cushioning scoop and supported recovery':'forward airborne body-height dive, two-handed reach, prone landing and palm-supported recovery')}. Contact timing and local travel are authored independently of game outcome.`});
}

function basisQuaternion(x,y,z){
 const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2],trace=m00+m11+m22;let q;
 if(trace>0){const s=2*Math.sqrt(trace+1);q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4];}
 else if(m00>m11&&m00>m22){const s=2*Math.sqrt(1+m00-m11-m22);q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s];}
 else if(m11>m22){const s=2*Math.sqrt(1+m11-m00-m22);q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s];}
 else{const s=2*Math.sqrt(1+m22-m00-m11);q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s];}return unit(q);
}
function palmOrientation(normal){const z=unit(normal),x=unit(cross(Math.abs(z[1])>.98?[0,0,-1]:[0,1,0],z)),y=cross(z,x);return basisQuaternion(x,y,z);}
const wristForBall=(center,normal)=>sub(sub(center,mul(unit(normal),R)),rotate(palmOrientation(normal),gloveLocal));
function centerDivePose(u,row,center){
 const low=row==='low',mid=!low;
 const hips=value([[0,[0,.735,0]],[.1,[0,.65,0]],[.2,[0,low?.58:.78,.05]],[.36,[0,low?.4:.77,low?.23:.25]],[.55,[0,low?.33:.26,low?.30:.55]],[.65,[0,low?.33:.28,low?.30:.55]],[.78,[0,.48,.27]],[.9,[0,.69,.04]],[1,[0,.735,0]]],u);
 const pitch=value([[0,2.8],[.1,5],[.36,low?40:58],[.55,low?60:78],[.65,low?58:70],[.78,30],[.9,5],[1,2.8]],u);
 const normal=unit([-.45,low?-.08:.08,1]),otherNormal=unit([.45,low?-.08:.08,1]),q=palmOrientation(normal),otherQ=palmOrientation(otherNormal),wrist=wristForBall(center,normal),other=wristForBall(center,otherNormal);
 const lh=value([[0,[.31,1.01,.32]],[.1,[.3,.95,.31]],[.36,wrist],[.44,add(wrist,[0,low?-.045:-.32,low?.025:.18])],[.58,[.24,.055,low?.84:1.04]],[.67,[.25,.055,low?.84:1.04]],[.78,[.33,.34,.46]],[.9,[.33,.88,.33]],[1,[.31,1.01,.32]]],u);
 const rh=value([[0,[-.31,1.01,.32]],[.1,[-.3,.95,.31]],[.36,other],[.44,add(other,[0,low?-.045:-.32,low?.025:.18])],[.58,[-.24,.055,low?.84:1.04]],[.67,[-.25,.055,low?.84:1.04]],[.78,[-.33,.34,.46]],[.9,[-.33,.88,.33]],[1,[-.31,1.01,.32]]],u);
 const reach=smooth((u-.13)/.19),ground=smooth((u-.44)/.13)*(1-smooth((u-.76)/.15)),recover=smooth((u-.77)/.17);
 let handQ=slerp(I,q,reach),otherHandQ=slerp(I,otherQ,reach);handQ=slerp(handQ,euler(-90),ground);handQ=slerp(handQ,I,recover);otherHandQ=slerp(otherHandQ,euler(-90),ground);otherHandQ=slerp(otherHandQ,I,recover);
 const lf=value([[0,[.2,.08,0]],[.1,[.2,.08,0]],[.23,[.18,mid?.19:.12,mid?-.1:-.24]],[.36,[.18,mid?.24:.12,mid?-.19:-.37]],[.55,[.18,.12,mid?-.04:-.37]],[.67,[.18,mid?.08:.12,mid?-.04:-.37]],[.83,[.2,.08,.02]],[1,[.2,.08,0]]],u);
 const rf=value([[0,[-.2,.08,0]],[.1,[-.2,.08,0]],[.23,[-.18,mid?.16:.12,mid?-.13:-.29]],[.36,[-.18,mid?.21:.12,mid?-.23:-.43]],[.55,[-.18,mid?.11:.12,mid?-.08:-.43]],[.67,[-.18,mid?.08:.12,mid?-.08:-.43]],[.83,[-.2,.08,-.02]],[1,[-.2,.08,0]]],u);
 const kneeFlight=mid?smooth((u-.13)/.12)*(1-smooth((u-.74)/.15)):0,knee=lerp([0,0,1],[0,1,-.2],kneeFlight);
 return pose({hips,hipPitch:pitch,spinePitch:value([[0,2.8],[.2,mid?4:5],[.78,mid?4:5],[1,2.8]],u),chestPitch:value([[0,2.4],[.2,mid?2:4],[.78,mid?2:4],[1,2.4]],u),head:low?-4:value([[0,0],[.14,-10],[.36,-45],[.55,-40],[.75,-15],[1,0]],u),leftFoot:lf,rightFoot:rf,leftHand:lh,rightHand:rh,leftHandAim:handQ,rightHandAim:otherHandQ,leftElbow:[.8,-1,-.5],rightElbow:[-.8,-1,-.5],leftKnee:mid?[.25,1,1]:[.06,0,1],rightKnee:mid?[-.25,1,1]:[-.06,0,1]});
}

function freeBallKeys(center,velocity,start,end){
 const gravity=9.81,friction=3.6,height=Math.max(0,center[1]-R),flight=(velocity[1]+Math.sqrt(velocity[1]*velocity[1]+2*gravity*height))/gravity,speed=Math.hypot(velocity[0],velocity[2]),stop=speed/friction;
 const sample=time=>{const t=time-start;if(t<=flight)return [center[0]+velocity[0]*t,Math.max(R,center[1]+velocity[1]*t-.5*gravity*t*t),center[2]+velocity[2]*t];const roll=Math.min(t-flight,stop),distance=speed*roll-.5*friction*roll*roll,along=speed?distance/speed:0;return [center[0]+velocity[0]*(flight+along),R,center[2]+velocity[2]*(flight+along)];};
 const times=[start,end,...Array.from({length:Math.ceil((end-start)*120)},(_,i)=>start+i/120),start+flight,start+flight+stop].filter(t=>t>=start&&t<=end);return [...new Set(times)].sort((a,b)=>a-b).map(time=>({time,position:sample(time)}));
}

function trajectory(d,events){
 const touches=events.filter(e=>!e.supportOnly&&(e.type==='contact'||e.type==='release')),duration=d.duration;
 const centre=e=>{if(e.sourceCenter)return e.sourceCenter;const n=unit(e.normal||[0,0,1]),c=add(e.position,mul(n,R));if(c[1]>=R)return c;const dy=R-e.position[1],horizontal=Math.sqrt(Math.max(0,R*R-dy*dy)),xz=unit([n[0],0,n[2]]);return add(e.position,[xz[0]*horizontal,dy,xz[2]*horizontal]);};
 let keys=[];
 if(!touches.length){const p=d.ballKind==='shield'?[-.32,R,.12]:[0,R,.54];return {radius:R,keys:[{time:0,position:p},{time:duration,position:p}]};}
 const contact=touches.find(e=>e.type==='contact')||touches[0],at=contact.time;
 let c=centre(contact);
 if(d.ballKind==='save'){
  const dir=unit(sub(d.zone.center,contact.position));c=contact.sourceCenter||add(contact.position,mul(dir,R));
  // Pose is checked against the desired zone; centre stays on the actual glove surface.
  keys=[{time:0,position:add(c,[0,highArc(d),2.2])},{time:Math.max(0,at-.15),position:add(c,[0,.07,.65])},{time:at,position:c}];
  const release=touches.find(e=>e.type==='release'),releaseDir=unit(sub(c,contact.position));
  if(release){const rc=release.sourceCenter||add(release.position,mul(releaseDir,R));keys.push(...freeBallKeys(rc,[d.zone.col==='left'?.6:d.zone.col==='right'?-.6:0,.25,3],release.time,duration));}
 }else if(d.ballKind==='throw'){
  const rel=touches.find(e=>e.type==='release'),start=touches.find(e=>e.bone==='RightHand'&&e.time===0),startPose=forwardPose(d.sample(0)).RightHand,endPose=forwardPose(d.sample(rel.time)).RightHand;
  const center0=centre(start),center1=centre(rel),offset0=rotate(qi(startPose.rotation),sub(center0,startPose.position)),offset1=rotate(qi(endPose.rotation),sub(center1,endPose.position));
  for(let t=0;t<rel.time;t+=1/30){const hand=forwardPose(d.sample(t)).RightHand,offset=lerp(offset0,offset1,smooth(t/rel.time));keys.push({time:t,position:add(hand.position,rotate(hand.rotation,offset))});}
  c=center1;keys.push(...freeBallKeys(c,[.3,2.1,7.5],rel.time,duration));
 }else if(d.ballKind==='receive'||d.ballKind==='receive_foot'){
  keys=[{time:0,position:add(c,[0,d.ballKind==='receive'?.18:.03,1.8])},{time:at,position:c}];
  if(d.ballKind==='receive')keys.push(...freeBallKeys(c,[0,.3,.9],at,duration));
  else{const release=touches.find(e=>e.type==='release'),rc=centre(release);keys.push({time:release.time,position:rc},{time:duration,position:[rc[0],R,rc[2]]});}
 }else if(d.ballKind==='block'){keys=[{time:0,position:add(c,[.23,.05,1.85])},{time:at,position:c},{time:Math.min(duration,at+.22),position:add(c,[-.22,-.18,.4])},{time:duration,position:[c[0]-.46,R,c[2]+.85]}];
 }else if(d.ballKind==='dribble'){
  const cs=touches.filter(e=>e.type==='contact'),p0=centre(cs[0]),p1=centre(cs[1]);
  keys=[{time:0,position:[0,R,.70]},{time:.05,position:[0,R,.70]},{time:cs[0].time,position:p0},{time:(cs[0].time+cs[1].time)/2,position:[0,R,.74]},{time:cs[1].time,position:p1},{time:cs[1].time+.045,position:[p1[0],R,p1[2]+.10]},{time:duration-.025,position:[0,R,.70]},{time:duration,position:[0,R,.70]}];
 }else if(d.ballKind==='turn'){
  keys=[{time:0,position:[-.04,R,.54]},{time:at,position:c},{time:duration*.72,position:[.24,R,.34]},{time:duration,position:[.25,R,.32]}];
 }else if(d.ballKind==='cut'){
  keys=[{time:0,position:[-.16,R,.64]},{time:at,position:c},{time:duration*.50,position:sub([.30,R,.68],cutTravel(.50))},{time:duration*.72,position:sub([.50,R,.76],cutTravel(.72))},{time:duration,position:sub([.82,R,.90],cutTravel(1))}];
 }else{
  const speed=d.exitSpeed||5.5,loft=d.loft||0;keys=[{time:0,position:c},{time:at,position:c},{time:duration,position:add(c,[d.ballKind==='moving_touch'?.03:0,loft,(duration-at)*speed])}];
  if(d.ballKind==='moving_touch')keys=[{time:0,position:add(c,[0,.03,1.15])},{time:at,position:c},{time:at+.12,position:[c[0],Math.max(R,c[1]),c[2]+.12]},{time:duration,position:[c[0],R,.50]}];
  if(d.ballKind==='slide'){const travelAt=t=>{const u=t/duration;return [0,0,1.18*smooth((u-.12)/.36)];},globalImpact=add(c,travelAt(at));keys=[];for(let t=0;t<at;t+=1/30)keys.push({time:t,position:sub(globalImpact,travelAt(t))});keys.push({time:at,position:c},{time:duration,position:sub(add(globalImpact,[0,0,1.8]),travelAt(duration))});}
 }
 // Keep one deterministic key per time, preserving contact keys over path guides.
 const sorted=keys.sort((a,b)=>a.time-b.time),result=[];for(const k of sorted){if(result.length&&Math.abs(result.at(-1).time-k.time)<1e-7)result[result.length-1]=k;else result.push(k);}return {radius:R,keys:result};
}
const highArc=d=>d.zone?.row==='high'?.15:.08;
function stabilizeLimbTwist(frames,duration){
 const original=frames.map(forwardPose),chains=[['LeftArm','LeftForeArm','LeftHand'],['RightArm','RightForeArm','RightHand'],['LeftUpLeg','LeftLeg','LeftFoot'],['RightUpLeg','RightLeg','RightFoot']],transported={};
 for(const [upper,lower,end] of chains)for(const [bone,child] of [[upper,lower],[lower,end]]){
  const track=[original[0][bone].rotation];for(let i=1;i<frames.length;i++){const previous=track[i-1],direction=sub(original[i][child].position,original[i][bone].position);track.push(qm(aim(rotate(previous,down),direction),previous));}
  const delta=qm(qi(track.at(-1)),original.at(-1)[bone].rotation);let angle=2*Math.atan2(delta[1],delta[3]);if(angle>Math.PI)angle-=Math.PI*2;if(angle< -Math.PI)angle+=Math.PI*2;
  transported[bone]=track.map((q,i)=>{const a=angle*smooth(frames[i].time/duration)/2;return qm(q,[0,Math.sin(a),0,Math.cos(a)]);});
 }
 for(let i=0;i<frames.length;i++)for(const [upper,lower,end] of chains){const parent=bones.find(b=>b.name===upper).parent,qu=transported[upper][i],ql=transported[lower][i];frames[i].rotations[upper]=qm(qi(original[i][parent].rotation),qu);frames[i].rotations[lower]=qm(qi(qu),ql);frames[i].rotations[end]=qm(qi(ql),original[i][end].rotation);}
}
export function buildMotions(){
 return definitions.map(d=>{
  const events=d.events.filter(e=>!e.supportOnly).map(e=>({...e,position:point(d.sample(e.time),e.bone,e.local)})).sort((a,b)=>a.time-b.time);
  const metadata={id:d.id,label:d.label,role:d.role,asset:d.role==='keeper'?'keeper.glb':'player.glb',duration:d.duration,loop:d.loop,events,supports:d.supports,ball:trajectory(d,events),notes:d.notes,rootMotion:false};
  if(d.zone)metadata.zone=d.zone;if(d.travel)metadata.travel=d.travel;
  const times=[0,d.duration,...Array.from({length:Math.ceil(d.duration*30)},(_,i)=>i/30).filter(t=>t<d.duration),...events.map(e=>e.time),...d.supports.flatMap(s=>[s.start,s.end])];
  const unique=[...new Set(times.map(t=>Math.round(t*1e7)/1e7))].sort((a,b)=>a-b);
  const frames=unique.map(time=>({time,...d.sample(time)}));
  if(d.zone||['slide','cut','pass_long','pass_loft','shot','receive_chest','keeper_throw','block'].includes(d.id))stabilizeLimbTwist(frames,d.duration);
  // Neutral wrists follow the forearm's transported orientation. The hand
  // should not hang vertically when its forearm swings forward or across.
  if(d.role==='field'&&!['slide','block'].includes(d.id))for(const frame of frames){frame.rotations.LeftHand=[...I];frame.rotations.RightHand=[...I];}
  return {metadata,frames,sample:d.sample};
 });
}
export const initial='idle';
export function transitionMap(motions){
 const result=[],field=motions.filter(m=>m.metadata.role==='field'),keeper=motions.filter(m=>m.metadata.role==='keeper');
 const edge=(from,to,trigger,blend=.18,earliest=0,latest)=>result.push({from,to,trigger,blend,earliest,...(motions.find(m=>m.metadata.id===from).metadata.loop?{}:{latest:latest??motions.find(m=>m.metadata.id===from).metadata.duration})});
 for(const {metadata:c} of field){if(c.id!=='idle')edge(c.id,'idle',c.loop?'stop':'finished',c.id==='slide'?.28:.18,c.loop?0:c.duration*.82,c.duration);if(c.id!=='dribble'&&c.id!=='slide')edge(c.id,'dribble','move',.2,c.loop?0:c.duration*.68,c.duration);if(c.id==='idle'||c.id==='dribble'||c.id==='shield')for(const {metadata:target} of field)if(target.id!==c.id&&target.id!=='idle'&&target.id!=='dribble')edge(c.id,target.id,`play:${target.id}`,target.id==='slide'?.22:.16,0,c.duration);}
 for(const {metadata:c} of keeper){if(c.id!=='keeper_ready')edge(c.id,'keeper_ready','finished',.24,c.duration*.87,c.duration);if(c.id==='keeper_ready')for(const {metadata:target} of keeper)if(target.id!==c.id)edge(c.id,target.id,`play:${target.id}`,.18,0,c.duration);}
 return result;
}

export function rebuildBallPaths(motions){for(const motion of motions)motion.metadata.ball=trajectory(definitions.find(d=>d.id===motion.metadata.id),motion.metadata.events);}
