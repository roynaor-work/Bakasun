// Original, deterministic tennis phase choreography. CC0-1.0.
// No mocap, athlete likeness, external geometry or downloaded motion.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {add,sub,mul,mix,unit,rotate,axis,qm,qi,aim,slerp,smooth,clamp,fk,solveLimb} from '../runtime/player.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const canonical=JSON.parse(fs.readFileSync(path.join(base,'../motion2/hoops.json'),'utf8')).skeleton;
export const skeleton=canonical;
const identity=[0,0,0,1],Y=[0,1,0];
const specs=[];
const define=(id,labelHe,category,durationSeconds,extra={})=>specs.push({id,labelHe,category,durationSeconds,loop:false,...extra});
define('ready_idle','עמידת היכון','ready',2,{loop:true});
define('split_step','ספליט סטפ','ready',1.2);
for(const [id,label,d] of [['forward','קדימה',[0,0,1]],['backward','אחורה',[0,0,-1]],['left','שמאלה',[1,0,0]],['right','ימינה',[-1,0,0]],['forward_left','קדימה ושמאלה',[1,0,1]],['forward_right','קדימה וימינה',[-1,0,1]],['back_left','אחורה ושמאלה',[1,0,-1]],['back_right','אחורה וימינה',[-1,0,-1]]])define('run_'+id,'ריצה '+label,'locomotion',1.6,{loop:true,dir:unit(d),speed:id==='backward'?1.8:2.6});
define('shuffle_left','צעד צד שמאלה','locomotion',1.6,{loop:true,dir:[1,0,0],speed:1.3});
define('shuffle_right','צעד צד ימינה','locomotion',1.6,{loop:true,dir:[-1,0,0],speed:1.3});
define('brake','האטה ועצירה','locomotion',1.6,{dir:[0,0,1],speed:2.2});
define('change_direction_left','שינוי כיוון שמאלה','locomotion',1.6,{dir:[1,0,0],speed:2});
define('change_direction_right','שינוי כיוון ימינה','locomotion',1.6,{dir:[-1,0,0],speed:2});
define('recover_center','חזרה למרכז','locomotion',2.4,{dir:[1,0,0],speed:1.8});
for(const [hand,hl] of [['forehand','פורהנד'],['backhand','בקהנד']])for(const [spin,sl] of [['flat','שטוח'],['topspin','טופספין'],['slice','סלייס']])for(const [reach,rl] of [['long','ארוך — כדור נמוך'],['short','קצר — מגע מאוחר']])define(`${hand}_${spin}_${reach}`,`${hl} ${sl} · ${rl}`,'groundstroke',1.8,{hand,spin,reach,contactFrame:27,speedBandMps:[12,30],contactContext:reach==='long'?'low ball after bounce, extended preparation':'late ball behind the hitting shoulder, compact preparation',contactStyle:reach==='long'?'long swing path':'compact swing path',twoHanded:hand==='backhand'&&spin!=='slice'});
define('serve_toss','הגשה · הטלת כדור','serve',1.2,{servePhase:'toss',releaseFrame:23});
define('serve_trophy','הגשה · תנוחת גביע','serve',1.2,{servePhase:'trophy'});
define('serve_contact','הגשה · מגע','serve',1.2,{servePhase:'contact',contactFrame:18,speedBandMps:[22,40]});
define('serve_follow_through','הגשה · המשך תנופה','serve',1.2,{servePhase:'follow'});
define('serve_first_full','הגשה ראשונה מלאה','serve',2.8,{servePhase:'full',contactFrame:55,releaseFrame:23,speedBandMps:[22,40]});
define('serve_second_full','הגשה שנייה · קיק','serve',2.8,{servePhase:'full',second:true,contactFrame:55,releaseFrame:23,speedBandMps:[18,34]});
define('volley_forehand','וולי פורהנד','net',1.4,{hand:'forehand',spin:'flat',reach:'short',contactFrame:21,speedBandMps:[3,14]});
define('volley_backhand','וולי בקהנד','net',1.4,{hand:'backhand',spin:'slice',reach:'short',contactFrame:21,speedBandMps:[3,14]});
define('smash','סמאש','net',1.6,{servePhase:'smash',contactFrame:26,speedBandMps:[22,40]});
define('drop_forehand','דרופ שוט פורהנד','net',1.6,{hand:'forehand',spin:'slice',reach:'short',contactFrame:24,speedBandMps:[3,10]});
define('drop_backhand','דרופ שוט בקהנד','net',1.6,{hand:'backhand',spin:'slice',reach:'short',contactFrame:24,speedBandMps:[3,10]});
define('lob','לוב גבוה','net',1.8,{hand:'forehand',spin:'topspin',reach:'long',contactFrame:27,speedBandMps:[7,20]});
for(const [id,label] of [['celebrate_point','חגיגת נקודה'],['disappointed','אכזבה'],['racket_plant','נעיצת מחבט'],['hands_sky','ידיים לשמיים'],['handshake','לחיצת יד'],['fist_pump','אגרוף ניצחון']])define(id,label,'reaction',2.4);
export const definitions=specs;
function blank(t){return {time:t,rotations:Object.fromEntries(canonical.bones.map(b=>[b.name,[...identity]])),hipsOffsetMeters:[0,-.13,0],referenceRootTranslationMeters:[0,0,0]};}
const worldHand=(shaft,roll=0)=>qm(aim(Y,unit(shaft)),axis(Y,roll));
export function rootAt(s,t){if(s.category!=='locomotion')return [0,0,0];if(s.id==='brake'){const u=clamp(t/1.25),d=s.speed*1.25*(u-u*u+u*u*u/3);return [0,0,d];}if(s.id.startsWith('change_direction')){const u=clamp(t/s.durationSeconds);return [s.dir[0]*s.speed*s.durationSeconds*(u*u*u-u*u*u*u/2),0,s.speed*s.durationSeconds*(u-u*u*u+u*u*u*u/2)];}if(s.id==='recover_center'){const u=clamp(t/s.durationSeconds);return mul(s.dir,2.4*(smooth(u)));}return mul(s.dir,s.speed*t);}
function footPlan(s,t,side){const sign=side==='Left'?1:-1,root=rootAt(s,t);if(s.category!=='locomotion'){
 let lift=0;if(s.id==='split_step')lift=.085*Math.max(0,Math.sin(Math.PI*clamp((t-.3)/.35)));
 const z=s.category==='groundstroke'?(side==='Left'?.12:-.10):0;
 return {p:[sign*(s.category==='groundstroke'?.23:.18),.08+lift,z],plant:lift<1e-8};
 }
 const cycle=.8,offset=side==='Left'?0:.5,u=t/cycle+offset,k=Math.floor(u),ph=u-k,stance=s.id.startsWith('shuffle')?.52:.30;
 // Predict the root at mid-stance. A running foot supports only 30% of a
 // stride, with flight between feet; a long walking stance overextends legs.
 const aTime=(k-offset)*cycle,bTime=(k+1-offset)*cycle,a=add(rootAt(s,aTime+stance*cycle/2),[sign*.18,.08,0]),b=add(rootAt(s,bTime+stance*cycle/2),[sign*.18,.08,0]);
 if(ph<stance)return {p:a,plant:true};const h=(ph-stance)/(1-stance);return {p:add(mix(a,b,smooth(h)),[0,.14*Math.sin(Math.PI*h)**2,0]),plant:false};
}
function arms(frame,right,left,rq,lq=identity,poles=null){solveLimb(canonical,frame,'RightArm','RightForeArm','RightHand',right,poles?.right??[-1,-.25,-.3],rq);solveLimb(canonical,frame,'LeftArm','LeftForeArm','LeftHand',left,poles?.left??[1,-.25,-.3],lq);}
function pose(s,t){const u=t/s.durationSeconds,f=blank(u),root=rootAt(s,t);f.referenceRootTranslationMeters=root;
 const isMove=s.category==='locomotion',bounce=isMove?.018*Math.cos(4*Math.PI*t/.8):.006*Math.sin(u*2*Math.PI);
 f.hipsOffsetMeters=[0,-.13+bounce,0];
 if(s.id==='racket_plant')f.hipsOffsetMeters[1]-=.10*smooth(t/.55)*(1-smooth((t-1.8)/.6));
 if(s.id==='split_step')f.hipsOffsetMeters[1]+=.085*Math.max(0,Math.sin(Math.PI*clamp((t-.3)/.35)));
 // Pelvis initiates, then chest; knees and elbows are solved in world space.
 let twist=0;if(s.category==='groundstroke')twist=(s.hand==='forehand'?1:-1)*.40*Math.tanh((t-.9)/.16);
 f.rotations.Hips=axis(Y,twist*.25);f.rotations.Spine=qm(axis([1,0,0],.07),axis(Y,twist*.35));f.rotations.Chest=axis(Y,twist*.40);f.rotations.Neck=axis(Y,-twist*.35);f.rotations.Head=axis(Y,-twist*.30);
 let w=fk(canonical,f),shoulder=w.RightArm.p,ls=w.LeftArm.p;
 let right=add(root,[-.27,1.05,.30]),left=add(root,[.17,1.10,.29]),rq=worldHand([-.15,.83,.40]),lq=identity;
 if(isMove){const swing=.035*Math.sin(2*Math.PI*t/.8);right=add(right,[0,swing,-swing]);left=add(left,[0,-swing,swing]);rq=worldHand([-.23,.92,.18]);}
 if(s.contactFrame!==undefined&&!s.servePhase){
  const tc=s.contactFrame/30,dt=t-tc,back=s.hand==='backhand',sign=back?1:-1,net=s.category==='net',volley=s.id.startsWith('volley'),drop=s.id.startsWith('drop'),lob=s.id==='lob';
  const amp=volley?.52:drop?.65:lob?1.2:s.reach==='short'?1.0:1.50,width=volley?.072:drop?.13:lob?.115:s.reach==='long'?.082:.055;
  const theta=amp*Math.tanh(dt/width)+(s.reach==='short'&&!net?-.24:0),tilt=s.spin==='topspin'?.28*Math.tanh(dt/.14):s.spin==='slice'?-.22*Math.tanh(dt/.16):.02;
  const radial=unit([sign*Math.cos(theta),tilt,Math.sin(theta)]),low=s.reach==='long'&&!net;
  const wrist=add(shoulder,[radial[0]*(low?.31:.43),low?-.34:-.11+radial[1]*.3,radial[2]*(low?.31:.43)]);
  const shaft=unit([radial[0],radial[1]+(low?-.32:.08),radial[2]]),shotq=worldHand(shaft,s.spin==='slice'?.35:0),active=smooth((t-.15)/.30)*(1-smooth((t-(tc+.30))/.45));
  right=mix(right,wrist,active);rq=slerp(rq,shotq,active);
  if(s.twoHanded){left=mix(left,add(wrist,mul(shaft,.075)),active);lq=slerp(identity,shotq,active);}else left=mix(left,add(ls,[back?.32:.28,.0,-.18]),active);
 }
 if(s.servePhase){
  const full=s.servePhase==='full',contact=s.servePhase==='contact'||s.servePhase==='smash'||full,tc=(s.contactFrame??55)/30;
  const trophyRight=add(shoulder,[-.26,.12,-.25]),trophyQ=worldHand([-.12,-.95,-.25]);
  let sr=trophyRight,sq=trophyQ,sl=add(ls,[.13,.39,.12]);
  if(contact){const dt=t-tc,theta=(s.second?1.65:1.8)*Math.tanh(dt/(s.second?.073:.060));const radial=unit([-.12,Math.cos(theta),Math.sin(theta)]);sr=add(shoulder,mul(radial,.49));sq=worldHand(radial,s.second?.28:0);sl=add(ls,[.20,-.32,.12]);
   const active=full?smooth((t-1.15)/.35)*(1-smooth((t-2.25)/.5)):1;sr=mix(trophyRight,sr,active);sq=slerp(trophyQ,sq,active);
  }
  if(s.servePhase==='toss'||full){const tossLift=smooth((t-.10)/.68),lower=smooth((t-1.1)/.45);sl=mix(add(root,[.20,1.02,.27]),add(ls,[.10,.43,.06]),tossLift);if(full)sl=mix(sl,add(ls,[.20,-.32,.12]),lower);}
  if(s.servePhase==='follow'){sr=add(shoulder,[.18,-.28,.28]);sq=worldHand([.35,-.75,.45]);}
  const inOut=full?smooth(t/.35)*(1-smooth((t-2.35)/.45)):s.servePhase==='trophy'?smooth(t/.3):1;
  right=mix(right,sr,inOut);rq=slerp(rq,sq,inOut);left=mix(left,sl,inOut);
  f.rotations.Spine=axis([1,0,0],full?-.12*Math.sin(Math.PI*u):-.08);f.rotations.Chest=axis(Y,-.12);f.rotations.Head=axis([1,0,0],-.25);
 }
 if(s.category==='reaction'){
  const a=smooth(t/.55)*(1-smooth((t-1.8)/.6));
  if(s.id==='hands_sky'||s.id==='celebrate_point'){right=mix(right,add(shoulder,[-.20,.43,.05]),a);left=mix(left,add(ls,[.2,.43,.05]),a);rq=slerp(rq,worldHand([-.3,.94,0]),a);}
  if(s.id==='disappointed'){right=mix(right,add(shoulder,[-.08,-.44,.12]),a);left=mix(left,add(ls,[.08,-.44,.12]),a);rq=slerp(rq,worldHand([-.5,-.80,.2]),a);f.rotations.Head=axis([1,0,0],.45*a);}
  if(s.id==='racket_plant'){right=mix(right,add(root,[-.30,.685,.12]),a);rq=slerp(rq,worldHand([0,-1,0]),a);}
  if(s.id==='handshake'){left=mix(left,add(ls,[.02,-.13,.44+.025*Math.sin(t*12)]),a);f.rotations.Head=axis([1,0,0],.10*a);}
  if(s.id==='fist_pump'){left=mix(left,add(ls,[.20,.05+.07*Math.sin(t*8),.22]),a);f.rotations.Chest=axis(Y,.12*a);}
 }
 // Preserve the ready elbow planes at entry. During preparation an inward
 // component prevents collinearity as the wrists pass below the shoulders;
 // both elbows settle smoothly downward before the strike. Overhead strokes
 // retain their lateral bend poles.
 const groundedStroke=(s.category==='groundstroke'||s.category==='net')&&!s.servePhase;
 const strokePole=rest=>mix(mix(rest,[1,-1,0],smooth(t/.15)),[0,-1,0],smooth((t-.40)/.22));
 arms(f,right,left,rq,lq,groundedStroke?{right:strokePole([-1,-.25,-.3]),left:strokePole([1,-.25,-.3])}:null);
 for(const side of ['Left','Right']){const p=footPlan(s,t,side);solveLimb(canonical,f,side+'UpLeg',side+'Leg',side+'Foot',p.p,[0,0,1]);}
 return f;
}
function round(v){if(typeof v==='number')return Math.round(v*1e9)/1e9;if(Array.isArray(v))return v.map(round);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,round(x)]));return v;}
export function bake(){const states={};for(const s of specs){const n=Math.round(s.durationSeconds*30),keyframes=Array.from({length:n+1},(_,i)=>pose(s,i/30));
 // Sign continuity avoids long quaternion arcs in other glTF players.
 for(let i=1;i<keyframes.length;i++)for(const b of canonical.bones){const a=keyframes[i-1].rotations[b.name],q=keyframes[i].rotations[b.name];if(a.reduce((v,x,k)=>v+x*q[k],0)<0)keyframes[i].rotations[b.name]=mul(q,-1);}
 const events=[];if(s.contactFrame!==undefined){const world=fk(canonical,keyframes[s.contactFrame]);events.push({name:'racket_contact',domain:'presentation',frame:s.contactFrame,atSeconds:s.contactFrame/30,time:s.contactFrame/n,node:'RacketHead',localPointMeters:[0,0,0],worldPointMeters:world.RacketHead.p});}
 if(s.id==='racket_plant'){const frame=30,world=fk(canonical,keyframes[frame]),local=[0,.685,0];events.push({name:'racket_ground_contact',domain:'presentation',frame,atSeconds:frame/30,time:frame/n,node:'Racket',localPointMeters:local,worldPointMeters:add(world.Racket.p,rotate(world.Racket.q,local))});}
 if(s.releaseFrame!==undefined){const world=fk(canonical,keyframes[s.releaseFrame]);events.push({name:'ball_release',domain:'presentation',frame:s.releaseFrame,atSeconds:s.releaseFrame/30,time:s.releaseFrame/n,node:'LeftHand',localPointMeters:[0,0,0],worldPointMeters:world.LeftHand.p});}
 const footPlants=[];for(const side of ['Left','Right']){let start=null;for(let i=0;i<=n+1;i++){const planted=i<=n&&footPlan(s,i/30,side).plant;if(planted&&start===null)start=i;if(!planted&&start!==null){if(i-start>=2){const world=fk(canonical,keyframes[start]);footPlants.push({bone:side+'Foot',startFrame:start,endFrame:i-1,localPointMeters:[0,-.08,0],anchorWorldMeters:add(world[side+'Foot'].p,rotate(world[side+'Foot'].q,[0,-.08,0]))});}start=null;}}}
 const ballTrajectory=[];const release=events.find(e=>e.name==='ball_release'),hit=events.find(e=>e.name==='racket_contact');
 if(release){const tr=release.atSeconds,tc=hit?.atSeconds??1.85,p0=release.worldPointMeters,p1=hit?.worldPointMeters??add(p0,[-.3,.8,.15]),dt=tc-tr,gravity=9.81,v=mul(add(sub(p1,p0),[0,.5*gravity*dt*dt,0]),1/dt);for(let i=0;i<=n;i++){let p;if(i/30<=tr)p=fk(canonical,keyframes[i]).LeftHand.p;else{const d=i/30-tr;p=add(p0,add(mul(v,d),[0,-.5*gravity*d*d,0]));if(hit&&i>s.contactFrame)p=add(p1,mul([0,2,22],i/30-tc));}ballTrajectory.push({frame:i,positionMeters:p});}}
 else if(hit){for(let i=0;i<=n;i++){const d=i/30-hit.atSeconds;const velocity=d<=0?[0,-.8,-7]:[0,s.spin==='topspin'?1:3,s.id.startsWith('drop')?5:s.id==='lob'?8:20];ballTrajectory.push({frame:i,positionMeters:add(hit.worldPointMeters,mul(velocity,d))});}}
 states[s.id]=round({...s,fps:30,rootMotion:true,rootMotionMode:'baked-world-translation; do not apply twice',keyframes,events,footPlants,ballTrajectory,contactApplicability:events.length?'explicit applicable events only':'no ball strike or toss in this clip',equipmentContacts:[{node:'Racket',parent:'RightHand',localGripPointMeters:[0,0,0],startFrame:0,endFrame:n}],notes:s.category==='groundstroke'?'Long/short refers to preparation and swing path, not prolonged ball/string contact. Ball/string contact is an instantaneous event.':undefined});
 }return {schemaVersion:1,kind:'authored-skeletal-motion',game:'tennis',fps:30,authorship:{method:'Original procedural tennis phase choreography and analytic two-bone IK, baked at 30 Hz; no motion capture.',license:'CC0-1.0'},skeleton:canonical,states};}
if(process.argv[1]===fileURLToPath(import.meta.url)){const data=bake();fs.writeFileSync(path.join(base,'runtime/motions.json'),JSON.stringify(data));console.log(`Baked ${Object.keys(data.states).length} tennis clips at 30 Hz.`);}
