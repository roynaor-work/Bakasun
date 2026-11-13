// SPDX-License-Identifier: CC0-1.0
// Original 120Hz blade-path reconstruction. Existing body meshes and rig retained.
// Input passing states are retained exactly; no failed keyframe is used as a seed.
import {readFileSync,writeFileSync} from 'node:fs';
import {normaliseSoccerClip,sampleCanonical,gaitMetrics,checkGait} from '../../../minigames/athletes-core.mjs';
import {PI,TAU,DEG,clamp,smooth,bell,add,sub,scale,inverse,xyz,yawQ,qrotate,qmul,qslerp,jointWorld,newPose,key,solveLeg,keepStickAboveIce,rounded} from './kinematics.mjs';
const FPS=120,folder=new URL('../',import.meta.url),base=JSON.parse(readFileSync(new URL('../../hockey-v1/clips.json',import.meta.url),'utf8'));
const failed=['skate_push_slow','skate_push_medium','skate_push_fast','skate_glide','skate_crossover_left','skate_crossover_right','skate_stop_left','skate_stop_right','skate_turn_45','skate_turn_90','skate_turn_180','skate_backward','goalie_slide_left','goalie_slide_right','celebrate_3'];
const bladeLocal={heel:[0,-.08,-.0865],toe:[0,-.08,.1985],normal:[0,1,0]};
const idle=role=>sampleCanonical(normaliseSoccerClip(role==='goalie'?'goalie_stance':'ready_1',base.states[role==='goalie'?'goalie_stance':'ready_1']),0);
const derivative=(fn,u,T)=>{const h=.00001,a=Math.max(0,u-h),b=Math.min(1,u+h);return scale(sub(fn(b),fn(a)),1/((b-a)*T));};
function heading(id,u){
 if(id.startsWith('skate_turn_'))return Number(id.split('_').at(-1))*DEG*smooth(u);
 if(id==='celebrate_3')return TAU*smooth((u-.16)/.68);
 return 0;
}
/** Independent requested reference path, integrated from requested velocity. */
function requestedVelocity(id,s,u){
 if(id==='celebrate_3')return [0,0,0];
 if(id.startsWith('goalie_slide'))return [(id.endsWith('left')?1:-1)*s.speedMps,0,0];
 if(id.startsWith('skate_crossover'))return [(id.endsWith('left')?1:-1)*.6,0,Math.sqrt(s.speedMps**2-.36)];
 if(id.startsWith('skate_stop'))return [0,0,s.speedMps*(1-smooth(u))];
 return qrotate(yawQ(heading(id,u)),[0,0,(id==='skate_backward'?-1:1)*s.speedMps]);
}
function rootTrack(id,s){
 const N=Math.round(s.durationSeconds*FPS),out=[{timeSeconds:0,translationMeters:[0,0,0]}];let p=[0,0,0];
 for(let i=1;i<=N;i++){p=add(p,scale(requestedVelocity(id,s,(i-.5)/N),s.durationSeconds/N));out.push({timeSeconds:rounded(s.durationSeconds*i/N),translationMeters:p.map(rounded)});}
 return out;
}
function rootAt(track,u){const x=u*(track.length-1),i=Math.min(track.length-2,Math.floor(x)),v=x-i;return track[i].translationMeters.map((a,k)=>a+(track[i+1].translationMeters[k]-a)*v);}
/** Geometric local ankle paths. A contact starts only after recovery reaches ice. */
function ankleLocal(id,s,u,side){
 const sign=side==='Left'?1:-1,phase=((u+(sign<0?.5:0))%1+1)%1;
 let p=[sign*(s.role==='goalie'?.23:.15),.08,.03];
 if(id.startsWith('skate_push')||id==='skate_backward'){
  const back=id==='skate_backward',extent=id.endsWith('slow')?.14:id.endsWith('fast')?.22:.18,pushing=phase<=.58,v=pushing?phase/.58:(phase-.58)/.42;
  const ext=pushing?smooth(v):1-smooth(v);
  p=[sign*(.13+extent*ext),.08+(pushing?0:.075*bell(v)),.035+(back?1:-1)*.11*ext];
 }else if(id.startsWith('skate_crossover')){
  const dir=id.endsWith('left')?1:-1,recovery=phase<.44,v=recovery?phase/.44:(phase-.44)/.56;
  const cross=recovery?smooth(v):1-smooth(v);
  p=[sign*.18-dir*.32*cross,.08+(recovery?.13*bell(v):0),.03+.14*cross];
 }else if(id.startsWith('skate_turn')){
  p=[sign*(.15+.025*bell(u)),.08,.03];
 }else if(id.startsWith('skate_stop')){
  p=[sign*(.15+.04*bell(u)),.08,.03+sign*.035*bell(u)];
 }else if(id.startsWith('goalie_slide')){
  const dir=id.endsWith('left')?1:-1,trail=sign===-dir,v=clamp((u-.27)/.46),recovery=trail&&u>.27&&u<.73;
  p=[sign*.23+dir*.055*bell(u),.08+(recovery?.055*bell(v):0),.02];
 }else if(id==='celebrate_3'){
  const g=u<.16?smooth((u-.02)/.14):1-smooth((u-.84)/.14);
  p=[sign*.15,.08+(sign<0?.19*g:0),.03];
 }
 return p;
}
function pivotShift(id,u){if(id!=='celebrate_3')return [0,0,0];const pivot=[.15,0,.03];return sub(pivot,qrotate(yawQ(heading(id,u)),pivot));}
function ankleWorld(id,s,u,side,root){return add(add(rootAt(root,u),qrotate(yawQ(heading(id,u)),ankleLocal(id,s,u,side))),pivotShift(id,u));}
function airborne(id,s,u,side){return ankleLocal(id,s,u,side)[1]>.0800000001;}
function supportMode(id){return id.startsWith('skate_stop')?'brake':id==='celebrate_3'?'pivot':'glide';}
function bladeYaw(id,s,u,side,root){
 if(id.startsWith('skate_stop'))return (id.endsWith('left')?1:-1)*PI/2*smooth(u/.48);
 if(id==='celebrate_3')return heading(id,u);
 const v=derivative(x=>ankleWorld(id,s,x,side,root),u,s.durationSeconds);
 let yaw=Math.atan2(v[0],v[2]);
 if(id==='skate_backward')yaw+=PI;
 return yaw;
}
function upper(id,s,u,p){
 const goalie=s.role==='goalie',walk=s.gaitKind==='walk',jog=s.gaitKind==='jog',sprint=s.gaitKind==='sprint';
 const lean=goalie?20:sprint?24:jog?18:s.gaitKind==='run'?22:15;
 p.rot.Spine=xyz(lean*.75);p.rot.Chest=xyz(lean*.25);p.rot.Neck=xyz(-lean*.6);p.rot.Head=xyz(-lean*.4);
 const amplitude=sprint?43:jog?34:s.gaitKind==='run'?39:26;
 for(const side of ['Left','Right']){
  const sign=side==='Left'?1:-1;
  p.rot[side+'Arm']=xyz(-35+sign*amplitude*Math.sin(TAU*u),sign*3,sign*7);
  p.rot[side+'ForeArm']=xyz(-110+sign*7*Math.sin(TAU*u));
  p.rot[side+'Hand']=xyz(0,sign*5);
 }
 if(!s.loop){
  const gate=1-smooth(Math.min(u,1-u)/.15),pose=idle(s.role);
  for(const name of ['Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand'])p.rot[name]=qslerp(p.rot[name],pose.rot[name],gate*.72);
 }
}
function poseAt(id,s,u,root){
 const p=newPose(),yaw=heading(id,u),g=Math.sin(PI*u)**2;
 p.rot.Root=yawQ(yaw);p.hips=[.009*Math.sin(TAU*u),(s.role==='goalie'?-.21:-.14)-.005*Math.cos(2*TAU*u),0];
 if(!s.loop){const b=idle(s.role);p.hips[0]*=g;p.hips[1]=b.hips[1]-(id.startsWith('skate_stop')?.045:id.startsWith('skate_turn')?.018:.009)*g;}
 upper(id,s,u,p);
 if(id==='celebrate_3'){
  const lift=u<.16?smooth((u-.02)/.14):1-smooth((u-.84)/.14),baseIdle=idle('skater');
  p.rot=structuredClone(baseIdle.rot);p.rot.Root=yawQ(yaw);p.hips=[.10*lift,baseIdle.hips[1],0];
  p.rot.LeftArm=qmul(p.rot.LeftArm,xyz(-72*lift));
  p.hips=add(p.hips,qrotate(inverse(yawQ(yaw)),pivotShift(id,u)));
 }
 // FK is in the in-place reference frame; full world blade paths lose only root translation.
 const r=rootAt(root,u);
 for(const side of ['Left','Right'])solveLeg(p,side,sub(ankleWorld(id,s,u,side,root),r),yawQ(bladeYaw(id,s,u,side,root)),yaw);
 keepStickAboveIce(p,yaw);
 return p;
}
function supportsFor(id,s,root){
 const N=Math.round(s.durationSeconds*FPS),supports=[];
 for(const side of ['Left','Right']){
  const sign=side==='Left'?1:-1;
  let intervals=[[0,1]];
  if(id.startsWith('skate_push')||id==='skate_backward')intervals=side==='Left'?[[0,.58]]:[[0,.08],[.5,1]];
  if(id.startsWith('skate_crossover'))intervals=side==='Left'?[[.44,1]]:[[0,.5],[.94,1]];
  if(id.startsWith('goalie_slide')&&sign===-(id.endsWith('left')?1:-1))intervals=[[0,.27],[.73,1]];
  if(id==='celebrate_3'&&side==='Right')intervals=[[0,.02],[.98,1]];
  for(const [a,b] of intervals){
    if(b<=a)continue;
    // These boundaries are analytic geometric lift/land events, never QA-driven subdivisions.
    const window={bone:side+'Foot',start:rounded(a*s.durationSeconds),end:rounded(b*s.durationSeconds),contact:'blade',mode:supportMode(id),timeUnit:'seconds',localPointMeters:[0,-.08,0],bladeSegmentLocalMeters:[bladeLocal.heel,bladeLocal.toe],planeNormalLocal:[0,1,0],icePlaneMeters:0,edge:'flat',allowSlide:true};
    if(window.mode==='brake')window.expectedVelocity=Array.from({length:N+1},(_,j)=>{const u=j/N;return {timeSeconds:rounded(u*s.durationSeconds),velocityMps:derivative(x=>ankleWorld(id,s,x,side,root),u,s.durationSeconds).map(rounded)};});
    supports.push(window);
  }
 }
 return supports;
}
const pack=structuredClone(base);pack.source='Original blade-path reconstruction, source/build-clips.mjs, 2026-11-13; CC0 original model/rig from hockey-v1';pack.fps=FPS;
const measurements=[];
for(const id of failed){
 const old=base.states[id],s={clip:id,labelHe:old.labelHe,role:old.role,group:old.group,durationSeconds:old.durationSeconds,fps:FPS,loop:old.loop,speedMps:id==='celebrate_3'?0:old.speedMps,gaitKind:old.gaitKind,rootMotion:false,contactModel:'blade',ballContacts:[]};
 const intended=rootTrack(id,s),actual=rootTrack(id,s),N=Math.round(s.durationSeconds*FPS);
 s.referenceVelocityMps=requestedVelocity(id,s,0);s.referenceRootMotion=actual;
 s.skating={contactModel:'blade',bladeLocal,allowEdgeRollDegrees:0,referenceRootMotion:intended,endpointHeadingsRadians:{entry:heading(id,0),exit:heading(id,1)},requestedSpeedMps:s.speedMps,model:'in-place FK plus authored root trajectory; planar blade line contact'};
 s.supports=supportsFor(id,s,intended);
 s.events=[{timeSeconds:0,name:'stick_grip',bone:'RightHand',domain:'presentation',labelHe:'אחיזה במקל'},...(id.startsWith('skate_crossover')?[{timeSeconds:0,name:'blade_release',bone:'LeftFoot',domain:'presentation',labelHe:'הרמת הלהב בתחילת החצייה'}]:[]),...s.supports.flatMap(w=>[{timeSeconds:w.start,name:'blade_contact',bone:w.bone,domain:'presentation',labelHe:'מגע הלהב בקרח'},{timeSeconds:w.end,name:'blade_release',bone:w.bone,domain:'presentation',labelHe:'סיום חלון מגע הלהב'}])];
 const times=[...new Set([...Array.from({length:N+1},(_,i)=>i/N),...s.supports.flatMap(w=>[w.start/s.durationSeconds,w.end/s.durationSeconds])])].sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-8);
 s.keyframes=times.map(u=>key(poseAt(id,s,u,intended),u));
 if(s.loop)s.keyframes[s.keyframes.length-1]={...structuredClone(s.keyframes[0]),time:1};
 pack.states[id]=s;
 const m=gaitMetrics(normaliseSoccerClip(id,s,'hockey-v2'),120);measurements.push({id,...m,fails:s.gaitKind?checkGait(m,s.gaitKind):[]});
}
writeFileSync(new URL('clips.json',folder),JSON.stringify(pack,null,1)+'\n');
console.log(JSON.stringify({rebuilt:failed.length,total:Object.keys(pack.states).length,frames:failed.reduce((n,id)=>n+pack.states[id].keyframes.length,0),measurements},null,2));
