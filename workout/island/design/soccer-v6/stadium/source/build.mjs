// Authoring only. Runtime uses local three.js r160 and needs no build step.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(process.env.STADIUM_TOOLS || '/tmp/stadium-v6-tools/package.json');
const {Document,NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS,EXTTextureWebP,KHRMaterialsEmissiveStrength}=require('@gltf-transform/extensions');
const {draco,prune,simplify}=require('@gltf-transform/functions');
const {MeshoptSimplifier}=require('meshoptimizer');
const codec=require('draco3dgltf'), sharp=require('sharp');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.encoder':await codec.createEncoderModule(),'draco3d.decoder':await codec.createDecoderModule()});
const ROOT=path.resolve(import.meta.dirname,'..'), TMP='/tmp/stadium-v6-tools';
const SOURCE=path.resolve(ROOT,'../../soccer-v4/soccer-player.glb');
if(process.argv.includes('--decode')){
  const d=await io.read(SOURCE);
  for(const e of d.getRoot().listExtensionsUsed())if(e.extensionName==='KHR_draco_mesh_compression')e.dispose();
  await io.write(path.join(TMP,'player-raw.glb'),d);process.exit(0);
}
await MeshoptSimplifier.ready;
const stats={units:'metres',up:'+Y',pitch:{width:68,length:105},files:[],meshes:[],sources:[]};
const hash=b=>createHash('sha256').update(b).digest('hex');
const linear=h=>h.replace('#','').match(/../g).map(x=>{const v=parseInt(x,16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
const white=[1,1,1];
function doc(){const d=new Document();d.createBuffer();d.createScene('Stadium 06');d.getRoot().getAsset().copyright='CC0-1.0 · original stadium and derivatives of repository CC0 athlete, 2026';return d;}
function material(d,name,color='#ffffff',rough=.8,metal=0){return d.createMaterial(name).setBaseColorFactor([...linear(color),1]).setRoughnessFactor(rough).setMetallicFactor(metal);}
async function texture(d,file){if(file.endsWith('.webp')&&!d.getRoot().listExtensionsUsed().some(e=>e.extensionName==='EXT_texture_webp'))d.createExtension(EXTTextureWebP).setRequired(true);return d.createTexture(file).setImage(new Uint8Array(await fs.readFile(path.join(ROOT,'textures',file)))).setMimeType(file.endsWith('.png')?'image/png':file.endsWith('.jpg')?'image/jpeg':'image/webp');}
function bucket(name,mat,uvRect=[0,0,1,1]){return {name,mat,uvRect,p:[],n:[],c:[],uv:[],idx:[]};}
function tri(g,a,b,c,col=white,uvs=[[0,0],[1,0],[1,1]]){
  const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1;
  const base=g.p.length/3;
  for(const [i,p]of[a,b,c].entries()){g.p.push(...p);g.n.push(...n.map(x=>x/l));g.c.push(...col);g.uv.push(g.uvRect[0]+uvs[i][0]*g.uvRect[2],g.uvRect[1]+uvs[i][1]*g.uvRect[3]);}
  g.idx.push(base,base+1,base+2);
}
function quad(g,a,b,c,d,col=white){tri(g,a,b,c,col);tri(g,a,c,d,col,[[0,0],[1,1],[0,1]]);}
function box(g,x,y,z,w,h,d,col=white){
  const a=[x-w/2,y-h/2,z-d/2],b=[x+w/2,y-h/2,z-d/2],c=[x+w/2,y+h/2,z-d/2],e=[x-w/2,y+h/2,z-d/2];
  const f=[x-w/2,y-h/2,z+d/2],i=[x+w/2,y-h/2,z+d/2],j=[x+w/2,y+h/2,z+d/2],k=[x-w/2,y+h/2,z+d/2];
  quad(g,e,c,b,a,col);quad(g,f,i,j,k,col);quad(g,a,b,i,f,col);quad(g,k,j,c,e,col);quad(g,a,f,k,e,col);quad(g,b,c,j,i,col);
}
function tube(g,a,b,r=0.04,sides=5,col=white){
  const dir=b.map((v,i)=>v-a[i]),len=Math.hypot(...dir);dir.forEach((v,i)=>dir[i]=v/len);
  let u=Math.abs(dir[1])<.9?[-dir[2],0,dir[0]]:[1,0,0];let l=Math.hypot(...u);u=u.map(v=>v/l);
  const v=[dir[1]*u[2]-dir[2]*u[1],dir[2]*u[0]-dir[0]*u[2],dir[0]*u[1]-dir[1]*u[0]];
  const pt=(p,t)=>p.map((x,i)=>x+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t)));
  for(let i=0;i<sides;i++){const t=i/sides*Math.PI*2,s=(i+1)/sides*Math.PI*2;quad(g,pt(a,t),pt(a,s),pt(b,s),pt(b,t),col);}
}
function emit(d,g){
  if(!g.p.length)return;
  const b=d.getRoot().listBuffers()[0],a=(name,type,array)=>d.createAccessor(name).setType(type).setArray(array).setBuffer(b);
  const p=d.createPrimitive().setMaterial(g.mat).setAttribute('POSITION',a(g.name+' positions','VEC3',new Float32Array(g.p))).setAttribute('NORMAL',a(g.name+' normals','VEC3',new Float32Array(g.n))).setAttribute('COLOR_0',a(g.name+' colours','VEC3',new Float32Array(g.c))).setAttribute('TEXCOORD_0',a(g.name+' UV','VEC2',new Float32Array(g.uv))).setIndices(a(g.name+' triangles','SCALAR',new Uint32Array(g.idx)));
  if(g.name==='pitch_surface')p.setAttribute('TANGENT',a('OpenGL tangent basis','VEC4',new Float32Array(Array.from({length:g.p.length/3},()=>[1,0,0,-1]).flat())));
  d.getRoot().listScenes()[0].addChild(d.createNode(g.name).setMesh(d.createMesh(g.name).addPrimitive(p)));
  stats.meshes.push({name:g.name,triangles:g.idx.length/3});
}
async function save(d,name){
  await d.transform(prune({keepLeaves:true}),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:10,quantizeColor:10,quantizeTexcoord:14}));
  const file=path.join(ROOT,'assets',name);await io.write(file,d);const bytes=await fs.readFile(file);
  let triangles=0;for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
  if(bytes.length>1500000)throw Error(name+' exceeds 1.5 MB');
  stats.files.push({path:'assets/'+name,bytes:bytes.length,MB:bytes.length/1000000,triangles,sha256:hash(bytes)});
}

// Rounded rectangular bowl, with explicit straight sidelines and curved corners.
function ring(offset=0,y=0){
  const hx=40+offset,hz=58+offset,r=12+offset,pts=[];
  for(let corner=0;corner<4;corner++){
    const angle=corner*Math.PI/2, cx=(corner===0||corner===3?1:-1)*(hx-r),cz=(corner<2?1:-1)*(hz-r);
    for(let j=0;j<=12;j++){const a=angle+j/12*Math.PI/2;pts.push([cx+r*Math.cos(a),y,cz+r*Math.sin(a)]);}
  }
  return pts;
}
function strip(g,a,b,col=white,skipAisles=false){for(let i=0;i<a.length;i++){if(skipAisles&&i%13===0)continue;let j=(i+1)%a.length;quad(g,a[i],a[j],b[j],b[i],col);}}
const shell=doc(),arch=await texture(shell,'architecture-atlas.webp');
const concrete=material(shell,'Poured concrete · grit atlas').setDoubleSided(true);concrete.setBaseColorTexture(arch);
const steel=material(shell,'Brushed coated steel', '#b0bec1',.44,.7);steel.setBaseColorTexture(arch);
const roof=material(shell,'Canopy · coated aluminium','#566770',.56,.4).setDoubleSided(true);
const seat=material(shell,'Continuous seating rows · six neutral sectors','#ffffff',.66);seat.setBaseColorTexture(arch);
const trim=material(shell,'Bowl edge and balustrade','#283e43',.5,.35);
const ledmat=material(shell,'Unbranded LED ribbon','#ffffff',.65).setBaseColorTexture(await texture(shell,'led-panels.webp')).setEmissiveFactor([.17,.2,.2]);
const lampStrength=shell.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(3.3);
const lamps=material(shell,'Floodlight emitter','#ffffff',.2).setEmissiveFactor([.76,.88,1]).setExtension('KHR_materials_emissive_strength',lampStrength);
const C=bucket('bowl_concrete',concrete,[.002,.002,.495,.495]),S=bucket('roof_trusses',steel,[.502,.002,.495,.495]),R=bucket('canopy',roof),T=bucket('seat_rows',seat,[.502,.502,.495,.495]),B=bucket('balustrades',trim),A=bucket('advertising',ledmat),L=bucket('floodlight_panels',lamps);
const crowd=[],lights=[];
for(const [tier,rows,start,height,rise] of [[0,10,0,1.35,.66],[1,8,13.5,11.1,.8]]){
  for(let row=0;row<rows;row++){
    const off=start+row*1.04,y=height+row*rise;
    const a=ring(off,y),b=ring(off+1.04,y),down=ring(off,y-rise);
    strip(C,down,a);strip(C,a,b);
    const palette=['#386269','#61817f','#4b6c71','#34515d','#8b9690','#506871'];
    for(let i=0;i<a.length;i++){if(i%13===0)continue;const j=(i+1)%a.length;
      quad(T,[a[i][0],y+.14,a[i][2]],[a[j][0],y+.14,a[j][2]],[b[j][0],y+.14,b[j][2]],[b[i][0],y+.14,b[i][2]],linear(palette[Math.floor(i/7)%6]));
    }
    // Approximately 6,000 spectators. Sparse front-row geometry, atlas LOD behind.
    let serial=0;
    for(let i=0;i<a.length;i++){
      const j=(i+1)%a.length,dx=a[j][0]-a[i][0],dz=a[j][2]-a[i][2],len=Math.hypot(dx,dz),count=Math.floor(len/1.06);
      for(let k=0;k<count;k++){
        const t=(k+.5)/count,x=a[i][0]+dx*t,z=a[i][2]+dz*t;
        if((i%13===0&&k<2)||((serial++ +row*17)%29===0))continue;
        const yaw=Math.atan2(-x,-z),variant=(serial+row*3+tier)%6;
        crowd.push({x,y:y+.16,z,yaw,variant,near:tier===0&&row<4&&serial%8===0,phase:(serial*.754877+row*.56984)%1,scale:.91+((serial*37)%17)/100});
      }
    }
  }
  const top=ring(start+rows*1.04,height+(rows-1)*rise),bottom=ring(start+rows*1.04,tier?9.8:0);
  strip(C,top,bottom);strip(B,ring(start-.1,height+.65),ring(start-.1,height+.78));
}
// Upper concourse, hospitality slit, and safety fascia separate both decks.
strip(B,ring(10.5,8.3),ring(13.5,8.3));strip(C,ring(12.8,8.4),ring(12.8,10.7));
strip(R,ring(9.2,21.5),ring(27.0,24));
strip(B,ring(9.2,21.36),ring(9.2,21.6));strip(B,ring(27,23.8),ring(27,24.15));
const inner=ring(9.2,21.4),outer=ring(27,23.85),bottom=ring(26,0);
for(let i=0;i<inner.length;i++){
  tube(S,inner[i],outer[i],.12,5);
  if(i%2===0){tube(S,bottom[i],outer[i],.2,6);tube(S,[bottom[i][0],17.5,bottom[i][2]],inner[i],.1,5);}
  if(i%4===0){const p=inner[i],target=[p[0]*.84,p[1]-.5,p[2]*.84];
    box(B,target[0],target[1],target[2],2.0,.7,.40);box(L,target[0],target[1]-.13,target[2]-.23,1.78,.40,.035);
    lights.push({position:[target[0]*.985,target[1]-.5,target[2]*.985],size:5.5});
  }
}
// Low perimeter LED boards, four neutral phrases packed in one texture.
const adring=ring(-1.4,.67);
for(let i=0;i<adring.length;i++){const j=(i+1)%adring.length,a=adring[i],b=adring[j];A.uvRect=[.002,(i%4)*.25+.006,.996,.238];
  quad(A,[a[0],.13,a[2]],[b[0],.13,b[2]],[b[0],1.1,b[2]],[a[0],1.1,a[2]]);
}
for(const g of[C,S,R,T,B,A,L])emit(shell,g);
await save(shell,'stadium-shell.glb');

const pitch=doc(), turf=material(pitch,'Turf · albedo / OpenGL normal / roughness','#ffffff',.95);
turf.setBaseColorTexture(await texture(pitch,'turf-albedo.jpg')).setNormalTexture(await texture(pitch,'turf-normal.webp')).setNormalScale(.55).setMetallicRoughnessTexture(await texture(pitch,'turf-roughness.webp'));
for(const info of[turf.getBaseColorTextureInfo(),turf.getNormalTextureInfo(),turf.getMetallicRoughnessTextureInfo()])info.setWrapS(10497).setWrapT(10497);
const G=bucket('pitch_surface',turf), O=bucket('runoff',material(pitch,'Runoff turf','#31452b',.98));
quad(O,[-42,-.02,-61],[-42,-.02,61],[42,-.02,61],[42,-.02,-61]);
for(let band=0;band<14;band++)for(let zi=0;zi<4;zi++)for(let xi=0;xi<34;xi++){
  const points=[[xi,zi],[xi,zi+1],[xi+1,zi+1],[xi+1,zi]].map(([i,j])=>[-34+i*2,.01,-52.5+band*7.5+j*7.5/4]);
  const offset=G.p.length/3;
  for(const p of points){const[x,y,z]=p;
    const goalWear=Math.exp(-((x/4.9)**2)-((Math.abs(z)-50.2)/3.0)**2),spotWear=Math.exp(-((x/1.4)**2)-((Math.abs(z)-41.5)/1.4)**2),center=Math.exp(-((x/1.6)**2)-(z/1.6)**2);
    const wear=Math.min(.8,goalWear*.72+spotWear*.5+center*.32),shade=(band%2?.98:1.14)*(1+.045*Math.sin(x*.37+z*.11)+.025*Math.sin(z*.63-x*.19));
    G.p.push(...p);G.n.push(0,1,0);G.c.push((1-wear)*shade+wear*1.12,(1-wear)*shade+wear*.73,(1-wear)*shade+wear*.36);G.uv.push((x+34)/3.8,(z+52.5)/3.8);
  }G.idx.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
}
const W=bucket('regulation_field_lines',material(pitch,'Painted white chalk','#e8e9d9',.96));
function line(x,z,X,Z,w=.115){const len=Math.hypot(X-x,Z-z),a=(Z-z)/len*w/2,b=(X-x)/len*w/2;quad(W,[x-a,.025,z+b],[X-a,.025,Z+b],[X+a,.025,Z-b],[x+a,.025,z-b]);}
function rect(x,z,w,h){line(x-w/2,z-h/2,x+w/2,z-h/2);line(x+w/2,z-h/2,x+w/2,z+h/2);line(x+w/2,z+h/2,x-w/2,z+h/2);line(x-w/2,z+h/2,x-w/2,z-h/2);}
function arc(x,z,r,start=0,end=Math.PI*2,steps=72){for(let i=0;i<steps;i++){const a=start+(end-start)*i/steps,b=start+(end-start)*(i+1)/steps;line(x+Math.cos(a)*r,z+Math.sin(a)*r,x+Math.cos(b)*r,z+Math.sin(b)*r);}}
function spot(x,z,r=.16){for(let i=0;i<20;i++){const a=i/20*Math.PI*2,b=(i+1)/20*Math.PI*2;tri(W,[x,.026,z],[x+Math.cos(b)*r,.026,z+Math.sin(b)*r],[x+Math.cos(a)*r,.026,z+Math.sin(a)*r]);}}
rect(0,0,68,105);line(-34,0,34,0);arc(0,0,9.15);spot(0,0);
for(const sign of[-1,1]){
  rect(0,sign*(52.5-8.25),40.32,16.5);rect(0,sign*(52.5-2.75),18.32,5.5);spot(0,sign*41.5);
  const a=Math.asin(5.5/9.15);if(sign>0)arc(0,41.5,9.15,Math.PI+a,Math.PI*2-a,40);else arc(0,-41.5,9.15,a,Math.PI-a,40);
  for(const side of[-1,1])arc(side*34,sign*52.5,1,side>0?(sign>0?Math.PI:Math.PI/2):(sign>0?Math.PI*1.5:0),side>0?(sign>0?Math.PI*1.5:Math.PI):(sign>0?Math.PI*2:Math.PI/2),12);
}
for(const g of[G,O,W])emit(pitch,g);await save(pitch,'pitch.glb');

const goals=doc(), frame=bucket('goal_frames',material(goals,'Powder-coated goal frame','#e2e6df',.48,.22)),net=bucket('woven_net',material(goals,'Knotted polyethylene net','#c5d0ca',.91).setDoubleSided(true));
for(const s of[-1,1]){
  const z=s*52.5,back=s*54.6;
  tube(frame,[-3.66,0,z],[-3.66,2.44,z],.06,10);tube(frame,[3.66,0,z],[3.66,2.44,z],.06,10);tube(frame,[-3.66,2.44,z],[3.66,2.44,z],.06,10);
  for(const x of[-3.66,3.66]){tube(frame,[x,2.44,z],[x,2.44,back],.025,6);tube(frame,[x,2.44,back],[x,0,back],.025,6);tube(frame,[x,0,back],[x,0,z],.025,6);}
  for(let i=0;i<=50;i++){const x=-3.66+7.32*i/50;tube(net,[x,0,back],[x,2.44,back],.004,4);tube(net,[x,2.44,z],[x,2.44,back],.004,4);}
  for(let i=0;i<=17;i++){const y=2.44*i/17;tube(net,[-3.66,y,back],[3.66,y,back],.004,4);for(const x of[-3.66,3.66])tube(net,[x,y,z],[x,y,back],.004,4);}
  for(let i=0;i<=14;i++){const zz=z+(back-z)*i/14;tube(net,[-3.66,2.44,zz],[3.66,2.44,zz],.004,4);for(const x of[-3.66,3.66])tube(net,[x,0,zz],[x,2.44,zz],.004,4);}
}
emit(goals,frame);emit(goals,net);await save(goals,'goals.glb');

const crowds=JSON.parse(await fs.readFile(path.join(TMP,'crowd.json'),'utf8')),cd=doc(),cm=material(cd,'Six varied spectators · baked vertex colours','#ffffff',.85);
for(const c of crowds){const g=bucket(c.name,cm);g.p=c.position;g.n=c.normal;g.c=c.color;g.uv=new Array(g.p.length/3*2).fill(.5);g.idx=Array.from({length:g.p.length/3},(_,i)=>i);emit(cd,g);}
await save(cd,'crowd-six.glb');
await sharp({create:{width:1024,height:256,channels:4,background:'#00000000'}}).composite(await Promise.all(Array.from({length:6},async(_,i)=>({input:await fs.readFile(path.join(TMP,`crowd-${i}.png`)),left:i*128,top:0})))).png().toFile(path.join(ROOT,'textures','crowd-atlas.png'));

// Scale references / stress load only; original rig and clips, two mobile LODs.
for(const[lod,ratio,budget]of[[0,.289,8000],[1,.097,3000]]){
  const d=await io.read(SOURCE);
  await d.transform(simplify({simplifier:MeshoptSimplifier,ratio,error:.02,lockBorder:false}));
  const p=d.getRoot().listMeshes()[0].listPrimitives()[0];
  if(p.getIndices().getCount()/3>budget)throw Error('Reference LOD exceeds budget');
  await save(d,`scale-athlete-lod${lod}.glb`);
}
const source=await fs.readFile(SOURCE);stats.sources.push({path:'../../soccer-v4/soccer-player.glb',sha256:hash(source),license:'CC0-1.0'});
stats.crowd={count:crowd.length,near:crowd.filter(c=>c.near).length,far:crowd.filter(c=>!c.near).length,variants:6,nearTriangles:crowds.map(c=>c.triangles),farTrianglesPerInstance:2};
stats.lighting={day:{sun:[-50,85,-35],intensity:3.4,ambient:1.1},evening:{sun:[-18,60,12],intensity:1.1,ambient:.42,floodlights:4,candelaPerFloodlight:2100},shadowMap:1024};
const compactCrowd=crowd.map(p=>[p.x,p.y,p.z,p.yaw,p.variant,p.near?1:0,p.phase,p.scale].map(v=>Math.round(v*1000)/1000));
await fs.writeFile(path.join(ROOT,'layout.json'),JSON.stringify({schemaVersion:1,crowdFields:['x','y','z','yaw','variant','near','phase','scale'],crowd:compactCrowd,lights})+'\n');
await fs.writeFile(path.join(ROOT,'asset-report.json'),JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify(stats,null,2));
