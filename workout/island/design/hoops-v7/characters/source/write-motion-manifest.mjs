/** Regenerate the motion delivery contract from the live authored catalogue. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ACTIONS,BONE_NAMES} from './motion.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rig=JSON.parse(await fs.readFile(path.join(root,'rig.json'),'utf8'));
const sourceHash=createHash('sha256').update(await fs.readFile(path.join(root,'source/motion.mjs'))).digest('hex');
const reference=JSON.parse(await fs.readFile(path.join(root,'../../motion2/hoops.json'),'utf8'));
const heights={pg:1.78,sg:1.88,sf:1.99,pf:2.09,c:2.20,referee:1.86};
const window=(effector,start,end)=>({effector,startNormalized:start,endNormalized:end,kind:'full palmar marker contact'});
function dribblePhysics(id,height){const transfer=id==='dribble_crossover'||id==='dribble_between_legs',P=ACTIONS.find(a=>a.id===id).duration/(transfer?2:1),top=height*(id==='dribble_power'?.43:id==='dribble_between_legs'?.42:.51),H=top-.12,T=P/2,Tp=Math.max(.08*P,T-Math.sqrt(2*H/9.81)),flight=T-Tp,a=Math.max(0,(H-.5*9.81*flight*flight)/(Tp*(T-.5*Tp)));return{periodSeconds:P,topMeters:top,pushDurationSeconds:Tp,pushEndNormalizedWithinBounce:Tp/P,freeFlightGravityMetersPerSecondSquared:9.81,handPushAccelerationMetersPerSecondSquared:a,floorNormalized:transfer?[.25,.75]:[.5]};}
function contacts(id,push=.08){
  if(id==='idle_hold'||id==='euro_step')return [window('LeftHand',0,1),window('RightHand',0,1)];
  if(['dribble_right','dribble_power','dribble_left'].includes(id)){const hand=id==='dribble_left'?'LeftHand':'RightHand';return [window(hand,0,push),window(hand,1-push,1)];}
  if(id==='dribble_crossover'||id==='dribble_between_legs')return [window('RightHand',0,push/2),window('LeftHand',.5-push/2,.5+push/2),window('RightHand',1-push/2,1)];
  if(id.startsWith('shot_'))return [window('RightHand',0,.49),window('LeftHand',0,.35)];
  if(id==='layup')return [window('RightHand',0,.58),window('LeftHand',0,.31)];
  if(id==='dunk_one_hand')return [window('RightHand',0,.63),window('LeftHand',0,.25)];
  if(id.startsWith('dunk_'))return [window('RightHand',0,.63),window('LeftHand',0,.63)];
  if(id==='rebound')return [window('RightHand',.445,1),window('LeftHand',.445,1)];
  return [];
}
function events(id){
  const out=[];if(id.startsWith('dribble_'))for(const t of id==='dribble_crossover'||id==='dribble_between_legs'?[.25,.75]:[.5])out.push({timeNormalized:t,name:'visual_ball_floor',domain:'presentation'});
  const release=id.startsWith('shot_')?.49:id==='layup'?.58:id.startsWith('dunk_')?.64:null;
  if(release!==null)out.push({timeNormalized:release,name:'visual_ball_release',domain:'presentation'});
  if(id==='rebound')out.push({timeNormalized:.43,name:'visual_rebound_receive',domain:'presentation'});
  if(id==='layup')out.push({timeNormalized:.34,name:'visual_takeoff',domain:'presentation'},{timeNormalized:.84,name:'visual_land',domain:'presentation'});
  if(id.startsWith('dunk_'))out.push({timeNormalized:.29,name:'visual_takeoff',domain:'presentation'},{timeNormalized:.86,name:'visual_land',domain:'presentation'});
  if(id==='euro_step')out.push({timeNormalized:.26,name:'visual_left_plant',domain:'presentation'},{timeNormalized:.54,name:'visual_right_plant',domain:'presentation'},{timeNormalized:.65,name:'visual_gather_lift',domain:'presentation'});
  if(id==='run')out.push({timeNormalized:0,name:'visual_left_heel_plant',domain:'presentation'},{timeNormalized:.40,name:'visual_left_toe_release',domain:'presentation'},{timeNormalized:.50,name:'visual_right_heel_plant',domain:'presentation'},{timeNormalized:.90,name:'visual_right_toe_release',domain:'presentation'},{timeNormalized:1,name:'visual_left_heel_plant',domain:'presentation'});
  return out.sort((a,b)=>a.timeNormalized-b.timeNormalized);
}
const notes={
  idle_hold:'Two hands on the ball; slow breathing. No bounce. The finger pads, thumb opposition and palmar markers are separate from gameplay ownership.',
  dribble_right:'Right-hand push, release, concave-down fall, floor bounce and upper receive; the left hand protects space.',
  dribble_left:'Mirrored hand ownership, with independently authored timing and the right hand protecting space.',
  dribble_power:'Lower, wider protected bounce on the right side; lowered pelvis and shielding off arm.',
  dribble_crossover:'Two bounces per cycle, crossing in front of the body, right to left and back.',
  dribble_between_legs:'Two bounces per cycle, right-front to left-rear through the widened leg gap, then return. Gather waits for the front right-hand catch.',
  shot_set:'Standing shot. Ball rises in front of the face to the shooting shoulder; guide releases before the shooting hand, then high wrist follow-through.',
  shot_jump:'Jump shot with load, takeoff, high release, held follow-through and controlled landing.',
  shot_fadeaway:'Backward pelvis travel while airborne; the released ball continues from its release anchor rather than inheriting subsequent body motion.',
  shot_stepback:'Separate retreat foot placements precede the loaded shot. No gameplay foul, shot result or score is implied.',
  layup:'Asymmetric approach, opposite knee lift, palmar support under the ball and a high one-hand release.',
  dunk_one_hand:'One-hand finish, opposite arm balancing, role-measured jump height and a downward free ball after release.',
  dunk_two_hand:'Symmetrical two-hand grip above the head, downward finish and bent-leg landing.',
  dunk_reverse:'Whole-body half-turn through Hips, hands and feet turning together, two-hand backward finish; Chest remains within a small relative twist.',
  euro_step:'First lateral plant and weight transfer, opposite second plant, ball gathered across the torso and a small final lift.',
  run:'In-place running gait, reciprocal bent elbows, shoulder/pelvis counter-rotation, forward lean, relaxed fists and heel/toe roll. Gameplay must supply forward travel.',
  walk:'In-place walking gait with a longer stance phase and lower swing clearance. Gameplay must supply forward travel.',
  decelerate:'Lead foot plants ahead of the pelvis; knees compress and the trunk brakes before the trailing step settles.',
  defense_shuffle:'Lead foot steps, plants, then the trailing foot catches up; supported foot X/Z remains stationary within each plant window.',
  steal:'Right shoulder and trunk commit forward into a low lateral hand sweep, then recover. No hit, possession change or collision is implied.',
  block:'Loaded two-foot jump, extended right reach and a controlled return. No blocked-shot result is inferred.',
  rebound:'Hands receive above the head and draw the ball to the chest while landing.',
  pivot:'Weight over the left forefoot; the right foot follows a visible arc. The left toe marker, rather than the ankle, is the pivot anchor.',
  celebrate:'One raised clenched fist, asymmetric free arm and a small weight bounce; no real-person celebration or likeness.',
  fall:'Side brace and ground contact, roll into a kneeling lunge, then a hand-assisted rise into a split stance. A presentation fall, not a safety demonstration.',
  referee_signal:'An open right-hand signal with a relaxed, partly curled free hand.',
};
const manifest={schemaVersion:1,kind:'authored-canonical-basketball-motion',authorship:{method:'Original analytic phase poses, measured two-bone IK, actual skinned sole/body probes and independent palmar/finger morph control. No motion capture.',license:'Repository terms; see LICENSES.md.'},
  runtime:{module:'source/motion.mjs',sourceSha256:sourceHash,exports:['ACTIONS','BONE_NAMES','sampleMotion','createMotionController'],units:'metres',up:'+Y',forward:'+Z',anatomicalLeft:'+X'},
  skeleton:{jointCount:18,names:BONE_NAMES,profileBindFile:'rig.json',canonicalReference:'workout/island/design/motion2/hoops.json',sameNamesAndHierarchyAsReference:BONE_NAMES.every((name,i)=>name===reference.skeleton.bones[i].name)},
  ball:{radiusMeters:.12,bakedNode:'MotionBallAnchor',bakedNodeIsSkinJoint:false,meaning:'Presentation centre, orientation and visibility only. A game must decide ownership, physics, collisions and scoring independently.',trajectory:'Each dribble uses a calibrated short hand-push/braking interval and9.81m/s² free flight, with exact upper receive and floor-bounce times. Fast crossovers use greater hand force; a slow protective dribble can dwell briefly at the top. Shot/finish trajectories use9.81m/s² after release and a0.58 first-bounce restitution. This authored presentation trajectory is not a rigid-body collision simulation.'},
  clips:ACTIONS.map(a=>({...a,durationSeconds:a.duration,rootMotion:false,contactWindows:contacts(a.id),contactWindowsByProfile:a.category==='dribble'?Object.fromEntries(Object.entries(heights).map(([id,h])=>[id,contacts(a.id,dribblePhysics(a.id,h).pushEndNormalizedWithinBounce)])):undefined,dribblePhysicsByProfile:a.category==='dribble'?Object.fromEntries(Object.entries(heights).map(([id,h])=>[id,dribblePhysics(a.id,h)])):undefined,locomotion:a.id==='run'?{inPlace:true,stanceFractionPerLeg:.40,flightWindows:[[.40,.50],[.90,1]],matchingForwardSpeedMetersPerSecond:.62/(.40*a.duration)}:a.id==='walk'?{inPlace:true,stanceFractionPerLeg:.62,matchingForwardSpeedMetersPerSecond:.44/(.62*a.duration)}:undefined,events:events(a.id),notes:notes[a.id],bakedIn:'Every models/<role>.glb and models/<role>-lod1.glb',runtimeSampler:'sampleMotion(id, normalizedPhase, measuredProfile)'})),
  transitions:{defaultVisualBlendSeconds:.42,dribbleGatherBlendSeconds:.52,powerGatherBlendSeconds:.62,betweenLegsGatherBlendSeconds:.65,dribbleToHold:'Continue the bounce to its upper receive. Between-legs completes to the front-hand catch. Preserve the displayed pose and actual post-constraint ball velocity; interpolate hand frames on shortest quaternion arcs, route the rear hand around the body, solve contact/ground constraints after blending.',holdToDribble:'Keep the target first upper-hand pose at phase0 while the two-hand hold transfers to one dribbling hand. Start the free-flight clock only when that transfer completes, so the first floor bounce remains visible and physical.',interrupt:'Start from the currently displayed pose and measured ball velocity; no restart at the old source pose.',ballContinuityCheck:'source/motion-checks.mjs: independent second-order finite differences at actual blend begin/end and interruptions.'},
  verification:['verification/motion-validation.json','verification/skin-validation.json','verification/baked-validation.json'],
  limitations:['Animation does not infer a gameplay outcome.','Palmar marker residual is not a continuous triangle/ball collision proof; the independent skin audit samples actual morphed vertices.','In-place running/walking require matching game translation; no locomotion world-foot lock is claimed in the stationary viewer.','Physical phone performance is separate from desktop browser measurements.']};
const contract={schemaVersion:1,kind:'canonical18-basketball-target-bind',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},units:'metres',rotationFormat:'quaternion-xyzw',rotationSpace:'parent-local absolute target-bind',boneCount:18,bones:reference.skeleton.bones.map(({name,parent})=>({name,parent})),profileBindFile:'rig.json',retargetAdapter:'source/retarget-motion2.mjs',retargetMap:'retarget-map.json',compatibility:'The18 names and hierarchy match motion2. Per-role A-pose translations and measured limb lengths differ from the motion2 canonical rest, so canonical source rotations require the delivered explicit retarget adapter before applying to these skins.',grounding:'Runtime and baked clips use the same actual decoded skin extremal probes. FALL also probes every official_trousers vertex because blended knee vertices can lie inside the bind-pose extrema. Supporting soles target3mm above the ground; airborne soles preserve authored swing/jump clearance. Four fixed fall constraint passes project body/hand probes toward2mm clearance while retaining the same authored sole baseline. Independent full-vertex live and baked audits measure remaining floor residuals.',handSemantics:'Left/RightHand palmPoint is an actual verified palmar skin vertex in each profile bind frame. grip_left and grip_right morphs curl digits toward the actual palmar hemisphere. freeGrip remains active without a ball.',samplePose:'createMotionController(root,{profile}).setAction(id,{immediate:true}).seek(phase).snapshot()',sourceSha256:sourceHash};
await fs.writeFile(path.join(root,'motions.json'),JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(path.join(root,'motion-contract.json'),JSON.stringify(contract,null,2)+'\n');
console.log(JSON.stringify({clips:ACTIONS.length,sourceSha256:sourceHash,canonicalHierarchy:manifest.skeleton.sameNamesAndHierarchyAsReference}));
