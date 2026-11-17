import * as T from '../vendor/three.module.js';

/** Clone the bones with the scene. Object3D.clone alone keeps the source skin's
 * skeleton, so posing a cloned firefighter would move the wrong character. */
export function cloneFireCharacter(source){
  const root=source.clone(true),copies=new Map();
  function map(a,b){copies.set(a,b);for(let i=0;i<a.children.length;i++)map(a.children[i],b.children[i]);}map(source,root);
  source.traverse(original=>{if(!original.isSkinnedMesh)return;const mesh=copies.get(original);mesh.skeleton=original.skeleton.clone();mesh.skeleton.bones=original.skeleton.bones.map(b=>copies.get(b));mesh.bind(mesh.skeleton,original.bindMatrix);});
  return root;
}
/** Working hands share the exact hose/stream origin. The supplied walking clip
 * animates the short exit from the cab; driving keeps this figure inside it. */
export function createFireCrewRig(root,clips,grip){
  const mixer=new T.AnimationMixer(root),clip=clips?.find(c=>/walking/i.test(c.name)),walk=clip?mixer.clipAction(clip):null,bones=new Map(),skeletons=new Set();
  root.traverse(o=>{if(o.isBone)bones.set(o.name.replace(/[^a-z]/gi,'').toLowerCase(),o);if(o.skeleton)skeletons.add(o.skeleton);});
  const bone=name=>[...bones].find(([key])=>key.endsWith(name.toLowerCase()))?.[1];
  const point=new T.Vector3(),axis=new T.Vector3(),origin=new T.Vector3(),rotation=new T.Quaternion();let walking=false;
  function orient(node,child,target){if(!node||!child)return;node.getWorldPosition(origin);node.parent.getWorldQuaternion(rotation).invert();point.copy(target).sub(origin).applyQuaternion(rotation).normalize();axis.copy(child.position).normalize();node.quaternion.setFromUnitVectors(axis,point);node.updateWorldMatrix(false,true);}
  const elbow=new T.Vector3(),hand=new T.Vector3();
  return {
    update(dt,exiting){
      if(exiting&&walk){if(!walking){walk.reset().play();walking=true;}mixer.update(dt);return;}
      if(walking){walk?.stop();walking=false;}for(const skeleton of skeletons)skeleton.pose();root.updateMatrixWorld(true);
      for(const [side,sign]of [['Left',-1],['Right',1]]){
        elbow.set(sign*grip.elbowX,grip.elbowY,grip.elbowZ);hand.set(sign*grip.handX,grip.handY,grip.handZ);root.localToWorld(elbow);root.localToWorld(hand);
        const arm=bone(side+'Arm'),forearm=bone(side+'ForeArm'),palm=bone(side+'Hand');orient(arm,forearm,elbow);orient(forearm,palm,hand);
      }
    },
    hand(out){const palm=bone('RightHand');if(!palm)return false;palm.getWorldPosition(out);return true;},
    dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);}
  };
}
