/** Two-bone arm targets are the same chest/ball coordinates as the simulation. */
let S=null; // scratch vectors/quaternions, created once (no per-frame allocation while a keeper holds the ball)
export function holdSoccerBall(T,character,player,config){
 const k=config.goalkeeping,bones=character.bones;
 if(!S)S={from:new T.Vector3(),parent:new T.Quaternion(),wanted:new T.Vector3(),child:new T.Vector3(),shoulder:new T.Vector3(),elbow:new T.Vector3(),palm:new T.Vector3(),target:new T.Vector3(),v:new T.Vector3(),bend:new T.Vector3(),hinge:new T.Vector3()};
 const aim=(bone,child,world)=>{
  bone.getWorldPosition(S.from);bone.parent.getWorldQuaternion(S.parent).invert();
  S.wanted.copy(world).sub(S.from).normalize().applyQuaternion(S.parent);
  bone.quaternion.setFromUnitVectors(S.child.copy(child.position).normalize(),S.wanted);bone.updateWorldMatrix(false,true);
 };
 character.pivot.updateWorldMatrix(true,true);
 for(let i=0;i<2;i++){
  const side=i?'R':'L',sign=i?-1:1;
  const upper=bones['UpperArm_'+side].bone,lower=bones['LowerArm_'+side].bone,hand=bones['Hand_'+side].bone;
  const shoulder=upper.getWorldPosition(S.shoulder),elbow=lower.getWorldPosition(S.elbow),palm=hand.getWorldPosition(S.palm);
  const target=S.target.set(player.x+player.fx*k.holdForward-player.fz*sign*config.physics.ballRadius,k.holdHeight,player.z+player.fz*k.holdForward+player.fx*sign*config.physics.ballRadius);
  const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(palm),v=S.v.copy(target).sub(shoulder),length=Math.min(v.length(),a+b-1e-5);v.normalize();
  const along=(a*a-b*b+length*length)/(2*length),height=Math.sqrt(Math.max(0,a*a-along*along));
  const bend=S.bend.set(-player.fz*sign,-1,player.fx*sign);bend.addScaledVector(v,-bend.dot(v)).normalize();
  const hinge=S.hinge.copy(shoulder).addScaledVector(v,along).addScaledVector(bend,height);
  aim(upper,lower,hinge);aim(lower,hand,target);
 }
}
