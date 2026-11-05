import fs from 'node:fs/promises';
import {root,json,writeJSON,THREE as T,Document,acc,save,weld,simplify,resample,MeshoptSimplifier,primitive} from './common.mjs';
import {createMotionBaker} from './motions.mjs';
const rig=await json('rig.json'),names=rig.joints.map(j=>j.name);
const old=(await json('../characters/rig.json')).joints.map(j=>j.name);
const {clips}=createMotionBaker(rig);
await fs.mkdir(root+'/models',{recursive:true});

function racketGeometry(coarse=false){
 const parts=[];
 function put(g,color,matrix=new T.Matrix4()){
  g.applyMatrix4(matrix);if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));
  const c=new T.Color(color);g.setAttribute('color',new T.Float32BufferAttribute(Array.from({length:g.attributes.position.count},()=>c.toArray()).flat(),3));parts.push(g);
 }
 function tube(a,b,r,color,n=6){
  const aa=new T.Vector3(...a),bb=new T.Vector3(...b),d=bb.clone().sub(aa);
  const m=new T.Matrix4().compose(aa.add(bb).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.clone().normalize()),new T.Vector3(1,1,1));
  put(new T.CylinderGeometry(r,r,d.length(),n,1),color,m);
 }
 tube([0,-.10,0],[0,.10,0],.014,'#D9CAB5',coarse?6:10);
 if(!coarse)for(let i=0;i<9;i++)tube([-.014,-.087+i*.020,0],[.014,-.077+i*.020,0],.0011,'#A8947F',4);
 tube([0,.095,0],[-.080,.29,0],.008,'#24464D',coarse?4:8);tube([0,.095,0],[.080,.29,0],.008,'#24464D',coarse?4:8);
 const hoop=new T.TorusGeometry(1,.052,coarse?4:6,coarse?16:48);hoop.scale(.130,.185,.130);hoop.translate(0,.445,0);put(hoop,'#24464D');
 if(!coarse){const rim=new T.TorusGeometry(1,.010,4,48);rim.scale(.130,.185,.130);rim.translate(0,.445,.007);put(rim,'#D2A96B');}
 for(let k=coarse?-2:-6;k<=(coarse?2:6);k+=coarse?2:1){
  const x=k*.017,dy=.174*Math.sqrt(Math.max(0,1-(x/.120)**2));
  tube([x,.445-dy,0],[x,.445+dy,0],.0007,'#ECE4CF',3);
 }
 for(let k=coarse?-2:-8;k<=(coarse?2:8);k+=coarse?2:1){
  const y=k*.018,dx=.119*Math.sqrt(Math.max(0,1-(y/.174)**2));
  tube([-dx,.445+y,0],[dx,.445+y,0],.0007,'#ECE4CF',3);
 }
 const positions=[],normals=[],colors=[],indices=[];let offset=0;
 const hand=rig.joints.find(j=>j.name==='RightHand').worldPosition;
 for(const g of parts){
  const p=g.attributes.position.array,n=g.attributes.normal.array;
  for(let i=0;i<p.length;i+=3)positions.push(hand[0]-.045+p[i],hand[1]+p[i+1],hand[2]-.014+p[i+2]);
  normals.push(...n);colors.push(...g.attributes.color.array);indices.push(...Array.from(g.index.array,i=>i+offset));offset+=p.length/3;
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:offset},()=>[.965,.965]).flat(),2));g.setIndex(indices);return g;
}
const records=[];
for(const id of ['man-01','man-02','woman-01','woman-02']){
 const raw=JSON.parse(await fs.readFile('/tmp/tennis-v7-raw/'+id+'.json','utf8'));
 const doc=new Document();doc.createBuffer();
 const tex=doc.createTexture(id+' / one 512 atlas').setImage(await fs.readFile(root+'/textures/'+id+'-atlas.png')).setMimeType('image/png');
 const mat=doc.createMaterial('Tennis cotton / skin / equipment atlas').setBaseColorTexture(tex).setRoughnessFactor(.78).setMetallicFactor(0);
 const nodes=Object.fromEntries(rig.joints.map(j=>[j.name,doc.createNode(j.name).setTranslation(j.translation)]));
 for(const j of rig.joints)if(j.parent)nodes[j.parent].addChild(nodes[j.name]);
 const skin=doc.createSkin('Motion2Canonical18').setSkeleton(nodes.Root);const inverse=[];
 for(const j of rig.joints){skin.addJoint(nodes[j.name]);inverse.push(...new T.Matrix4().makeTranslation(...j.worldPosition.map(v=>-v)).toArray());}
 skin.setInverseBindMatrices(acc(doc,'18 inverse binds','MAT4',new Float32Array(inverse)));
 const joints=[],weights=[];
 for(let i=0;i<raw.joints.length;i++){
  const map=new Map();
  for(let k=0;k<4;k++)if(raw.weights[i][k]){
   let n=old[raw.joints[i][k]];if(n.endsWith('Shoulder'))n='Chest';
   map.set(names.indexOf(n),(map.get(names.indexOf(n))??0)+raw.weights[i][k]);
  }
  const list=[...map].sort((a,b)=>b[1]-a[1]);while(list.length<4)list.push([0,0]);
  const exact=list.map(v=>v[1]*65535),packed=exact.map(Math.floor);
  const order=[0,1,2,3].sort((a,b)=>(exact[b]-packed[b])-(exact[a]-packed[a]));
  for(let n=65535-packed.reduce((s,v)=>s+v,0),k=0;k<n;k++)packed[order[k%4]]++;
  joints.push(...list.map((v,k)=>packed[k]?v[0]:0));weights.push(...packed);
 }
 const p=doc.createPrimitive().setMaterial(mat)
  .setAttribute('POSITION',acc(doc,id+' surface','VEC3',new Float32Array(raw.positions.flat())))
  .setAttribute('NORMAL',acc(doc,id+' normals','VEC3',new Float32Array(raw.normals.flat())))
  .setAttribute('COLOR_0',acc(doc,id+' region mask','VEC3',new Float32Array(raw.colors.flat())))
  .setAttribute('TEXCOORD_0',acc(doc,id+' atlas UV','VEC2',new Float32Array(raw.uv.flat())))
  .setAttribute('JOINTS_0',acc(doc,id+' joints','VEC4',new Uint16Array(joints)))
  .setAttribute('WEIGHTS_0',acc(doc,id+' weights','VEC4',new Uint16Array(weights)).setNormalized(true))
  .setIndices(acc(doc,id+' triangles','SCALAR',new Uint32Array(raw.indices.flat())));
 const body=doc.createNode('Body_LOD0').setMesh(doc.createMesh(id+' detailed').addPrimitive(p)).setSkin(skin);
 const scene=doc.createScene(id).addChild(nodes.Root).addChild(body);
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.48,error:.00045}));
 const high=body.getMesh().listPrimitives()[0],highCount=high.getIndices().getCount()/3;
 const [lowIndices,error]=MeshoptSimplifier.simplify(new Uint32Array(high.getIndices().getArray()),new Float32Array(high.getAttribute('POSITION').getArray()),3,
  Math.min(2400*3,Math.floor(high.getIndices().getCount()*.30/3)*3),.025,['LockBorder']);
 const low=doc.createPrimitive().setMaterial(mat);
 for(const semantic of high.listSemantics())low.setAttribute(semantic,high.getAttribute(semantic));
 low.setIndices(acc(doc,id+' LOD1 triangles','SCALAR',lowIndices));
 scene.addChild(doc.createNode('Body_LOD1').setMesh(doc.createMesh(id+' mobile LOD').addPrimitive(low)).setSkin(skin));
 const [tinyIndices,tinyError]=MeshoptSimplifier.simplify(new Uint32Array(high.getIndices().getArray()),new Float32Array(high.getAttribute('POSITION').getArray()),3,900*3,.08);
 const tiny=doc.createPrimitive().setMaterial(mat);for(const semantic of high.listSemantics())tiny.setAttribute(semantic,high.getAttribute(semantic));
 tiny.setIndices(acc(doc,id+' LOD2 triangles','SCALAR',tinyIndices));scene.addChild(doc.createNode('Body_LOD2').setMesh(doc.createMesh(id+' distant economy LOD').addPrimitive(tiny)).setSkin(skin));
 const rg=racketGeometry(),rgLow=racketGeometry(true);
 for(const [name,g] of [['Racket_RightHand',rg],['Racket_LOD1',rgLow]]){
  const rp=primitive(doc,g,mat,name),rn=g.attributes.position.count;
  rp.setAttribute('JOINTS_0',acc(doc,name+' RightHand joint','VEC4',new Uint16Array(Array.from({length:rn},()=>[names.indexOf('RightHand'),0,0,0]).flat())));
  rp.setAttribute('WEIGHTS_0',acc(doc,name+' rigid skin','VEC4',new Float32Array(Array.from({length:rn},()=>[1,0,0,0]).flat())));
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(rp)).setSkin(skin));
 }
 for(const clip of clips){
  const animation=doc.createAnimation(clip.id).setExtras({label:clip.label,loop:clip.loop,rootMotion:false,events:clip.events,contactSweetSpot:clip.contactSweetSpot});
  const input=acc(doc,clip.id+' seconds','SCALAR',new Float32Array(clip.times));
  for(const name of names)for(const property of ['translation','rotation']){
   const size=property==='rotation'?4:3;const data=clip.samples.flatMap(s=>s.values[name][property]);
   if(property==='rotation')for(let i=4;i<data.length;i+=4)if(data.slice(i,i+4).reduce((s,v,k)=>s+v*data[i-4+k],0)<0)for(let k=0;k<4;k++)data[i+k]*=-1;
   const output=acc(doc,clip.id+' '+name+' '+property,size===4?'VEC4':'VEC3',new Float32Array(data));
   const sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
   animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[name]).setTargetPath(property).setSampler(sampler));
  }
 }
 await doc.transform(resample({tolerance:.00003}));
 records.push(await save(doc,'models/'+id+'.glb',{kind:'character',gender:raw.look.gender,label:raw.look.label,atlas:{file:'textures/'+id+'-atlas.png',width:512,height:512},
  joints:18,LODs:[{name:'Body_LOD0',triangles:highCount,distance:0},{name:'Body_LOD1',triangles:lowIndices.length/3,distance:14,error},{name:'Body_LOD2',triangles:tinyIndices.length/3,distance:24,error:tinyError}],
  racketTriangles:rg.index.count/3,racketLODs:[{name:'Racket_RightHand',triangles:rg.index.count/3},{name:'Racket_LOD1',triangles:rgLow.index.count/3}],clips:clips.map(c=>({id:c.id,duration:c.duration,loop:c.loop,events:c.events,contactSweetSpot:c.contactSweetSpot}))}));
}
await writeJSON('actors.json',records);
await writeJSON('motions.json',{schemaVersion:1,rig:'rig.json',source:'Original keyframing and two-bone IK in source/motions.mjs',
 rootMotion:false,interpolation:'Linear baked at 30 Hz; smoothstep between authored poses',clips:clips.map(c=>({id:c.id,label:c.label,duration:c.duration,loop:c.loop,
 events:c.events,contactSweetSpot:c.contactSweetSpot,maxReachError:Math.max(...c.samples.map(s=>s.maxReachError))}))});
