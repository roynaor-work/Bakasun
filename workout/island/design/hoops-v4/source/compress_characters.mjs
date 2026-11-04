/** Lossless topology/skin cleanup, shared image extraction and Draco export. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const modulesIndex=process.argv.indexOf('--modules');
const requestedModules=path.resolve(modulesIndex>=0?process.argv[modulesIndex+1]:'/tmp/hoops-v4-tools');
const require=createRequire(requestedModules.endsWith('.json')?requestedModules:path.join(requestedModules,'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {dedup, prune, resample, draco, textureCompress}=require('@gltf-transform/functions');
const dm=require('draco3dgltf');
const sharp=require('sharp');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.encoder':await dm.createEncoderModule(),'draco3d.decoder':await dm.createDecoderModule()});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(await fs.readFile(path.join(root,'assets/players/player-metadata.json'),'utf8'));
for(const p of metadata.players){
 const d=await io.read('/tmp/hoops-v4-players/'+p.id+'.glb');
 d.getRoot().getAsset().generator='Hoops v4 / Blender 4.3.2 + glTF Transform 4.5.1';
 d.getRoot().getAsset().copyright='MakeHuman core assets CC0-1.0. CMU motion under CMU terms. See LICENSES.md.';
 for(const a of d.getRoot().listAnimations()) a.setName(a.getName().replace(/\.\d+$/,''));
 for(const m of d.getRoot().listMeshes()) for(const p of m.listPrimitives()){
  const w=p.getAttribute('WEIGHTS_0');if(!w)continue;
  const balanced=[];for(let i=0;i<w.getCount();i++){
   const a=w.getElement(i,[]),sum=a.reduce((x,y)=>x+y,0);
   const scaled=a.map(x=>x/sum*65535),q=scaled.map(Math.floor),order=[0,1,2,3].sort((x,y)=>(scaled[y]-q[y])-(scaled[x]-q[x]));
   const remaining=65535-q.reduce((x,y)=>x+y,0);for(let k=0;k<remaining;k++)q[order[k%4]]++;balanced.push(...q);
  }
  w.setArray(new Uint16Array(balanced)).setNormalized(true);
 }
 // Drop static channels only when they equal the bind node value; static
 // action poses that differ from bind remain explicit.
 for(const a of d.getRoot().listAnimations()){
  for(const c of [...a.listChannels()]){
   const node=c.getTargetNode(), prop=c.getTargetPath(), values=c.getSampler().getOutput().getArray();
   const rest=prop==='rotation'?node.getRotation():prop==='translation'?node.getTranslation():node.getScale();
   const size=rest.length;
   const match=[1,-1].some(sign=>{if(sign<0&&prop!=='rotation')return false; for(let i=0;i<values.length;i++)if(Math.abs(values[i]-rest[i%size]*sign)>0.000005)return false; return true;});
   if(match)c.dispose();
  }
 }
 for(const a of d.getRoot().listAnimations()){
  const used=new Set(a.listChannels().map(c=>c.getSampler()));
  for(const s of [...a.listSamplers()])if(!used.has(s)){a.removeSampler(s);s.dispose();}
 }
 for(const t of d.getRoot().listTextures()){
  const max=/diffuse|hair|short|afro|shoes/.test(t.getName())&&!/skinned|skin|male/.test(t.getName())?256:512;
  const encoded=await sharp(t.getImage()).resize({width:max,height:max,fit:'inside',withoutEnlargement:true}).webp({quality:84,alphaQuality:90,effort:6}).toBuffer();t.setImage(new Uint8Array(encoded)).setMimeType('image/webp');
 }
 // Blender skin conversion can introduce zero-weight secondary channels; the
 // native 52-bone skeleton and face topology remain intact.
 await d.transform(dedup(),resample({tolerance:0.0007}),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:84}),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:15,quantizeNormal:10,quantizeTexcoord:12,quantizeColor:8,quantizeGeneric:16}));
 const dest=path.join(root,'assets/players',p.id+'.glb');
 await io.write(dest,d);
 p.bytes=(await fs.stat(dest)).size;
 p.exportAnimations=d.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length}));
 console.log(p.id,p.bytes,JSON.stringify(p.exportAnimations));
}
await fs.writeFile(path.join(root,'assets/players/player-metadata.json'),JSON.stringify(metadata,null,2)+'\n');
