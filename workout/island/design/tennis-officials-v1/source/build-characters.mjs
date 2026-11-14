/**
 * Reuse the repository's CC0 tennis-v7 skinned humans. Original inputs are read
 * only. The output is one canonical18 body / one primitive / one 256px atlas.
 * The normal + UV weighted simplifier retains face/cloth color seams. No third
 * party character, scan, real person or motion capture is introduced.
 *
 * Setup (outside repository): npm install --prefix /tmp/tennis-officials-tools
 * three@0.160.0 @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1
 * @gltf-transform/functions@4.5.1 meshoptimizer@0.24.0 draco3dgltf@1.5.9 sharp
 * Run: node workout/island/design/tennis-officials-v1/source/build-characters.mjs
 * This writes unanimated body GLBs; source/build-clips.mjs adds the final motion.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire('/tmp/tennis-officials-tools/package.json');
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {prune,compactPrimitive}=require('@gltf-transform/functions');
const {MeshoptSimplifier}=require('meshoptimizer');
const draco=require('draco3dgltf'),sharp=require('sharp');
await MeshoptSimplifier.ready;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(root,'../tennis-v7');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const sha=b=>createHash('sha256').update(b).digest('hex');
export const characters=[
 {id:'chair-umpire',role:'chairUmpire',label:'שופט כיסא',source:'man-01',scale:1,shirt:'#EDE5CF',accent:'#538D8B',shorts:'#203447',trousers:true},
 {id:'line-judge-01',role:'lineJudge',label:'שופט קו א׳',source:'man-02',scale:1,shirt:'#367F7C',accent:'#E5D6AE',shorts:'#233747'},
 {id:'line-judge-02',role:'lineJudge',label:'שופטת קו ב׳',source:'woman-02',scale:1,shirt:'#284957',accent:'#5AA5A0',shorts:'#233747'},
 {id:'ball-kid-01',role:'ballKid',label:'ילד כדורים א׳',source:'man-01',scale:.80,shirt:'#CE7158',accent:'#E7D9B9',shorts:'#263B4C',skin:'#C89672',hair:'#513E32'},
 {id:'ball-kid-02',role:'ballKid',label:'ילד כדורים ב׳',source:'man-02',scale:.78,shirt:'#418D88',accent:'#E7D9B9',shorts:'#263B4C',skin:'#77513D',hair:'#262329'},
 {id:'ball-kid-03',role:'ballKid',label:'ילדת כדורים ג׳',source:'woman-01',scale:.82,shirt:'#CE7158',accent:'#E7D9B9',shorts:'#263B4C',skin:'#D8AA88',hair:'#60432F'},
 {id:'ball-kid-04',role:'ballKid',label:'ילדת כדורים ד׳',source:'woman-02',scale:.79,shirt:'#418D88',accent:'#E7D9B9',shorts:'#263B4C',skin:'#94674E',hair:'#29252C'},
];
function rgb(hex){return hex.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));}
async function atlas(texture,look){
 const meta=await sharp(texture).metadata();
 const {data}=await sharp(texture).removeAlpha().raw().toBuffer({resolveWithObject:true});
 // Original atlas contract, source/characters.py: 0=shirt,1=accent,2=skin,
 // 3=shorts/skort,12=hair. The remaining swatches retain face/eye/shoe detail.
 const updates=new Map([[0,look.shirt],[1,look.accent],[3,look.shorts]]);
 if(look.skin)updates.set(2,look.skin);if(look.hair)updates.set(12,look.hair);
 if(look.trousers)updates.set(24,look.shorts);
 for(const [tile,color] of updates){
  const c=rgb(color),x0=tile%8*64,y0=Math.floor(tile/8)*64;
  for(let y=y0;y<y0+64;y++)for(let x=x0;x<x0+64;x++){
   // One-pixel woven contrast, deterministic and small enough for mip levels.
   const grain=((x+y*3)%7===0?1:0)-.5;
   for(let k=0;k<3;k++)data[(y*meta.width+x)*3+k]=Math.max(0,Math.min(255,Math.round(c[k]+grain)));
  }
 }
 return sharp(data,{raw:{width:meta.width,height:meta.height,channels:3}}).resize(256,256).png({palette:true,colours:96,dither:0}).toBuffer();
}
const sourceRig=await fs.readFile(source+'/rig.json');
const rig=JSON.parse(sourceRig);rig.name='TennisOfficialsCanonical18';
rig.canonicalSource='../motion2/soccer.json / skeleton.bones (names/order/parents)';
rig.bindSource='../tennis-v7/rig.json';rig.bindSourceSha256=sha(sourceRig);
rig.scaleContract='All GLBs retain the identical metre-space bind. Apply catalog uniformScale on an actor container (including skeleton); never scale only the mesh.';
await fs.writeFile(root+'/rig.json',JSON.stringify(rig,null,2)+'\n');
const records=[];
for(const look of characters){
 const file=source+'/models/'+look.source+'.glb';const input=await fs.readFile(file);
 const doc=await io.readBinary(input);const r=doc.getRoot();
 for(const a of [...r.listAnimations()]){for(const c of [...a.listChannels()])c.dispose();for(const sampler of [...a.listSamplers()])sampler.dispose();a.dispose();}
 const body=r.listNodes().find(n=>n.getName()==='Body_LOD1');
 for(const node of [...r.listNodes()])if(node.getMesh()&&node!==body)node.dispose();
 for(const mesh of [...r.listMeshes()])if(mesh!==body.getMesh())mesh.dispose();
 const p=body.getMesh().listPrimitives()[0],pos=p.getAttribute('POSITION'),uv=p.getAttribute('TEXCOORD_0');
 const positions=new Float32Array(pos.getArray()),uvs=new Float32Array(uv.getArray());
 if(look.trousers){
  // Reuse the modeled leg skin as a slim trouser surface below the shorts hem.
  // It is fully skinned to the same leg joints, with 5mm radial cloth ease.
  for(let i=0;i<pos.getCount();i++){
   const y=positions[i*3+1],tile=Math.floor(uvs[i*2]*8)+Math.floor(uvs[i*2+1]*8)*8;
   if(tile===2&&y>.145&&y<.79){
    const sign=Math.sign(positions[i*3]),cx=sign*(.1608-(y-.096)/(.928-.096)*.0536);
    positions[i*3]=cx+(positions[i*3]-cx)*1.055;
    positions[i*3+2]*=1.045;
    uvs[i*2]=(0+.5)/8;uvs[i*2+1]=(3+.5)/8;
   }
  }
 }
 pos.setArray(positions);uv.setArray(uvs);
 const normals=p.getAttribute('NORMAL').getArray();
 const attributes=new Float32Array(pos.getCount()*5);
 for(let i=0;i<pos.getCount();i++)attributes.set([...normals.slice(i*3,i*3+3),...uvs.slice(i*2,i*2+2)],i*5);
 const before=p.getIndices().getCount()/3;
 const eyeLocks=new Uint8Array(pos.getCount());
 for(let i=0;i<pos.getCount();i++){
  const tile=Math.floor(uvs[i*2]*8)+Math.floor(uvs[i*2+1]*8)*8;
  if(positions[i*3+1]>1.50&&[8,9,10,11].includes(tile))eyeLocks[i]=1;
 }
 const [indices,error]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(p.getIndices().getArray()),positions,3,attributes,5,[.12,.12,.12,.1,.1],eyeLocks,1200*3,.08);
 p.getIndices().setArray(indices);
 compactPrimitive(p);
 p.setAttribute('COLOR_0',null); // Source was uniformly white; atlas carries color.
 const texture=r.listTextures()[0],png=await atlas(texture.getImage(),look);
 texture.setImage(png).setName(look.id+' 256px uniform atlas');
 await fs.writeFile(root+'/textures/'+look.id+'-atlas.png',png);
 const material=p.getMaterial();material.setName('Cotton / skin / shoes').setRoughnessFactor(.83).setMetallicFactor(0);
 body.setName(look.id+'_Body');body.getMesh().setName(look.id+' near 1200 triangles');
 body.setExtras({role:look.role,uniformScale:look.scale,license:'CC0-1.0',source:'../tennis-v7/models/'+look.source+'.glb'});
 for(const ext of [...r.listExtensionsUsed()])ext.dispose();
 await doc.transform(prune());
 const skin=body.getSkin(),jointNames=skin.listJoints().map(n=>n.getName());
 if(JSON.stringify(jointNames)!==JSON.stringify(rig.joints.map(j=>j.name)))throw Error('canonical18 order mismatch');
 let weightError=0;const weights=p.getAttribute('WEIGHTS_0'),jointIndices=p.getAttribute('JOINTS_0');
 for(let i=0;i<weights.getCount();i++){
  const w=weights.getElement(i,[]),j=jointIndices.getElement(i,[]);weightError=Math.max(weightError,Math.abs(w.reduce((n,v)=>n+v,0)-1));
  if(j.some(x=>x<0||x>=18))throw Error('Invalid joint index');
 }
 r.getAsset().generator='Tennis officials v1 / CC0 tennis-v7 adaptation / glTF Transform 4.5.1';
 r.getAsset().copyright='Original fictional characters. CC0-1.0. See LICENSES.md.';
 const bytes=await io.writeBinary(doc);await fs.writeFile(root+'/models/'+look.id+'.glb',bytes);
 const record={...look,file:'models/'+look.id+'.glb',uniformScale:look.scale,triangles:indices.length/3,sourceTriangles:before,vertices:p.getAttribute('POSITION').getCount(),joints:jointNames,primitives:1,materials:1,bytes:bytes.length,sha256:sha(bytes),sourceFile:'../tennis-v7/models/'+look.source+'.glb',sourceSha256:sha(input),atlas:{file:'textures/'+look.id+'-atlas.png',width:256,height:256,bytes:png.length,sha256:sha(png),embedded:true},simplification:{algorithm:'meshoptimizer normal/UV weighted QEM',relativeError:error,targetTriangles:1200,lockedEyeVertices:eyeLocks.reduce((n,v)=>n+v,0)},maxWeightSumError:weightError};
 records.push(record);console.log(look.id,record.triangles,record.vertices,record.bytes,'bytes');
}
await fs.writeFile(root+'/verification/characters.json',JSON.stringify({schemaVersion:1,stage:'unanimated body generation; final GLB hashes after baking are in catalog.json',pass:records.every(r=>r.triangles>=1100&&r.triangles<=1250&&r.maxWeightSumError<.0001),rig:'rig.json',sourceRigSha256:sha(sourceRig),models:records},null,2)+'\n');
