// Derivatives of the repository's CC0 models, with embedded portable clips.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(process.env.SOCCER_V4_MODULES||'/tmp/soccer-v4-tools/package.json');
const {Document,NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco,prune}=require('@gltf-transform/functions');
const codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.encoder':await codec.createEncoderModule(),'draco3d.decoder':await codec.createDecoderModule()});
const root=path.resolve(import.meta.dirname,'..'),design=path.dirname(root);
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const linear=hex=>hex.match(/[a-f\d]{2}/gi).map(h=>{const v=parseInt(h,16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
const sha=b=>createHash('sha256').update(b).digest('hex');
const regions=await read(path.join(design,'characters2/regions.json'));
const manifest={schemaVersion:1,kind:'design-assets-not-runtime',license:'CC0-1.0',units:'metres',up:'+Y',forward:'+Z',
  runtimeBudgetBytes:2000000,characterBudgetBytes:300000,textureMaxSize:512,
  rig:'../characters/rig.json',
  palette:{home:{shirt:'#2198AF',shorts:'#102C43',socks:'#EDF1E8',accent:'#EDF1E8',shoes:'#E57750'},away:{shirt:'#E57750',shorts:'#F1EADD',socks:'#E57750',accent:'#F1EADD',shoes:'#213242'},keeper:{shirt:'#E6B84A',shorts:'#283747',socks:'#283747',accent:'#283747',shoes:'#213242',gloves:'#F1EADD'}},
  clips:{},sources:[],assets:[],
  groundY:.048,
  grass:{tileMetres:4,uvRepeat:[17,26.25],mowingBandMetres:7.5,mowingBands:14,macro:'nonperiodic vertex colour, 13 incommensurate sine waves plus local goalmouth wear',normalConvention:'OpenGL tangent-space +Y; linear, flipY=false'},
  cameras:{main:{position:[13.244214,7.042073,8],target:[0,0,8],fov:42,elevationDegrees:28,distance:15,portrait:{position:[16.086933,13.498540,8],target:[0,0,8],fov:42,elevationDegrees:40,distance:21},source:'../../data/config.json minigames.soccer.view.camera; side view rotated to stadium +Z length'},turf:{position:[5,3.6,6],target:[0,.05,0],fov:48}},
  rootMotion:false,events:'presentation only; simulation owns ball physics and outcomes'};

async function source(rel){const b=await fs.readFile(path.join(design,rel));manifest.sources.push({path:`../${rel}`,sha256:sha(b)});}
for(const p of ['characters2/soccer-player.glb','characters2/goalkeeper.glb','characters2/regions.json','characters/rig.json','viewer/retarget-map.json','viewer/retarget.js','viewer/animation.js','motion/soccer.json','motion2/soccer.json','motion2/soccer/throws-receives.json','models2/soccer-stadium.glb'])await source(p);
await source('../data/config.json');

for(const id of ['soccer-player','goalkeeper']){
  const doc=await io.read(path.join(design,`characters2/${id}.glb`));
  const buffer=doc.getRoot().listBuffers()[0];
  const acc=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(new Float32Array(array)).setBuffer(buffer);
  const baked=await read(`/tmp/soccer-v4-bake/${id}.json`);
  const palette=manifest.palette[id==='goalkeeper'?'keeper':'home'];
  const mesh=doc.getRoot().listMeshes()[0],primitive=mesh.listPrimitives()[0],colors=primitive.getAttribute('COLOR_0');
  const sourceColors=regions.models[id].sources;
  // Preserve facial colour modelling; all clothing is untextured vertex colour.
  const regionNames=['preserve','shirt','shorts','socks','accent','shoes','soles','gloves'];
  const regionIds=new Uint8Array(colors.getCount());
  for(let i=0;i<colors.getCount();i++){
    const rgb=colors.getElement(i,[]);const src=sourceColors.find(s=>s.linearRGB.every((v,k)=>Math.abs(v-rgb[k])<.00002));
    if(!src)throw Error(`Unmapped colour ${id}:${i}`);
    const region=src.rules[0].region;
    if(palette[region]){colors.setElement(i,linear(palette[region]));regionIds[i]=Math.max(0,regionNames.indexOf(region));}
  }
  // Per-vertex attributes survive Draco's reordering. Raw index lists do not.
  primitive.setAttribute('_KIT_REGION',doc.createAccessor('Stable kit region IDs').setType('SCALAR').setArray(regionIds).setBuffer(buffer));
  mesh.setExtras({kitRegionNames:regionNames,colorsOnly:true});
  primitive.getMaterial().setName('Solid kit · vertex colours only').setRoughnessFactor(.83);
  for(const clip of baked){
    clip.events=clip.events.map(e=>({...e,time:e.atSeconds/clip.duration}));
    const animation=doc.createAnimation(clip.id).setExtras({loop:clip.loop,rootMotion:false,events:clip.events});
    const times=acc(`${clip.id} seconds`,'SCALAR',clip.frames.map(f=>f.time));
    for(const node of doc.getRoot().listNodes()){
      if(!clip.frames[0].bones[node.getName()])continue;
      for(const [property,type,target] of [['rotation','VEC4','rotation'],['translation','VEC3','translation']]){
        const values=clip.frames.map(f=>f.bones[node.getName()][property]);
        if(values.every(v=>v.every((x,k)=>Math.abs(x-values[0][k])<1e-7)) && values[0].every((v,k)=>Math.abs(v-(property==='rotation'?node.getRotation():node.getTranslation())[k])<1e-7))continue;
        // Keep quaternion hemispheres continuous for portable LINEAR/slerp playback.
        if(property==='rotation')for(let i=1;i<values.length;i++)if(values[i].reduce((s,v,k)=>s+v*values[i-1][k],0)<0)values[i]=values[i].map(v=>-v);
        const sampler=doc.createAnimationSampler().setInput(times).setOutput(acc(`${clip.id}/${node.getName()}/${property}`,type,values.flat())).setInterpolation('LINEAR');
        animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(target).setSampler(sampler));
      }
    }
    (manifest.clips[id]??=[]).push({name:clip.id,durationSeconds:clip.duration,loop:clip.loop,events:clip.events});
  }
  const p=primitive.getAttribute('POSITION');const min=p.getMin([]),max=p.getMax([]);
  manifest[id]={path:`${id}.glb`,heightMetres:max[1]-min[1],displayScale:1.8/(max[1]-min[1]),triangles:primitive.getIndices().getCount()/3};
  await doc.transform(prune({keepLeaves:true}));
  await io.write(path.join(root,`${id}.glb`),doc);
}

const stadium=await io.read(path.join(design,'models2/soccer-stadium.glb'));
const buffer=stadium.getRoot().listBuffers()[0];
const attr=(name,type,data,integer=false)=>stadium.createAccessor(name).setType(type).setArray(integer?new Uint32Array(data):new Float32Array(data)).setBuffer(buffer);
const material=stadium.createMaterial('Living turf · mown bands and nonperiodic macro').setRoughnessFactor(.96).setMetallicFactor(0);
const color=stadium.createTexture('4m turf albedo').setImage(new Uint8Array(await fs.readFile(path.join(root,'textures/turf-color.jpg')))).setMimeType('image/jpeg');
const normal=stadium.createTexture('4m turf OpenGL normal').setImage(new Uint8Array(await fs.readFile(path.join(root,'textures/turf-normal.png')))).setMimeType('image/png');
material.setBaseColorTexture(color).setNormalTexture(normal).setNormalScale(.65);
const position=[],normals=[],tangents=[],uv=[],colors=[],indices=[];
const macro=(x,z)=>{
  let v=0;
  for(let i=0;i<13;i++)v+=Math.sin(x*(.097+i*.01331)+z*(.059-i*.01017)+i*2.39996)/(13+i*3);
  const wear=Math.exp(-((x/7)**2)-((Math.abs(z)-48)/4.7)**2);
  return Math.max(.78,Math.min(1.12,1+v*.33-wear*.10));
};
// Each mowing boundary has its own vertices, avoiding blurred colour joins.
for(let band=0;band<14;band++){
  const start=position.length/3;
  for(let j=0;j<=8;j++)for(let i=0;i<=68;i++){
    const x=-34+i,z=-52.5+band*7.5+j*7.5/8;
    position.push(x,.048,z);normals.push(0,1,0);tangents.push(1,0,0,-1);uv.push((x+34)/4,(z+52.5)/4);
    const shade=macro(x,z)*(band%2?1.035:.925);
    colors.push(.23*shade,.50*shade,.40*shade);
  }
  for(let j=0;j<8;j++)for(let i=0;i<68;i++){const a=start+j*69+i;indices.push(a,a+69,a+1,a+1,a+69,a+70);}
}
const pitch=stadium.createPrimitive().setMaterial(material).setAttribute('POSITION',attr('Turf 68x105m','VEC3',position)).setAttribute('NORMAL',attr('Turf normals','VEC3',normals)).setAttribute('TANGENT',attr('Turf tangent basis','VEC4',tangents)).setAttribute('TEXCOORD_0',attr('4m repeat UV','VEC2',uv)).setAttribute('COLOR_0',attr('Mowing and unique macro colour','VEC3',colors)).setIndices(attr('Turf triangles','SCALAR',indices,true));
const pitchNode=stadium.getRoot().listNodes().find(n=>n.getName()==='pitch_surface');
pitchNode.setMesh(stadium.createMesh('pitch_surface_v4').addPrimitive(pitch));
pitchNode.setExtras({sizeMetres:[68,105],tileMetres:4,nonperiodicMacro:true,mowingBandMetres:7.5});

// One merged mesh: individually varied seated silhouettes, no crowd bitmap.
const cp=[],cn=[],cc=[],ci=[];let seed=20261102;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const shirts=['#1A4258','#CBD5C3','#CF7653','#3F8D8C','#A6AC87','#D9B95F','#5C6779'];
const skins=['#C89166','#7B4F35','#E0B58A','#A76F49'];
let spectators=0;
function face(points,color){
  // Ring construction walks clockwise from the outside; glTF faces are CCW.
  points=[...points].reverse();
  const a=points[0],b=points[1],c=points[2],ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
  let n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],l=Math.hypot(...n);n=n.map(v=>v/l);
  const off=cp.length/3;for(const p of points){cp.push(...p);cn.push(...n);cc.push(...linear(color));}for(let i=1;i<points.length-1;i++)ci.push(off,off+i,off+i+1);
}
function person(x,y,z,yaw){
  if(random()<.13)return;
  const height=.78+random()*.22,shirt=shirts[Math.floor(random()*shirts.length)],skin=skins[Math.floor(random()*skins.length)];
  const tilt=(random()-.5)*.13;
  const local=p=>[x+Math.cos(yaw)*p[0]+Math.sin(yaw)*p[2],y+p[1],z-Math.sin(yaw)*p[0]+Math.cos(yaw)*p[2]];
  const ring=(h,w,d)=>[[-w,h,-d],[w,h,-d],[w,h,d],[-w,h,d]].map(local);
  const a=ring(.12,.20,.14),b=ring(height*.7,.23,.12);
  for(let i=0;i<4;i++)face([a[i],a[(i+1)%4],b[(i+1)%4],b[i]],shirt);
  face(b,shirt);
  const head=[[tilt,height+.14,0],[tilt+.14,height-.02,0],[tilt,height-.02,.14],[tilt-.14,height-.02,0],[tilt,height-.02,-.14],[tilt,height-.19,0]].map(local);
  for(let i=1;i<=4;i++){const j=i===4?1:i+1;face([head[0],head[i],head[j]],i%3===0?'#343337':skin);face([head[5],head[j],head[i]],skin);}
  // Bent forearms or raised hands add varied silhouette without per-person rigs.
  for(const side of [-1,1]){
    const lift=random()<.12?.34:-.22;
    const arm=[[side*.18,height*.67,.02],[side*.30,height*.50+lift,.06],[side*.34,height*.50+lift,.12],[side*.24,height*.69,.11]].map(local);
    face(arm,shirt);face([...arm].reverse(),shirt);
  }
  spectators++;
}
for(const sign of [-1,1]){
  for(let row=0;row<7;row++){
    for(let i=-40;i<=40;i++)if(![-37,-13,13,37].some(v=>Math.abs(i*1.12-v)<1.05))person(sign*(36.2+row*1.35),row*1.16+1.42,i*1.12,sign*-Math.PI/2);
    for(let i=-25;i<=25;i++)if(![-22,0,22].some(v=>Math.abs(i*1.12-v)<1.05))person(i*1.12,row*1.16+1.42,sign*(55.2+row*1.35),sign>0?Math.PI:0);
  }
  for(let row=0;row<5;row++){
    for(let i=-42;i<=42;i++)if(Math.abs(i)%14>1)person(sign*(47+row*1.4+.65),9.1+row*1.15+.32,i*1.3,sign*-Math.PI/2);
    for(let i=-29;i<=29;i++)if(Math.abs(i)%12>1)person(i*1.3,9.1+row*1.15+.32,sign*(66+row*1.4+.65),sign>0?Math.PI:0);
  }
}
const crowdMat=stadium.createMaterial('Crowd · varied solid colours').setRoughnessFactor(1);
const crowd=stadium.createPrimitive().setMaterial(crowdMat).setAttribute('POSITION',attr('Seated spectators','VEC3',cp)).setAttribute('NORMAL',attr('Crowd normals','VEC3',cn)).setAttribute('COLOR_0',attr('Crowd palette','VEC3',cc)).setIndices(attr('Crowd triangles','SCALAR',ci,true));
stadium.getRoot().listNodes().find(n=>n.getName()==='asset_root').addChild(stadium.createNode('crowd_v4').setMesh(stadium.createMesh('crowd_v4').addPrimitive(crowd)));
stadium.getRoot().getAsset().copyright='CC0-1.0 · derived from Island models2; new turf and crowd, 2026';
await stadium.transform(prune({keepLeaves:true}),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:10,quantizeColor:12,quantizeTexcoord:14}));
await io.write(path.join(root,'soccer-stadium.glb'),stadium);
manifest.stadium={path:'soccer-stadium.glb',spectators,crowdDrawCalls:1,crowdTriangles:ci.length/3,pitchTriangles:indices.length/3};
for(const name of ['soccer-player.glb','goalkeeper.glb','soccer-stadium.glb']){const bytes=await fs.readFile(path.join(root,name));manifest.assets.push({path:name,bytes:bytes.length,sha256:sha(bytes)});}
manifest.runtimeBytes=manifest.assets.reduce((s,a)=>s+a.bytes,0);
if(manifest.runtimeBytes>manifest.runtimeBudgetBytes)throw Error(`Runtime budget exceeded ${manifest.runtimeBytes}`);
for(const a of manifest.assets.filter(a=>a.path!=='soccer-stadium.glb'))if(a.bytes>manifest.characterBudgetBytes)throw Error(`Character budget exceeded ${a.path}: ${a.bytes}`);
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(manifest.assets,manifest.stadium,`runtime ${manifest.runtimeBytes}`);
