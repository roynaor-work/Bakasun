import fs from 'node:fs/promises';
import {root,THREE as T,Document,acc,primitive,save,writeJSON,MeshoptSimplifier} from './common.mjs';
const assets=[];
class Builder{
 constructor(id,consolidate=false){this.doc=new Document();this.doc.createBuffer();this.scene=this.doc.createScene(id);this.pools=new Map();this.materials=new Map();this.consolidate=consolidate;}
 material(name,color,rough=.75,metal=0){
  if(!this.materials.has(name))this.materials.set(name,this.doc.createMaterial(name).setBaseColorFactor([...new T.Color(color).toArray(),1]).setRoughnessFactor(rough).setMetallicFactor(metal));
  return this.materials.get(name);
 }
 add(g,material,matrix=new T.Matrix4(),color=null){
  g.applyMatrix4(matrix);if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));
  if(!g.attributes.normal)g.computeVertexNormals();
  const key=material.getName();if(!this.pools.has(key))this.pools.set(key,{material,parts:[]});
  if(color){const c=new T.Color(color);g.setAttribute('color',new T.Float32BufferAttribute(Array.from({length:g.attributes.position.count},()=>c.toArray()).flat(),3));}
  this.pools.get(key).parts.push(g);
 }
 box(name,color,p,s,rough=.75){this.add(new T.BoxGeometry(...s),this.material(name,color,rough),new T.Matrix4().makeTranslation(...p));}
 cylinder(name,color,a,b,r,n=8){
  const aa=new T.Vector3(...a),bb=new T.Vector3(...b),dir=bb.clone().sub(aa);
  this.add(new T.CylinderGeometry(r,r,dir.length(),n),this.material(name,color),new T.Matrix4().compose(aa.add(bb).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize()),new T.Vector3(1,1,1)));
 }
 sphere(name,color,p,r,seg=12,rings=8){this.add(new T.SphereGeometry(1,seg,rings),this.material(name,color),new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion(),new T.Vector3(...r)));}
 flush(){
  if(this.consolidate){
   const combined={material:this.material('Venue vertex palette','#FFFFFF'),parts:[]},kept=new Map();
   for(const [name,pool] of this.pools){
    if(name==='Floodlight glass'){kept.set(name,pool);continue;}
    const base=pool.material.getBaseColorFactor();
    for(const g of pool.parts){
     const old=g.attributes.color?.array,colors=[];
     for(let i=0;i<g.attributes.position.count;i++)for(let k=0;k<3;k++)colors.push(base[k]*(old?old[i*3+k]:1));
     g.setAttribute('color',new T.Float32BufferAttribute(colors,3));combined.parts.push(g);
    }
   }
   kept.set('Venue vertex palette',combined);this.pools=kept;
  }
  for(const [name,pool] of this.pools){
   const p=[],n=[],uv=[],c=[],ii=[],tangents=[];let off=0;const colored=pool.parts.some(g=>g.attributes.color);
   for(const g of pool.parts){
    p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);if(g.attributes.tangent)tangents.push(...g.attributes.tangent.array);
    uv.push(...(g.attributes.uv?.array??new Float32Array(g.attributes.position.count*2)));
    if(colored)c.push(...(g.attributes.color?.array??new Float32Array(g.attributes.position.count*3).fill(1)));
    for(const i of g.index.array)ii.push(i+off);off+=g.attributes.position.count;
   }
   const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(p,3)).setAttribute('normal',new T.Float32BufferAttribute(n,3)).setAttribute('uv',new T.Float32BufferAttribute(uv,2)).setIndex(ii);
   if(colored)g.setAttribute('color',new T.Float32BufferAttribute(c,3));if(tangents.length)g.setAttribute('tangent',new T.Float32BufferAttribute(tangents,4));
   this.scene.addChild(this.doc.createNode(name).setMesh(this.doc.createMesh(name).addPrimitive(primitive(this.doc,g,pool.material,name))));
  }
  this.pools.clear();return this.doc;
 }
}
for(const kind of ['hard','clay','grass']){
 const b=new Builder('Court '+kind);const color=kind==='hard'?'#3E6D78':kind==='clay'?'#AD5B3A':'#496A39';
 b.box('Court surround',kind==='hard'?'#315950':kind==='clay'?'#8A664C':'#435C3D',[0,-.035,0],[19.5,.07,36.5]);
 const tex=b.doc.createTexture(kind+' 1024 grain').setImage(await fs.readFile(root+'/textures/'+kind+'-court.jpg')).setMimeType('image/jpeg');
 const mat=b.material('Court surface',color,.94);mat.setBaseColorFactor([1,1,1,1]).setBaseColorTexture(tex);
 const normal=b.doc.createTexture(kind+' 1024 micro normal').setImage(await fs.readFile(root+'/textures/'+kind+'-normal.jpg')).setMimeType('image/jpeg');
 mat.setNormalTexture(normal).setNormalScale(kind==='grass'?.42:.24);mat.getNormalTextureInfo().setWrapS(10497).setWrapT(10497);
 // A modest grid carries unique macro wear and mowing color independently of the small tile.
 const g=new T.PlaneGeometry(10.97,23.77,16,32);g.rotateX(-Math.PI/2);g.translate(0,.009,0);
 const colors=[];
 for(let i=0;i<g.attributes.position.count;i++){
  const x=g.attributes.position.getX(i),z=g.attributes.position.getZ(i);
  const wear=Math.exp(-(((Math.abs(z)-10.5)/1.4)**2))*Math.exp(-x*x/11);
  let shade=kind==='grass'?(Math.floor((z+11.885)/2.97)%2?.91:1):1;
  if(kind==='clay')shade-=wear*.055;
  colors.push(shade,shade,shade);
 }
 g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*5.5,uv.getY(i)*11.9);
 g.computeTangents();
 const info=mat.getBaseColorTextureInfo();info.setWrapS(10497).setWrapT(10497);
 b.add(g,mat);
 const lines=b.material('Ivory court lines','#F5F2DF',.92);
 const stripe=(x,z,w,d)=>b.add(new T.BoxGeometry(w,.008,d),lines,new T.Matrix4().makeTranslation(x,.021,z));
 for(const x of [-5.485,5.485,-4.115,4.115])stripe(x,0,.05,23.77);
 for(const z of [-11.885,11.885])stripe(0,z,10.97,.10);
 for(const z of [-6.40,6.40])stripe(0,z,8.23,.05);
 stripe(0,0,.05,12.80);for(const z of [-11.72,11.72])stripe(0,z,.05,.30);
 assets.push(await save(b.flush(),'models/court-'+kind+'.glb',{kind:'court',surface:kind,dimensions:{length:23.77,doubles:10.97,singles:8.23,service:6.40},textures:[{width:1024,height:1024,file:'textures/'+kind+'-court.jpg'}]}));
}
{
 const b=new Builder('Intimate open tennis venue',true);
 b.box('Ivory platform','#D6D0B9',[0,-.42,0],[34,.76,49]);
 b.box('Court edging','#E9E1C9',[0,-.03,-18.7],[20.5,.12,.25]);
 b.box('Court edging','#E9E1C9',[0,-.03,18.7],[20.5,.12,.25]);
 for(const sign of [-1,1]){
  b.box('Court edging','#E9E1C9',[sign*9.98,-.03,0],[.25,.12,37.4]);
  b.box('Green back wall','#294F47',[0,1.0,sign*18.85],[20.2,2.0,.17]);
  b.box('Ivory coping','#D4CCAF',[0,2.03,sign*18.85],[20.4,.13,.24]);
 }
 // Terraces and walking aisles keep spectators outside the running clearance.
 for(let row=0;row<5;row++){
  b.box('Warm concrete terraces','#B7B4A0',[0,.42+row*.29,-20.1-row*.85],[29,.55+row*.58,.90]);
  for(const sign of [-1,1])b.box('Warm concrete terraces','#B7B4A0',[sign*(11.2+row*.80),.38+row*.29,-1.5],[.85,.48+row*.58,30.8]);
 }
 for(const sign of [-1,1]){
  for(const z of [-16.8,13.8]){
   b.cylinder('Brushed rails','#51645A',[sign*10.8,.7,z],[sign*15.1,3.0,z],.035);
   for(let row=0;row<6;row++)b.cylinder('Brushed rails','#51645A',[sign*(10.8+row*.85),.0,z],[sign*(10.8+row*.85),.7+row*.46,z],.026);
  }
  b.box('Terrace back wall','#8C9A87',[sign*15.25,1.80,-1.5],[.18,3.6,31.8]);
 }
 // A light canopy gives the far stand an identifiable silhouette without branding.
 for(const x of [-13.5,-6.75,0,6.75,13.5])b.cylinder('Canopy posts','#6A7664',[x,0,-24],[x,4.15,-24],.065,10);
 b.box('Linen canopy','#DCD7BF',[0,4.18,-22.7],[29.1,.14,4.2]);
 b.box('Canopy green fascia','#284B43',[0,4.03,-20.6],[29.2,.28,.14]);
 for(let x=-14;x<=14;x+=.65)b.box('Canopy seams','#BDBB9E',[x,4.27,-22.7],[.025,.018,4.18]);
 // Four floodlight arrays, emissive lighting is applied by the preview's evening mode.
 for(const x of [-10.3,10.3])for(const z of [-17,17]){
  b.cylinder('Floodlight masts','#657263',[x,0,z],[x,9.1,z],.065,10);
  b.box('Floodlight frames','#29413E',[x,9.1,z],[1.65,.35,.20]);
  for(let i=0;i<4;i++)b.box('Floodlight glass','#F5EDD7',[x-.61+i*.40,9.1,z+(z>0?-.12:.12)],[.31,.23,.025]);
 }
 // Umpire tower with ladder, footrest, bracing, handrails, seat and umbrella.
 for(const x of [6.65,7.25])for(const z of [-.37,.37])b.cylinder('Umpire ivory frame','#E8E1CA',[x,0,z],[x,2.45,z],.033,8);
 for(const z of [-.37,.37]){
  b.cylinder('Umpire braces','#C7C4AC',[6.65,.05,z],[7.25,1.85,z],.022);
  b.cylinder('Umpire braces','#C7C4AC',[7.25,.05,z],[6.65,1.85,z],.022);
 }
 for(let i=0;i<7;i++)b.cylinder('Umpire ladder','#DCD6BE',[7.27,.22+i*.25,-.34],[7.27,.22+i*.25,.34],.025);
 b.box('Umpire green seat','#305B4E',[6.91,2.05,0],[.72,.12,.75]);
 b.box('Umpire green back','#305B4E',[7.27,2.39,0],[.09,.63,.75]);
 b.box('Umpire writing shelf','#DED4B7',[6.49,2.48,0],[.26,.05,.67]);
 b.box('Umpire footrest','#C8C4AA',[6.45,1.55,0],[.45,.10,.72]);
 b.cylinder('Umbrella pole','#6D7969',[7.32,0,.43],[7.32,3.52,.43],.022);
 b.add(new T.ConeGeometry(1.05,.32,8),b.material('Umpire parasol','#E3D9B9'),new T.Matrix4().makeTranslation(7.12,3.52,.20));
 // Benches, rolled towels, spare bags and water bottles are deliberately plain.
 for(const z of [-5.3,5.3]){
  b.box('Player benches','#4D6556',[-7.9,.46,z],[.55,.13,2.2]);
  b.box('Player benches','#4D6556',[-8.12,.77,z],[.10,.57,2.2]);
  for(const zz of [z-.8,z+.8])b.box('Bench legs','#CBD0B6',[-7.9,.20,zz],[.50,.43,.09]);
  b.box('Equipment bags','#37515D',[-7.7,.23,z+1.35],[.46,.45,.75]);
  b.box('Towels','#EEE7D4',[-7.9,.56,z+.45],[.43,.07,.38]);
  for(let i=0;i<2;i++)b.cylinder('Water bottles','#7A9C99',[-7.35,.05,z+i*.20],[-7.35,.29,z+i*.20],.045,8);
 }
 for(const [x,z] of [[-8.2,-14.2],[8.2,14.2]]){
  b.box('Photographer stools','#46574C',[x,.54,z],[.46,.08,.42]);
  for(const side of [-1,1]){
   b.cylinder('Photographer stool frames','#6A7467',[x+side*.19,.03,z-.19],[x-side*.19,.50,z+.19],.017,6);
   b.cylinder('Photographer stool frames','#6A7467',[x+side*.19,.03,z+.19],[x-side*.19,.50,z-.19],.017,6);
  }
 }
 // Perimeter olive trees and distant sculpted hills make a complete outdoor set.
 for(const x of [-15.5,15.5])for(const z of [-24.8,17.5,23.8]){
  b.add(new T.CylinderGeometry(.43,.34,.70,10),b.material('Terracotta pots','#A98463'),new T.Matrix4().makeTranslation(x,.35,z));
  b.cylinder('Tree trunks','#7C6E50',[x,.6,z],[x,3.0,z],.10);
  for(const [dx,dy,dz] of [[0,0,0],[-.7,-.2,.3],[.6,-.3,.4],[.1,.4,-.2]])b.add(new T.IcosahedronGeometry(.95,1),b.material('Olive foliage','#6F8057'),new T.Matrix4().compose(new T.Vector3(x+dx,3.1+dy,z+dz),new T.Quaternion(),new T.Vector3(1,.85,1)));
 }
 for(const [x,z,s] of [[-55,-75,16],[0,-85,21],[55,-77,17]])b.add(new T.IcosahedronGeometry(1,2),b.material('Distant sage hills','#9DA98E'),new T.Matrix4().compose(new T.Vector3(x,-2,z),new T.Quaternion(),new T.Vector3(s,s*.22,s)));
 assets.push(await save(b.flush(),'models/venue.glb',{kind:'venue',contains:['terraces','canopy','floodlights','umpire-chair','benches','trees']}));
}

// One low-cost, vertex-colored seated prototype at each LOD, with a cheering pose.
function human(b,position,yaw,role='spectator',seated=true,cheer=false,detail=8){
 const p=new T.Vector3(...position),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw);
 const point=a=>new T.Vector3(...a).applyQuaternion(q).add(p).toArray();
 if(detail===5){
  const material=b.material('People','#FFFFFF').setDoubleSided(true);
  function quad(points,c){const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(points.flatMap(point),3)).setIndex([0,1,2,0,2,3]);g.computeVertexNormals();b.add(g,material,new T.Matrix4(),c);}
  quad([[-.16,.61,.02],[.16,.61,.02],[.19,1.06,0],[-.19,1.06,0]],'#ECEAE0');
  b.add(new T.OctahedronGeometry(1,0),material,new T.Matrix4().compose(new T.Vector3(...point([0,1.26,0])),q,new T.Vector3(.105,.13,.10)),'#A8795D');
  quad([[-.095,1.30,.066],[.095,1.30,.066],[.07,1.39,.01],[-.07,1.39,.01]],'#37362F');
  for(const s of [-1,1]){
   quad([[s*.17,1.02,.02],[s*.24,1.02,.02],[s*.28,.77,.15],[s*.21,.77,.15]],'#ECEAE0');
   quad([[s*.21,.79,.15],[s*.28,.77,.15],[s*.18,.64,.33],[s*.12,.66,.33]],'#A8795D');
   quad([[s*.05,.64,.02],[s*.18,.64,.02],[s*.18,.53,.36],[s*.05,.53,.36]],'#374748');
   quad([[s*.05,.54,.36],[s*.18,.54,.36],[s*.17,.10,.36],[s*.06,.10,.36]],'#374748');
   quad([[s*.05,.12,.36],[s*.18,.12,.36],[s*.18,.04,.51],[s*.05,.04,.51]],'#D4D2C6');
  }
  return;
 }
 const shirt=role==='photographer'?'#3F5254':role==='official'?'#C6D7CE':'#ECEAE0';
 const skin=role==='official'?'#BC8C68':'#A8795D';
 const limb=(a,z,r,color)=>b.cylinder('People', '#FFFFFF',point(a),point(z),r,detail);
 function segment(a,z,r,color){
  const aa=new T.Vector3(...point(a)),zz=new T.Vector3(...point(z)),d=zz.clone().sub(aa);
  b.add(new T.CylinderGeometry(r*.88,r,d.length(),detail,1),b.material('People','#FFFFFF'),new T.Matrix4().compose(aa.add(zz).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()),new T.Vector3(1,1,1)),color);
 }
 function ell(pos,r,color,seg=detail,rings=detail===8?5:3){b.add(new T.SphereGeometry(1,seg,rings),b.material('People','#FFFFFF'),new T.Matrix4().compose(new T.Vector3(...point(pos)),q,new T.Vector3(...r)),color);}
 const hip=seated?.57:.85,chest=hip+.38,head=hip+.69;
 ell([0,hip+.25,0],[.20,.28,.12],shirt);
 ell([0,head,0],[.103,.128,.098],skin);
 ell([0,head+.066,-.014],[.106,.078,.100],'#37362F');
 for(const s of [-1,1]){
  const elbow=role==='photographer'?[s*.27,hip+.36,.12]:cheer?[s*.31,chest+.35,.06]:[s*.25,hip+.20,.13];
  const hand=role==='photographer'?[s*.10,hip+.60,.27]:cheer?[s*.27,chest+.60,.08]:[s*.14,hip+.07,.32];
  segment([s*.17,chest+.06,0],elbow,.048,shirt);segment(elbow,hand,.037,skin);ell(hand,[.039,.050,.032],skin);
  const knee=seated?[s*.12,.53,.36]:[s*.10,.43,.04],ankle=[s*.12,.10,seated?.36:.03];
  segment([s*.10,hip,0],knee,.070,'#374748');segment(knee,ankle,.055,'#374748');ell([s*.12,.06,(seated?.36:.03)+.055],[.067,.045,.12],'#D4D2C6');
 }
 if(role==='official'){
  ell([0,head+.085,.035],[.119,.035,.125],'#ECE7D7');
  // Visor projects over the face; the thin dark eyes read in the net closeup.
  for(const s of [-1,1])ell([s*.038,head+.01,.092],[.012,.007,.005],'#363C37',6,3);
 }
 if(role==='photographer'){
  b.add(new T.BoxGeometry(.22,.13,.12),b.material('People','#FFFFFF'),new T.Matrix4().compose(new T.Vector3(...point([0,hip+.61,.25])),q,new T.Vector3(1,1,1)),'#263634');
  segment([0,hip+.61,.28],[0,hip+.61,.53],.068,'#1E2B2C');
  // Camera strap and monopod make the photographer readable from the court.
  segment([0,hip+.53,.30],[0,.04,.43],.009,'#46554A');
 }
}
{
 const b=new Builder('Crowd prototypes');
 for(const [id,cheer,detail] of [['Crowd_LOD0',false,8],['Crowd_Cheer',true,8],['Crowd_LOD1',false,5]]){
  human(b,[0,0,0],0,'spectator',true,cheer,detail);b.flush();
  const node=b.scene.listChildren().at(-1);node.setName(id);node.getMesh().setName(id);
  const p=node.getMesh().listPrimitives()[0],target=id==='Crowd_LOD1'?54:174;
  const original=new Uint32Array(p.getIndices().getArray());
  const [indices]=original.length>target*3?MeshoptSimplifier.simplify(original,new Float32Array(p.getAttribute('POSITION').getArray()),3,target*3,1.0):[original,0];
  p.setIndices(acc(b.doc,id+' reduced indices','SCALAR',indices));
 }
 assets.push(await save(b.doc,'models/crowd-prototypes.glb',{kind:'instancing-prototypes',instancesBaked:false}));
}
{
 const b=new Builder('Court officials and photographers');
 human(b,[6.91,1.585,0],-Math.PI/2,'official',true,false,10);
 for(const [x,z,yaw] of [[-6.8,-11.885,Math.PI/2],[6.8,-11.885,-Math.PI/2],[-6.8,11.885,Math.PI/2],[6.8,11.885,-Math.PI/2]])human(b,[x,0,z],yaw,'official',false,false,8);
 human(b,[-8.2,0,-14.2],Math.PI/3,'photographer',true,false,10);human(b,[8.2,0,14.2],-Math.PI*.7,'photographer',true,false,10);
 assets.push(await save(b.flush(),'models/crew.glb',{kind:'crew',umpires:1,lineJudges:4,photographers:2}));
}
const layout=[];let serial=0;
for(let row=0;row<5;row++){
 for(let column=0;column<35;column++){
  const x=-13.6+column*.80;if(Math.abs(x)<.65||Math.abs(x-7.2)<.45||Math.abs(x+7.2)<.45)continue;
  layout.push({id:serial++,position:[x,.645+row*.58,-20.1-row*.85],yaw:0,row,section:'north'});
 }
 for(const sign of [-1,1])for(let column=0;column<35;column++){
  const z=-15.8+column*.84;if(Math.abs(z)<1.3)continue;
  layout.push({id:serial++,position:[sign*(11.2+row*.80),.565+row*.58,z],yaw:sign>0?-Math.PI/2:Math.PI/2,row,section:sign>0?'east':'west'});
 }
}
await writeJSON('crowd-layout.json',{seed:7011,count:layout.length,instances:layout});
await writeJSON('environment.json',assets);
