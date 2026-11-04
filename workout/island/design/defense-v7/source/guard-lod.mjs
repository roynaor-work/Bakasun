import {createRequire} from 'node:module';
import {io,fs,path,out,root,draco,weld,simplify,prune,dedup} from './mesh.mjs';
import {repairSurfaceNormals} from './surface-normals.mjs';
const require=createRequire(process.env.DEFENSE_TOOLS||'/tmp/defense-v7-tools/package.json');
const {MeshoptSimplifier}=require('meshoptimizer');await MeshoptSimplifier.ready;
const rows=[];
for(const id of ['guard-ranger','guard-lookout','guard-keeper']){
  const doc=await io.read(path.join(out,id+'.glb'));
  const ext=doc.getRoot().listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression');ext?.dispose();
  const before=doc.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((a,p)=>a+p.getIndices().getCount()/3,0),0);
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.30,error:.005,lockBorder:false}),dedup(),prune());
  const repairedNormals=repairSurfaceNormals(doc);await doc.transform(weld(),dedup(),prune());
  const after=doc.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((a,p)=>a+p.getIndices().getCount()/3,0),0);
  await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:16,quantizeNormal:12,quantizeTexcoord:12}));
  await io.write(path.join(out,id+'-lod1.glb'),doc);rows.push({id,before,after,repairedNormals,bytes:(await fs.stat(path.join(out,id+'-lod1.glb'))).size});
}
await fs.writeFile(path.join(root,'verification/guard-lod.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2));
