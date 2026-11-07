/** Soccer motion v9 (07/11/2026, Roy's phone test of island-v2-20261107-1): natural arms when the player
 * is not running, and a slide that gets up quickly and carries on running. Presentation only: the
 * simulation clocks are read, never written (the one sim change is the recovery cap in soccer-control-depth).
 * `?soccerMotion=0` restores the previous look. Pure and unit-tested. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const soccerMotionV9Enabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('soccerMotion')!=='0';

/** The authored stand, turn, slow and ready clips hold the arms 35 to 57 degrees out from the body with the
 * elbows almost straight, which reads as a T-pose on a phone. Model-space deltas (radians) that bring
 * the upper arm to about 12 degrees and the elbow to about 40 degrees. `abd` negative = toward the body
 * for the left arm (mirrored for the right); `flex` = extra elbow flexion. */
export const ARM_STAND_DELTAS=Object.freeze({
  idle:{abd:-.4,flex:.52,fwd:-.06},decelerate:{abd:-.4,flex:.52,fwd:-.06},turn_left:{abd:-.42,flex:.52,fwd:-.06},turn_right:{abd:-.42,flex:.52,fwd:-.06},
  defensive_jockey:{abd:-.5,flex:.3,fwd:-.1},kick_charge:{abd:-.2,flex:.1,fwd:0}
});
export const armStandWeight=(state)=>ARM_STAND_DELTAS[state]?1:0;
/** `breath` 0..1 is the idle cycle phase: the hands drift a few degrees so a standing player is not frozen. */
export function armStandPose(state,breath=0,weightScale=1,out={}){
  const d=ARM_STAND_DELTAS[state]||ARM_STAND_DELTAS.idle,sway=Math.sin(2*Math.PI*breath)*.025,set=(name,x,y,z)=>{const a=out[name]||(out[name]=[0,0,0]);a[0]=x;a[1]=y;a[2]=z;};
  set('LeftArm',(d.fwd+sway)*weightScale,0,d.abd*weightScale);set('RightArm',(d.fwd-sway)*weightScale,0,-d.abd*weightScale);
  set('LeftForeArm',-d.flex*weightScale,0,0);set('RightForeArm',-d.flex*weightScale,0,0);
  return out;
}
/** Smooth weight of the stand layer toward 1 in a standing state and 0 otherwise. */
export function armStandState(layer,dt,target,ease=.12,easeOut=.08){
  const k=dt>0?1-Math.exp(-dt/(target<layer.weight?easeOut:ease)):1;layer.weight+=(target-layer.weight)*k;if(layer.weight<1e-3&&!target)layer.weight=0;layer.breath=((layer.breath||0)+dt/1.8)%1;return layer;
}

/** Composite slide clip time for recovery progress u (0 = just stopped sliding, 1 = control returns).
 * The authored fall has a long lying plateau and the getting-up clip needs 1.2 s, far more than the
 * simulated 0.6 s recovery. The recovery plays the fall quickly, then the rise at about two times,
 * and ends nearly upright (hips about 0.8 m) so the first step blends into the run with no pop.
 * `parts` = the composite's [slide, fall (or miss), getting up] clips; missing parts return null (old timeline). */
export function slideRecoverTime(parts,recoverSeconds,u,{upright=.78,fallMaxSpeed=3}={}){
  if(!parts||parts.length<3)return null;
  const [slide,fall,rise]=parts,rec=Math.max(.05,recoverSeconds),fallShare=clamp(fall.durationSeconds/(fallMaxSpeed*rec),.15,.45),tEnd=rise.start+rise.durationSeconds*upright,tFall=rise.start;
  const x=clamp(u,0,1);
  return x<=fallShare?slide.start+slide.durationSeconds+(tFall-(slide.start+slide.durationSeconds))*(x/fallShare):tFall+(tEnd-tFall)*((x-fallShare)/(1-fallShare));
}
