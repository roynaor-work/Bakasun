const fixturePath=require('node:path'),fixturePackageRoot=fixturePath.resolve(__dirname,'../../../..');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const root=fixturePackageRoot,observerPath=root+'/source/audit-action-observer.cjs',sha=x=>crypto.createHash('sha256').update(x).digest('hex'),observerHash=sha(fs.readFileSync(observerPath));
 const THREE=await import('data:text/javascript;base64,'+fs.readFileSync(root+'/vendor/three.module.js').toString('base64'));
 const {createBodySettlingObserver}=require(observerPath),text=createBodySettlingObserver.toString(),needle="key=String(scan?.hash??'missing-model')+'/'+plan.startClock";
 assert(text.includes(needle),'actual physical-rise identity expression missing');
 const priorEpisodeKeyFactory=Function('return ('+text.replace(needle,"key=String(r.episode?.id??'episode')+'/'+plan.startClock")+')')();
 function replay(factory,{mutatePlan=false,mutateInitial=false}={}){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,.7,0,.1,.8,0,-.1,.9,0],3));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(Array(12).fill(0),4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
  const env={minimumY:.007},mesh={geometry:g,material:{name:'Cloth',opacity:1,transparent:false,alphaTest:0},name:'body',matrixWorld:new THREE.Matrix4(),skeleton:{bones:[{name:'Hips'}]},getVertexPosition:(i,v)=>v.fromBufferAttribute(g.getAttribute('position'),i).add(new THREE.Vector3(0,env.minimumY-.7,0))};
  const actor={path:'fixture.glb',clock:5.166667,world:new THREE.Vector3(),meshes:[mesh]},modelSha='a'.repeat(64),api={inspect:()=>({data:{hashes:{models:{'fixture.glb':modelSha}}}})},observer=factory({api,actor});
  const witness=clock=>({minimumY:env.minimumY,modelSha256:modelSha,clock,meshIndex:0,meshName:'body',material:'Cloth',vertexIndex:0,bindPosition:[0,.7,0],worldPosition:[0,env.minimumY,0],namedInfluences:{Hips:1},selection:'opaque geometry with combined Hand/Foot influence below .5'});
  observer.sample({descriptor:{activeBaseClip:'fall'},clock:.833334,sampleDt:1/30});
  const startClock=5.2,initial=witness(5.166667),plan={startClock,boundSeconds:.30,targetClearanceMeters:.0015,maximumRateMps:.05,maximumOffsetMeters:.03,firstFootTransferConcurrent:true,initialGeometryWitness:initial};
  const state={active:true,phase:'hold',elapsedSeconds:0,carryWeight:1,offsetMeters:0,velocityMps:0,processedClock:startClock,startClock,boundSeconds:.30,targetClearanceMeters:.0015,maximumRateMps:.05,maximumOffsetMeters:.03,firstFootTransferConcurrent:true,actualGeometryWitness:null,deadlineMissed:false};
  const risePlan={kind:'sequentialSupportedFootUnroll',bodySettlePlan:plan,bodyHoldSeconds:1.1,bodyBlendSeconds:.3,firstFootLandingSeconds:.55};
  const descriptor={episode:{id:2},activeBaseClip:'__side_support_preplant',risePlan,bodySettling:state,constraints:{elapsed:0}};
  const sample=(actorClock,caseClock,dt)=>{actor.clock=actorClock;state.actualGeometryWitness=witness(actorClock);descriptor.constraints.elapsed=state.elapsedSeconds;observer.sample({descriptor,clock:caseClock,sampleDt:dt});};
  sample(startClock,.866667,1/30);const afterInitial=observer.report();
  Object.assign(state,{elapsedSeconds:1.1,processedClock:6.3});sample(6.3,1.966667,1.1);
  const elapsed=2.2-.866667,u=(elapsed-1.1)/.3;env.minimumY=.12;descriptor.activeBaseClip='get_up';Object.assign(state,{active:false,phase:'carry-fade',elapsedSeconds:elapsed,processedClock:6.3,carryWeight:1-u*u*(3-2*u)});sample(startClock+elapsed,2.2,elapsed-1.1);
  const before=structuredClone(state),initialBefore=JSON.stringify(initial),planBefore=JSON.stringify(plan);descriptor.episode.id=3;
  if(mutatePlan)plan.maximumOffsetMeters=.04;
  if(mutateInitial)initial.worldPosition[1]+=.001;
  // Exact known failure: request-episode2→3 at case2.2 with zero elapsed,
  // same physical rise(startClock5.2), same source plan and initial geometry.
  sample(startClock+elapsed,2.2,0);const report=observer.report();
  return{report,afterInitial,sourceStateUnchanged:JSON.stringify(before)===JSON.stringify(state),initialIdentityUnchanged:initialBefore===JSON.stringify(initial),planUnchanged:planBefore===JSON.stringify(plan),coordinates:{startClock,initializedCaseSeconds:.866667,supersessionCaseSeconds:2.2,supersessionActorClock:actor.clock,requestEpisodeBefore:2,requestEpisodeAfter:3,sampleDt:0}};
 }
 const fixed=replay(createBodySettlingObserver),prior=replay(priorEpisodeKeyFactory),planMutation=replay(createBodySettlingObserver,{mutatePlan:true}),initialMutation=replay(createBodySettlingObserver,{mutateInitial:true});
 const checks={
  actualCurrentFactoryAcceptsKnownSupersession:fixed.report.pass,
  initialSourceGeometryValidatedBeforeSupersession:fixed.afterInitial.witnesses.length===1&&fixed.afterInitial.witnesses[0].initialValidated,
  currentKeepsOnePhysicalRise:fixed.report.witnesses.length===1,
  currentRetainsBothRequestEpisodeIDs:JSON.stringify(fixed.report.witnesses[0].requestEpisodeIDs)==='[2,3]',
  zeroDtStateAndPlanRemainUnchanged:fixed.sourceStateUnchanged&&fixed.initialIdentityUnchanged&&fixed.planUnchanged,
  priorEpisodeKeyReproducesInitialHistoryFailure:!prior.report.pass&&prior.report.unsupported.some(e=>e.kind==='body-settle-geometry-witness-unavailable'&&e.label==='initial'),
  priorEpisodeKeyWronglyCreatesSecondPhysicalRise:prior.report.witnesses.length===2&&prior.report.witnesses[1].initialValidated===false,
  immutableFullPlanMutationStillRejected:!planMutation.report.pass&&planMutation.report.errors.some(e=>e.kind==='body-settle-plan-mutated'),
  immutableInitialWitnessMutationStillRejected:!initialMutation.report.pass&&initialMutation.report.errors.some(e=>e.kind==='body-settle-plan-mutated')
 };
 for(const[name,value]of Object.entries(checks))assert.equal(value,true,name);
 assert.equal(sha(fs.readFileSync(observerPath)),observerHash,'observer changed during fixture');
 const result={kind:'controlled-body-rise-request-supersession-fixture',pass:true,checks,coordinates:fixed.coordinates,observerSource:{file:'source/audit-action-observer.cjs',sha256:observerHash},fixtureSource:{sha256:sha(fs.readFileSync(__filename))},fixed:{witnesses:fixed.report.witnesses,errors:fixed.report.errors,unsupported:fixed.report.unsupported},priorEpisodeKey:{witnesses:prior.report.witnesses,errors:prior.report.errors,unsupported:prior.report.unsupported},limitations:'Synthetic actual-Three-r160 geometry/state replay of the real identified cache-identity failure. Negative control changes only the cache-key expression in memory. No runtime/solver, repo file or browser mutation. Existing8mm body and all unrelated plan, clock, source and geometry rules remain unchanged.'};
 fs.writeFileSync(fixturePath.join(__dirname,'known-supersession.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:true,checks,coordinates:result.coordinates,observerSource:result.observerSource,fixtureSource:result.fixtureSource}));
})();
