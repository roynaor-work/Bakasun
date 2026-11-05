import {io,fs,path,out,root,T,acc,discardAnimation,prune} from './mesh.mjs';
import {actorScene} from './pose.mjs';
import {createHash} from 'node:crypto';
const argv=process.argv.slice(2),destination=argv.includes('--out')?argv[argv.indexOf('--out')+1]:'/tmp/defense-v7-studio-input';await fs.mkdir(destination,{recursive:true});
const ids=argv.includes('--all')?(await fs.readdir(out)).filter(n=>n.endsWith('.glb')).map(n=>n.slice(0,-4)):['alien-scout','alien-manta','alien-beetle','alien-carrier','alien-harvester','alien-boss','defender-plane','boar-amber','boar-ash','boar-striped','guard-ranger','guard-lookout','guard-keeper','alarm-bell'];
const provenance=[];
for(const id of ids){
 const doc=await io.read(path.join(out,id+'.glb'));doc.getRoot().listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression')?.dispose();
 if(!argv.includes('--all')&&/^guard-(ranger|lookout|keeper)$/.test(id)){
  const actor=actorScene(doc);actor.pose('idle',0);const v=new T.Vector3(),n=new T.Vector3(),weighted=new T.Vector3(),matrix=new T.Matrix4();
  for(const {mesh,primitive,node}of actor.meshes){const p=[],norm=[],g=mesh.geometry;
   for(let i=0;i<g.attributes.position.count;i++){
    mesh.getVertexPosition(i,v);p.push(...v.toArray());n.fromBufferAttribute(g.attributes.normal,i);weighted.set(0,0,0);
    for(let j=0;j<4;j++){const weight=g.attributes.skinWeight.getComponent(i,j);if(weight){matrix.fromArray(mesh.skeleton.boneMatrices,g.attributes.skinIndex.getComponent(i,j)*16);weighted.addScaledVector(v.copy(n).transformDirection(matrix),weight);}}
    norm.push(...weighted.normalize().toArray());
   }
   primitive.setAttribute('POSITION',acc(doc,'Studio idle pose','VEC3',new Float32Array(p))).setAttribute('NORMAL',acc(doc,'Studio normals','VEC3',new Float32Array(norm))).setAttribute('JOINTS_0',null).setAttribute('WEIGHTS_0',null);node.setSkin(null);
  }
  for(const a of [...doc.getRoot().listAnimations()])discardAnimation(a);for(const s of [...doc.getRoot().listSkins()])s.dispose();
  const bone=doc.getRoot().listNodes().find(n=>n.getName()==='Root');if(bone)(doc.getRoot().getDefaultScene()||doc.getRoot().listScenes()[0]).removeChild(bone);
  await doc.transform(prune());
 }
 await io.write(path.join(destination,id+'.glb'),doc);
 provenance.push({id,file:'models/'+id+'.glb',sourceSHA256:createHash('sha256').update(await fs.readFile(path.join(out,id+'.glb'))).digest('hex'),decodedSHA256:createHash('sha256').update(await fs.readFile(path.join(destination,id+'.glb'))).digest('hex'),pose:!argv.includes('--all')&&/^guard-(ranger|lookout|keeper)$/.test(id)?'CPU-baked idle at 0 seconds':'default node pose'});
}
if(!argv.includes('--all'))await fs.writeFile(path.join(root,'verification/studio-source.json'),JSON.stringify({generatedUTC:new Date().toISOString(),method:'Final Draco GLB decoded; humanoid guards baked to idle(0). No geometry is rebuilt for the studio.',files:provenance},null,2));
console.log(destination);
