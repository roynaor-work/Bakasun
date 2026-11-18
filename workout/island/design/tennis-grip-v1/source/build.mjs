// SPDX-License-Identifier: CC0-1.0
// Original racket and closed-hand surfaces, standard uncompressed glTF 2.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from '../../soccer-motion-v8/runtime/vendor/three.module.js';
import {unpack,compact,readAccessor} from './glb.mjs';
import {author,HANDLE_CENTER,GRIP_Y,ATTACH,LEFT_ATTACH} from './author.mjs';
import {rotate,add,sub,mul,bones} from './rig.mjs';
const root=new URL('../',import.meta.url),runtime=new URL('runtime/',root);
const source=new URL('../../soccer-header-v1/runtime/reference/idle_relaxed.glb',import.meta.url);
const sourceBytes=await fs.readFile(source),template=unpack(sourceBytes);
class Writer {
 constructor(glb){this.doc=glb?structuredClone(glb.document):{asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[]};this.parts=glb?[glb.binary]:[];this.length=glb?glb.binary.length:0;}
 accessor(values,width,{integer=false,target}={}){
  const a=integer?new Uint32Array(values):new Float32Array(values),bytes=Buffer.from(a.buffer),pad=(4-this.length%4)%4;
  if(pad){this.parts.push(Buffer.alloc(pad));this.length+=pad;}
  const view=this.doc.bufferViews.length;this.doc.bufferViews.push({buffer:0,byteOffset:this.length,byteLength:bytes.length,...target?{target}:{}});this.parts.push(bytes);this.length+=bytes.length;
  const entry={bufferView:view,componentType:integer?5125:5126,count:values.length/width,type:{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[width]};
  if(width===1||target===34962){entry.min=Array.from({length:width},(_,j)=>{let v=Infinity;for(let i=j;i<values.length;i+=width)v=Math.min(v,values[i]);return v;});entry.max=Array.from({length:width},(_,j)=>{let v=-Infinity;for(let i=j;i<values.length;i+=width)v=Math.max(v,values[i]);return v;});}
  this.doc.accessors.push(entry);return this.doc.accessors.length-1;
 }
 material(name,color,roughness=.55,metallic=0){const c=new T.Color(color);this.doc.materials.push({name,pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,1],roughnessFactor:roughness,metallicFactor:metallic}});return this.doc.materials.length-1;}
 mesh(name,parts,material,morphParts){
  const combine=list=>{const p=[],n=[],ix=[];let offset=0;for(const g of list){p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);const ind=g.index?.array??Array.from({length:g.attributes.position.count},(_,i)=>i);for(const i of ind)ix.push(i+offset);offset+=g.attributes.position.count;}return {p,n,ix};};
  const c=combine(parts),primitive={attributes:{POSITION:this.accessor(c.p,3,{target:34962}),NORMAL:this.accessor(c.n,3,{target:34962})},indices:this.accessor(c.ix,1,{integer:true,target:34963}),material};
  if(morphParts){const o=combine(morphParts);if(c.p.length!==o.p.length)throw new Error('Morph topology mismatch');primitive.targets=[{POSITION:this.accessor(o.p.map((v,i)=>v-c.p[i]),3,{target:34962}),NORMAL:this.accessor(o.n.map((v,i)=>v-c.n[i]),3,{target:34962})}];}
  this.doc.meshes.push({name,primitives:[primitive],...morphParts?{weights:[0],extras:{targetNames:['open']}}:{}});return this.doc.meshes.length-1;
 }
 node(name,data={},parent){const index=this.doc.nodes.length;this.doc.nodes.push({name,...data});if(parent===undefined)this.doc.scenes[0].nodes.push(index);else(this.doc.nodes[parent].children??=[]).push(index);return index;}
 bytes(){this.doc.buffers=[{byteLength:this.length}];this.doc.asset={...this.doc.asset,generator:'Original tennis-grip-v1 / CC0 / uncompressed glTF 2',copyright:'CC0-1.0. See LICENSES.md for original and reused CC0 geometry.'};return compact(this.doc,Buffer.concat(this.parts));}
}
const sphere=(p,s,segments=16,rings=10)=>new T.SphereGeometry(1,segments,rings).scale(...s).translate(...p);
const tube=(points,radius,segments=24,radial=8)=>new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),segments,radius,radial,false);
function handParts(left=false,open=false){
 const attachment=left?LEFT_ATTACH:ATTACH;
 const toHand=p=>add(HANDLE_CENTER,rotate(attachment,p));
 const parts=[sphere([0,-.014,0],[.023,.026,.018])];
 const palm=sphere([-.027,0,-.005],[.015,.041,.026]);palm.applyQuaternion(new T.Quaternion(...attachment));palm.translate(...HANDLE_CENTER);parts.push(palm);
 for(let i=0;i<4;i++){
  const y=-.028+i*.0185,points=[];
  for(let j=0;j<9;j++){const a=(178-224*j/8)*Math.PI/180;points.push(toHand([.0235*Math.cos(a),y-.004*j/8,.0235*Math.sin(a)]));}
  if(open){const start=points[0],dx=(i-1.5)*.013;for(let j=1;j<points.length;j++){const u=j/8;points[j]=[start[0]*(1-u)+dx*u,start[1]-.062*u,start[2]*(1-u)+.006*u];}}
  parts.push(tube(points,.0071-i*.00032,24,8));
  parts.push(sphere(points.at(-1),[.0058,.0063,.0058],10,6));
 }
 let thumb=[[-.03,.025,-.008],[-.022,.043,.004],[.002,.037,.024],[.019,.018,.025],[.020,.003,.016]].map(toHand);
 if(open)thumb=thumb.map((p,i)=>[p[0]+(left?-1:1)*.018*i/4,p[1]+.012*i/4,p[2]]);
 parts.push(tube(thumb,.0081,24,10));return parts;
}
function limbSurface(length,radii){
 // Sculpted elliptical loft, covering the sparse source arm at the flexed elbow.
 const positions=[],indices=[],radial=24,rows=14;
 for(let row=0;row<=rows;row++){
  const u=row/rows,index=u*(radii.length-1),a=Math.min(radii.length-2,Math.floor(index)),f=index-a,r=radii[a]+(radii[a+1]-radii[a])*f;
  for(let j=0;j<=radial;j++){const angle=j/radial*Math.PI*2;positions.push(r*Math.cos(angle),.025-(length+.025)*u,r*.88*Math.sin(angle)+.002*Math.sin(u*Math.PI));}
 }
 for(let i=0;i<rows;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;indices.push(a,a+1,b,a+1,b+1,b);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function racket(w,parent){
 const rootNode=w.node('racket',{},parent),grip=w.node('grip',{translation:[0,.20,0],extras:{meaning:'Upper end of handle; +Y points to head, +Z string-bed normal',units:'meters'}},rootNode);
 w.node('head',{translation:[0,.50,0],extras:{meaning:'String-bed centre',units:'meters'}},rootNode);
 const carbon=w.material('Graphite · deep pine','#163e3b',.30,.42),accent=w.material('Warm alloy accents','#d7b57b',.38,.35),wrap=w.material('Ivory grip','#e9e2cc',.88),strings=w.material('Natural strings','#e6e7cd',.48);
 const frame=[],gold=[],handle=[],weave=[];
 // A true oval beam, with width/thickness independently defined. Overall length .680 m.
 const oval=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2;oval.push([.122*Math.sin(a),.50+.172*Math.cos(a),0]);}
 const beam=tube(oval,.008,192,8);beam.computeBoundingBox();const outerRadius=beam.boundingBox.max.y-.50;
 beam.translate(0,-.50,0).scale(1,.18/outerRadius,1).translate(0,.50,0);frame.push(beam);
 for(const s of [-1,1])frame.push(tube([[0,.19,0],[s*.016,.258,0],[s*.052,.319,0],[s*.087,.371,0]],.007,24,8));
 const cylinder=new T.CylinderGeometry(.0158,.0172,.192,8).translate(0,.102,0);handle.push(cylinder);
 handle.push(new T.CylinderGeometry(.020,.021,.012,8).translate(0,.006,0));
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const points=[];for(let j=0;j<=40;j++){const y=.014+j/40*.174,angle=y/.020*Math.PI*2;points.push([.017*Math.cos(angle),y,.017*Math.sin(angle)]);}if(i===0)gold.push(tube(points,.0008,160,4));}
 // Simple elliptical clipping of actual string cylinders. No alpha texture and no deformation.
 for(let i=-7;i<=7;i++){const x=i*.0148,dy=.164*Math.sqrt(Math.max(0,1-x*x/(.114*.114)));if(dy>0)weave.push(tube([[x,.50-dy,0],[x,.50+dy,0]],.00065,1,5));}
 for(let i=-10;i<=10;i++){const dy=i*.0150,dx=.114*Math.sqrt(Math.max(0,1-dy*dy/(.164*.164)));if(dx>0)weave.push(tube([[-dx,.50+dy,.0005],[dx,.50+dy,.0005]],.00065,1,5));}
 for(const s of [-1,1])gold.push(tube([[s*.119,.47,.006],[s*.121,.50,.006],[s*.119,.53,.006]],.0025,12,6));
 for(const [name,parts,material] of [['frame',frame,carbon],['accent',gold,accent],['handle',handle,wrap],['strings',weave,strings]])w.node('racket_'+name,{mesh:w.mesh('racket_'+name,parts,material)},rootNode);
 return {root:rootNode,grip};
}
const prop=new Writer();racket(prop);prop.doc.extras={license:'CC0-1.0',units:'meters',lengthMeters:.68,headWidthMeters:.26,gripNode:'grip',headNode:'head',compression:'none'};
await fs.writeFile(new URL('racket.glb',runtime),prop.bytes());

// Start from the existing calibrated CC0 body; discard source motion and replace both open hands.
const player=new Writer(template);player.doc.animations=[];
// Source normal maps lack tangents. Use the existing colour/roughness atlases
// and modelled surfaces, avoiding a renderer-dependent tangent reconstruction.
for(const material of player.doc.materials)delete material.normalTexture;
let removed=0;
for(const mesh of player.doc.meshes)for(const p of mesh.primitives){
 if(p.material!==0&&p.material!==1)continue;
 const src=unpack(sourceBytes),positions=readAccessor(src,p.attributes.POSITION).values,joints=readAccessor(src,p.attributes.JOINTS_0).values,weights=readAccessor(src,p.attributes.WEIGHTS_0).values,indices=readAccessor(src,p.indices).values;
 const isHand=v=>{let arm=0;for(let j=0;j<4;j++)if([6,7,8,9,10,11].includes(joints[v*4+j]))arm+=weights[v*4+j];return arm>(p.material===1?.35:.30);};
  const kept=[];for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3);if(tri.some(isHand)){removed++;continue;}kept.push(...tri);}
 p.indices=player.accessor(kept,1,{integer:true,target:34963});
}
const skin=player.material('Original grip hand skin','#91614a',.73);
const sleeve=player.material('Original tennis sleeve','#087b7b',.86);
const rHandNode=player.doc.nodes.findIndex(n=>n.name==='RightHand'),lHandNode=player.doc.nodes.findIndex(n=>n.name==='LeftHand');
for(const side of ['Left','Right']){
 const upper=player.doc.nodes.findIndex(n=>n.name===side+'Arm'),lower=player.doc.nodes.findIndex(n=>n.name===side+'ForeArm');
 const chest=player.doc.nodes.findIndex(n=>n.name==='Chest'),sign=side==='Left'?1:-1;
 player.node(side.toLowerCase()+'_shoulder_gusset',{mesh:player.mesh(side+'_shoulder_gusset',[sphere([sign*.14,.03,0],[.073,.115,.078])],sleeve)},chest);
 player.node(side.toLowerCase()+'_upper_arm_surface',{mesh:player.mesh(side+'_upper_arm',[limbSurface(.27,[.048,.049,.045,.035]),sphere([0,0,0],[.049,.045,.043])],skin)},upper);
 player.node(side.toLowerCase()+'_sleeve_surface',{mesh:player.mesh(side+'_short_sleeve',[limbSurface(.105,[.065,.067,.062,.055]),sphere([0,.015,0],[.063,.055,.060])],sleeve)},upper);
 player.node(side.toLowerCase()+'_forearm_surface',{mesh:player.mesh(side+'_forearm',[limbSurface(.24,[.035,.039,.033,.022]),sphere([0,0,0],[.035,.033,.032])],skin)},lower);
}
const rPatch=player.node('grip_hand_R',{mesh:player.mesh('closed_right_hand',handParts(false),skin),extras:{mask:'Replace the original open hand surface; rigid child of RightHand, no extra joints.'}},rHandNode);
const lPatch=player.node('grip_hand_L',{mesh:player.mesh('left_hand_grip_to_open',handParts(true),skin,handParts(true,true)),weights:[0]},lHandNode);
// Root = hand socket * inverse(grip). The offset is immutable for every clip.
const mountPosition=sub(HANDLE_CENTER,rotate(ATTACH,[0,GRIP_Y,0]));
const mount=player.node('racket_mount',{translation:mountPosition,rotation:ATTACH,extras:{rigid:true,source:'racket.glb',constraint:'No animated transform or inherited nonuniform scale.'}},rHandNode);
racket(player,mount);
const ballMat=player.material('Tennis felt','#d8e76a',1),ball=player.node('Ball',{mesh:player.mesh('tennis_ball',[sphere([0,0,0],[.0335,.0335,.0335],20,12)],ballMat),translation:[0,-10,0]});
const data=author();
for(const clip of data.clips){
 const input=player.accessor(clip.frames.map(f=>f.time),1),animation={name:clip.id,samplers:[],channels:[],extras:{nativeRate:30,rootMotion:false,loop:clip.loop,events:clip.metadata.events,license:'CC0-1.0'}};
 function channel(node,path,values,width){animation.channels.push({sampler:animation.samplers.length,target:{node,path}});animation.samplers.push({input,output:player.accessor(values,width),interpolation:'LINEAR'});}
 for(const {name} of bones)channel(player.doc.nodes.findIndex(n=>n.name===name),'rotation',clip.frames.flatMap(f=>f.rotations[name]),4);
 channel(1,'translation',clip.frames.flatMap(f=>f.hips),3);
 channel(lPatch,'weights',clip.frames.map(f=>f.leftOpen),1);
 channel(ball,'translation',clip.frames.flatMap(f=>f.ball),3);
 channel(ball,'scale',clip.frames.flatMap(f=>[f.ballScale,f.ballScale,f.ballScale]),3);
 player.doc.animations.push(animation);
}
player.doc.extras={library:'tennis-grip-v1',units:'meters',nativeRate:30,rootMotion:false,boneCount:18,compression:'none',handMask:true,removedOriginalHandTriangles:removed};
const playerBytes=player.bytes();await fs.writeFile(new URL('player.glb',runtime),playerBytes);
const mask=new Writer(),maskSkin=mask.material('Original grip hand skin','#91614a',.73);
mask.node('right_hand_grip',{mesh:mask.mesh('right_hand_grip',handParts(),maskSkin)});
mask.node('grip_socket',{translation:add(HANDLE_CENTER,rotate(ATTACH,[0,.20-GRIP_Y,0])),rotation:ATTACH});
mask.doc.extras={license:'CC0-1.0',parentBone:'RightHand',boneCount:0,rigidPoseMask:true,units:'meters'};
await fs.writeFile(new URL('right-hand-grip.glb',runtime),mask.bytes());
await fs.writeFile(new URL('pose-mask.json',runtime),JSON.stringify({schemaVersion:1,license:'CC0-1.0',skeleton:'canonical18',mode:'rigid closed-hand surface replacing the open hand; body hand bone still animates',parentBone:'RightHand',asset:'right-hand-grip.glb',bodyBonesAdded:0,boneMask:['RightHand'],readyBonePose:{RightHand:{rotation:data.clips[0].frames[0].rotations.RightHand}},rotationSpace:'absolute parent-local xyzw; readyBonePose is an idle reference, use the supplied animated Hand channel during other clips',handFromRacket:ATTACH,racketMount:{translation:mountPosition,rotation:ATTACH,scale:[1,1,1]},socketAtTopOfHandle:{translation:add(HANDLE_CENTER,rotate(ATTACH,[0,.20-GRIP_Y,0])),rotation:ATTACH},racketGripNode:'grip',racketHeadNode:'head',gripToRacketRoot:[0,-.20,0],primaryHandCenterY:GRIP_Y,leftSupportCenterY:.153,notes:'Keep only one closed-hand surface; hide/replace the original hand triangles. Do not multiply a second Euler rotation into the attached racket.'},null,2)+'\n');
await fs.writeFile(new URL('motions.json',runtime),JSON.stringify(data));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const {frames,...ignore}=data.clips[0];
const catalog={schemaVersion:1,library:data.version,asset:'player.glb',nativeRate:30,rootMotion:false,skeleton:data.skeleton,grip:data.grip,clips:data.clips.map(({frames,...entry})=>entry),sourceMotionSha256:sha(Buffer.from(JSON.stringify(data))),playerSha256:sha(playerBytes),sourceGeometry:{path:path.relative(fileURLToPath(root),fileURLToPath(source)),sha256:sha(sourceBytes),license:'CC0-1.0',removedHandTriangles:removed}};
await fs.writeFile(new URL('catalog.json',runtime),JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({clips:catalog.clips.length,playerBytes:playerBytes.length,removedHandTriangles:removed}));
