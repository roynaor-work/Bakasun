import {createRequire} from 'node:module';
import {io,fs,path,out,root,T,acc,weld,simplify,prune,dedup,draco,discardAnimation} from './mesh.mjs';
import {actorScene} from './pose.mjs';
import {repairSurfaceNormals} from './surface-normals.mjs';
const require=createRequire(process.env.DEFENSE_TOOLS||'/tmp/defense-v7-tools/package.json');
const {MeshoptSimplifier}=require('meshoptimizer');await MeshoptSimplifier.ready;
const report=[];
for(const id of ['guard-ranger','guard-lookout','guard-keeper']){
  const doc=await io.read(path.join(out,id+'-lod1.glb'));doc.getRoot().listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression')?.dispose();
  const actor=actorScene(doc);actor.pose('idle',0);
  const v=new T.Vector3(),weighted=new T.Vector3(),original=new T.Vector3(),matrix=new T.Matrix4();
  for(const {mesh,primitive,node}of actor.meshes){
    const pos=[],norm=[],g=mesh.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
    for(let i=0;i<g.attributes.position.count;i++){
      mesh.getVertexPosition(i,v);pos.push(...v.toArray());
      original.fromBufferAttribute(g.attributes.normal,i);weighted.set(0,0,0);
      for(let j=0;j<4;j++){
        const weight=sw.getComponent(i,j);if(!weight)continue;matrix.fromArray(mesh.skeleton.boneMatrices,si.getComponent(i,j)*16);
        v.copy(original).transformDirection(matrix);weighted.addScaledVector(v,weight);
      }
      norm.push(...weighted.normalize().toArray());
    }
    primitive.setAttribute('POSITION',acc(doc,'Baked guard idle','VEC3',new Float32Array(pos))).setAttribute('NORMAL',acc(doc,'Baked guard normals','VEC3',new Float32Array(norm))).setAttribute('JOINTS_0',null).setAttribute('WEIGHTS_0',null);
    node.setSkin(null).setExtras({lod:2,pose:'baked idle at 0',use:'under 48 CSS pixels tall; full canonical skin remains in LOD0/1'});
  }
  for(const a of [...doc.getRoot().listAnimations()])discardAnimation(a);for(const s of [...doc.getRoot().listSkins()])s.dispose();
  const rootBone=doc.getRoot().listNodes().find(n=>n.getName()==='Root');if(rootBone)(doc.getRoot().getDefaultScene()||doc.getRoot().listScenes()[0]).removeChild(rootBone);
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.12,error:.025,lockBorder:false}),dedup(),prune());
  repairSurfaceNormals(doc);await doc.transform(weld(),dedup(),prune());
  const triangles=doc.getRoot().listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((a,p)=>a+p.getIndices().getCount()/3,0),0);
  await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12}));
  await io.write(path.join(out,id+'-lod2.glb'),doc);report.push({id,triangles,bytes:(await fs.stat(path.join(out,id+'-lod2.glb'))).size});
}
await fs.writeFile(path.join(root,'verification/guard-static-lod.json'),JSON.stringify(report,null,2));console.log(report);
