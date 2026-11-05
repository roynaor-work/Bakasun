const fixturePath=require('node:path'),fixturePackageRoot=fixturePath.resolve(__dirname,'../../../..');
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const root=fixturePackageRoot;
const THREE=await import('data:text/javascript;base64,'+fs.readFileSync(root+'/vendor/three.module.js').toString('base64'));
const {createActionObserver}=require(root+'/source/audit-action-observer.cjs');
const clips=new Map(require(root+'/animations.json').clips.map(c=>[c.id,c]));
let descriptor={clock:0,activeBaseClip:'idle',baseSeconds:0,contributors:[{clipID:'idle',sampleSeconds:0,weight:1,playbackRate:1,scope:'body',transform:'identity'}],requests:[],locomotionAllowed:false};
const names=Object.keys(clips.get('idle').frames[0].rotations),world=new THREE.Vector3();
const actor={world,bones:Object.fromEntries(names.map(name=>[name,{quaternion:new THREE.Quaternion()}])),locks:new Map(),recoveryDescriptor:()=>descriptor};
const api={inspect:()=>({clipMap:clips,sample:(clip)=>clip.frames.at(-1),scene:{getObjectByName:()=>null}})};
const pose={world:[0,0,0],nonBootMinimumY:0,soles:{LeftFoot:[.1,0,0],RightFoot:[-.1,0,0]},bones:Object.fromEntries(names.map(n=>[n,{q:new THREE.Quaternion(),worldQ:new THREE.Quaternion(),position:[0,n==='Hips'?1:0,0]}]))};
const observe=createActionObserver({api,actor}),checks={};
let result=observe.sample({pose,previous:pose,clock:0,sampleDt:0});checks.actualCanonicalClock=result.clip.id==='idle'&&result.seconds===0&&result.expected.size===2;
descriptor={...descriptor,activeBaseClip:'get_up',baseSeconds:.55,contributors:[{clipID:'get_up',sampleSeconds:.55,weight:1,scope:'body',transform:'mirroredX'}]};result=observe.sample({pose,previous:pose,clock:.1,sampleDt:.1});checks.mirroredContactDispatch=result.mirrored&&result.contacts.every(c=>c.sourceBone&&c.bone!==(c.sourceBone));
const episode={id:1,startedAt:0,activationDeadline:4.5,origin:{frameHeadingQuaternion:[0,0,0,1]}};
const risePlan={kind:'sequentialSupportedFootUnroll',frame:'headingLocalWorld',origin:[0,0,0],duration:1.1,bodyHoldSeconds:.55,firstFootLandingSeconds:.55,secondFootLiftStartSeconds:.55,bodyBlendSeconds:.3,firstFoot:'RightFoot',supportFoot:'LeftFoot',sourceSoles:{LeftFoot:[.12,.04,.08],RightFoot:[-.12,.2,.1]},sourcePose:{rotations:Object.fromEntries(names.map(n=>[n,[0,0,0,1]]))},mirroredX:false};
descriptor={...descriptor,activeBaseClip:'__side_support_preplant',baseSeconds:.2,risePlan,episode,constraints:{elapsed:.2,stage:'rise-foot-approach'},contributors:[{clipID:'fall',sampleSeconds:.8,playbackRate:0,weight:1,scope:'body',transform:'capturedSupportPose',virtual:true}]};
result=observe.sample({pose,previous:pose,clock:.2,sampleDt:.1});checks.firstPhaseCapturedSupport=result.expected.size===1&&result.expected.has('LeftFoot')&&result.plants.get('LeftFoot').anchor.y===.04;
descriptor={...descriptor,activeBaseClip:'get_up',baseSeconds:.1,constraints:{elapsed:.65,stage:'rise-foot-approach'},contributors:[{clipID:'fall',sampleSeconds:.8,playbackRate:0,weight:.7,scope:'body',transform:'capturedSupportPose',virtual:true},{clipID:'get_up',sampleSeconds:.1,playbackRate:1,weight:.3,scope:'body',transform:'identity'}]};
result=observe.sample({pose,previous:pose,clock:.3,sampleDt:.1});checks.secondPhaseFlatFirst=result.expected.size===1&&result.expected.has('RightFoot')&&result.plants.get('RightFoot').anchor.y===0;
descriptor={...descriptor,baseSeconds:.6,constraints:{elapsed:1.15,stage:'rise-foot-approach'},contributors:[{clipID:'get_up',sampleSeconds:.6,playbackRate:1,weight:1,scope:'body',transform:'identity'}]};result=observe.sample({pose,previous:pose,clock:.8,sampleDt:.5});checks.finalBothIndependentFlat=result.expected.size===2;
const missing=createActionObserver({api,actor:{...actor,recoveryDescriptor:null}});missing.sample({pose,previous:pose,clock:0,sampleDt:0});checks.unsupportedNeverUsesUILabel=!missing.report().supported;
const heldDescriptor=descriptor;descriptor={...descriptor,activeBaseClip:'__side_support_preplant',baseSeconds:.65,risePlan:{...risePlan,bodyHoldSeconds:1.1,firstFootLandingSeconds:.55,secondFootLiftStartSeconds:.55},constraints:{elapsed:.65,stage:'rise-second-foot-with-flat-support'},contributors:[{clipID:'fall',sampleSeconds:.8,playbackRate:0,weight:1,scope:'body',transform:'capturedSupportPose',virtual:true}]};const heldBody=createActionObserver({api,actor});const heldResult=heldBody.sample({pose,previous:pose,clock:.65,sampleDt:1/30});checks.bodyHoldIsIndependentOfFirstFootLanding=heldResult.expected.size===1&&heldResult.expected.has('RightFoot')&&heldResult.plants.get('RightFoot').anchor.y===0&&heldBody.report().supported&&heldBody.report().errors.length===0;descriptor=heldDescriptor;
checks.noUnexpectedFactoryErrors=observe.report().errors.length===0&&observe.report().unsupported.length===0;
const old=descriptor;
descriptor={clock:1.2,activeBaseClip:'keeper_dive_left',baseSeconds:1,overlayClip:'keeper_catch',overlaySeconds:1.2,presentation:{held:false},episode:{...episode,origin:{...episode.origin,clipID:'keeper_dive_left'}},contributors:[{clipID:'keeper_dive_left',sampleSeconds:1,weight:1,scope:'body',transform:'identity'},{clipID:'keeper_catch',sampleSeconds:1.2,weight:1,scope:'arms',requestID:8}],requests:[],locomotionAllowed:false};
const neverHeld=createActionObserver({api,actor});neverHeld.sample({pose,previous:pose,clock:1.2,sampleDt:1/30});const badCatch=neverHeld.report();checks.neverHeldMissingBallRejects=!badCatch.pass&&badCatch.catchEpisodes[0].committedSamples===1&&badCatch.catchEpisodes[0].actualBallSamples===0&&badCatch.errors.some(error=>error.kind==='catch-presentation-event-mismatch');
const target=clips.get('short_pass'),request={id:9,clipID:'short_pass',requestedAt:0,episodeID:1,activationDeadline:4.5,status:'queued'};
descriptor={clock:0,activeBaseClip:'idle',baseSeconds:0,contributors:[{clipID:'idle',sampleSeconds:0,weight:1,scope:'body',transform:'identity'}],requests:[request],request,episode,locomotionAllowed:false};const late=createActionObserver({api,actor});late.noteRequest('short_pass',0,pose);
Object.assign(request,{status:'active',scope:'body',activatedAt:4.9,entrySeconds:0,playbackRate:1,completionDeadline:4.9+target.duration+.35});descriptor={...descriptor,clock:5,activeBaseClip:'short_pass',baseSeconds:.1,contributors:[{clipID:'short_pass',sampleSeconds:.1,weight:1,scope:'body',transform:'identity'}]};const moved={...pose,bones:{...pose.bones,LeftHand:{...pose.bones.LeftHand,worldQ:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.1)}}};late.sample({pose:moved,previous:pose,clock:5,sampleDt:1/30});checks.lateFirstVisibleProgressRejects=late.report().errors.some(error=>error.kind==='unwitnessed-activation-overdue');
const completedRequest={id:10,clipID:'short_pass',requestedAt:0,episodeID:1,activationDeadline:4.5,status:'queued'};descriptor={...descriptor,clock:0,request:completedRequest,requests:[completedRequest]};const lateCompleted=createActionObserver({api,actor});lateCompleted.noteRequest('short_pass',0,pose);Object.assign(completedRequest,{status:'completed',scope:'body',activatedAt:0,entrySeconds:0,playbackRate:1,completionDeadline:target.duration+.35,completedAt:10});descriptor={...descriptor,clock:10,baseSeconds:target.duration,contributors:[{clipID:'short_pass',sampleSeconds:target.duration,weight:1,scope:'body',transform:'identity'}]};const terminal={...pose,bones:Object.fromEntries(names.map(name=>[name,{...pose.bones[name],q:new THREE.Quaternion().fromArray(target.frames.at(-1).rotations[name]).normalize(),worldQ:new THREE.Quaternion().fromArray(target.frames.at(-1).rotations[name]).normalize()}]))};lateCompleted.sample({pose:terminal,previous:pose,clock:10,sampleDt:1/30});checks.completedFlagCannotBypassDeadline=lateCompleted.report().errors.some(error=>error.kind==='completed-after-deadline');
const stableRequest={id:11,clipID:'short_pass',requestedAt:0,status:'queued'};descriptor={...descriptor,clock:0,request:stableRequest,requests:[stableRequest]};const stable=createActionObserver({api,actor});stable.noteRequest('short_pass',0,pose);Object.assign(stableRequest,{status:'completed',scope:'body',activatedAt:0,entrySeconds:0,playbackRate:1,completionDeadline:target.duration+.35,completedAt:target.duration});descriptor={...descriptor,clock:target.duration};stable.sample({pose:terminal,previous:pose,clock:target.duration,sampleDt:1/30});stable.needsDrain(target.duration);for(let n=1;n<=7;n++){descriptor.clock=target.duration+n/30;stable.sample({pose:terminal,previous:terminal,clock:descriptor.clock,sampleDt:1/30});stable.needsDrain(descriptor.clock);}checks.actualTerminalHoldsForPoint2Seconds=stable.report().finalFulfilled&&stable.report().finalStableSeconds>=.2;
const disturbed={...terminal,bones:{...terminal.bones,LeftHand:{...terminal.bones.LeftHand,q:terminal.bones.LeftHand.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.3))}}};descriptor.clock+=1/30;stable.sample({pose:disturbed,previous:terminal,clock:descriptor.clock,sampleDt:1/30});stable.needsDrain(descriptor.clock);checks.postCompletionPoseDeviationCannotPass=!stable.report().finalFulfilled;descriptor=old;

function clockCase({clipID='short_pass',from,to,dt=1/30,transform='identity',rate=1,scope='body',request=null}){
 const set=(seconds,clock)=>{descriptor={clock,activeBaseClip:scope==='arms'?'keeper_dive_left':clipID,baseSeconds:scope==='arms'?0:seconds,contributors:[...(scope==='arms'?[{clipID:'keeper_dive_left',sampleSeconds:clock,playbackRate:1,weight:1,scope:'body',transform:'identity'}]:[]),{clipID,sampleSeconds:seconds,playbackRate:rate,weight:1,scope,transform,...(scope==='arms'?{requestID:77}:{})}],requests:request?[request]:[],request,locomotionAllowed:false,...(scope==='arms'?{overlayClip:clipID,overlaySeconds:seconds,presentation:{held:seconds>=.4}}:{})};};
 set(from,0);const observer=createActionObserver({api,actor});observer.sample({pose,previous:pose,clock:0,sampleDt:0});set(to,dt);observer.sample({pose,previous:pose,clock:dt,sampleDt:dt});return observer.report();
}
const clockFailure=report=>report.errors.some(error=>/native-clock-discontinuity|native-request-clock-ahead|native-matched-entry-clock-ahead/.test(error.kind));
checks.nativeBodyClockJumpRejects=clockFailure(clockCase({from:0,to:clips.get('short_pass').duration}));
checks.nativeBodyClockReversalRejects=clockFailure(clockCase({from:.3,to:.2}));
checks.nativeClockNormalProgressPasses=!clockFailure(clockCase({from:.2,to:.2+1/30}));
checks.nativeClockTerminalClampPasses=!clockFailure(clockCase({from:clips.get('short_pass').duration-.01,to:clips.get('short_pass').duration}));
checks.genuineLoopWrapPasses=!clockFailure(clockCase({clipID:'idle',from:clips.get('idle').duration-.01,to:.02,dt:.03}));
checks.capturedPoseRateZeroStaysFrozen=!clockFailure(clockCase({clipID:'fall',from:.5,to:.5,rate:0,transform:'capturedSupportPose'}));
checks.capturedPoseClockDriftRejects=clockFailure(clockCase({clipID:'fall',from:.5,to:.51,rate:0,transform:'capturedSupportPose'}));
checks.overlayClockJumpRejects=clockFailure(clockCase({clipID:'keeper_catch',from:0,to:1.2,scope:'arms',transform:'chestTranslationGravityAlignedSixArmIK'}));
const entryRequest={id:81,clipID:'get_up',scope:'body',activatedAt:0,entrySeconds:.8,playbackRate:1,status:'active'};
checks.matchedEntryPhasePasses=!clockFailure(clockCase({clipID:'get_up',from:.8,to:.8+1/30,request:entryRequest}));
descriptor={clock:1/30,activeBaseClip:'short_pass',baseSeconds:clips.get('short_pass').duration,contributors:[{clipID:'short_pass',sampleSeconds:clips.get('short_pass').duration,playbackRate:1,weight:1,scope:'body',transform:'identity'}],requests:[{id:82,clipID:'short_pass',scope:'body',activatedAt:0,entrySeconds:0,playbackRate:1,status:'completed'}],locomotionAllowed:false};const instant=createActionObserver({api,actor});instant.sample({pose,previous:pose,clock:1/30,sampleDt:1/30});checks.firstActivationCannotSkipToTerminal=clockFailure(instant.report());
const recentRequest={id:83,clipID:'short_pass',scope:'body',activatedAt:0,entrySeconds:0,playbackRate:1,status:'active'};descriptor={...descriptor,requests:[{...recentRequest,id:82,activatedAt:-10,status:'completed'},recentRequest]};const repeated=createActionObserver({api,actor});repeated.sample({pose,previous:pose,clock:1/30,sampleDt:1/30});checks.repeatedActionBindsLatestActivation=clockFailure(repeated.report());


function sourceEpisodeBoundary(to){
 descriptor={clock:0,activeBaseClip:'keeper_dive_left',baseSeconds:.5,contributors:[{clipID:'keeper_dive_left',sampleSeconds:.5,playbackRate:1,weight:1,scope:'body',transform:'identity'}],requests:[],locomotionAllowed:false};const observer=createActionObserver({api,actor});observer.sample({pose,previous:pose,clock:0,sampleDt:0});descriptor={...descriptor,clock:1/30,baseSeconds:to,episode:{id:90,startedAt:1/30,activationDeadline:4.5+1/30,origin:{frameHeadingQuaternion:[0,0,0,1],clipID:'keeper_dive_left'}},contributors:[{...descriptor.contributors[0],sampleSeconds:to}]};observer.sample({pose,previous:pose,clock:1/30,sampleDt:1/30});return observer.report();
}
checks.newEpisodeRetainsSourceClockWitness=clockFailure(sourceEpisodeBoundary(1.5));
checks.newEpisodeAllowsContinuousSourceClock=!clockFailure(sourceEpisodeBoundary(.5+1/30));


function internalMatchedEntry(to){
 descriptor={clock:0,activeBaseClip:'idle',baseSeconds:0,contributors:[{clipID:'idle',sampleSeconds:0,playbackRate:1,weight:1,scope:'body',transform:'identity'}],requests:[],locomotionAllowed:false};const observer=createActionObserver({api,actor});observer.sample({pose,previous:pose,clock:0,sampleDt:0});descriptor={clock:1/30,activeBaseClip:'get_up',baseSeconds:to,matchedEntrySeconds:.8,contributors:[{clipID:'get_up',sampleSeconds:to,playbackRate:1,weight:1,scope:'body',transform:'identity'}],requests:[],locomotionAllowed:false};observer.sample({pose,previous:pose,clock:1/30,sampleDt:1/30});return observer.report();
}
checks.internalMatchedEntryClockJumpRejects=clockFailure(internalMatchedEntry(clips.get('get_up').duration));
checks.internalMatchedEntryPhasePasses=!clockFailure(internalMatchedEntry(.8));

descriptor={clock:0,activeBaseClip:'get_up',baseSeconds:1.4,matchedEntrySeconds:.8,contributors:[{clipID:'get_up',sampleSeconds:1.4,playbackRate:1,weight:1,scope:'body',transform:'identity'}],requests:[],locomotionAllowed:false};const coldMatched=createActionObserver({api,actor});coldMatched.sample({pose,previous:pose,clock:0,sampleDt:0});checks.initialColdSeekAllowsArbitraryAuthoredPose=!clockFailure(coldMatched.report());

function supersededContinuingGetup({zeroDt=false,jump=false}){
 const source={id:91,clipID:'get_up',scope:'body',activatedAt:0,entrySeconds:0,playbackRate:1,status:'active'};descriptor={clock:.2,activeBaseClip:'get_up',baseSeconds:.2,matchedEntrySeconds:0,contributors:[{clipID:'get_up',sampleSeconds:.2,playbackRate:1,weight:1,scope:'body',transform:'identity'}],requests:[source],request:source,locomotionAllowed:false};const observer=createActionObserver({api,actor});observer.sample({pose,previous:pose,clock:.2,sampleDt:1/30});const dt=zeroDt?0:1/30,seconds=.2+(jump?.3:dt),pending={id:92,clipID:'run_2',scope:'locomotion',status:'queued'};descriptor={...descriptor,clock:.2+dt,baseSeconds:seconds,contributors:[{...descriptor.contributors[0],sampleSeconds:seconds}],requests:[{...source,status:'superseded'},pending],request:pending};observer.sample({pose,previous:pose,clock:.2+dt,sampleDt:dt});return observer.report();
}
checks.supersededSourceKeepsPoseAtZeroDt=!clockFailure(supersededContinuingGetup({zeroDt:true}));
checks.supersededSourceKeepsClockWitness=!clockFailure(supersededContinuingGetup({}));
checks.supersededSourceClockJumpRejects=clockFailure(supersededContinuingGetup({jump:true}));


function genuineSameClipRestart(jump){
 const old={id:95,clipID:'short_pass',scope:'body',activatedAt:0,entrySeconds:0,playbackRate:1,status:'active'};descriptor={clock:.3,activeBaseClip:'short_pass',baseSeconds:.3,contributors:[{clipID:'short_pass',sampleSeconds:.3,playbackRate:1,weight:1,scope:'body',transform:'identity'}],request:old,requests:[old],locomotionAllowed:false};const observer=createActionObserver({api,actor});observer.sample({pose,previous:pose,clock:.3,sampleDt:1/30});const next={...old,id:96,activatedAt:.3};descriptor={...descriptor,baseSeconds:jump?target.duration:0,contributors:[{...descriptor.contributors[0],sampleSeconds:jump?target.duration:0}],requests:[{...old,status:'superseded'},next],request:next};observer.sample({pose,previous:pose,clock:.3,sampleDt:0});return observer.report();
}
checks.genuineSameClipNewActivationPasses=!clockFailure(genuineSameClipRestart(false));
checks.genuineSameClipTerminalJumpRejects=clockFailure(genuineSameClipRestart(true));
function capturedToNative(jump){
 descriptor={clock:1,activeBaseClip:'__side_support_preplant',baseSeconds:.5,risePlan:{...risePlan,bodyHoldSeconds:1.1},constraints:{elapsed:.5,stage:'rise-first-foot'},contributors:[{clipID:'fall',sampleSeconds:.8,playbackRate:0,weight:1,scope:'body',transform:'capturedSupportPose',virtual:true}],requests:[],locomotionAllowed:false};const observer=createActionObserver({api,actor});observer.sample({pose,previous:pose,clock:1,sampleDt:1/30});descriptor={...descriptor,clock:1+1/30,activeBaseClip:'get_up',baseSeconds:jump?clips.get('get_up').duration:0,matchedEntrySeconds:0,constraints:{elapsed:1.1,stage:'both-flat'},contributors:[{clipID:'get_up',sampleSeconds:jump?clips.get('get_up').duration:0,playbackRate:1,weight:1,scope:'body',transform:'identity'}]};observer.sample({pose,previous:pose,clock:1+1/30,sampleDt:1/30});return observer.report();
}
checks.capturedSupportToNativeMatchedEntryPasses=!clockFailure(capturedToNative(false));
checks.capturedSupportToNativeClockJumpRejects=clockFailure(capturedToNative(true));


function activationIntervalCase(mode){
 const dt=1/120,source={id:97,clipID:'get_up',scope:'body',activatedAt:0,entrySeconds:0,playbackRate:1,status:'active'};
 const set=(clock,seconds,superseded=false)=>{const pending={id:98,clipID:'run_2',scope:'locomotion',status:'queued'};descriptor={clock,activeBaseClip:'get_up',baseSeconds:seconds,matchedEntrySeconds:0,contributors:[{clipID:'get_up',sampleSeconds:seconds,playbackRate:1,weight:1,scope:'body',transform:'identity'}],requests:[{...source,status:superseded?'superseded':'active'},...(superseded?[pending]:[])],request:superseded?pending:source,locomotionAllowed:false};};
 set(0,mode==='instant-jump'?clips.get('get_up').duration:dt);const observer=createActionObserver({api,actor});observer.sample({pose,previous:pose,clock:0,sampleDt:dt});
 if(mode==='zero-dt'){set(.2,.2+dt);observer.sample({pose,previous:pose,clock:.2,sampleDt:.2});set(.2,.2+dt,true);observer.sample({pose,previous:pose,clock:.2,sampleDt:0});}
 if(mode==='larger-dt'){set(.1,.14);observer.sample({pose,previous:pose,clock:.1,sampleDt:.1});}
 return observer.report();
}
checks.activationIntervalSurvivesZeroDtSupersession=!clockFailure(activationIntervalCase('zero-dt'));
checks.activationIntervalStillRejectsInstantTerminal=activationIntervalCase('instant-jump').errors.some(error=>error.kind==='native-request-clock-ahead');
checks.laterLargerDtCannotExpandActivationAllowance=activationIntervalCase('larger-dt').errors.some(error=>error.kind==='native-request-clock-ahead'&&Math.abs(error.activationIntervalSeconds-1/120)<1e-9&&Math.abs(error.maximumSeconds-(.1+1/120))<1e-9);

for(const [key,value]of Object.entries(checks))assert.equal(value,true,key+' '+JSON.stringify(observe.report()));
fs.writeFileSync(fixturePath.join(__dirname,'action-observer-fixture-clocks.json'),JSON.stringify({pass:true,checks,method:'Controlled read-only descriptor/clock/contact dispatch fixture with the actual local Three r160 math classes. No browser, controller or animation-quality claim.'},null,2)+'\n');console.log(JSON.stringify({pass:true,checks}));
})();
