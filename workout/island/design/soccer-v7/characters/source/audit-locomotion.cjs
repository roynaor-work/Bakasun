/**
 * Independent all-vertex audit of continuous-phase locomotion in the actual
 * local classic-script viewer. No controller, pose, skinning or IK is replaced.
 *
 * node source/audit-locomotion.cjs --sample-hz=30
 * node source/audit-locomotion.cjs --sample-hz=120
 * Defaults: player-01 / LOD0; 69 handoffs (20 distinct ordered five-speed run
 * pairs plus sprint→run_1, idle→sprint and sprint→idle, at three entry phases).
 * --character=goalkeeper --lod=1 selects another actual model.
 * --out=/absolute/report.json overrides verification/locomotion-<rate>hz.json.
 * --critical-only runs the nine edge cases and is explicitly incomplete.
 * --diagnostic-runtime=/absolute/runtime.js overrides ONLY that localhost
 * response, labels the run diagnostic and always leaves complete:false.
 * Optional --diagnostic-source=/absolute/file adds an immutable prototype input.
 *
 * Runs real stateful 30/120Hz controllers, then checks every skinned vertex
 * after IK. Rendering/RAF are suppressed only during deterministic sampling;
 * these measurements do not establish phone GPU performance or visual quality.
 * Plant obligations come from independently recomputed heel crossings and
 * frozen authored stance fractions. Early releases require the independently
 * observed preceding-frame hip geometry and documented reach predicate.
 * A stationary neutral step requires the other actual foot to be planted.
 * Ground drift, angular speed, root-relative speed and C0 gates apply throughout.
 * Target fulfillment requires observed speed and neutral feet, held for .2s;
 * merely reporting a request complete does not satisfy that witness.
 * Native decoded GLBs, served bytes, canonical motion, manifest, helper, motor
 * and auditor inputs are hashed; diagnostic runtime overrides never count as
 * final actual-main coverage. The unweighted logical Root is excluded from limb
 * velocity gates; its zero-weight assumption is independently checked below.
 */
const fs=require('node:fs');
const path=require('node:path');
const {openAuditViewer,packageRoot,sha,declaredSourceBindings}=require('./audit-viewer-session.cjs');
const args=process.argv;
const arg=(name,fallback)=>{const value=args.find(x=>x.startsWith(name+'='));const at=args.indexOf(name);return value?value.slice(name.length+1):at>=0?args[at+1]:fallback;};
const hz=Number(arg('--sample-hz',arg('--hz',30)));
if(![30,120].includes(hz))throw Error('--sample-hz must be 30 or 120');
const allGaits=!args.includes('--critical-only');
const runtime=arg('--diagnostic-runtime',null);
const characterID=arg('--character','player-01'),testedLOD=Number(arg('--lod',0));
if(![0,1].includes(testedLOD))throw Error('--lod must be 0 or 1');
const output=path.resolve(arg('--out',path.join(packageRoot,`verification/locomotion-${hz}hz.json`)));
const diagnosticSources=args.filter(x=>x.startsWith('--diagnostic-source=')).map(x=>path.resolve(x.slice(20)));
const relativeInputs=['asset-manifest.json','animations.json','rig.json','motion-manifest.json','preview.html','preview.css','preview.js','source/motion-runtime.js','source/locomotion-space.js','source/locomotion-curve.js',...(fs.readFileSync(path.join(packageRoot,'preview.js'),'utf8').includes('./source/recovery-state.js')?['source/recovery-state.js']:[])].filter(file=>fs.existsSync(path.join(packageRoot,file)));
const auditSource={file:'source/audit-locomotion.cjs',sha256:sha(fs.readFileSync(__filename))};
(async()=>{
 const session=await openAuditViewer({runtimePath:runtime,sourcePaths:[...relativeInputs.map(file=>path.join(packageRoot,file)),...diagnosticSources,__filename,path.join(__dirname,'audit-viewer-session.cjs')]});
 try{
  const report=await session.page.evaluate(async({hz,allGaits,characterID,testedLOD})=>{
   const api=soccerV7;await api.setView('body');await api.setCharacter(characterID);await api.setLOD(testedLOD);
   api.setPlaying(false);const renderer=api.inspect().renderer,render=renderer.render;renderer.render=()=>{};
   let logicalRootWeightedVertexCount=0;for(const mesh of api.inspect().actors[0].meshes){const rootIndex=mesh.skeleton.bones.findIndex(bone=>bone.name==='Root'),indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');if(rootIndex<0)throw Error('Canonical Root absent from skin');for(let i=0;i<indices.count;i++){const joints=[indices.getX(i),indices.getY(i),indices.getZ(i),indices.getW(i)],values=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];if(joints.some((joint,k)=>joint===rootIndex&&values[k]>1e-8))logicalRootWeightedVertexCount++;}}
   const dt=1/hz,results=[],speedOf=id=>id==='idle'?0:api.inspect().clipMap.get(id).speedMps;
   const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
   const snapshot=a=>{
    const bones={};for(const[name,bone]of Object.entries(a.bones))bones[name]={p:bone.getWorldPosition(a.world.clone()).toArray(),q:bone.getWorldQuaternion(bone.quaternion.clone()).normalize()};
    const soles=Object.fromEntries(['LeftFoot','RightFoot'].map(name=>[name,a.bones[name].localToWorld(a.world.clone().set(0,-.08,0)).toArray()]));
    const state=a.locomotion?.snapshot()||null;const motorHips=a.motorOrigin?Object.fromEntries(['LeftFoot','RightFoot'].map(name=>{const hip=a.bones[name.replace(/Foot$/,'')+'UpLeg'].getWorldPosition(a.world.clone()).sub(a.motorOrigin).applyAxisAngle(a.world.clone().set(0,1,0),-a.motorYaw);return[name,{x:hip.x,y:hip.y,z:hip.z-(state?.rootDistance||0)}];})):null;return{world:a.world.toArray(),position:a.model.position.toArray(),bones,soles,state,motorHips,floor:a.minimumYReference(),locks:[...a.locks].map(([name,lock])=>({name,key:lock.key,anchor:lock.anchor.toArray()}))};
   };
   const difference=(before,after,seconds)=>{
    let angle=0,boneName=null,relative=0,relativeBone=null,position=0;
    for(const[name,bone]of Object.entries(after.bones)){
     if(name!=='Root'){
      const angular=before.bones[name].q.angleTo(bone.q);if(angular>angle){angle=angular;boneName=name;}
      const travel=Math.hypot(...bone.p.map((x,i)=>(x-after.world[i])-(before.bones[name].p[i]-before.world[i])));if(travel>relative){relative=travel;relativeBone=name;}
     }
     position=Math.max(position,distance(bone.p,before.bones[name].p));
    }
    return{angularRadians:angle,angularBone:boneName,angularSpeed:seconds?angle/seconds:null,relativeMeters:relative,relativeBone,relativeSpeed:seconds?relative/seconds:null,maximumBonePositionMeters:position,rootJumpMeters:distance(before.world,after.world)};
   };
   const pairs=[['sprint','run_1'],['idle','sprint'],['sprint','idle']];if(allGaits){const runs=['run_1','run_2','run_3','run_4','run_5'];pairs.unshift(...runs.flatMap(start=>runs.filter(target=>target!==start).map(target=>[start,target])));}
   for(const[start,target]of pairs)for(const phase of[.18,.5,.85]){
    api.setPlaying(false);api.setClip(start);api.seek(phase);const a=api.inspect().actors[0];
    let previous=snapshot(a);api.setPlaying(true);api.step(0);let initial=snapshot(a);
    const initJump=difference(previous,initial,0);previous=initial;
    const row={name:`${start} to ${target} @ ${phase}`,start,target,phase,samples:0,minimumVertexY:Infinity,maximumAnchorDistanceMeters:0,maximumAngularSpeed:0,maximumRelativeSpeed:0,maximumNearGroundUnplantedXZStep:0,maximumPlantedSoleStep:0,expectedSupportSamples:0,admittedSupportSamples:0,heelCrossings:[],missingHeelRecords:[],immutableHeelChanges:[],stanceFractionErrors:[],contributorErrors:[],phaseReversals:[],observedSpeedErrors:[],maximumObservedRootSpeedMps:0,earlyReleases:[],invalidReleasePredicates:[],fulfillment:null,trace:[],initJump};
    const seen=new Map(),seenReleases=new Map(),releaseValidity=new Map(),allHeelRecords=new Map(),nodes=['run_1','run_2','run_3','run_4','run_5','sprint'].map(id=>api.inspect().clipMap.get(id));
    function expectedFraction(speed){let lo=nodes[0],hi=lo;for(const node of nodes){if(node.speedMps<=speed)lo=node;if(node.speedMps>=speed){hi=node;break;}hi=node;}const f=node=>{const contact=node.contacts.find(x=>x.bone==='LeftFoot'&&x.mode==='plant');return(contact.end-contact.start)/node.duration;};const w=hi===lo?0:Math.max(0,Math.min(1,(speed-lo.speedMps)/(hi.speedMps-lo.speedMps)));return f(lo)*(1-w)+f(hi)*w;}
    let time=0,requestTime=null,requestID=null,stable=0;
    function measure(){
     const next=snapshot(a),state=next.state;if(!state)throw Error('Prototype did not expose actor.locomotion.snapshot()');
     const observedSpeed=distance(previous.world,next.world)/dt;row.maximumObservedRootSpeedMps=Math.max(row.maximumObservedRootSpeedMps,observedSpeed);if(previous.state&&(observedSpeed<Math.min(previous.state.actualSpeed,state.actualSpeed)-.002||observedSpeed>Math.max(previous.state.actualSpeed,state.actualSpeed)+.002))row.observedSpeedErrors.push({time,observedSpeed,previousDeclared:previous.state.actualSpeed,declared:state.actualSpeed});const delta=difference(previous,next,dt);if(previous.state&&state.unwrappedPhase<previous.state.unwrappedPhase-1e-8)row.phaseReversals.push({time,before:previous.state.unwrappedPhase,after:state.unwrappedPhase});const positive=(state.contributors||[]).filter(x=>x.weight>1e-8);const weight=positive.reduce((sum,x)=>sum+x.weight,0);if(Math.abs(weight-1)>1e-6)row.contributorErrors.push({time,reason:'weights',weight});for(const contributor of positive){const id=contributor.clipID||contributor.clip,clip=api.inspect().clipMap.get(id);if(!clip){row.contributorErrors.push({time,reason:'unknown-clip',contributor});continue;}if(id!=='idle'){const clock=contributor.sampleSeconds??contributor.time,expected=(((state.unwrappedPhase%1)+1)%1)*clip.duration;if(Math.abs(clock-expected)>1e-6)row.contributorErrors.push({time,reason:'phase-clock',contributor,expected});}}row.samples++;row.minimumVertexY=Math.min(row.minimumVertexY,next.floor);
     if(delta.angularSpeed>row.maximumAngularSpeed){row.maximumAngularSpeed=delta.angularSpeed;row.worstAngular={time,...delta,previousState:previous.state,state,previousPosition:previous.bones[delta.angularBone].p,position:next.bones[delta.angularBone].p};}
     if(delta.relativeSpeed>row.maximumRelativeSpeed){row.maximumRelativeSpeed=delta.relativeSpeed;row.worstRelative={time,...delta,previousState:previous.state,state};}
     for(const lock of next.locks){const error=distance(next.soles[lock.name],lock.anchor);if(error>row.maximumAnchorDistanceMeters){row.maximumAnchorDistanceMeters=error;row.worstAnchor={time,lock,sole:next.soles[lock.name],state};}const prior=previous.locks.find(x=>x.name===lock.name&&x.key===lock.key);if(prior)row.maximumPlantedSoleStep=Math.max(row.maximumPlantedSoleStep,distance(previous.soles[lock.name],next.soles[lock.name]));}
     for(const record of state.heelRecords){
      const immutable=JSON.stringify({id:record.id,side:record.side,heelPhase:record.heelPhase,heelSpeed:record.heelSpeed,stanceFraction:record.stanceFraction,stanceEndPhase:record.stanceEndPhase,plannedAnchor:record.plannedAnchor,touchdownPhase:record.touchdownPhase,touchdownTime:record.touchdownTime,reason:record.reason});
      if(seen.has(record.id)&&seen.get(record.id)!==immutable)row.immutableHeelChanges.push({time,id:record.id});else if(!seen.has(record.id)){seen.set(record.id,immutable);if(record.reason!=='idle-settle'){const expected=expectedFraction(record.heelSpeed);if(Math.abs(expected-record.stanceFraction)>1e-6)row.stanceFractionErrors.push({time,id:record.id,expected,actual:record.stanceFraction});}}
      if(record.release){const release=JSON.stringify(record.release);if(seenReleases.has(record.id)&&seenReleases.get(record.id)!==release)row.immutableHeelChanges.push({time,id:record.id,field:"release"});else if(!seenReleases.has(record.id))seenReleases.set(record.id,release);}allHeelRecords.set(record.id,record);
     }
     if(previous.state&&state.unwrappedPhase>=previous.state.unwrappedPhase){for(const[side,offset]of[['LeftFoot',0],['RightFoot',.5]]){let heel=Math.floor(previous.state.unwrappedPhase-offset)+1+offset;while(heel<=state.unwrappedPhase){const found=state.heelRecords.find(record=>record.side===side&&Math.abs(record.heelPhase-heel)<1e-5);row.heelCrossings.push({time,side,phase:heel,record:found?.id||null});if(!found)row.missingHeelRecords.push({time,side,phase:heel});heel+=1;}}}
     for(const record of state.heelRecords)if(record.release&&!releaseValidity.has(record.id)){
      const release=record.release,prediction=release.reachPrediction;let valid=false,diagnostic={time,id:record.id,side:record.side,reason:release.reason};
      if(release.reason==='predicted-leg-reach'&&prediction&&previous.motorHips?.[record.side]){
       const hip=previous.motorHips[record.side],v=release.releaseSpeed,anticipation=.02,smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);},target=state.targetSpeed;
       const advance=(speed,t)=>speed+Math.max(-4.5*t,Math.min(3.5*t,target-speed));
       const future=release.rootDistance+(v+advance(v,anticipation))*.5*anticipation;
       const liftedAnkle=record.plannedAnchor[1]+.08+(.10+.015*v)*smooth(anticipation/.06);
       const current=Math.hypot(hip.x-record.plannedAnchor[0],hip.y-record.plannedAnchor[1]-.08,release.rootDistance+hip.z-record.plannedAnchor[2]);
       const predicted=Math.hypot(hip.x-record.plannedAnchor[0],hip.y-liftedAnkle,future+hip.z-record.plannedAnchor[2]);
       const limit=.77-.01*smooth(v/1.6),rearward=release.rootDistance+hip.z>record.plannedAnchor[2];
       const geometryError=Math.max(Math.abs(hip.x-prediction.hipX),Math.abs(hip.y-prediction.hipHeight),Math.abs(hip.z-prediction.hipZ));
       const age=release.time-previous.state.clock;
       valid=rearward&&(current>limit-1e-7||predicted>.772-1e-7)&&geometryError<1e-6&&Math.abs(prediction.geometryMeasuredAt-previous.state.clock)<1e-6&&age>=-1e-6&&age<=dt+1e-6;
       diagnostic={...diagnostic,valid,current,predicted,limit,rearward,geometryError,age,measuredAt:prediction.geometryMeasuredAt,release};
      }else if(release.reason==='neutral-stop-step'){
       const other=record.side==='LeftFoot'?'RightFoot':'LeftFoot',lock=next.locks.find(lock=>lock.name===other),gap=Math.abs(record.plannedAnchor[2]-release.rootDistance);
       valid=release.releaseSpeed<.03&&gap>.012&&Boolean(lock)&&distance(next.soles[other],lock.anchor)<=.003&&Math.abs(next.soles[other][1])<=.003;
       diagnostic={...diagnostic,valid,gap,release,otherSole:next.soles[other],otherLock:lock};
      }else if(['authored-toeoff','start-step','seed-swing'].includes(release.reason))valid=true;
      releaseValidity.set(record.id,valid);row.earlyReleases.push(diagnostic);if(!valid)row.invalidReleasePredicates.push(diagnostic);
     }
     const expected=new Set();for(const record of state.heelRecords){if(record.reason==='idle-settle'){if(state.actualSpeed<.03&&state.feet[record.side].mode==='plant')expected.add(record.side);continue;}if(state.unwrappedPhase>=record.heelPhase-1e-6&&state.unwrappedPhase<record.stanceEndPhase-1e-8){if(record.release&&releaseValidity.get(record.id)&&['predicted-leg-reach','neutral-stop-step','start-step'].includes(record.release.reason))continue;expected.add(record.side);}}
     if(state.actualSpeed<.03&&state.targetSpeed===0)for(const[side,foot]of Object.entries(state.feet))if(foot.mode==='plant')expected.add(side);
     for(const side of expected){row.expectedSupportSamples++;if(next.locks.some(lock=>lock.name===side))row.admittedSupportSamples++;}
     for(const side of['LeftFoot','RightFoot'])if(!next.locks.some(lock=>lock.name===side)&&next.soles[side][1]<=.008&&previous.soles[side][1]<=.008){const drift=Math.hypot(next.soles[side][0]-previous.soles[side][0],next.soles[side][2]-previous.soles[side][2]);if(drift>row.maximumNearGroundUnplantedXZStep){row.maximumNearGroundUnplantedXZStep=drift;row.worstNearGround={time,side,previousSole:previous.soles[side],sole:next.soles[side],expected:expected.has(side),state};}}
     row.trace.push({time,clock:state.clock,phase:state.unwrappedPhase,speed:state.actualSpeed,targetSpeed:state.targetSpeed,rootDistance:state.rootDistance,contributors:state.contributors,feet:Object.fromEntries(Object.entries(state.feet).map(([name,foot])=>[name,{mode:foot.mode,heelPhase:foot.heelPhase,position:foot.position}])),request:state.requests.find(request=>request.id===requestID)||null});
     if(requestTime!==null){const request=state.requests.find(request=>request.id===requestID);const targetReached=Math.abs(state.actualSpeed-speedOf(target))<.01&&Math.abs(observedSpeed-speedOf(target))<.03;const yaw=a.motorYaw??a.baseYaw??a.model.rotation.y;const stopped=target!=='idle'||Object.entries(state.feet).every(([side,foot])=>{const sole=next.soles[side],dx=sole[0]-next.world[0],dz=sole[2]-next.world[2],forward=dx*Math.sin(yaw)+dz*Math.cos(yaw),lateral=dx*Math.cos(yaw)-dz*Math.sin(yaw);return foot.mode==='plant'&&Math.abs(forward)<.015&&Math.abs(lateral-(side==='LeftFoot'?.1:-.1))<.015&&Math.abs(sole[1])<.003;});stable=targetReached&&stopped?stable+dt:0;if(stable>=.2&&row.fulfillment===null)row.fulfillment={time,delay:time-requestTime,speed:state.actualSpeed,observedRootSpeedMps:observedSpeed,request};}
     previous=next;
    }
    for(let i=0;i<Math.ceil(.05*hz);i++){api.step(dt);time+=dt;measure();}
    const before=snapshot(a);api.setClip(target);const after=snapshot(a);row.requestJump=difference(before,after,0);row.requestPhaseJump=(after.state?.unwrappedPhase??0)-(before.state?.unwrappedPhase??0);requestTime=time;requestID=after.state.requestID;previous=after;
    while(time-requestTime<4.5-1e-8){api.step(dt);time+=dt;measure();if(row.fulfillment&&time-row.fulfillment.time>=.25)break;}
    row.final=previous.state;row.heelRecords=[...allHeelRecords.values()];row.supportAdmission=row.expectedSupportSamples?row.admittedSupportSamples/row.expectedSupportSamples:1;
    row.checks={fullMeshFloor:row.minimumVertexY>=-.001,plantAnchors:row.maximumAnchorDistanceMeters<=.003,jointAngularSpeed:row.maximumAngularSpeed<=30,relativeBoneSpeed:row.maximumRelativeSpeed<=25,nearGroundDrift:row.maximumNearGroundUnplantedXZStep<=.003,immediateBones:row.requestJump.maximumBonePositionMeters<=.003&&row.initJump.maximumBonePositionMeters<=.003,immediateOrientation:row.requestJump.angularRadians<=Math.PI/180&&row.initJump.angularRadians<=Math.PI/180,immediateRoot:row.requestJump.rootJumpMeters<=.0005,immutableHeels:!row.immutableHeelChanges.length,releasePredicates:!row.invalidReleasePredicates.length,observedRootSpeed:!row.observedSpeedErrors.length,continuousPhase:!row.phaseReversals.length&&(start==='idle'||Math.abs(row.requestPhaseJump)<1e-8),contributorClocks:!row.contributorErrors.length,frozenStanceFractions:!row.stanceFractionErrors.length,heelCrossingCoverage:!row.missingHeelRecords.length,supportAdmission:row.supportAdmission>=.98,requestFulfilled:row.fulfillment!==null};row.pass=Object.values(row.checks).every(Boolean);results.push(row);
   }
   renderer.render=render;return{hz,results,logicalRootWeightedVertexCount,declaredHashes:api.inspect().data.hashes,state:api.state()};
  },{hz,allGaits,characterID,testedLOD});
  report.kind=runtime?'diagnostic-runtime-locomotion':'actual-bundled-viewer-locomotion';
  report.auditSource=auditSource;report.metadata=session.metadata();report.prototype=Boolean(runtime);report.characterID=characterID;report.testedLOD=testedLOD;report.generatedAt=new Date().toISOString();
  report.limits={angularRadiansPerSecond:30,rootRelativeMetersPerSecond:25,nearGroundXZStepMeters:.003,plantAnchorMeters:.003,minimumVertexY:-.001,requestDeadlineSeconds:4.5};
  const inputs=Object.fromEntries(relativeInputs.map(file=>[file,report.metadata.immutableInputs[path.join(packageRoot,file)]]));
  report.inputs=inputs;
  report.declaredSourceBindings=declaredSourceBindings(report.declaredHashes,report.metadata.immutableInputs);
  report.checks={allDeclaredSourceHashesMatch:report.declaredSourceBindings.pass,noPageErrors:!session.errors.length,noRemoteRequests:!session.remoteRequests.length,immutableAuditInputs:report.metadata.unchanged.every(x=>x.pass),servedInputsUnchanged:report.metadata.servedUnchanged.every(x=>x.pass),actualNativeMatchesDisk:report.metadata.modelsMatchDisk.every(x=>x.pass),actualNativeMatchesDeclared:Object.entries(report.metadata.decodedModels).every(([file,meta])=>meta.sha256===report.declaredHashes.models[file]),requestedIdentityAndLOD:report.state.characterID===characterID&&Number(report.state.lod)===testedLOD&&report.state.models?.length===1&&report.state.models[0].path===`models/${characterID}-lod${testedLOD}.glb`&&Boolean(report.metadata.decodedModels[`models/${characterID}-lod${testedLOD}.glb`]),canonicalMotionMatchesDeclared:inputs['animations.json'].sha256===report.declaredHashes.motion,manifestMatchesDeclared:inputs['asset-manifest.json'].sha256===report.declaredHashes.manifest,motionHelperMatchesDeclared:inputs['source/motion-runtime.js'].sha256===report.declaredHashes.motionRuntime,logicalRootHasNoSkinWeights:report.logicalRootWeightedVertexCount===0,threeRevision160:String(report.state.threeRevision)==='160',sequences:report.results.length===(allGaits?69:9)&&report.results.every(x=>x.pass)};
  const provenance=['allDeclaredSourceHashesMatch','noPageErrors','noRemoteRequests','immutableAuditInputs','servedInputsUnchanged','actualNativeMatchesDisk','actualNativeMatchesDeclared','requestedIdentityAndLOD','canonicalMotionMatchesDeclared','manifestMatchesDeclared','motionHelperMatchesDeclared','logicalRootHasNoSkinWeights','threeRevision160'];
  report.complete=!runtime&&allGaits&&report.results.length===69&&provenance.every(key=>report.checks[key]);
  report.pass=Object.values(report.checks).every(Boolean);
  report.limitations=['Representative69 handoffs do not cover every action or variable frame time.','30Hz and120Hz are separate stateful trajectories.','World root velocity is measured while presentation floor lift remains in limb-relative velocity.','Playback controls seed canonical entry states before live requests.','These measurements establish neither EA-reference visual quality nor physical-phone GPU/FPS.'];
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,pass:report.pass,complete:report.complete,checks:report.checks,results:report.results.map(x=>({name:x.name,pass:x.pass,angular:x.maximumAngularSpeed,relative:x.maximumRelativeSpeed,anchor:x.maximumAnchorDistanceMeters,floor:x.minimumVertexY,nearGround:x.maximumNearGroundUnplantedXZStep,support:x.supportAdmission,missingHeels:x.missingHeelRecords.length,fulfillment:x.fulfillment?.delay,failed:Object.keys(x.checks).filter(k=>!x.checks[k])}))},null,2));if(!report.pass)process.exitCode=1;
 }finally{await session.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
