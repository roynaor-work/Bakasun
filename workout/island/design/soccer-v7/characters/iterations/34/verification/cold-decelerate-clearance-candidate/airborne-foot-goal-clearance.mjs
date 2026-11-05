/** Minimal vertical correction of an unplanted world-space sole goal.
 * Vertices are the bound exact Foot-local rigid-boot hull; padding is applied
 * after rotation. This function never changes phase, orientation, XZ or plants.
 */
export function airborneFootGoalClearance({mode,position,orientation,vertices,paddingMeters=.0005,minimumY=.001}){
  const before=position.slice();
  if(mode==='plant')return{mode,position:before,liftMeters:0,minimumBefore:null,minimumAfter:null,minimumY,excludedPlant:true};
  if(!vertices?.length)throw Error('A bound Foot-local boot hull is required');
  const norm=Math.hypot(...orientation);if(!Number.isFinite(norm)||norm<1e-12)throw Error('Invalid foot orientation');
  const[x,y,z,w]=orientation.map(v=>v/norm),r0=2*(x*y+z*w),r1=1-2*(x*x+z*z),r2=2*(y*z-x*w),ankleY=before[1]+r1*.08;
  let bound=Infinity;for(const p of vertices)bound=Math.min(bound,ankleY+r0*p[0]+r1*p[1]+r2*p[2]-paddingMeters);
  const lift=Math.max(0,minimumY-bound),after=before.slice();after[1]+=lift;
  return{mode,position:after,liftMeters:lift,minimumBefore:bound,minimumAfter:bound+lift,minimumY,excludedPlant:false};
}
