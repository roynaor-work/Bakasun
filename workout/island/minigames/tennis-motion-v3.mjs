/** Tennis motion v3 (Codex library design/tennis-motion-v3, CC0; runtime copy assets/tennis-motion-v3/core.json, built by tools/tennis-motion-v3-core.mjs).
 * Pose data only on the canonical 18-bone skeleton of tennis-motion-v1: no mesh, no skin, no texture, so it adds no triangles and no draw calls.
 * It adds the moments v1 had no clip for, chosen from what the game already knows (nothing here changes the rules, the ball or the timing):
 *  - strokes: lob, drop (the defensive slice), a high ball (the overhead), volleys near the net by contact height (half volley, low, high),
 *    a wide ball (the slide) and the return of serve; the clip's contact frame lands on the game's contact instant, as in v1;
 *  - running to the racket-hand side (v1's run_right was blocked): the crossover run, mirrored;
 *  - after the point: the winner's and the loser's reaction (legs and both arms: no stroke is in play then, so the arms are free).
 * As in v1 the legs follow the clip and the racket arm stays with the contact IK during a stroke, so a failure here cannot miss a ball.
 * New in v3: the clip's hip height is applied too (a crouch lowers the body instead of lifting the feet off the court).
 * ?tennisMotionV3=0 (or ?tennisMotionV1=0, or any load error) keeps v24.9 exactly. */
import {sampleClip,jointWorld} from './tennis-motion.mjs?v=island-v2-20261107-24';
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function tennisMotionV3Enabled(search=globalThis.location?.search||''){return param('tennisMotionV3',search)!=='0'&&param('tennisMotionV1',search)!=='0';}
export const V3_CLIPS=Object.freeze(['volley_low','volley_high','half_volley','lob','overhead_backward','serve_return_aggressive','defensive_slice','lateral_crossover_run','slide_to_ball','point_win','childlike_joy','point_disappointment']);
/** Thresholds, in court metres. */
export const V3_RULES=Object.freeze({netZone:4,overhead:1.75,halfVolley:.45,volleyLow:1,wide:1,reactSpeed:1.5,runSpeed:.45});
/** Which v3 clip plays now, or null (v1 or the game's own pose stays). `mirror`: the clip is authored for the other side of the body.
 * The clips hit on the racket-hand side (forehand), except the slice and the crossover run, which are authored toward the character's left. */
export function clipForV3({index,player,phase,serving,tossing,winner,shot,rallyHits,halfLength=9},clips){
 const has=(name,kind,mirror=false)=>clips?.[name]?{name,kind,mirror}:null;
 if(phase==='point'||phase==='game'||phase==='complete'){
  if(winner===index)return has(index===0&&phase!=='point'?'childlike_joy':'point_win','react')||has('point_win','react');
  if(winner===1-index)return has('point_disappointment','react');
  return null;
 }
 if(tossing||serving)return null;
 if(player.swing>0){
  const contact=player.contactPoint;if(phase!=='rally'||!contact)return null;
  const back=player.stroke==='backhand',mine=shot&&shot.side===index&&!shot.serving?shot:null;
  if(player.lob)return has('lob','stroke',back);
  if(mine?.drop)return has('defensive_slice','stroke',!back);
  if(contact.y>=V3_RULES.overhead)return has('overhead_backward','stroke',back);
  if(Math.abs(player.z)<=Math.min(V3_RULES.netZone,halfLength*.45))return has(contact.y<V3_RULES.halfVolley?'half_volley':contact.y<V3_RULES.volleyLow?'volley_low':'volley_high','stroke',back);
  if(Math.abs(contact.x-player.x)>=V3_RULES.wide)return has('slide_to_ball','stroke',back);
  if(mine&&rallyHits===2)return has('serve_return_aggressive','stroke',back);
  return null;
 }
 const vx=player.vx||0,vz=player.vz||0;if(Math.hypot(vx,vz)<V3_RULES.runSpeed)return null;
 const forward=(index===0?-1:1)*vz,leftward=index===0?-vx:vx;
 if(Math.abs(leftward)>Math.abs(forward)*1.2&&leftward<0)return has('lateral_crossover_run','run',true);
 return null;
}
const LEGS=[['LeftUpLeg','LeftLeg'],['LeftLeg','LeftFoot'],['RightUpLeg','RightLeg'],['RightLeg','RightFoot'],['Spine','Chest'],['Chest','Neck']];
const ARMS=[['LeftArm','LeftForeArm'],['LeftForeArm','LeftHand'],['RightArm','RightForeArm'],['RightForeArm','RightHand']];
const swap=name=>name.startsWith('Left')?'Right'+name.slice(4):name.startsWith('Right')?'Left'+name.slice(5):name;
/** The same pose seen in a mirror: left and right limbs trade places and every direction flips across the body's middle plane. */
export function mirrorDirections(dirs){const out={};for(const [name,d] of Object.entries(dirs))out[swap(name)]=[-d[0],d[1],d[2]];return out;}
/** A sampled v3 pose as the view takes it: unit directions of thighs, shins, spine and chest, of both upper arms and forearms, and the hip height
 * relative to standing (metres on the canonical skeleton, negative in a crouch). */
export function poseV3(bones,clip,seconds,mirror=false){
 const sample=sampleClip(clip,seconds),world=jointWorld(bones,sample),dirs={};
 for(const [a,b] of [...LEGS,...ARMS])dirs[a]=unit(world[b].p.map((v,i)=>v-world[a].p[i]));
 return {dirs:mirror?mirrorDirections(dirs):dirs,hips:sample.hips[1]};
}
/** Arm targets in the character's root space from a v3 pose: elbow = shoulder + upper arm, wrist = elbow + forearm, with the character's own
 * bone lengths. `side` is 'Left' | 'Right' on the canonical skeleton; `flipX` = -1 when the character's root +X is the canonical right. */
export function armTargets(dirs,side,shoulder,upperLength,foreLength,flipX=1){
 const a=dirs[side+'Arm'],f=dirs[side+'ForeArm'],elbow=[shoulder[0]+a[0]*flipX*upperLength,shoulder[1]+a[1]*upperLength,shoulder[2]+a[2]*upperLength];
 return {elbow,hand:[elbow[0]+f[0]*flipX*foreLength,elbow[1]+f[1]*foreLength,elbow[2]+f[2]*foreLength]};
}
export async function loadMotionV3({base,fetcher=globalThis.fetch,params}={}){
 if(params?.get?.('tennisMotionV3')==='0'||params?.get?.('tennisMotionV1')==='0')return null;
 const response=await fetcher(new URL('../assets/tennis-motion-v3/core.json?v=island-v2-20261107-24',base));
 if(!response.ok)throw new Error('motion v3 '+response.status);
 const data=await response.json();
 if(data?.bones?.length!==18||!data.clips?.point_win)throw new Error('motion v3 data');
 return {bones:data.bones,clips:data.clips};
}
