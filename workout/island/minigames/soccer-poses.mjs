/** Two-bone arm targets are the same chest/ball coordinates as the simulation. */
export function holdSoccerBall(T,character,player,config){
 const k=config.goalkeeping,bones=character.bones;
 const aim=(bone,child,world)=>{
  const from=bone.getWorldPosition(new T.Vector3()),parent=bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
  const wanted=world.clone().sub(from).normalize().applyQuaternion(parent);
  bone.quaternion.setFromUnitVectors(child.position.clone().normalize(),wanted);bone.updateWorldMatrix(false,true);
 };
 character.pivot.updateWorldMatrix(true,true);
 for(const [side,sign]of [['L',1],['R',-1]]){
  const upper=bones['UpperArm_'+side].bone,lower=bones['LowerArm_'+side].bone,hand=bones['Hand_'+side].bone;
  const shoulder=upper.getWorldPosition(new T.Vector3()),elbow=lower.getWorldPosition(new T.Vector3()),palm=hand.getWorldPosition(new T.Vector3());
  const target=new T.Vector3(player.x+player.fx*k.holdForward-player.fz*sign*config.physics.ballRadius,k.holdHeight,player.z+player.fz*k.holdForward+player.fx*sign*config.physics.ballRadius);
  const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(palm),v=target.clone().sub(shoulder),length=Math.min(v.length(),a+b-1e-5);v.normalize();
  const along=(a*a-b*b+length*length)/(2*length),height=Math.sqrt(Math.max(0,a*a-along*along));
  const bend=new T.Vector3(-player.fz*sign,-1,player.fx*sign);bend.addScaledVector(v,-bend.dot(v)).normalize();
  const hinge=shoulder.clone().addScaledVector(v,along).addScaledVector(bend,height);
  aim(upper,lower,hinge);aim(lower,hand,target);
 }
}
