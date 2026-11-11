/** Original procedural football actions, CC0-1.0. No captured or v8 motion keys.
 * Each control point is authored in metres in the canonical motion2 space. */
import {pose,curve,smooth,mix,add,sub,rotate,euler} from './rig.mjs';
import {gaitSettings,gaitSupports,gaitTravel} from './locomotion.mjs';
const sole=[0,-.08,0], toe=[0,-.025,.135];
const ev=(time,type,bone,local=toe)=>({time,type,bone,local});
const support=(bone,start,end,anchor)=>({bone,start,end,anchor});
const definitions=[];
const contactTimes={standing:.6,running:.9};
const surfaces={
 chest:{bone:'Chest',local:[0,.045,.12],label:'חזה'},
 thigh:{bone:'RightUpLeg',local:[0,-.2,.075],label:'ירך'},
 inside:{bone:'RightFoot',local:[.045,-.025,.13],label:'כף רגל פנימית'},
 outside:{bone:'RightFoot',local:[-.045,-.025,.13],label:'כף רגל חיצונית'},
};
for(const [surface,description] of Object.entries(surfaces))for(const moving of [false,true]){
 const duration=moving?1.6:1.3,at=moving?.9:.6,mode=moving?'running':'standing';
 const cfg={duration:.8,speed:2.2,duty:.38,lift:.16,hip:.735,arm:.17,bob:.022};
 const release=at+(surface==='chest'?.1:.1666666667);
 const supports=moving?gaitSupports(cfg,duration):[
  support('LeftFoot',0,duration,[.13,0,.015]),
  support('RightFoot',0,.2,[-.13,0,-.045]),
  support('RightFoot',1.1,duration,[-.13,0,.055]),
 ];
 if(!moving&&surface==='chest')supports.splice(1,2,support('RightFoot',0,duration,[-.13,0,-.045]));
 const sample=t=>{
  const u=t/duration,delta=t-at;
  const cushion=curve([[-.3,0],[-.12,.8],[0,1],[.15,.65],[.35,0]],delta);
  const recoil=curve([[-.25,0],[0,0],[.13,1],[.35,0]],delta);
  const s=moving?gaitSettings(t,cfg):{
   hips:[0,.765,0],leftFoot:[.13,.08,.015],rightFoot:[-.13,.08,-.045],
   leftHand:[.25,.87,.12],rightHand:[-.25,.87,.12],lean:3,
  };
  s.hips=add(s.hips,[.035*cushion,-.025*cushion,-.025*recoil]);
  s.lean=(s.lean||0)+(surface==='chest'?-9*cushion+17*recoil:5*cushion);
  s.twist=(s.twist||0)+(surface==='outside'?-10:surface==='inside'?8:surface==='thigh'?-5:0)*cushion;
  s.leftHand=add(s.leftHand,[.035*cushion,.05*cushion,-.04*recoil]);
  s.rightHand=add(s.rightHand,[-.025*cushion,.055*cushion,-.04*recoil]);
  if(moving){s.leftHand[1]-=.07;s.rightHand[1]-=.07;}
  if(surface!=='chest'){
   const baseline=s.rightFoot;
   const lift=surface==='thigh'?.43:.15;
   const footX=surface==='outside'?-.24:surface==='inside'?-.10:-.16;
   const target=[footX,lift,.33-.16*recoil];
   const weight=curve([[-.18,0],[-.08,.75],[0,1],[.15,.85],[.28,0]],delta);
   s.rightFoot=mix(baseline,target,weight);
   s.rightFootYaw=surface==='outside'?-28*weight:surface==='inside'?34*weight:-8*weight;
   if(!moving){
    s.rightFoot=curve([[0,[-.13,.08,-.045]],[.2/duration,[-.13,.08,-.045]],[(at-.18)/duration,[footX,lift,.38]],
     [at/duration,[footX,lift,.33]],[(at+.17)/duration,[footX,lift*.92,.16]],[1.1/duration,[-.13,.08,.055]],[1,[-.13,.08,.055]]],u);
    s.rightFootYaw=surface==='outside'?-28*cushion:surface==='inside'?34*cushion:0;
   }
  }
  return pose(s);
 };
 definitions.push({id:`first_touch_${surface}_${mode}`,label:`נגיעה ראשונה · ${description.label} · ${moving?'בריצה':'בעמידה'}`,
  category:'ball',role:'field',duration,loop:false,sample,travel:moving?t=>gaitTravel(t,cfg):undefined,
  supports,events:[...supports.map(s=>ev(s.start,'plant',s.bone,sole)),ev(at,'contact',description.bone,description.local),ev(release,'release',description.bone,description.local)],
  ballKind:'receive',metricsTargets:moving?{speed:2.2,stepsPerSecond:2/.8,stepLength:2.2*.8/2,contact:at}:{contact:at},
  notes:`Original ${surface} cushioning receive: ${moving?'two advancing run strides with the reception during right-leg swing':'left-foot load, distinct reception height and soft recovery'}. The receiving surface retracts after impact; arms stay below the shoulder line.`});
}

// Fast close control: the foot contacts occur in flight, after the supporting
// foot has accepted weight. Two short impulses form a genuinely periodic loop.
{
 const duration=.6,cfg={duration,speed:3.6,duty:1/3,lift:.19,hip:.72,arm:.2,bob:.035};
 const supports=gaitSupports(cfg,duration),events=supports.map(s=>ev(s.start,'plant',s.bone,sole));
 for(const [time,bone] of [[.18,'RightFoot'],[.48,'LeftFoot']])events.push(ev(time,'contact',bone),ev(time,'release',bone));
 definitions.push({id:'dribble_fast',label:'כדרור בריצה מהירה',category:'ball',role:'field',duration,loop:true,
  sample:t=>{const s=gaitSettings(t,cfg),p=2*Math.PI*t/duration;s.lean=10;s.twist=(s.twist||0)-2*Math.sin(p);return pose(s);},
  travel:t=>gaitTravel(t,cfg),supports,events,ballKind:'dribble',
  metricsTargets:{speed:3.6,stepsPerSecond:2/duration,stepLength:3.6*duration/2},
  notes:'Original fast control cycle. Alternating free-foot toe contacts, brief flight, compact hands and shoulder/hip counterrotation; travel remains separate from the seamless native loop.'});
}

// A four-step cut uses fixed world sole anchors. Turning the torso never
// rotates a planted ankle or its support window around the world origin.
{
 const duration=1.8;
 const path=t=>curve([[0,[0,0,0]],[.23,[0,0,.25]],[.48,[0,0,.59]],[.74,[.31,0,.92]],[1,[.58,0,1.17]]],t/duration);
 const ls=[support('LeftFoot',0,.2*duration,[.13,0,.04]),support('LeftFoot',.48*duration,.77*duration,[.31,0,.87])];
 const rs=[support('RightFoot',.22*duration,.49*duration,[-.13,0,.43]),support('RightFoot',.78*duration,duration,[.47,0,1.15])];
 const supports=[...ls,...rs];
 const foot=(t,left)=>{
  const u=t/duration,ws=left?ls:rs,tr=path(t),plant=ws.find(s=>t>=s.start-1e-9&&t<=s.end+1e-9);
  if(plant)return add(sub(plant.anchor,tr),[0,.08,0]);
  const keys=left?[[0,[.13,.08,.04]],[.2,[.13,.08,.04]],[.34,[.20,.28,.47]],[.48,[.31,.08,.87]],[.77,[.31,.08,.87]],[.9,[.52,.22,1.13]],[1,[.67,.1,1.4]]]:
   [[0,[-.13,.10,-.13]],[.1,[-.13,.23,.17]],[.22,[-.13,.08,.43]],[.49,[-.13,.08,.43]],[.64,[.26,.27,.91]],[.78,[.47,.08,1.15]],[1,[.47,.08,1.15]]];
  return sub(curve(keys,u),tr);
 };
 definitions.push({id:'dribble_cut',label:'כדרור בחיתוך',category:'ball',role:'field',duration,loop:false,travel:path,supports,
  sample:t=>{const u=t/duration,turn=45*smooth((u-.36)/.38),load=curve([[0,0],[.32,0],[.46,1],[.7,0],[1,0]],u);
   const dt=1/30,previous=path(Math.max(0,t-dt)),current=path(t),next=path(Math.min(duration,t+dt));
   const acceleration=rotate(euler(0,-turn,0),current.map((v,i)=>(next[i]-2*v+previous[i])/(dt*dt)));
   const limit=x=>Math.max(-20,Math.min(20,x));
   const lean=limit(Math.atan2(acceleration[2],9.81)*180/Math.PI),roll=limit(-Math.atan2(acceleration[0],9.81)*180/Math.PI);
   return pose({hips:[.025*load,.72-.035*load,0],yaw:turn,lean,roll,twist:-8*load,
    leftFoot:foot(t,true),rightFoot:foot(t,false),leftFootYaw:45*smooth((u-.2)/.28),rightFootYaw:45*smooth((u-.49)/.29),
    leftKnee:rotate(euler(0,turn,0),[.03,0,1]),rightKnee:rotate(euler(0,turn,0),[-.03,0,1]),
    leftHand:[.27,.90,.1-.1*load],rightHand:[-.27,.91,.14+.1*load]});},
  events:[...supports.map(s=>ev(s.start,'plant',s.bone,sole)),ev(.3,'contact','RightFoot',[-.04,-.025,.13]),ev(.3,'release','RightFoot',[-.04,-.025,.13]),ev(.8,'contact','LeftFoot'),ev(.8,'release','LeftFoot')],
  ballKind:'dribble',notes:'Original controlled outside-foot cut: right-foot plant accepts weight, pelvis turns 45 degrees, left foot steps into the exit lane, then the right catches up. Four fixed sole anchors are exposed for audit.'});
}

{
 const duration=1.4,supports=[support('LeftFoot',0,duration,[.14,0,.025]),support('RightFoot',0,duration,[-.14,0,-.025])];
 definitions.push({id:'body_feint',label:'הטעיית גוף',category:'ball',role:'field',duration,loop:false,supports,ballKind:'stationary',
  sample:t=>{const u=t/duration,weight=curve([[0,0],[.22,.085],[.43,.075],[.64,-.065],[.84,-.025],[1,0]],u),yaw=curve([[0,0],[.25,17],[.43,13],[.66,-14],[1,0]],u);
   return pose({hips:[weight,.75-.035*Math.sin(Math.PI*u),0],yaw,roll:-weight*55,twist:-yaw*.7,lean:6,
    leftFoot:[.14,.08,.025],rightFoot:[-.14,.08,-.025],leftHand:[.24+weight*.3,.9,.12-weight],rightHand:[-.24+weight*.3,.91,.12+weight]});},
  events:supports.map(s=>ev(0,'plant',s.bone,sole)),notes:'Original grounded body feint: eyes and chest suggest the left lane, load shifts over the left support, then hips reverse over the right support. Feet remain planted and arms remain compact.'});
}

function strike({id,label,duration,contact,back,follow,hipYaw=0,turn=0,height=.15,exitSpeed=12,side=0,loft=0}){
 const spinning=id==='spin_kick',releaseLeft=1.3,replantLeft=1.7,rightPlant=spinning?1.3:.9*duration,recoveryHeading=spinning?70:hipYaw+turn*.85;
 const supports=[...(spinning?[support('LeftFoot',0,releaseLeft,[.13,0,.025]),support('LeftFoot',replantLeft,duration,[.17,0,.09])]:[support('LeftFoot',0,duration,[.13,0,.025])]),support('RightFoot',0,.14*duration,[-.13,0,-.10]),support('RightFoot',rightPlant,duration,[-.13,0,.12])];
 const normalizedContact=contact/duration;
 const frame=t=>{
  const u=t/duration,a=back/duration,f=follow/duration;
  const load=curve([[0,0],[.14,0],[a,1],[normalizedContact,.3],[f,0],[1,0]],u),out=curve([[0,0],[normalizedContact,0],[f,1],[.9,0],[1,0]],u);
  const yaw=curve([[0,hipYaw],[a,hipYaw-19],[normalizedContact,hipYaw+turn*.6],[f,hipYaw+turn],[1,hipYaw+turn*.85]],u);
  const direction=rotate(euler(0,hipYaw+turn*.65,0),[0,0,1]);
  const turnHand=p=>spinning?rotate(euler(0,yaw,0),p):p;
  const leftYaw=spinning?mix(0,recoveryHeading,smooth((t-releaseLeft)/(replantLeft-releaseLeft))):hipYaw;
  const rightYaw=t<=.14*duration?hipYaw:t<back?mix(hipYaw,yaw,smooth((t-.14*duration)/(back-.14*duration))):mix(yaw,recoveryHeading,spinning?smooth((t-follow)/(rightPlant-follow)):smooth((u-.8)/.1));
  const lf=spinning?curve([[0,[.13,.08,.025]],[releaseLeft/duration,[.13,.08,.025]],[(releaseLeft+.2)/duration,[.15,.20,.06]],[replantLeft/duration,[.17,.08,.09]],[1,[.17,.08,.09]]],u):[.13,.08,.025];
  const rf=curve([[0,[-.13,.08,-.10]],[.14,[-.13,.08,-.10]],[a,[-.14,.16,-.34]],
   [normalizedContact,add([-.13,height,0],[direction[0]*.38,0,direction[2]*.38])],
   [f,add([-.1,Math.min(.4,height+.13),0],[direction[0]*.51+side,0,direction[2]*.51])],[rightPlant/duration,[-.13,.08,.12]],[1,[-.13,.08,.12]]],u);
  const supportShift=spinning?curve([[0,0],[releaseLeft,0],[releaseLeft+.15,-.07],[replantLeft,-.07],[duration,0]],t):0;
  return pose({hips:[.055*load+supportShift,.755-.035*load,.035*out-.018*load],yaw,twist:-yaw*.28,lean:4+10*out-4*load,
   leftFoot:lf,rightFoot:rf,leftFootYaw:leftYaw,rightFootYaw:rightYaw,
   leftKnee:rotate(euler(0,(yaw+leftYaw)/2,0),[.03,0,1]),rightKnee:rotate(euler(0,(yaw+rightYaw)/2,0),[-.03,0,1]),
   leftHand:turnHand([.25+.09*load,.88+.13*load,.12-.11*out]),rightHand:turnHand([-.25-.03*load,.9+.13*out,.1-.16*load+.12*out])});
 };
 return {id,label,category:'ball',role:'field',duration,loop:false,sample:frame,supports,
  events:[...supports.map(s=>ev(s.start,'plant',s.bone,sole)),...(spinning?[ev(releaseLeft,'takeoff','LeftFoot',sole),ev(replantLeft,'land','LeftFoot',sole)]:[]),ev(contact,'contact','RightFoot'),ev(contact,'release','RightFoot')],
  ballKind:'kick',exitSpeed,loft,metricsTargets:{anticipation:back,contact,followThrough:follow,exitDirection:rotate(euler(0,hipYaw+turn*.65,0),[0,0,1])},
  notes:'Original strike with a visible support-side weight transfer, separate backswing, ankle-led ball contact and a forward recovery arc. No v8 motion keys or player signature are used.'};
}
definitions.push(strike({id:'spin_kick',label:'בעיטה בסיבוב',duration:1.8,back:.5333333333,contact:.9,follow:1.1666666667,hipYaw:-28,turn:115,height:.18,exitSpeed:13,side:.04}));
definitions.push(strike({id:'volley_kick',label:'בעיטת וולי',duration:1.5,back:.4,contact:.7,follow:1.0,hipYaw:-8,turn:20,height:.43,exitSpeed:15,loft:.7}));
definitions.push(strike({id:'long_shot',label:'בעיטה מרחוק',duration:1.6,back:.5,contact:.8,follow:1.1,hipYaw:0,turn:18,height:.15,exitSpeed:21,loft:1.2}));
definitions.push(strike({id:'through_pass',label:'מסירת עומק',duration:1.3,back:.3666666667,contact:.6,follow:.8333333333,hipYaw:6,turn:7,height:.13,exitSpeed:10,side:-.025}));

{
 const duration=1.6,contact=.7333333333,back=.4666666667,follow=.9666666667;
 const travel=t=>[0,0,1.2*t];
 const supports=[support('LeftFoot',0,.1333333333,[.13,0,0]),support('RightFoot',.1,.3,[-.13,0,.28]),
  support('LeftFoot',.3333333333,.8666666667,[.13,0,.72]),support('RightFoot',1.1,1.4,[-.13,0,1.5]),support('LeftFoot',1.4,duration,[.13,0,1.86])];
 const worldFoot=(t,left)=>{
  const u=t/duration,tr=travel(t),ws=supports.filter(s=>s.bone===(left?'LeftFoot':'RightFoot')),plant=ws.find(s=>t>=s.start-1e-9&&t<=s.end+1e-9);
  if(plant)return add(sub(plant.anchor,tr),[0,.08,0]);
  if(left)return sub(curve([[0,[.13,.08,0]],[.1333333333/duration,[.13,.08,0]],[.24/duration,[.13,.22,.4]],[.3333333333/duration,[.13,.08,.72]],
   [.8666666667/duration,[.13,.08,.72]],[1.15/duration,[.13,.25,1.28]],[1.4/duration,[.13,.08,1.86]],[1,[.13,.08,1.86]]],u),tr);
  const local=curve([[0,[-.13,.16,.15]],[.1/duration,[-.13,.08,.16]],[.3/duration,[-.13,.08,-.08]],[back/duration,[-.15,.17,-.32]],
   [contact/duration,[-.15,.15,.38]],[follow/duration,[-.12,.26,.50]],[1.1/duration,[-.13,.08,.18]],[1.4/duration,[-.13,.08,-.18]],[1,[-.13,.2,.16]]],u);
  return local;
 };
 definitions.push({id:'running_pass',label:'מסירה תוך כדי ריצה',category:'ball',role:'field',duration,loop:false,travel,supports,
  sample:t=>{const u=t/duration,load=curve([[0,0],[back/duration,1],[contact/duration,.3],[follow/duration,0],[1,0]],u),out=curve([[0,0],[contact/duration,0],[follow/duration,1],[1,0]],u);
   return pose({hips:[.05*load,.73-.025*load,.01*out],yaw:-12*load+10*out,twist:9*load-7*out,lean:7+8*out,
    leftFoot:worldFoot(t,true),rightFoot:worldFoot(t,false),leftFootYaw:0,rightFootYaw:20*curve([[0,0],[.3/duration,0],[back/duration,1],[contact/duration,.65],[follow/duration,.4],[1.1/duration,0],[1,0]],u),
    leftHand:[.27+.04*load,.95,.12-.1*out],rightHand:[-.27,.95+.04*out,.12-.13*load+.1*out]});},
  events:[...supports.map(s=>ev(s.start,'plant',s.bone,sole)),ev(contact,'contact','RightFoot',[.035,-.025,.135]),ev(contact,'release','RightFoot',[.035,-.025,.135])],
  ballKind:'kick',exitSpeed:9,metricsTargets:{anticipation:back,contact,followThrough:follow,exitDirection:[0,0,1]},
  notes:'Original moving pass with approach steps, fixed left sole through the strike, a loaded right-leg backswing, forward follow-through and an immediate recovery step. External travel is continuous at 1.2 m/s.'});
}

{
 const duration=1.6,takeoff=.4,contact=.7666666667,land=1.1666666667;
 const supports=[support('LeftFoot',0,takeoff,[.13,0,.015]),support('RightFoot',0,takeoff,[-.13,0,-.015]),support('LeftFoot',land,duration,[.13,0,.09]),support('RightFoot',land,duration,[-.13,0,.06])];
 definitions.push({id:'jump_header',label:'נגיחה מקפיצה',category:'ball',role:'field',duration,loop:false,supports,
  sample:t=>{const u=t/duration,flight=t>takeoff&&t<land?Math.sin(Math.PI*(t-takeoff)/(land-takeoff)):0;
   const bend=curve([[0,0],[.2,1],[takeoff/duration,0],[contact/duration,0],[land/duration,1],[.9,0],[1,0]],u);
   const strike=curve([[0,0],[.35,0],[contact/duration,-8],[.6,15],[.8,4],[1,0]],u);
   const lf=t<=takeoff?[.13,.08,.015]:t>=land?[.13,.08,.09]:[.13,.08+.29*flight,.015+.075*(t-takeoff)/(land-takeoff)];
   const rf=t<=takeoff?[-.13,.08,-.015]:t>=land?[-.13,.08,.06]:[-.13,.08+.25*flight,-.015+.075*(t-takeoff)/(land-takeoff)];
   return pose({hips:[0,.76-.1*bend+.32*flight,.035*flight],leftFoot:lf,rightFoot:rf,lean:strike,head:-strike*.3,
    leftHand:[.26,.9+.2*flight-.08*bend,.1],rightHand:[-.26,.9+.18*flight-.08*bend,.1],twist:3*flight});},
  events:[...supports.map(s=>ev(s.start,'plant',s.bone,sole)),ev(takeoff,'takeoff','Hips',[0,0,0]),ev(contact,'contact','Head',[0,.035,.11]),ev(contact,'release','Head',[0,.035,.11]),ev(land,'land','LeftFoot',sole),ev(land,'land','RightFoot',sole)],
  ballKind:'header',exitSpeed:9,loft:.3,metricsTargets:{anticipation:.3,contact,followThrough:.9666666667},
  notes:'Original two-foot jump header: crouched preload, vertical lift, chest opening before forehead contact, neck-controlled forward follow-through and a flexed-knee two-foot landing.'});
}

if(definitions.length!==17)throw Error(`Expected 17 ball actions, got ${definitions.length}`);
export {definitions};
