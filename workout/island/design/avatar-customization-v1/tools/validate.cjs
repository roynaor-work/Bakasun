/** CC0-1.0. Independent byte-level checks; Khronos validator is a build tool. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const validator=require(process.env.AVATAR_GLTF_VALIDATOR||'gltf-validator');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={validatorVersion:validator.version(),checks:0,assets:[],sourceBodies:[],pass:true};
function check(value,message){report.checks++;assert.ok(value,message);}
function unpack(file){
 const bytes=fs.readFileSync(path.join(root,file));
 check(bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,file+' GLB header');
 const length=bytes.readUInt32LE(12);check(bytes.readUInt32LE(16)===0x4e4f534a,file+' JSON chunk');
 const j=JSON.parse(bytes.subarray(20,20+length));const bin=bytes.subarray(28+length);
 return {bytes,j,bin};
}
function accessor(j,bin,index){
 const a=j.accessors[index],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
 const method={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
 return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>bin[method]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*size)+k*size)));
}
function worldRest(){const positions={};for(const b of manifest.skeleton.bones)positions[b.name]=b.rest.map((v,k)=>v+(positions[b.parent]?.[k]||0));return positions;}
const rest=worldRest();
function rig(j,bin,file,reference=false){
 const skin=j.skins[0];check(j.skins.length===1&&skin.joints.length===18,file+' 18 canonical bones');
 const inverse=accessor(j,bin,skin.inverseBindMatrices);
 for(const [index,b] of manifest.skeleton.bones.entries()){
  const nodeIndex=skin.joints[index],n=j.nodes[nodeIndex],parent=j.nodes.find(n=>n.children?.includes(nodeIndex));
  check(n.name===b.name,file+' canonical name/order '+b.name);
  check((parent?.name||null)===(b.parent||(reference?'BodyScale':null)),file+' canonical parent '+b.name);
  check(n.translation.every((v,k)=>Math.abs(v-b.rest[k])<1e-6)&&(!n.rotation||n.rotation.every((v,k)=>Math.abs(v-[0,0,0,1][k])<1e-6)),file+' canonical bind '+b.name);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++){
   const wanted=col===3&&row<3?-rest[b.name][row]:row===col?1:0;
   check(Math.abs(inverse[index][col*4+row]-wanted)<1e-6,file+' inverse bind '+b.name);
  }
 }
}
function walkFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walkFiles(path.join(dir,e.name)):[path.join(dir,e.name)]);}
(async()=>{
 check(manifest.items.length===46,'46 geometry choices');
 for(const cat of manifest.categories)check(cat.count===(cat.id==='skin'?manifest.skinTones.length:manifest.items.filter(i=>i.category===cat.id).length),cat.id+' count');
 check(manifest.skinTones.length===6&&new Set(manifest.skinTones).size===6,'six distinct tones');
 check(new Set(manifest.items.map(i=>i.id)).size===46,'unique item ids');
 for(const item of manifest.items){
  const {bytes,j,bin}=unpack(item.path);
  const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:item.path,maxIssues:1000});
  check(validation.issues.numErrors===0&&validation.issues.numWarnings===0,item.path+' Khronos');
  check(!j.extensionsUsed?.length&&!j.extensionsRequired?.length,item.path+' zero extensions');
  check(!j.images?.length&&!j.textures?.length,item.path+' texture-free vertex colors');
  let triangles=0;
  for(const node of j.nodes)if(node.mesh!==undefined)for(const p of j.meshes[node.mesh].primitives){
   check(p.mode===4,item.path+' triangle mode');triangles+=j.accessors[p.indices].count/3;
   const pos=accessor(j,bin,p.attributes.POSITION),normal=accessor(j,bin,p.attributes.NORMAL),colors=accessor(j,bin,p.attributes.COLOR_0),regions=accessor(j,bin,p.attributes._REGION),joints=accessor(j,bin,p.attributes.JOINTS_0),weights=accessor(j,bin,p.attributes.WEIGHTS_0);
   check([normal,colors,regions,joints,weights].every(a=>a.length===pos.length),item.path+' consistent attribute lengths');
   check([pos,normal,colors,weights].every(a=>a.flat().every(Number.isFinite)),item.path+' finite attributes');
   check(normal.every(n=>Math.abs(Math.hypot(...n)-1)<1e-4),item.path+' unit normals');
   check(weights.every(w=>Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-6&&w.every(v=>v>=0)),item.path+' normalized weights');
   check(joints.every(a=>a.every(i=>i>=0&&i<18)),item.path+' canonical joint indices');
   check(regions.every(([r])=>manifest.colorRegions.some(c=>c.id===r)),item.path+' valid color masks');
   check(colors.every(c=>c.length===4&&c[3]===1&&c.every(v=>v>=0&&v<=1)),item.path+' linear RGBA range');
   check(j.accessors[p.attributes._REGION].componentType===5121&&j.bufferViews[j.accessors[p.attributes._REGION].bufferView].byteStride===4,item.path+' padded uint8 region mask');
   check(item.colorRegions.every(name=>regions.some(([r])=>r===manifest.colorRegions.find(c=>c.name===name).id)),item.path+' declared regions present');
  }
  check(triangles===item.triangles&&triangles<=300,item.path+' complete-item triangle budget');
  check(bytes.length===item.bytes&&hash(bytes)===item.sha256,item.path+' manifest bytes/hash');
  if(item.empty)check(triangles===0&&j.nodes[0].extras.action==='remove-hair',item.path+' explicit bald action');
  else rig(j,bin,item.path);
  check(item.compatibleBodies.length===4&&manifest.bodies.every(b=>item.compatibleBodies.includes(b.id)),item.path+' four body fits');
  report.assets.push({path:item.path,triangles,bytes:bytes.length,sha256:hash(bytes),errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos});
 }
 for(const body of manifest.bodies){
  const {bytes,j,bin}=unpack(body.path),source=fs.readFileSync(path.resolve(root,'../../assets/athlete-body-v22/models',body.id+'.glb'));
  check(bytes.equals(source)&&hash(bytes)===body.sourceSha256,body.id+' reference is byte-identical to existing v22');
  const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:body.path,externalResourceFunction:async uri=>new Uint8Array(fs.readFileSync(path.resolve(root,path.dirname(body.path),uri)))});
  check(validation.issues.numErrors===0&&validation.issues.numWarnings===0,body.id+' reference Khronos');rig(j,bin,body.path,true);
  report.sourceBodies.push({id:body.id,bytes:bytes.length,sha256:hash(bytes),triangles:body.triangles,errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.messages});
 }
 for(const file of manifest.offlineFiles)check(fs.existsSync(path.join(root,file)),file+' available offline');
 const files=walkFiles(root);report.packageBytes=files.reduce((n,p)=>n+fs.statSync(p).size,0);
 check(report.packageBytes<=6_000_000,'entire folder including source/vendor/evidence <= 6 MB');
 report.itemBytes=report.assets.reduce((n,a)=>n+a.bytes,0);report.maxItemTriangles=Math.max(...report.assets.map(a=>a.triangles));
 report.totalErrors=report.assets.reduce((n,a)=>n+a.errors,0)+report.sourceBodies.reduce((n,a)=>n+a.errors,0);
 report.totalWarnings=report.assets.reduce((n,a)=>n+a.warnings,0)+report.sourceBodies.reduce((n,a)=>n+a.warnings,0);
 fs.writeFileSync(path.join(root,'verification/assets.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({pass:true,checks:report.checks,items:report.assets.length,references:report.sourceBodies.length,maxItemTriangles:report.maxItemTriangles,errors:report.totalErrors,warnings:report.totalWarnings,packageBytes:report.packageBytes}));
})().catch(error=>{console.error(error);process.exitCode=1;});
