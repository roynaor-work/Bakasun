/** Original v10 contact-first choreography. CC0-1.0.
 * Native channels are in place. referenceRootMotion is a measurement/preview
 * trajectory only, never an animated Root or a command to the game controller.
 */
import fs from 'node:fs/promises';
import {bones,I,add,sub,mul,mix,clamp,smooth,curve,rotate,euler,qm,qi,slerp,fk,point,solve} from './rig.mjs';
const base=new URL('../',import.meta.url);
const references=JSON.parse(await fs.readFile(new URL('verification/reference.json',base),'utf8'));
const FPS=30,sole=[0,-.08,0],turn=(p,a)=>rotate(euler(0,a,0),p),clone=structuredClone;
function ref(id,t=0){const r=references.clips[id],x=((t%r.duration)+r.duration)%r.duration*FPS,i=Math.min(r.frames.length-2,Math.floor(x)),u=x-i,a=r.frames[i],b=r.frames[i+1];return {hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(n=>[n.name,slerp(a.rotations[n.name],b.rotations[n.name],u)]))};}
function blend(a,b,u){return {hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(n=>[n.name,slerp(a.rotations[n.name],b.rotations[n.name],u)]))};}
function samplePath(samples,t){const x=clamp(t*FPS,0,samples.length-1),i=Math.min(samples.length-2,Math.floor(x)),u=x-i;return {position:mix(samples[i].position,samples[i+1].position,u),yaw:mix(samples[i].yaw,samples[i+1].yaw,u)};}
function path(N,{moving=false,angle=0,minimum=1.7,brake=false,lateral=0}={}){
 const D=N/FPS,positions=[[0,0,0]],heading=t=>angle*smooth((t-2/FPS)/(D-4/FPS));
 const speed=t=>!moving?0:brake?curve([[0,4.5],[.14,4.5],[.36,0],[.62,0],[.86,4.5],[1,4.5]],t/D):t<=2/FPS||t>=D-2/FPS?4.5:curve([[2/FPS,4.5],[Math.min(D/2,4/FPS),minimum],[D-4/FPS,minimum],[D-2/FPS,4.5]],t);
 // Midpoint integration at 3000Hz. Endpoint 30Hz samples are the sole reference.
 const steps=N*100,dt=D/steps;for(let i=1;i<=steps;i++){const t=(i-.5)*dt,v=speed(t),a=heading(t)*Math.PI/180;positions.push(add(positions.at(-1),[Math.sin(a)*v*dt,0,Math.cos(a)*v*dt]));}
 return Array.from({length:N+1},(_,i)=>({time:i/FPS,position:add(positions[i*100],[lateral*Math.sin(Math.PI*clamp((i-2)/(N-4)))**2,0,0]),yaw:heading(i/FPS)}));
}
function worldPose(p,r){const w=fk(p);return Object.fromEntries(Object.entries(w).map(([n,b])=>[n,{position:add(r.position,turn(b.position,r.yaw)),rotation:qm(euler(0,r.yaw,0),b.rotation)}]));}
function support(bone,a,b,anchor,heading=0){return {bone,start:a/FPS,end:b/FPS,anchor:[anchor[0],0,anchor[2]],heading};}
function rootAt(samples,f){return samples[Math.max(0,Math.min(samples.length-1,Math.round(f)))];}
function makeSupports(d,samples){
 const {N,moving,quick,kind,sign=1}=d,D=N/FPS,start=ref(moving?'run':'idle_relaxed',0),end=ref(moving?'run':'idle_relaxed',moving?2/FPS:0),initial=worldPose(start,samples[0]),final=worldPose(end,samples[N]);
 const initialAnchor=bone=>add(initial[bone].position,rotate(initial[bone].rotation,sole));
 const finalAnchor=bone=>add(final[bone].position,rotate(final[bone].rotation,sole));
 const mid=(bone,a,b,lead=.10)=>{const r=rootAt(samples,(a+b)/2),s=bone==='LeftFoot'?1:-1;return support(bone,a,b,add(r.position,turn([s*.135,0,lead],r.yaw)),r.yaw);};
 if(!moving){
  if(kind==='jockey'||kind==='shield')return [support('LeftFoot',0,3,initialAnchor('LeftFoot')),mid('RightFoot',5,10),mid('LeftFoot',13,N-8),support('RightFoot',N-5,N,finalAnchor('RightFoot')),support('LeftFoot',N-2,N,finalAnchor('LeftFoot'))];
  const result=[support('LeftFoot',0,N,initialAnchor('LeftFoot'))];
  if(kind==='roll'||kind==='chest')result.push(support('RightFoot',0,N,initialAnchor('RightFoot')));
  else {result.push(support('RightFoot',0,2,initialAnchor('RightFoot')));if(!quick)result.push(support('RightFoot',N-3,N,finalAnchor('RightFoot')));}
  return result;
 }
 let result=[support('LeftFoot',0,kind==='cut'&&sign<0?4:2,initialAnchor('LeftFoot'))];
 if(kind==='cut'){
  if(sign>0)result.push(mid('RightFoot',4,6,.02));else result.push(mid('RightFoot',6,8,.02));
  if(N>=16){result.push(mid('LeftFoot',9,10,.02));result.push(mid('RightFoot',12,N-4,.02));}
  else if(N===14)result.push(mid('RightFoot',9,10,.02));
  result.push(support('LeftFoot',N-2,N,finalAnchor('LeftFoot'),samples[N].yaw));
 }else if(quick){
  result.push(mid('RightFoot',4,5,.12));result.push(mid('LeftFoot',7,N,.08));
 }else if(kind==='brake'){
  for(const [bone,a,b] of [['RightFoot',6,9],['LeftFoot',13,27],['RightFoot',29,33],['LeftFoot',37,40],['RightFoot',42,44]])result.push(mid(bone,a,b,.10));
  result.push(support('LeftFoot',N-2,N,finalAnchor('LeftFoot')));
 }else{
  for(let a=5,k=0;a<N-5;a+=6,k++)result.push(mid(k%2?'LeftFoot':'RightFoot',a,Math.min(a+3,N-4),.08));
  result.push(support('LeftFoot',N-2,N,finalAnchor('LeftFoot'),samples[N].yaw));
 }
 return result.sort((a,b)=>a.start-b.start);
}
function footAt(d,bone,t,samples,supports){
 const D=d.N/FPS,r=samplePath(samples,t),moving=d.moving,entry=ref(moving?'run':'idle_relaxed',0),exit=ref(moving?'run':'idle_relaxed',moving?2/FPS:0);
 const entries=[0,1,2].map(i=>{const p=worldPose(ref(moving?'run':'idle_relaxed',i/FPS),samples[i])[bone];return {time:i/FPS,p:p.position,q:p.rotation};});
 const exits=d.quick?[]:[0,1,2].map(i=>{const f=d.N-2+i,p=worldPose(ref(moving?'run':'idle_relaxed',moving?i/FPS:0),samples[f])[bone];return {time:f/FPS,p:p.position,q:p.rotation};});
 const windows=supports.filter(s=>s.bone===bone),active=windows.find(s=>t>=s.start-1e-8&&t<=s.end+1e-8);
 if(active)return {p:sub(active.anchor,rotate(euler(0,active.heading,0),sole)),q:euler(0,active.heading,0)};
 let knots=[...entries,...exits];for(const s of windows){const q=euler(0,s.heading,0),p=sub(s.anchor,rotate(q,sole));knots.push({time:s.start,p,q},{time:s.end,p,q});}
 // Quick first touches finish in the cushioning pose, rather than returning
 // to idle. The moving left support remains active through the receive.
 if(d.quick&&bone==='RightFoot'){
  const c=d.contactFrame/FPS,rr=samplePath(samples,c),height=d.kind==='thigh'?.34:d.kind==='chest'?.12:.10;
  const side=d.kind==='outside'?-.20:d.kind==='inside'?-.04:-.12;
  const contact=add(rr.position,turn([side,height,d.kind==='inside'?.42:.26],rr.yaw));
  knots=knots.filter(k=>k.time<c-2/FPS);knots.push({time:c,p:contact,q:euler(d.kind==='thigh'?25:0,rr.yaw+(d.kind==='inside'?28:d.kind==='outside'?-24:0),0)},
   {time:D,p:add(contact,turn([0,.015,-.05],rr.yaw)),q:euler(d.kind==='thigh'?30:0,rr.yaw,0)});
 }else if((d.kind==='short_pass'||d.kind==='long_kick')&&bone==='RightFoot'){
  const c=d.contactFrame/FPS,rr=samplePath(samples,c);knots.push({time:c-4/FPS,p:add(rr.position,[-.13,.22,-.28]),q:euler(-30)},
   {time:c,p:add(rr.position,[-.10,d.kind==='long_kick'?.15:.10,.30]),q:euler(-12)},
   {time:c+3/FPS,p:add(rr.position,[-.10,d.kind==='long_kick'?.48:.17,.45]),q:euler(-35)});
 }
 knots.sort((a,b)=>a.time-b.time);
 const prev=[...knots].reverse().find(k=>k.time<=t+1e-9)??knots[0],next=knots.find(k=>k.time>t+1e-9)??prev;
 const u=clamp((t-prev.time)/(next.time-prev.time||1)),p=mix(prev.p,next.p,smooth(u));
 if(next.time-prev.time>1.5/FPS)p[1]+=(d.kind==='cut'?.12:.09)*Math.sin(Math.PI*u)**2;
 return {p,q:slerp(prev.q,next.q,smooth(u))};
}
function lowArms(p){p.rotations.LeftArm=euler(0,0,12);p.rotations.RightArm=euler(0,0,-12);p.rotations.LeftForeArm=euler(-40);p.rotations.RightForeArm=euler(-40);return p;}
function clearSwing(frames,d,supports){
 const N=d.N,locals=[sole,[0,-.08,.12],[0,-.08,-.06]];let maximum=0;
 const editable=(f,bone)=>f>2&&(d.quick||f<N-2)&&!supports.some(s=>s.bone===bone&&f/FPS>=s.start-1e-9&&f/FPS<=s.end+1e-9);
 // Clearance belongs in authored poses. No foot lifting or IK runs in preview.
 // Protect the two exact v9 boundary intervals, including their inherited sole
 // interpolation error, rather than quietly altering the reference contract.
 for(let pass=0;pass<4;pass++)for(let i=2;i<N-2;i++)for(const bone of ['LeftFoot','RightFoot']){
  const t=(i+.5)/FPS;if(supports.some(s=>s.bone===bone&&t>=s.start&&t<=s.end))continue;
  const p=blend(frames[i],frames[i+1],.5),minimum=Math.min(...locals.map(local=>point(p,bone,local)[1]));if(minimum>=.002)continue;
  const candidates=[i,i+1].filter(f=>editable(f,bone));if(!candidates.length)continue;
  const correction=(.002-minimum)*2/candidates.length;maximum=Math.max(maximum,correction);
  for(const f of candidates){const pose=frames[f],w=fk(pose)[bone],side=bone.slice(0,-4),target=add(w.position,[0,correction,0]);solve(pose,side+'UpLeg',side+'Leg',bone,target,rotate(w.rotation,[0,0,1]),w.rotation);}
 }
 return maximum;
}
function sampleAction(d,t,samples,supports){
 const D=d.N/FPS,f=t*FPS,moving=d.moving,home=moving?'run':'idle_relaxed';
 if(f<=2+1e-8)return ref(home,t);
 if(!d.quick&&f>=d.N-2-1e-8)return ref(home,moving?(f-(d.N-2))/FPS:0);
 const r=samplePath(samples,t),u=t/D,load=Math.sin(Math.PI*u),fade=smooth((f-2)/2)*(d.quick?1:smooth((d.N-2-f)/2));
 const p=ref(home,moving?t:0);p.hips=[0,(moving?.72:.785)-.045*load,0];
 p.rotations.Hips=euler(moving?7:1,0,d.kind==='cut'?-d.sign*8*load:0);p.rotations.Spine=euler(moving?4:0,0,0);p.rotations.Chest=euler(moving?3:0,d.kind==='shield'?d.sign*22*load:0,0);
 p.rotations.LeftForeArm=euler(-100);p.rotations.RightForeArm=euler(-100);
 if(!moving)lowArms(p);
 if(d.quick){
  const envelope=smooth((f-2)/6);p.hips[1]=moving?.72:d.kind==='inside'?.735:.775;
  if(d.kind==='chest'){p.rotations.Spine=euler(-10*envelope);p.rotations.Chest=euler(-12*envelope);p.rotations.Head=euler(8*envelope);}
  if(d.kind==='thigh'){p.rotations.Hips=euler(5);p.hips[1]-=.015;}
 }
 if(d.kind==='roll'){
  const v=Math.sin(Math.PI*u)**2;p.hips=[0,.785-.23*v,.015*v];p.rotations.Hips=euler(17*v);p.rotations.Spine=euler(18*v);p.rotations.Chest=euler(10*v);
  const hand=curve([[0,[-.24,.90,.12]],[.30,[-.34,.66,-.14]],[.55,[-.31,.38,.34]],[.72,[-.28,.48,.47]],[1,[-.24,.90,.12]]],u);
  solve(p,'RightArm','RightForeArm','RightHand',hand,[.1,-1,-.3],euler(-30));
  solve(p,'LeftArm','LeftForeArm','LeftHand',[.25,.86,.18],[.1,-1,-.4],I);
 }
 if(d.kind==='short_pass'||d.kind==='long_kick'){
  p.hips[1]=.73-.035*load;p.rotations.Hips=euler(-5*load);p.rotations.Chest=euler(d.kind==='long_kick'?-12*load:5*load);
  p.rotations.LeftArm=euler(12,0,18*load);p.rotations.RightArm=euler(-15,0,-20*load);
 }
 if(d.kind==='shield'){p.rotations.Chest=euler(6,d.sign*18*load,0);p.rotations[d.sign>0?'LeftArm':'RightArm']=euler(0,0,d.sign*48*load);p.rotations[d.sign>0?'LeftForeArm':'RightForeArm']=euler(-65);}
 if(d.kind==='jockey'){p.hips[1]=.70;p.rotations.Hips=euler(7);p.rotations.LeftArm=euler(10,0,25);p.rotations.RightArm=euler(10,0,-25);p.rotations.LeftForeArm=euler(-65);p.rotations.RightForeArm=euler(-65);}
 if(d.kind==='brake'){p.hips[1]=curve([[0,.748],[.35,.66],[.6,.70],[1,.748]],u);p.rotations.Hips=euler(curve([[0,6],[.3,-9],[.6,-5],[.8,13],[1,6]],u));}
 for(const bone of ['LeftFoot','RightFoot']){
  const target=footAt(d,bone,t,samples,supports),side=bone.slice(0,-4),local=turn(sub(target.p,r.position),-r.yaw),orientation=qm(euler(0,-r.yaw,0),target.q);
  // Knee pole follows the planted boot rather than twisting with the root.
  const pole=rotate(orientation,[0,0,1]);solve(p,side+'UpLeg',side+'Leg',bone,local,pole,orientation);
 }
 const baseline=ref(home,t);return blend(baseline,p,fade);
}
function action(d){
 const N=d.N,D=N/FPS,samples=path(N,d),supports=makeSupports(d,samples),frames=Array.from({length:N+1},(_,f)=>({time:f/FPS,...sampleAction(d,f/FPS,samples,supports)}));
 const clearanceCorrection=clearSwing(frames,d,supports);
 const primaryFrame=d.contactFrame??Math.round(N/2),eventType=d.quick?'receive':d.kind==='roll'?'release':['short_pass','long_kick','spin','shield'].includes(d.kind)?'contact':d.kind==='cut'?'plant':d.kind==='brake'?'brake':d.kind==='jockey'?'jockey':'contact';
 let bone=d.kind==='chest'?'Chest':d.kind==='thigh'?'RightUpLeg':d.kind==='roll'?'RightHand':d.kind==='cut'?(d.sign>0?'RightFoot':'LeftFoot'):'RightFoot';
 let local=d.kind==='chest'?[0,.06,.13]:d.kind==='thigh'?[0,-.18,.095]:d.kind==='roll'?[0,-.035,.04]:d.kind==='inside'?[.045,-.035,.045]:d.kind==='outside'?[-.045,-.035,.045]:d.kind==='cut'?sole:[0,-.035,.11];
 const contactWorld=worldPose(frames[primaryFrame],samples[primaryFrame]),b=contactWorld[bone],position=add(b.position,rotate(b.rotation,local));
 const event={event:eventType,type:eventType,frame:primaryFrame,time:primaryFrame/FPS,bone,local,position};
 const events=[event,...supports.map(s=>({event:'plant',type:'plant',frame:Math.round(s.start*FPS),time:s.start,bone:s.bone,local:sole,position:s.anchor}))];
 if(d.kind==='brake')events.push({event:'accelerate',type:'accelerate',frame:31,time:31/FPS,bone:'Root',local:[0,0,0],position:samples[31].position});
 let ball=null;
 if(d.quick||['roll','short_pass','long_kick','spin','shield'].includes(d.kind)){
  // A grounded ball touches a low shoe surface above the floor, along a
  // diagonal radius; a horizontal radius would bury the lower hemisphere.
  const dy=Math.max(0,.11-position[1]);if(dy>.11)throw Error(`${d.id}: contact below floor`);
  const center=add(position,[0,dy,Math.sqrt(.11**2-dy**2)]),c=event.time;
  const points=frames.map((f,i)=>{
   let p;if(d.quick){if(f.time<=c)p=add(center,[0,(d.kind==='chest'?.18:d.kind==='thigh'?.12:0)*(1-f.time/c),1.7*(1-f.time/c)]);else p=add(center,[.035*smooth((f.time-c)/(D-c)),0,-.045*smooth((f.time-c)/(D-c))]);}
   else if(d.kind==='roll'){if(f.time<=c){const ww=worldPose(f,samples[i])[bone];p=add(add(ww.position,rotate(ww.rotation,local)),[0,0,.11]);}else{const q=f.time-c;p=add(center,[0,0,6*q]);p[1]=Math.max(.11,center[1]-1.8*q);}}
   else if(d.kind==='long_kick'||d.kind==='short_pass'){const q=f.time-c;p=q<=0?[center[0],.11,center[2]]:add(center,[0,(d.kind==='long_kick'?7:1)*q-4.905*q*q,(d.kind==='long_kick'?20:7)*q]);p[1]=Math.max(.11,p[1]);if(i===primaryFrame)p=center;}
   else {const r=samples[i],normal=add(r.position,turn([-.10,.11,.35],r.yaw)),weight=Math.sin(Math.PI*f.time/D)**4;p=mix(normal,center,weight);}
   return {time:f.time,position:p};
  });ball={radius:.11,samples:points};
 }
 return {id:d.id,label:d.label,category:d.category??d.kind,role:d.role??'field',duration:D,durationSeconds:D,frameCount:N+1,nativeRate:FPS,loop:false,
  frames,rootMotion:false,referenceRootMotion:{mode:'reference-only',yawUnit:'degrees',samples},supports,events,event,contactFrame:primaryFrame,ball,groundClearanceCorrectionMaxMeters:clearanceCorrection,
  ...(d.quick?{ballSelection:{surface:d.kind,movement:d.moving?'running':'standing',heightMeters:d.kind==='chest'?[1.05,1.60]:d.kind==='thigh'?[.45,1.05]:[0,.45],lateralSide:d.kind==='inside'?'inside':d.kind==='outside'?'outside':null}}:{}),
  timing:{durationSeconds:D,contactFrame:primaryFrame,nativeRate:FPS},
  entry:{reference:d.moving?'run':'idle_relaxed',phase:0,blendSeconds:0},
  exit:{reference:d.moving?'run':'idle_relaxed',phase:d.moving?2/FPS:0,blendSeconds:d.quick?.20:0,...(d.quick?{continuation:true}: {})},
  notes:d.quick?'First contact and short cushioning follow-through only. Exit intentionally continues the touch; consumer crossfades to next state.':d.kind==='cut'?'Discrete planted redirection. Identical v9 run phase-0 entry for BOTH directions. Trajectory is reference-only.':'Original contact-constrained action with v9 run/idle native boundaries.',license:'CC0-1.0'};
}
const definitions=[];
for(const angle of [45,90,135,180])for(const sign of [1,-1])definitions.push({id:`cut_${angle}_${sign>0?'left':'right'}`,label:`חיתוך ${angle}° ${sign>0?'שמאלה':'ימינה'}`,kind:'cut',N:10+angle/45*2,moving:true,angle:angle*sign,minimum:.55,sign,contactFrame:sign>0?4:3});
for(const kind of ['chest','thigh','inside','outside'])for(const moving of [false,true])definitions.push({id:`first_touch_${kind}_${moving?'running':'standing'}_quick`,label:`קבלה ${ {chest:'בחזה',thigh:'בירך',inside:'בפנים הרגל',outside:'בחוץ הרגל'}[kind]} ${moving?'בריצה':'בעמידה'} · נגיעה ראשונה`,kind,N:15,moving,quick:true,minimum:1.5,contactFrame:10});
definitions.push({id:'goalkeeper_hand_roll',label:'שוער · גלגול ביד',kind:'roll',N:36,role:'keeper',contactFrame:20},
 {id:'goalkeeper_short_foot_pass',label:'שוער · מסירה קצרה ברגל',kind:'short_pass',N:30,role:'keeper',contactFrame:16},
 {id:'goalkeeper_long_goal_kick',label:'שוער · בעיטת פתיחה רחוקה',kind:'long_kick',N:42,role:'keeper',contactFrame:22},
 {id:'brake_reaccelerate',label:'בלימה והאצה מחדש',kind:'brake',N:48,moving:true,brake:true,contactFrame:21});
for(const sign of [1,-1]){
 definitions.push({id:`ball_spin_${sign>0?'left':'right'}`,label:`סיבוב עם כדור ${sign>0?'שמאלה':'ימינה'}`,kind:'spin',N:36,moving:true,angle:180*sign,minimum:.7,sign,contactFrame:18});
 definitions.push({id:`shield_pressure_${sign>0?'left':'right'}`,label:`חיכוך והגנה על כדור ${sign>0?'משמאל':'מימין'}`,kind:'shield',N:36,lateral:sign*.12,sign,contactFrame:18});
 definitions.push({id:`close_jockey_${sign>0?'left':'right'}`,label:`הגנה צמודה ${sign>0?'שמאלה':'ימינה'}`,kind:'jockey',N:36,lateral:sign*.25,sign,contactFrame:18});
}
const clips=definitions.map(action);
for(const id of ['idle_relaxed','idle_scan','idle_weight_shift']){
 const r=references.clips[id],N=Math.round(r.duration*FPS),frames=Array.from({length:N+1},(_,i)=>({time:i/FPS,...lowArms(ref(id,i/FPS))}));
 clips.push({id,label:{idle_relaxed:'עמידה רגועה · ידיים נמוכות',idle_scan:'עמידה וסריקה · ידיים נמוכות',idle_weight_shift:'העברת משקל · ידיים נמוכות'}[id],category:'idle',role:'field',duration:r.duration,frameCount:N+1,nativeRate:FPS,loop:true,frames,rootMotion:false,referenceRootMotion:{mode:'reference-only',yawUnit:'degrees',samples:frames.map(f=>({time:f.time,position:[0,0,0],yaw:0}))},supports:r.supports,events:[],event:null,contactFrame:null,ball:null,timing:{durationSeconds:r.duration,contactFrame:null,nativeRate:FPS},entry:{reference:id,phase:0,editedReference:true,blendSeconds:.2},exit:{reference:id,phase:0,editedReference:true,blendSeconds:.2},targets:{shoulderAbductionDegrees:12,elbowFlexionDegrees:40},notes:'Original low-arm correction: v9 lower body retained, shoulders at12 degrees abduction and elbows at40 degrees flexion.',license:'CC0-1.0'});
}
{
 const r=references.clips.run,N=18,frames=Array.from({length:N+1},(_,i)=>{const t=i/FPS,p=ref('run',t),oldY=p.hips[1];p.hips[1]=.748+(oldY-.748)*.4;
  // Keep each native sole target after reducing hip excursion; solve legs,
  // rather than lifting the grounded foot with the pelvis correction.
  const before=fk(ref('run',t));for(const side of ['Left','Right'])solve(p,side+'UpLeg',side+'Leg',side+'Foot',before[side+'Foot'].position,[0,0,1],before[side+'Foot'].rotation);
  p.rotations.LeftForeArm=euler(-100);p.rotations.RightForeArm=euler(-100);return {time:t,...p};});
 const events=r.supports.map(s=>({event:'plant',type:'plant',frame:Math.round(s.start*FPS),time:s.start,bone:s.bone,local:sole,position:s.anchor}));
 clips.push({id:'run',label:'ריצה · אגן יציב ומרפקים כפופים',category:'run',role:'field',duration:.6,frameCount:19,nativeRate:FPS,loop:true,frames,rootMotion:false,referenceRootMotion:{mode:'reference-only',yawUnit:'degrees',samples:frames.map(f=>({time:f.time,position:[0,0,4.5*f.time],yaw:0}))},supports:r.supports,events,event:events[0],contactFrame:0,ball:null,timing:{durationSeconds:.6,contactFrame:0,nativeRate:FPS},entry:{reference:'run',phase:0,editedReference:true,blendSeconds:.1},exit:{reference:'run',phase:0,editedReference:true,blendSeconds:.1},targets:{hipsPeakToPeakMeters:.025,elbowFlexionMinDegrees:90,elbowFlexionMaxDegrees:110},notes:'Leg phase and foot tracks retained from v9 run. Hip vertical oscillation scaled0.4; legs re-solved to the unchanged ankle targets; elbow flexion100deg throughout.',license:'CC0-1.0'});
}
await fs.mkdir(new URL('runtime/',base),{recursive:true});
await fs.writeFile(new URL('runtime/motions.json',base),JSON.stringify({version:10,license:'CC0-1.0',skeleton:bones,nativeRate:FPS,rootMotion:false,clips}));
console.log(`Authored ${clips.length} original/corrected clips at30Hz; no animated root travel.`);
