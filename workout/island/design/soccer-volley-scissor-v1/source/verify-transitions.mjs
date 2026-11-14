// SPDX-License-Identifier: CC0-1.0
// Serialized GLB C0/C1, grounding, seam and interrupted-bridge verification.
// Uses the same normalized Hermite bridge and local floor projection as kicks-v2.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {unpack, readAccessor} from './glb.mjs';
import {bones, fk, point} from './rig.mjs';
import {makeBridge, sampleMotion, poseVelocity} from '../player.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const catalog = JSON.parse(read('catalog.json'));
const expectedIds = ['volley_right','volley_left','scissor_backward','scissor_land_getup','header_prepare','header_jump_neutral'];
const names = bones.map(b => b.name), feet = ['LeftFoot','RightFoot'];
const sole = [0,-.08,0], I = [0,0,0,1], rate = 240;
const dot = (a,b) => a.reduce((v,x,i) => v+x*b[i],0);
const distance = (a,b) => Math.hypot(...a.map((v,i) => v-b[i]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const angle = (a,b) => 2*Math.acos(Math.min(1,Math.max(0,Math.abs(dot(a,b))/(Math.hypot(...a)*Math.hypot(...b)))))*180/Math.PI;
const thresholds = {
  endpointHipsMeters:1e-9, endpointRotationDegrees:1e-5,
  endpointHipsVelocityMetersPerSecond:1e-4, endpointAngularVelocityRadiansPerSecond:.01,
  maximum240HzHipsStepMeters:.02, maximum240HzRotationStepDegrees:10,
  stationaryIdleSoleDriftMeters:.02, minimumGroundedSoleYMeters:-.02,
};
if (catalog.clips.length !== 6 || expectedIds.some(id => !catalog.clips.some(c => c.id === id))) throw new Error('Expected the six requested clips.');

/** Read delivered binary FLOAT channels, including their Float32 time spacing. */
function decode(path, referenceId) {
  const bytes = read(path), glb = unpack(bytes), doc = glb.document;
  if (JSON.stringify(doc).includes('KHR_draco_mesh_compression') || JSON.stringify(doc).includes('EXT_meshopt_compression')) throw new Error(`${path}: compressed input`);
  if (doc.animations?.length !== 1) throw new Error(`${path}: expected one animation`);
  const skin = doc.skins?.[0];
  if (!skin || skin.joints.length !== 18 || names.some(name => !skin.joints.some(j => doc.nodes[j].name === name))) throw new Error(`${path}: expected the canonical18 skin`);
  for (const bone of bones) {
    const index = doc.nodes.findIndex(n => n.name === bone.name), node = doc.nodes[index];
    if (!node) throw new Error(`${path}: missing ${bone.name}`);
    if (bone.parent) {
      const parent = doc.nodes.find(n => n.name === bone.parent);
      if (!parent?.children?.includes(index)) throw new Error(`${path}: wrong parent for ${bone.name}`);
    }
    if (bone.name !== 'Hips' && distance(node.translation ?? [0,0,0],bone.rest) > 1e-6) throw new Error(`${path}: noncanonical rest translation ${bone.name}`);
  }
  const rootNode = doc.nodes.find(n => n.name === 'Root');
  if (distance(rootNode.translation ?? [0,0,0],[0,0,0]) !== 0 || angle(rootNode.rotation ?? I,I) !== 0) throw new Error(`${path}: Root transform changed`);
  const animation = doc.animations[0], tracks = animation.channels.map(channel => {
    const sampler = animation.samplers[channel.sampler];
    if ((sampler.interpolation ?? 'LINEAR') !== 'LINEAR') throw new Error(`${path}: expected native LINEAR/slerp interpolation`);
    const input = readAccessor(glb,sampler.input), output = readAccessor(glb,sampler.output);
    if (input.accessor.componentType !== 5126 || output.accessor.componentType !== 5126) throw new Error(`${path}: expected FLOAT channels`);
    return {name:doc.nodes[channel.target.node].name,path:channel.target.path,times:input.values,width:output.width,values:output.values};
  });
  const rotations = tracks.filter(t => t.path === 'rotation'), hips = tracks.find(t => t.name === 'Hips' && t.path === 'translation');
  if (tracks.length !== 19 || rotations.length !== 18 || names.some(name => rotations.filter(t => t.name === name).length !== 1) || !hips) throw new Error(`${path}: expected 18 rotations and Hips translation`);
  const times = hips.times;
  if (times.length < 2 || times.some((v,i) => v !== Math.fround(i/30))) throw new Error(`${path}: expected complete native 30Hz FLOAT times`);
  for (const track of tracks) if (track.times.length !== times.length || track.times.some((v,i) => v !== times[i])) throw new Error(`${path}: mismatched channel times`);
  const frames = times.map((time,i) => ({time,hips:hips.values.slice(i*3,i*3+3),rotations:Object.fromEntries(rotations.map(t => [t.name,t.values.slice(i*4,i*4+4)]))}));
  if (frames.some(f => f.hips.some(v => !Number.isFinite(v)) || Object.values(f.rotations).some(q => q.some(v => !Number.isFinite(v)) || Math.abs(Math.hypot(...q)-1)>1e-6) || f.rotations.Root.some((v,i) => v !== I[i]))) throw new Error(`${path}: invalid canonical pose`);
  return {id:animation.name,referenceId,path,sha256:hash(bytes),duration:times.at(-1),frames};
}

function poseResidual(a,b) {
  return {hipsMeters:distance(a.hips,b.hips),rotationDegrees:Math.max(...names.map(name => angle(a.rotations[name],b.rotations[name])))};
}
function velocityResidual(a,b,pose,expectedPose) {
  let maximum = 0;
  for (const name of names) {
    const q = pose.rotations[name], sign = dot(q,expectedPose.rotations[name]) < 0 ? -1 : 1;
    const difference = a.rotations[name].map((v,i) => v-sign*b.rotations[name][i]);
    const projection = dot(difference,q)/dot(q,q);
    maximum = Math.max(maximum,2*Math.hypot(...difference.map((v,i) => v-projection*q[i])));
  }
  return {hipsMetersPerSecond:distance(a.hips,b.hips),rotationRadiansPerSecond:maximum};
}
const solePoints = pose => Object.fromEntries(feet.map(name => [name,point(pose,name,sole)]));
function soleSpeeds(sample,time,side) {
  const delta = 1e-5;
  const a = solePoints(sample(side === 'right' ? time : time-delta));
  const b = solePoints(sample(side === 'left' ? time : time+delta));
  return Object.fromEntries(feet.map(name => [name,distance(a[name],b[name])/delta]));
}
function endpointsPass(c0,c1) {
  return Object.values(c0).every(r => r.hipsMeters < thresholds.endpointHipsMeters && r.rotationDegrees < thresholds.endpointRotationDegrees)
    && Object.values(c1).every(r => r.hipsMetersPerSecond < thresholds.endpointHipsVelocityMetersPerSecond && r.rotationRadiansPerSecond < thresholds.endpointAngularVelocityRadiansPerSecond);
}

/** Evaluate the actual player helper, including local below-floor projection. */
function measureBridge(transition,from,to,fromTime,toTime,{referenceId,raw}={}) {
  const duration = transition.duration, start = transition.sample(0), end = transition.sample(duration);
  const sourcePose = from(fromTime), targetPose = to(toTime);
  const outgoing = poseVelocity(from,fromTime,{side:'left'}), incoming = poseVelocity(to,toTime,{side:'right'});
  const c0 = {start:poseResidual(start,sourcePose),end:poseResidual(end,targetPose)};
  const c1 = {
    start:velocityResidual(poseVelocity(transition.sample,0,{side:'right',delta:1e-7}),outgoing,start,sourcePose),
    end:velocityResidual(poseVelocity(transition.sample,duration,{side:'left',delta:1e-7}),incoming,end,targetPose),
  };
  const startSoles = solePoints(start), endSoles = solePoints(end);
  const sourceSpeed = soleSpeeds(from,fromTime,'left'), targetSpeed = soleSpeeds(to,toTime,'right');
  const idlePlants = Object.fromEntries(feet.map(name => [name,{
    applicable:referenceId?.includes('idle') === true && distance(startSoles[name],endSoles[name]) < .002 && Math.abs(startSoles[name][1]) < .002 && Math.abs(endSoles[name][1]) < .002 && sourceSpeed[name] < .02 && targetSpeed[name] < .02,
    endpointDistanceMeters:distance(startSoles[name],endSoles[name]),sourceSpeedMetersPerSecond:sourceSpeed[name],targetSpeedMetersPerSecond:targetSpeed[name],maxDriftMeters:0,
  }]));
  let previous = start, maxHipsStepMeters = 0, maxRotationStepDegrees = 0, maxUnitQuaternionError = 0;
  let minSoleYMeters = Infinity, minRawSoleYMeters = Infinity, rootFixed = true, finite = true;
  const count = Math.ceil(duration*rate);
  for (let i=0;i<=count;i++) {
    const time = Math.min(duration,i/rate), pose = transition.sample(time), diff = poseResidual(previous,pose), soles = solePoints(pose);
    maxHipsStepMeters = Math.max(maxHipsStepMeters,diff.hipsMeters);
    maxRotationStepDegrees = Math.max(maxRotationStepDegrees,diff.rotationDegrees);
    minSoleYMeters = Math.min(minSoleYMeters,...feet.map(name => soles[name][1]));
    if (raw) minRawSoleYMeters = Math.min(minRawSoleYMeters,...Object.values(solePoints(raw.sample(time))).map(p => p[1]));
    finite &&= pose.hips.every(Number.isFinite) && Object.values(pose.rotations).every(q => q.every(Number.isFinite));
    rootFixed &&= pose.rotations.Root.every((v,j) => v === I[j]);
    for (const q of Object.values(pose.rotations)) maxUnitQuaternionError = Math.max(maxUnitQuaternionError,Math.abs(Math.hypot(...q)-1));
    for (const name of feet) if (idlePlants[name].applicable) idlePlants[name].maxDriftMeters = Math.max(idlePlants[name].maxDriftMeters,distance(soles[name],startSoles[name]));
    previous = pose;
  }
  for (const plant of Object.values(idlePlants)) plant.pass = plant.applicable ? plant.maxDriftMeters < thresholds.stationaryIdleSoleDriftMeters : null;
  return {durationSeconds:duration,sampleRate:rate,sampleCount:count+1,c0,c1,maxHipsStepMeters,maxRotationStepDegrees,maxUnitQuaternionError,minSoleYMeters,minRawSoleYMeters:raw?minRawSoleYMeters:null,rootFixed,finite,idlePlants,
    pass:endpointsPass(c0,c1) && maxHipsStepMeters < thresholds.maximum240HzHipsStepMeters && maxRotationStepDegrees < thresholds.maximum240HzRotationStepDegrees && maxUnitQuaternionError < 1e-12 && finite && rootFixed && minSoleYMeters >= thresholds.minimumGroundedSoleYMeters && Object.values(idlePlants).every(p => !p.applicable || p.pass)};
}

const references = ['idle_relaxed','run','locomotion_idle','locomotion_run'].map(id => decode(`reference/${id}.glb`,id));
const motions = catalog.clips.map(entry => ({...decode(entry.asset ?? `clips/${entry.id}.glb`),entry}));
const byId = new Map(motions.map(m => [m.id,m]));
const bridges = [], interruptions = [], exclusions = [];
for (const motion of motions) for (const reference of references) for (const direction of ['entry','exit']) {
  // These are intentional chain endpoints. A midair kick never blends directly
  // to standing/running, and its landing never starts from standing/running.
  if ((motion.id === 'scissor_backward' && direction === 'exit') || (motion.id === 'scissor_land_getup' && direction === 'entry')) {
    exclusions.push({clip:motion.id,reference:reference.referenceId,direction,reason:direction==='exit'?'Continue directly into scissor_land_getup; airborne endpoint is not a locomotion exit.':'Enter directly from scissor_backward; this clip starts with a falling body.'});
    continue;
  }
  const descriptor = motion.entry[direction];
  if (!(descriptor?.blendSeconds > 0)) throw new Error(`${motion.id}/${direction}: missing catalog blendSeconds`);
  for (const phaseKind of ['catalog','moving-interior']) {
    const phase = phaseKind === 'catalog' ? descriptor.phase ?? 0 : reference.duration*(reference.referenceId.includes('run') ? .371 : .231);
    const duration = descriptor.blendSeconds;
    const action = t => sampleMotion(motion,t,{loop:false}), locomotion = t => sampleMotion(reference,t,{loop:true});
    const from = direction === 'entry' ? locomotion : action, to = direction === 'entry' ? action : locomotion;
    const fromTime = direction === 'entry' ? phase : motion.duration, toTime = direction === 'entry' ? 0 : phase;
    const transition = makeBridge({from,to,fromTime,toTime,duration});
    const raw = makeBridge({from,to,fromTime,toTime,duration,grounding:false});
    const identity = {clip:motion.id,reference:reference.referenceId,direction,phaseKind,referencePhaseSeconds:phase,fromTime,toTime};
    bridges.push({...identity,...measureBridge(transition,from,to,fromTime,toTime,{referenceId:reference.referenceId,raw})});
    // Interrupt at a non-keyframe, retain the currently displayed derivative,
    // and choose a distinct moving destination phase. This exercises the public
    // fromVelocity contract rather than restarting from a stored source frame.
    const elapsed = duration*.473, targetTime = reference.duration*.613;
    const explicitVelocity = poseVelocity(transition.sample,elapsed,{side:'left'});
    const interrupted = makeBridge({from:transition.sample,to:locomotion,fromTime:elapsed,toTime:targetTime,duration,fromVelocity:explicitVelocity});
    const interruptedRaw = makeBridge({from:transition.sample,to:locomotion,fromTime:elapsed,toTime:targetTime,duration,fromVelocity:explicitVelocity,grounding:false});
    interruptions.push({...identity,interruptElapsedSeconds:elapsed,resumeTargetTime:interrupted.resumeTargetTime,...measureBridge(interrupted,transition.sample,locomotion,elapsed,targetTime,{referenceId:reference.referenceId,raw:interruptedRaw})});
  }
}

function directSeam(fromId,toId) {
  const source = byId.get(fromId), target = byId.get(toId);
  const from = t => sampleMotion(source,t,{loop:false}), to = t => sampleMotion(target,t,{loop:false});
  const a = from(source.duration), b = to(0);
  const c0 = poseResidual(a,b);
  const c1 = velocityResidual(poseVelocity(from,source.duration,{side:'left'}),poseVelocity(to,0,{side:'right'}),a,b);
  return {from:fromId,to:toId,sourceTime:source.duration,targetTime:0,bridgeSeconds:0,c0,c1,
    maximumWorldJointPositionGapMeters:Math.max(...names.map(name => distance(fk(a)[name].position,fk(b)[name].position))),
    pass:endpointsPass({seam:c0},{seam:c1})};
}
const seams = [directSeam('scissor_backward','scissor_land_getup')];
// Preparation explicitly recommends an action bridge. Preserve the measured
// native boundary diagnostic without claiming a direct C1 splice that the
// catalog does not promise.
const preparation = byId.get('header_prepare'), jump = byId.get('header_jump_neutral');
const nextAction = preparation.entry.nextAction;
if (nextAction?.reference !== jump.id || !(nextAction.blendSeconds > 0)) throw new Error('Missing catalog preparation-to-header bridge recommendation.');
const preparationSample = t => sampleMotion(preparation,t,{loop:false}), jumpSample = t => sampleMotion(jump,t,{loop:false});
const actionOptions = {from:preparationSample,to:jumpSample,fromTime:preparation.duration,toTime:0,duration:nextAction.blendSeconds};
const actionBridge = makeBridge(actionOptions), rawActionBridge = makeBridge({...actionOptions,grounding:false});
const actionBridges = [{from:preparation.id,to:jump.id,fromTime:preparation.duration,toTime:0,
  ...measureBridge(actionBridge,preparationSample,jumpSample,preparation.duration,0,{raw:rawActionBridge})}];
const nativeActionBoundaries = [{...directSeam(preparation.id,jump.id),requiresCatalogBridge:true,recommendedBridgeSeconds:nextAction.blendSeconds}];
const applicablePlants = [...bridges,...interruptions,...actionBridges].flatMap(b => Object.values(b.idlePlants)).filter(p => p.applicable);
const allMeasurements = [...bridges,...interruptions,...actionBridges];
const evidence = {
  schemaVersion:1,
  method:'Actual serialized GLB FLOAT channels, native 30Hz LINEAR/slerp sampling; unchanged normalized quaternion Hermite construction and smoothly ramped canonical leg floor projection from soccer-kicks-v2. Endpoint sided derivatives sampled at 1e-7s; bridge interiors at 240Hz.',
  scope:'Safe entry and exit endpoints of the six delivered clips against both kicks-v2 references and locomotion-v2 references, at phase zero and moving interior phases. The airborne scissor end and falling landing start form one direct measured C0/C1 chain and are excluded from locomotion bridging. Each safe bridge is interrupted at 47.3% with its displayed velocity and redirected to a moving reference phase. header_prepare to header_jump_neutral uses the catalog nextAction Hermite bridge; its unbridged native boundary is reported separately and is not claimed to be C1.',
  limitations:'Bridge C1 refers to pose and velocity at the two bridge endpoints. Native 30Hz LINEAR/slerp clips can change velocity at internal frame knots. Local floor projection is not world-space support-anchor locking. Moving run soles and different floor anchors are not labelled planted; the simulation owns actor translation, yaw, events and active world anchors.',
  thresholds,
  sourceFiles:[...references,...motions].map(({id,referenceId,path,sha256,duration}) => ({id:referenceId??id,path,sha256,durationSeconds:duration})),
  helperFiles:['player.mjs','source/hermite.mjs','source/rig.mjs','source/glb.mjs'].map(path => ({path,sha256:hash(read(path))})),
  summary:{bridges:bridges.length,bridgesPassed:bridges.filter(b => b.pass).length,interruptedBridges:interruptions.length,interruptedBridgesPassed:interruptions.filter(b => b.pass).length,actionBridges:actionBridges.length,actionBridgesPassed:actionBridges.filter(b => b.pass).length,directSeams:seams.length,directSeamsPassed:seams.filter(s => s.pass).length,
    maxEndpointRotationDegrees:Math.max(...allMeasurements.flatMap(b => Object.values(b.c0).map(v => v.rotationDegrees)),...seams.map(s => s.c0.rotationDegrees)),
    maxEndpointVelocityRadiansPerSecond:Math.max(...allMeasurements.flatMap(b => Object.values(b.c1).map(v => v.rotationRadiansPerSecond)),...seams.map(s => s.c1.rotationRadiansPerSecond)),
    maxHipsStepMeters:Math.max(...allMeasurements.map(b => b.maxHipsStepMeters)),maxRotationStepDegrees:Math.max(...allMeasurements.map(b => b.maxRotationStepDegrees)),
    stationaryIdleSoleCases:applicablePlants.length,maxStationaryIdleSoleDriftMeters:Math.max(0,...applicablePlants.map(p => p.maxDriftMeters)),
    minimumRawBridgeSoleYMeters:Math.min(...allMeasurements.map(b => b.minRawSoleYMeters)),minimumGroundedBridgeSoleYMeters:Math.min(...allMeasurements.map(b => b.minSoleYMeters)),
    allPassed:bridges.length===80 && interruptions.length===80 && actionBridges.length===1 && allMeasurements.every(b => b.pass) && seams.every(s => s.pass)},
  directSeams:seams,actionBridges,nativeActionBoundaries,excludedLocomotionEndpoints:exclusions,bridges,interruptions,
};
mkdirSync(new URL('verification/',root),{recursive:true});
writeFileSync(new URL('verification/transitions.json',root),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence.summary,null,2));
if (!evidence.summary.allPassed) process.exitCode = 1;
