// SPDX-License-Identifier: CC0-1.0
// Actual serialized GLB tracks: C0/C1 endpoints and 240 Hz bridge interiors.
// Derived from the original CC0 soccer-header-v1 transition measurement.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {unpack, readAccessor} from '../../soccer-header-v1/source/glb.mjs';
import {makeBridge, sampleMotion, poseVelocity} from '../runtime/player.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const catalog = JSON.parse(read('runtime/catalog.json'));
const ids = catalog.clips.map(c => c.id);
if (ids.length !== 14 || new Set(ids).size !== 14) throw new Error('Expected exactly 14 distinct kick/pass clips.');
const bones = JSON.parse(read('../motion/soccer.json')).skeleton.bones;
const names = bones.map(b => b.name);
const rate = 240, I = [0,0,0,1], sole = [0,-.08,0];
const hash = value => createHash('sha256').update(value).digest('hex');
const dot = (a,b) => a.reduce((v,x,i) => v+x*b[i],0);
const distance = (a,b) => Math.hypot(...a.map((v,i) => v-b[i]));
const add = (a,b) => a.map((v,i) => v+b[i]);
const angularDistance = (a,b) => 2*Math.acos(Math.min(1,Math.max(-1,Math.abs(dot(a,b))/(Math.hypot(...a)*Math.hypot(...b)))))*180/Math.PI;
const qm = ([x,y,z,w],[a,b,c,d]) => [w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const rotate = (q,v) => qm(qm(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);

function solePoints(pose) {
  const world = {};
  for (const bone of bones) {
    const parent = world[bone.parent] ?? {position:[0,0,0],rotation:I};
    world[bone.name] = {
      position:add(parent.position,rotate(parent.rotation,bone.name === 'Hips' ? pose.hips : bone.restTranslationMeters)),
      rotation:qm(parent.rotation,pose.rotations[bone.name]),
    };
  }
  return Object.fromEntries(['LeftFoot','RightFoot'].map(name => [name,add(world[name].position,rotate(world[name].rotation,sole))]));
}

/** Decode the submitted binary FLOAT channels, never the authoring JSON. */
function decode(path) {
  const bytes = read(path), glb = unpack(bytes), doc = glb.document;
  if (JSON.stringify(doc).includes('KHR_draco_mesh_compression') || JSON.stringify(doc).includes('EXT_meshopt_compression')) throw new Error(`${path}: compressed input`);
  if (doc.animations.length !== 1) throw new Error(`${path}: expected one animation`);
  const animation = doc.animations[0], tracks = [];
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];
    if ((sampler.interpolation ?? 'LINEAR') !== 'LINEAR') throw new Error(`${path}: expected native LINEAR sampler`);
    const input = readAccessor(glb,sampler.input), output = readAccessor(glb,sampler.output);
    if (input.accessor.componentType !== 5126 || output.accessor.componentType !== 5126) throw new Error(`${path}: expected FLOAT channels`);
    tracks.push({name:doc.nodes[channel.target.node].name,path:channel.target.path,times:input.values,width:output.width,values:output.values});
  }
  const rotations = tracks.filter(t => t.path === 'rotation');
  if (rotations.length !== 18 || names.some(name => rotations.filter(t => t.name === name).length !== 1)) throw new Error(`${path}: expected exact canonical18 rotations`);
  const translation = tracks.find(t => t.name === 'Hips' && t.path === 'translation');
  if (!translation || tracks.length !== 19) throw new Error(`${path}: expected 18 rotations and Hips translation`);
  const times = translation.times;
  if (times.length < 2 || times.some((v,i) => !Number.isFinite(v) || (i>0 && v<=times[i-1]))) throw new Error(`${path}: invalid channel times`);
  for (const track of tracks) if (track.times.length !== times.length || track.times.some((v,i) => v !== times[i])) throw new Error(`${path}: mismatched channel times`);
  const frames = times.map((time,i) => ({time,hips:translation.values.slice(i*3,i*3+3),rotations:Object.fromEntries(rotations.map(t => [t.name,t.values.slice(i*4,i*4+4)]))}));
  return {id:animation.name,path,sha256:hash(bytes),duration:times.at(-1),frames};
}

function poseResidual(a,b) {
  return {hipsMeters:distance(a.hips,b.hips),rotationDegrees:Math.max(...names.map(name => angularDistance(a.rotations[name],b.rotations[name])))};
}
function velocityResidual(a,b,pose,expectedPose) {
  let radiansPerSecond = 0;
  for (const name of names) {
    // q and -q describe the same rotation. Their component derivatives also
    // differ by a sign, so compare both tangents in the displayed hemisphere.
    const q = pose.rotations[name], sign = dot(q,expectedPose.rotations[name])<0 ? -1 : 1;
    const difference = a.rotations[name].map((v,i) => v-sign*b.rotations[name][i]);
    const projection = dot(difference,q)/dot(q,q);
    radiansPerSecond = Math.max(radiansPerSecond,2*Math.hypot(...difference.map((v,i) => v-projection*q[i])));
  }
  return {hipsMetersPerSecond:distance(a.hips,b.hips),rotationRadiansPerSecond:radiansPerSecond};
}
function soleVelocity(sample,time,side) {
  const delta = 1e-5, a = solePoints(sample(side === 'right' ? time : time-delta)), b = solePoints(sample(side === 'left' ? time : time+delta));
  return Object.fromEntries(['LeftFoot','RightFoot'].map(name => [name,distance(a[name],b[name])/delta]));
}

const references = ['idle_relaxed','run'].map(id => ({...decode(`runtime/reference/${id}.glb`),referenceId:id}));
const motions = ids.map(id => decode(`runtime/clips/${id}.glb`));
const results = [];
for (const motion of motions) for (const reference of references) for (const phaseKind of ['catalog','interior']) for (const direction of ['entry','exit']) {
  const descriptor = catalog.clips.find(c => c.id === motion.id)?.[direction];
  const recommendation = [descriptor,...(descriptor?.alternatives ?? [])].find(d => d?.reference === reference.referenceId);
  if (!recommendation || !Number.isFinite(recommendation.phase) || !(recommendation.blendSeconds>0)) throw new Error(`${motion.id}/${direction}: missing ${reference.referenceId} catalog phase/blend`);
  const phase = phaseKind === 'catalog' ? recommendation.phase : reference.duration*(reference.referenceId === 'run' ? .371 : .231);
  const duration = recommendation.blendSeconds;
  const action = t => sampleMotion(motion,t,{loop:false}), locomotion = t => sampleMotion(reference,t,{loop:true});
  const from = direction === 'entry' ? locomotion : action, to = direction === 'entry' ? action : locomotion;
  const fromTime = direction === 'entry' ? phase : motion.duration, toTime = direction === 'entry' ? 0 : phase;
  const transition = makeBridge({from,to,fromTime,toTime,duration});
  const ungrounded = makeBridge({from,to,fromTime,toTime,duration,grounding:false});
  const start = transition.sample(0), end = transition.sample(duration);
  const c0 = {start:poseResidual(start,from(fromTime)),end:poseResidual(end,to(toTime))};
  const expectedStartVelocity = poseVelocity(from,fromTime,{side:'left'}), expectedEndVelocity = poseVelocity(to,toTime,{side:'right'});
  const c1 = {
    start:velocityResidual(poseVelocity(transition.sample,0,{side:'right',delta:1e-7}),expectedStartVelocity,start,from(fromTime)),
    end:velocityResidual(poseVelocity(transition.sample,duration,{side:'left',delta:1e-7}),expectedEndVelocity,end,to(toTime)),
  };
  const startSoles = solePoints(start), endSoles = solePoints(end);
  const startSoleSpeed = soleVelocity(from,fromTime,'left'), endSoleSpeed = soleVelocity(to,toTime,'right');
  // A stationary idle sole is applicable only when BOTH endpoints already
  // describe the same floor anchor with near-zero incoming/outgoing speed.
  // Run soles are intentionally moving and never labelled planted here.
  const idlePlants = Object.fromEntries(['LeftFoot','RightFoot'].map(name => [name,{
    applicable:reference.referenceId === 'idle_relaxed' && distance(startSoles[name],endSoles[name])<.002 && Math.abs(startSoles[name][1])<.002 && Math.abs(endSoles[name][1])<.002 && startSoleSpeed[name]<.02 && endSoleSpeed[name]<.02,
    endpointDistanceMeters:distance(startSoles[name],endSoles[name]),sourceSpeedMetersPerSecond:startSoleSpeed[name],targetSpeedMetersPerSecond:endSoleSpeed[name],maxDriftMeters:0,
  }]));
  let maxHipsStepMeters = 0, maxRotationStepDegrees = 0, maxUnitQuaternionError = 0, minSoleYMeters = Infinity, minRawSoleYMeters = Infinity, rootFixed = true;
  let previous = transition.sample(0);
  const count = Math.ceil(duration*rate);
  for (let i=0;i<=count;i++) {
    const time = Math.min(duration,i/rate), current = transition.sample(time), diff = poseResidual(previous,current), soles = solePoints(current);
    minRawSoleYMeters = Math.min(minRawSoleYMeters,...Object.values(solePoints(ungrounded.sample(time))).map(p => p[1]));
    maxHipsStepMeters = Math.max(maxHipsStepMeters,diff.hipsMeters);
    maxRotationStepDegrees = Math.max(maxRotationStepDegrees,diff.rotationDegrees);
    for (const q of Object.values(current.rotations)) maxUnitQuaternionError = Math.max(maxUnitQuaternionError,Math.abs(Math.hypot(...q)-1));
    rootFixed &&= current.rotations.Root.every((v,j) => v === I[j]);
    for (const name of ['LeftFoot','RightFoot']) {
      minSoleYMeters = Math.min(minSoleYMeters,soles[name][1]);
      if (idlePlants[name].applicable) idlePlants[name].maxDriftMeters = Math.max(idlePlants[name].maxDriftMeters,distance(soles[name],startSoles[name]));
    }
    previous = current;
  }
  for (const candidate of Object.values(idlePlants)) candidate.pass = candidate.applicable ? candidate.maxDriftMeters<=.02 : null;
  const pass = Object.values(c0).every(r => r.hipsMeters<1e-9 && r.rotationDegrees<1e-5)
    && Object.values(c1).every(r => r.hipsMetersPerSecond<1e-4 && r.rotationRadiansPerSecond<.01)
    && maxHipsStepMeters<.02 && maxRotationStepDegrees<10 && maxUnitQuaternionError<1e-12 && rootFixed && minSoleYMeters>=-.02
    && Object.values(idlePlants).every(p => !p.applicable || p.pass);
  results.push({clip:motion.id,reference:reference.referenceId,direction,phaseKind,referencePhaseSeconds:phase,fromTime,toTime,durationSeconds:duration,sampleRate:rate,sampleCount:count+1,
    sourceHipsSpeedMetersPerSecond:Math.hypot(...expectedStartVelocity.hips),targetHipsSpeedMetersPerSecond:Math.hypot(...expectedEndVelocity.hips),
    sourceMaximumAngularSpeedRadiansPerSecond:Math.max(...Object.values(expectedStartVelocity.rotations).map(q => 2*Math.hypot(...q))),targetMaximumAngularSpeedRadiansPerSecond:Math.max(...Object.values(expectedEndVelocity.rotations).map(q => 2*Math.hypot(...q))),
    c0,c1,maxHipsStepMeters,maxRotationStepDegrees,maxUnitQuaternionError,rootFixed,minSoleYMeters,minRawSoleYMeters,idlePlants,pass});
}
const applicablePlants = results.flatMap(r => Object.values(r.idlePlants)).filter(p => p.applicable);
const evidence = {
  method:'Actual serialized GLB FLOAT accessors, native LINEAR/slerp. Hermite bridge with canonical two-bone below-floor projection; C0/C1 endpoint residuals and 240 Hz interior samples. Source outgoing and target incoming velocities measured from native tracks. Destination phase resumes after bridge.',
  scope:'112 bridges: 14 kicks/passes × idle_relaxed/run × entry/exit × actual catalog phase/interior phase. Phase seconds and blend durations come from each clip entry/exit recommendation or its matching alternative, including running_kick exit to run at0.4s. Reference samplers loop, including outgoing phase-zero derivatives; action samplers clamp. Stationary same-anchor idle soles are checked for 2cm drift. Both feet receive a local below-floor leg IK projection, smoothly ramped over the first/last10% to retain exact C1 endpoints; raw and projected floor minima are reported separately. Moving run soles and nonmatching anchors are not classified as planted. Actor translation and full world support-anchor locking remain consumer responsibilities. This does not replace the motion-qa continuity metric.',
  thresholds:{endpointHipsMeters:1e-9,endpointRotationDegrees:1e-5,endpointVelocityHipsMetersPerSecond:1e-4,endpointVelocityRotationRadiansPerSecond:.01,maximum240HzHipsStepMeters:.02,maximum240HzRotationStepDegrees:10,stationaryIdleSoleDriftMeters:.02,minimumGroundedSoleYMeters:-.02},
  sourceFiles:[...references,...motions].map(({path,sha256}) => ({path,sha256})),
  helperFiles:['runtime/player.mjs','../soccer-header-v1/runtime/player.mjs','../soccer-header-v1/source/rig.mjs'].map(path => ({path,sha256:hash(read(path))})),
  summary:{bridges:results.length,passed:results.filter(r => r.pass).length,maxEndpointRotationDegrees:Math.max(...results.flatMap(r => Object.values(r.c0).map(v => v.rotationDegrees))),maxEndpointVelocityRadiansPerSecond:Math.max(...results.flatMap(r => Object.values(r.c1).map(v => v.rotationRadiansPerSecond))),maxHipsStepMeters:Math.max(...results.map(r => r.maxHipsStepMeters)),maxRotationStepDegrees:Math.max(...results.map(r => r.maxRotationStepDegrees)),stationaryIdleSoleCases:applicablePlants.length,maxStationaryIdleSoleDriftMeters:Math.max(0,...applicablePlants.map(p => p.maxDriftMeters)),minimumRawBridgeSoleYMeters:Math.min(...results.map(r => r.minRawSoleYMeters)),minimumGroundedBridgeSoleYMeters:Math.min(...results.map(r => r.minSoleYMeters)),allPassed:results.length === 112 && results.every(r => r.pass)},
  bridges:results,
};
mkdirSync(new URL('verification/',root),{recursive:true});
writeFileSync(new URL('verification/transitions.json',root),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence.summary,null,2));
if (!evidence.summary.allPassed) process.exitCode = 1;
