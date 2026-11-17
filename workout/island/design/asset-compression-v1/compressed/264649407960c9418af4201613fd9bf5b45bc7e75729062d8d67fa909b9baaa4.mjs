/** Basketball v24.1 natural locomotion (Codex hoops-motion-v13, CC0; runtime copy of the clips the game plays in
 * assets/hoops-v241/motion/motion-v13.json, the pack's own tall-v12 encoding). Roy: "upgraded players with the shared character, natural motion".
 *
 * What is connected, per existing action of the motion plan (hoops-tall chooseTallMotion), and why:
 *  - standing: idle_ready <- idle, idle_ready_ball <- idle_ball (breathing and weight shift; QA 96.6 / 97.0);
 *  - running: jog <- jog, run <- run, sprint <- sprint (world-anchored strides, counter arm swing, lean by speed; QA 90.4 / 91.3 / 89.2);
 *  - dribbling: run_ball / jog_ball <- dribble_run (ball track and floor bounce in step; QA 92.2), dribbling on the spot <- dribble_stand
 *    (full body, QA 95.4) in place of the v12 upper / lower layer;
 *  - shooting: jump_shot and three_point <- jump_shot (release, takeoff, land events; QA 96.4).
 *  Left on v12 on purpose: walk (the pack has none), the sideways slides and dribbles, crossovers, pivots, layups / dunks (one side only in
 *  the pack; the dunk is calibrated to the rim per body), free throws, blocks, steals, rebounds, passes (v8), reactions.
 *
 * Proportions ("the tall bodies need retargeting"): the pack is authored on the canonical profile (hips 0.86 m). The game's bodies are that
 * very rig scaled uniformly (athlete-body-v22 / -v2 BodyScale x the player's height: guard 1.09, wing 1.14, centre 1.20), so the rotations
 * play unchanged and the hips offsets keep canonical metres (motionScale 1, not the tall packs' leg ratio); what changes is the stride: each
 * gait's reference speed is the pack's x the body's scale, so the feet stay planted at the engine's speed (`hoopsV13Gaits`).
 * Phase: the gait clips share one phase (a switch between jog and run keeps the foot). The packs do not agree on where the left foot lands
 * (v12 jog 0.33 of the cycle, walk 0.53, sprint 0.09; v13 jog 0.23, run 0.91, sprint 0), so every gait that shares the phase is turned (a
 * cyclic shift of whole frames) to put the left sole's lowest point at 0.33. `?hoopsMotionV13=0` restores v12 everywhere (v24). */
import {CANON_REST} from './athlete-body.mjs';

export const V13_FILE='motion-v13.json';
export const v13Url=()=>new URL('../assets/hoops-v241/motion/'+V13_FILE,import.meta.url).href;
/** Game clip name -> v13 clip id. */
export const V13_USE=Object.freeze({idle_ready:'idle',idle_ready_ball:'idle_ball',jog:'jog',run:'run',sprint:'sprint',jog_ball:'dribble_run',run_ball:'dribble_run',dribble_stand:'dribble_stand',jump_shot:'jump_shot',three_point:'jump_shot'});
export const V13_CLIPS=Object.freeze([...new Set(Object.values(V13_USE))]);
/** Game clips that share the gait phase with the v13 gaits and stay on v12 (turned to the same footfall). */
export const V13_SHARED_V12=Object.freeze(['walk','sprint_ball']);
export const GAIT_FOOTFALL=.33;
export const V13_MAX_RATE=1.8;

// ---- forward kinematics on the canonical rig (pure) ------------------------------------------------------------------------------------
const BONES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rot=(q,v)=>{const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];};
const PARENT=Object.fromEntries(CANON_REST.map(b=>[b.name,b.parent])),REST=Object.fromEntries(CANON_REST.map(b=>[b.name,b.restTranslationMeters]));
/** World joints and rotations of frame `f` of a decoded clip (tall-pack shape: quat Float32Array, hips offsets), hips offset x `hipsScale`. */
export function canonicalPose(clip,f,hipsScale=1){
  const world={},wq={};
  BONES.forEach((name,bi)=>{
    const o=(f*BONES.length+bi)*4,q=[clip.quat[o],clip.quat[o+1],clip.quat[o+2],clip.quat[o+3]],p=PARENT[name];
    let local=REST[name];if(name==='Hips')local=[local[0]+clip.hips[f*3]*hipsScale,local[1]+clip.hips[f*3+1]*hipsScale,local[2]+clip.hips[f*3+2]*hipsScale];
    if(!p){world[name]=local;wq[name]=q;return;}
    const r=rot(wq[p],local);world[name]=[world[p][0]+r[0],world[p][1]+r[1],world[p][2]+r[2]];wq[name]=qmul(wq[p],q);
  });
  return {world,wq};
}
/** The sole point the QA tool measures: 8 cm below the ankle along the foot bone. */
export function solePoint(pose,side){const o=rot(pose.wq[side+'Foot'],[0,-.08,0]),a=pose.world[side+'Foot'];return [a[0]+o[0],a[1]+o[1],a[2]+o[2]];}
/** Phase (0..1) of the left sole's lowest point over a looped clip, and the soles' height range (canonical metres; floor 0). */
export function footfall(clip,hipsScale=1){
  const n=clip.loop?clip.frames-1:clip.frames,left=[],right=[];
  for(let f=0;f<n;f++){const p=canonicalPose(clip,f,hipsScale);left.push(solePoint(p,'Left')[1]);right.push(solePoint(p,'Right')[1]);}
  let k=0;left.forEach((y,i)=>{if(y<left[k])k=i;});
  return {phase:k/n,frames:n,min:Math.min(...left,...right),max:Math.max(...left,...right)};
}
/** A looped clip turned by whole frames so that its phase `dPhase` later becomes phase 0 (frame f of the result = frame f+k of the source);
 * the duplicated end frame of the loop is rebuilt, events move with the frames. Non-looped clips are returned as they are. Pure. */
export function shiftLoop(clip,dPhase,fps=30){
  if(!clip.loop)return clip;
  const n=clip.frames-1,k=((Math.round(dPhase*n)%n)+n)%n;if(!k)return clip;
  const B=BONES.length,quat=new Float32Array(clip.quat.length),hips=new Float32Array(clip.hips.length),ball=clip.ball?new Float32Array(clip.ball.length):null;
  for(let f=0;f<=n;f++){const src=(f+k)%n;quat.set(clip.quat.subarray(src*B*4,src*B*4+B*4),f*B*4);hips.set(clip.hips.subarray(src*3,src*3+3),f*3);if(ball)ball.set(clip.ball.subarray(src*3,src*3+3),f*3);}
  const d=clip.duration,shift=k/fps,events={};
  // the loop's two ends (0 and the duration) are one moment: they land on the same time and are kept once
  for(const [name,times] of Object.entries(clip.events||{}))events[name]=[...new Set(times.map(t=>+(((t-shift)%d+d)%d).toFixed(4)))].sort((a,b)=>a-b);
  return {...clip,quat,hips,ball,events,phaseShift:+(k/n).toFixed(4)};
}
/** Turn a gait so its left footfall lands on `target` (GAIT_FOOTFALL). Returns the turned clip with `footfall` (before / after). */
export function alignGait(clip,target=GAIT_FOOTFALL,hipsScale=1){
  const before=footfall(clip,hipsScale).phase,out=shiftLoop(clip,before-target),after=footfall(out,hipsScale).phase;
  return {...out,footfall:{before:+before.toFixed(3),after:+after.toFixed(3)}};
}

// ---- the plan's gait tables per body ---------------------------------------------------------------------------------------------------
/** Gait tables for chooseTallMotion (`ctx.gaits13`) on a body whose skeleton is `scale` x the canonical rig: [{name, ref (m/s, the speed the
 * clip's stride covers at rate 1 on this body), max (playback rate cap)}]. walk and sprint_ball stay v12 with their v12 references. Pure. */
export function hoopsV13Gaits(pack,scale,v12){
  const ref=id=>+(pack.clips[V13_USE[id]].refSpeed*scale).toFixed(3);
  return {
    refScale:+scale.toFixed(4),stand:'dribble_stand',maxRate:V13_MAX_RATE,
    gaits:[{name:'idle_ready',ref:0},{name:'walk',ref:v12.walk?.refSpeed||1.345,max:1.45*(v12.walk?.timeScale||1)},{name:'jog',ref:ref('jog'),max:V13_MAX_RATE},{name:'run',ref:ref('run'),max:V13_MAX_RATE},{name:'sprint',ref:ref('sprint'),max:V13_MAX_RATE}],
    // dribbling: the v12 walk below, the v13 run dribble, the v12 sprint dribble above about 4 m/s (its picking reference is the v12 table's 6.8)
    dribble:[{name:'dribble_walk_right',ref:v12.dribble_walk_right?.refSpeed||1.2,max:1.45},{name:'run_ball',ref:ref('run_ball'),max:V13_MAX_RATE},{name:'sprint_ball',ref:6.8,rate:v12.sprint_ball?.refSpeed||3.346,max:1.45*(v12.sprint_ball?.timeScale||1)}],
  };
}
/** Skeleton scale of a v22 / v2 instance root (its BodyScale node x the root's own scale) relative to the canonical rig. */
export function bodySkeletonScale(root){let s=1;root.traverse(o=>{if(o.name==='BodyScale')s=o.scale.x;});return s*root.scale.y;}

// ---- loading ---------------------------------------------------------------------------------------------------------------------------
/** The v13 clips the game uses (decoded with `decode`, the tall-pack decoder), the gaits turned to the shared footfall. Returns
 * {pack (canonical profile, only the used clips, keyed by v13 id), byGame: Map(game name -> clip data renamed), aligned: {id: footfall}}.
 * Throws on a pack without the canonical profile or a used clip (the caller keeps v12). */
export function prepareV13(json,decode){
  const pack=decode(json);
  if(!pack.profiles?.canonical||Math.abs(pack.profiles.canonical.hips[1]-.86)>1e-6)throw Error('Basketball v13 motion: not the canonical profile');
  for(const id of V13_CLIPS)if(!pack.clips[id])throw Error('Basketball v13 clip missing: '+id);
  const aligned={};
  for(const id of ['jog','run','sprint','dribble_run']){const a=alignGait(pack.clips[id]);aligned[id]=a.footfall;pack.clips[id]={...a,id};}
  const byGame=new Map();
  for(const [game,id] of Object.entries(V13_USE))byGame.set(game,{...pack.clips[id],id:game,v13:id,canonical:true});
  return {pack,byGame,aligned};
}
/** The v12 clips that share the gait phase, turned to the same footfall (v12 hips offsets are on the tall profile: `hipsScale` converts). */
export function alignSharedV12(pack,hipsScale){
  const out={};
  for(const id of V13_SHARED_V12)if(pack.clips[id]?.loop){const a=alignGait(pack.clips[id],GAIT_FOOTFALL,hipsScale);out[id]=a.footfall;pack.clips[id]={...a,id};}
  return out;
}
