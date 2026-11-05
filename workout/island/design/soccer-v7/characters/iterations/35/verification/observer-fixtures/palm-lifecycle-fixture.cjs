const fixturePath=require('node:path'),fixturePackageRoot=fixturePath.resolve(__dirname,'../../../..');
const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
const root=fixturePackageRoot;
const THREE=await import('data:text/javascript;base64,'+fs.readFileSync(root+'/vendor/three.module.js').toString('base64'));
const {createPhysicalPalmObserver:factory}=require(root+'/source/audit-action-observer.cjs');
const evalFactory=process.argv.includes('--eval-factory'),createPhysicalPalmObserver=evalFactory?(0,eval)('('+factory.toString()+')'):factory;
const clone=x=>structuredClone(x),smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
function fixture(){
 const points=[[-.0225,-.05,-.03],[-.0025,-.01,-.03],[.0175,-.05,-.03]],weights=[.8,.9,.85];
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(points.flatMap(()=>[0,1,0,0]),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights.flatMap(w=>[w,1-w,0,0]),4));geometry.setIndex([0,1,2]);
 const hand=new THREE.Bone(),forearm=new THREE.Bone();hand.name='LeftHand';forearm.name='LeftForeArm';const skeleton=new THREE.Skeleton([hand,forearm],[new THREE.Matrix4(),new THREE.Matrix4()]);
 const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());mesh.name='syntheticHeelPalm';mesh.material.name='Skin';mesh.add(hand,forearm);mesh.bind(skeleton,new THREE.Matrix4());
 for(const bone of[hand,forearm]){bone.position.y=.0315;bone.rotation.x=-Math.PI/2;}mesh.updateMatrixWorld(true);skeleton.update();
 const actor={path:'models/synthetic-lod0.glb',meshes:[mesh],world:new THREE.Vector3(),clock:.5},hash='a'.repeat(64),contact={bone:'LeftHand',start:.5,end:.666667,mode:'hand-support'},clip={id:'get_up',duration:1.6,loop:false,contacts:[contact]};
 const api={inspect:()=>({clipMap:new Map([['get_up',clip],['fall',{id:'fall',duration:1,contacts:[]}]]),data:{hashes:{models:{[actor.path]:hash,'models/synthetic-lod1.glb':'b'.repeat(64)},motion:'c'.repeat(64),palmSupport:'e'.repeat(64)}}})};
 const calibration={kind:'anatomicalHeelPalmRayV1',calibrationSourceSha256:'e'.repeat(64),selector:{kind:'fixedHandLocalPalmarRay',region:'proximalPalmarHeel',coordinateFrame:'inverseBindHandLocalMeters',referenceXY:[-.0025,-.030],rayOriginZ:-.20,rayDirection:[0,0,1],palmarNormalZMaximum:-.5,minCornerHandInfluence:.5,minPointHandInfluence:.8,noFallback:true},handName:'LeftHand',modelSha256:hash,meshIndex:0,meshName:mesh.name,material:'Skin',triangleVertexIndices:[0,1,2],barycentricWeights:[.25,.5,.25],bindPositions:points,handLocalReferencePoint:[-.0025,-.03,-.03],handLocalNormal:[0,0,-1],namedInfluences:weights.map(w=>({LeftHand:w,LeftForeArm:1-w}))};
 const observer=createPhysicalPalmObserver({api,actor}),validation=observer.validateCalibration('LeftHand',calibration),point=observer.sampleWorld(validation).point;
 assert(Math.abs(point[1]-.0015)<1e-8,'real mixed-skin patch at1.5mm');
 const support={bone:'LeftHand',key:'get_up/LeftHand/contact0',clipID:'get_up',sourceContactStartSeconds:.5,sourceContactEndSeconds:.666667,admissionStartSourceSeconds:.32,approachSeconds:.18,releaseSeconds:.18,startedAtClock:.32,sourceTimeAtCreation:.32,anchorWorldMeters:point.slice(),orientationWorld:[-Math.SQRT1_2,0,0,Math.SQRT1_2],calibration,recipe:{kind:'synthetic-real-patch'},phase:'plant',weight:1,solverName:'nativePalmSurfaceIK',solverIterations:2,solveCount:1,lastSolveClock:.5};
 const descriptor={activeBaseClip:'get_up',baseSeconds:.5,clock:.5,contributors:[],palmSupports:[support]};
 function sample({time=actor.clock,dt=1/30,base=time,count=support.solveCount,mutate=null}={}){actor.clock=time;descriptor.clock=time;descriptor.baseSeconds=base;support.solveCount=count;support.lastSolveClock=time;if(mutate)mutate({support,descriptor,actor});const result=observer.sample({descriptor,clock:time,sampleDt:dt});return{result,report:observer.report()};}
 return{actor,observer,support,descriptor,sample,contact,point,hand,forearm,mesh,skeleton};
}
const checks={},evidence={},bugs=[];
function check(name,expected,run){try{const r=run();checks[name]=r.report.pass===expected;evidence[name]={expectedPass:expected,actualPass:r.report.pass,errorKinds:r.report.errors.map(x=>x.kind),unsupportedKinds:r.report.unsupported.map(x=>x.kind),expectedSamples:r.report.expectedSamples,observedSamples:r.report.observedSamples,positiveSolverSamples:r.report.positiveSolverSamples,validatedBones:r.result?.validatedBones||[]};if(!checks[name])bugs.push({name,...evidence[name]});}catch(error){checks[name]=false;bugs.push({name,error:String(error),stack:error.stack});}}
check('nativePlantAcceptsActualPatchPositiveSolver',true,()=>fixture().sample());
check('nativePositiveDtIncrementsCount',true,()=>{const f=fixture();f.sample();return f.sample({time:.5+1/30,count:2});});
check('nativeDtZeroKeepsCount',true,()=>{const f=fixture();f.sample();return f.sample({dt:0,count:1});});
check('nativeDtZeroCounterIncrementRejects',false,()=>{const f=fixture();f.sample();return f.sample({dt:0,count:2});});
check('nativePositiveDtStalledCounterRejects',false,()=>{const f=fixture();f.sample();return f.sample({time:.5+1/30,count:1});});
check('nativeExpectedStateMissingRejects',false,()=>fixture().sample({mutate:({descriptor})=>descriptor.palmSupports=[]}));
check('nativeMissingCalibrationRejects',false,()=>fixture().sample({mutate:({support})=>delete support.calibration}));
check('missingPublicSupportsArrayRejects',false,()=>fixture().sample({mutate:({descriptor})=>delete descriptor.palmSupports}));
check('genuineSameClipActivatedBodyRequestRestartAccepts',true,()=>{const f=fixture();f.descriptor.requests=[{id:'old-body-request',clipID:'get_up',scope:'body',activatedAt:.32}];f.sample();const t=.5+1/30;return f.sample({time:t,base:.5,count:1,mutate:({support,descriptor})=>{descriptor.requests.push({id:'new-body-request',clipID:'get_up',scope:'body',activatedAt:t});support.startedAtClock=t;support.sourceTimeAtCreation=.5;}});});
check('nativeNeverPositiveCountRejects',false,()=>fixture().sample({count:0}));
check('nativeWrongPhaseRejects',false,()=>fixture().sample({mutate:({support})=>support.phase='approach'}));
check('nativeAnchorMutationRejectsWithinGeometryTolerance',false,()=>{const f=fixture();f.sample();return f.sample({time:.5+1/30,count:2,mutate:({support})=>support.anchorWorldMeters[0]+=.001});});
check('nativeModelCalibrationMismatchRejects',false,()=>fixture().sample({mutate:({support})=>support.calibration.modelSha256='d'.repeat(64)}));
check('nativeSourceContactMismatchRejects',false,()=>fixture().sample({mutate:({support})=>{support.sourceContactStartSeconds=.51;support.admissionStartSourceSeconds=.33;}}));
check('nativeWeightClockMismatchRejects',false,()=>fixture().sample({base:.4,mutate:({support})=>{support.phase='approach';support.weight=.9;}}));
check('nativeMissingAdmissionClockRejects',false,()=>fixture().sample({mutate:({support})=>delete support.admissionStartSourceSeconds}));
check('nativeMissingCreationClockRejects',false,()=>fixture().sample({mutate:({support})=>delete support.startedAtClock}));
check('nativeMissingCreationSourceTimeRejects',false,()=>fixture().sample({mutate:({support})=>delete support.sourceTimeAtCreation}));
check('nativeWrongCalibrationHelperSourceRejects',false,()=>fixture().sample({mutate:({support})=>support.calibration.calibrationSourceSha256='f'.repeat(64)}));
check('nativeStaleSolverClockRejects',false,()=>fixture().sample({mutate:({support})=>support.lastSolveClock=.4}));
check('nativeReleaseWeightFollowsSourceClock',true,()=>{const f=fixture();f.sample();return f.sample({time:.7,count:2,mutate:({support})=>{support.phase='release';support.weight=1-smooth((.7-.666667)/.18);}});});
check('nativeApproachTravelIsDescriptive',true,()=>fixture().sample({time:.4,base:.4,mutate:({support})=>{support.phase='approach';support.weight=smooth((.4-.32)/.18);support.anchorWorldMeters[0]+=.15;}}));
function bridge(f,{elapsed=.1,duration=1,startClock=1,base='fall'}={}){
 f.bridgeStartClock=startClock;f.actor.clock=startClock+elapsed;f.descriptor.activeBaseClip=base;f.descriptor.bridgePlan={duration,sourcePalm:{bone:'LeftHand',position:f.hand.getWorldPosition(new THREE.Vector3()).toArray(),quaternion:f.hand.getWorldQuaternion(new THREE.Quaternion()).toArray()},immutableTag:'plan-A'};f.descriptor.constraints={elapsed};f.descriptor.episode={id:'episode-bridge-1'};
 f.support.bridgeLifecycle={episodeID:'episode-bridge-1',startClock,duration,holdEndSeconds:.25*duration,releaseEndSeconds:.40*duration};f.support.bridgeElapsedSeconds=elapsed;f.support.lastSolveClock=f.actor.clock;return f;
}
function bridgeSample(f,elapsed,count,mutate){f.descriptor.constraints.elapsed=elapsed;f.support.bridgeElapsedSeconds=elapsed;const u=Math.max(0,Math.min(1,(elapsed-.25)/.15));f.support.weight=1-smooth(u);f.support.phase=f.support.weight>=1-1e-6?'plant':'release';return f.sample({time:(f.bridgeStartClock??1)+elapsed,base:.5,count,mutate});}
check('bridgeFullHoldAndReleaseFromPlanAccepts',true,()=>{const f=bridge(fixture());bridgeSample(f,.1,1);bridgeSample(f,.25,2);bridgeSample(f,.325,3);return bridgeSample(f,.4,4);});
check('bridgeMissingExpectedHoldStateRejects',false,()=>{const f=bridge(fixture());return bridgeSample(f,.1,1,({descriptor})=>descriptor.palmSupports=[]);});
check('bridgeWrongDurationRejects',false,()=>{const f=bridge(fixture());f.support.bridgeLifecycle.duration=.9;return bridgeSample(f,.1,1);});
check('bridgeWrongHoldEndRejects',false,()=>{const f=bridge(fixture());f.support.bridgeLifecycle.holdEndSeconds=.2;return bridgeSample(f,.1,1);});
check('bridgeWrongReleaseEndRejects',false,()=>{const f=bridge(fixture());f.support.bridgeLifecycle.releaseEndSeconds=.5;return bridgeSample(f,.1,1);});
check('bridgeWrongElapsedRejects',false,()=>{const f=bridge(fixture());return bridgeSample(f,.1,1,({support})=>support.bridgeElapsedSeconds=.11);});
check('bridgeMissingStartClockRejects',false,()=>{const f=bridge(fixture());delete f.support.bridgeLifecycle.startClock;return bridgeSample(f,.1,1);});
check('bridgeWrongStartClockRejects',false,()=>{const f=bridge(fixture());f.support.bridgeLifecycle.startClock=.9;return bridgeSample(f,.1,1);});
check('bridgeWrongReleaseWeightRejects',false,()=>{const f=bridge(fixture());return bridgeSample(f,.325,1,({support})=>support.weight=.8);});
check('bridgeMutatedLifecycleRejects',false,()=>{const f=bridge(fixture());bridgeSample(f,.1,1);return bridgeSample(f,.2,2,({support})=>support.bridgeLifecycle.releaseEndSeconds=.5);});
check('bridgeMissingLifecycleRejectsEvenMatchingNativeBase',false,()=>{const f=bridge(fixture(),{base:'get_up'});return bridgeSample(f,.1,1,({support})=>delete support.bridgeLifecycle);});
check('bridgeInheritedPhysicalAnchorMutationRejectsAfterNative',false,()=>{const f=fixture();f.sample();bridge(f,{startClock:.5,elapsed:0});return bridgeSample(f,0,1,({support})=>support.anchorWorldMeters[0]+=.001);});
check('bridgeInheritedPhysicalAnchorSurvivesNativeHandoff',true,()=>{const f=fixture();f.sample();bridge(f,{startClock:.5,elapsed:0});bridgeSample(f,0,1);bridgeSample(f,.1,2);bridgeSample(f,.25,3);return bridgeSample(f,.325,4);});
check('bridgeImmutablePlanMutationRejects',false,()=>{const f=bridge(fixture());bridgeSample(f,.1,1);return bridgeSample(f,.2,2,({descriptor})=>descriptor.bridgePlan.immutableTag='plan-B');});
check('nativeAnchorCannotRekeyByChangingCreationClock',false,()=>{const f=fixture();f.sample();return f.sample({time:.5+1/30,count:2,mutate:({support})=>{support.startedAtClock+=.001;support.anchorWorldMeters[0]+=.001;}});});
const f0=fixture(),z=f0.sample({count:0});checks.zeroCountCannotReturnValidatedBone=z.result.validatedBones.length===0;evidence.zeroCountValidatedBones={returned:z.result.validatedBones,reportPass:z.report.pass};
const result={pass:Object.values(checks).every(Boolean),evalFactory,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(root+'/source/audit-action-observer.cjs')).digest('hex'),checks,evidence,bugs,method:'Independent public createPhysicalPalmObserver.sample lifecycle fixtures with a real local Three r160 mixed Hand/ForeArm SkinnedMesh and actual anatomical triangle patch atY1.5mm. No browser and no production geometry helper.'};
fs.writeFileSync(evalFactory?fixturePath.join(__dirname,'palm-lifecycle-fixture-eval.json'):fixturePath.join(__dirname,'palm-lifecycle-fixture.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,passed:Object.values(checks).filter(Boolean).length,total:Object.keys(checks).length,bugs,zeroCountValidatedBones:evidence.zeroCountValidatedBones},null,2));if(!result.pass)process.exitCode=1;
})();
