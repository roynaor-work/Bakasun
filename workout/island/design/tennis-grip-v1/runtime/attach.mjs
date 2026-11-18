// SPDX-License-Identifier: CC0-1.0
// Helper for a separately loaded, unit-scale racket.glb and a canonical body.
// Supply the same THREE namespace used by the host. No runtime IK or Euler offset.
export function attachRacket(THREE,hand,racket,poseMask){
 if(hand?.name!=='RightHand')throw new Error('Expected canonical RightHand; retarget noncanonical bodies first.');
 if(racket.parent)throw new Error('Attach a fresh racket scene, or remove it from its old parent first.');
 const grip=racket.getObjectByName(poseMask.racketGripNode);
 if(!grip)throw new Error('Missing racket grip node.');
 racket.updateMatrixWorld(true);
 const gripLocal=new THREE.Matrix4().copy(racket.matrixWorld).invert().multiply(grip.matrixWorld);
 const socket=new THREE.Matrix4().compose(new THREE.Vector3(...poseMask.socketAtTopOfHandle.translation),new THREE.Quaternion(...poseMask.socketAtTopOfHandle.rotation),new THREE.Vector3(1,1,1));
 const attachment=socket.multiply(gripLocal.invert());
 attachment.decompose(racket.position,racket.quaternion,racket.scale);
 hand.add(racket);racket.updateMatrixWorld(true);return racket;
}
