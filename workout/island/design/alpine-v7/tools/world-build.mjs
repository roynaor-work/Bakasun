/** Original alpine-v7 environment geometry. No external meshes or image inputs.
 * Run: node .../tools/world-build.mjs --modules /tmp/alpine-v7-tools
 * Canonical metres, +Y up, +Z course direction. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2), toolPath=args[args.indexOf('--modules')+1]||'/tmp/alpine-v7-tools';
const require=createRequire(path.join(toolPath,'package.json'));
const {Document,NodeIO,Accessor}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco,weld}=require('@gltf-transform/functions');
const codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.encoder':await codec.createEncoderModule(),'draco3d.decoder':await codec.createDecoderModule()});
const root=path.resolve(import.meta.dirname,'../world');
await fs.mkdir(path.join(root,'models'),{recursive:true});
let seed=73125;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const mix=(a,b,t)=>a+(b-a)*t;
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
const mul=(a,k)=>a.map(n=>n*k);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>mul(a,1/(Math.hypot(...a)||1));
const lin=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
const rgb=(s,k=1)=>s.match(/../g).map(x=>lin(parseInt(x,16)/255)*k);
const green=rgb('183b37'),snow=rgb('e9f0ef'),bark=rgb('615347'),rock=rgb('747e83'),metal=rgb('394d58'),red=rgb('b7543d'),ochre=rgb('daaa58');
class Geo {
  constructor(){this.p=[];this.n=[];this.c=[];this.i=[];}
  tri(a,b,c,col,normal=null){const n=normal||norm(cross(sub(b,a),sub(c,a))),i=this.p.length/3;this.p.push(...a,...b,...c);this.n.push(...n,...n,...n);this.c.push(...col,...col,...col);this.i.push(i,i+1,i+2);}
  quad(a,b,c,d,col){this.tri(a,b,c,col);this.tri(a,c,d,col);}
  tube(a,b,r0,r1,col,sides=6){const axis=norm(sub(b,a)),u=norm(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u);for(let i=0;i<sides;i++){const t=i*Math.PI*2/sides,t1=(i+1)*Math.PI*2/sides;const ring=(o,r,t)=>add(o,add(mul(u,r*Math.cos(t)),mul(v,r*Math.sin(t))));this.quad(ring(a,r0,t),ring(a,r0,t1),ring(b,r1,t1),ring(b,r1,t),mul(col,.88+.16*Math.cos(t)));} }
  box(c,s,col){const [x,y,z]=c,[a,b,d]=s.map(n=>n/2),p=[[x-a,y-b,z-d],[x+a,y-b,z-d],[x+a,y+b,z-d],[x-a,y+b,z-d],[x-a,y-b,z+d],[x+a,y-b,z+d],[x+a,y+b,z+d],[x-a,y+b,z+d]];[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]].forEach((v,j)=>this.quad(...v.map(i=>p[i]),mul(col,[.83,.94,.84,.92,1,.72][j])));}
  // Jagged volumetric needle frond: pointed edge lobes and a central lit ridge.
  frond(c,dir,length,width,thickness,col,lobes=4){const d=norm([dir[0],0,dir[2]]),side=[-d[2],0,d[0]],left=[],right=[];for(let i=0;i<=lobes;i++){const t=i/lobes,span=width*Math.sin(Math.PI*t)**.65*(i%2?.9:1);left.push(add(c,add(mul(d,length*(t-.17)),add(mul(side,span),[0,-thickness*.35*Math.sin(Math.PI*t),0]))));right.push(add(c,add(mul(d,length*(t-.17)),add(mul(side,-span*.91),[0,-thickness*.35*Math.sin(Math.PI*t),0]))));}for(let i=0;i<lobes;i++){const t=(i+.5)/lobes,mid=add(c,add(mul(d,length*(t-.17)),[0,thickness*Math.sin(Math.PI*t),0]));this.tri(left[i],left[i+1],mid,mul(col,.8+.2*rnd()));this.tri(right[i+1],right[i],mid,mul(col,.9+.18*rnd()));this.tri(left[i],right[i],left[i+1],mul(col,.6));this.tri(right[i],right[i+1],left[i+1],mul(col,.64));}}
}

function boulder(variant=0){seed=831+variant;const g=new Geo(),rings=6,segments=12,r=(variant?1.25:.65),points=[];
  for(let v=0;v<=rings;v++){const lat=Math.PI*v/rings;const row=[];for(let u=0;u<segments;u++){const a=u*Math.PI*2/segments,noise=.9+rnd()*.2;row.push([Math.cos(a)*Math.sin(lat)*r*noise,.38*r+Math.cos(lat)*r*.61*noise,Math.sin(a)*Math.sin(lat)*r*.78*noise]);}points.push(row);}
  for(let v=0;v<rings;v++)for(let u=0;u<segments;u++){const u1=(u+1)%segments,col=v<2?mul(snow,.94+rnd()*.06):mul(rock,.75+rnd()*.35);g.quad(points[v][u],points[v][u1],points[v+1][u1],points[v+1][u],col);}
  return g;
}
function gate(){const g=new Geo();for(const x of [-1.5,1.5]){g.tube([x,0,0],[x,2.35,0],.035,.027,red,7);g.tube([x,.2,0],[x,.65,0],.038,.038,rgb('ece5cb'),7);}const nx=10,ny=3;for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const p=(i,j)=>{const x=-1.5+3*i/nx,y=1.48+.7*j/ny,z=.08*Math.sin(i*.85+j*.5);return[x,y,z];};g.quad(p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1),j===1?mul(red,1.12):red);}return g;}
function ramp(){const g=new Geo(),segments=18,w=2.2,start=-3,end=1.5;for(let i=0;i<segments;i++){const z=start+(end-start)*i/segments,z1=start+(end-start)*(i+1)/segments,h=z=>1.32*((z-start)/(end-start))**2;g.quad([-w,h(z),z],[-w,h(z1),z1],[w,h(z1),z1],[w,h(z),z],snow);for(const sign of[-1,1]){const side=[[sign*w,0,z],[sign*w,0,z1],[sign*w,h(z1),z1],[sign*w,h(z),z]];if(sign>0)side.reverse();g.quad(...side,mul(snow,.78));}}for(let j=0;j<16;j++){const q=j/16,q1=(j+1)/16,z=end+2.4*q,z1=end+2.4*q1,h=q=>1.32*(1-q*q*(3-2*q));g.quad([-w,h(q),z],[-w,h(q1),z1],[w,h(q1),z1],[w,h(q),z],snow);for(const sign of[-1,1]){const side=[[sign*w,0,z],[sign*w,0,z1],[sign*w,h(q1),z1],[sign*w,h(q),z]];if(sign>0)side.reverse();g.quad(...side,mul(snow,.86));}}for(const x of[-2.24,2.24]){g.tube([x,0,-1.4],[x,1.15,-1.4],.03,.03,ochre,6);g.tube([x,0,1.5],[x,2.1,1.5],.03,.03,ochre,6);}return g;}
function marker(){const g=new Geo();g.tube([0,-.1,0],[0,1.6,0],.026,.026,metal,6);g.box([0,1.24,0],[.42,.44,.055],rgb('246078'));const white=rgb('e9e7d6');g.tri([-.12,1.18,.029],[.12,1.18,.029],[0,1.35,.029],white);g.box([0,1.2,.032],[.04,.18,.008],white);g.tri([-.12,1.18,-.029],[0,1.35,-.029],[.12,1.18,-.029],white);g.box([0,1.2,-.032],[.04,.18,.008],white);return g;}
function fence(){const g=new Geo();for(const x of[-3,0,3]){g.tube([x,-.12,0],[x,1.25,0],.033,.027,metal,6);g.tube([x,1.25,0],[x-.12,1.37,0],.025,.018,metal,5);}for(let y=.15;y<=1.21;y+=.15)g.tube([-3,y,0],[3,y,0],.011,.011,red,3);for(let x=-3;x<=3.01;x+=.22)g.tube([x,.13,0],[x,1.2,0],.009,.009,red,3);return g;}
function sign(){const g=new Geo();for(const x of[-.55,.55])g.tube([x,-.1,0],[x,2.05,0],.04,.04,metal,6);g.box([0,1.7,0],[1.55,.62,.095],rgb('254c5f'));g.box([0,1.7,.052],[1.4,.49,.012],rgb('eee7d8'));g.tri([.25,1.69,.065],[-.12,1.88,.065],[-.12,1.5,.065],red);g.box([-.25,1.69,.07],[.47,.065,.012],red);return g;}
function floodlight(){const g=new Geo();g.tube([0,-.18,0],[0,7.8,0],.085,.055,metal,8);g.box([0,7.72,0],[1.9,.09,.09],metal);for(const x of[-.63,0,.63]){g.box([x,7.5,.08],[.48,.31,.28],metal);g.box([x,7.47,.235],[.4,.23,.025],rgb('ffedb8'));}for(const z of[-.8,.8])g.tube([0,1.2,0],[0,0,z],.035,.035,metal,6);return g;}
function crowd(){const g=new Geo();const dark=rgb('293e4c'),coat=rgb('8f4b3d'),glove=rgb('c9b998'),skin=rgb('c9a487');g.tube([-.13,.05,0],[-.12,.68,0],.075,.09,dark,6);g.tube([.13,.05,0],[.12,.68,0],.075,.09,dark,6);g.tube([0,.63,0],[0,1.24,0],.23,.205,coat,8);g.tube([-.22,1.17,0],[-.3,.82,.04],.09,.07,coat,6);g.tube([.22,1.17,0],[.3,1.44,.03],.09,.07,coat,6);g.tube([.3,1.44,.03],[.29,1.63,.05],.07,.06,glove,5);g.tube([0,1.26,0],[0,1.57,0],.145,.145,skin,8);g.tube([0,1.47,0],[0,1.67,0],.16,.1,dark,8);g.box([0,1.34,.13],[.28,.14,.06],glove);return g;}
async function write(id,geo,extra={}){
  const doc=new Document(),buffer=doc.createBuffer();const material=doc.createMaterial('alpine_v7_vertex_palette').setRoughnessFactor(.84).setMetallicFactor(0).setDoubleSided(id==='slalom-gate');
  const a=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
  const primitive=doc.createPrimitive().setAttribute('POSITION',a('position',Accessor.Type.VEC3,new Float32Array(geo.p))).setAttribute('NORMAL',a('normal',Accessor.Type.VEC3,new Float32Array(geo.n))).setAttribute('COLOR_0',a('color',Accessor.Type.VEC3,new Float32Array(geo.c))).setIndices(a('indices',Accessor.Type.SCALAR,new Uint32Array(geo.i))).setMaterial(material);
  const mesh=doc.createMesh(id).addPrimitive(primitive),node=doc.createNode(id).setMesh(mesh).setExtras({units:'meters',up:'+Y',forward:'+Z',...extra});doc.createScene(id).addChild(node);doc.getRoot().getAsset().generator='alpine-v7 original world geometry';
  await doc.transform(weld({tolerance:1e-5}),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:14,quantizeNormal:10,quantizeColor:8}));
  const file=`models/${id}.glb`;await io.write(path.join(root,file),doc);const bytes=await fs.readFile(path.join(root,file));const decoded=await io.read(path.join(root,file));let triangles=0;for(const m of decoded.getRoot().listMeshes())for(const p of m.listPrimitives())triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;
  return {id,file,bytes:bytes.length,MB:bytes.length/1e6,triangles,materials:1,textures:[],compression:'KHR_draco_mesh_compression',sha256:createHash('sha256').update(bytes).digest('hex'),...extra};
}
async function writePine(lod){
  const id=`pine-lod${lod}`,doc=new Document(),buffer=doc.createBuffer(),height=4.85,width=height*683/1024;
  const positions=[],normals=[],uvs=[],indices=[];
  const barkUV=[350.5/1024,881.5/1024],fullTreeUV=[.5/1024,.5/1024,682.5/1024,1023.5/1024];
  const card=(points,rect,vertexNormals)=>{const offset=positions.length/3;for(let i=0;i<4;i++){positions.push(...points[i]);normals.push(...vertexNormals[i]);}const[u0,v0,u1,v1]=rect;uvs.push(u0,v0,u1,v0,u1,v1,u0,v1);indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3,offset+2,offset+1,offset,offset+3,offset+2,offset);};
  const tube=(a,b,r0,r1,sides=6)=>{const axis=norm(sub(b,a)),u=norm(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u);for(let i=0;i<sides;i++){const t=i*Math.PI*2/sides,t1=(i+1)*Math.PI*2/sides,normalAt=t=>norm(add(mul(u,Math.cos(t)),mul(v,Math.sin(t)))),ring=(o,r,t)=>add(o,mul(normalAt(t),r)),offset=positions.length/3;for(const[p,n]of[[ring(a,r0,t),normalAt(t)],[ring(a,r0,t1),normalAt(t1)],[ring(b,r1,t1),normalAt(t1)],[ring(b,r1,t),normalAt(t)]]){positions.push(...p);normals.push(...n);uvs.push(...barkUV);}indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);}};
  if(lod===0){
    // Real radial boughs replace the full-height crossed tree photographs.
    // Every short bough has an independent root, woody core and two inclined
    // branch-wing cards. Explicit reverse winding keeps authored normals portable.
    let pineSeed=78317;const random=()=>{pineSeed=(Math.imul(pineSeed,1664525)+1013904223)>>>0;return pineSeed/4294967296;};
    const source=JSON.parse(await fs.readFile(path.join(root,'manifest-pine-source.json'),'utf8'));
    const trunkRadius=y=>.105*Math.pow(1-y/height,1.1)+.009;
    for(let segment=0;segment<6;segment++){const y0=height*segment/6,y1=height*(segment+1)/6;tube([0,y0,0],[0,y1,0],trunkRadius(y0),trunkRadius(y1),12);}
    for(let tier=0;tier<12;tier++)for(let branch=0;branch<7;branch++){
      const y=.85+tier*3.92/11+(random()-.5)*.075,angle=branch*Math.PI*2/7+tier*.69+(random()-.5)*.26;
      const radial=[Math.sin(angle),0,Math.cos(angle)],tangent=[Math.cos(angle),0,-Math.sin(angle)];
      const length=(1.63*Math.pow(Math.max(.012,1-y/height),.73)+.065)*(.9+random()*.16),sprite=source.branches[(tier+branch)%3],depth=length/sprite.sourceAspect*1.25;
      const start=add([0,y,0],mul(radial,.025)),coreStart=add(start,[0,-depth*.04,0]),end=add([0,y-length*.10-depth*.40*Math.cos(.75),0],mul(radial,length*.68));
      // The supporting wood follows the photographed bough's droop and lies
      // inside its foliage instead of floating above it like an exposed hanger.
      tube(coreStart,end,.006+.017*(1-y/height),.003,6);
      const foliageNormal=norm(add([0,1,0],mul(radial,.11))),vertexNormals=Array.from({length:4},()=>foliageNormal);
      for(const roll of[-.75,.75]){
        const across=add([0,Math.cos(roll),0],mul(tangent,Math.sin(roll)));
        const point=(r,v)=>add(start,add(mul(radial,r),add([0,-r*.10,0],mul(across,v))));
        const points=[point(0,depth*.20),point(length,depth*.20),point(length,-depth*.80),point(0,-depth*.80)];
        card(points,sprite.uv,vertexNormals);
      }
    }
    // Eight local inner-crown clusters conceal the bare central scaffold.
    // Their short overlapping boughs stop inside the outer silhouette; none
    // are full-height cards or independent billboards of a complete tree.
    for(let tier=0;tier<8;tier++)for(let branch=0;branch<3;branch++){
      const y=1.02+tier*.445,angle=branch*Math.PI*2/3+tier*.83,radial=[Math.sin(angle),0,Math.cos(angle)],tangent=[Math.cos(angle),0,-Math.sin(angle)];
      const length=.65*Math.pow(1-y/height,.45)+.12,depth=length*1.2,sprite=source.branches[(tier+branch)%3],roll=(branch%2?1:-1)*.44,across=add([0,Math.cos(roll),0],mul(tangent,Math.sin(roll)));
      const point=(r,v)=>add([0,y-r*.12,0],add(mul(radial,r),mul(across,v))),foliageNormal=norm(add([0,1,0],mul(radial,.08)));
      card([point(-length*.45,depth*.2),point(length,depth*.2),point(length,-depth*.8),point(-length*.45,-depth*.8)],sprite.uv,Array.from({length:4},()=>foliageNormal));
    }
  }else{
    const angles=lod===1?[0,Math.PI/2]:[0],radial=.32,up=.947,normalLength=Math.hypot(radial,up);
    for(const angle of angles){const cs=Math.cos(angle),sn=Math.sin(angle),points=[],vertexNormals=[];for(const[x,y]of[[-width/2,height],[width/2,height],[width/2,0],[-width/2,0]]){points.push([x*cs,y,-x*sn]);const side=Math.sign(x);vertexNormals.push([side*radial*cs/normalLength,up/normalLength,-side*radial*sn/normalLength]);}card(points,fullTreeUV,vertexNormals);}
  }
  // Match the photographed mid-LOD footprint without changing tree height.
  // Normals use the inverse transpose of this horizontal-only scale.
  if(lod===0)for(let i=0;i<positions.length;i+=3){positions[i]*=.92;positions[i+2]*=.92;const n=norm([normals[i]/.92,normals[i+1],normals[i+2]/.92]);normals.splice(i,3,...n);}
  const atlasBytes=await fs.readFile(path.join(root,'textures/pine-atlas.png'));
  const atlas=doc.createTexture('snow_fir_atlas').setImage(atlasBytes).setMimeType('image/png');
  const mat=doc.createMaterial('pine_photo_cutout').setBaseColorTexture(atlas).setRoughnessFactor(1).setMetallicFactor(0).setAlphaMode('MASK').setAlphaCutoff(.58).setDoubleSided(false);
  const info=mat.getBaseColorTextureInfo();info.setWrapS(33071).setWrapT(33071).setMinFilter(9987).setMagFilter(9729);
  const acc=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
  const primitive=doc.createPrimitive().setAttribute('POSITION',acc('positions',Accessor.Type.VEC3,new Float32Array(positions))).setAttribute('NORMAL',acc('normals',Accessor.Type.VEC3,new Float32Array(normals))).setAttribute('TEXCOORD_0',acc('uv',Accessor.Type.VEC2,new Float32Array(uvs))).setIndices(acc('indices',Accessor.Type.SCALAR,new Uint16Array(indices))).setMaterial(mat);
  const mesh=doc.createMesh(id).addPrimitive(primitive),node=doc.createNode(id).setMesh(mesh).setExtras({lod,units:'meters',height,atlasSource:'workout/island/assets/alpine-rush/snow-fir.webp',billboard:lod===2,branchTiers:lod===0?12:0,radialBranchesPerTier:lod===0?7:0,...(lod===0?{innerCrownClusters:8}:{})});doc.createScene(id).addChild(node);
  await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:14,quantizeNormal:10,quantizeTexcoord:14}));
  const file=`models/${id}.glb`;await io.write(path.join(root,file),doc);const bytes=await fs.readFile(path.join(root,file));
  return{id,file,bytes:bytes.length,MB:bytes.length/1e6,triangles:indices.length/3,materials:1,textures:[{name:'snow_fir_atlas',width:1024,height:1024,bytes:atlasBytes.length,embedded:true}],compression:'KHR_draco_mesh_compression',sha256:createHash('sha256').update(bytes).digest('hex'),lod,source:'../../../assets/alpine-rush/snow-fir.webp',sourceSha256:createHash('sha256').update(await fs.readFile(path.resolve(root,'../../../assets/alpine-rush/snow-fir.webp'))).digest('hex'),license:'Existing repository ImageGen artwork; repository terms; ../../../ASSETS.md:189',visual:lod===0?'84 drooping woody boughs with 168 short branch-wing cards, 8 inner-crown foliage triads and a full-height tapered bark trunk':lod===1?'2 crossed full-tree photo cards with explicit reverse faces':'single camera-facing full-tree photo card with explicit reverse face'};
}
const models=[];
execFileSync('python3',[path.resolve(import.meta.dirname,'world-pine.py')],{stdio:'inherit'});
for(let lod=0;lod<3;lod++)models.push(await writePine(lod));
for(const [id,g] of [['rock-small',boulder(0)],['rock-large',boulder(1)],['slalom-gate',gate()],['snow-ramp',ramp()],['route-marker',marker()],['safety-fence',fence()],['direction-sign',sign()],['floodlight',floodlight()],['crowd-person',crowd()]])models.push(await write(id,g,id==='snow-ramp'?{surfaceMaterial:'powder',takeoffHeight:1.32,takeoffLocalZ:1.5,roundedRunoutMeters:2.4}:{}));
await fs.writeFile(path.join(root,'manifest-models.json'),JSON.stringify({schemaVersion:1,units:'meters',up:'+Y',forward:'+Z',models,source:{path:'../tools/world-build.mjs',sha256:createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),license:'Original contribution under repository terms',method:'Original deterministic course and snow geometry; pine cutout reused from existing repository ImageGen artwork as documented per asset'}},null,2)+'\n');
console.log(models.map(x=>`${x.id}: ${x.triangles} tris, ${x.bytes} bytes`).join('\n'));
