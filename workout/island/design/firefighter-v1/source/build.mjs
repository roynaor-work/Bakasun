// SPDX-License-Identifier: CC0-1.0
// Original equipment and keyframe authoring. The existing CC0 canonical IK is reused.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {bones,pose,fk,euler,curve,clamp,smooth,mix} from '../../soccer-header-v1/source/rig.mjs';
import {GLB,unpack,compact} from './glb.mjs';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const p of ['models','motions','verification','sprites'])await mkdir(path.join(base,p),{recursive:true});
const manifestPath=path.join(base,'manifest.json');
const palette={red:'#e54935',red_dark:'#ad2d29',reflective_lime:'#e8f067',reflective_silver:'#edf7f1',
  helmet_yellow:'#ffcc39',charcoal:'#243747',rubber:'#132534',metal:'#a6c4cd',glass:'#89dce5',hose:'#dba76c',cat:'#e9ad66',cat_cream:'#fff0d1',eyes:'#193847'};
const regionNames=Object.keys(palette),colors=regionNames.map(n=>new T.Color(palette[n]).toArray());
const boneId=Object.fromEntries(bones.map((b,i)=>[b.name,i]));
function skeleton(){return bones.map(b=>{const children=bones.flatMap((c,i)=>c.parent===b.name?[i]:[]);return {name:b.name,translation:[...b.rest],...(children.length?{children}:{})};});}
const equipment=new GLB(skeleton()),j=equipment.json;
j.materials=[{name:'equipment_vertex_regions',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.77}},
  {name:'visor_vertex_glass',alphaMode:'BLEND',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[1,1,1,.32],metallicFactor:0,roughnessFactor:.24}}];
const parts=[];
function geomRecord(g,region,skin) {
  if(g.index)g=g.toNonIndexed();
  const p=Array.from(g.attributes.position.array),n=Array.from(g.attributes.normal.array),count=p.length/3;
  return {p,n,c:Array.from({length:count},()=>colors[regionNames.indexOf(region)]).flat(),r:Array(count).fill(regionNames.indexOf(region)),skin};
}
function box(size,position,region,rotation=[0,0,0]) {
  const g=new T.BoxGeometry(...size);g.rotateX(rotation[0]);g.rotateY(rotation[1]);g.rotateZ(rotation[2]);g.translate(...position);
  return geomRecord(g,region);
}
function roundedBoot(size,position,region){
  const [w,h,d]=size.map(v=>v/2),cut=.025;
  const ring=[[w-cut,d],[-w+cut,d],[-w,d-cut],[-w,-d+cut],[-w+cut,-d],[w-cut,-d],[w,-d+cut],[w,d-cut]];
  const out=[],point=(i,y)=>[ring[i][0]+position[0],y+position[1],ring[i][1]+position[2]],tri=(a,b,c)=>out.push(...a,...b,...c);
  for(let i=0;i<8;i++){const k=(i+1)%8;tri(point(i,-h),point(i,h),point(k,h));tri(point(i,-h),point(k,h),point(k,-h));}
  for(let i=1;i<7;i++){tri(point(0,-h),point(i,-h),point(i+1,-h));tri(point(0,h),point(i+1,h),point(i,h));}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(out,3));g.computeVertexNormals();return geomRecord(g,region);
}
function sphere(size,position,region,segments=8,rings=4,thetaLength=Math.PI){
  const g=new T.SphereGeometry(1,segments,rings,0,Math.PI*2,0,thetaLength);g.scale(...size);g.translate(...position);return geomRecord(g,region);
}
function loft(sections,regions,segments=8,cap=true,skin) {
  const p=[],n=[],c=[],r=[],weights=[],joints=[];
  function vertex(v,normal,region){p.push(...v);n.push(...normal);c.push(...colors[regionNames.indexOf(region)]);r.push(regionNames.indexOf(region));
    if(skin){const pair=skin(v);joints.push(...pair.joints);weights.push(...pair.weights);}}
  function tri(a,b,c0,region){const normal=new T.Vector3().subVectors(new T.Vector3(...b),new T.Vector3(...a)).cross(new T.Vector3().subVectors(new T.Vector3(...c0),new T.Vector3(...a))).normalize().toArray();for(const v of [a,b,c0])vertex(v,normal,region);}
  const ring=s=>Array.from({length:segments},(_,i)=>{const a=i*Math.PI*2/segments;return [s[1]*Math.cos(a),s[0],(s[3]??0)+s[2]*Math.sin(a)];});
  for(let k=1;k<sections.length;k++){const a=ring(sections[k-1]),b=ring(sections[k]);for(let i=0;i<segments;i++){const h=(i+1)%segments;tri(a[i],b[i],b[h],regions[k-1]);tri(a[i],b[h],a[h],regions[k-1]);}}
  if(cap)for(const [k,reverse]of [[0,false],[sections.length-1,true]]){const a=ring(sections[k]);for(let i=1;i<segments-1;i++)tri(a[0],a[reverse?i+1:i],a[reverse?i:i+1],regions[reverse?regions.length-1:0]);}
  return {p,n,c,r,joints,weights};
}
function mesh(name,bone,records,{material=0,skinned=false,parent,extras={}}={}) {
  const merged=Object.fromEntries(['p','n','c','r','joints','weights'].map(k=>[k,records.flatMap(x=>x[k]??[])]));
  const attrs={POSITION:equipment.accessor(merged.p,'VEC3',5126,34962),NORMAL:equipment.accessor(merged.n,'VEC3',5126,34962),
    COLOR_0:equipment.accessor(merged.c,'VEC3',5126,34962),_REGION:equipment.accessor(merged.r,'SCALAR',5121,34962)};
  if(skinned){attrs.JOINTS_0=equipment.accessor(merged.joints,'VEC4',5123,34962);attrs.WEIGHTS_0=equipment.accessor(merged.weights,'VEC4',5126,34962);}
  const mesh=j.meshes.push({name,primitives:[{attributes:attrs,material,mode:4}]})-1;
  const node={name,mesh,extras:{attachBone:bone,vertexRegions:regionNames,...extras}};
  if(skinned)node.skin=0;
  const id=j.nodes.push(node)-1;
  if(parent!==undefined)(j.nodes[parent].children??=[]).push(id);
  else if(bone)(j.nodes[boneId[bone]].children??=[]).push(id);
  else j.scenes[0].nodes.push(id);
  parts.push({node:name,attachmentBone:bone,triangles:merged.p.length/9,vertices:merged.p.length/3,skinned,material:j.materials[material].name});
  return id;
}
function torsoSkin(v){
  const y=v[1],stops=[[.82,'Hips'],[1.04,'Spine'],[1.27,'Chest']];
  let a=stops[0],b=stops[1];if(y>=1.04){a=stops[1];b=stops[2];}
  const u=clamp((y-a[0])/(b[0]-a[0]));return {joints:[u===1?0:boneId[a[1]],u===0?0:boneId[b[1]],0,0],weights:[1-u,u,0,0]};
}
const torso=loft([[.77,.20,.155,.013],[.82,.202,.158,.013],[.86,.202,.158,.013],[.88,.20,.157,.013],
  [1.08,.197,.16,.013],[1.12,.204,.161,.013],[1.14,.205,.161,.013],[1.29,.22,.153,.013],[1.35,.147,.114,.013]],
  ['red_dark','reflective_lime','reflective_silver','red','reflective_lime','reflective_silver','red','red'],8,true,torsoSkin);
mesh('jacket',null,[torso],{skinned:true,extras:{description:'Skinned coat, rings blend Hips/Spine/Chest; linear COLOR_0 + integer _REGION.'}});
mesh('jacket_details','Chest',[
  box([.026,.32,.018],[0,-.06,.177],'charcoal'),box([.105,.075,.021],[.10,-.035,.172],'red_dark'),box([.105,.075,.021],[-.10,-.035,.172],'red_dark'),
  box([.032,.34,.025],[.13,-.06,.18],'charcoal'),box([.032,.34,.025],[-.13,-.06,.18],'charcoal'),
  box([.064,.03,.012],[.10,.006,.19],'reflective_silver')]);
mesh('jacket_collar','Neck',[loft([[-.025,.132,.115,0],[.065,.083,.085,0]],['red_dark'],8)]);
mesh('pants_waist','Hips',[loft([[-.13,.18,.143,.015],[.015,.18,.143,.015]],['red_dark'],8)]);
for(const [side,sign]of [['Left',1],['Right',-1]]){
  mesh(`jacket_sleeve_${side.toLowerCase()}_upper`,side+'Arm',[
    loft([[-.29,.069,.082,0],[-.15,.079,.092,0],[.035,.081,.09,0]],['red','red'],8,false)]);
  mesh(`jacket_sleeve_${side.toLowerCase()}_lower`,side+'ForeArm',[
    loft([[-.25,.053,.061,0],[-.205,.058,.065,0],[-.178,.059,.066,0],[-.15,.061,.067,0],[.022,.072,.082,0]],['charcoal','reflective_silver','reflective_lime','red'],8,false)]);
  mesh(`pants_${side.toLowerCase()}_upper`,side+'UpLeg',[
    loft([[-.435,.077,.083,.014],[-.25,.093,.102,.028],[-.035,.099,.122,.028]],['red_dark','red_dark'],8,false)]);
  mesh(`pants_${side.toLowerCase()}_lower`,side+'Leg',[
    loft([[-.31,.067,.075,0],[-.25,.071,.08,0],[-.22,.072,.081,0],[-.19,.074,.083,0],[.025,.079,.086,0]],['charcoal','reflective_silver','reflective_lime','red_dark'],8,false)]);
  mesh(`glove_${side.toLowerCase()}`,side+'Hand',[
    loft([[-.181,.033,.049,.008],[-.14,.049,.064,.008],[-.025,.047,.059,.008],[.012,.048,.058,.008]],['charcoal','charcoal','rubber'],6),
    box([.037,.073,.045],[-sign*.045,-.05,.035],'charcoal',[0,0,sign*.35])]);
  mesh(`boot_${side.toLowerCase()}`,side+'Foot',[
    box([.133,.044,.339],[0,-.053,.078],'rubber'),roundedBoot([.128,.09,.314],[0,-.004,.078],'charcoal'),
    loft([[.005,.068,.087,.018],[.15,.067,.08,.013]],['charcoal'],6)]);
}
mesh('helmet','Head',[
  loft([[.207,.151,.18,-.003],[.227,.151,.18,-.003],[.24,.123,.145,-.005],[.31,.106,.12,-.01],[.343,.045,.06,-.012]],['helmet_yellow','helmet_yellow','helmet_yellow','helmet_yellow'],10),
  box([.028,.025,.205],[0,.326,-.006],'reflective_lime'),box([.065,.051,.014],[0,.255,.147],'charcoal'),
  box([.031,.026,.008],[0,.255,.157],'reflective_silver')]);
mesh('helmet_visor','Head',[box([.229,.128,.012],[0,.15,.173],'glass')],{material:1});
mesh('oxygen_mask','Head',[
  box([.15,.084,.036],[0,.082,.16],'charcoal'),
  box([.042,.028,.012],[.041,.102,.185],'glass'),box([.042,.028,.012],[-.041,.102,.185],'glass'),
  box([.197,.018,.014],[0,.104,-.077],'charcoal')],{extras:{optional:true,independentVisibility:true}});
// The mask regulator is moved in the node's own geometry, keeping its part independent.
const reg=mesh('mask_regulator','Head',[box([.055,.045,.04],[0,.04,.192],'metal')]);
j.nodes[reg].extras.visibilityGroup='oxygen_mask';
mesh('air_backpack','Chest',[
  box([.18,.31,.054],[0,-.08,-.169],'charcoal'),
  loft([[-.265,.056,.056,-.24],[-.22,.077,.077,-.24],[.085,.077,.077,-.24],[.125,.045,.045,-.24]],['metal','helmet_yellow','metal'],8),
  box([.166,.035,.035],[0,-.185,-.304],'charcoal'),box([.166,.035,.035],[0,.032,-.304],'charcoal')]);
const nozzle=mesh('nozzle','RightHand',[
  loft([[-.31,.042,.042,.035],[-.275,.047,.047,.035],[-.23,.034,.034,.035],[-.075,.031,.031,.035],[-.044,.038,.038,.035]],['helmet_yellow','metal','charcoal','metal'],8),
  box([.028,.05,.073],[0,-.11,.065],'charcoal')],{extras:{axis:[0,-1,0],inlet:[0,-.045,.035],grip:[0,-.10,0],emitter:[0,-.315,.035]}});
const emitter=j.nodes.push({name:'water_emitter',translation:[0,-.315,.035]})-1;j.nodes[nozzle].children=[emitter];
// Analytic tube plus a line-strip centerline. Runtime deforms these same vertices.
const hosePoints=Array.from({length:19},(_,i)=>{
  const t=i/18;const points=[[0,1.0,-.28],[-.27,.79,-.18],[-.36,.45,.05],[-.33,.59,.30],[-.16,.91,.42]];
  return new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))).getPoint(t).toArray();
});
const hoseCurve=new T.CatmullRomCurve3(hosePoints.map(p=>new T.Vector3(...p)));
mesh('hose_surface',null,[geomRecord(new T.TubeGeometry(hoseCurve,18,.014,5,false),'hose')],{extras:{deformable:true,pathSamples:19,radialSegments:5,radius:.014}});
const linePrimitive={mode:3,attributes:{POSITION:equipment.accessor(hosePoints.flat(),'VEC3',5126,34962),COLOR_0:equipment.accessor(hosePoints.flatMap(()=>colors[regionNames.indexOf('hose')]),'VEC3',5126,34962),_REGION:equipment.accessor(hosePoints.map(()=>regionNames.indexOf('hose')),'SCALAR',5121,34962)},material:0};
const lineMesh=j.meshes.push({name:'hose_centerline',primitives:[linePrimitive]})-1;
const lineNode=j.nodes.push({name:'hose_centerline',mesh:lineMesh,extras:{deformable:true,representation:'LINE_STRIP',defaultVisible:false}})-1;j.scenes[0].nodes.push(lineNode);
// Canonical inverse bind matrices; all geometry remains in canonical metres.
const restWorld=fk({hips:[0,.86,0],rotations:Object.fromEntries(bones.map(b=>[b.name,[0,0,0,1]]))});
const inverses=bones.flatMap(b=>new T.Matrix4().makeTranslation(...restWorld[b.name].position.map(v=>-v)).toArray());
j.skins=[{name:'canonical18',skeleton:0,joints:bones.map((_,i)=>i),inverseBindMatrices:equipment.accessor(inverses,'MAT4')}];

// Independent mild 10 Hz nozzle vibration, 1 second, repeat only during spray.
function appendAnimation(writer,id,frames,metadata={},nozzleOnly=false){
  const a={name:id,channels:[],samplers:[],extras:metadata};
  const times=writer.accessor(frames.map(f=>f.time),'SCALAR');
  function channel(node,key,type,values){const output=writer.accessor(values,type);const sampler=a.samplers.push({input:times,output,interpolation:'LINEAR'})-1;a.channels.push({sampler,target:{node,path:key}});}
  if(nozzleOnly){channel(nozzle,'rotation','VEC4',frames.flatMap(f=>f.rotation));channel(nozzle,'translation','VEC3',frames.flatMap(f=>f.translation));}
  else {for(const [i,b]of bones.entries())channel(i,'rotation','VEC4',frames.flatMap(f=>f.rotations[b.name]));channel(boneId.Hips,'translation','VEC3',frames.flatMap(f=>f.hips));}
  (writer.json.animations??=[]).push(a);
}
appendAnimation(equipment,'nozzle_spray_vibration',Array.from({length:31},(_,i)=>{const phase=2*Math.PI*10*i/30;return {time:i/30,rotation:euler(.65*Math.sin(phase),0,.4*Math.sin(phase)),translation:[0,.0015*Math.sin(phase),0]};}),{nativeRate:30,loop:true,maximumTranslationMeters:.0015,maximumRotationDegrees:.77,sprayOnly:true},true);
const equipmentBytes=equipment.finish();await writeFile(path.join(base,'models/firefighter-equipment.glb'),equipmentBytes);
// The mask is also independently loadable; use this instead of the kit's mask nodes.
const item=unpack(equipmentBytes),maskNames=['oxygen_mask','mask_regulator'];
const maskNodes=maskNames.map(name=>structuredClone(item.json.nodes.find(n=>n.name===name)));
const maskMeshes=maskNodes.map(n=>structuredClone(item.json.meshes[n.mesh]));maskNodes.forEach((n,i)=>n.mesh=i);
const maskDocument={asset:{...item.json.asset},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'oxygen_mask_item',children:[1,2],extras:{attachBone:'Head',space:'Head-local canonical metres',license:'CC0-1.0'}},...maskNodes],
  meshes:maskMeshes,materials:[structuredClone(item.json.materials[0])],accessors:structuredClone(item.json.accessors),bufferViews:structuredClone(item.json.bufferViews),buffers:structuredClone(item.json.buffers)};
const maskBytes=compact(maskDocument,item.binary);await writeFile(path.join(base,'models/oxygen-mask.glb'),maskBytes);

const READY={hips:[0,.795,0],leftFoot:[.14,.08,.035],rightFoot:[-.14,.08,.035],lean:8,
  rightHand:[-.16,1.00,.34],leftHand:[-.10,1.04,.43],rightHandAim:euler(-90),leftHandAim:euler(-90)};
const CROUCH={...READY,hips:[0,.37,-.08],lean:65,leftFoot:[.14,.08,.035],rightFoot:[-.14,.08,.035],rightHand:[-.16,.52,.51],leftHand:[-.10,.56,.60]};
function interpolateSettings(a,b,u){const result={...a,...b};for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
  if(typeof a[key]==='number'&&typeof b[key]==='number')result[key]=mix(a[key],b[key],u);
  else if(key.endsWith('HandAim')&&a[key]&&b[key])result[key]=new T.Quaternion(...a[key]).slerp(new T.Quaternion(...b[key]),u).normalize().toArray();
  else if(Array.isArray(a[key])&&Array.isArray(b[key]))result[key]=mix(a[key],b[key],u);
}return result;}
function footCycle(t,offset,period,stance,stride,lift,x){
  const u=((t/period+offset)%1+1)%1;let z,y=.08;
  if(u<stance)z=stride/2-stride*u/stance;
  else {const s=(u-stance)/(1-stance),m=-stride/stance*(1-stance);z=(-stride/2)*(2*s*s*s-3*s*s+1)+(stride/2)*(-2*s*s*s+3*s*s)+m*(2*s*s*s-3*s*s+s);y+=lift*Math.sin(Math.PI*s)**2;}
  return [x,y,z];
}
function supportGait(duration,period,stance){const out=[];for(const [bone,offset]of [['LeftFoot',0],['RightFoot',.5]])for(let k=-1;k<=duration/period+1;k++){
  const start=Math.max(0,(k-offset)*period),end=Math.min(duration,(k+stance-offset)*period);if(end-start>.02)out.push({bone,start,end,local:[0,-.08,0]});}return out;}
const BOTH=d=>['LeftFoot','RightFoot'].map(bone=>({bone,start:0,end:d,local:[0,-.08,0]}));
function gait(t,c){
  const {period,stance,stride,lift,crouch=false,carry=false}=c;
  const s=structuredClone(crouch?CROUCH:READY),w=2*Math.PI*t/period;
  s.hips=[.006*Math.sin(w),crouch?CROUCH.hips[1]:.745+.018*Math.cos(2*w),crouch?-.08:0];
  s.leftFoot=footCycle(t,0,period,stance,stride,lift,crouch?.16:.14);s.rightFoot=footCycle(t,.5,period,stance,stride,lift,crouch?-.16:-.14);
  if(!crouch&&!carry){s.leftHand=[.22,1.00,.29+.11*Math.sin(w)];s.rightHand=[-.19,1.00,.29-.11*Math.sin(w)];}
  if(carry){s.leftHand=[.20,1.025,.32];s.rightHand=[-.20,1.025,.32];s.leftHandAim=euler(-70);s.rightHandAim=euler(-70);s.lean=5;}
  return s;
}
const clips=[];
function clip(id,label,duration,settings,{loop=false,locomotion=false,speed=0,supports=BOTH(duration),events=[],role='firefighter',...extra}={}){
  const frames=Array.from({length:Math.round(duration*30)+1},(_,i)=>{const time=i/30,p=pose(settings(time));
    for(const name of Object.keys(p.rotations))p.rotations[name]=new T.Quaternion(...p.rotations[name]).normalize().toArray();
    return {time,hips:p.hips,rotations:p.rotations,reachError:p.reachError};});
  clips.push({id,label,duration,nativeRate:30,frameCount:frames.length,loop,locomotion,speed,role,supports,events,
    soleLocal:[0,-.08,0],checkHingeDirection:true,symmetryMode:locomotion?'gait':'structural',rootMotion:false,...extra,frames});
}
clip('idle_ready','מוכנים להצלה',2.4,t=>({...READY,hips:[0,.795+.002*(1-Math.cos(t/2.4*2*Math.PI)),0]}),{loop:true,nozzle:'hand'});
for(const c of [
  {id:'walk',label:'הליכה',period:1.2,stance:.62,stride:.45,lift:.09},
  {id:'run',label:'ריצה',period:.8,stance:.44,stride:.68,lift:.22},
  {id:'crouch_walk',label:'הליכה נמוכה מתחת לעשן',period:1.6,stance:.68,stride:.29,lift:.055,crouch:true},
  {id:'carry_child',label:'נשיאת ילד',period:1.4,stance:.66,stride:.34,lift:.065,carry:true},
  {id:'carry_cat',label:'נשיאת חתול',period:1.4,stance:.66,stride:.34,lift:.065,carry:true}
])clip(c.id,c.label,c.period,t=>gait(t,c),{loop:true,locomotion:true,speed:c.stride/(c.stance*c.period),supports:supportGait(c.period,c.period,c.stance),
  role:c.crouch?'crouch':'firefighter',nozzle:c.carry?'backpack':'hand',carried:c.id==='carry_child'?'child':c.id==='carry_cat'?'cat':null});
clip('idle_crouch','מוכנים במצב נמוך',2.4,t=>({...CROUCH,hips:[0,CROUCH.hips[1]+.001*(1-Math.cos(t/2.4*2*Math.PI)),-.08]}),{loop:true,role:'crouch',nozzle:'hand',supplemental:true});
clip('spray_stand','ריסוס בעמידה',3.2,t=>{
  const u=curve([[0,0],[.6,1],[2.6,1],[3.2,0]],t),s=interpolateSettings(READY,{...READY,hips:[0,.775,-.018],lean:12,rightHand:[-.16,1.05,.38],leftHand:[-.10,1.09,.455]},u);return s;
},{nozzle:'hand',events:[{type:'spray_start',time:.6},{type:'spray_stop',time:2.6}],sprayWindow:[.6,2.6]});
clip('spray_crouch','ריסוס נמוך',4,t=>{
  const u=curve([[0,0],[.9,1],[3.1,1],[4,0]],t);return interpolateSettings(READY,CROUCH,u);
},{nozzle:'hand',events:[{type:'spray_start',time:1},{type:'spray_stop',time:3}],sprayWindow:[1,3]});
clip('open_door','פתיחת דלת בבעיטה',2.6,t=>{
  const u=curve([[0,0],[.5,.4],[1.0333333333,1],[1.4,.4],[2.1,0],[2.6,0]],t);
  const s=interpolateSettings(READY,{...READY,hips:[.10,.75,-.035],lean:-5,leftHand:[.31,1.17,.12],rightHand:[-.29,1.12,.15]},u);
  s.rightFoot=curve([[0,READY.rightFoot],[.3,READY.rightFoot],[.7,[-.14,.30,.08]],[1.0333333333,[-.14,.42,.62]],[1.4,[-.14,.30,.10]],[1.9,READY.rightFoot],[2.6,READY.rightFoot]],t);
  return s;
},{nozzle:'backpack',supports:[{bone:'LeftFoot',start:0,end:2.6,local:[0,-.08,0]},{bone:'RightFoot',start:0,end:.3,local:[0,-.08,0]},{bone:'RightFoot',start:1.9,end:2.6,local:[0,-.08,0]}],events:[{type:'door_kick',time:31/30,bone:'RightFoot'},{type:'recover',time:1.9}]});
clip('wave_victory','ניצחון ושלום',3.2,t=>{
  const u=curve([[0,0],[.7,1],[2.5,1],[3.2,0]],t),s=interpolateSettings(READY,{...READY,rightHand:[-.36,1.62,.08],rightHandAim:euler(175),leftHand:[.23,.86,.08]},u);
  s.rightHand[0]+=.075*Math.sin((t-.7)*2*Math.PI*1.4)*u;return s;
},{nozzle:'backpack',events:[{type:'wave',time:.8},{type:'celebrate',time:2.2}]});
clip('rescued_handoff','מסירה בטוחה',3.6,t=>{
  const u=curve([[0,1],[2.9,1],[3.6,0]],t),extend=curve([[0,0],[1,0],[1.9,1],[2.4,1],[3.3,0],[3.6,0]],t);
  return interpolateSettings(READY,{...READY,hips:[0,.77,0],leftHand:[.20,1.03,.31+.17*extend],rightHand:[-.20,1.03,.31+.17*extend],leftHandAim:euler(-70),rightHandAim:euler(-70),lean:5},u);
},{nozzle:'backpack',events:[{type:'receive_ready',time:.7},{type:'handoff',time:2.2},{type:'hands_clear',time:2.9}],carried:'child',handoffWindow:[0,2.2]});
// Optional canonical child response, reuses the existing fictional body at child scale.
clip('child_reassured','הילד נרגע ומנופף לכבאי',3.2,t=>{
  const u=curve([[0,0],[.8,1],[2.5,1],[3.2,0]],t);return interpolateSettings(READY,{...READY,head:-28,leftHand:[.31,1.40,.13],leftHandAim:euler(170),rightHand:[-.22,.83,.11]},u);
},{nozzle:'none',optional:true,supplemental:true,events:[{type:'look_at_firefighter',time:.8},{type:'thank_you',time:1.6}]});

const animationWriter=new GLB(skeleton());
for(const c of clips)appendAnimation(animationWriter,c.id,c.frames,{nativeRate:30,loop:c.loop,events:c.events,rootMotion:false});
const motionBytes=animationWriter.finish();await writeFile(path.join(base,'motions/firefighter-clips.glb'),motionBytes);
await writeFile(path.join(base,'motions/poses.json'),JSON.stringify({schemaVersion:1,license:'CC0-1.0',coordinateSystem:'+Y up, +Z forward, +X actor left; canonical metres',skeleton:bones,clips},null,2)+'\n');

// Original 286-triangle rescue cat. Deliberately stylised, no external animal mesh.
const cat=new GLB([{name:'cat_root',children:[1,2]},{name:'cat_head',translation:[.19,.13,0]},{name:'cat_tail',translation:[-.21,.11,0]}],[0]);
cat.json.materials=[j.materials[0]];
function catMesh(name,parent,records){const m=Object.fromEntries(['p','n','c','r'].map(k=>[k,records.flatMap(x=>x[k])]));const attributes={POSITION:cat.accessor(m.p,'VEC3',5126,34962),NORMAL:cat.accessor(m.n,'VEC3',5126,34962),COLOR_0:cat.accessor(m.c,'VEC3',5126,34962),_REGION:cat.accessor(m.r,'SCALAR',5121,34962)};
 const mesh=cat.json.meshes.push({name,primitives:[{attributes,material:0}]})-1;const id=cat.json.nodes.push({name,mesh})-1;(cat.json.nodes[parent].children??=[]).push(id);return m.p.length/9;}
let catTriangles=catMesh('cat_body',0,[sphere([.25,.12,.12],[0,.11,0],'cat',8,4),box([.30,.05,.16],[0,.035,.02],'cat_cream')]);
catTriangles+=catMesh('cat_face',1,[sphere([.105,.105,.10],[0,0,0],'cat',8,4),box([.034,.065,.05],[.02,.092,.065],'cat'),box([.034,.065,.05],[.02,.092,-.065],'cat'),box([.015,.014,.027],[.094,.018,.044],'eyes'),box([.015,.014,.027],[.094,.018,-.044],'eyes'),box([.02,.012,.022],[.108,-.014,0],'red_dark'),sphere([.022,.022,.052],[.085,-.034,0],'cat_cream',6,3)]);
const tailGeometry=new T.CylinderGeometry(.025,.035,.28,6,1);tailGeometry.rotateZ(.7);tailGeometry.translate(-.14*Math.sin(.7),.14*Math.cos(.7),0);
catTriangles+=catMesh('cat_tail_mesh',2,[geomRecord(tailGeometry,'cat')]);
const catFrames=Array.from({length:73},(_,i)=>i/30),timeAccessor=cat.accessor(catFrames,'SCALAR');
cat.json.animations=[{name:'cat_reassured',channels:[{sampler:0,target:{node:1,path:'rotation'}},{sampler:1,target:{node:2,path:'rotation'}}],samplers:[
  {input:timeAccessor,output:cat.accessor(catFrames.flatMap(t=>euler(0,6*Math.sin(t/2.4*2*Math.PI),-3*(1-Math.cos(t/2.4*2*Math.PI)))),'VEC4'),interpolation:'LINEAR'},
  {input:timeAccessor,output:cat.accessor(catFrames.flatMap(t=>euler(0,0,8*Math.sin(t/2.4*2*Math.PI))),'VEC4'),interpolation:'LINEAR'}],extras:{nativeRate:30,loop:true,optional:true}}];
await writeFile(path.join(base,'models/rescue-cat.glb'),cat.finish());

const sha=b=>createHash('sha256').update(b).digest('hex');
const total=parts.reduce((a,p)=>a+p.triangles,0);
if(total>1500)throw new Error(`Equipment exceeds hard budget: ${total}`);
const manifest={schemaVersion:1,id:'firefighter-v1',license:'CC0-1.0',baseCommit:'19d9cdc5e3718236df5a2fc4d8b8c26c72007575',
  authoring:'Original low-poly equipment, original analytic 30Hz animation and original vector water VFX. No brands, real people, external media, Draco or Meshopt.',
  body:{path:'../../assets/athlete-body-v22/models/soccer.glb',manifest:'../../assets/athlete-body-v22/body-manifest.json',license:'CC0-1.0',canonicalBones:18,
    fit:'Canonical metres under BodyScale; scale rigid parts in local X/Z by bodyShape.width/depth for guard/wing/center. Bind jacket to the actor canonical skeleton.',
    variants:['soccer','guard','wing','center'],sourceTriangles:5080},
  equipment:{path:'models/firefighter-equipment.glb',bytes:equipmentBytes.length,sha256:sha(equipmentBytes),triangles:total,triangleBudget:1500,
    includesInBudget:['all worn parts','oxygen mask','air backpack','nozzle','hose surface'],lineSegments:18,parts,
    regions:Object.fromEntries(regionNames.map((name,id)=>[name,{id,srgb:palette[name]}])),regionEncoding:'COLOR_0 linear RGB float32; _REGION uint8 scalar',
    separateMask:['oxygen_mask','mask_regulator'],independentMask:{path:'models/oxygen-mask.glb',bytes:maskBytes.length,sha256:sha(maskBytes),attachBone:'Head',usage:'Alternative independent item; hide the two kit mask nodes to avoid drawing it twice.'},nozzleNode:'nozzle',waterEmitterNode:'water_emitter',vibrationClip:'nozzle_spray_vibration',vibrationOnlyDuringSpray:true},
  hose:{surfaceNode:'hose_surface',lineNode:'hose_centerline',pathSamples:19,radialSegments:5,radiusMeters:.014,triangles:180,
    start:{bone:'Chest',local:[0,-.24,-.24]},end:{node:'nozzle',local:[0,-.045,.035]},updateModule:'runtime/equipment.mjs',representations:['triangle tube surface','LINE_STRIP centerline'],space:'actor BodyScale canonical local'},
  motions:{path:'motions/firefighter-clips.glb',poses:'motions/poses.json',bytes:motionBytes.length,sha256:sha(motionBytes),nativeRate:30,skeleton:bones,
    requiredClips:['idle_ready','walk','run','crouch_walk','spray_stand','spray_crouch','open_door','carry_child','carry_cat','wave_victory','rescued_handoff'],
    clips:clips.map(({frames,...c})=>({...c,animation:c.id,maximumReachErrorMeters:Math.max(...frames.map(f=>f.reachError))})),
    locomotion:'In-place assets. Consumer moves at clip.speed canonical m/s times actor scale. QA adds that same reference path before measuring support drift.',
    transition:'One-shots start/end at idle_ready. Low gait uses the explicit idle_crouch stance. Blend 0.25s with world foot IK in the eventual game consumer.'},
  optionalRescue:{cat:{path:'models/rescue-cat.glb',triangles:catTriangles,animation:'cat_reassured',nativeRate:30},
    child:{body:'../../assets/athlete-body-v22/models/soccer.glb',scale:.43,animation:'child_reassured',triangles:5080},
    previewTriangleBudget:12000,policy:'Preview admits an optional subject only when the entire scene, including effects and stage, fits the selected triangle budget. Disable reactions to omit both optional subjects.'},
  sprites:{manifest:'sprites/atlas.json',atlas:'sprites/water-atlas.png',standalone:'sprites/water-arc.png',sheet:'sprites/water-contact-sheet.png',alpha:'straight, transparent',origin:'top-left'},
  preview:'preview.html',qa:{runner:'measure.mjs',report:'verification/qa/report.json',minimumRequiredScore:88,redMetricsAllowed:0,pinnedCommit:'5eb4f093bc22523ee417a7f2345c3b813bffba24'},
  source:{builder:'source/build.mjs',sprites:'source/sprites.py',reusedCC0IK:'../soccer-header-v1/source/rig.mjs',existingMITMath:'../soccer-motion-v8/runtime/vendor/three.module.js'}};
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(base,'verification/build.json'),JSON.stringify({equipmentTriangles:total,limit:1500,catTriangles,clips:clips.map(c=>({id:c.id,frames:c.frameCount,rate:30,maxReachError:Math.max(...c.frames.map(f=>f.reachError))})),passed:true},null,2)+'\n');
console.log(JSON.stringify({equipmentTriangles:total,catTriangles,clips:clips.length,equipmentBytes:equipmentBytes.length,motionBytes:motionBytes.length}));
