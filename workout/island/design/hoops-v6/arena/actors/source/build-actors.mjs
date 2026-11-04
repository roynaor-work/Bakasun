/** Offline derivative authoring. Sources remain unchanged.
 * npm install --prefix /tmp/actor-tools @gltf-transform/{core,functions,extensions}@4.5.1 meshoptimizer@1.3.0 draco3dgltf@1.5.7
 * ACTOR_BUILD_MODULES=/tmp/actor-tools/node_modules node build-actors.mjs
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const out=fileURLToPath(new URL('../',import.meta.url));
const source=fileURLToPath(new URL('../../../../hoops/lod-v4/hoops-v4-pg-lod.glb',import.meta.url));
const resolver=createRequire(path.join(process.env.ACTOR_BUILD_MODULES||'/tmp/hoops-actor-build/node_modules','../package.json'));
const load=async name=>await import(pathToFileURL(resolver.resolve(name)).href);
const {NodeIO}=await load('@gltf-transform/core');
const {ALL_EXTENSIONS,KHRDracoMeshCompression}=await load('@gltf-transform/extensions');
const {prune,simplifyPrimitive}=await load('@gltf-transform/functions');
const {MeshoptSimplifier}=await load('meshoptimizer');
const draco=(await load('draco3dgltf')).default;
const sharp=(await load('sharp')).default;
await mkdir(out,{recursive:true});
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule(),'draco3d.encoder':await draco.createEncoderModule()});
await MeshoptSimplifier.ready;
// glTF images and atlas UVs use the top-left origin (Three GLTFLoader sets flipY=false).
// A four-pixel inset avoids mip bleeding.
const tiles={body:[0,0,512],eyes:[512,0,256],brow:[768,0,256],lashes:[512,256,256],shoes:[768,256,256],hair:[0,512,256],jersey:[256,512,256],shorts:[512,512,256],trim:[768,512,256]};
const kind=n=>/eyebrow/i.test(n)?'brow':/eyelash/i.test(n)?'lashes':/low-poly/i.test(n)?'eyes':/shoes/i.test(n)?'shoes':/short04/i.test(n)?'hair':/team_primary/.test(n)?'jersey':/team_secondary/.test(n)?'shorts':/team_trim/.test(n)?'trim':'body';
let atlasNeutral,atlasEmber,atlasTide,atlasNormal;
const report={source:'../../../hoops/lod-v4/hoops-v4-pg-lod.glb',sourceSha256:createHash('sha256').update(await readFile(source)).digest('hex'),toolVersions:{gltfTransform:'4.5.1',meshoptimizer:'1.3.0',draco3dgltf:'1.5.7'},atlasSize:[1024,1024],tilesTopOrigin:tiles,assets:[],notes:['One skinned mesh and one double-sided MASK material per actor, shared 1024 atlas UV layout.','Neutral palette embedded in GLB. Ember and Tide PNG palettes replace baseColor map only; skin, eyes, hair and shoes stay unchanged.','BaseColor atlas plus one normal atlas. Normal atlas is flat outside cloth tiles; cloth receives a subtle woven normal.','52 source bones and six embedded source mocap-derived clips retained; sources untouched.']};
async function makeAtlases(doc){
 const inputs=[];
 for(const mat of doc.getRoot().listMaterials()){
  const k=kind(mat.getName()),[x,y,size]=tiles[k],texture=mat.getBaseColorTexture();
  let image;
  if(texture)image=await sharp(texture.getImage()).resize(size,size,{fit:'fill'}).ensureAlpha().png().toBuffer();
  else{
   const colors={jersey:[230,224,207],shorts:[24,32,42],trim:[230,224,207]};
   const rgb=colors[k]||[180,180,180]; const pixels=Buffer.alloc(size*size*4);
   for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    const index=(py*size+px)*4,grain=((px+py)%3===0?-3:0)+Math.sin(py*.11)*1.4;
    for(let c=0;c<3;c++)pixels[index+c]=Math.max(0,Math.min(255,rgb[c]+grain));pixels[index+3]=255;
   }
   image=await sharp(pixels,{raw:{width:size,height:size,channels:4}}).png().toBuffer();
  }
  inputs.push({input:image,left:x,top:y});
 }
 // The source image has a tool-name strip in unused atlas padding. Keep that padding unmarked.
 inputs.push({input:await sharp({create:{width:15,height:132,channels:4,background:'#674530'}}).png().toBuffer(),left:497,top:380});
 atlasNeutral=await sharp({create:{width:1024,height:1024,channels:4,background:'#20252b'}}).composite(inputs).png().toBuffer();
 const palette=async colors=>{
  const paint=[];
  for(const [k,rgb] of Object.entries(colors)){
   const [x,y,size]=tiles[k],pixels=Buffer.alloc(size*size*4);
   for(let py=0;py<size;py++)for(let px=0;px<size;px++){const i=(py*size+px)*4,g=((px+py)%3===0?-3:0)+Math.sin(py*.11)*1.4;for(let c=0;c<3;c++)pixels[i+c]=Math.max(0,Math.min(255,rgb[c]+g));pixels[i+3]=255;}
   paint.push({input:await sharp(pixels,{raw:{width:size,height:size,channels:4}}).png().toBuffer(),left:x,top:y});
  }
  return await sharp(atlasNeutral).composite(paint).png().toBuffer();
 };
 atlasEmber=await palette({jersey:[231,105,47],shorts:[40,24,22],trim:[246,199,133]});
 atlasTide=await palette({jersey:[39,172,194],shorts:[16,39,53],trim:[204,238,237]});
 const normals=Buffer.alloc(1024*1024*3);
 for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*3,cloth=y>=512&&y<768&&x>=256;normals[i]=cloth?128+Math.round(Math.sin(x*Math.PI/2)*8):128;normals[i+1]=cloth?128+Math.round(Math.sin(y*Math.PI/2)*8):128;normals[i+2]=255;}
 atlasNormal=await sharp(normals,{raw:{width:1024,height:1024,channels:3}}).png().toBuffer();
 await Promise.all([['atlas-neutral.png',atlasNeutral],['atlas-ember.png',atlasEmber],['atlas-tide.png',atlasTide],['atlas-normal.png',atlasNormal]].map(([name,bytes])=>writeFile(path.join(out,name),bytes)));
}
for(const lod of [0,1]){
 const doc=await io.read(source),root=doc.getRoot(),buffer=root.listBuffers()[0];
 if(!atlasNeutral)await makeAtlases(doc);
 const nodes=root.listNodes().filter(n=>n.getMesh());
 if(nodes.some(n=>n.getTranslation().some(v=>v!==0)||n.getScale().some(v=>v!==1)))throw Error('Expected identity source mesh nodes');
 if(lod===1){
  const count=()=>nodes.reduce((s,n)=>s+n.getMesh().listPrimitives().reduce((q,p)=>q+p.getIndices().getCount()/3,0),0);
  for(let pass=0;pass<4&&count()>2900;pass++)for(const n of nodes)for(const p of n.getMesh().listPrimitives()){
   if(p.getIndices().getCount()<120)continue;
   const ratio=pass===0?.45:.78;
   const wrapper={...MeshoptSimplifier,simplify:(indices,positions,stride,target,error)=>MeshoptSimplifier.simplify(indices,positions,stride,target,error,['Permissive','RegularizeLight'])};
   simplifyPrimitive(p,{simplifier:wrapper,ratio,error:.1,lockBorder:false});
  }
 }
 const arrays={POSITION:[],NORMAL:[],TEXCOORD_0:[],JOINTS_0:[],WEIGHTS_0:[]},indices=[];let offset=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const n of nodes)for(const p of n.getMesh().listPrimitives()){
  const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0'),joints=p.getAttribute('JOINTS_0'),weights=p.getAttribute('WEIGHTS_0'),k=kind(p.getMaterial().getName()),[tx,ty,size]=tiles[k],v=[],nv=[],u=[],j=[],w=[];
  for(let i=0;i<pos.getCount();i++){
   pos.getElement(i,v);normal.getElement(i,nv);joints.getElement(i,j);weights.getElement(i,w);
   for(let a=0;a<3;a++){min[a]=Math.min(min[a],v[a]);max[a]=Math.max(max[a],v[a]);}
   if(uv)uv.getElement(i,u);else{u[0]=(v[0]+.5)%1;u[1]=v[1]%1;}
   const wrap=a=>Math.min(1,Math.max(0,a));
   arrays.POSITION.push(...v);arrays.NORMAL.push(...nv);arrays.JOINTS_0.push(...j);arrays.WEIGHTS_0.push(...w);
   arrays.TEXCOORD_0.push((tx+4+wrap(u[0])*(size-8))/1024,(ty+4+wrap(u[1])*(size-8))/1024);
  }
  indices.push(...Array.from(p.getIndices().getArray(),index=>index+offset));offset+=pos.getCount();
 }
 // Explicit UV-derived tangents keep normal-map orientation consistent across WebGL implementations.
 const tan1=new Float64Array(offset*3),tan2=new Float64Array(offset*3),tangent=[];
 for(let t=0;t<indices.length;t+=3){
  const a=indices[t],b=indices[t+1],c=indices[t+2],p=arrays.POSITION,u=arrays.TEXCOORD_0;
  const x1=p[b*3]-p[a*3],x2=p[c*3]-p[a*3],y1=p[b*3+1]-p[a*3+1],y2=p[c*3+1]-p[a*3+1],z1=p[b*3+2]-p[a*3+2],z2=p[c*3+2]-p[a*3+2];
  const s1=u[b*2]-u[a*2],s2=u[c*2]-u[a*2],t1=u[b*2+1]-u[a*2+1],t2=u[c*2+1]-u[a*2+1],det=s1*t2-s2*t1;
  if(Math.abs(det)<1e-12)continue;const r=1/det,sd=[(t2*x1-t1*x2)*r,(t2*y1-t1*y2)*r,(t2*z1-t1*z2)*r],td=[(s1*x2-s2*x1)*r,(s1*y2-s2*y1)*r,(s1*z2-s2*z1)*r];
  for(const v of [a,b,c])for(let k=0;k<3;k++){tan1[v*3+k]+=sd[k];tan2[v*3+k]+=td[k];}
 }
 for(let i=0;i<offset;i++){
  const n=arrays.NORMAL.slice(i*3,i*3+3),t=Array.from(tan1.slice(i*3,i*3+3)),dot=n[0]*t[0]+n[1]*t[1]+n[2]*t[2];
  let v=t.map((q,k)=>q-n[k]*dot),length=Math.hypot(...v);
  if(length<1e-9){v=Math.abs(n[1])<.9?[n[2],0,-n[0]]:[0,-n[2],n[1]];length=Math.hypot(...v);}
  v=v.map(q=>q/length);const cross=[n[1]*v[2]-n[2]*v[1],n[2]*v[0]-n[0]*v[2],n[0]*v[1]-n[1]*v[0]],sign=cross.reduce((s,q,k)=>s+q*tan2[i*3+k],0)<0?-1:1;tangent.push(...v,sign);
 }
 arrays.TANGENT=tangent;
 const texture=doc.createTexture('athlete-single-atlas').setImage(atlasNeutral).setMimeType('image/png');
 const normalTexture=doc.createTexture('cloth-woven-normal-atlas').setImage(atlasNormal).setMimeType('image/png');
 const material=doc.createMaterial('athlete-atlas-pbr').setBaseColorTexture(texture).setNormalTexture(normalTexture).setNormalScale(.28).setRoughnessFactor(.69).setMetallicFactor(0).setAlphaMode('MASK').setAlphaCutoff(.3).setDoubleSided(true);
 const primitive=doc.createPrimitive().setMaterial(material).setIndices(doc.createAccessor('athlete-indices',buffer).setType('SCALAR').setArray(new Uint16Array(indices)));
 const sizes={POSITION:'VEC3',NORMAL:'VEC3',TEXCOORD_0:'VEC2',JOINTS_0:'VEC4',WEIGHTS_0:'VEC4',TANGENT:'VEC4'};
 for(const semantic of Object.keys(arrays))primitive.setAttribute(semantic,doc.createAccessor(semantic,buffer).setType(sizes[semantic]).setArray(semantic==='JOINTS_0'?new Uint16Array(arrays[semantic]):new Float32Array(arrays[semantic])));
 const mesh=doc.createMesh('athlete-lod'+lod).addPrimitive(primitive);
 const keep=nodes[0];keep.setName('Athlete');keep.setMesh(mesh);
 for(const n of nodes.slice(1))n.dispose();
 keep.getParentNode()?.removeChild(keep);root.listScenes()[0].addChild(keep);
 await doc.transform(prune());
 doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,encodeSpeed:5,decodeSpeed:5,quantizationBits:{POSITION:14,NORMAL:10,TEXCOORD:12,GENERIC:12}});
 const target=path.join(out,'actor-lod'+lod+'.glb');await io.write(target,doc);const bytes=await readFile(target);
 const clips=root.listAnimations().map(a=>({name:a.getName(),duration:Math.max(...a.listSamplers().map(s=>s.getInput().getMax([0])[0]))}));
 report.assets.push({file:path.basename(target),lod,bytes:bytes.length,MB:+(bytes.length/1e6).toFixed(6),triangles:indices.length/3,vertices:offset,meshes:1,materials:1,bones:root.listSkins()[0].listJoints().length,restBounds:{min,max,height:max[1]-min[1],units:'metres'},clips,sha256:createHash('sha256').update(bytes).digest('hex')});
 if(indices.length/3>(lod===0?8000:3000)||bytes.length>1500000)throw Error('Actor exceeds budget');
}
await writeFile(path.join(out,'actor-manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
