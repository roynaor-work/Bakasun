/** Original contact-first soccer choreography, CC0-1.0.
 * Authoring-time IK is baked to native glTF channels. No runtime correction.
 * The canonical Root stays identity; referenceRootMotion is applied only once,
 * by a controller or a review presentation group, never inside the GLB.
 */
import fs from 'node:fs/promises';
import {bones,I,add,sub,mul,mix,clamp,smooth,curve,rotate,euler,qm,qi,slerp,fk,point,solve} from './rig.mjs';
const BASE=new URL('../',import.meta.url),FPS=30,R=.11,SOLE=[0,-.08,0];
const source=JSON.parse(await fs.readFile(new URL('../../soccer-motion-v10/runtime/motions.json',import.meta.url),'utf8'));
const refs=Object.fromEntries(source.clips.filter(c=>['run','idle_relaxed'].includes(c.id)).map(c=>[c.id,c]));
const clone=structuredClone,turn=(v,y)=>rotate(euler(0,y,0),v);
function ref(id,t=0){const c=refs[id],x=((t%c.duration)+c.duration)%c.duration*FPS,i=Math.min(c.frames.length-2,Math.floor(x)),u=x-i,a=c.frames[i],b=c.frames[i+1];return {hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(n=>[n.name,slerp(a.rotations[n.name],b.rotations[n.name],u)]))};}
const blend=(a,b,u)=>({hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(n=>[n.name,slerp(a.rotations[n.name],b.rotations[n.name],u)]))});
const localWorld=(p,r,bone,local=[0,0,0])=>add(r.position,turn(point(p,bone,local),r.yaw));
const defaults={N:54,kind:'kick',category:'pass',contactFrame:24,role:'field',distance:6,height:0,angle:0};
const definitions=[];
function def(d){definitions.push({...defaults,...d});}
function jumpTiming(d){const flightFrames=d.kind==='header'?16:14,half=flightFrames/2;return {startFrame:d.contactFrame-half,endFrame:d.contactFrame+half,apexFrame:d.contactFrame,flightFrames,flightSeconds:flightFrames/FPS,riseMeters:d.kind==='header'?.34:.28};}
function jumpValue(d,f){const j=jumpTiming(d),u=(f-j.startFrame)/j.flightFrames;return u>=0&&u<=1?4*u*(1-u):0;}
function jumpHipsY(d,f){const j=jumpTiming(d),air=jumpValue(d,f),t=f/FPS,start=j.startFrame/FPS,end=j.endFrame/FPS;return .75+j.riseMeters*air-.065*curve([[0,0],[Math.max(0,start-.22),0],[start-.08,1],[start,0],[end,0],[end+.08,1],[Math.min(d.N/FPS,end+.30),0],[d.N/FPS,0]],t);}
for(const [name,speed,period,steps] of [['slow',2.2,12,8],['medium',4.2,9,10],['sprint',6.2,7,12]])def({id:`dribble_${name}`,label:`כדרור · ${{slow:'איטי',medium:'בינוני',sprint:'ספרינט'}[name]}`,category:'dribble',kind:'dribble',moving:true,N:period*steps+12,speed,period,contactFrame:10});
for(const sign of [1,-1]){
 const side=sign>0?'left':'right',he=sign>0?'שמאלה':'ימינה';
 def({id:`dribble_turn_${side}`,label:`סיבוב עם כדור ${he}`,category:'dribble',kind:'turn',moving:true,N:84,speed:1.65,period:12,turn:sign*180,sign});
 def({id:`dribble_feint_${side}`,label:`פיינט גוף ויציאה ${he}`,category:'dribble',kind:'feint',N:60,sign,contactFrame:30});
 def({id:`shield_${side}`,label:`גוף בין היריב לכדור · ${he}`,category:'dribble',kind:'shield',N:66,sign,contactFrame:33});
}
for(const a of [0,45,90,135,180,225,270,315])def({id:`pass_ground_${String(a).padStart(3,'0')}`,label:`מסירה קרקעית קצרה · ${a}°`,angle:a,backheel:a>90&&a<270,distance:6,N:54,contactFrame:24});
def({id:'pass_lofted',label:'מסירה באוויר',distance:12,height:2.5,N:66,contactFrame:27});
def({id:'pass_cross_left',label:'כדור חוצה משמאל',distance:18,height:3.8,angle:-35,curve:2.5,N:72,contactFrame:29});
def({id:'pass_cross_right',label:'כדור חוצה מימין',distance:18,height:3.8,angle:35,curve:-2.5,N:72,contactFrame:29});
def({id:'pass_through',label:'מסירת עומק',distance:15,height:.08,N:60,contactFrame:24,angle:12});
def({id:'shot_power',label:'בעיטה חזקה',category:'shot',power:1,distance:22,height:.7,N:66,contactFrame:27});
def({id:'shot_curled',label:'בעיטה מסולסלת',category:'shot',power:.8,distance:19,height:1.6,curve:3,N:66,contactFrame:27,angle:-12});
def({id:'shot_chip',label:'בעיטת קשת',category:'shot',power:.45,distance:13,height:4.2,N:66,contactFrame:27});
def({id:'shot_volley',label:'בעיטת יעף בנגיעה ראשונה',category:'shot',kind:'volley',power:.9,distance:18,height:1.7,N:66,contactFrame:30});
def({id:'first_touch_chest',label:'נגיעה ראשונה בחזה',category:'shot',kind:'chest',N:54,contactFrame:24,distance:1.1});
for(const clean of [true,false]){
 def({id:`tackle_standing_${clean?'clean':'miss'}`,label:`תיקול עומד · ${clean?'נקי':'מפספס'}`,category:'defense',kind:'tackle',N:60,contactFrame:27,miss:!clean,distance:3.2});
 def({id:`tackle_slide_${clean?'clean':'miss'}`,label:`תיקול גלישה · ${clean?'נקי':'מפספס'}`,category:'defense',kind:'slide',N:90,contactFrame:39,miss:!clean,distance:4.4});
}
def({id:'interception',label:'חטיפה וניתוק קו מסירה',category:'defense',kind:'intercept',N:60,contactFrame:27,distance:3});
def({id:'collision_light',label:'התנגשות קלה והתאוששות',category:'defense',kind:'collision',N:60,contactFrame:26});
for(const [id,label,jump,attack,distance,height] of [['standing','נגיחה מהמקום',false,false,8,1],['jumping','נגיחה בקפיצה',true,false,10,1.5],['defensive','נגיחת הרחקה בהגנה',true,false,15,3.2],['attacking','נגיחת התקפה אל השער',true,true,12,.3]])def({id:`header_${id}`,label,category:'header',kind:'header',N:72,contactFrame:33,jump,attack,distance,height});
def({id:'set_throw_in',label:'כדור נייח · זריקת חוץ',category:'setpiece',kind:'throw',N:72,contactFrame:34,distance:12,height:2.5});
def({id:'set_corner',label:'כדור נייח · קרן',category:'setpiece',N:72,contactFrame:30,distance:20,height:4.1,angle:35,curve:2.5,power:.7});
def({id:'set_free_kick',label:'כדור נייח · בעיטה חופשית',category:'setpiece',N:72,contactFrame:30,distance:22,height:2.9,curve:2.0,power:.85});
def({id:'set_penalty',label:'כדור נייח · פנדל',category:'setpiece',N:66,contactFrame:28,distance:11,height:.7,power:.8,angle:18});
def({id:'set_wall',label:'כדור נייח · הצבת חומה וקפיצה',category:'setpiece',kind:'wall',N:72,contactFrame:34,jump:true});
const directions=[['up',0,1],['up_left',1,1],['left',1,0],['down_left',1,-1],['down',0,-1],['down_right',-1,-1],['right',-1,0],['up_right',-1,1]];
for(const [direction,x,y] of directions)def({id:`keeper_catch_${direction}`,label:`שוער · תפיסה ${ {up:'למעלה',up_left:'למעלה שמאלה',left:'שמאלה',down_left:'נמוך שמאלה',down:'נמוך',down_right:'נמוך ימינה',right:'ימינה',up_right:'למעלה ימינה'}[direction]}`,category:'keeper',kind:'catch',role:'keeper',N:72,contactFrame:33,side:x,level:y,distance:0});
def({id:'keeper_parry',label:'שוער · הדיפה מהשער',category:'keeper',kind:'parry',role:'keeper',N:72,contactFrame:33,side:-1,level:1,distance:8,height:2.1});
def({id:'keeper_rush',label:'שוער · יציאה לכדור ואיסוף',category:'keeper',kind:'rush',role:'keeper',N:84,contactFrame:42,distance:0});
for(const sign of [1,-1])def({id:`keeper_dive_${sign>0?'left':'right'}`,label:`שוער · זינוק ${sign>0?'שמאלה':'ימינה'}`,category:'keeper',kind:'dive',role:'keeper',N:90,contactFrame:39,side:sign,level:0,distance:0});
def({id:'keeper_after_goal',label:'שוער · אחרי ספיגת שער וחזרה לעמדה',category:'keeper',kind:'aftergoal',role:'keeper',N:90,contactFrame:45});
def({id:'celebrate_player',label:'חגיגת שחקן · הרמת ידיים וקפיצה',category:'celebration',kind:'celebrate',N:90,contactFrame:40,jump:true});
def({id:'celebrate_team',label:'חגיגה קבוצתית · שלושה שחקנים',category:'celebration',kind:'team',N:96,contactFrame:43,jump:true});

function path(d){
 const D=d.N/FPS,samples=[],position=[0,0,0];
 const speed=t=>d.moving?curve([[0,4.5],[2/FPS,4.5],[.22,d.speed],[D-.22,d.speed],[D-2/FPS,4.5],[D,4.5]],t):0;
 for(let i=0;i<=d.N;i++){
  const t=i/FPS,yaw=d.turn*smooth((t-.18)/(D-.36))||0;
  if(i){const mid=t-.5/FPS,a=d.turn*smooth((mid-.18)/(D-.36))||0,v=speed(mid);const step=turn([0,0,v/FPS],a);for(let j=0;j<3;j++)position[j]+=step[j];}
  const p=[...position];
  if(d.kind==='slide')p[2]=1.7*smooth((t-.20)/.75);
  if(d.kind==='rush')p[2]=1.5*smooth((t-.20)/.9);
  if(d.kind==='dive')p[0]=d.side*.85*Math.sin(Math.PI*clamp((t-.18)/(D-.36)))**2;
  samples.push({time:t,position:p,yaw});
 }
 return samples;
}
function world(p,r,bone){const b=fk(p)[bone];return {p:add(r.position,turn(b.position,r.yaw)),q:qm(euler(0,r.yaw,0),b.rotation)};}
function makeSupports(d,samples){
 const home=d.moving?'run':'idle_relaxed',initial=ref(home,0),end=ref(home,2/FPS),result=[];
 const support=(bone,a,b,p,q=euler(0,samples[Math.round((a+b)/2)].yaw,0))=>({bone,start:a/FPS,end:b/FPS,anchor:add(p,rotate(q,SOLE)),heading:samples[Math.round((a+b)/2)].yaw,rotation:q});
 const initialFoot=bone=>world(initial,samples[0],bone),finalFoot=bone=>world(ref(home,0),samples[d.N-2],bone);
 if(d.moving){
  const first=initialFoot('LeftFoot');result.push(support('LeftFoot',0,2,first.p,first.q));
  const last=finalFoot('LeftFoot');result.push(support('LeftFoot',d.N-2,d.N,last.p,last.q));
  let k=0;for(let a=8;a<d.N-8;a+=d.period,k++){
   const bone=k%2?'RightFoot':'LeftFoot',r=samples[a],sign=bone==='LeftFoot'?1:-1,p=add(r.position,turn([sign*.13,.08,.25],r.yaw));
   result.push(support(bone,a,Math.min(a+2,d.N-8),p));
  }
 }else if(d.kind==='rush'){
  for(const [bone,a,b,z] of [['LeftFoot',0,8,null],['RightFoot',0,4,null],['RightFoot',8,12,.38],['LeftFoot',16,20,.90],['RightFoot',24,28,1.43],['LeftFoot',32,d.N,1.525],['RightFoot',36,d.N,1.475]]){
   const initial=initialFoot(bone),sign=bone==='LeftFoot'?1:-1;
   result.push(support(bone,a,b,z===null?initial.p:[sign*.13,.08,z],I));
  }
 }else{
  const airborne=d.jump||d.kind==='dive'||d.kind==='slide';
  for(const bone of ['LeftFoot','RightFoot']){
   const first=initialFoot(bone),last=finalFoot(bone);
   if(d.jump){const j=jumpTiming(d);result.push(support(bone,0,j.startFrame,first.p,first.q),support(bone,j.endFrame,d.N,last.p,last.q));}
   else if(airborne){result.push(support(bone,0,5,first.p,first.q),support(bone,d.N-5,d.N,last.p,last.q));}
   else if(bone==='LeftFoot'||['chest','collision','throw','catch','parry','aftergoal','shield','feint'].includes(d.kind))result.push(support(bone,0,d.N,first.p,first.q));
   else result.push(support(bone,0,4,first.p,first.q),support(bone,d.N-5,d.N,last.p,last.q));
  }
 }
 return result.sort((a,b)=>a.start-b.start||a.bone.localeCompare(b.bone));
}
function gaitFoot(d,bone,f,samples,supports){
 const windows=supports.filter(s=>s.bone===bone),active=windows.find(s=>f/FPS>=s.start-1e-8&&f/FPS<=s.end+1e-8);
 const pOf=s=>sub(s.anchor,rotate(s.rotation??euler(0,s.heading,0),SOLE));
 if(active)return {p:pOf(active),q:active.rotation??euler(0,active.heading,0)};
 const home=d.moving?'run':'idle_relaxed',initial=world(ref(home,Math.min(f,2)/FPS),samples[Math.min(f,2)],bone),end=world(ref(home,Math.max(0,f-(d.N-2))/FPS),samples[Math.max(d.N-2,f)],bone);
 const before=[...windows].reverse().find(s=>s.end*FPS<f),after=windows.find(s=>s.start*FPS>f);
 const a=before?{f:before.end*FPS,p:pOf(before),q:before.rotation}: {f:2,...initial};
 const b=after?{f:after.start*FPS,p:pOf(after),q:after.rotation}: {f:d.N-2,...end};
 const u=clamp((f-a.f)/(b.f-a.f||1)),p=mix(a.p,b.p,smooth(u));p[1]+=.18*Math.sin(Math.PI*u)**2;
 return {p,q:slerp(a.q,b.q,smooth(u))};
}
function actionPose(d,f,samples,supports){
 const N=d.N,home=d.moving?'run':'idle_relaxed';
 if(f<=2)return ref(home,f/FPS);
 if(f>=N-2)return ref(home,(f-(N-2))/FPS);
 const t=f/FPS,D=N/FPS,u=f/N,c=d.contactFrame/N,fade=smooth((f-2)/3)*smooth((N-2-f)/3),pulse=Math.sin(Math.PI*u)**2;
 const p=ref(home,0),idle=fk(ref('idle_relaxed',0)),feet={LeftFoot:{p:idle.LeftFoot.position,q:idle.LeftFoot.rotation},RightFoot:{p:idle.RightFoot.position,q:idle.RightFoot.rotation}};
 p.hips=[0,.755-.04*pulse,0];p.rotations.Hips=euler(4*pulse);p.rotations.Spine=euler(2*pulse);p.rotations.Chest=euler(0);
 p.rotations.LeftArm=euler(0,0,12);p.rotations.RightArm=euler(0,0,-12);p.rotations.LeftForeArm=euler(-40);p.rotations.RightForeArm=euler(-40);
 const hand=(side,target,pole)=>solve(p,side+'Arm',side+'ForeArm',side+'Hand',target,pole??[side==='Left'?.4:-.4,-.6,-.4],['celebrate','team'].includes(d.kind)?undefined:I);
 const armSpread=(a=30)=>{p.rotations.LeftArm=euler(0,0,a);p.rotations.RightArm=euler(0,0,-a);p.rotations.LeftForeArm=euler(-75);p.rotations.RightForeArm=euler(-75);};
 if(d.moving){
  p.hips=[0,.69+.025*Math.sin(2*Math.PI*f/d.period),0];p.rotations.Hips=euler(8);p.rotations.Spine=euler(5);p.rotations.Chest=euler(3,0,d.kind==='turn'?-d.sign*5*pulse:0);
  const swing=32*Math.sin(Math.PI*(f-8)/d.period);p.rotations.LeftArm=euler(swing,0,9);p.rotations.RightArm=euler(-swing,0,-9);p.rotations.LeftForeArm=euler(-100);p.rotations.RightForeArm=euler(-100);
  for(const bone of ['LeftFoot','RightFoot']){const w=gaitFoot(d,bone,f,samples,supports),r=samples[f];feet[bone]={p:turn(sub(w.p,r.position),-r.yaw),q:qm(euler(0,-r.yaw,0),w.q)};}
 }else if(['kick','volley','tackle','intercept'].includes(d.kind)){
  const a=(d.angle>180?d.angle-360:d.angle)*Math.PI/180,power=d.power??.2;
  p.hips=[-.025*pulse,.73-.055*pulse,-.035*pulse];p.rotations.Hips=euler(-5*pulse,clamp(d.angle>180?d.angle-360:d.angle,-65,65)*.30*pulse);p.rotations.Chest=euler((power?-10:5)*pulse,-15*pulse,0);armSpread(18+power*20*pulse);
  const contact=d.kind==='volley'?[-.18,.56,.34]:d.kind==='intercept'?[-.42,.10,.30]:[-.12+Math.sin(a)*.22,.105,Math.cos(a)*.29];
  const follow=d.kind==='volley'?[-.18,.70,.50]:[-.12+Math.sin(a)*.3,.16+power*.34,Math.cos(a)*(.40+power*.12)];
  const preparation=d.backheel?[-.15,.18,.27]:[-.15,.18,-.30],bootYaw=d.backheel?d.angle-180:clamp(d.angle>180?d.angle-360:d.angle,-80,80);
  feet.RightFoot={p:curve([[0,idle.RightFoot.position],[c-.16,preparation],[c,contact],[c+.10,follow],[.88,idle.RightFoot.position],[1,idle.RightFoot.position]],u),q:euler(d.kind==='volley'?-25:-12,d.backheel?curve([[0,0],[c-.16,bootYaw],[c+.1,bootYaw],[1,0]],u):bootYaw*pulse,0)};
  if(d.kind==='tackle'){p.hips[1]-=.12*pulse;p.rotations.Chest=euler(18*pulse);feet.RightFoot.p=curve([[0,idle.RightFoot.position],[c-.15,[-.14,.14,-.12]],[c,[-.16,.10,.45]],[c+.13,[-.17,.12,.5]],[.90,idle.RightFoot.position],[1,idle.RightFoot.position]],u);armSpread(32);}
 }else if(d.kind==='slide'){
  const slide=Math.sin(Math.PI*clamp((u-.08)/.84))**2;
  p.hips=[.04,.76-.49*slide,-.06*slide];p.rotations.Hips=euler(-48*slide);p.rotations.Spine=euler(-12*slide);p.rotations.Chest=euler(12*slide);armSpread(32);
  feet.LeftFoot={p:mix(idle.LeftFoot.position,[.24,.12,.29],slide),q:euler(-8*slide,12*slide,0)};
  feet.RightFoot={p:mix(idle.RightFoot.position,[-.12,.115,.68],slide),q:euler(-12*slide)};
  hand('Left',mix([.25,.85,.1],[.35,.20,-.10],slide));hand('Right',mix([-.25,.85,.1],[-.30,.22,-.08],slide));
 }else if(['feint','shield'].includes(d.kind)){
  const s=d.sign;p.hips=[s*.08*Math.sin(Math.PI*2*u)*pulse,.75-.06*pulse,0];p.rotations.Hips=euler(5,s*12*pulse,s*8*Math.sin(Math.PI*2*u));p.rotations.Chest=euler(6,s*(d.kind==='shield'?38:24)*pulse,0);
  armSpread(d.kind==='shield'?42:22);p.rotations[s>0?'LeftForeArm':'RightForeArm']=euler(-70);
 }else if(d.kind==='collision'){
  const j=curve([[0,0],[.3,0],[.43,1],[.56,-.35],[.85,0],[1,0]],u);p.hips=[-.08*j,.755-.05*Math.abs(j),-.045*j];p.rotations.Chest=euler(-8*j,10*j,-14*j);armSpread(30+10*Math.abs(j));
 }else if(d.kind==='chest'){
  const j=Math.sin(Math.PI*u)**4;p.hips=[0,.755,-.045*j];p.rotations.Hips=euler(-3*j);p.rotations.Spine=euler(-9*j);p.rotations.Chest=euler(-14*j);p.rotations.Head=euler(10*j);armSpread(25);
 }else if(d.kind==='header'){
  const head=curve([[0,0],[c-.18,-12],[c,20],[c+.13,35],[1,0]],u);p.rotations.Chest=euler(head*.45);p.rotations.Spine=euler(head*.35);p.rotations.Head=euler(head*.5);armSpread(34);
  if(d.jump){const air=jumpValue(d,f);p.hips=[0,jumpHipsY(d,f),.05*air];feet.LeftFoot.p=add(idle.LeftFoot.position,[.04*air,.25*air,-.04*air]);feet.RightFoot.p=add(idle.RightFoot.position,[-.02*air,.22*air,-.08*air]);}
 }else if(d.kind==='throw'){
  const lift=curve([[0,0],[.2,1],[c-.03,1],[c+.08,.72],[.85,0],[1,0]],u),forward=curve([[0,0],[c-.06,-.18],[c,.28],[c+.15,.38],[1,0]],u);
  p.rotations.Spine=euler(-10*lift);p.rotations.Chest=euler(12*curve([[0,0],[c-.1,-1],[c+.1,1],[1,0]],u));
  hand('Left',[.13,.90+.68*lift,.10+forward],[.5,0,-1]);hand('Right',[-.13,.90+.68*lift,.10+forward],[-.5,0,-1]);
 }else if(['catch','parry','rush','dive'].includes(d.kind)){
  const reach=Math.sin(Math.PI*u)**2,x=(d.side??0)*.30,y=d.kind==='rush'?.45:d.level>0?1.55:d.level<0?.46:1.1,z=d.kind==='rush'?.53:.38;
  if(d.kind==='rush'){
   p.hips=[0,.75-.24*reach,.02];p.rotations.Hips=euler(23*reach);p.rotations.Chest=euler(12*reach);
   for(const bone of ['LeftFoot','RightFoot']){const w=gaitFoot(d,bone,f,samples,supports),r=samples[f];feet[bone]={p:turn(sub(w.p,r.position),-r.yaw),q:qm(euler(0,-r.yaw,0),w.q)};}
  }
  if(d.kind==='dive'){
   const horizontal=curve([[0,0],[.18,.15],[c,1],[.66,1],[.76,.85],[.88,.22],[1,0]],u),lift=curve([[0,0],[.23,.08],[c,.23],[.65,.04],[.78,.04],[1,0]],u);
   p.hips=[d.side*.08*horizontal,curve([[0,.755],[.24,.75],[c,.55],[.64,.225],[.76,.25],[.88,.55],[1,.755]],u),0];
   p.rotations.Hips=euler(0,0,-d.side*72*horizontal);p.rotations.Spine=euler(0,0,-d.side*12*horizontal);p.rotations.Chest=euler(0,0,-d.side*3*horizontal);
   feet.LeftFoot.p=add(idle.LeftFoot.position,[-d.side*.42*horizontal,lift,0]);feet.RightFoot.p=add(idle.RightFoot.position,[-d.side*.42*horizontal,lift+.025*horizontal,.02*horizontal]);
  }
  if(d.level<0){p.hips[1]-=.20*reach;p.rotations.Chest=euler(14*reach);}
  const target=d.kind==='dive'?[d.side*.64,curve([[0,.9],[c,.67],[.64,.21],[.77,.25],[1,.9]],u),.25]:[x,y,z],left=add(target,[.085,0,0]),right=add(target,[-.085,0,0]);
  hand('Left',mix([.25,.90,.15],left,reach),[.6,-.5,-.5]);hand('Right',mix([-.25,.90,.15],right,reach),[-.6,-.5,-.5]);
 }else if(d.kind==='aftergoal'){
  const down=Math.sin(Math.PI*u)**2;p.hips[1]=.76-.18*down;p.rotations.Chest=euler(18*down);p.rotations.Head=euler(30*down);hand('Left',mix([.25,.9,.1],[.19,1.38,.19],down));hand('Right',mix([-.25,.9,.1],[-.19,1.38,.19],down));
 }else if(['wall','celebrate','team'].includes(d.kind)){
  const jump=jumpValue(d,f);p.hips=[0,jumpHipsY(d,f),0];feet.LeftFoot.p=add(idle.LeftFoot.position,[0,.24*jump,0]);feet.RightFoot.p=add(idle.RightFoot.position,[0,.24*jump,0]);
  if(d.kind==='wall'){hand('Left',[.07,.86,.23]);hand('Right',[-.07,.86,.23]);p.rotations.Head=euler(-8*jump);}
  else{hand('Left',mix([.25,.9,.1],[.30,1.60,.12],pulse),[.6,0,-1]);hand('Right',mix([-.25,.9,.1],[-.34,1.50,.18],pulse),[-.6,0,-1]);p.rotations.Chest=euler(-6*pulse,12*Math.sin(2*Math.PI*u)*pulse);}
 }
 // Preserve the contact boot during the declared plant and solve every stance
 // against a reference-world ankle anchor, before glTF baking.
 for(const bone of ['LeftFoot','RightFoot']){
  const s=supports.find(s=>s.bone===bone&&t>=s.start-1e-8&&t<=s.end+1e-8);
  if(s){const rr=samples[f],q=s.rotation??euler(0,s.heading,0),wp=sub(s.anchor,rotate(q,SOLE));feet[bone]={p:turn(sub(wp,rr.position),-rr.yaw),q:qm(euler(0,-rr.yaw,0),q)};}
  const side=bone.slice(0,-4),target=feet[bone];solve(p,side+'UpLeg',side+'Leg',bone,target.p,rotate(target.q,[0,0,1]),target.q);
 }
 return blend(ref(home,d.moving?t:0),p,fade);
}
function ballMarker(d,bone){
 if(bone.endsWith('Foot'))return d.backheel?[0,-.035,-.07]:[0,-.035,.22];
 if(bone==='Chest')return [0,.06,.14];if(bone==='Head')return [0,.055,.14];
 if(bone.endsWith('Hand'))return [0,-.055,.035];return [0,0,.08];
}
function clearSwing(frames,d,supports){
 const locals=[SOLE,[0,-.08,.22],[0,-.08,-.08]],editable=(f,bone)=>f>2&&f<d.N-2&&!supports.some(s=>s.bone===bone&&f/FPS>=s.start-1e-9&&f/FPS<=s.end+1e-9);let maximum=0;
 // Quaternion interpolation bends the swept ankle path between IK keys. The
 // correction is authored into those keys, before events and GLB are baked.
 // The exact first/last v10 intervals and their inherited clearance stay intact.
 for(let pass=0;pass<7;pass++)for(let f=2;f<d.N-2;f++)for(const bone of ['LeftFoot','RightFoot'])for(const u of [.25,.5,.75]){
  const t=(f+u)/FPS;if(supports.some(s=>s.bone===bone&&t>=s.start&&t<=s.end))continue;
  const p=blend(frames[f],frames[f+1],u),minimum=Math.min(...locals.map(local=>point(p,bone,local)[1]));if(minimum>=.0015)continue;
  const candidates=[f,f+1].filter(i=>editable(i,bone));if(!candidates.length)continue;
  const change=(.0015-minimum)*2/candidates.length;maximum=Math.max(maximum,change);
  for(const i of candidates){const pose=frames[i],w=fk(pose)[bone],side=bone.slice(0,-4);solve(pose,side+'UpLeg',side+'Leg',bone,add(w.position,[0,change,0]),rotate(w.rotation,[0,0,1]),w.rotation);}
 }
 return maximum;
}
function ballEvent(d,frames,samples,frame,bone,type='contact'){
 const local=ballMarker(d,bone),position=localWorld(frames[frame],samples[frame],bone,local),rotation=qm(euler(0,samples[frame].yaw,0),fk(frames[frame])[bone].rotation);
 let normal=rotate(rotation,d.backheel?[0,0,-1]:[0,0,1]);
 if(bone.endsWith('Foot')&&position[1]<R){const y=clamp((R-position[1])/R,0,1),horizontal=Math.hypot(normal[0],normal[2])||1;normal=[normal[0]/horizontal*Math.sqrt(1-y*y),y,normal[2]/horizontal*Math.sqrt(1-y*y)];}
 return {event:type,type,frame,time:frame/FPS,bone,local,position,normal,ballContact:!d.miss,contactKind:d.miss?'miss':'ball'};
}
function action(d){
 const samples=path(d),supports=makeSupports(d,samples),frames=Array.from({length:d.N+1},(_,f)=>({time:f/FPS,...actionPose(d,f,samples,supports)}));
 const clearanceCorrection=clearSwing(frames,d,supports);
 let events=[],ball=null,event,cadence;
 const noBall=['collision','wall','aftergoal','celebrate','team'].includes(d.kind);
 if(noBall){const bone=d.kind==='collision'?'Chest':'LeftFoot',local=bone==='LeftFoot'?SOLE:[.19,.07,0],f=d.kind==='collision'?d.contactFrame:d.jump?jumpTiming(d).endFrame:d.N-5;event={event:d.kind==='collision'?'body_contact':'landing',type:d.kind==='collision'?'body_contact':'ground_contact',frame:f,time:f/FPS,bone,local,position:localWorld(frames[f],samples[f],bone,local),ballContact:false,contactKind:d.kind==='collision'?'body':'ground'};events.push(event);}
 else if(d.moving){
  const steps=supports.filter(s=>s.start>2/FPS&&s.end<(d.N-2)/FPS),touchFrames=steps.map(s=>Math.round(s.start*FPS));
  events=steps.map((s,i)=>ballEvent(d,frames,samples,touchFrames[i],s.bone,'touch'));event=events[0];
  const centers=events.map(e=>({time:e.time,position:add(e.position,mul(e.normal,R))}));
  const keys=[{time:0,position:sub(centers[0].position,[0,0,.12])},...centers,{time:d.N/FPS,position:add(centers.at(-1).position,turn([0,0,.28],samples.at(-1).yaw))}];
  ball={radius:R,samples:frames.map(f=>({time:f.time,position:curve(keys.map(k=>[k.time,k.position]),f.time)}))};
  cadence={targetStepHz:FPS/d.period,targetTouchHz:FPS/d.period,targetSpeedMps:d.speed,touchFrames,stepFrames:touchFrames,window:{start:events[0].time,end:events.at(-1).time},definition:'Every central alternating planted step has one boot-to-ball touch; entry/exit are v10 run transition phases.'};
 }else{
  const bone=d.kind==='chest'?'Chest':d.kind==='header'?'Head':['throw','catch','parry','rush','dive'].includes(d.kind)?'RightHand':'RightFoot';
  const type=d.kind==='chest'?'receive':d.kind==='header'?'header':d.kind==='throw'?'release':['catch','rush','dive'].includes(d.kind)?'catch':d.kind==='parry'?'parry':['feint','shield'].includes(d.kind)?'touch':d.miss?'miss':'kick';
  event=ballEvent(d,frames,samples,d.contactFrame,bone,type);events.push(event);
  let center=add(event.position,mul(event.normal,R));if(d.miss)center=add(center,[.65,0,.05]);
  const c=event.time,D=d.N/FPS,a=d.angle*Math.PI/180,exit=[Math.sin(a),0,Math.cos(a)];
  ball={radius:R,samples:frames.map((frame,i)=>{
   const t=frame.time,q=t-c,after=clamp(q/(D-c)),before=clamp((c-t)/c);let p;
   if(['catch','rush','dive'].includes(d.kind)){
    if(q<=0)p=add(center,[0,.2*before,3*before]);
    else {const anchor=localWorld(frame,samples[i],bone,event.local),normal=turn(event.normal,samples[i].yaw-samples[d.contactFrame].yaw);p=add(anchor,mul(normal,R));}
   }else if(d.kind==='throw'){
    if(q<=0){const left=localWorld(frame,samples[i],'LeftHand',ballMarker(d,'LeftHand')),right=localWorld(frame,samples[i],'RightHand',event.local);p=add(mix(left,right,.5),[0,0,.09]);}
    else p=add(center,add(mul(exit,d.distance*after),[0,d.height*Math.sin(Math.PI*after),0]));
   }else if(d.kind==='chest')p=q<=0?add(center,[0,.15*before,2.8*before]):add(center,[.10*after,-Math.min(center[1]-R,.9*after),d.distance*after]);
   else if(['feint','shield'].includes(d.kind)){const x=d.sign*.22*Math.sin(2*Math.PI*t/D);p=mix(add(center,[x,.01,.12]),center,Math.sin(Math.PI*t/D)**8);}
   else if(d.miss)p=add(center,[0,0,-1.2*q]);
   else if(['volley','header','parry'].includes(d.kind))p=q<=0?add(center,[0,.3*before,3*before]):add(center,add(mul(exit,d.distance*after),[d.curve*Math.sin(Math.PI*after)||0,d.height*Math.sin(Math.PI*after),0]));
   else p=q<=0?center:add(center,add(mul(exit,d.distance*after),[d.curve*Math.sin(Math.PI*after)||0,d.height*Math.sin(Math.PI*after),0]));
   if(i===d.contactFrame&&!d.miss)p=center;p[1]=Math.max(R,p[1]);return {time:t,position:p};
  })};
  if(d.miss){event.contactGapMeters=.65;event.ballContact=false;}
  const end=ball.samples.at(-1).position,start=ball.samples[d.contactFrame].position;
  event.distanceMeters=Math.hypot(end[0]-start[0],end[2]-start[2]);event.targetPosition=end;event.distanceBasis='horizontal-to-last-sample';
 }
 events.push(...supports.map(s=>({event:'plant',type:'plant',frame:Math.round(s.start*FPS),time:s.start,bone:s.bone,local:SOLE,position:s.anchor,ballContact:false,contactKind:'ground'})));
 const actors=d.kind==='team'?[{offset:[0,0,0],yaw:0,phase:0},{offset:[.8,0,-.25],yaw:-12,phase:0},{offset:[-.8,0,-.25],yaw:12,phase:0}]:d.kind==='wall'?[{offset:[0,0,0],yaw:0,phase:0},{offset:[.5,0,0],yaw:0,phase:0},{offset:[-.5,0,0],yaw:0,phase:0}]:d.kind==='collision'?[{offset:[0,0,0],yaw:0,phase:0},{offset:[2*event.position[0],0,2*event.position[2]],yaw:180,phase:0}]:undefined;
 if(d.kind==='collision')event.peer={actor:1,bone:'Chest',local:[.19,.07,0]};
 return {id:d.id,label:d.label,category:d.category,role:d.role,duration:d.N/FPS,durationSeconds:d.N/FPS,frameCount:d.N+1,nativeRate:FPS,loop:false,frames,rootMotion:false,referenceRootMotion:{mode:'reference-only',yawUnit:'degrees',samples},supports,events,event,contactFrame:event.frame,ball,groundClearanceCorrectionMaxMeters:clearanceCorrection,...(d.jump?{jump:jumpTiming(d)}:{}),...(cadence?{cadence}:{}),...(actors?{actors}:{}),entry:{reference:d.moving?'run':'idle_relaxed',phase:0,blendSeconds:0},exit:{reference:d.moving?'run':'idle_relaxed',phase:2/FPS,blendSeconds:0},timing:{durationSeconds:d.N/FPS,nativeRate:FPS,contactFrame:event.frame},license:'CC0-1.0',notes:'Original v11 authored contact choreography; exact v10 boundary poses, baked offline constraints, identity Root. Ball trajectory is reference-world presentation data; controller chooses game outcomes.'};
}
const selected=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
let clips=definitions.filter(d=>!selected||selected.includes(d.id)).map(action);
if(selected){const previous=JSON.parse(await fs.readFile(new URL('runtime/motions.json',BASE),'utf8'));const replacement=new Map(clips.map(c=>[c.id,c]));clips=previous.clips.map(c=>replacement.get(c.id)??c);}
await fs.mkdir(new URL('runtime/',BASE),{recursive:true});
await fs.writeFile(new URL('runtime/motions.json',BASE),JSON.stringify({version:11,license:'CC0-1.0',skeleton:bones,nativeRate:FPS,rootMotion:false,sourceLibrary:'v10 CC0 canonical boundary poses; original v11 choreography',clips}));
console.log(`Authored ${clips.length} soccer v11 clips; ${clips.reduce((n,c)=>n+c.events.filter(e=>e.ballContact).length,0)} ball contact events.`);
