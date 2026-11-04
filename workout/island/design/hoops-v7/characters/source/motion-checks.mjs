/** Browser/Node-independent continuity measurements of the displayed ball. */
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function velocity(points,k,h,side){
  return points[k].map((v,i)=>side<0?(3*v-4*points[k-1][i]+points[k-2][i])/(2*h):(-3*v+4*points[k+1][i]-points[k+2][i])/(2*h));
}
function boundary(points,index,h){
  if(index<2||index+2>=points.length)return null;
  const incoming=velocity(points,index,h,-1),outgoing=velocity(points,index,h,1);
  return {index,position:points[index],incomingVelocityMetersPerSecond:incoming,outgoingVelocityMetersPerSecond:outgoing,velocityResidualMetersPerSecond:distance(incoming,outgoing),
    derivative:'Independent second-order one-sided finite differences; 3samples on each side share only the boundary position.',stepSeconds:h};
}

/**
 * Uses the actual controller output after IK/contact/ground corrections.
 * The selected boundaries are upper gathers, never a legitimate floor bounce.
 * interruptAtSeconds is measured from the actual blend start, after catch wait.
 */
export function checkControllerContinuity(controller,{source='dribble_right',target='idle_hold',phase=.08,stepSeconds=.001,interruptAtSeconds=null}={}){
  const h=stepSeconds,points=[],states=[];
  const record=()=>{const d=controller.getDiagnostics();points.push([...d.ballPosition]);states.push(d);return d;};
  controller.setAction(source,{immediate:true});controller.seek(phase);record();
  for(let k=0;k<4;k++){controller.update(h);record();}
  const requestedPosition=points.at(-1);controller.setAction(target);
  const requestC0Meters=distance(requestedPosition,controller.getDiagnostics().ballPosition);
  let begin=null,end=null,interrupted=null,interruptC0Meters=null,blendAge=0,previous=states.at(-1);
  for(let k=0;k<Math.ceil(4/h);k++){
    controller.update(h);const d=record(),index=points.length-1;
    const wasBlend=previous.transition&&Number.isFinite(previous.transition.progress),isBlend=d.transition&&Number.isFinite(d.transition.progress);
    if(begin===null&&isBlend){begin=index-1;blendAge=h;}else if(begin!==null&&isBlend)blendAge+=h;
    if(begin!==null&&!isBlend&&wasBlend&&end===null)end=index;
    if(interruptAtSeconds!==null&&begin!==null&&interrupted===null&&blendAge+1e-9>=interruptAtSeconds){
      interrupted=index;const p=[...d.ballPosition];controller.setAction('dribble_left');interruptC0Meters=distance(p,controller.getDiagnostics().ballPosition);
    }
    previous=d;
    if(interrupted!==null&&index>=interrupted+3)break;
    if(interruptAtSeconds===null&&end!==null&&index>=end+3)break;
  }
  const checks={begin:begin===null?null:boundary(points,begin,h),end:interruptAtSeconds===null&&end!==null?boundary(points,end,h):null,interrupt:interrupted===null?null:boundary(points,interrupted,h)};
  const available=Object.values(checks).filter(Boolean);
  return {source,target,requestedPhase:phase,interruptAtSeconds,requestC0Meters,interruptC0Meters,completed:end!==null,
    boundaries:checks,maxVelocityResidualMetersPerSecond:available.length?Math.max(...available.map(c=>c.velocityResidualMetersPerSecond)):null,
    minBoundaryBallY:available.length?Math.min(...available.map(c=>c.position[1])):null,
    measured:checks.begin!==null&&(interruptAtSeconds===null?checks.end!==null:checks.interrupt!==null)};
}
