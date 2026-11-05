/** Read-only checks of shipped GLBs, actual Draco decode, atlas and rig contract. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(process.env.NAVAL_TOOLCHAIN||'/tmp/naval-toolchain/node_modules','_naval.cjs'));
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),draco=require('draco3dgltf'),validator=require('gltf-validator');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const metrics=JSON.parse(await fs.readFile(path.join(root,'verification/asset-metrics.json'),'utf8'));
const report={checkedAt:new Date().toISOString(),assets:[],textures:[],checks:[],pass:true};
function check(label,pass,details){report.checks.push({label,pass,details});if(!pass)report.pass=false;}
const canonical=JSON.parse(await fs.readFile(path.join(root,'assets/crew/canonical-skeleton.json'),'utf8'));
const authoritative=JSON.parse(await fs.readFile(path.resolve(root,'../motion2/soccer.json'),'utf8')).skeleton;
check('Copied skeleton exactly matches authoritative motion2 contract',isDeepStrictEqual(canonical,authoritative),{source:'workout/island/design/motion2/soccer.json#skeleton',skeletonSha256:crypto.createHash('sha256').update(JSON.stringify(authoritative)).digest('hex')});
for(const m of metrics){
 const p=path.join(root,m.file),bytes=await fs.readFile(p),jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl));
 const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:m.file,externalResourceFunction:async uri=>new Uint8Array(await fs.readFile(path.resolve(path.dirname(p),decodeURIComponent(uri)))),maxIssues:100});
 const doc=await io.read(p);let triangles=0,uniqueTriangles=0,badWeights=0,badValues=0;
 for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
  uniqueTriangles+=(prim.getIndices()?.getCount()||prim.getAttribute('POSITION').getCount())/3;
  for(const semantic of prim.listSemantics()){
   const a=prim.getAttribute(semantic).getArray();for(const v of a)if(!Number.isFinite(v))badValues++;
  }
  const weights=prim.getAttribute('WEIGHTS_0');if(weights){
   const a=[];for(let i=0;i<weights.getCount();i++){weights.getElement(i,a);if(Math.abs(a.reduce((x,y)=>x+y,0)-1)>.001||a.some(v=>v<0))badWeights++;}
  }
 }
 const visit=n=>{if(n.getMesh())for(const prim of n.getMesh().listPrimitives())triangles+=(prim.getIndices()?.getCount()||prim.getAttribute('POSITION').getCount())/3;for(const c of n.listChildren())visit(c);};
 for(const s of doc.getRoot().listScenes())for(const n of s.listChildren())visit(n);
 const row={file:m.file,bytes:bytes.length,MB:bytes.length/1e6,triangles,uniqueTriangles,dracoRequired:j.extensionsRequired?.includes('KHR_draco_mesh_compression'),decoded:true,validationErrors:validation.issues.numErrors,validationWarnings:validation.issues.numWarnings,
  messages:validation.issues.messages.filter(q=>q.severity<2).slice(0,15),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 report.assets.push(row);
 check(m.file+' size/Draco/decode',bytes.length<=1_500_000&&row.dracoRequired&&triangles>0,{bytes:bytes.length,triangles});
 const warnings=validation.issues.messages.filter(q=>q.severity===1);
 const identity=n=>!n.matrix&&(!n.translation||n.translation.every(v=>v===0))&&(!n.rotation||n.rotation.every((v,i)=>v===[0,0,0,1][i]))&&(!n.scale||n.scale.every(v=>v===1));
 const skinnedNode=j.nodes?.findIndex(n=>n.skin!==undefined);
 let ancestor=skinnedNode,identityParents=true;
 while(ancestor>=0){const parent=j.nodes.findIndex(n=>n.children?.includes(ancestor));if(parent<0)break;identityParents&&=identity(j.nodes[parent]);ancestor=parent;}
 const documentedSkinWarning=m.file.includes('crew/')&&warnings.length===1&&warnings[0].code==='NODE_SKINNED_MESH_NON_ROOT'&&identityParents;
 check(m.file+' glTF validator',validation.issues.numErrors===0&&(warnings.length===0||documentedSkinWarning),{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,documentedIdentityParentWarning:documentedSkinWarning});
 check(m.file+' finite attributes and normalized weights',badWeights===0&&badValues===0,{badWeights,badValues});
 check(m.file+' scene-instance triangle count',triangles>=uniqueTriangles&&triangles===m.triangles,{triangles,uniqueTriangles});
 for(const image of j.images||[]){const asset=path.resolve(path.dirname(p),image.uri||'');check(m.file+' local texture reference',asset.startsWith(root+path.sep)&&!(image.uri||'').includes('://'),image.uri);}
 if(m.file.includes('crew/')){
  const skin=doc.getRoot().listSkins()[0],joints=skin.listJoints(),byName=new Map(joints.map(n=>[n.getName(),n]));let maxRestError=0;
  check('18 canonical crew joints',joints.length===18,joints.map(n=>n.getName()));
  for(const b of canonical.bones){
   const n=byName.get(b.name);check('canonical joint '+b.name,!!n,b.name);if(!n)continue;
   const q=n.getRotation(),t=n.getTranslation();maxRestError=Math.max(maxRestError,...t.map((v,i)=>Math.abs(v-b.restTranslationMeters[i])));
   check('canonical rest '+b.name,t.every((v,i)=>Math.abs(v-b.restTranslationMeters[i])<1e-6)&&q.every((v,i)=>Math.abs(v-[0,0,0,1][i])<1e-6),{translation:t,quaternion:q});
   if(b.parent)check('canonical parent '+b.name,n.getParentNode()?.getName()===b.parent,n.getParentNode()?.getName());
  }
  const ibm=skin.getInverseBindMatrices();let maxInverseBindError=ibm?0:Infinity;
  if(ibm)for(let i=0;i<joints.length;i++){
   const world=joints[i].getWorldMatrix(),inverse=ibm.getElement(i,[]);
   for(let col=0;col<4;col++)for(let row=0;row<4;row++){
    let v=0;for(let k=0;k<4;k++)v+=world[row+k*4]*inverse[k+col*4];
    maxInverseBindError=Math.max(maxInverseBindError,Math.abs(v-(row===col?1:0)));
   }
  }
  check('Inverse bind matrices invert canonical rest world transforms',maxInverseBindError<1e-5,{maxInverseBindError});
  report.canonicalRig={joints:18,maxRestErrorMeters:maxRestError,maxInverseBindError,axes:canonical.axes,units:canonical.units};
 }
}
for(const name of (await fs.readdir(path.join(root,'assets/textures'))).filter(n=>n.endsWith('.png'))){
 const bytes=await fs.readFile(path.join(root,'assets/textures',name));const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 report.textures.push({file:'assets/textures/'+name,bytes:bytes.length,MB:bytes.length/1e6,width,height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 check(name+' dimensions',width<=1024&&height<=1024,{width,height});
}
for(const kind of ['corvette','destroyer','cruiser','carrier']){
 const levels=[0,1,2].map(i=>report.assets.find(a=>a.file.endsWith(`${kind}-lod${i}.glb`)));
 check(kind+' strictly smaller LODs',levels[0].triangles>levels[1].triangles&&levels[1].triangles>levels[2].triangles,levels.map(l=>l.triangles));
}
const unique=new Set(report.assets.filter(a=>a.file.endsWith('-lod0.glb')).map(a=>a.sha256));check('Four distinct ship files',unique.size===4,[...unique]);
await fs.writeFile(path.join(root,'verification/asset-validation.json'),JSON.stringify(report,null,2)+'\n');
const table=['# משקל נכסים · נמדד מקבצים שנמסרו','', 'MB = 1,000,000 bytes. משולשים נספרו לאחר פענוח Draco לכל מופע node בסצנת הקובץ, כולל צריחים שחולקים אותה גאומטריה. האטלסים משותפים ואינם משוכפלים בכל GLB.','', '| קובץ | משולשים | MB | טקסטורה |','|---|---:|---:|---|'];
for(const a of report.assets){const m=metrics.find(m=>m.file===a.file);table.push(`| ${a.file} | ${a.triangles.toLocaleString('en-US')} | ${a.MB.toFixed(4)} | ${m.textures.map(t=>t.split('/').pop()).join(', ')} |`);}
table.push('','| טקסטורה | מידות | MB |','|---|---|---:|');for(const t of report.textures)table.push(`| ${t.file} | ${t.width}×${t.height} | ${t.MB.toFixed(4)} |`);
table.push('','כל ארבע הספינות מחליפות לאטלס fleet-ember בעת בחירת הצי האדום. אין GLB כפול לצביעה. איש הצוות משתמש באטלס יחיד של 256×256.');
await fs.writeFile(path.join(root,'ASSET-WEIGHTS.md'),table.join('\n')+'\n');
console.log(JSON.stringify({pass:report.pass,assets:report.assets.length,textures:report.textures.length,checks:report.checks.length,failures:report.checks.filter(c=>!c.pass),largest:report.assets.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,3)},null,2));
if(!report.pass)process.exitCode=1;
