/** SkeletonUtils-style clone: share geometry/materials, remap every bone to the
 * corresponding cloned node. Each player owns its skeleton and animation mixer. */
export function cloneSoccerRig(source){
  const clone=source.clone(true),originals=[],copies=[],map=new Map();
  source.traverse(node=>originals.push(node));clone.traverse(node=>copies.push(node));
  originals.forEach((node,i)=>map.set(node,copies[i]));
  clone.traverse(node=>{if(!node.isSkinnedMesh)return;const original=originals[copies.indexOf(node)];
    node.skeleton=original.skeleton.clone();node.bindMatrix.copy(original.bindMatrix);
    node.skeleton.bones=original.skeleton.bones.map(bone=>{const copy=map.get(bone);if(!copy)throw Error('Soccer bone outside cloned rig');return copy;});
    node.bind(node.skeleton,node.bindMatrix);
  });return clone;
}
