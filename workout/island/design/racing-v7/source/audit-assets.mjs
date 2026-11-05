import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '/tmp/racing-v7-tools/node_modules/@gltf-transform/core/dist/index.js';
import {ALL_EXTENSIONS} from '/tmp/racing-v7-tools/node_modules/@gltf-transform/extensions/dist/index.js';
import draco3d from '/tmp/racing-v7-tools/node_modules/draco3dgltf/draco3dgltf.js';
const require=createRequire(import.meta.url);
const validator=require('/tmp/racing-v7-tools/node_modules/gltf-validator');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule()});
const canonical=JSON.parse(await fs.readFile(path.join(root,'../motion2/soccer.json'),'utf8')).skeleton.bones;
const failures=[],warnings=[],assets=[],textures=[],checks=[];
function check(condition,description){checks.push({pass:!!condition,description});if(!condition)failures.push(description);}
async function walk(dir){const out=[];for(const item of await fs.readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,item.name);if(item.isDirectory())out.push(...await walk(file));else out.push(file);
}return out;}
function pngSize(b){if(b[0]===137&&b.toString('ascii',1,4)==='PNG')return[b.readUInt32BE(16),b.readUInt32BE(20)];return null;}
function imageSize(b){
  const png=pngSize(b);if(png)return png;
  if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
    const fmt=b.toString('ascii',12,16);
    if(fmt==='VP8X')return[1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
    if(fmt==='VP8 ')return[b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
    if(fmt==='VP8L'){const bits=b.readUInt32LE(21);return[(bits&0x3fff)+1,((bits>>14)&0x3fff)+1];}
  }return null;
}
for(const file of (await walk(path.join(root,'assets'))).filter(f=>f.endsWith('.glb')).sort()){
  const buffer=await fs.readFile(file),name=path.relative(root,file);
  check(buffer.readUInt32LE(0)===0x46546c67,`${name}: GLB magic`);
  const json=JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));
  check(buffer.length<=1500000,`${name}: <= 1,500,000 bytes`);
  check(json.extensionsRequired?.includes('KHR_draco_mesh_compression'),`${name}: Draco required`);
  const validation=await validator.validateBytes(new Uint8Array(buffer),{uri:name,maxIssues:50});
  check(validation.issues.numErrors===0,`${name}: Khronos validator errors = 0`);
  if(validation.issues.numWarnings)warnings.push({file:name,warnings:validation.issues.messages.filter(m=>m.severity===1)});
  const document=await io.read(file);let triangles=0,vertices=0,maxNormalError=0;
  for(const m of document.getRoot().listMeshes())for(const p of m.listPrimitives()){
    triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
    vertices+=p.getAttribute('POSITION').getCount();
    const normals=p.getAttribute('NORMAL')?.getArray();
    if(normals)for(let i=0;i<normals.length;i+=3)maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(normals[i],normals[i+1],normals[i+2])-1));
    const position=p.getAttribute('POSITION').getArray();check(position.every(Number.isFinite),`${name}: finite decoded positions`);
  }
  // A shared wheel mesh occupies storage once, but all four nodes draw it.
  const meshTriangleCounts=json.meshes.map(m=>m.primitives.reduce((sum,p)=>{
    const count=json.accessors[p.indices===undefined?p.attributes.POSITION:p.indices].count,mode=p.mode??4;
    return sum+(mode===4?count/3:(mode===5||mode===6)?Math.max(0,count-2):0);
  },0));
  let meshNodeInstances=0;
  function sceneTriangles(nodeIndex){
    const node=json.nodes[nodeIndex];let total=0;
    if(node.mesh!==undefined){
      const attribute=Object.values(node.extensions?.EXT_mesh_gpu_instancing?.attributes||{})[0];
      const instances=attribute===undefined?1:json.accessors[attribute].count;
      meshNodeInstances+=instances;total=meshTriangleCounts[node.mesh]*instances;
    }
    for(const child of node.children||[])total+=sceneTriangles(child);
    return total;
  }
  const trianglesPerScene=(json.scenes[json.scene??0].nodes||[]).reduce((sum,node)=>sum+sceneTriangles(node),0);
  check(maxNormalError<.02,`${name}: decoded normal length tolerance`);
  const imageInfo=[];
  for(const t of document.getRoot().listTextures()){
    const size=t.getSize();imageInfo.push({name:t.getName(),size,bytes:t.getImage()?.byteLength||0});
    check(size&&Math.max(...size)<=1024,`${name}: embedded texture <=1024`);
  }
  if(name.includes('/cars/')){
    const names=document.getRoot().listNodes().map(n=>n.getName());
    for(const wheel of ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR'])check(names.includes(wheel),`${name}: ${wheel} pivot`);
    const materials=document.getRoot().listMaterials().map(m=>m.getName());
    check(materials.some(n=>n.startsWith('Glass')),`${name}: separate glass material`);
    check(materials.some(n=>n.startsWith('Paint')),`${name}: recolorable paint material`);
    check(materials.some(n=>n.includes('front'))&&materials.some(n=>n.includes('rear')),`${name}: front and rear lamps`);
  }
  if(name.includes('/crowd/')){
    const skins=document.getRoot().listSkins();check(skins.length===1,`${name}: one skin`);
    const joints=skins[0].listJoints();check(joints.length===18,`${name}: 18 joints`);
    for(const bone of canonical){
      const node=joints.find(n=>n.getName()===bone.name);check(!!node,`${name}: canonical ${bone.name}`);
      if(node){const parent=node.getParentNode();check(!bone.parent||parent?.getName()===bone.parent,`${name}: parent of ${bone.name}`);
        check(node.getTranslation().every((v,i)=>Math.abs(v-bone.restTranslationMeters[i])<1e-5),`${name}: canonical translation ${bone.name}`);
        check(node.getRotation().every((v,i)=>Math.abs(v-(i===3?1:0))<1e-5),`${name}: identity canonical rest rotation ${bone.name}`);
      }
    }
    check(imageInfo.length===1,`${name}: exactly one atlas`);
  }
  assets.push({file:name,bytes:buffer.length,MB:buffer.length/1e6,triangles,trianglesPerScene,meshNodeInstances,vertices,primitives:json.meshes.reduce((n,m)=>n+m.primitives.length,0),textures:imageInfo,validatorErrors:validation.issues.numErrors,validatorWarnings:validation.issues.numWarnings,maxNormalError,sha256:crypto.createHash('sha256').update(buffer).digest('hex')});
}
for(const id of ['apex','velour','prism','solis','vector']){
  const levels=[0,1,2].map(i=>assets.find(a=>a.file===`assets/cars/${id}-lod${i}.glb`));
  check(levels.every(Boolean),`${id}: three LOD files`);
  check(levels[0].triangles>levels[1].triangles&&levels[1].triangles>levels[2].triangles,`${id}: strictly decreasing triangle counts`);
}
for(const file of (await walk(path.join(root,'textures'))).sort()){
  const b=await fs.readFile(file),size=imageSize(b),name=path.relative(root,file);
  check(size&&Math.max(...size)<=1024,`${name}: texture dimensions <=1024`);
  textures.push({file:name,bytes:b.length,MB:b.length/1e6,size,rgbaVRAMBytes:size?size[0]*size[1]*4*4/3:null,sha256:crypto.createHash('sha256').update(b).digest('hex')});
}
const tracks=[];
for(const id of ['coast','neon','ridge']){
  const t=JSON.parse(await fs.readFile(path.join(root,`assets/tracks/${id}.json`),'utf8'));
  const first=t.samples[0],last=t.samples.at(-1);
  const seam=Math.hypot(...first.p.map((v,i)=>v-last.p[i]));
  const maxGrade=Math.max(...t.samples.map(a=>Math.abs(a.t[1])/Math.hypot(a.t[0],a.t[2])));
  check(seam<1e-5,`${id}: closed track seam`);check(maxGrade<.3,`${id}: grade below 30%`);
  check(t.samples.every((a,i)=>i===0||a.s>t.samples[i-1].s),`${id}: monotonic arc length`);
  tracks.push({id,length:t.length,width:t.width,samples:t.samples.length,seamMeters:seam,maxGradePercent:maxGrade*100});
}
const report={generatedAt:new Date().toISOString(),pass:failures.length===0,checks:checks.length,failures,warnings,triangleCountDefinitions:{triangles:'Stored mesh primitives, each mesh once',trianglesPerScene:'Default GLB scene, including every mesh node and any GPU instances'},assets,textures,tracks};
await fs.writeFile(path.join(root,'verification/assets.json'),JSON.stringify(report,null,2)+'\n');
let md='# משקלי נכסים ובדיקת קבצים\n\nנוצר אוטומטית מנתוני glTF מפוענחים; MB = 1,000,000 bytes. ״ברשתות״ סופר כל mesh שנשמר בקובץ פעם אחת. ״במופע GLB״ סופר את כל צומתי הסצנה, כולל ארבעה גלגלים כשהגאומטריה שלהם משותפת. בתפאורה זו סצנת ספריית האביזרים; מספר המופעים וקריאות הציור בעולם נמדד בנפרד ב-PERFORMANCE.md.\n\n| קובץ | משולשים ברשתות | משולשים במופע GLB | bytes | MB | primitives בקובץ | טקסטורות |\n|---|---:|---:|---:|---:|---:|---|\n';
for(const a of assets)md+=`| ${a.file} | ${a.triangles.toLocaleString('en-US')} | ${a.trianglesPerScene.toLocaleString('en-US')} | ${a.bytes.toLocaleString('en-US')} | ${a.MB.toFixed(4)} | ${a.primitives} | ${a.textures.length?a.textures.map(t=>t.size.join('×')).join(', '):'ללא — חומרי PBR'} |\n`;
md+='\n| טקסטורה | מידות | bytes | MB | זיכרון RGBA + mipmaps, בקירוב |\n|---|---|---:|---:|---:|\n';
for(const t of textures)md+=`| ${t.file} | ${t.size?.join('×')} | ${t.bytes.toLocaleString('en-US')} | ${t.MB.toFixed(4)} | ${(t.rgbaVRAMBytes/1e6).toFixed(2)} MB |\n`;
md+='\nמפות שנוצרות בזיכרון: השתקפויות 1024×512 משותפות, שלטים 512×128, כתמי תאורה 128×128. לכל דמות קהל אטלס אחד 256×256. אין טקסטורות נפרדות לכל מופע קהל.\n\n';
md+=`בדיקות: ${checks.length}; נכשלו: ${failures.length}. פירוט, SHA-256 ותוצאות מאמת Khronos ב-verification/assets.json.\n`;
await fs.writeFile(path.join(root,'WEIGHTS.md'),md);
console.log(JSON.stringify({pass:report.pass,checks:checks.length,failures,warnings:warnings.length,assets:assets.length}));
if(failures.length)process.exitCode=1;
