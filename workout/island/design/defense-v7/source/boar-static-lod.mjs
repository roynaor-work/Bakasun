import {createRequire} from 'node:module';
import {io,fs,path,out,root,T,acc,weld,simplify,prune,dedup,draco,discardAnimation} from './mesh.mjs';
import {actorScene} from './pose.mjs';
import {repairSurfaceNormals} from './surface-normals.mjs';
const require=createRequire(process.env.DEFENSE_TOOLS||'/tmp/defense-v7-tools/package.json');
const {MeshoptSimplifier}=require('meshoptimizer');await MeshoptSimplifier.ready;const report=[];
for(const id of ['boar-amber','boar-ash','boar-striped']){
  const doc=await io.read(path.join(out,id+'-lod1.glb'));doc.getRoot().listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression')?.dispose();
  const actor=actorScene(doc);actor.pose('trot',0);
  const positions=[],normals=[],uv=[],indices=[],v=new T.Vector3();
  for(const {mesh,primitive}of actor.meshes){
    const count=primitive.getAttribute('POSITION').getCount(),offset=positions.length/3;
    for(let i=0;i<count;i++){
      mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);positions.push(...v.toArray());
      v.fromBufferAttribute(mesh.geometry.attributes.normal,i).transformDirection(mesh.matrixWorld);normals.push(...v.toArray());uv.push(...primitive.getAttribute('TEXCOORD_0').getElement(i,[]));
    }
    for(const i of primitive.getIndices().getArray())indices.push(i+offset);
  }
  const material=doc.getRoot().listMaterials()[0],oldRoot=doc.getRoot().listNodes().find(n=>n.getName()==='asset_root'),extras=structuredClone(oldRoot?.getExtras()||{});
  const scene=doc.getRoot().getDefaultScene()||doc.getRoot().listScenes()[0];for(const child of [...scene.listChildren()])scene.removeChild(child);
  for(const a of [...doc.getRoot().listAnimations()])discardAnimation(a);
  for(const n of [...doc.getRoot().listNodes()])n.dispose();
  const prim=doc.createPrimitive().setMaterial(material).setAttribute('POSITION',acc(doc,'Baked boar idle','VEC3',new Float32Array(positions))).setAttribute('NORMAL',acc(doc,'Baked normals','VEC3',new Float32Array(normals))).setAttribute('TEXCOORD_0',acc(doc,'Shared atlas UV','VEC2',new Float32Array(uv))).setIndices(acc(doc,'Baked indices','SCALAR',new Uint32Array(indices)));
  const node=doc.createNode('asset_root').setMesh(doc.createMesh(id).addPrimitive(prim)).setExtras({...extras,lod:2,pose:'baked trot at 0',use:'under 80 CSS pixels tall'});scene.addChild(node);
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.28,error:.035,lockBorder:false}),dedup(),prune());
  repairSurfaceNormals(doc);await doc.transform(weld(),dedup(),prune());
  for(const [name,p]of Object.entries(extras.anchors||{}))node.addChild(doc.createNode('anchor_'+name).setTranslation(p));
  const triangles=prim.getIndices().getCount()/3;
  await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12}));await io.write(path.join(out,id+'-lod2.glb'),doc);
  report.push({id,triangles,bytes:(await fs.stat(path.join(out,id+'-lod2.glb'))).size});
}
await fs.writeFile(path.join(root,'verification/boar-static-lod.json'),JSON.stringify(report,null,2));console.log(report);
