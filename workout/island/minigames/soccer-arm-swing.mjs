/** Procedural upper-body layer for the authored soccer locomotion clips.
 * The mocap run clips keep the elbows half open and swing the hands about 30 cm,
 * which reads as a robot on a phone screen. This layer adds, in model space
 * (+Y up, +Z forward, +X anatomical left) and after the mixer:
 * - shoulders swinging in counter-phase to the legs, more at sprint;
 * - elbows closing toward 90 degrees, tighter at sprint;
 * - hands pulled toward the body, never spread like the rest pose;
 * - a small counter-rotation of the spine and chest with the shoulders.
 * Presentation only: no simulation state is read or written. Pure (unit-tested). */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const ARM_SWING_ORDER=['Spine','Chest','LeftShoulder','RightShoulder','LeftArm','RightArm','LeftForeArm','RightForeArm'];
/** Tuning in radians. `swing`: shoulder fore/aft at full speed; `sprintSwing`: added at sprint.
 * `elbow`: extra elbow flexion; `elbowFront`: more flexion while the hand is in front.
 * `tuck`: hands toward the body; `twist`: chest counter-rotation. */
export const ARM_SWING_DEFAULTS=Object.freeze({swing:.42,sprintSwing:.18,elbow:.34,sprintElbow:.2,elbowFront:.2,tuck:.1,sprintTuck:.1,twist:.07,sprintTwist:.05,carryScale:.8});
/** phase: 0..1 locomotion cycle where the LEFT foot is forward at 0 (the authored run
 * and dribble_run clips both start there); speed01: 0 still .. 1 full run; sprint01: 0..1;
 * carrying: 0..1 (a dribbler keeps the arms lower and quieter).
 * Returns model-space Euler deltas [x,y,z] per bone (YXZ order). */
export function armSwingPose(phase,speed01,sprint01,carrying=0,k=ARM_SWING_DEFAULTS,out={}){
  const s=clamp(speed01,0,1),q=clamp(sprint01,0,1),carry=clamp(Number(carrying)||0,0,1),scale=(1-(1-k.carryScale)*carry)*s;
  // The left hand is behind when the left foot is in front.
  const leftForward=-Math.cos(2*Math.PI*phase),rightForward=-leftForward;
  const swing=(k.swing+k.sprintSwing*q)*scale,elbow=(k.elbow+k.sprintElbow*q)*scale,front=k.elbowFront*scale,tuck=(k.tuck+k.sprintTuck*q)*scale,twist=(k.twist+k.sprintTwist*q)*scale;
  const set=(name,x,y,z)=>{const a=out[name]||(out[name]=[0,0,0]);a[0]=x;a[1]=y;a[2]=z;};
  // Shoulders: forward swing is a negative rotation about +X.
  set('LeftArm',-swing*leftForward,0,-tuck);
  set('RightArm',-swing*rightForward,0,tuck);
  // Elbows close (negative X) and close more when the hand is in front.
  set('LeftForeArm',-(elbow+front*Math.max(0,leftForward)),0,0);
  set('RightForeArm',-(elbow+front*Math.max(0,rightForward)),0,0);
  // Chest turns with the forward shoulder: left shoulder forward is a negative turn about +Y.
  set('Spine',0,-twist*.4*leftForward,0);
  set('Chest',0,-twist*.6*leftForward,0);
  set('LeftShoulder',0,-twist*.3*leftForward,0);
  set('RightShoulder',0,-twist*.3*leftForward,0);
  return out;
}
/** Rotate bones by model-space deltas: local' = parent^-1 * delta * parent * local.
 * `frame` is the model root (its world quaternion defines model space). Allocation free after warm-up. */
export function createArmSwingApplier(T,root,boneByName){
  const qFrame=new T.Quaternion(),qParent=new T.Quaternion(),qWork=new T.Quaternion(),qDelta=new T.Quaternion(),euler=new T.Euler(0,0,0,'YXZ');
  const bones=ARM_SWING_ORDER.map(name=>boneByName[name]).filter(Boolean);
  return function apply(deltas,weight){
    if(weight<1e-3||!bones.length)return false;
    root.updateWorldMatrix(true,false);root.getWorldQuaternion(qFrame);
    for(const bone of bones){
      const d=deltas[bone.name];if(!d||!bone.parent)continue;
      bone.parent.updateWorldMatrix(true,false);bone.parent.getWorldQuaternion(qParent);
      qParent.premultiply(qWork.copy(qFrame).invert());
      euler.set(d[0]*weight,d[1]*weight,d[2]*weight,'YXZ');qDelta.setFromEuler(euler);
      qWork.copy(qParent).invert().multiply(qDelta).multiply(qParent);
      bone.quaternion.premultiply(qWork);
    }
    return true;
  };
}
/** Smooth layer weight and cycle bookkeeping (pure). Locomotion states carry the
 * clip's own phase; other states keep the last phase advancing at the run cadence. */
export function armSwingState(state,dt,{locomotion,clipPhase,speed01,sprint01,carrying,ease=.1,easeOut=.06}){
  if(locomotion&&Number.isFinite(clipPhase))state.phase=clipPhase;else state.phase=(state.phase+dt/.72)%1;
  const target=locomotion?clamp(speed01,0,1):0,k=dt>0?1-Math.exp(-dt/(target<state.weight?easeOut:ease)):1;
  state.weight+=(target-state.weight)*k;if(state.weight<1e-3&&!target)state.weight=0;
  state.sprint+=(clamp(sprint01,0,1)-state.sprint)*k;
  state.carry+=((carrying?1:0)-state.carry)*k;
  return state;
}
