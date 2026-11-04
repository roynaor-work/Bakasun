import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {io,fs,path,root,out} from './mesh.mjs';
const require=createRequire(process.env.DEFENSE_TOOLS || '/tmp/defense-v7-tools/package.json');
const validator=require('gltf-validator');
const canonical=JSON.parse(await fs.readFile(path.join(root,'skeleton.json'),'utf8')).skeleton;
const rows=[],failures=[];
for(const filename of (await fs.readdir(out)).filter(f=>f.endsWith('.glb')).sort()){
  const bytes=await fs.readFile(path.join(out,filename)),jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  const document=await io.read(path.join(out,filename));
  const packed=await validator.validateBytes(new Uint8Array(bytes),{uri:filename,maxIssues:100});
  const primitiveList=document.getRoot().listMeshes().flatMap(m=>m.listPrimitives());
  let triangles=0,vertices=0,nonFinite=0,badNormals=0,badWeights=0,maxWeightError=0;
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const p of primitiveList){
    const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),weight=p.getAttribute('WEIGHTS_0');
    vertices+=pos.getCount();triangles+=(p.getIndices()?.getCount()||pos.getCount())/3;
    for(let i=0;i<pos.getCount();i++){
      const v=pos.getElement(i,[]);for(let k=0;k<3;k++){if(!Number.isFinite(v[k]))nonFinite++;bounds.min[k]=Math.min(bounds.min[k],v[k]);bounds.max[k]=Math.max(bounds.max[k],v[k]);}
      if(normal){const n=normal.getElement(i,[]),len=Math.hypot(...n);if(!Number.isFinite(len)||Math.abs(1-len)>.015)badNormals++;}
      if(weight){const w=weight.getElement(i,[]),error=Math.abs(1-w.reduce((a,b)=>a+b,0));maxWeightError=Math.max(error,maxWeightError);if(error>1e-4||w.some(x=>x<0||!Number.isFinite(x)))badWeights++;}
    }
  }
  const skins=document.getRoot().listSkins().map(s=>{
    const joints=s.listJoints();const sameNames=joints.map(j=>j.getName()).join('|')===canonical.bones.map(j=>j.name).join('|');
    const sameParents=joints.every((j,i)=>(j.getParentNode()?.getName()||null)===canonical.bones[i].parent);
    return {name:s.getName(),joints:joints.length,sameCanonicalNames:sameNames,sameCanonicalParents:sameParents};
  });
  const textures=document.getRoot().listTextures().map(t=>({name:t.getName(),size:t.getSize(),mime:t.getMimeType(),bytes:t.getImage()?.byteLength||0,sha256:createHash('sha256').update(t.getImage()||new Uint8Array()).digest('hex')}));
  const dracoRequired=(json.extensionsRequired||[]).includes('KHR_draco_mesh_compression');
  const everyPrimitiveDraco=(json.meshes||[]).every(m=>m.primitives.every(p=>!!p.extensions?.KHR_draco_mesh_compression));
  const compressed=document.getRoot().listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression');if(compressed)compressed.dispose();
  const decoded=await validator.validateBytes(await io.writeBinary(document),{uri:'decoded/'+filename,maxIssues:100});
  const row={filename,bytes:bytes.length,MB:bytes.length/1e6,triangles,vertices,materials:document.getRoot().listMaterials().length,meshes:document.getRoot().listMeshes().length,textures,skins,
    animations:document.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length})),bounds,
    dracoRequired,everyPrimitiveDraco,nonFinite,badNormals,badWeights,maxWeightError,
    validator:{packed:{errors:packed.issues.numErrors,warnings:packed.issues.numWarnings,messages:packed.issues.messages},decoded:{errors:decoded.issues.numErrors,warnings:decoded.issues.numWarnings,messages:decoded.issues.messages}},sha256:createHash('sha256').update(bytes).digest('hex')};
  if(bytes.length>1500000||!dracoRequired||!everyPrimitiveDraco||nonFinite||badNormals||badWeights||packed.issues.numErrors||decoded.issues.numErrors||textures.some(t=>t.size.some(s=>s>1024))||skins.some(s=>!s.sameCanonicalNames||!s.sameCanonicalParents))failures.push(filename);
  if((filename.startsWith('guard-')&&skins.length||filename.startsWith('boar-'))&&textures.length!==1)failures.push(filename+' atlas count');
  rows.push(row);
}
const sizes=rows.map(r=>({filename:r.filename,bytes:r.bytes,MB:r.MB,triangles:r.triangles,textures:r.textures.map(t=>({size:t.size,bytes:t.bytes})),sha256:r.sha256}));
const result={generatedUTC:new Date().toISOString(),limits:{perGLBBytes:1500000,textureSide:1024,characterAtlases:1},rows,failures};
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(result,null,2));
await fs.writeFile(path.join(root,'asset-budget.json'),JSON.stringify({generatedUTC:result.generatedUTC,totalGLBBytes:rows.reduce((a,r)=>a+r.bytes,0),files:sizes},null,2));
let md='# משקלי נכסים\n\nכל הגדלים ב־MB עשרוני (1MB = 1,000,000 בתים). משולשים של רמת הקובץ, ללא הכפלת מופעים.\n\n| קובץ | משולשים | MB | טקסטורות |\n|---|---:|---:|---|\n';
for(const r of rows)md+=`| \`${r.filename}\` | ${r.triangles.toLocaleString('en-US')} | ${r.MB.toFixed(4)} | ${r.textures.map(t=>t.size.join('×')+' · '+(t.bytes/1000).toFixed(1)+'KB').join(', ')||'צבעי קודקודים'} |\n`;
await fs.writeFile(path.join(root,'BUDGET.md'),md);
console.log(JSON.stringify({files:rows.length,totalMB:rows.reduce((a,r)=>a+r.bytes,0)/1e6,max:rows.sort((a,b)=>b.bytes-a.bytes).slice(0,5).map(r=>({filename:r.filename,bytes:r.bytes,triangles:r.triangles})),failures,validatorErrors:rows.reduce((a,r)=>a+r.validator.decoded.errors,0),validatorWarnings:rows.reduce((a,r)=>a+r.validator.decoded.warnings,0)},null,2));
if(failures.length)process.exitCode=1;
