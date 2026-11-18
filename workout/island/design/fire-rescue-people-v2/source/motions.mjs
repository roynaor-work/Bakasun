// Original authored rescue motions, CC0-1.0. Canonical metres, +Y up, +Z front.
import * as T from '../../../vendor/three.module.js';
import fs from 'node:fs';
const skeleton=JSON.parse(fs.readFileSync(new URL('../../motion2/soccer.json',import.meta.url))).skeleton;
export {skeleton};
const V=a=>new T.Vector3(...a), Q=(x=0,y=0,z=0)=>new T.Quaternion().setFromEuler(new T.Euler(x,y,z,'XYZ'));
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=v=>{v=clamp(v);return v*v*v*(10+v*(-15+6*v));};
const envelope=(t,d,r=.8)=>smooth(t/r)*smooth((d-t)/r);
const names=skeleton.bones.map(b=>b.name);
export const labels={ready:'מנוחת מעבר',panic_stand:'בהלה בעמידה',cough:'שיעול',wave_help:'נפנוף לעזרה',sit_floor:'ישיבה על הרצפה',carried_shoulder:'נשיאה על הכתף',walk_happy:'הליכה בחוץ בשמחה',hose:'כיבוי בזרנוק',extinguisher:'כיבוי במטף',rescue_carry:'חילוץ בנשיאה',signal_clear:'סימון פנוי',idle:'עמידה'};
function fk(p){
 const out={};for(const b of skeleton.bones){const parent=b.parent?out[b.parent]:{p:V([0,0,0]),q:Q()};const tr=p.tr[b.name]??b.restTranslationMeters;
 out[b.name]={p:V(tr).applyQuaternion(parent.q).add(parent.p),q:parent.q.clone().multiply(p.q[b.name])};}return out;
}
function base(baby){const p={q:Object.fromEntries(names.map(n=>[n,Q()])),tr:{Root:[0,0,0],Hips:[0,.845,0]}};
 for(const s of ['Left','Right']){const sign=s==='Left'?1:-1;p.q[s+'Arm']=Q(.015,0,sign*.11);p.q[s+'ForeArm']=Q(-.12);}
 if(baby){p.tr.Hips=[0,1.03,-.02];p.q.Spine=Q(-.14);p.q.Chest=Q(-.08);for(const s of ['Left','Right']){p.q[s+'UpLeg']=Q(-1.35);p.q[s+'Leg']=Q(1.15);p.q[s+'Foot']=Q(.2);}}
 else legs(p,{Left:[.1,.08,0],Right:[-.1,.08,0]});return p;
}
function legs(p,targets){
 for(const side of ['Left','Right']){const sign=side==='Left'?1:-1;const h=p.tr.Hips??[0,.845,0];const f=targets[side];
 const dy=f[1]-h[1],dz=f[2]-h[2],a=.41,b=.37,d=Math.min(a+b-.00001,Math.hypot(dy,dz));
 const upper=Math.atan2(-dz,-dy)-Math.acos(clamp((a*a+d*d-b*b)/(2*a*d),-1,1));
 const knee=Math.PI-Math.acos(clamp((a*a+b*b-d*d)/(2*a*b),-1,1));
 p.q[side+'UpLeg']=Q(upper,0,0);p.q[side+'Leg']=Q(knee);p.q[side+'Foot']=Q(-upper-knee);
 }
}
function arm(p,side,target,pole){
 const world=fk(p),shoulder=world[side+'Arm'].p,parent=world.Chest.q;
 const delta=V(target).sub(shoulder),a=.27,b=.24,d=clamp(delta.length(),.04,a+b-.001),dir=delta.clone().normalize();
 const mid=(a*a+d*d-b*b)/(2*d),height=Math.sqrt(Math.max(0,a*a-mid*mid));
 const bend=V(pole).sub(shoulder);bend.addScaledVector(dir,-bend.dot(dir)).normalize();
 const elbow=shoulder.clone().addScaledVector(dir,mid).addScaledVector(bend,height);
 const uq=new T.Quaternion().setFromUnitVectors(V([0,-1,0]),elbow.clone().sub(shoulder).normalize());
 const lq=new T.Quaternion().setFromUnitVectors(V([0,-1,0]),V(target).sub(elbow).normalize());
 p.q[side+'Arm']=parent.clone().invert().multiply(uq);p.q[side+'ForeArm']=uq.clone().invert().multiply(lq);p.q[side+'Hand']=Q();
}
function wristWorld(p,side,worldQ){p.q[side+'Hand']=fk(p)[side+'ForeArm'].q.clone().invert().multiply(worldQ);}
function blend(a,b,w){return {q:Object.fromEntries(names.map(n=>[n,a.q[n].clone().slerp(b.q[n],w)])),tr:Object.fromEntries(['Root','Hips'].map(n=>[n,(a.tr[n]??skeleton.bones.find(b=>b.name===n).restTranslationMeters).map((v,i)=>v+(b.tr[n][i]-v)*w)]))};}
function walkPlan(t){
 const d=6, speed=.36;
 // Integral of a raised-cosine velocity ramp, then constant speed, then brake.
 const F=u=>u<=0?0:u>=.7?u-.35:u/2-.7/(2*Math.PI)*Math.sin(Math.PI*u/.7);
 const z=speed*(F(t-.6)-F(t-4.7));
 return {z,d};
}
const steps={Left:[[.7,1.3],[1.9,2.5],[3.1,3.7],[4.3,4.9]],Right:[[1.3,1.9],[2.5,3.1],[3.7,4.3],[4.9,5.5]]};
function footWalk(side,t){let z=0,y=.08;for(const [a,b]of steps[side]){const land=b>=4.9?walkPlan(6).z:walkPlan(b+.28).z;if(t>=b)z=land;else if(t>=a){const u=(t-a)/(b-a);z+=(land-z)*smooth(u);y+=.09*Math.sin(Math.PI*u)**2;break;}else break;}return [side==='Left'?.1:-.1,y,z];}
function supportsWalk(d){const result=[];for(const side of ['Left','Right']){let last=0;for(const [a,b]of steps[side]){result.push({bone:side+'Foot',start:last,end:a,local:[0,-.08,0]});last=b;}result.push({bone:side+'Foot',start:last,end:d,local:[0,-.08,0]});}return result;}
export function createClips(raw){
 const baby=raw.id==='baby-stroller',fire=raw.id.includes('firefighter')||raw.id==='captain',scale=raw.metadata.scale??1;
 const specs=fire?[['idle',3.2,true],['hose',4.8,false],['extinguisher',4.8,false],['rescue_carry',5.6,false],['signal_clear',4,false]]:
 [['ready',2,true],['panic_stand',3.2,true],['cough',4,false],['wave_help',4.8,false],['sit_floor',5.6,false],['carried_shoulder',5.6,false],['walk_happy',6,false]];
 return specs.map(([name,duration,loop])=>{
 const count=Math.round(duration*30)+1,frames=[];
 for(let i=0;i<count;i++){const t=i/30,phase=t*Math.PI*2,neutral=base(baby),p=base(baby),stateAction=['carried_shoulder','sit_floor','rescue_carry'].includes(name),w=envelope(stateAction?t-.3:t,stateAction?duration-.6:duration,stateAction?1.2:.8);
 if(name==='carried_shoulder'){neutral.tr.Root=[0,0,.70/scale];p.tr.Root=[0,0,.70/scale];}
 const breathing=Math.sin(phase/3.2)*.009;
 p.q.Spine=Q((baby?-.14:0)+breathing);p.q.Chest=Q((baby?-.08:0)+breathing*.45);
 if(name==='panic_stand'){
 p.q.Spine=Q(.10+breathing);p.q.Head=Q(-.09,.12*Math.sin(phase/3.2));
 for(const side of ['Left','Right']){const s=side==='Left'?1:-1;arm(p,side,[s*.235,1.22+(baby?.20:0),.21],[s*.40,1.02,.15]);}
 }else if(name==='cough'){
 const pulse=(Math.sin(phase*1.15)*.5+.5)**6;p.q.Spine=Q((baby?-.14:0)+.13+pulse*.09);p.q.Head=Q(.12+pulse*.06);
 arm(p,'Right',[-.04,baby?1.53:1.39,.22],[-.32,1.06,.18]);arm(p,'Left',[.14,baby?1.16:1.02,.20],[.34,1.02,.15]);
 }else if(name==='wave_help'){
 const wave=Math.sin(phase*.85);arm(p,'Left',[.20+.07*wave,baby?1.79:1.72,.06],[.43,1.52,.05]);
 arm(p,'Right',[-.25,baby?1.36:1.14,.18],[-.42,1.08,.12]);p.q.LeftHand=Q(0,0,.28*wave);p.q.Head=Q(-.07,.06*Math.sin(phase*.4));
 }else if(name==='sit_floor'){
 const offset=baby?1.8:0;p.tr.Hips=[0,.112,baby?offset:-.07];p.q.Spine=Q(.14);p.q.Chest=Q(.06);legs(p,{Left:[.1,.08,.63+offset],Right:[-.1,.08,.60+offset]});
 arm(p,'Left',[.28,.50,.12+offset],[.40,.65,offset]);arm(p,'Right',[-.28,.50,.12+offset],[-.40,.65,offset]);
 }else if(name==='carried_shoulder'){
 // Pelvis rests over rescuer's left shoulder; limbs hang on opposite sides.
 p.tr.Hips=[.20/scale,1.44/scale,-.68/scale];p.q.Hips=Q(-1.85);p.q.Spine=Q(-.35);p.q.Chest=Q(-.20);p.q.Head=Q(.12);
 for(const side of ['Left','Right']){const s=side==='Left'?1:-1;p.q[side+'UpLeg']=Q(.55,0,s*.10);p.q[side+'Leg']=Q(.72);p.q[side+'Foot']=Q(-.18);p.q[side+'Arm']=Q(1.25,0,s*.12);p.q[side+'ForeArm']=Q(-.32);}
 }else if(name==='walk_happy'&&!baby){
 const {z}=walkPlan(t);p.tr.Root=[0,0,z];neutral.tr.Root=[0,0,z];p.tr.Hips=[0,.829+.007*Math.sin(phase/1.2)**2,0];
 const targets=Object.fromEntries(['Left','Right'].map(s=>{const f=footWalk(s,t);return[s,[f[0],f[1],f[2]-z]];}));legs(p,targets);
 p.q.LeftArm=Q(.27*Math.sin(phase/1.2),0,.12);p.q.RightArm=Q(-.27*Math.sin(phase/1.2),0,-.12);p.q.Head=Q(-.05,.025*Math.sin(phase/1.2));
 }else if(name==='walk_happy'&&baby){
 // Push the actual stroller; feet remain supported by its footrest.
 const {z}=walkPlan(t);p.tr.Root=[0,0,z];neutral.tr.Root=[0,0,z];p.q.Head=Q(-.05,.07*Math.sin(phase/3));p.q.LeftArm=Q(-.6,0,.45);p.q.RightArm=Q(-.6,0,-.45);
 }else if(name==='hose'){
 p.q.Spine=Q(.09);p.q.Chest=Q(0,.06*Math.sin(phase/3));
 const aim=Q(-Math.PI/2);arm(p,'Right',[.04,1.16,.30],[-.40,1.08,.12]);wristWorld(p,'Right',aim);
 const grip=fk(p).RightHand.p.clone().add(V([-.045,-.16,.03]).applyQuaternion(aim));
 const leftTarget=grip.sub(V([.048,-.052,.015]).applyQuaternion(aim));arm(p,'Left',leftTarget.toArray(),[.42,1.08,.13]);wristWorld(p,'Left',aim);
 }else if(name==='extinguisher'){
 p.q.Spine=Q(.07);p.q.Chest=Q(0,.09*Math.sin(phase/3));arm(p,'Left',[.08,1.08,.25],[.39,1.10,.12]);wristWorld(p,'Left',Q());arm(p,'Right',[.173,1.132,.285],[-.39,1.07,.13]);wristWorld(p,'Right',Q());
 }else if(name==='signal_clear'){
 arm(p,'Left',[.30,1.62,.07],[.48,1.39,.12]);p.q.LeftHand=Q(0,0,-.25);arm(p,'Right',[-.24,1.15,.22],[-.4,1.05,.1]);p.q.Head=Q(0,.15*Math.sin(phase/4));
 }else if(name==='rescue_carry'){
 p.tr.Hips=[0,.82,0];legs(p,{Left:[.1,.08,0],Right:[-.1,.08,0]});
 arm(p,'Left',[.31,1.16,.20],[.40,1.0,.09]);arm(p,'Right',[.12,1.25,.28],[-.35,1.07,.24]);p.q.Spine=Q(.035);
 }
 let pose=blend(neutral,p,name==='ready'||name==='idle'?.32*Math.sin(Math.PI*t/duration)**2:w);
 // In walking, the support feet are solved after blending, so their anchors stay exact.
 if(name==='walk_happy'&&!baby){const z=walkPlan(t).z;const targets=Object.fromEntries(['Left','Right'].map(s=>{const f=footWalk(s,t);return[s,[f[0],f[1],f[2]-z]];}));legs(pose,targets);}
 if(name==='sit_floor'){
 const initial=fk(neutral),offset=baby?1.8:0,targets={};for(const side of ['Left','Right']){const f=baby?initial[side+'Foot'].p.toArray():[side==='Left'?.1:-.1,.08,0],end=[side==='Left'?.1:-.1,.08,offset+(side==='Left'?.63:.60)];targets[side]=f.map((v,i)=>v+(end[i]-v)*w);}legs(pose,targets);
 }
 if((name==='carried_shoulder'||name==='sit_floor')&&!baby&&w<.000001)legs(pose,{Left:[.1,.08,0],Right:[-.1,.08,0]});
 frames.push({t,rotations:names.map(n=>pose.q[n].normalize().toArray()),root:pose.tr.Root,hips:pose.tr.Hips});
 }
 let supports;
 if(name==='walk_happy'&&!baby)supports=supportsWalk(duration);
 else if(name==='carried_shoulder'||name==='sit_floor')supports=['Left','Right'].flatMap(s=>[{bone:s+'Foot',start:0,end:.12,local:[0,-.08,0]},{bone:s+'Foot',start:duration-.12,end:duration,local:[0,-.08,0]}]);
 else supports=['Left','Right'].map(s=>({bone:s+'Foot',start:0,end:duration,local:[0,-.08,0]}));
 if(name==='sit_floor'&&baby)for(const side of ['Left','Right'])supports.push({bone:side+'Foot',start:1.6,end:duration-1.6,local:[0,-.08,0],surfaceY:0});
 return {name,label:labels[name],duration,loop,frames,qa:{idleClip:fire?'idle':'ready',supports,soleLocal:[0,-.08,0],floorY:0,loop,locomotion:name==='walk_happy'&&!baby,checkHingeDirection:true,coordinateSpace:baby?'Moving stroller Root frame; footrest supports, unchanged vertical ground plane':'GLB world',...(baby?{supportFrame:'Root',supportSurfaceY:.495*scale}:{}),supportKind:baby?'stroller footrest':'ground',samplingHz:30},equipment:name==='hose'?['hose']:name==='extinguisher'?['extinguisher']:[],rootMotion:name==='walk_happy',pair:name==='carried_shoulder'||name==='rescue_carry'?{otherClip:name==='carried_shoulder'?'rescue_carry':'carried_shoulder',position:[0,0,0],rotationY:0,phaseSynchronized:true}:undefined};
 });
}
