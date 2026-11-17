/** SkeletonUtils-style clone: share geometry/materials, remap every bone to the
 * corresponding cloned node. Each player owns its skeleton and animation mixer. */
export function playerSoccerClip(clip){
  // The ball has its own physics mesh and is removed from each cloned player.
  // Strip only its tracks; the source asset and the player's tracks stay intact.
  const result=clip.clone();result.tracks=result.tracks.filter(track=>!/^Ball\./.test(track.name));return result;
}
export function cloneSoccerRig(source){
  const clone=source.clone(true),originals=[],copies=[],map=new Map(),skeletons=new Map();
  source.traverse(node=>originals.push(node));clone.traverse(node=>copies.push(node));
  originals.forEach((node,i)=>map.set(node,copies[i]));
  clone.traverse(node=>{if(!node.isSkinnedMesh)return;const original=originals[copies.indexOf(node)];
    // Meshes that share one source skin (skin + kit, both LOD levels) share one cloned skeleton:
    // one bone-matrix update and one bone texture per player per frame instead of one per mesh.
    let skeleton=skeletons.get(original.skeleton);
    if(!skeleton){skeleton=original.skeleton.clone();skeleton.bones=original.skeleton.bones.map(bone=>{const copy=map.get(bone);if(!copy)throw Error('Soccer bone outside cloned rig');return copy;});skeletons.set(original.skeleton,skeleton);}
    node.bindMatrix.copy(original.bindMatrix);
    node.bind(skeleton,node.bindMatrix);
  });return clone;
}
