/** Original CC0-1.0. Independent audit of delivered files, without authoring imports. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(process.env.HOOPS_V10_TOOLS||'/tmp/hoops-v10-tools','package.json'));
export const BONES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
const PARENTS=[null,'Root','Hips','Spine','Chest','Neck','Chest','LeftArm','LeftForeArm','Chest','RightArm','RightForeArm','Hips','LeftUpLeg','LeftLeg','Hips','RightUpLeg','RightLeg'];
const I=[0,0,0,1],FEET=['LeftFoot','RightFoot'];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const distance=(a,b)=>Math.hypot(...sub(a,b));
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const qmul=(a,b)=>[
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
];
const rotate=(q,v)=>qmul(qmul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
const qdistance=(a,b)=>Math.min(distance(a,b),distance(a,b.map(v=>-v)));
function slerp(a,b,t){
  let d=dot(a,b);if(d<0){b=b.map(v=>-v);d=-d;}
  if(d>.9995){const result=lerp(a,b,t),n=Math.hypot(...result);return result.map(v=>v/n);}
  const angle=Math.acos(Math.min(1,d)),s=Math.sin(angle);
  return a.map((v,i)=>(Math.sin((1-t)*angle)*v+Math.sin(t*angle)*b[i])/s);
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const close=(a,b,tolerance=1e-5)=>a?.length===b?.length&&a.every((v,i)=>Math.abs(v-b[i])<=tolerance);
const json=async relative=>JSON.parse(await fs.readFile(path.join(ROOT,relative),'utf8'));

/** Independent FK includes the external root once. Bone Root itself stays identity. */
export function independentFK(profile,frame){
  const world={},rest={};
  for(const joint of profile.joints){
    const parent=world[joint.parent],restParent=rest[joint.parent];
    rest[joint.name]=restParent?add(restParent,joint.translation):joint.translation.slice();
    let local=joint.translation.slice();
    if(joint.name==='Hips')local=add(local,frame.hipsOffsetMeters);
    const rotation=frame.rotations[joint.name];
    world[joint.name]=parent?{position:add(parent.position,rotate(parent.rotation,local)),rotation:qmul(parent.rotation,rotation)}:{position:local,rotation:rotation.slice()};
  }
  const external=frame.rootRotationQuaternion||I,origin=frame.referenceRootTranslationMeters||[0,0,0];
  for(const joint of Object.values(world)){
    joint.position=add(origin,rotate(external,joint.position));joint.rotation=qmul(external,joint.rotation);
  }
  const palms=Object.fromEntries(['LeftHand','RightHand'].map(name=>[name,add(world[name].position,rotate(world[name].rotation,profile.palms[name].palmPoint))]));
  const soles=Object.fromEntries(FEET.map(name=>[name,add(world[name].position,rotate(world[name].rotation,[0,-rest[name][1],0]))]));
  return {world,palms,soles};
}

/** LINEAR vectors and shortest-arc SLERP match glTF LINEAR, without author easing. */
export function independentSample(clip,normalizedTime){
  const t=Math.max(0,Math.min(1,normalizedTime)),frames=clip.keyframes;
  let lo=0,hi=frames.length-1;
  while(hi-lo>1){const mid=(hi+lo)>>1;if(frames[mid].time<=t)lo=mid;else hi=mid;}
  const a=frames[lo],b=frames[hi],u=Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time||1)));
  return {time:t,rotations:Object.fromEntries(BONES.map(name=>[name,slerp(a.rotations[name],b.rotations[name],u)])),
    hipsOffsetMeters:lerp(a.hipsOffsetMeters,b.hipsOffsetMeters,u),
    referenceRootTranslationMeters:lerp(a.referenceRootTranslationMeters,b.referenceRootTranslationMeters,u),
    rootRotationQuaternion:slerp(a.rootRotationQuaternion||I,b.rootRotationQuaternion||I,u),
    ballPositionMeters:lerp(a.ballPositionMeters,b.ballPositionMeters,u),contacts:a.contacts,handContacts:a.handContacts,ballPhase:a.ballPhase};
}

/** Read delivered binary channels directly, so a matching JSON cannot hide export errors. */
export function parseGLB(bytes){
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Malformed GLB header');
  let document,bin;
  for(let offset=12;offset<bytes.length;){
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+length);
    if(type===0x4e4f534a)document=JSON.parse(chunk.toString('utf8').trim());
    if(type===0x004e4942)bin=chunk;
    offset+=8+length;
  }
  if(!document||!bin)throw Error('Missing GLB JSON/BIN chunk');
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},formats={5120:['getInt8',1],5121:['getUint8',1],5122:['getInt16',2],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]};
  const view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
  function accessor(index){
    const a=document.accessors[index],b=document.bufferViews[a.bufferView],width=components[a.type],[method,bytesPer]=formats[a.componentType],stride=b.byteStride||width*bytesPer;
    if(a.sparse)throw Error('Unexpected sparse runtime accessor');
    const start=(b.byteOffset||0)+(a.byteOffset||0),values=[];
    for(let i=0;i<a.count;i++){const item=[];for(let j=0;j<width;j++)item.push(view[method](start+i*stride+j*bytesPer,true));values.push(item);}
    return values;
  }
  return {document,accessor};
}

function compareGLB(profile,clip,parsed){
  const {document,accessor}=parsed,animation=document.animations?.[0],nodes=document.nodes||[],channels=[];
  let maximumValueError=0,maximumTimeError=0,maximumBindError=0;
  const failures=[];
  if(document.animations?.length!==1)failures.push('Expected exactly one animation');
  const extensions=[...(document.extensionsUsed||[]),...(document.extensionsRequired||[])];
  if(extensions.some(x=>/draco|meshopt/i.test(x)))failures.push('Compressed runtime needs blocked decoder');
  for(const joint of profile.joints){
    const node=nodes.find(n=>n.name===joint.name);
    if(!node){failures.push(`Missing bone ${joint.name}`);continue;}
    maximumBindError=Math.max(maximumBindError,distance(node.translation||[0,0,0],joint.translation));
    if(!close(node.scale||[1,1,1],[1,1,1]))failures.push(`Scaled bone ${joint.name}`);
  }
  for(const channel of animation?.channels||[]){
    const sampler=animation.samplers[channel.sampler],node=nodes[channel.target.node],property=channel.target.path;
    if(sampler.interpolation&&sampler.interpolation!=='LINEAR')failures.push(`Unexpected interpolation ${sampler.interpolation}`);
    if(property==='scale')failures.push(`Animated scale on ${node.name}`);
    const times=accessor(sampler.input).map(v=>v[0]),values=accessor(sampler.output);
    if(times.length!==clip.keyframes.length||values.length!==clip.keyframes.length)failures.push(`Frame count mismatch ${node.name}/${property}`);
    for(let i=0;i<Math.min(times.length,clip.keyframes.length);i++){
      const frame=clip.keyframes[i];maximumTimeError=Math.max(maximumTimeError,Math.abs(times[i]-frame.time*clip.durationSeconds));
      let expected;
      if(BONES.includes(node.name)&&property==='rotation')expected=frame.rotations[node.name];
      else if(node.name==='Hips'&&property==='translation')expected=add(profile.joints.find(j=>j.name==='Hips').translation,frame.hipsOffsetMeters);
      else if(node.name==='Motion'&&property==='translation')expected=frame.referenceRootTranslationMeters;
      else if(node.name==='Motion'&&property==='rotation')expected=frame.rootRotationQuaternion||I;
      else if(node.name==='Ball'&&property==='translation')expected=frame.ballPositionMeters;
      else failures.push(`Unexpected channel ${node.name}/${property}`);
      if(expected)maximumValueError=Math.max(maximumValueError,property==='rotation'?qdistance(values[i],expected):distance(values[i],expected));
    }
    channels.push(`${node.name}/${property}`);
  }
  for(const required of [...BONES.map(name=>`${name}/rotation`),'Hips/translation','Motion/translation','Motion/rotation','Ball/translation'])if(!channels.includes(required))failures.push(`Missing channel ${required}`);
  if(maximumValueError>2e-5||maximumTimeError>2e-5||maximumBindError>2e-5)failures.push('GLB/JSON or bind mismatch');
  return {channels:channels.length,maximumValueError,maximumTimeError,maximumBindError,failures};
}

function modelGeometry(document,profile){
  const root=document.getRoot(),skin=root.listSkins()[0],jointNames=skin.listJoints().map(j=>j.getName());
  const bind=Object.fromEntries(skin.listJoints().map(j=>[j.getName(),j.getWorldTranslation()]));
  const primitives=root.listMeshes().flatMap(m=>m.listPrimitives()).map((p,index)=>{
    const pos=p.getAttribute('POSITION'),weights=p.getAttribute('WEIGHTS_0'),joints=p.getAttribute('JOINTS_0'),indices=p.getIndices()?.getArray()||Array.from({length:pos.getCount()},(_,i)=>i),edges=new Map();
    for(let i=0;i<indices.length;i+=3)for(const [a,b] of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){
      const key=a<b?`${a}:${b}`:`${b}:${a}`,length=distance(pos.getElement(a,[]),pos.getElement(b,[]));
      if(length>=.005&&!edges.has(key))edges.set(key,{a,b,length});
    }
    return {index,positions:Array.from({length:pos.getCount()},(_,i)=>pos.getElement(i,[])),weights:Array.from({length:weights.getCount()},(_,i)=>weights.getElement(i,[])),joints:Array.from({length:joints.getCount()},(_,i)=>joints.getElement(i,[])),edges:[...edges.values()]};
  });
  let weightError=0,invalidJoints=0;
  for(const p of primitives)for(let i=0;i<p.weights.length;i++){
    weightError=Math.max(weightError,Math.abs(p.weights[i].reduce((a,b)=>a+b,0)-1));
    invalidJoints+=p.joints[i].filter((j,k)=>p.weights[i][k]>0&&(!Number.isInteger(j)||j<0||j>=18)).length;
  }
  const hierarchyMatches=jointNames.length===18&&profile.joints.every(j=>{
    const actual=skin.listJoints().find(n=>n.getName()===j.name),parent=actual?.getParentNode();
    return actual&&close(actual.getTranslation(),j.translation)&&close(actual.getRotation(),I)&&close(actual.getScale(),[1,1,1])&&(j.parent?parent?.getName()===j.parent:!jointNames.includes(parent?.getName()));
  });
  return {jointNames,bind,primitives,hierarchyMatches,weightError,invalidJoints};
}
function deformVertex(geometry,p,index,fk){
  let result=[0,0,0];
  for(let k=0;k<4;k++)if(p.weights[index][k]){
    const name=geometry.jointNames[p.joints[index][k]],joint=fk.world[name],local=sub(p.positions[index],geometry.bind[name]),point=add(joint.position,rotate(joint.rotation,local));
    result=result.map((v,i)=>v+point[i]*p.weights[index][k]);
  }
  return result;
}
function surfaceAudit(geometry,profile,clip){
  const sampleTimes=[0,.125,.25,.375,.5,.625,.75,.875,1],ratios=[];
  let finite=true,collapsed=0,maximumEdgeStretch=0,minimumEdgeRatio=Infinity;
  const bounds={minimum:[Infinity,Infinity,Infinity],maximum:[-Infinity,-Infinity,-Infinity]};
  for(const time of sampleTimes){
    const fk=independentFK(profile,independentSample(clip,time));
    for(const p of geometry.primitives){
      const deformed=p.positions.map((_,i)=>deformVertex(geometry,p,i,fk));
      for(const point of deformed){finite&&=point.every(Number.isFinite);point.forEach((v,i)=>{bounds.minimum[i]=Math.min(bounds.minimum[i],v);bounds.maximum[i]=Math.max(bounds.maximum[i],v);});}
      for(const e of p.edges){const ratio=distance(deformed[e.a],deformed[e.b])/e.length;ratios.push(ratio);maximumEdgeStretch=Math.max(maximumEdgeStretch,ratio);minimumEdgeRatio=Math.min(minimumEdgeRatio,ratio);if(ratio<.05)collapsed++;}
    }
  }
  ratios.sort((a,b)=>a-b);
  const p99EdgeStretch=ratios[Math.floor((ratios.length-1)*.99)],collapsedEdgeFraction=collapsed/ratios.length;
  // Fixed before authoring results: same broad corruption gates used by tall-v1.
  return {sampleTimes,vertices:geometry.primitives.reduce((n,p)=>n+p.positions.length,0),edgesSampled:ratios.length,finite,bounds,p99EdgeStretch,maximumEdgeStretch,minimumEdgeRatio,collapsedEdgeFraction,
    gates:{p99EdgeStretchLessThan:3,maximumEdgeStretchLessThan:8,minimumRestEdgeMeters:.005},pass:finite&&p99EdgeStretch<3&&maximumEdgeStretch<8};
}

function measureClip(profile,clip,meta,geometry){
  const failures=[],frames=clip.keyframes,fps=clip.fps,expectedIntervals=Math.round(clip.durationSeconds*30);
  if(fps!==30||frames.length!==expectedIntervals+1)failures.push('Expected endpoint-inclusive 30Hz samples');
  if(JSON.stringify(Object.keys(frames[0].rotations))!==JSON.stringify(BONES))failures.push('Canonical18 joint order mismatch');
  if(clip.skeleton?.bones&&JSON.stringify(clip.skeleton.bones.map(b=>[b.name,b.parent]))!==JSON.stringify(BONES.map((name,i)=>[name,PARENTS[i]])))failures.push('Skeleton parent mismatch');
  let maximumQuaternionNormError=0,maximumRootLocalRotationError=0,maximumBoneLengthError=0,maximumFrameTimeError=0,maximumRootVerticalMotion=0;
  let maximumPlantedAnchorDistanceMeters=0,maximumPlantedHorizontalDistanceMeters=0,maximumPlantedHeightMeters=0,plantedSamples=0,finite=true,rootDistanceMeters=0;
  const footfalls=[],contactRuns={LeftFoot:0,RightFoot:0},releaseEvents=(clip.events||[]).filter(e=>e.type==='ball_release'),gatherEvents=(clip.events||[]).filter(e=>e.type==='ball_gather');
  let handContactSamples=0,maximumHandBallSurfaceErrorMeters=0,worstHandContact=null,contactsAfterRelease=0;
  for(let i=0;i<frames.length;i++){
    const frame=frames[i],fk=independentFK(profile,frame);
    maximumFrameTimeError=Math.max(maximumFrameTimeError,Math.abs(frame.time*clip.durationSeconds-i/30));
    maximumRootVerticalMotion=Math.max(maximumRootVerticalMotion,Math.abs(frame.referenceRootTranslationMeters[1]));
    maximumRootLocalRotationError=Math.max(maximumRootLocalRotationError,qdistance(frame.rotations.Root,I));
    for(const name of [...BONES,'__external']){
      const q=name==='__external'?frame.rootRotationQuaternion||I:frame.rotations[name];
      maximumQuaternionNormError=Math.max(maximumQuaternionNormError,Math.abs(Math.hypot(...q)-1));finite&&=q.every(Number.isFinite);
    }
    for(const j of profile.joints){
      finite&&=fk.world[j.name].position.every(Number.isFinite);
      if(j.parent&&j.name!=='Hips')maximumBoneLengthError=Math.max(maximumBoneLengthError,Math.abs(distance(fk.world[j.name].position,fk.world[j.parent].position)-Math.hypot(...j.translation)));
    }
    finite&&=[...frame.hipsOffsetMeters,...frame.referenceRootTranslationMeters,...frame.ballPositionMeters].every(Number.isFinite);
    const ballWorld=add(frame.referenceRootTranslationMeters,rotate(frame.rootRotationQuaternion||I,frame.ballPositionMeters));
    for(const hand of ['LeftHand','RightHand']){
      if(typeof frame.handContacts?.[hand]?.touching!=='boolean')failures.push(`Missing explicit hand contact ${i}/${hand}`);
      if(frame.handContacts?.[hand]?.touching){
        handContactSamples++;const error=Math.abs(distance(fk.palms[hand],ballWorld)-(clip.ball?.radiusMeters||.12));
        if(error>maximumHandBallSurfaceErrorMeters){maximumHandBallSurfaceErrorMeters=error;worstHandContact={hand,timeSeconds:frame.time*clip.durationSeconds,palmWorldMeters:fk.palms[hand],ballWorldMeters:ballWorld,errorMeters:error};}
        if(releaseEvents.some(e=>frame.time*clip.durationSeconds>e.timeSeconds+1e-6))contactsAfterRelease++;
      }
    }
    if(i)rootDistanceMeters+=distance(frame.referenceRootTranslationMeters,frames[i-1].referenceRootTranslationMeters);
    for(const foot of FEET){
      const contact=frame.contacts?.[foot];
      if(!contact||typeof contact.planted!=='boolean')failures.push(`Missing explicit contact ${i}/${foot}`);
      if(contact?.planted&&(!i||!frames[i-1].contacts?.[foot]?.planted)){contactRuns[foot]++;if(i)footfalls.push({foot,timeSeconds:frame.time*clip.durationSeconds});}
      if(contact?.planted){
        if(!Array.isArray(contact.anchorWorldMeters))failures.push(`Missing world anchor ${i}/${foot}`);
        else{
          plantedSamples++;const delta=sub(fk.soles[foot],contact.anchorWorldMeters);
          maximumPlantedAnchorDistanceMeters=Math.max(maximumPlantedAnchorDistanceMeters,Math.hypot(...delta));
          maximumPlantedHorizontalDistanceMeters=Math.max(maximumPlantedHorizontalDistanceMeters,Math.hypot(delta[0],delta[2]));
          maximumPlantedHeightMeters=Math.max(maximumPlantedHeightMeters,Math.abs(fk.soles[foot][1]));
        }
      }
    }
  }
  // Between baked keys, only intervals whose endpoints share a planted anchor qualify.
  for(let i=0;i<frames.length-1;i++)for(let subdivision=1;subdivision<4;subdivision++){
    const a=frames[i],b=frames[i+1],frame=independentSample(clip,(i+subdivision/4)/expectedIntervals),fk=independentFK(profile,frame);
    for(const foot of FEET){const ca=a.contacts[foot],cb=b.contacts[foot];if(ca.planted&&cb.planted&&distance(ca.anchorWorldMeters,cb.anchorWorldMeters)<1e-6){
      plantedSamples++;const delta=sub(fk.soles[foot],ca.anchorWorldMeters);
      maximumPlantedAnchorDistanceMeters=Math.max(maximumPlantedAnchorDistanceMeters,Math.hypot(...delta));
      maximumPlantedHorizontalDistanceMeters=Math.max(maximumPlantedHorizontalDistanceMeters,Math.hypot(delta[0],delta[2]));
      maximumPlantedHeightMeters=Math.max(maximumPlantedHeightMeters,Math.abs(fk.soles[foot][1]));
    }}
  }
  if(!finite)failures.push('Nonfinite pose');
  if(maximumQuaternionNormError>1e-5||maximumBoneLengthError>1e-5||maximumRootLocalRotationError>1e-5)failures.push('Joint deformation or nonidentity bone Root');
  if(maximumFrameTimeError>1e-6||maximumRootVerticalMotion>1e-6)failures.push('Sample time/root vertical mismatch');
  if(maximumPlantedAnchorDistanceMeters>.0200001)failures.push('Planted foot exceeds 2cm 3D anchor tolerance');
  if(!plantedSamples)failures.push('No measurable foot contacts');
  if(maximumHandBallSurfaceErrorMeters>.0200001)failures.push('Declared hand contact misses ball surface by more than 2cm');
  if(contactsAfterRelease)failures.push('Hand remains touching after ball_release');
  if(['dunk','layup','shot'].includes(meta.kind)&&releaseEvents.length!==1)failures.push('Shooting action needs exactly one ball_release');
  if(releaseEvents.length&&Math.abs((clip.ball?.releaseTimeSeconds??Infinity)-releaseEvents[0].timeSeconds)>1e-6)failures.push('Ball release metadata disagrees with release event');
  const cadenceWindow=meta.cadenceWindowSeconds||[0,clip.durationSeconds],within=footfalls.filter(s=>s.timeSeconds>=cadenceWindow[0]-1e-6&&s.timeSeconds<=cadenceWindow[1]+1e-6);
  // Two feet landing together form one contact instant, not an infinite-rate step.
  const contactTimes=[...new Set(within.map(s=>s.timeSeconds))].sort((a,b)=>a-b);
  const intervals=contactTimes.slice(1).map((time,i)=>time-contactTimes[i]),observedCadence=intervals.length?intervals.length/intervals.reduce((a,b)=>a+b,0):null;
  if(meta.cadenceTargetStepsPerSecond&&observedCadence&&Math.abs(observedCadence-meta.cadenceTargetStepsPerSecond)>.75)failures.push('Approach cadence differs by more than .75 steps/s');
  const surface=surfaceAudit(geometry,profile,clip);if(!surface.pass)failures.push('LBS surface corruption gate');
  const result={id:clip.id,profile:profile.id,kind:meta.kind,durationSeconds:clip.durationSeconds,frames:frames.length,fps,plantedSamples,sampleHz:120,plantContactSampleHz:120,handContactSampleHz:30,
    maximumQuaternionNormError,maximumRootLocalRotationError,maximumBoneLengthError,maximumFrameTimeError,maximumRootVerticalMotion,
    maximumPlantedAnchorDistanceMeters,maximumPlantedHorizontalDistanceMeters,maximumPlantedHeightMeters,rootDistanceMeters,
    handContactSamples,maximumHandBallSurfaceErrorMeters,worstHandContact,contactsAfterRelease,
    footfalls,contactRuns,cadence:{windowSeconds:cadenceWindow,targetStepsPerSecond:meta.cadenceTargetStepsPerSecond||null,observedStepsPerSecond:observedCadence,distinctContactTimesSeconds:contactTimes,stepIntervalsSeconds:intervals,simultaneousLandingsCountOnce:true},
    ballEvents:{gather:gatherEvents,release:releaseEvents},surface,failures};
  if(clip.id.startsWith('dunk')||meta.kind?.startsWith('dunk')){
    const hands=clip.activeHands||meta.activeHands||['RightHand'],rim=clip.courtTarget?.rimCenterMeters||[0,3.05,2.4];
    let best={height:-Infinity},physicalBest={height:-Infinity};
    for(let i=0;i<=expectedIntervals*4;i++){
      const time=i/(expectedIntervals*4),frame=independentSample(clip,time);
      // A free follow-through cannot establish clearance for a delivered dunk.
      if(time*clip.durationSeconds>(clip.ball?.releaseTimeSeconds??-Infinity)+1e-6||hands.some(h=>!frame.handContacts?.[h]?.touching))continue;
      const fk=independentFK(profile,frame),height=Math.min(...hands.map(h=>fk.palms[h][1]));
      if(height>best.height)best={height,timeSeconds:time*clip.durationSeconds,positions:Object.fromEntries(hands.map(h=>[h,fk.palms[h]])),horizontalDistanceToRimMeters:Math.max(...hands.map(h=>Math.hypot(fk.palms[h][0]-rim[0],fk.palms[h][2]-rim[2])))};
      const positions=Object.fromEntries(hands.map(h=>{const surface=profile.palms[h].palmSurface;return [h,deformVertex(geometry,geometry.primitives[surface.primitive],surface.sourceVertex,fk)];})),physicalHeight=Math.min(...Object.values(positions).map(p=>p[1]));
      if(physicalHeight>physicalBest.height)physicalBest={height:physicalHeight,timeSeconds:time*clip.durationSeconds,positions};
    }
    const peakHipsLiftMeters=Math.max(...frames.map(f=>f.hipsOffsetMeters[1]));
    result.dunk={activeHands:hands,heldPeakOnly:true,rimCenterMeters:rim,peakHipsLiftMeters,peakPalm:best,clearanceMeters:best.height-rim[1],physicalPalm:physicalBest,physicalClearanceMeters:physicalBest.height-rim[1]};
    if(peakHipsLiftMeters>1.000001||best.height<rim[1]+.25-1e-5||physicalBest.height<rim[1]+.25-1e-5)failures.push('Dunk jump/25cm palm clearance gate');
    if(best.horizontalDistanceToRimMeters>.35)failures.push('Dunk hand misses horizontal rim region');
    if(releaseEvents.length!==1)failures.push('Dunk needs one ball_release event');
  }
  if(clip.id.startsWith('layup')){
    const gatherTime=gatherEvents[0]?.timeSeconds,releaseTime=releaseEvents[0]?.timeSeconds;
    const approachSteps=footfalls.filter(e=>Number.isFinite(gatherTime)&&Number.isFinite(releaseTime)&&e.timeSeconds>=gatherTime-1e-6&&e.timeSeconds<releaseTime-1e-6);
    result.layup={gatherTimeSeconds:gatherTime,releaseTimeSeconds:releaseTime,stepsAfterGather:approachSteps};
    if(gatherEvents.length!==1||releaseEvents.length!==1||approachSteps.length!==2||approachSteps[0]?.foot===approachSteps[1]?.foot)failures.push('Layup needs gather, two alternating steps, release');
  }
  result.pass=failures.length===0;
  return result;
}

async function listFiles(directory){const files=[];for(const e of await fs.readdir(directory,{withFileTypes:true})){const p=path.join(directory,e.name);if(e.isDirectory())files.push(...await listFiles(p));else files.push(p);}return files.sort();}

export async function verifyPackage({write=true}={}){
  const catalog=await json('runtime/catalog.json'),profiles=catalog.profiles,clips=catalog.clips,{NodeIO}=require('@gltf-transform/core'),io=new NodeIO(),validator=require('gltf-validator');
  const validation=[],models=[],geometries={},measurements=[],failures=[];
  async function validate(relative){
    const bytes=await fs.readFile(path.join(ROOT,relative)),report=await validator.validateBytes(new Uint8Array(bytes),{uri:relative,maxIssues:1000});
    const row={path:relative,bytes:bytes.length,sha256:hash(bytes),errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,messages:report.issues.messages};
    validation.push(row);if(row.errors)failures.push(`${relative}: ${row.errors} glTF errors`);return bytes;
  }
  if(catalog.fps!==30)failures.push('Catalog must explicitly declare 30Hz');
  if(profiles.length!==3||profiles.map(p=>p.heightMeters).join(',')!=='1.88,1.98,2.08')failures.push('Expected tall guard/wing/center heights');
  if(clips.length<18)failures.push('Expected all 18 requested performances');
  for(const profile of profiles){
    const relative=profile.model||`runtime/models/${profile.id}.glb`,bytes=await validate(relative),parsed=parseGLB(bytes),document=await io.readBinary(bytes),geometry=modelGeometry(document,profile);
    geometries[profile.id]=geometry;
    const row={profile:profile.id,path:relative,bytes:bytes.length,sha256:hash(bytes),hierarchyMatches:geometry.hierarchyMatches,weightError:geometry.weightError,invalidJoints:geometry.invalidJoints,extensions:parsed.document.extensionsUsed||[],vertices:geometry.primitives.reduce((n,p)=>n+p.positions.length,0)};
    models.push(row);if(!row.hierarchyMatches||row.weightError>1e-5||row.invalidJoints||row.extensions.some(x=>/draco|meshopt/i.test(x)))failures.push(`${profile.id}: invalid target model`);
  }
  for(const meta of clips)for(const profile of profiles){
    const clip=await json(`runtime/keyframes/${profile.id}/${meta.id}.json`),relative=`runtime/clips/${profile.id}/${meta.id}.glb`,bytes=await validate(relative),parity=compareGLB(profile,clip,parseGLB(bytes));
    const row=measureClip(profile,clip,meta,geometries[profile.id]);row.glb=parity;row.failures.push(...parity.failures);row.pass=row.failures.length===0;
    measurements.push(row);if(!row.pass)failures.push(`${profile.id}/${meta.id}: ${row.failures.join('; ')}`);
    console.log(`${row.pass?'PASS':'FAIL'} ${profile.id}/${meta.id}: foot ${(row.maximumPlantedAnchorDistanceMeters*100).toFixed(3)} cm${row.dunk?`, palm ${row.dunk.peakPalm.height.toFixed(3)} m`:''}`);
  }
  const files=[];
  for(const filename of await listFiles(ROOT)){
    const relative=path.relative(ROOT,filename),bytes=await fs.readFile(filename),generatedAuditOutput=/^verification\/(measurements|gltf-validation)\.json$/.test(relative);
    files.push(generatedAuditOutput?{path:relative,generatedAuditOutput:true}:{path:relative,bytes:bytes.length,sha256:hash(bytes)});
    if(filename.endsWith('.glb')&&!validation.some(row=>row.path===relative)){await validate(relative);parseGLB(bytes);}
    else if(filename.endsWith('.json'))JSON.parse(bytes.toString('utf8'));
    else if(/\.(png|webp|jpe?g)$/i.test(filename))await require('sharp')(bytes).raw().toBuffer();
    else if(/\.(mjs|js)$/.test(filename)){const syntax=spawnSync(process.execPath,['--check',filename],{encoding:'utf8'});if(syntax.status)failures.push(`${relative}: syntax ${syntax.stderr.trim()}`);}
  }
  const output={schemaVersion:1,method:'Independent delivered-JSON quaternion FK, raw delivered-GLB accessor parity, glTF Validator, and actual target-mesh linear blend skinning. External root applied once. Metres.',
    limitations:'120Hz foot measurements apply only while both neighbouring baked keys declare the same planted world anchor. Skin surface corruption gates sample nine poses per performance; they do not prove universal self-intersection or anatomical realism.',
    gates:{plantAnchorMaximumMeters:.02,handBallSurfaceMaximumErrorMeters:.02,fps:30,continuousMeasurementHz:120,quaternionNormError:1e-5,boneLengthErrorMeters:1e-5,dunkPalmClearanceMeters:.25,dunkMaximumHipsLiftMeters:1},
    profileCount:profiles.length,clipCount:clips.length,performanceCount:measurements.length,models,measurements,files,
    summary:{gltfFiles:validation.length,gltfErrors:validation.reduce((n,r)=>n+r.errors,0),gltfWarnings:validation.reduce((n,r)=>n+r.warnings,0),maximumPlantedAnchorDistanceMeters:Math.max(...measurements.map(m=>m.maximumPlantedAnchorDistanceMeters)),maximumHandBallSurfaceErrorMeters:Math.max(...measurements.map(m=>m.maximumHandBallSurfaceErrorMeters)),maximumGLBValueError:Math.max(...measurements.map(m=>m.glb.maximumValueError)),allPass:failures.length===0,failures}};
  if(write){await fs.mkdir(path.join(ROOT,'verification'),{recursive:true});await fs.writeFile(path.join(ROOT,'verification/measurements.json'),JSON.stringify(output,null,2)+'\n');await fs.writeFile(path.join(ROOT,'verification/gltf-validation.json'),JSON.stringify({schemaVersion:1,validatorVersion:validator.version(),files:validation},null,2)+'\n');}
  return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await verifyPackage();console.log(JSON.stringify(result.summary,null,2));if(!result.summary.allPass)process.exitCode=1;
}
