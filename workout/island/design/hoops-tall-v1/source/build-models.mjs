/** Original tall-athlete adaptation of the verified CC0 MakeHuman core skin.
 * Unverified source shoes, hair and clothing are discarded. Project-original
 * sewn-tank topology is refitted; other replacements below are authored here. Tools live outside the repository. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const require=createRequire(path.resolve(process.env.HOOPS_TALL_TOOLS||'/tmp/hoops-tall-tools','package.json'));
const {NodeIO,Document}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco}=require('@gltf-transform/functions');
const draco3d=require('draco3dgltf');
const {MeshoptDecoder}=require('meshoptimizer');
const sharp=require('sharp');
const THREE=require('three');
const base=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const design=path.dirname(base);
const old=path.join(design,'hoops-v7/characters');
const original=await fs.readFile(path.join(old,'models/pg-lod1.glb'));
const decoder=await draco3d.createDecoderModule();
const encoder=await draco3d.createEncoderModule();
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':decoder,'draco3d.encoder':encoder,'meshopt.decoder':MeshoptDecoder});
const src=await io.readBinary(original);
const oldRig=JSON.parse(await fs.readFile(path.join(old,'rig.json'),'utf8')).profiles.pg;
const map=JSON.parse(await fs.readFile(path.join(old,'retarget-map.json'),'utf8')).profiles.pg;
const names=oldRig.joints.map(j=>j.name), parents=oldRig.joints.map(j=>j.parent);
const oldW=oldRig.joints.map(j=>new THREE.Vector3().fromArray(j.worldPosition));
const basis=map.bones.map(b=>new THREE.Quaternion().fromArray(b.targetBasisWorldQuaternion));
const specs=[{id:'guard',label:'רכז',heightMeters:1.88,armRatio:1,widthRatio:1},{id:'wing',label:'קיצוני',heightMeters:1.98,armRatio:1.08,widthRatio:1.055},{id:'center',label:'סנטר',heightMeters:2.08,armRatio:1.12,widthRatio:1.11}];
const palettes=[{id:'lagoon',label:'לגונה',primary:'#176f77',secondary:'#102a40',trim:'#f4e3b8'},{id:'ember',label:'גחלת',primary:'#a74332',secondary:'#302b49',trim:'#f6e5bf'}];
const atlasSrc=src.getRoot().listTextures().find(t=>t.getName()==='pg-atlas');
let {data:rgba,info}=await sharp(atlasSrc.getImage()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
// Keep only the CC0 core skin/face/eye islands; every garment, shoe and hair
// pixel is newly authored, logo-free textile or solid neutral shading.
for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
 if(y<640||(x>=640&&y<768)||(x>=384&&x<512&&y>=640&&y<768))continue;
 const i=(y*1024+x)*4; const weave=4*Math.sin(x*2.3)*Math.cos(y*1.8)+2*Math.sin((x+y)*.13);
 const c=y>=768?Math.round(239+weave):x<256?48:223;
 rgba[i]=rgba[i+1]=rgba[i+2]=c;rgba[i+3]=255;if(x>=512&&x<544&&y>=704&&y<768){rgba[i]=80;rgba[i+1]=50;rgba[i+2]=37;}
}
const atlas=await sharp(rgba,{raw:info}).png().toBuffer();
await fs.writeFile(path.join(base,'textures/athlete-atlas.png'),atlas);
const V=a=>new THREE.Vector3().fromArray(a);
const child={Hips:'Spine',Spine:'Chest',Chest:'Neck',Neck:'Head',LeftArm:'LeftForeArm',LeftForeArm:'LeftHand',RightArm:'RightForeArm',RightForeArm:'RightHand',LeftUpLeg:'LeftLeg',LeftLeg:'LeftFoot',RightUpLeg:'RightLeg',RightLeg:'RightFoot'};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
let allProfiles=[];
for(const spec of specs){
 const h=spec.heightMeters,s=h/1.88,ar=s*spec.armRatio,w=s*spec.widthRatio;
 const rest={Root:[0,0,0],Hips:[0,1.035*s,0],Spine:[0,.235*s,0],Chest:[0,.230*s,0],Neck:[0,.130*s,0],Head:[0,.039*s,0],LeftArm:[.214*w,.100*s,0],LeftForeArm:[0,-.380*ar,0],LeftHand:[0,-.340*ar,0],RightArm:[-.214*w,.100*s,0],RightForeArm:[0,-.380*ar,0],RightHand:[0,-.340*ar,0],LeftUpLeg:[.105*w,0,0],LeftLeg:[0,-.493*s,0],LeftFoot:[0,-.451*s,0],RightUpLeg:[-.105*w,0,0],RightLeg:[0,-.493*s,0],RightFoot:[0,-.451*s,0]};
 const world={};for(const n of names)world[n]=V(rest[n]).add(parents[names.indexOf(n)]?world[parents[names.indexOf(n)]]:new THREE.Vector3());
 const scales=names.map((n,i)=>{let y=s;if(child[n]){const ni=names.indexOf(child[n]);y=V(rest[child[n]]).length()/oldW[ni].distanceTo(oldW[i]);}if(n.endsWith('Hand'))y=1.40*ar;return new THREE.Vector3(n.endsWith('Hand')?1.22*ar:w,y,n.endsWith('Hand')?1.20*ar:s);});
 const transform=(p,ji,we,normal=false)=>{let out=new THREE.Vector3();for(let k=0;k<4;k++){if(we[k]<1e-7)continue;let j=ji[k],v=V(p);if(!normal)v.sub(oldW[j]);v.applyQuaternion(basis[j]);if(normal)v.divide(scales[j]);else v.multiply(scales[j]).add(world[names[j]]);out.addScaledVector(v,we[k]);}if(normal)out.normalize();return out.toArray();};
 const d=new Document(),buffer=d.createBuffer('athlete');
 const tex=d.createTexture('shared-athlete-atlas').setImage(atlas).setMimeType('image/png');
 const mats={};for(const [n,color,rough] of [['human_surface','#ffffff',.70],['eyes','#ffffff',.27],['uniform_primary',palettes[0].primary,.88],['uniform_secondary',palettes[0].secondary,.91],['uniform_trim',palettes[0].trim,.79],['shoe_upper','#e9e5db',.70],['shoe_sole','#243243',.85],['hair_original','#231e1b',.95],['sock','#d9dfdc',.93]])mats[n]=d.createMaterial(n).setBaseColorTexture(tex).setBaseColorFactor([...new THREE.Color(color).toArray(),1]).setRoughnessFactor(rough).setMetallicFactor(0);
 const nodes=names.map(n=>d.createNode(n).setTranslation(rest[n]));for(let i=0;i<names.length;i++)if(parents[i])nodes[names.indexOf(parents[i])].addChild(nodes[i]);
 const ibm=new Float32Array(18*16);names.forEach((n,i)=>ibm.set(new THREE.Matrix4().makeTranslation(...world[n].toArray().map(v=>-v)).toArray(),i*16));
 const skin=d.createSkin('motion2-canonical18').setSkeleton(nodes[0]).setInverseBindMatrices(d.createAccessor('inverse-bind').setType('MAT4').setArray(ibm).setBuffer(buffer));nodes.forEach(n=>skin.addJoint(n));
 const mesh=d.createMesh(spec.id+'-athlete');
 const empty=()=>({pos:[],uv:[],joint:[],weight:[],index:[]});
 const add=(g,p,uv,joints)=>{const i=g.pos.length/3;g.pos.push(...p);g.uv.push(...uv);while(joints.length<4)joints.push([0,0]);g.joint.push(...joints.map(a=>typeof a[0]==='string'?names.indexOf(a[0]):a[0]));g.weight.push(...joints.map(a=>a[1]));return i;};
 const uvCloth=(u,v)=>[(3+u*506)/1024,(770+v*250)/1024];
 const neutral=[.55,.71];
 const primitive=(g,material)=>{const used=[...new Set(g.index)].sort((a,b)=>a-b),remap=new Map(used.map((v,i)=>[v,i]));for(const [key,size]of [['pos',3],['uv',2],['joint',4],['weight',4]])g[key]=used.flatMap(i=>g[key].slice(i*size,(i+1)*size));g.index=g.index.map(i=>remap.get(i));for(let i=0;i<g.weight.length;i++)if(g.weight[i]===0)g.joint[i]=0;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(g.pos,3));geo.setIndex(g.index);geo.computeVertexNormals();const nn=geo.attributes.normal.array;for(let i=0;i<nn.length;i+=3)if(Math.hypot(nn[i],nn[i+1],nn[i+2])<.5){nn[i]=0;nn[i+1]=1;nn[i+2]=0;}const p=d.createPrimitive().setMaterial(material);for(const [name,arr,type,dim]of [['POSITION',g.pos,Float32Array,'VEC3'],['NORMAL',Array.from(geo.attributes.normal.array),Float32Array,'VEC3'],['TEXCOORD_0',g.uv,Float32Array,'VEC2'],['JOINTS_0',g.joint,Uint16Array,'VEC4'],['WEIGHTS_0',g.weight,Float32Array,'VEC4']])p.setAttribute(name,d.createAccessor(name).setType(dim).setArray(new type(arr)).setBuffer(buffer));p.setIndices(d.createAccessor('triangles').setType('SCALAR').setArray(new Uint32Array(g.index)).setBuffer(buffer));mesh.addPrimitive(p);geo.dispose();return p;};
 const native=[];
 // The project's old reconstructed sternum repair is inset below the new tank;
 // retained upper clavicle and all verified native core anatomy stay intact.
 for(const sm of src.getRoot().listMeshes())for(const p of sm.listPrimitives()){
  const mn=p.getMaterial().getName();if(!['human_surface','eyes','team_primary'].includes(mn))continue;
  const g=empty(),a=p.getAttribute('POSITION'),uv=p.getAttribute('TEXCOORD_0'),ji=p.getAttribute('JOINTS_0'),we=p.getAttribute('WEIGHTS_0');
  for(let i=0;i<a.getCount();i++){const jj=ji.getElement(i,[]),ww=we.getElement(i,[]);let pp=transform(a.getElement(i,[]),jj,ww);if(mn==='team_primary'){const raw=a.getElement(i,[]);pp=[raw[0]*1.20*w,(1.035+(raw[1]-1.035)*1.32)*s,raw[2]*1.12*s+.005*s];}const uuv=uv.getElement(i,[]);if(mn==='human_surface'&&uuv[0]>.5&&uuv[0]<.535&&uuv[1]>.68&&uuv[1]<.75)pp[2]-=.065*s*Math.max(0,Math.min(1,(1.54*s-pp[1])/(.02*s)));add(g,pp,uuv,jj.map((j,k)=>[j,ww[k]]));}
  for(let i=0;i<p.getIndices().getCount();i+=3){const ids=[0,1,2].map(k=>p.getIndices().getScalar(i+k));if(mn==='human_surface'&&ids.every(id=>g.pos[id*3+1]<.24*s))continue;g.index.push(...ids);}
  if(mn==='human_surface'){
   // Smooth the inherited clavicle/shoulder influence discontinuity while
   // preserving the modeled rest surface and all distal palm weights.
   const adj=Array.from({length:g.pos.length/3},()=>new Set());for(let i=0;i<g.index.length;i+=3)for(let k=0;k<3;k++){let a=g.index[i+k],b=g.index[i+(k+1)%3];adj[a].add(b);adj[b].add(a);}
   let dense=adj.map((_,i)=>{let q=Array(18).fill(0);for(let k=0;k<4;k++)q[g.joint[i*4+k]]+=g.weight[i*4+k];return q;});
   for(let pass=0;pass<4;pass++){const next=dense.map(a=>a.slice());for(let i=0;i<adj.length;i++){if(g.pos[i*3+1]<1.36*s||g.pos[i*3+1]>1.68*s||dense[i][6]+dense[i][9]<.025||!adj[i].size)continue;for(let j=0;j<18;j++){let v=0;for(const n of adj[i])v+=dense[n][j]/adj[i].size;next[i][j]=dense[i][j]*.35+v*.65;}}dense=next;}
   for(let i=0;i<dense.length;i++){const pairs=dense[i].map((v,j)=>[j,v]).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=pairs.reduce((a,b)=>a+b[1],0);g.joint.splice(i*4,4,...pairs.map(a=>a[0]));g.weight.splice(i*4,4,...pairs.map(a=>a[1]/sum));}
  }
  primitive(g,mats[mn==='team_primary'?'uniform_primary':mn==='team_trim'?'uniform_trim':mn]);native.push({material:mn,...g});
 }
 // Fit the original sewn template to the actual canonicalized skin surface.
 // Projection is deterministic in XY: torso surfaces below the armpit,
 // deltoid caps allowed only at the shoulder straps. The
 // original sewn-tank torso weights stay intact: overlapping arms in the
 // canonical bind must never transfer arm/forearm weights onto the waist.
 const body=native.find(g=>g.material==='human_surface'),tank=native.find(g=>g.material==='team_primary');
 for(let i=0;i<tank.pos.length/3;i++){
  const x=tank.pos[i*3],y=tank.pos[i*3+1],front=tank.pos[i*3+2]>=0;
  let best=front?-Infinity:Infinity,bestFace=null,bestWeights=null;
  for(let k=0;k<body.index.length;k+=3){const ids=body.index.slice(k,k+3);let torso=0;for(const j of ids)for(let q=0;q<4;q++)if(body.joint[j*4+q]>=1&&body.joint[j*4+q]<=4)torso+=body.weight[j*4+q]/3;if(torso<.80&&y<1.45*s)continue;const p=ids.map(j=>body.pos.slice(j*3,j*3+3)),[a,b,c]=p;
   const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-10)continue;
   const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,z=1-u-v;
   if(u<-.00001||v<-.00001||z<-.00001)continue;const pz=u*a[2]+v*b[2]+z*c[2];
   if(front?pz>best:pz<best){best=pz;bestFace=ids;bestWeights=[u,v,z];}
  }
  if(bestFace&&(front?tank.pos[i*3+2]<best+.030*s:tank.pos[i*3+2]>best-.030*s)){
   tank.pos[i*3+2]=best+(front?.030:-.030)*s;

  }
 }
 const tankPrimitive=mesh.listPrimitives()[1];tankPrimitive.getAttribute('POSITION').setArray(new Float32Array(tank.pos));tankPrimitive.getAttribute('JOINTS_0').setArray(new Uint16Array(tank.joint));tankPrimitive.getAttribute('WEIGHTS_0').setArray(new Float32Array(tank.weight));
 const tankGeo=new THREE.BufferGeometry();tankGeo.setAttribute('position',new THREE.Float32BufferAttribute(tank.pos,3));tankGeo.setIndex(tank.index);tankGeo.computeVertexNormals();const tankNormals=tankGeo.attributes.normal.array;for(let i=0;i<tankNormals.length;i+=3)if(Math.hypot(tankNormals[i],tankNormals[i+1],tankNormals[i+2])<.5){tankNormals[i]=0;tankNormals[i+1]=1;tankNormals[i+2]=0;}tankPrimitive.getAttribute('NORMAL').setArray(new Float32Array(tankNormals));tankGeo.dispose();
 // Tubes create articulated shorts, socks, and shoe details. Original topology.
 const tube=(g,rings,seg=18)=>{let start=g.pos.length/3;for(let r=0;r<rings.length;r++){const a=rings[r];for(let k=0;k<=seg;k++){let ph=k/seg*Math.PI*2;add(g,[a.x+Math.cos(ph)*a.rx,a.y,a.z+Math.sin(ph)*a.rz],uvCloth(k/seg,r/(rings.length-1)),a.weights.map(x=>x.slice()));if(r&&k){const i=g.pos.length/3-1,j=i-(seg+1);if(rings[r].y<rings[r-1].y)g.index.push(j-1,j,i-1,j,i,i-1);else g.index.push(j-1,i-1,j,j,i-1,i);}}}};
 const shorts=empty(),trim=empty(),socks=empty(),shoe=empty(),sole=empty();
 tube(shorts,[{x:0,y:1.06*s,z:0,rx:.205*w,rz:.126*s,weights:[['Hips',1]]},{x:0,y:.94*s,z:0,rx:.225*w,rz:.142*s,weights:[['Hips',1]]}],24);
 for(const [side,sign]of [['Left',1],['Right',-1]]){
  tube(shorts,[{x:sign*.103*w,y:1.01*s,z:0,rx:.125*w,rz:.137*s,weights:[['Hips',.5],[side+'UpLeg',.5]]},{x:sign*.109*w,y:.84*s,z:0,rx:.125*w,rz:.131*s,weights:[[side+'UpLeg',1]]},{x:sign*.111*w,y:.67*s,z:0,rx:.114*w,rz:.122*s,weights:[[side+'UpLeg',1]]},{x:sign*.111*w,y:.535*s,z:0,rx:.111*w,rz:.116*s,weights:[[side+'UpLeg',.85],[side+'Leg',.15]]}],20);
  tube(trim,[{x:sign*.111*w,y:.538*s,z:0,rx:.112*w,rz:.117*s,weights:[[side+'UpLeg',.85],[side+'Leg',.15]]},{x:sign*.111*w,y:.552*s,z:0,rx:.113*w,rz:.118*s,weights:[[side+'UpLeg',.9],[side+'Leg',.1]]}],20);
  tube(socks,[{x:sign*.105*w,y:.125*s,z:0,rx:.049*w,rz:.050*s,weights:[[side+'Foot',1]]},{x:sign*.105*w,y:.265*s,z:0,rx:.058*w,rz:.058*s,weights:[[side+'Leg',1]]}],16);
  const foot=world[side+'Foot'];
  const sneaker=(g,sy,soleMode)=>{let rings=6,seg=20,start=g.pos.length/3;for(let r=0;r<=rings;r++){const v=r/rings,yy=(soleMode?.010+v*.031:.041+v*.088)*s;const factor=Math.sin((.12+v*.77)*Math.PI);for(let k=0;k<=seg;k++){const a=k/seg*Math.PI*2,x=foot.x+Math.cos(a)*(.066*(soleMode?1:Math.max(.45,factor)))*w,z=.075*s+Math.sin(a)*(.155*(soleMode?1:Math.max(.55,factor)))*s;add(g,[x,yy,z],neutral,[[side+'Foot',1]]);if(r&&k){const i=g.pos.length/3-1,j=i-(seg+1);g.index.push(j-1,i-1,j,j,i-1,i);}}}let bottom=add(g,[foot.x,(soleMode?.010:.041)*s,.075*s],neutral,[[side+'Foot',1]]);for(let k=0;k<seg;k++)g.index.push(bottom,start+k+1,start+k);};
  sneaker(shoe,s,false);sneaker(sole,s,true);
 }
 primitive(shorts,mats.uniform_secondary);primitive(trim,mats.uniform_trim);primitive(socks,mats.sock);primitive(shoe,mats.shoe_upper);primitive(sole,mats.shoe_sole);
 // Original close-cropped opaque scalp cap; no hair cards from the source.
 const hair=empty(),head=world.Head;
 const human=native.find(p=>p.material==='human_surface');let headTop=-Infinity;for(let i=0;i<human.pos.length/3;i++)if(human.weight[i*4+human.joint.slice(i*4,i*4+4).indexOf(5)]>.5)headTop=Math.max(headTop,human.pos[i*3+1]);
 const hc=[head.x,headTop-.09*s,head.z+.012*s];
 for(let r=0;r<=7;r++){const ph=.01+r/7*1.50;for(let k=0;k<=24;k++){const th=k/24*2*Math.PI;add(hair,[hc[0]+Math.sin(ph)*Math.cos(th)*.085*w,hc[1]+Math.cos(ph)*.106*s,hc[2]+Math.sin(ph)*Math.sin(th)*.085*s],neutral,[['Head',1]]);if(r&&k){const i=hair.pos.length/3-1,j=i-25;hair.index.push(j-1,j,i-1,j,i,i-1);}}}
 primitive(hair,mats.hair_original);
 // Exact body height normalization: generated geometry is grounded on the sole,
 // then the full rig/mesh is uniformly normalized to the requested height.
 let minY=Infinity,maxY=-Infinity;for(const p of mesh.listPrimitives()){const a=p.getAttribute('POSITION').getArray();for(let i=1;i<a.length;i+=3){minY=Math.min(minY,a[i]);maxY=Math.max(maxY,a[i]);}}
 const finalScale=h/(maxY-minY);
 for(const p of mesh.listPrimitives()){const a=p.getAttribute('POSITION').getArray();for(let i=0;i<a.length;i+=3){a[i]*=finalScale;a[i+1]=(a[i+1]-minY)*finalScale;a[i+2]*=finalScale;}}
 for(let i=0;i<names.length;i++){let t=nodes[i].getTranslation().map(v=>v*finalScale);if(names[i]==='Hips')t[1]-=minY*finalScale;nodes[i].setTranslation(t);if(names[i]==='Root')world[names[i]].set(0,0,0);else world[names[i]].multiplyScalar(finalScale).add(new THREE.Vector3(0,-minY*finalScale,0));ibm.set(new THREE.Matrix4().makeTranslation(...world[names[i]].toArray().map(v=>-v)).toArray(),i*16);}
 skin.getInverseBindMatrices().setArray(ibm);
 const scene=d.createScene(spec.id+'-scene');scene.addChild(nodes[0]);scene.addChild(d.createNode(spec.id+'-mesh').setMesh(mesh).setSkin(skin));d.getRoot().setDefaultScene(scene);
 d.getRoot().getAsset().generator='Hoops tall v1 — CC0 core anatomy + original unbranded sportswear';
 const joints=nodes.map((n,i)=>({name:names[i],parent:parents[i],translation:n.getTranslation(),worldPosition:world[names[i]].toArray()}));
 const palms={};for(const side of ['Left','Right']){const bi=names.indexOf(side+'Hand'),candidates=[];for(let i=0;i<human.pos.length/3;i++){let ww=0;for(let k=0;k<4;k++)if(human.joint[i*4+k]===bi)ww+=human.weight[i*4+k];if(ww<.94)continue;const p=mesh.listPrimitives()[0];const actual=human.pos.slice(i*3,i*3+3).map((v,k)=>(v-(k===1?minY:0))*finalScale);const q=V(actual).sub(world[side+'Hand']);if(q.y<-.060*ar&&q.y>-.122*ar&&q.z>.005*ar&&Math.abs(q.x)<.035*ar)candidates.push({vertex:i,local:q.toArray(),score:Math.abs(q.y+.10*ar)+Math.abs(q.x)*.15+Math.abs(q.z-.025*ar)*.2});}candidates.sort((a,b)=>a.score-b.score);if(!candidates.length)throw Error('No real palmar surface vertex');const c=candidates[0];palms[side+'Hand']={palmPoint:c.local,palmSurface:{primitive:2,sourceVertex:c.vertex,minimumHandWeight:.94},palmNormal:[0,0,1],fingerDirection:[0,-1,0],palmarSurfaceVerified:true};}
 const triangles=mesh.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0);
 const meta={...spec,armLengthMeters:(.380+.340)*ar*finalScale+(-palms.RightHand.palmPoint[1]),palmPoint:palms.RightHand.palmPoint,joints,palms,triangles,heightMeters:h,shoulderHeightMeters:world.RightArm.y,normalizationScale:finalScale,textureSize:[1024,1024],uvLayout:'same-indexed-UV-atlas-v1',runtimePath:`runtime/${spec.id}.glb`,dracoPath:`models/${spec.id}.glb`};
 const runtime=await io.writeBinary(d);await fs.writeFile(path.join(base,meta.runtimePath),runtime);
 await d.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14,quantizeGeneric:16}));
 const packed=await io.writeBinary(d);await fs.writeFile(path.join(base,meta.dracoPath),packed);
 meta.runtimeBytes=runtime.length;meta.dracoBytes=packed.length;meta.runtimeSha256=hash(runtime);meta.dracoSha256=hash(packed);allProfiles.push(meta);
 console.log(spec.id,JSON.stringify({triangles,height:h,shoulder:meta.shoulderHeightMeters,arm:meta.armLengthMeters,palms,finalScale,runtime:runtime.length,draco:packed.length}));
}
await fs.writeFile(path.join(base,'rig.json'),JSON.stringify({schemaVersion:1,boneNames:names,parents,profiles:allProfiles,palettes,source:{path:'../hoops-v7/characters/models/pg-lod1.glb',sha256:hash(original),retained:'Only MakeHuman core human_surface above ankles and core eyes; native hair, shoes and externally sourced clothing/animation discarded; original project sewn-tank and piping retained as fitted template.',license:'CC0-1.0 for retained upstream MakeHuman core anatomy/eyes only',projectOriginal:'Fitted sewn tank template from hoops-v7/characters/source/model_helpers_garments.mjs and build_characters.mjs, adapted into the new canonical proportions and refitted here. No native source garment retained.',licenseURL:'https://static.makehumancommunity.org/about/license.html'},units:'meters',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},bindPolicy:'Identity local joint rotations; canonical limb directions. Apply motion2 local quaternions directly; preserve profile translations.'},null,2)+'\n');
