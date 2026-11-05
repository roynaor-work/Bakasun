import {T} from './mesh.mjs';

/** CPU reconstruction for independent animation/grounding checks, no renderer. */
export function actorScene(doc){
  const source=doc.getRoot(),joints=new Set(source.listSkins().flatMap(s=>s.listJoints())),objects=new Map(),meshes=[];
  for(const n of source.listNodes()){
    const o=joints.has(n)?new T.Bone():new T.Object3D();o.name=n.getName();o.position.fromArray(n.getTranslation());o.quaternion.fromArray(n.getRotation());o.scale.fromArray(n.getScale());objects.set(n,o);
  }
  for(const n of source.listNodes())for(const child of n.listChildren())objects.get(n).add(objects.get(child));
  const root=new T.Group(),defaultScene=source.getDefaultScene()||source.listScenes()[0];for(const n of defaultScene.listChildren())root.add(objects.get(n));root.updateMatrixWorld(true);
  for(const n of source.listNodes())if(n.getMesh())for(const p of n.getMesh().listPrimitives()){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p.getAttribute('POSITION').getArray(),3));
    if(p.getAttribute('NORMAL'))g.setAttribute('normal',new T.Float32BufferAttribute(p.getAttribute('NORMAL').getArray(),3));
    let m;
    if(n.getSkin()){
      const skin=n.getSkin(),si=p.getAttribute('JOINTS_0'),sw=p.getAttribute('WEIGHTS_0'),weights=[];
      for(let i=0;i<sw.getCount();i++)weights.push(...sw.getElement(i,[]));
      g.setAttribute('skinIndex',new T.Uint16BufferAttribute(si.getArray(),4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
      m=new T.SkinnedMesh(g,new T.MeshBasicMaterial());
      objects.get(n).add(m);root.updateMatrixWorld(true);
      const inverse=skin.getInverseBindMatrices(),skeleton=new T.Skeleton(skin.listJoints().map(j=>objects.get(j)),skin.listJoints().map((j,i)=>new T.Matrix4().fromArray(inverse.getElement(i,[]))));
      m.bind(skeleton,new T.Matrix4());
    }else{m=new T.Mesh(g,new T.MeshBasicMaterial());objects.get(n).add(m);}
    meshes.push({mesh:m,primitive:p,node:n});
  }
  const clips=source.listAnimations().map(a=>new T.AnimationClip(a.getName(),-1,a.listChannels().map(c=>{
    const s=c.getSampler(),property={translation:'position',rotation:'quaternion',scale:'scale'}[c.getTargetPath()];
    const Track=c.getTargetPath()==='rotation'?T.QuaternionKeyframeTrack:T.VectorKeyframeTrack;
    return new Track(objects.get(c.getTargetNode()).name+'.'+property,s.getInput().getArray(),s.getOutput().getArray(),T.InterpolateLinear);
  })));
  const mixer=new T.AnimationMixer(root);
  const pose=(name,time)=>{mixer.stopAllAction();const clip=clips.find(c=>c.name===name);if(!clip)throw Error('No clip '+name);const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.reset().play();mixer.setTime(time);root.updateMatrixWorld(true);for(const {mesh}of meshes)if(mesh.isSkinnedMesh)mesh.skeleton.update();};
  return {root,objects,meshes,clips,mixer,pose};
}
