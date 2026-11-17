// SPDX-License-Identifier: CC0-1.0
// Original soccer choreography. Every actor is baked on the unchanged canonical18.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {bones,I,pose,fk,solve,point,add,sub,mul,rotate,qi,qm,euler,slerp,mix,curve,smooth,clamp} from './rig.mjs';
import {unpack,compact} from './glb.mjs';
const base=new URL('../',import.meta.url);
const canonical=JSON.parse(await fs.readFile(new URL('canonical-skeleton.json',import.meta.url)));
const templateBytes=await fs.readFile(new URL('qa-reference-idle.glb',import.meta.url));
const template=unpack(templateBytes);
const sha=b=>createHash('sha256').update(b).digest('hex');
const neutral=()=>pose();
const envelope=(t,a,b,c,d)=>smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)));
function blend(a,b,u){return {hips:mix(a.hips,b.hips,u),rotations:Object.fromEntries(bones.map(x=>[x.name,slerp(a.rotations[x.name],b.rotations[x.name],u)]))};}
function actor(id,role='player'){return {id:`actor${id}`,role,rootNode:`actor${id}_Root`,prefix:`actor${id}_`};}
function world(p,bone,local=[0,0,0]){return add(p.root,rotate(p.rootQ,point(p,bone,local)));}
function handTo(p,side,target,amount=1){const local=rotate(qi(p.rootQ),sub(target,p.root));const current=point(p,side+'Hand');solve(p,side+'Arm',side+'ForeArm',side+'Hand',mix(current,local,amount),[side==='Left'?.4:-.4,-.6,-.5]);}
function standing(t,root=[0,0,0],yaw=0,options={}){const p=pose({hips:[0,.78-.012*Math.sin(t*Math.PI)**2,0],...options});p.root=root;p.rootQ=euler(0,yaw,0);return p;}
function supports(actorIndex,start,end,bonesToUse=['LeftFoot','RightFoot'],extra={}){return bonesToUse.map(bone=>({actor:`actor${actorIndex}`,bone,local:[0,-.08,0],start,end,mode:'plant',...extra}));}
const clips=[];
function clip(id,label,duration,actors,sample,config={}){clips.push({id,label,duration,actors:actors.map((r,i)=>actor(i,r)),sample,events:[],supports:[],contacts:[],...config});}
function paired(id,label,coach=false){const duration=4.4,start=1.2,end=2.9;
 clip(id,label,duration,['scorer',coach?'coach':'teammate'],t=>{
  const w=envelope(t,.3,start,end,4.1),ps=[standing(t,[0,0,-.23]),standing(t,[0,0,.23],180)];
  for(let a=0;a<2;a++)for(const side of ['Left','Right']){
   const sign=side==='Left'?1:-1;
   handTo(ps[a],side,world(ps[1-a],'Chest',[-sign*.15,.025,-.055]),w);
  }return ps;
 },{events:[{type:'embrace',time:start},{type:'release',time:end}],supports:[...supports(0,0,duration),...supports(1,0,duration)],contacts:[0,1].flatMap(a=>['Left','Right'].map(side=>({a:{actor:`actor${a}`,bone:side+'Hand',local:[0,0,0]},b:{actor:`actor${1-a}`,bone:'Chest',local:[-(side==='Left'?1:-1)*.15,.025,-.055]},start,end,maxDistanceMeters:.02,type:'embrace'})))});
}
paired('pair_hug','חיבוק זוגי');paired('coach_hug','חיבוק מאמן',true);
clip('chest_bump','קפיצת חזה',4.2,['scorer','teammate'],t=>{
 const w=envelope(t,.35,1.1,2.5,3.9),air=envelope(t,.8,1.25,1.65,2.1),height=.3*air;
 return [0,1].map(a=>standing(t,[a===0?-.0154:.0154,height,a===0?-.14367:.14367],a?180:0,{hips:[0,.78-.08*w*(1-air),0],leftHand:mix([.23,.86,.12],[.43,1.31,.08],w),rightHand:mix([-.23,.86,.12],[-.43,1.31,.08],w)}));
},{events:[{type:'takeoff',time:.8},{type:'chest_contact',time:1.25},{type:'land',time:2.1}],supports:[0,1].flatMap(a=>[...supports(a,0,.8),...supports(a,2.1,4.2)]),contacts:[{a:{actor:'actor0',bone:'Chest',local:[.0154,-.00167,.14367]},b:{actor:'actor1',bone:'Chest',local:[.0154,-.00167,.14367]},start:1.25,end:1.65,maxDistanceMeters:.02,type:'chest'}]});
clip('circle_five','מעגל חגיגה · חמישה',5.2,Array(5).fill('teammate'),t=>{
 const ps=Array.from({length:5},(_,a)=>{const angle=a*2*Math.PI/5,root=[.55*Math.sin(angle),0,.55*Math.cos(angle)];return standing(t,root,angle*180/Math.PI+180,{hips:[0,.76-.025*Math.sin(t*2*Math.PI)**2,0]});});
 const w=envelope(t,.2,1,4.2,5);
 for(let a=0;a<5;a++){const b=(a+1)%5;handTo(ps[a],'Right',world(ps[b],'Chest',[.1510422996,.0022360748,.0063422765]),w);}
 return ps;
},{events:[{type:'circle_lock',time:1},{type:'release',time:4.2}],supports:Array.from({length:5},(_,a)=>supports(a,0,5.2)).flat(),contacts:Array.from({length:5},(_,a)=>({a:{actor:`actor${a}`,bone:'RightHand',local:[0,0,0]},b:{actor:`actor${(a+1)%5}`,bone:'Chest',local:[.1510422996,.0022360748,.0063422765]},start:1,end:4.2,maxDistanceMeters:.02,type:'shoulder_link'}))});
// World-anchored gait: ankle targets remain fixed through each stance interval.
function pathAt(t,lap){return lap?[3.2*Math.sin(t*.32),0,3.2*(1-Math.cos(t*.32))]:[0,0,t*1.05];}
function heading(t,lap){return lap?90-t*.32*180/Math.PI:0;}
function gait(t,lap=false,salute=false){const period=.72,stance=.44,root=pathAt(t,lap),yaw=heading(t,lap),q=euler(0,yaw,0),feet={};
 for(const [side,offset,sign]of [['left',0,1],['right',.5,-1]]){
  const cycle=Math.floor(t/period-offset),u=t/period-offset-cycle,start=(cycle+offset)*period;
  const anchor=add(pathAt(start,lap),rotate(euler(0,heading(start,lap),0),[sign*.12,.08,.18]));
  let foot=anchor;
  if(u>stance){const next=add(pathAt(start+period,lap),rotate(euler(0,heading(start+period,lap),0),[sign*.12,.08,.18])),s=(u-stance)/(1-stance);foot=mix(anchor,next,smooth(s));foot[1]+=.19*Math.sin(Math.PI*s)**2;}
  feet[side+'Foot']=rotate(qi(q),sub(foot,root));
 }
 const phase=t/period*2*Math.PI,pump=.14*Math.sin(phase),p=pose({hips:[0,.78+.018*Math.sin(phase*2),0],lean:9,...feet,leftHand:salute?[.32,1.49,.2]:[.23,1.02,.13+pump],rightHand:[-.23,1.02,.13-pump]});p.root=root;p.rootQ=q;return p;
}
function gaitSupports(duration){const out=[];for(const [side,o]of [['Left',0],['Right',.5]])for(let k=-1;k<Math.ceil(duration/.72);k++){const s=(k+o)*.72,e=s+.44*.72;if(e>0&&s<duration)out.push(...supports(0,Math.max(0,s),Math.min(duration,e),[side+'Foot']));}return out;}
clip('run_to_stands','ריצה לצד היציע',3.6,['scorer'],t=>[gait(t,false,true)],{locomotion:true,events:[{type:'crowd_wave',time:1.2}],supports:gaitSupports(3.6)});
clip('honor_lap','ריצת כבוד',3.6,['scorer'],t=>[gait(t,true,true)],{locomotion:true,events:[{type:'lap_salute',time:2.4}],supports:gaitSupports(3.6)});
clip('knee_slide','החלקה על הברכיים',5,['scorer'],t=>{
 const w=envelope(t,.5,1.3,3.3,4.6),slide=curve([[0,0],[1.3,0],[3.3,1.8],[5,1.8]],t);
 const action=pose({hips:[0,.47,0],leftFoot:[.12,.1,-.35],rightFoot:[-.12,.1,-.35],leftHand:[.4,1.34,.07],rightHand:[-.4,1.34,.07],leftKnee:[0,0,1],rightKnee:[0,0,1]});
 const p=blend(neutral(),action,w);const soleY=Math.min(...['LeftFoot','RightFoot'].map(b=>point(p,b,[0,-.08,0])[1]));p.hips[1]+=Math.max(0,-soleY);p.root=[0,0,slide];p.rootQ=I;return [p];
},{events:[{type:'knees_down',time:1.3},{type:'slide_stop',time:3.3},{type:'stand',time:4.6}],supports:[...supports(0,0,.5),...supports(0,4.6,5)],slide:{actor:'actor0',bones:['LeftLeg','RightLeg'],start:1.3,end:3.3,expectedTravelMeters:1.8}});
clip('backflip','סלטה לאחור',5.6,['scorer'],t=>{
 const takeoff=1.2,land=3.6,u=clamp((t-takeoff)/(land-takeoff)),air=t>takeoff&&t<land;
 const crouch=envelope(t,.25,.9,1.05,1.2)+envelope(t,3.6,3.8,4.1,5.1);
 let p=pose({hips:[0,.78-.12*crouch,0],leftHand:[.23,.86+.22*crouch,.12],rightHand:[-.23,.86+.22*crouch,.12]});
 if(air){const tuck=Math.sin(Math.PI*u)**2;
  p=pose({hips:[0,.78,0],leftFoot:[.12,.08+.35*tuck,.22*tuck],rightFoot:[-.12,.08+.35*tuck,.22*tuck],leftHand:[.23,.86,.2+.14*tuck],rightHand:[-.23,.86,.2+.14*tuck]});
  p.rotations.Hips=qm(euler(-360*smooth(u),0,0),p.rotations.Hips);p.hips[1]+=1.35*Math.sin(Math.PI*u);
 }
 p.root=[0,0,0];p.rootQ=I;return [p];
},{events:[{type:'takeoff',time:1.2},{type:'inverted',time:2.4},{type:'land',time:3.6}],supports:[...supports(0,0,1.2),...supports(0,3.6,5.6)]});
for(const variant of [0,1])clip(variant?'dance_shuffle':'dance','ריקוד'+(variant?' · כתפיים':''),5.2,['scorer'],t=>{
 const w=envelope(t,.2,.9,4.2,5),a=Math.sin((t-.9)*Math.PI*2)*w;
 const p=pose({hips:[a*.035,.78-.035*w*(.5+.5*Math.cos(t*4*Math.PI)),0],twist:a*(variant?20:12),roll:a*3,leftHand:[.26+.055*a,1.04+.22*w+.08*a,.18],rightHand:[-.26+.055*a,1.04+.22*w-.08*a,.18]});
 const n=neutral(),r=blend(n,p,w);r.root=[0,0,0];r.rootQ=I;return [r];
},{events:[{type:'dance_start',time:.9},{type:'dance_finish',time:4.2}],supports:supports(0,0,5.2)});
clip('crowd_salute','הצדעה לקהל',4.4,['scorer'],t=>{
 const w=envelope(t,.3,1.2,2.9,4.1),p=pose({hips:[0,.78,0],leftHand:[.23,.86,.12],rightHand:mix([-.23,.86,.12],[-.13,1.5,.16],w),head:-8*w});p.root=[0,0,0];p.rootQ=I;return [p];
},{events:[{type:'salute',time:1.2},{type:'release',time:2.9}],supports:supports(0,0,4.4)});
clip('trophy_lift','הרמת גביע · קבלה / הרמה / הצגה',6.4,['captain'],t=>{
 const h=curve([[0,1.02],[1.2,1.03],[3.1,1.68],[4.8,1.68],[6.4,1.02]],t),p=standing(t,[0,0,0],0,{hips:[0,.78,0]});
 for(const side of ['Left','Right'])handTo(p,side,[(side==='Left'?1:-1)*.167,h,.23]);
 p.trophy=[0,h-.05,.23];return [p];
},{events:[{type:'receive',time:1.2},{type:'raise',time:3.1},{type:'present',time:4.8}],phases:[{id:'receive',start:0,end:1.2},{id:'raise',start:1.2,end:3.1},{id:'present',start:3.1,end:6.4}],supports:supports(0,0,6.4),prop:'trophy',contacts:['Left','Right'].map(side=>({a:{actor:'actor0',bone:side+'Hand',local:[0,0,0]},b:{node:'Trophy',local:[(side==='Left'?1:-1)*.167,.05,0]},start:0,end:6.4,maxDistanceMeters:.02,type:'trophy_handle'}))});
const shoulderProbes={Left:[-.009902024,-.017278628,-.003574700],Right:[.007630407,-.017758509,-.009096339]};
clip('goalkeeper_hang','תלייה על השוער',5.2,['goalkeeper','scorer'],t=>{
 const w=envelope(t,.4,1.4,3.5,4.7),keeper=standing(t,[0,0,0],0,{hips:[0,.78-.04*w,0]}),rider=standing(t,[0,.36*w,-.29],0,{hips:[0,.78,0],leftFoot:[.18,.08+.24*w,-.12*w],rightFoot:[-.18,.08+.24*w,-.12*w]});
 for(const side of ['Left','Right'])handTo(keeper,side,world(rider,side+'UpLeg',[0,-.1,-.03]),w);
 for(const side of ['Left','Right'])handTo(rider,side,world(keeper,side+'Arm',shoulderProbes[side]),w);
 return [keeper,rider];
},{events:[{type:'mount',time:1.4},{type:'release',time:3.5}],supports:[...supports(0,0,5.2),...supports(1,0,.4),...supports(1,4.7,5.2)],contacts:['Left','Right'].map(side=>({a:{actor:'actor1',bone:side+'Hand',local:[0,0,0]},b:{actor:'actor0',bone:side+'Arm',local:shoulderProbes[side]},start:1.4,end:3.5,maxDistanceMeters:.02,type:'shoulder_hold'}))});
const liftProbes=[[[-.0577461587,-.0463299092,.0691030524],[-.013028539,-.0100752159,-.0798511576]],[[.0577754908,-.0459334892,.0695839882],[.0123384438,-.0077254937,-.0801253998]]];
clip('player_lift','הרמת שחקן',5.6,['carrier_left','carrier_right','scorer'],t=>{
 const w=envelope(t,.4,1.5,3.8,5.1),lifted=standing(t,[0,.4*w,0],0,{hips:[0,.78,0],leftFoot:[.18,.08+.16*w,.1*w],rightFoot:[-.18,.08+.16*w,.1*w],leftHand:mix([.23,.86,.12],[.43,1.4,.08],w),rightHand:mix([-.23,.86,.12],[-.43,1.4,.08],w)});
 const ps=[standing(t,[-.38,0,0]),standing(t,[.38,0,0]),lifted];
 for(const a of [0,1])for(const side of ['Left','Right'])handTo(ps[a],side,world(lifted,a===0?'RightUpLeg':'LeftUpLeg',liftProbes[a][side==='Left'?0:1]),w);
 return ps;
},{events:[{type:'lift',time:1.5},{type:'lower',time:3.8}],supports:[...supports(0,0,5.6),...supports(1,0,5.6),...supports(2,0,.4),...supports(2,5.1,5.6)],contacts:[0,1].flatMap(a=>['Left','Right'].map(side=>({a:{actor:`actor${a}`,bone:side+'Hand',local:[0,0,0]},b:{actor:'actor2',bone:a===0?'RightUpLeg':'LeftUpLeg',local:liftProbes[a][side==='Left'?0:1]},start:1.5,end:3.8,maxDistanceMeters:.02,type:'thigh_support'})))});

// Lathed cup with two physical handles, stem and base. No external prop asset.
function trophyGeometry(){const positions=[],normals=[],indices=[];const rings=[[.0,.09],[.035,.1],[.055,.055],[.1,.022],[.2,.022],[.22,.055],[.25,.07],[.3,.095],[.38,.115],[.4,.115],[.4,.095],[.38,.095],[.31,.075],[.27,.045]];
 for(let k=0;k<rings.length;k++)for(let i=0;i<24;i++){const a=i*Math.PI/12,[y,r]=rings[k];positions.push(r*Math.cos(a),y,r*Math.sin(a));normals.push(Math.cos(a),.2,Math.sin(a));if(k<rings.length-1){const a=k*24+i,b=k*24+(i+1)%24;indices.push(a,b,b+24,a,b+24,a+24);}}
 for(const sign of [-1,1]){const start=positions.length/3;for(let i=0;i<=16;i++){const a=-Math.PI/2+i*Math.PI/16;for(let j=0;j<8;j++){const b=j*Math.PI/4;positions.push(sign*(.09+.064*Math.cos(a))+.013*Math.cos(b)*Math.cos(a),.29+.074*Math.sin(a)+.013*Math.cos(b)*Math.sin(a),.013*Math.sin(b));normals.push(Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b));if(i<16){const n=start+i*8+j,m=start+i*8+(j+1)%8;indices.push(n,m,m+8,n,m+8,n+8);}}}}
 for(let i=1;i<positions.length;i+=3)positions[i]-=.24;for(let i=0;i<normals.length;i+=3){const n=Math.hypot(...normals.slice(i,i+3));for(let j=0;j<3;j++)normals[i+j]/=n;}return {positions,normals,indices};}
await fs.mkdir(new URL('models/',base),{recursive:true});
const entries=[];
for(const c of clips){
 const samples=Array.from({length:Math.round(c.duration*30)+1},(_,i)=>c.sample(i/30));
 const d=structuredClone(template.document);d.nodes=[];d.skins=[];d.scenes=[{nodes:[]}];d.scene=0;d.animations=[];
 const parts=[template.binary];let length=template.binary.length;
 function acc(values,width,type=5126){const bytes=type===5123?Buffer.from(new Uint16Array(values).buffer):Buffer.from(new Float32Array(values).buffer);const pad=(4-length%4)%4;if(pad){parts.push(Buffer.alloc(pad));length+=pad;}const view=d.bufferViews.length;d.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});parts.push(bytes);length+=bytes.length;const record={bufferView:view,componentType:type,count:values.length/width,type:({1:'SCALAR',3:'VEC3',4:'VEC4'})[width]};if(width===1||width===3){record.min=Array.from({length:width},(_,i)=>Math.min(...values.filter((_,k)=>k%width===i)));record.max=Array.from({length:width},(_,i)=>Math.max(...values.filter((_,k)=>k%width===i)));}d.accessors.push(record);return d.accessors.length-1;}
 const input=acc(samples.map((_,i)=>i/30),1),anim={name:c.id,samplers:[],channels:[],extras:{nativeRate:30,events:c.events}};
 function channel(node,path,values,width){anim.channels.push({sampler:anim.samplers.length,target:{node,path}});anim.samplers.push({input,output:acc(values,width),interpolation:'LINEAR'});}
 function quats(values){let prev;return values.flatMap(q=>{if(prev&&q.reduce((s,x,i)=>s+x*prev[i],0)<0)q=q.map(x=>-x);prev=q;return q;});}
 for(let a=0;a<c.actors.length;a++){
  const offset=d.nodes.length,src=template.document;const group=[];
  for(const n of src.nodes){const v=structuredClone(n);v.name=`actor${a}_${n.name}`;if(v.children)v.children=v.children.map(i=>i+offset);if(v.skin!==undefined)v.skin=a;d.nodes.push(v);}
  const skin=structuredClone(src.skins[0]);skin.name=`actor${a}_canonical18`;skin.joints=skin.joints.map(i=>i+offset);skin.skeleton+=offset;d.skins.push(skin);d.scenes[0].nodes.push(...src.scenes[0].nodes.map(i=>i+offset));
  for(let b=0;b<bones.length;b++)channel(offset+b,'rotation',quats(samples.map(s=>b===0?s[a].rootQ:s[a].rotations[bones[b].name])),4);
  channel(offset+1,'translation',samples.flatMap(s=>s[a].hips),3);channel(offset,'translation',samples.flatMap(s=>s[a].root),3);
  // Distinct kit tint for readable partner roles, sharing the original embedded atlas.
  if(a){const mesh=structuredClone(src.meshes[0]),mat=structuredClone(src.materials[1]);mat.name=`actor${a}_kit`;mat.pbrMetallicRoughness.baseColorFactor=a%2?[1,.58,.3,1]:[.65,.82,1,1];const mi=d.materials.length;d.materials.push(mat);for(const p of mesh.primitives)if(p.material===1)p.material=mi;const index=d.meshes.length;d.meshes.push(mesh);d.nodes[offset+18].mesh=index;}
 }
 if(c.prop==='trophy'){const g=trophyGeometry(),material=d.materials.length;d.materials.push({name:'Trophy_gold',pbrMetallicRoughness:{baseColorFactor:[.95,.66,.12,1],metallicFactor:.75,roughnessFactor:.25},doubleSided:true});const mesh=d.meshes.length;d.meshes.push({name:'Original_trophy',primitives:[{attributes:{POSITION:acc(g.positions,3),NORMAL:acc(g.normals,3)},indices:acc(g.indices,1,5123),material}]});const node=d.nodes.length;d.nodes.push({name:'Trophy',mesh});d.scenes[0].nodes.push(node);channel(node,'translation',samples.flatMap(s=>s[0].trophy),3);}
 d.animations=[anim];const {sample,...meta}=c;d.asset.generator='soccer-celebrations-v1 · canonical18 · 30Hz · original CC0 choreography';d.extras={...meta,nativeRate:30,canonicalBoneCount:18,rootMotion:true,compression:'none',actorTimeOffsets:c.actors.map(()=>0)};d.buffers=[{byteLength:length}];
 const bytes=compact(d,Buffer.concat(parts)),asset=`models/${c.id}.glb`;await fs.writeFile(new URL(asset,base),bytes);entries.push({...meta,asset,frameCount:samples.length,nativeRate:30,rootMotion:true,sheet:`sheets/${c.id}.webp`,bytes:bytes.length,sha256:sha(bytes)});
}
const catalog={schemaVersion:1,id:'soccer-celebrations-v1',license:'CC0-1.0',nativeRate:30,clipCount:14,axes:canonical.axes,units:'meters',skeleton:canonical.bones,rootMotionPolicy:'World trajectory is baked in each actor Root. Apply the choreography group origin once; do not add simulation travel a second time.',synchronization:{clock:'single animation time in seconds',actorStartOffsetsSeconds:0,pause:'freeze shared mixer',interrupt:'blend all participants together after releasing declared contacts'},countDecision:'13 requested actions; trophy contains three phases in one clip; 14th is a second dance, confirmed by user.',template:{path:'workout/island/design/soccer-header-v1/runtime/reference/idle_relaxed.glb',sha256:sha(templateBytes),license:'CC0-1.0'},clips:entries};
await fs.writeFile(new URL('catalog.json',base),JSON.stringify(catalog,null,2)+'\n');
console.log(`Baked ${entries.length} clips; ${entries.reduce((s,c)=>s+c.bytes,0)} GLB bytes`);
