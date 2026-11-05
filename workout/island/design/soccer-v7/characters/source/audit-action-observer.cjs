/** Browser-side read-only witness factory. No controller/IK method is replaced. */
function createActionObserver({api, actor}) {
  const clips=api.inspect().clipMap, errors=[], unsupported=[], timeline=[], witnesses=[];
  const accepted=[], episodes=new Map(), requests=new Map(), progress=new Map(), firstProgress=new Map(), currentFulfillment=new Map(), completion=new Map(), plans=new Map(), initialPoses=new Map(), activated=new Set();
  const catchEpisodes=new Map(), contributorClocks=new Map(), nativeActivationIntervals=new Map();
  const nativeClockWitness={samples:0,positiveDtSamples:0,loopWraps:0,capturedPoseSamples:0,matchedEntryActivations:0,maximumAdvanceSeconds:0,maximumAdvanceRatio:0};
  const motorIDs=new WeakMap(), motorContexts=new Map(); let nextMotorID=0, last=null, finalID=null, lastWitnessClock=null, lastTimelineKey=null;
  let maximumBallAttachmentError=0, maximumCatchPalmDistance=0, catchContactSamples=0;
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
  const swap=name=>name.startsWith('Left')?'Right'+name.slice(4):name.startsWith('Right')?'Left'+name.slice(5):name;
  const sourceTarget=id=>id==='idle'||id==='decelerate'?'idle':id==='dribble'?'run_2':id;
  function descriptor() {
    const value=typeof actor.recoveryDescriptor==='function'?actor.recoveryDescriptor():null;
    if(!value||typeof value.activeBaseClip!=='string'||!Number.isFinite(value.baseSeconds)||!Array.isArray(value.contributors)) {
      unsupported.push({kind:'missing-actual-descriptor'});return null;
    }
    return value;
  }
  function headingPoint(values,r) {
    const q=actor.bones.Root.quaternion.clone().fromArray(r.episode?.origin?.frameHeadingQuaternion||[0,0,0,1]);
    return actor.world.clone().fromArray(values).applyQuaternion(q).toArray();
  }
  function freeze(map,key,value,kind,clock) {
    const text=JSON.stringify(value);
    if(map.has(key)&&map.get(key)!==text)errors.push({kind,clock,key});else if(!map.has(key))map.set(key,text);
  }
  function observeNativeClocks(r,clock,sampleDt,motor) {
    const current=new Map(),tolerance=1e-6;
    for(const contributor of r.contributors){
      const clip=clips.get(contributor.clipID);
      if(!clip||contributor.transform==='physicalLocomotionSpace'||motor&&contributor.scope==='body')continue;
      const request=(r.requests||[]).slice().reverse().find(value=>value.clipID===contributor.clipID&&value.scope===contributor.scope&&value.activatedAt!=null&&(contributor.requestID==null||contributor.requestID===value.id));
      const requestID=contributor.requestID??request?.id??'base';
      const key=[contributor.scope,contributor.clipID,contributor.transform||'identity',requestID].join('/');
      const rate=contributor.playbackRate??1,seconds=contributor.sampleSeconds,prior=contributorClocks.get(key),dt=prior?clock-prior.clock:0;
      nativeClockWitness.samples++;
      if(!Number.isFinite(rate)||rate<0||rate>1+tolerance)errors.push({kind:'native-clock-invalid-rate',clock,key,rate});
      if(contributor.transform==='capturedSupportPose'){
        nativeClockWitness.capturedPoseSamples++;
        if(rate!==0)errors.push({kind:'captured-pose-clock-rate',clock,key,rate});
      }
      if(prior&&dt>tolerance){
        nativeClockWitness.positiveDtSamples++;
        let advance=seconds-prior.seconds;
        const allowed=dt*Math.max(prior.rate,rate);
        if(advance<-tolerance&&clip.loop&&prior.seconds>=-tolerance&&prior.seconds<=clip.duration+tolerance&&seconds>=-tolerance&&seconds<=clip.duration+tolerance){advance+=clip.duration;nativeClockWitness.loopWraps++;}
        nativeClockWitness.maximumAdvanceSeconds=Math.max(nativeClockWitness.maximumAdvanceSeconds,advance);
        nativeClockWitness.maximumAdvanceRatio=Math.max(nativeClockWitness.maximumAdvanceRatio,allowed>tolerance?advance/allowed:0);
        if(advance<-tolerance||advance>allowed+tolerance)errors.push({kind:'native-clock-discontinuity',clock,key,previousSeconds:prior.seconds,seconds,advanceSeconds:advance,elapsedSeconds:dt,maximumAdvanceSeconds:allowed,previousRate:prior.rate,rate,loop:clip.loop});
      }
      // A newly activated matched entry may begin partway into its clip, but
      // its actual clock still cannot outrun elapsed wall time at the declared
      // bounded playback rate. One sampling interval covers activation inside
      // the controller's current integration step.
      if(request&&Number.isFinite(request.activatedAt)&&!clip.loop&&contributor.transform!=='capturedSupportPose'){
        const activationKey=request.scope+'/'+request.id;
        if(!nativeActivationIntervals.has(activationKey))nativeActivationIntervals.set(activationKey,Math.max(0,sampleDt));
        const activationInterval=nativeActivationIntervals.get(activationKey);
        const maximum=Math.min(clip.duration,(request.entrySeconds||0)+Math.max(0,r.clock-request.activatedAt)*(request.playbackRate??rate)+activationInterval);
        if(!prior)nativeClockWitness.matchedEntryActivations++;
        if(seconds>maximum+tolerance)errors.push({kind:'native-request-clock-ahead',clock,key,seconds,maximumSeconds:maximum,activatedAt:request.activatedAt,actualClock:r.clock,entrySeconds:request.entrySeconds||0,activationIntervalSeconds:activationInterval});
      }
      // Internal bridge/rise entry has no user request for get_up. Its declared
      // matched phase bounds the first observed native sample. The initial
      // cold-seek sample is deliberately allowed to start at any authored pose.
      const continuingNative=last?.r.contributors.some(value=>value.scope===contributor.scope&&value.clipID===contributor.clipID&&(value.transform||'identity')===(contributor.transform||'identity')&&value.requestID===contributor.requestID);
      if(!prior&&!continuingNative&&last&&contributor.scope==='body'&&contributor.clipID==='get_up'&&contributor.transform!=='capturedSupportPose'&&Number.isFinite(r.matchedEntrySeconds)){
        const maximum=Math.min(clip.duration,r.matchedEntrySeconds+Math.max(0,sampleDt)*rate);
        if(seconds<r.matchedEntrySeconds-tolerance||seconds>maximum+tolerance)errors.push({kind:'native-matched-entry-clock-ahead',clock,key,seconds,entrySeconds:r.matchedEntrySeconds,maximumSeconds:maximum});
      }
      current.set(key,{clock,seconds,rate});
    }
    contributorClocks.clear();for(const[key,value]of current)contributorClocks.set(key,value);
  }
  function observedMotor(frame,m) {
    if(!actor.motorOrigin||!Number.isFinite(actor.motorYaw)||!['clock','actualSpeed','targetSpeed','unwrappedPhase','rootDistance'].every(key=>Number.isFinite(m[key]))||!m.feet||!Array.isArray(m.heelRecords)||!Array.isArray(m.contributors)){unsupported.push({kind:'missing-motor-audit-contract',clock:frame.clock});return new Set();}
    if(!motorIDs.has(actor.locomotion))motorIDs.set(actor.locomotion,++nextMotorID);
    const id=motorIDs.get(actor.locomotion);
    if(!motorContexts.has(id))motorContexts.set(id,{records:new Map(),releases:new Map(),releaseValidity:new Map(),previous:null});
    const context=motorContexts.get(id), previous=context.previous, expected=new Set();
    const hips=Object.fromEntries(['LeftFoot','RightFoot'].map(name=>{
      const p=actor.bones[name.replace(/Foot$/,'')+'UpLeg'].getWorldPosition(actor.world.clone()).sub(actor.motorOrigin).applyAxisAngle(actor.world.clone().set(0,1,0),-actor.motorYaw);
      return[name,{x:p.x,y:p.y,z:p.z-m.rootDistance}];
    }));
    if(previous&&m.unwrappedPhase<previous.motor.unwrappedPhase-1e-8)errors.push({kind:'motor-phase-reversed',clock:frame.clock,id});
    if(previous&&frame.clock>previous.clock+1e-8){const speed=distance(frame.pose.world,previous.world)/(frame.clock-previous.clock);if(speed<Math.min(previous.motor.actualSpeed,m.actualSpeed)-.002||speed>Math.max(previous.motor.actualSpeed,m.actualSpeed)+.002)errors.push({kind:'motor-reported-speed',clock:frame.clock,observedSpeed:speed,declaredSpeed:m.actualSpeed});}
    const nodes=['run_1','run_2','run_3','run_4','run_5','sprint'].map(name=>clips.get(name));
    function fraction(speed){let a=nodes[0],b=a;for(const node of nodes){if(node.speedMps<=speed)a=node;if(node.speedMps>=speed){b=node;break;}b=node;}const f=c=>{const contact=c.contacts.find(contact=>contact.bone==='LeftFoot'&&contact.mode==='plant');return(contact.end-contact.start)/c.duration;};const w=a===b?0:Math.max(0,Math.min(1,(speed-a.speedMps)/(b.speedMps-a.speedMps)));return f(a)*(1-w)+f(b)*w;}
    for(const record of m.heelRecords||[]){
      freeze(context.records,record.id,{id:record.id,side:record.side,heelPhase:record.heelPhase,heelSpeed:record.heelSpeed,stanceFraction:record.stanceFraction,stanceEndPhase:record.stanceEndPhase,plannedAnchor:record.plannedAnchor,touchdownPhase:record.touchdownPhase,touchdownTime:record.touchdownTime,reason:record.reason},'motor-heel-mutated',frame.clock);
      if(record.reason!=='idle-settle'&&Math.abs(record.stanceFraction-fraction(record.heelSpeed))>1e-6)errors.push({kind:'motor-stance-fraction',clock:frame.clock,record});
      if(record.release){
        freeze(context.releases,record.id,record.release,'motor-release-mutated',frame.clock);
        if(!context.releaseValidity.has(record.id)){
          const release=record.release,p=release.reachPrediction;let valid=false;
          if(release.reason==='predicted-leg-reach'&&p&&previous){
            const hip=previous.hips[record.side],v=release.releaseSpeed,t=.02;
            const held=m.seedCommitUntil!=null&&release.phase<m.seedCommitUntil-1e-9;
            const next=held?v:v+Math.max(-4.5*t,Math.min(3.5*t,m.targetSpeed-v));
            const future=release.rootDistance+(v+next)*.5*t;
            const current=Math.hypot(hip.x-record.plannedAnchor[0],hip.y-record.plannedAnchor[1]-.08,release.rootDistance+hip.z-record.plannedAnchor[2]);
            const predicted=Math.hypot(hip.x-record.plannedAnchor[0],hip.y-record.plannedAnchor[1]-.08-(.10+.015*v)*smooth(t/.06),future+hip.z-record.plannedAnchor[2]);
            const geometryError=Math.max(Math.abs(hip.x-p.hipX),Math.abs(hip.y-p.hipHeight),Math.abs(hip.z-p.hipZ));
            valid=release.rootDistance+hip.z>record.plannedAnchor[2]&&(current>.77-.01*smooth(v/1.6)-1e-7||predicted>.772-1e-7)&&geometryError<1e-6&&Math.abs(p.geometryMeasuredAt-previous.motor.clock)<1e-6;
          }else if(release.reason==='neutral-stop-step'){
            const other=record.side==='LeftFoot'?'RightFoot':'LeftFoot',lock=actor.locks.get(other);
            valid=release.releaseSpeed<.03&&Math.abs(record.plannedAnchor[2]-release.rootDistance)>.012&&Boolean(lock)&&distance(frame.pose.soles[other],lock.anchor.toArray())<=.003&&Math.abs(frame.pose.soles[other][1])<=.003;
          }else if(release.reason==='authored-toeoff')valid=release.phase>=record.stanceEndPhase-1e-8;
          else if(['start-step','seed-swing'].includes(release.reason))valid=true;
          context.releaseValidity.set(record.id,valid);if(!valid)errors.push({kind:'motor-release-predicate',clock:frame.clock,record});
        }
      }
      if(record.reason==='idle-settle'){
        if(m.actualSpeed<.03&&m.feet[record.side]?.mode==='plant')expected.add(record.side);
      }else if(m.unwrappedPhase>=record.heelPhase-1e-6&&m.unwrappedPhase<record.stanceEndPhase-1e-8){
        if(record.release&&context.releaseValidity.get(record.id)&&['predicted-leg-reach','neutral-stop-step','start-step'].includes(record.release.reason))continue;
        expected.add(record.side);
      }
    }
    if(previous&&m.unwrappedPhase>=previous.motor.unwrappedPhase){
      for(const[side,offset]of[['LeftFoot',0],['RightFoot',.5]])for(let heel=Math.floor(previous.motor.unwrappedPhase-offset)+1+offset;heel<=m.unwrappedPhase;heel++)if(!m.heelRecords.some(record=>record.side===side&&Math.abs(record.heelPhase-heel)<1e-5))errors.push({kind:'motor-heel-missing',clock:frame.clock,side,heel});
    }
    const contributors=(m.contributors||[]).filter(c=>c.weight>1e-8);
    if(Math.abs(contributors.reduce((sum,c)=>sum+c.weight,0)-1)>1e-6)errors.push({kind:'motor-contributor-weights',clock:frame.clock});
    for(const c of contributors)if(c.clip!=='idle'){
      const clip=clips.get(c.clip),expectedClock=(((m.unwrappedPhase%1)+1)%1)*(clip?.duration||1);
      if(!clip||Math.abs(c.time-expectedClock)>1e-6)errors.push({kind:'motor-contributor-clock',clock:frame.clock,contributor:c,expectedClock});
    }
    if(m.actualSpeed<.03&&m.targetSpeed===0)for(const side of['LeftFoot','RightFoot'])if(m.feet[side]?.mode==='plant')expected.add(side);
    context.previous={motor:m,hips,world:frame.pose.world.slice(),clock:frame.clock};return expected;
  }
  function sample({pose,previous,clock,sampleDt,physicalPalmSupports=[]}) {
    const r=descriptor();
    if(!r)return{clip:{id:'unsupported-descriptor',duration:1,loop:false,contacts:[]},seconds:0,contacts:[],expected:new Set(),plants:new Map(),canonical:false};
    const m=r.locomotionAllowed&&actor.locomotion?actor.locomotion.snapshot():null;
    const base=clips.get(r.activeBaseClip), sequential=r.risePlan?.kind==='sequentialSupportedFootUnroll',virtual=r.contributors.some(c=>c.virtual&&c.scope==='body')||(r.activeBaseClip==='__side_support_preplant'&&sequential);
    if(!base&&!virtual)unsupported.push({kind:'unknown-active-base',clock,activeBaseClip:r.activeBaseClip});
    const bodyContributor=r.contributors.find(c=>c.scope==='body'&&c.weight>0);
    if(!bodyContributor)unsupported.push({kind:'missing-body-contributor',clock});
    if(r.locomotionAllowed&&!m)unsupported.push({kind:'missing-physical-motor',clock});
    if(m){if(!r.physicalMotor||!['clock','actualSpeed','targetSpeed','unwrappedPhase','rootDistance'].every(key=>Number.isFinite(r.physicalMotor[key])))unsupported.push({kind:'missing-motor-descriptor',clock});else if(Math.max(Math.abs(r.physicalMotor.clock-m.clock),Math.abs(r.physicalMotor.actualSpeed-m.actualSpeed),Math.abs(r.physicalMotor.targetSpeed-m.targetSpeed),Math.abs(r.physicalMotor.unwrappedPhase-m.unwrappedPhase),Math.abs(r.physicalMotor.rootDistance-m.rootDistance))>1e-6)errors.push({kind:'stale-motor-descriptor',clock});}
    const clip=m?(clips.get(m.contributors.find(c=>c.weight>0&&c.clip!=='idle')?.clip)||clips.get('idle')):base||{id:r.activeBaseClip,duration:r.constraints?.duration||1,loop:false,contacts:[]};
    const seconds=m?m.unwrappedPhase*clip.duration:r.baseSeconds;
    const local=clip.loop?((seconds%clip.duration)+clip.duration)%clip.duration:Math.min(clip.duration,Math.max(0,seconds));
    const mirrored=Boolean(r.risePlan?.mirroredX||r.contributors.some(c=>c.scope==='body'&&c.transform==='mirroredX'));
    for(const contributor of r.contributors){if(!Number.isFinite(contributor.sampleSeconds)||!Number.isFinite(contributor.weight)||contributor.weight<0||contributor.weight>1)unsupported.push({kind:'invalid-actual-contributor',clock,contributor});if(contributor.scope==='arms'&&(contributor.clipID!==r.overlayClip||Math.abs(contributor.sampleSeconds-r.overlaySeconds)>1e-6))errors.push({kind:'overlay-contributor-clock',clock,contributor});}
    observeNativeClocks(r,clock,sampleDt,m);
    const nativeBody=r.contributors.find(c=>c.scope==='body'&&!c.virtual&&c.weight>0);
    if(!m&&!virtual&&nativeBody&&(nativeBody.clipID!==r.activeBaseClip||Math.abs(nativeBody.sampleSeconds-r.baseSeconds)>1e-6))errors.push({kind:'body-contributor-clock',clock,contributor:nativeBody});
    const contacts=m||virtual?[]:(base.contacts||[]).map(contact=>mirrored?{...contact,sourceBone:contact.bone,bone:swap(contact.bone),anchor:[-contact.anchor[0],contact.anchor[1],contact.anchor[2]],contactPointOffsetMeters:contact.contactPointOffsetMeters?[-contact.contactPointOffsetMeters[0],contact.contactPointOffsetMeters[1],contact.contactPointOffsetMeters[2]]:undefined}:contact).filter(contact=>(!r.overlayClip||contact.mode!=='hand-support')&&contact.start-1e-8<=local&&local<=contact.end+1e-8);
    const expected=m?observedMotor({pose,previous,clock,sampleDt},m):new Set(contacts.filter(c=>c.mode==='plant'&&/Foot$/.test(c.bone)).map(c=>c.bone));
    const plants=new Map([...actor.locks].map(([bone,lock])=>[bone,{...lock,anchor:lock.anchor.clone()}]));
    const palmSupports=[];
    if(r.bridgePlan){
      const plan=r.bridgePlan,key='bridge/'+r.episode?.id;freeze(plans,key,plan,'virtual-plan-mutated',clock);
      if(!r.constraints||!Array.isArray(plan.stages)||!plan.sourceSoles||!plan.origin)unsupported.push({kind:'missing-virtual-plan',clock});
      else{
        const elapsed=r.constraints.elapsed;
        for(const stage of plan.stages){
          const shouldPlant=elapsed<=stage.liftStart+1e-8||elapsed>=stage.landAt-1e-8,neutral=[plan.origin[0]+(stage.bone==='LeftFoot'?.1:-.1),0,plan.origin[2]];
          if(shouldPlant){expected.add(stage.bone);const anchor=headingPoint(elapsed<=stage.liftStart+1e-8?plan.sourceSoles[stage.bone]:neutral,r);plants.set(stage.bone,{bone:stage.bone,key:key+'/'+stage.bone+'/'+(elapsed<=stage.liftStart?'from':'to'),anchor:actor.world.clone().fromArray(anchor),virtual:true});}
          else{expected.delete(stage.bone);plants.delete(stage.bone);}
        }
        if(elapsed<=plan.duration*.25+1e-8&&plan.sourcePalm?.position)palmSupports.push({bone:'LeftHand',target:headingPoint(plan.sourcePalm.position,r),offset:[0,0,0],kind:'virtual-fixed-wrist-support'});
      }
    }else if(virtual&&!sequential)unsupported.push({kind:'virtual-body-without-plan',clock});
    if(sequential&&r.constraints){
      const plan=r.risePlan;freeze(plans,'sequential-rise/'+r.episode?.id,plan,'sequential-plan-mutated',clock);
      const elapsed=r.constraints.elapsed;
      if(plan.constraintsEndSeconds!=null&&elapsed>plan.constraintsEndSeconds+1/120+1e-6)errors.push({kind:'sequential-constraints-overdue',clock,elapsed,end:plan.constraintsEndSeconds});
      if(plan.flatAnchorsRemainFixed===false)unsupported.push({kind:'unsupported-moving-rise-anchor',clock});
      const first=plan.firstFoot,second=first==='LeftFoot'?'RightFoot':'LeftFoot',firstLand=plan.firstFootLandingSeconds??(plan.bodyHoldSeconds<=plan.duration/2+1e-6?plan.duration/2:null),secondLift=plan.secondFootLiftStartSeconds??(plan.bodyHoldSeconds<=plan.duration/2+1e-6?plan.duration/2:null),secondLand=plan.secondFootLandingSeconds??plan.duration;
      if(!Number.isFinite(firstLand)||!Number.isFinite(secondLift)||!Number.isFinite(secondLand)||firstLand>secondLift+1e-6||secondLift>=secondLand||secondLand>plan.duration+1e-6)unsupported.push({kind:'missing-independent-foot-stage-times',clock});
      if(!['LeftFoot','RightFoot'].includes(first)||!plan.origin||!plan.sourceSoles||!Number.isFinite(elapsed))unsupported.push({kind:'invalid-sequential-plan',clock});
      else{
        for(const bone of[first,second]){const from=plan.sourceSoles[bone],flat=[plan.origin[0]+(bone==='LeftFoot'?.1:-.1),0,plan.origin[2]],landAt=bone===first?firstLand:secondLand;
          const captured=bone===second&&elapsed<=secondLift+1e-8&&plan.supportFoot===bone;
          const planted=elapsed>=landAt-1e-8||captured;
          if(planted){expected.add(bone);plants.set(bone,{bone,key:'sequential/'+r.episode?.id+'/'+bone+'/'+(captured?'captured':'flat'),anchor:actor.world.clone().fromArray(headingPoint(captured?from:flat,r)),virtual:true});}
          else{expected.delete(bone);plants.delete(bone);}
        }
        if(elapsed<plan.bodyHoldSeconds-1e-8){
          if(!plan.supportFoot&&elapsed<firstLand-1e-8&&pose.nonBootMinimumY>.008)errors.push({kind:'missing-captured-body-contact',clock,minimumBodyY:pose.nonBootMinimumY});
          for(const bone of['Hips','Spine','Chest','Neck','Head']){const source=plan.sourcePose?.rotations?.[bone];if(!source){unsupported.push({kind:'missing-captured-support-pose',clock,bone});break;}if(pose.bones[bone].q.angleTo(pose.bones[bone].q.clone().fromArray(source).normalize())>Math.PI/180)errors.push({kind:'body-support-pose-changed-before-first-plant',clock,bone});}
        }
      }
    }
    if(!sequential&&r.risePlan&&r.constraints?.stage==='rise-foot-approach'){
      const plan=r.risePlan;freeze(plans,'rise/'+r.episode?.id,plan,'rise-plan-mutated',clock);
      for(const bone of['LeftFoot','RightFoot'])if(r.baseSeconds>=.49-1e-8){expected.add(bone);const anchor=headingPoint([plan.origin[0]+(bone==='LeftFoot'?.1:-.1),0,plan.origin[2]],r);plants.set(bone,{bone,key:'rise/'+r.episode?.id+'/'+bone,anchor:actor.world.clone().fromArray(anchor),virtual:true});}else{expected.delete(bone);plants.delete(bone);}
    }
    for(const foot of r.constraints?.feet||[])if(!r.bridgePlan&&!sequential&&r.constraints.stage!=='rise-foot-approach'){
      if(foot.mode==='plant'){expected.add(foot.bone);plants.set(foot.bone,{bone:foot.bone,key:'virtual/'+r.episode?.id+'/'+r.constraints.stage+'/'+foot.bone,anchor:actor.world.clone().fromArray(headingPoint(foot.anchor||foot.target,r)),virtual:true});}
      else{expected.delete(foot.bone);plants.delete(foot.bone);}
    }
    if(r.episode){freeze(episodes,r.episode.id,{id:r.episode.id,startedAt:r.episode.startedAt,activationDeadline:r.episode.activationDeadline,origin:r.episode.origin},'episode-mutated',clock);if(Math.abs(r.episode.activationDeadline-r.episode.startedAt-4.5)>1e-8)errors.push({kind:'episode-budget',clock});if(r.episode.closedAt==null&&r.clock>r.episode.activationDeadline+1e-6&&r.request?.firstProgressAt==null)errors.push({kind:'activation-overdue',clock,request:r.request?.id});}
    const observedSpeed=sampleDt>1e-8?distance(pose.world,previous.world)/sampleDt:null;
    if(r.overlayClip==='keeper_catch'){
      const catchTime=clips.get('keeper_catch').events?.find(event=>/catch/.test(event.name||event.type||''))?.timeSeconds??.4;
      const arms=r.contributors.find(c=>c.scope==='arms'&&c.clipID==='keeper_catch'),catchKey=String(r.episode?.id)+'/'+String(arms?.requestID??'overlay');
      if(!catchEpisodes.has(catchKey))catchEpisodes.set(catchKey,{key:catchKey,requestID:arms?.requestID,committedSamples:0,actualBallSamples:0,firstClock:clock,lastClock:clock});
      const catchEpisode=catchEpisodes.get(catchKey),committed=r.overlaySeconds>=catchTime;catchEpisode.lastClock=clock;
      if(Boolean(r.presentation?.held)!==committed)errors.push({kind:'catch-presentation-event-mismatch',clock,overlaySeconds:r.overlaySeconds,authoredEventSeconds:catchTime,presentationHeld:r.presentation?.held});
      if(r.overlaySeconds<catchTime-1e-8&&/^keeper_dive_/.test(r.episode?.origin?.clipID||'')&&r.activeBaseClip!==r.episode.origin.clipID)errors.push({kind:'dive-body-changed-before-catch',clock,activeBaseClip:r.activeBaseClip});
      if(committed){
        catchEpisode.committedSamples++;
        const ball=api.inspect().scene.getObjectByName('Unbranded synthetic football');
        if(!ball?.visible||!ball.parent?.visible)errors.push({kind:'catch-ball-not-displayed',clock});
        else{
          const palms=['LeftHand','RightHand'].map(bone=>actor.bones[bone].localToWorld(actor.world.clone().set(0,-.05,.02)).toArray()),center=ball.getWorldPosition(actor.world.clone()).toArray();
          const expected=palms[0].map((x,i)=>(x+palms[1][i])*.5),yaw=actor.model.rotation.y;expected[0]+=.04*Math.sin(yaw);expected[2]+=.04*Math.cos(yaw);
          maximumBallAttachmentError=Math.max(maximumBallAttachmentError,distance(expected,center));maximumCatchPalmDistance=Math.max(maximumCatchPalmDistance,...palms.map(palm=>distance(palm,center)));catchContactSamples++;catchEpisode.actualBallSamples++;
        }
      }
    }
    if(last?.r.overlayClip==='keeper_catch'&&r.overlayClip!=='keeper_catch'){
      const arms=last.r.contributors.find(c=>c.scope==='arms'&&c.clipID==='keeper_catch'),key=String(last.r.episode?.id)+'/'+String(arms?.requestID??'overlay');
      if(!catchEpisodes.get(key)?.committedSamples)errors.push({kind:'catch-disappeared-before-authored-contact',clock,key});
    }
    for(const request of r.requests||[])if(accepted.includes(request.id)){
      currentFulfillment.set(request.id,false);
      freeze(requests,request.id,{id:request.id,clipID:request.clipID,requestedAt:request.requestedAt,episodeID:request.episodeID,activationDeadline:request.activationDeadline},'request-mutated',clock);
      const contributor=r.contributors.find(c=>c.clipID===request.clipID&&(request.scope==='arms'?c.scope==='arms':c.scope==='body'));
      if(request.activatedAt!=null){
        const target=clips.get(request.clipID),rate=request.playbackRate??1;
        if(!(rate>0&&rate<=1))errors.push({kind:'unsupported-compressed-playback',clock,requestID:request.id,rate});
        const expectedDeadline=request.activatedAt+(request.scope==='locomotion'?4.5:Math.max(0,(target?.duration??0)-(request.entrySeconds||0))/rate+.35);
        if(!Number.isFinite(request.completionDeadline)||Math.abs(request.completionDeadline-expectedDeadline)>1e-5)errors.push({kind:'completion-budget',clock,requestID:request.id,expectedDeadline,actual:request.completionDeadline});
      }
      if(request.status==='active'&&!activated.has(request.id)){
        activated.add(request.id);
        if(request.scope==='body'&&request.clipID!=='get_up'){
          const up=actor.world.clone().set(0,1,0).applyQuaternion(pose.bones.Hips.worldQ).y;
          if(pose.bones.Hips.position[1]<.7||up<.8||!Object.values(pose.soles).some(point=>Math.abs(point[1])<=.008))errors.push({kind:'nonstanding-action-entry',clock,requestID:request.id,pelvisHeight:pose.bones.Hips.position[1],up,soles:pose.soles});
        }
      }
      if(request.scope==='locomotion'){
        const target=sourceTarget(request.clipID),bound=m?.requests?.find(record=>record.id===request.motorRequestID);
        if(bound&&bound.clip!==target)errors.push({kind:'motor-request-mapping',clock,request});
        const targetSpeed=target==='idle'?0:clips.get(target)?.speedMps;
        if(m&&bound&&Number.isFinite(targetSpeed)&&m.clock>bound.at+1e-6&&sampleDt>0){progress.set(request.id,{clock,actualClock:r.clock,sample:m.unwrappedPhase,scope:'locomotion'});if(!firstProgress.has(request.id))firstProgress.set(request.id,{clock:r.clock,samplingToleranceSeconds:Math.max(0,sampleDt)+1e-6});}
        const yaw=actor.motorYaw??actor.model.rotation.y;
        const neutral=target!=='idle'||['LeftFoot','RightFoot'].every(bone=>{const p=pose.soles[bone],dx=p[0]-pose.world[0],dz=p[2]-pose.world[2];return Math.abs(p[1])<=.003&&Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw))<=.015&&Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw)-(bone==='LeftFoot'?.1:-.1))<=.015;});
        const fulfilled=Boolean(request.status==='completed'&&m&&bound?.completedAt!=null&&Math.abs(m.actualSpeed-targetSpeed)<.01&&observedSpeed!=null&&Math.abs(observedSpeed-targetSpeed)<.03&&neutral&&(request.clipID!=='dribble'||actor.motorStyle?.weight>=1-1e-6&&r.modifiers?.some(modifier=>modifier.kind==='nativeUpperDelta'&&modifier.styleClipID==='dribble'&&modifier.weight>=1-1e-6)));currentFulfillment.set(request.id,fulfilled);
        if(!completion.has(request.id)&&fulfilled){completion.set(request.id,{clock,actualClock:r.clock,samplingToleranceSeconds:Math.max(0,sampleDt)+1e-6,scope:'locomotion',observedSpeed,targetSpeed,physicalTargetClip:target,motorRequestID:bound.id,actualSoles:pose.soles});witnesses.push({requestID:request.id,...completion.get(request.id)});}
      }else{
        const initial=initialPoses.get(request.id);
        const visibleProgress=initial&&Object.keys(initial).filter(bone=>request.scope!=='arms'||['LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand'].includes(bone)).some(bone=>pose.bones[bone].worldQ.angleTo(pose.bones[bone].worldQ.clone().fromArray(initial[bone]).normalize())>.01);
        if(contributor&&contributor.sampleSeconds>(request.entrySeconds||0)+1e-5&&visibleProgress){progress.set(request.id,{clock,actualClock:r.clock,sample:contributor.sampleSeconds,scope:contributor.scope});if(!firstProgress.has(request.id))firstProgress.set(request.id,{clock:r.clock,samplingToleranceSeconds:Math.max(0,sampleDt)+1e-6});}
        if(request.status==='completed'&&contributor&&progress.has(request.id)){
          const target=clips.get(request.clipID);let angle=0;
          if(request.scope==='body'&&target){const reference=api.inspect().sample(target,target.duration);for(const bone of['Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand']){const physicalModifier=(r.modifiers||[]).some(modifier=>modifier.kind==='nativePalmSurfaceIK'&&modifier.phase==='plant'&&modifier.weight>=1-1e-6&&modifier.solverIterations>0&&modifier.bones?.includes(bone)&&physicalPalmSupports.some(proof=>proof.key===modifier.contactKey&&proof.clipID===request.clipID&&[proof.bone.replace('Hand','Arm'),proof.bone.replace('Hand','ForeArm'),proof.bone].includes(bone)&&r.palmSupports?.some(support=>support.key===proof.key&&support.bone===proof.bone&&support.clipID===proof.clipID&&support.solveCount>0&&support.solverName==='nativePalmSurfaceIK'&&support.solverIterations>0&&Math.abs(support.lastSolveClock-actor.clock)<=1e-6)));if(!physicalModifier)angle=Math.max(angle,pose.bones[bone].q.angleTo(pose.bones[bone].q.clone().fromArray(reference.rotations[bone]).normalize())*180/Math.PI);}}
          if(target&&contributor.sampleSeconds>=target.duration-1/120-1e-6&&(request.scope==='arms'||angle<=5)){currentFulfillment.set(request.id,true);if(!completion.has(request.id)){completion.set(request.id,{clock,actualClock:r.clock,samplingToleranceSeconds:Math.max(0,sampleDt)+1e-6,scope:request.scope,clipID:request.clipID,sample:contributor.sampleSeconds,maximumLocalAngleDegrees:angle,deadline:request.completionDeadline});witnesses.push({requestID:request.id,...completion.get(request.id)});}}
        }
      }
      const tolerance=Math.max(0,sampleDt)+1e-6;
      if(request.episodeID!=null&&request.status!=='superseded'&&r.clock>request.activationDeadline+tolerance&&(firstProgress.get(request.id)==null||firstProgress.get(request.id).clock>request.activationDeadline+firstProgress.get(request.id).samplingToleranceSeconds))errors.push({kind:'unwitnessed-activation-overdue',clock,requestID:request.id,firstActualProgressClock:firstProgress.get(request.id),deadline:request.activationDeadline,samplingToleranceSeconds:tolerance});
      if(request.status==='completed'&&(!Number.isFinite(request.completedAt)||request.completedAt>request.completionDeadline+tolerance||completion.has(request.id)&&completion.get(request.id).actualClock>request.completionDeadline+completion.get(request.id).samplingToleranceSeconds))errors.push({kind:'completed-after-deadline',clock,requestID:request.id,actualCompletedAt:request.completedAt,actualTerminalWitnessClock:completion.get(request.id)?.actualClock,deadline:request.completionDeadline,samplingToleranceSeconds:tolerance});
      if(request.status==='active'&&r.clock>request.completionDeadline+1e-6)errors.push({kind:'completion-overdue',clock,requestID:request.id});
    }
    const timelineKey=[r.activeBaseClip,r.phase,r.request?.id,r.request?.status,Math.floor(clock*10)].join('/');
    if(timelineKey!==lastTimelineKey){lastTimelineKey=timelineKey;timeline.push({clock,actualClock:r.clock,activeBaseClip:r.activeBaseClip,baseSeconds:r.baseSeconds,contributors:r.contributors,phase:r.phase,requestedClip:r.request?.clipID||null,requestID:r.request?.id||null,requestStatus:r.request?.status||null,motor:m?{actualSpeed:m.actualSpeed,targetSpeed:m.targetSpeed,phase:m.unwrappedPhase}:null});}
    last={r,m,clock};return{clip,seconds,contacts,expected,plants,palmSupports,canonical:!m&&!virtual,mirrored,descriptor:r,motor:m,supportLabel:m?'motor/'+(r.request?.clipID||m.requestedClip):clip.id,intentionalGroundTravel:['slide_tackle','fall'].includes(r.activeBaseClip)};
  }
  function noteRequest(clipID,clock,pose){const r=descriptor();if(!r?.request||r.request.clipID!==clipID){unsupported.push({kind:'request-not-observable',clock,clipID});return;}accepted.push(r.request.id);finalID=r.request.id;initialPoses.set(r.request.id,Object.fromEntries(Object.entries(pose.bones).filter(([bone])=>bone!=='Root').map(([bone,value])=>[bone,value.worldQ.toArray()])));lastWitnessClock=null;}
  function needsDrain(clock){
    if(!last||finalID==null)return false;
    const request=last.r.requests?.find(r=>r.id===finalID);
    if(!request){unsupported.push({kind:'request-disappeared',clock,requestID:finalID});return false;}
    if(request.status==='superseded'||request.status==='rejected')return false;
    if(completion.has(finalID)&&progress.has(finalID)&&currentFulfillment.get(finalID)){lastWitnessClock??=clock;return clock-lastWitnessClock<.2;}
    lastWitnessClock=null;
    const deadline=request.completionDeadline??request.activationDeadline??request.requestedAt+4.5;
    return last.r.clock<=deadline+1e-6;
  }
  function report(){
    const records=(last?.r.requests||[]).filter(r=>accepted.includes(r.id));
    const outstanding=records.filter(r=>!['completed','superseded'].includes(r.status));
    const rejected=records.filter(r=>r.status==='rejected');
    const unobserved=records.filter(r=>r.status==='completed'&&(!completion.has(r.id)||!progress.has(r.id)));
    const finalFulfilled=finalID==null||completion.has(finalID)&&progress.has(finalID)&&currentFulfillment.get(finalID)===true&&lastWitnessClock!=null&&last.clock-lastWitnessClock>=.2-1e-6;
    return{supported:unsupported.length===0,unsupported,errors,timeline,witnesses,requests:records,acceptedRequestIDs:accepted,finalRequestID:finalID,outstanding,rejected,unobservedCompletions:unobserved,maximumBallAttachmentError,maximumCatchPalmDistance,catchContactSamples,catchEpisodes:[...catchEpisodes.values()],nativeClockWitness:{...nativeClockWitness},firstProgressWitnesses:Object.fromEntries(firstProgress),finalFulfilled,finalStableSeconds:lastWitnessClock==null?0:last.clock-lastWitnessClock,pass:unsupported.length===0&&errors.length===0&&outstanding.length===0&&unobserved.length===0&&maximumBallAttachmentError<=.003&&maximumCatchPalmDistance<=.16&&[...catchEpisodes.values()].every(episode=>episode.committedSamples>0&&episode.actualBallSamples>0)&&finalFulfilled};
  }
  return{sample,noteRequest,needsDrain,report};
}
/** Independent audit-only anatomical ray reconstruction. No production helper calls. */
function createPhysicalPalmObserver({api,actor,calibrationCache=new WeakMap()}) {
  const errors=[],validations=[],unsupported=[],states=new Map(),lifecycles=new Map(),coverage={},observations=[],previousSupports=new Map(),kind='anatomicalHeelPalmRayV1',pairedKind='anatomicalPairedGetUpHeelPressurePointV3';
  let samples=0,expectedSamples=0,observedSamples=0,positiveSolverSamples=0,maximumPlantDistanceMeters=0,maximumPlantXZDistanceMeters=0,maximumNearGroundUnplantedXZStepMeters=0,nearGroundUnplantedTravel=[],minimumPointY=Infinity,maximumPointY=-Infinity,previousClock=null;
  const actorCache=calibrationCache.get(actor)||new Map();calibrationCache.set(actor,actorCache);
  const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
  const finite3=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
  const materialAt=(mesh,offset)=>Array.isArray(mesh.material)?mesh.material[mesh.geometry.groups.find(group=>offset>=group.start&&offset<group.start+group.count)?.materialIndex||0]?.name||'':mesh.material?.name||'';
  const fail=(messages,name,details={})=>messages.push({kind:name,...details});
  function validateCalibration(bone,c) {
    const issues=[],packageData=api.inspect().data,expectedHash=packageData?.hashes?.models?.[actor.path];
    if(!c||!['LeftHand','RightHand'].includes(bone)){fail(issues,'missing-physical-palm-calibration',{bone});errors.push(...issues);return{valid:false,issues};}
    const cacheKey=expectedHash+'/'+bone+'/'+JSON.stringify(c);
    if(actorCache.has(cacheKey))return actorCache.get(cacheKey);
    const paired=c.kind===pairedKind;
    const expectedSelector=paired?{kind:'fixedPairedBoundedHeelPressureXY',region:'proximalPalmarHeelPad',coordinateFrame:'inverseBindHandLocalMeters',domainX:[-.015,.015],domainY:[-.045,-.020],pressureDirection:[0,Math.sin(Math.PI/18),-Math.cos(Math.PI/18)],palmarNormalZMaximum:-.5,minCornerHandInfluence:.5,minPointHandInfluence:.8,selectionObjective:'maximizeMinimumNearFarAuthoredGetUp05ActualSkinHeelSupportAtOneCommonXY',calibrationPose:{clipID:'get_up',sampleSeconds:.5,pressureWorldDirection:[0,-1,0],motionSha256:packageData?.hashes?.motion},noFallback:true}:{kind:'fixedHandLocalPalmarRay',region:'proximalPalmarHeel',coordinateFrame:'inverseBindHandLocalMeters',referenceXY:[bone==='LeftHand'?-.0025:.0025,-.030],rayOriginZ:-.20,rayDirection:[0,0,1],palmarNormalZMaximum:-.5,minCornerHandInfluence:.5,minPointHandInfluence:.8,noFallback:true};
    if(paired){
      const xy=c.selector?.referenceXY;
      if(!Array.isArray(xy)||xy.length!==2||!xy.every(Number.isFinite)||xy[0]<-.015-1e-8||xy[0]>.015+1e-8||xy[1]<-.045-1e-8||xy[1]>-.020+1e-8){fail(issues,'palm-calibration-outside-heel-pad',{bone});errors.push(...issues);return{valid:false,issues};}
      expectedSelector.referenceXY=xy;
      const base=actor.path.replace(/-lod[01]\.glb$/,'');
      expectedSelector.pairedModelSha256={near:packageData?.hashes?.models?.[base+'-lod0.glb'],far:packageData?.hashes?.models?.[base+'-lod1.glb']};
      if(!expectedSelector.pairedModelSha256.near||!expectedSelector.pairedModelSha256.far||!packageData?.hashes?.motion)fail(issues,'palm-calibration-missing-paired-source-binding',{bone});
    }
    const matches=(value,expected)=>Array.isArray(expected)?Array.isArray(value)&&value.length===expected.length&&expected.every((x,i)=>matches(value[i],x)):expected&&typeof expected==='object'?value&&typeof value==='object'&&Object.entries(expected).every(([key,x])=>matches(value[key],x)):value===expected;
    if(!expectedHash||c.modelSha256!==expectedHash||!([kind,pairedKind].includes(c.kind))||c.handName&&c.handName!==bone)fail(issues,'palm-calibration-model-or-kind',{bone,expectedHash});
    for(const[key,value]of Object.entries(expectedSelector))if(!matches(c.selector?.[key],value))fail(issues,'palm-calibration-selector',{bone,key});
    const metadataIndices=c.triangleVertexIndices,metadataBary=c.barycentricWeights;
    if(!Array.isArray(metadataIndices)||metadataIndices.length!==3||new Set(metadataIndices).size!==3||!metadataIndices.every(Number.isInteger)||!finite3(metadataBary)||metadataBary.some(x=>x<0)||Math.abs(metadataBary.reduce((a,b)=>a+b,0)-1)>1e-6)fail(issues,'palm-calibration-triangle-metadata',{bone});
    let chosen=null,front=null;
    for(let meshIndex=0;meshIndex<actor.meshes.length;meshIndex++){
      const mesh=actor.meshes[meshIndex],g=mesh.geometry,p=g.getAttribute('position'),j=g.getAttribute('skinIndex'),w=g.getAttribute('skinWeight'),hand=mesh.skeleton.bones.findIndex(value=>value.name===bone);if(hand<0||!p||!j||!w)continue;
      const vertices=new Map();
      function vertex(i){
        if(vertices.has(i))return vertices.get(i);
        const bind=[p.getX(i),p.getY(i),p.getZ(i)],local=actor.world.clone().fromArray(bind).applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[hand]).toArray(),ids=[j.getX(i),j.getY(i),j.getZ(i),j.getW(i)],weights=[w.getX(i),w.getY(i),w.getZ(i),w.getW(i)],named={};
        for(let k=0;k<4;k++)if(weights[k]){const name=mesh.skeleton.bones[ids[k]].name;named[name]=(named[name]||0)+weights[k];}
        const value={bind,local,named,hand:named[bone]||0};vertices.set(i,value);return value;
      }
      const count=g.index?.count||p.count;
      for(let offset=0;offset<count;offset+=3){
        const ids=[0,1,2].map(k=>g.index?g.index.getX(offset+k):offset+k),corners=ids.map(vertex);if(corners.some(value=>value.hand<.5))continue;
        const[a,b,c0]=corners.map(value=>value.local),u=b.map((x,i)=>x-a[i]),v=c0.map((x,i)=>x-a[i]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...cross);if(length<1e-10)continue;
        const normal=cross.map(x=>x/length);if(normal[2]>=-.5)continue;
        const origin=[...expectedSelector.referenceXY,-.20],t=normal.reduce((sum,x,i)=>sum+x*(a[i]-origin[i]),0)/normal[2],point=[origin[0],origin[1],origin[2]+t];if(t<0||point[2]>.02)continue;
        const rel=point.map((x,i)=>x-a[i]),dot=(x,y)=>x.reduce((sum,value,i)=>sum+value*y[i],0),uu=dot(u,u),uv=dot(u,v),vv=dot(v,v),ru=dot(rel,u),rv=dot(rel,v),den=uu*vv-uv*uv;if(Math.abs(den)<1e-20)continue;
        const beta=(vv*ru-uv*rv)/den,gamma=(uu*rv-uv*ru)/den,bary=[1-beta-gamma,beta,gamma];if(bary.some(x=>x< -1e-6))continue;
        const clamped=bary.map(x=>Math.max(0,x)),sum=clamped.reduce((a,b)=>a+b,0),weights=clamped.map(x=>x/sum),handMass=weights.reduce((sum,x,i)=>sum+x*corners[i].hand,0);if(handMass<.8)continue;
        const candidate={mesh,meshIndex,offset,indices:ids,bary:weights,corners,point,normal,handMass,material:materialAt(mesh,offset)};
        if(!front||t<front.t)front={t,candidate};
        if(meshIndex===c.meshIndex&&Array.isArray(metadataIndices)&&ids.every((id,i)=>id===metadataIndices[i]))chosen=candidate;
      }
    }
    if(!chosen||!front)fail(issues,'palm-calibration-not-anatomical-ray',{bone});
    else{
      if(chosen.mesh.name!==c.meshName||chosen.material!==c.material||distance(chosen.point,front.candidate.point)>1e-6)fail(issues,'palm-calibration-mesh-material-or-frontmost',{bone});
      if(!finite3(c.handLocalReferencePoint)||distance(chosen.point,c.handLocalReferencePoint)>1e-6||!finite3(c.handLocalNormal)||distance(chosen.normal,c.handLocalNormal)>1e-6)fail(issues,'palm-calibration-reference-or-normal',{bone});
      for(let k=0;k<3;k++){
        if(!finite3(c.bindPositions?.[k])||distance(chosen.corners[k].bind,c.bindPositions[k])>1e-6||Math.abs(chosen.bary[k]-metadataBary?.[k])>1e-6)fail(issues,'palm-calibration-bind-or-barycentric',{bone,corner:k});
        const named=c.namedInfluences?.[k],actual=chosen.corners[k].named;
        if(!named||JSON.stringify(Object.keys(named).sort())!==JSON.stringify(Object.keys(actual).sort())||Object.keys(actual).some(name=>!Number.isFinite(named[name])||Math.abs(actual[name]-named[name])>1e-6))fail(issues,'palm-calibration-named-influences',{bone,corner:k});
      }
    }
    const result={valid:issues.length===0,issues,chosen,modelSha256:expectedHash,bone};
    if(result.valid)actorCache.set(cacheKey,result);validations.push({bone,modelSha256:expectedHash,valid:result.valid,issues,meshIndex:chosen?.meshIndex,triangleVertexIndices:chosen?.indices,barycentricWeights:chosen?.bary,handLocalReferencePoint:chosen?.point});errors.push(...issues);return result;
  }
  function sampleWorld(validation){
    if(!validation?.valid)return null;
    const chosen=validation.chosen,vertices=chosen.indices.map(index=>chosen.mesh.getVertexPosition(index,actor.world.clone()).applyMatrix4(chosen.mesh.matrixWorld).toArray()),point=[0,0,0];for(let k=0;k<3;k++)for(let axis=0;axis<3;axis++)point[axis]+=vertices[k][axis]*chosen.bary[k];return{point,vertices};
  }
  // Active obligations come from the actual native base clock and immutable
  // recovery plan, never the UI request or the controller's support flags.
  function sample({descriptor=null,clock=actor.clock,sampleDt=0}={}) {
    const r=descriptor||(typeof actor.recoveryDescriptor==='function'?actor.recoveryDescriptor():null);
    samples++;
    if(!r||!Array.isArray(r.palmSupports)){unsupported.push({kind:'physical-palm-public-supports-missing',clock});return{validatedBones:[],validatedSupports:[]};}
    const clip=api.inspect().clipMap.get(r.activeBaseClip),expected=new Map(),dt=previousClock==null?0:clock-previousClock;
    const mirror=name=>name.startsWith('Left')?'Right'+name.slice(4):name.startsWith('Right')?'Left'+name.slice(5):name;
    const mirrored=Boolean(r.risePlan?.mirroredX||r.contributors?.some(c=>c.scope==='body'&&c.transform==='mirroredX'));
    if(clip&&!r.overlayClip&&!r.bridgePlan)for(const contact of clip.contacts||[]){if(contact.mode==='hand-support'&&contact.start-1e-8<=r.baseSeconds&&r.baseSeconds<=contact.end+1e-8)expected.set(mirrored?mirror(contact.bone):contact.bone,{clipID:clip.id,start:contact.start,end:contact.end,mode:'native'});}
    const bridge=r.bridgePlan,bridgeElapsed=r.constraints?.elapsed;
    if(bridge){const key='plan/'+r.episode?.id,value=JSON.stringify(bridge);if(lifecycles.has(key)&&lifecycles.get(key)!==value)errors.push({kind:'physical-palm-bridge-plan-mutated',clock,key});else lifecycles.set(key,value);}
    if(bridge?.sourcePalm&&Number.isFinite(bridgeElapsed)&&bridgeElapsed<=bridge.duration*.25+1e-8)expected.set(bridge.sourcePalm.bone||'LeftHand',{mode:'bridge',episodeID:r.episode?.id});
    expectedSamples+=expected.size;
    const seen=new Set(),validatedBones=[],validatedSupports=[],currentSupports=new Map();
    for(const support of r.palmSupports){
      const bone=support.bone,key=support.key,required=expected.get(bone),bucket=coverage[(required?.clipID||support.clipID)+'/'+bone]??={expectedSamples:0,observedSamples:0,positiveSolverSamples:0};
      if(seen.has(bone)){errors.push({kind:'physical-palm-duplicate-bone',clock,bone});continue;}seen.add(bone);
      if(!['LeftHand','RightHand'].includes(bone)||typeof key!=='string'||!finite3(support.anchorWorldMeters)||!Array.isArray(support.orientationWorld)||support.orientationWorld.length!==4||!support.orientationWorld.every(Number.isFinite)||!Number.isFinite(support.weight)||support.weight<0||support.weight>1){errors.push({kind:'physical-palm-state-schema',clock,bone});continue;}
      const nativeTimingFields=['sourceContactStartSeconds','sourceContactEndSeconds','admissionStartSourceSeconds','approachSeconds','releaseSeconds','startedAtClock','sourceTimeAtCreation'];
      if(nativeTimingFields.some(field=>!Number.isFinite(support[field])))errors.push({kind:'physical-palm-native-timing-schema',clock,bone,key,missing:nativeTimingFields.filter(field=>!Number.isFinite(support[field]))});
      const continuing=previousSupports.get(bone);
      const activation=(r.requests||[]).slice().reverse().find(request=>request.clipID===support.clipID&&request.scope==='body'&&request.activatedAt!=null),activationKey=activation?.id??null;
      if(continuing&&continuing.key===key&&support.startedAtClock!==continuing.startedAtClock&&!(activationKey!==continuing.activationKey&&activation?.activatedAt>=continuing.actorClock-1e-7&&activation.activatedAt<=actor.clock+1e-7&&Math.abs(support.startedAtClock-actor.clock)<=1e-6))errors.push({kind:'physical-palm-continuing-state-rekeyed',clock,bone,key,previousStartedAtClock:continuing.startedAtClock,startedAtClock:support.startedAtClock});
      currentSupports.set(bone,{key,startedAtClock:support.startedAtClock,activationKey,actorClock:actor.clock});
      const source=api.inspect().clipMap.get(support.clipID),sourceContact=source?.contacts?.find(c=>c.mode==='hand-support'&&(mirrored?mirror(c.bone):c.bone)===bone&&Math.abs(c.start-support.sourceContactStartSeconds)<1e-7&&Math.abs(c.end-support.sourceContactEndSeconds)<1e-7);
      if(!sourceContact)errors.push({kind:'physical-palm-source-contact',clock,bone,clipID:support.clipID});
      const immutable={key,bone,clipID:support.clipID,sourceContactStartSeconds:support.sourceContactStartSeconds,sourceContactEndSeconds:support.sourceContactEndSeconds,admissionStartSourceSeconds:support.admissionStartSourceSeconds,approachSeconds:support.approachSeconds,releaseSeconds:support.releaseSeconds,startedAtClock:support.startedAtClock,sourceTimeAtCreation:support.sourceTimeAtCreation,anchorWorldMeters:support.anchorWorldMeters,orientationWorld:support.orientationWorld,calibration:support.calibration,recipe:support.recipe};
      const stateKey=key+'/'+support.startedAtClock,serialized=JSON.stringify(immutable),prior=states.get(stateKey);
      if(prior&&prior.immutable!==serialized)errors.push({kind:'physical-palm-immutable-state-mutated',clock,bone,key});
      if(support.approachSeconds!==.18||support.releaseSeconds!==.18||Math.abs(support.admissionStartSourceSeconds-Math.max(0,support.sourceContactStartSeconds-.18))>1e-7)errors.push({kind:'physical-palm-native-timing-contract',clock,bone,key});
      let expectedPhase=null,expectedWeight=null;
      if(bridge&&!support.bridgeLifecycle)errors.push({kind:'physical-palm-bridge-lifecycle-missing',clock,bone,key});
      if(support.bridgeLifecycle){
        const life=support.bridgeLifecycle;
        if(['startClock','duration','holdEndSeconds','releaseEndSeconds'].some(field=>!Number.isFinite(life[field])))errors.push({kind:'physical-palm-bridge-timing-schema',clock,bone,key});
        const lifeKey=stateKey+'/bridge/'+life.episodeID,lifeText=JSON.stringify(life);
        if(lifecycles.has(lifeKey)&&lifecycles.get(lifeKey)!==lifeText)errors.push({kind:'physical-palm-bridge-lifecycle-mutated',clock,bone,key});else lifecycles.set(lifeKey,lifeText);
        if(!bridge||life.episodeID!==r.episode?.id||Math.abs(life.duration-bridge.duration)>1e-7||Math.abs(life.holdEndSeconds-.25*life.duration)>1e-7||Math.abs(life.releaseEndSeconds-.40*life.duration)>1e-7||!Number.isFinite(support.bridgeElapsedSeconds)||Math.abs(support.bridgeElapsedSeconds-bridgeElapsed)>1e-7||Math.abs(actor.clock-life.startClock-bridgeElapsed)>1e-6)errors.push({kind:'physical-palm-bridge-plan-mismatch',clock,bone,key});
        const u=Math.max(0,Math.min(1,(bridgeElapsed-life.holdEndSeconds)/(life.releaseEndSeconds-life.holdEndSeconds)));
        expectedWeight=1-u*u*(3-2*u);expectedPhase=expectedWeight>=1-1e-6?'plant':'release';
      }else if(r.activeBaseClip===support.clipID){
        const time=r.baseSeconds,u=Math.max(0,Math.min(1,(time-support.admissionStartSourceSeconds)/support.approachSeconds));expectedWeight=u*u*(3-2*u);expectedPhase=time>=support.sourceContactStartSeconds-1e-7?'plant':'approach';
        if(time>support.sourceContactEndSeconds+1e-7){const v=Math.max(0,Math.min(1,(time-support.sourceContactEndSeconds)/support.releaseSeconds));expectedWeight=1-v*v*(3-2*v);expectedPhase='release';}
      }else errors.push({kind:'physical-palm-outside-active-base-or-bridge',clock,bone,key,activeBaseClip:r.activeBaseClip});
      if(expectedPhase!==support.phase||Math.abs(expectedWeight-support.weight)>1e-6)errors.push({kind:'physical-palm-phase-weight-mismatch',clock,bone,key,expectedPhase,expectedWeight,phase:support.phase,weight:support.weight});
      const executionValid=support.solverName==='nativePalmSurfaceIK'&&Number.isInteger(support.solverIterations)&&support.solverIterations>0&&Number.isInteger(support.solveCount)&&support.solveCount>=0&&Number.isFinite(support.lastSolveClock)&&Math.abs(support.lastSolveClock-actor.clock)<=1e-6;
      if(!executionValid)errors.push({kind:'physical-palm-solver-execution-missing',clock,bone,key,solverName:support.solverName,solverIterations:support.solverIterations,solveCount:support.solveCount,lastSolveClock:support.lastSolveClock,actorClock:actor.clock});
      if(prior){const expectedIncrement=sampleDt>1e-8&&actor.clock>prior.actorClock+1e-8?1:0;if(support.solveCount!==prior.solveCount+expectedIncrement)errors.push({kind:'physical-palm-solver-count-progression',clock,bone,key,prior:prior.solveCount,current:support.solveCount,expectedIncrement});}
      if(!api.inspect().data?.hashes?.palmSupport||support.calibration?.calibrationSourceSha256!==api.inspect().data.hashes.palmSupport)unsupported.push({kind:'physical-palm-calibration-helper-source-binding',clock,bone,key});
      const validation=validateCalibration(bone,support.calibration),surface=sampleWorld(validation);
      if(!surface)continue;
      const point=surface.point,anchor=support.anchorWorldMeters,residual=distance(point,anchor),xz=Math.hypot(point[0]-anchor[0],point[2]-anchor[2]),planted=required!=null;
      minimumPointY=Math.min(minimumPointY,point[1]);maximumPointY=Math.max(maximumPointY,point[1]);
      if(required){bucket.expectedSamples++;if(required.mode==='native'&&(support.clipID!==required.clipID||Math.abs(support.sourceContactStartSeconds-required.start)>1e-7||Math.abs(support.sourceContactEndSeconds-required.end)>1e-7))errors.push({kind:'physical-palm-wrong-active-contact',clock,bone,key});
        observedSamples++;bucket.observedSamples++;maximumPlantDistanceMeters=Math.max(maximumPlantDistanceMeters,residual);maximumPlantXZDistanceMeters=Math.max(maximumPlantXZDistanceMeters,xz);
        if(support.phase!=='plant'||support.weight<1-1e-6||point[1]<-.001||point[1]>.003||residual>.003||xz>.003)errors.push({kind:'physical-palm-active-patch-contact',clock,bone,key,point,anchor,residualMeters:residual,xzResidualMeters:xz,phase:support.phase,weight:support.weight});
        if(executionValid&&support.solveCount>0){positiveSolverSamples++;bucket.positiveSolverSamples++;}
        if(executionValid&&support.solveCount>0&&validation.valid&&support.phase==='plant'&&support.weight>=1-1e-6&&residual<=.003&&xz<=.003&&point[1]>=-.001&&point[1]<=.003){validatedBones.push(bone);validatedSupports.push({bone,key,clipID:support.clipID});}
      }
      let nearGroundStep=0;
      if(prior&&dt>1e-8&&!planted&&!prior.planted&&point[1]<=.008&&prior.point[1]<=.008){nearGroundStep=Math.hypot(point[0]-prior.point[0],point[2]-prior.point[2]);maximumNearGroundUnplantedXZStepMeters=Math.max(maximumNearGroundUnplantedXZStepMeters,nearGroundStep);if(nearGroundStep>.003)nearGroundUnplantedTravel.push({kind:'physical-palm-near-ground-unplanted-travel',clock,bone,key,previousPoint:prior.point,point,xzStepMeters:nearGroundStep,acceptance:false});}
      states.set(stateKey,{immutable:serialized,clock,actorClock:actor.clock,solveCount:support.solveCount,point,planted});
      if(required&&(observations.length<12||residual>=maximumPlantDistanceMeters))observations.push({clock,actorClock:actor.clock,bone,key,clipID:support.clipID,point,vertices:surface.vertices,anchor,residualMeters:residual,xzResidualMeters:xz,solveCount:support.solveCount,lastSolveClock:support.lastSolveClock,solverIterations:support.solverIterations});
    }
    for(const[bone,required]of expected)if(!seen.has(bone)){const bucket=coverage[(required.clipID||'bridge')+'/'+bone]??={expectedSamples:0,observedSamples:0,positiveSolverSamples:0};bucket.expectedSamples++;errors.push({kind:'physical-palm-expected-support-missing',clock,bone,...required});}
    previousSupports.clear();for(const[bone,value]of currentSupports)previousSupports.set(bone,value);previousClock=clock;return{validatedBones,validatedSupports};
  }
  function report(){return{samples,expectedSamples,observedSamples,positiveSolverSamples,coverage,nearGroundUnplantedTravel,maximumPlantDistanceMeters,maximumPlantXZDistanceMeters,maximumNearGroundUnplantedXZStepMeters,minimumPointY:Number.isFinite(minimumPointY)?minimumPointY:null,maximumPointY:Number.isFinite(maximumPointY)?maximumPointY:null,observations,errors,unsupported,validations,pass:errors.length===0&&unsupported.length===0&&observedSamples===expectedSamples&&Object.values(coverage).every(row=>!row.expectedSamples||row.positiveSolverSamples>0),limits:'Actual immutable anatomical Skin/glove triangle and full mixed-bone skinning are independent. Native/bridge obligations use actual base clocks and immutable plan timing; authored marker residual is descriptive. Existing8mm body, fullmesh floor,3mm feet and dynamic gates remain separate.'};}
  return{validateCalibration,sampleWorld,sample,report};
}
/** Proposed read-only browser factory; no runtime or source mutation. */
function createBodySettlingObserver({api,actor}) {
  const errors=[],unsupported=[],episodes=new Map(),witnesses=[],statePhases=[],implementationDiagnostics=[],descriptiveThreeMillimeterBodyContact=[];
  let cache=null,previousScan=null,previousState=null,samples=0,scans=0,maximumGeometryError=0,maximumOffsetRate=0;
  const finite3=x=>Array.isArray(x)&&x.length===3&&x.every(Number.isFinite),distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
  const issue=(kind,details={})=>errors.push({kind,...details});
  const opaque=m=>m&&m.transparent!==true&&(m.opacity??1)===1&&!(m.alphaTest>0);
  function buildCache(){
    const hash=api.inspect().data?.hashes?.models?.[actor.path];
    if(!hash){unsupported.push({kind:'body-settle-model-hash-missing',path:actor.path});return null;}
    if(cache?.hash===hash&&cache.meshes.every((mesh,i)=>mesh===actor.meshes[i]))return cache;
    const selected=[],lookup=new Map();
    for(let meshIndex=0;meshIndex<actor.meshes.length;meshIndex++){
      const mesh=actor.meshes[meshIndex],g=mesh.geometry,p=g.getAttribute('position'),j=g.getAttribute('skinIndex'),w=g.getAttribute('skinWeight');
      if(!p||!j||!w||!mesh.skeleton){unsupported.push({kind:'body-settle-skin-attributes-missing',meshIndex});continue;}
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],vertexMaterials=new Map(),count=g.index?.count??p.count;
      for(let offset=0;offset<count;offset++){
        const material=materials[g.groups?.find(group=>offset>=group.start&&offset<group.start+group.count)?.materialIndex??0];
        if(!opaque(material))continue;
        const index=g.index?g.index.getX(offset):offset;
        if(!vertexMaterials.has(index))vertexMaterials.set(index,material.name||'');
      }
      for(const[index,material]of vertexMaterials){
        const ids=[j.getX(index),j.getY(index),j.getZ(index),j.getW(index)],weights=[w.getX(index),w.getY(index),w.getZ(index),w.getW(index)],namedInfluences={};
        for(let k=0;k<4;k++)if(weights[k]){const name=mesh.skeleton.bones[ids[k]]?.name;if(!name){unsupported.push({kind:'body-settle-joint-missing',meshIndex,index});continue;}namedInfluences[name]=(namedInfluences[name]||0)+weights[k];}
        const excluded=Object.entries(namedInfluences).reduce((sum,[name,weight])=>sum+(/(Hand|Foot)$/.test(name)?weight:0),0);
        if(excluded>=.5)continue;
        const value={mesh,meshIndex,meshName:mesh.name,vertexIndex:index,material,bindPosition:[p.getX(index),p.getY(index),p.getZ(index)],namedInfluences};
        lookup.set(meshIndex+'/'+index,selected.length);selected.push(value);
      }
    }
    cache={hash,meshes:actor.meshes.slice(),selected,lookup};return cache;
  }
  function scanGeometry(clock=actor.clock){
    const c=buildCache();if(!c)return null;
    const points=new Float64Array(c.selected.length*3),v=actor.world.clone();let minimumY=Infinity,minimumIndex=-1;
    for(let k=0;k<c.selected.length;k++){const item=c.selected[k],point=item.mesh.getVertexPosition(item.vertexIndex,v).applyMatrix4(item.mesh.matrixWorld);points.set(point.toArray(),k*3);if(point.y<minimumY){minimumY=point.y;minimumIndex=k;}}
    scans++;return{clock,hash:c.hash,cache:c,points,minimumY,minimumIndex};
  }
  function validateGeometry(witness,scan,label,clock){
    if(!witness||!scan){unsupported.push({kind:'body-settle-geometry-witness-unavailable',label,clock});return false;}
    if(witness.modelSha256!==scan.hash||!Number.isInteger(witness.meshIndex)||!Number.isInteger(witness.vertexIndex)||!finite3(witness.bindPosition)||!finite3(witness.worldPosition)||!witness.namedInfluences||!Number.isFinite(witness.minimumY)||!Number.isFinite(witness.clock)){
      issue('body-settle-geometry-schema',{label,clock});return false;
    }
    const index=scan.cache.lookup.get(witness.meshIndex+'/'+witness.vertexIndex),item=scan.cache.selected[index];
    if(!item){issue('body-settle-geometry-not-opaque-body',{label,clock,meshIndex:witness.meshIndex,vertexIndex:witness.vertexIndex});return false;}
    const actual=Array.from(scan.points.slice(index*3,index*3+3));
    const namedKeys=[...new Set([...Object.keys(item.namedInfluences),...Object.keys(witness.namedInfluences)])];
    const bindError=distance(item.bindPosition,witness.bindPosition),worldError=distance(actual,witness.worldPosition),weightError=Math.max(0,...namedKeys.map(name=>Math.abs((item.namedInfluences[name]||0)-(witness.namedInfluences[name]||0))));
    const error=Math.max(bindError,worldError,weightError,Math.abs(scan.minimumY-witness.minimumY),Math.abs(actual[1]-scan.minimumY));maximumGeometryError=Math.max(maximumGeometryError,error);
    const valid=error<=1e-6&&Math.abs(witness.clock-scan.clock)<=1e-6&&witness.meshName===item.meshName&&witness.material===item.material&&witness.selection==='opaque geometry with combined Hand/Foot influence below .5';
    if(!valid)issue('body-settle-geometry-mismatch',{label,clock,error,scanClock:scan.clock,witnessClock:witness.clock,actualMinimumY:scan.minimumY,witnessMinimumY:witness.minimumY,meshIndex:witness.meshIndex,vertexIndex:witness.vertexIndex});
    return valid;
  }
  function sample({descriptor=null,clock=actor.clock,sampleDt=0}={}){
    const r=descriptor||(typeof actor.recoveryDescriptor==='function'?actor.recoveryDescriptor():null);if(!r){unsupported.push({kind:'body-settle-descriptor-missing',clock});return;}
    const plan=r.risePlan?.bodySettlePlan,state=r.bodySettling;
    if(!plan){if(r.risePlan?.kind==='sequentialSupportedFootUnroll')unsupported.push({kind:'body-settle-required-plan-missing',clock});if(/^(fall|keeper_dive_)/.test(r.activeBaseClip))previousScan=scanGeometry(actor.clock);return;}
    // A queued request may create a new request episode while the same physical
    // rise and immutable captured source geometry continue. Its identity is
    // the model and actual rise start, not that request episode. The complete
    // plan (including initial witness identity) still remains immutable below.
    samples++;const scan=scanGeometry(actor.clock),key=String(scan?.hash??'missing-model')+'/'+plan.startClock;let episode=episodes.get(key);
    if(!episode){
      episode={key,plan:JSON.stringify(plan),initialValidated:false,last:null,requestEpisodeIDs:[]};episodes.set(key,episode);
      for(const[name,expected]of Object.entries({boundSeconds:.30,targetClearanceMeters:.0015,maximumRateMps:.05,maximumOffsetMeters:.03,firstFootTransferConcurrent:true}))if(plan[name]!==expected)issue('body-settle-plan-contract',{clock,key,name,expected,actual:plan[name]});
      if(!Number.isFinite(plan.startClock)||!plan.initialGeometryWitness){unsupported.push({kind:'body-settle-plan-initial-witness-missing',clock,key});}
      else{
        const initial=plan.initialGeometryWitness,initialScan=[previousScan,scan].find(value=>value&&value.hash===initial.modelSha256&&Math.abs(value.clock-initial.clock)<=1e-6);
        episode.initialValidated=validateGeometry(initial,initialScan,'initial',clock);
        if(initial.clock>plan.startClock+1e-6)issue('body-settle-initial-clock-after-plan',{clock,key});
      }
    }else if(JSON.stringify(plan)!==episode.plan)issue('body-settle-plan-mutated',{clock,key});
    if(!episode.requestEpisodeIDs.includes(r.episode?.id??null))episode.requestEpisodeIDs.push(r.episode?.id??null);
    const required=['active','elapsedSeconds','carryWeight','offsetMeters','velocityMps','processedClock','startClock','boundSeconds','targetClearanceMeters','maximumRateMps','maximumOffsetMeters','firstFootTransferConcurrent','actualGeometryWitness','deadlineMissed'];
    if(!state||required.some(name=>!(name in state))){unsupported.push({kind:'body-settle-public-schema-missing',clock,key,missing:required.filter(name=>!state||!(name in state))});previousScan=scan;return;}
    for(const name of ['elapsedSeconds','carryWeight','offsetMeters','velocityMps','processedClock'])if(!Number.isFinite(state[name]))issue('body-settle-nonfinite-state',{clock,key,name});
    for(const name of ['startClock','boundSeconds','targetClearanceMeters','maximumRateMps','maximumOffsetMeters','firstFootTransferConcurrent'])if(state[name]!==plan[name])issue('body-settle-state-plan-mismatch',{clock,key,name});
    const elapsed=state.elapsedSeconds,hold=r.risePlan.bodyHoldSeconds;
    if(episode.rawPhase!==state.phase){episode.rawPhase=state.phase;statePhases.push({clock,key,phase:state.phase??null,active:state.active,elapsedSeconds:elapsed,carryWeight:state.carryWeight,processedClock:state.processedClock,actualWitnessClock:state.actualGeometryWitness?.clock??null,currentMinimumY:scan?.minimumY??null});}
    // Final C16 refreshes the public actual witness after every final IK/floor
    // pass, including carry fade and later native get_up. processedClock is a
    // separate solve clock and intentionally stops when the hold interval ends.
    validateGeometry(state.actualGeometryWitness,scan,'actual',clock);
    if(!r.risePlan.supportFoot&&elapsed<(r.risePlan.firstFootLandingSeconds??.55)-1e-8&&scan?.minimumY>.008)issue('missing-opaque-captured-body-contact',{clock,key,minimumBodyY:scan.minimumY,thresholdMeters:.008,selection:'opaque geometry with combined Hand/Foot influence below .5'});
    if(state.active!==(elapsed<=hold+1e-8))issue('body-settle-active-window-mismatch',{clock,key,elapsed,hold,active:state.active});
    if(episode.last&&elapsed>hold+1e-8&&Math.abs(state.processedClock-episode.last.processedClock)>1e-9)issue('body-settle-post-hold-processed-clock-advanced',{clock,key,elapsed,hold,previous:episode.last.processedClock,current:state.processedClock});
    const blend=r.risePlan.bodyBlendSeconds,smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);},expectedCarry=1-smooth((elapsed-hold)/blend);
    if(Math.abs(state.carryWeight-expectedCarry)>1e-6||state.offsetMeters< -1e-9||state.offsetMeters>plan.maximumOffsetMeters+1e-9||Math.abs(state.velocityMps)>plan.maximumRateMps+1e-6||state.processedClock>actor.clock+1e-6||state.elapsedSeconds< -1e-8)issue('body-settle-state-bounds',{clock,key,state:{...state,actualGeometryWitness:undefined},expectedCarry});
    if(Math.abs((actor.clock-plan.startClock)-elapsed)>1e-6)issue('body-settle-elapsed-wall-clock',{clock,key,elapsed,actorClock:actor.clock,startClock:plan.startClock});
    if(state.active&&elapsed<=hold+1e-8&&Math.abs(state.processedClock-actor.clock)>1e-6)issue('body-settle-stale-processed-clock',{clock,key,processedClock:state.processedClock,actorClock:actor.clock});
    if(r.constraints&&Math.abs(r.constraints.elapsed-elapsed)>1e-6)issue('body-settle-elapsed-clock-mismatch',{clock,key});
    if(episode.last){
      const prior=episode.last,dt=clock-prior.clock,advance=state.offsetMeters-prior.offsetMeters;
      if(dt<=1e-8||sampleDt===0){for(const name of ['offsetMeters','velocityMps','processedClock','elapsedSeconds','carryWeight'])if(Math.abs(state[name]-prior[name])>1e-9)issue('body-settle-zero-dt-progression',{clock,key,name,previous:prior[name],current:state[name]});}
      else{
        maximumOffsetRate=Math.max(maximumOffsetRate,advance/dt);
        if(advance>plan.maximumRateMps*Math.max(0,Math.min(dt,plan.boundSeconds-prior.elapsedSeconds))+1e-6)implementationDiagnostics.push({kind:'body-settle-continued-after-bound',clock,key,dt,advance,previousElapsedSeconds:prior.elapsedSeconds,boundSeconds:plan.boundSeconds,acceptance:false});
        if(elapsed<=hold+1e-8&&Math.abs(state.velocityMps+advance/dt)>1e-6)issue('body-settle-velocity-mismatch',{clock,key,reportedVelocityMps:state.velocityMps,observedVelocityMps:-advance/dt});
        if(advance< -1e-9||advance>plan.maximumRateMps*dt+1e-6||state.elapsedSeconds<prior.elapsedSeconds-1e-6||state.elapsedSeconds-prior.elapsedSeconds>dt+1e-6||state.processedClock<prior.processedClock-1e-6)issue('body-settle-advancing-state-bounds',{clock,key,dt,advance});
      }
    }
    // Root's acceptance contract remains the independently enforced 8 mm
    // pre-first-flat body-contact gate. Implementation target/bound misses and
    // the optional 3 mm comparison below are descriptive and never affect pass.
    const targetMiss=elapsed>plan.boundSeconds+1e-6&&elapsed<=hold+1e-6&&scan?.minimumY>plan.targetClearanceMeters+1e-6;
    if(targetMiss){episode.sawTargetMiss=true;implementationDiagnostics.push({kind:'body-settle-implementation-target-missed',clock,key,elapsedSeconds:elapsed,boundSeconds:plan.boundSeconds,actualMinimumY:scan.minimumY,targetClearanceMeters:plan.targetClearanceMeters,targetErrorMeters:scan.minimumY-plan.targetClearanceMeters,deadlineMissedReported:state.deadlineMissed,acceptance:false});}
    if(elapsed>plan.boundSeconds+1e-6&&elapsed<=(r.risePlan.firstFootLandingSeconds??.55)+1e-6&&scan?.minimumY>.003)descriptiveThreeMillimeterBodyContact.push({clock,key,minimumY:scan.minimumY,thresholdMeters:.003,acceptance:false});
    const implementationDeadlineThresholdMeters=.003;
    episode.observationStartedBeforeDeadline??=elapsed<=plan.boundSeconds+1e-6;
    const implementationDeadlineMiss=elapsed>plan.boundSeconds+1e-6&&elapsed<=hold+1e-6&&scan?.minimumY>implementationDeadlineThresholdMeters;
    if(implementationDeadlineMiss)episode.sawImplementationDeadlineMiss=true;
    if((implementationDeadlineMiss&&!state.deadlineMissed)||(state.deadlineMissed&&episode.observationStartedBeforeDeadline&&!episode.sawImplementationDeadlineMiss))implementationDiagnostics.push({kind:'body-settle-deadline-flag-versus-observed-geometry',clock,key,elapsedSeconds:elapsed,boundSeconds:plan.boundSeconds,actualMinimumY:scan?.minimumY,targetClearanceMeters:plan.targetClearanceMeters,implementationDeadlineThresholdMeters,implementationDeadlineMissNow:Boolean(implementationDeadlineMiss),implementationDeadlineMissPreviouslyObserved:Boolean(episode.sawImplementationDeadlineMiss),observationStartedBeforeDeadline:episode.observationStartedBeforeDeadline,deadlineMissedReported:state.deadlineMissed,acceptance:false});
    else if(state.deadlineMissed&&!episode.observationStartedBeforeDeadline&&!episode.sawImplementationDeadlineMiss)implementationDiagnostics.push({kind:'body-settle-latched-deadline-flag-history-unobserved',clock,key,elapsedSeconds:elapsed,actualMinimumY:scan?.minimumY,implementationDeadlineThresholdMeters,deadlineMissedReported:true,acceptance:false});
    episode.last={clock,...Object.fromEntries(['offsetMeters','velocityMps','processedClock','elapsedSeconds','carryWeight'].map(name=>[name,state[name]]))};previousState=state;previousScan=scan;
    if(!witnesses.some(value=>value.key===key))witnesses.push({key,initialValidated:episode.initialValidated,modelSha256:scan?.hash,requestEpisodeIDs:episode.requestEpisodeIDs});
  }
  return{sample,scanGeometry,report:()=>({samples,scans,maximumGeometryError,maximumOffsetRate,witnesses,statePhases,implementationDiagnostics,descriptiveThreeMillimeterBodyContact:{acceptance:false,thresholdMeters:.003,violations:descriptiveThreeMillimeterBodyContact},errors,unsupported,pass:errors.length===0&&unsupported.length===0&&[...episodes.values()].every(value=>value.initialValidated),limits:'Read-only geometry/state witness. Existing 8 mm pre-first-flat body support remains mandatory in createActionObserver. Target1.5mm, bound .30s, deadline flags and the optional3mm body comparison are descriptive only; they never enter this factory acceptance. Existing palm/anchor, floor and dynamic guards remain unchanged.'})};
}

module.exports={createActionObserver,createPhysicalPalmObserver,createBodySettlingObserver};
