/** Deterministic action recovery. All positions are heading-local WORLD metres.
 * Actor/root integration owns the frame transform, IK, floor and rendered proof.
 * Native clips and their standalone paused previews are never changed here.
 */
import {sampleClip, blendPoses, contactsAt} from './motion-runtime.js';
export const RECOVERY_ARM_BONES=Object.freeze(['LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand']);
const ARM_SET=new Set(RECOVERY_ARM_BONES),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const copy=value=>value==null?value:structuredClone(value),add=(a,b)=>a.map((v,i)=>v+b[i]),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function quaternionMix(a,b,t){let dot=a.reduce((sum,v,i)=>sum+v*b[i],0),end=b;if(dot<0){end=b.map(v=>-v);dot=-dot;}let out;if(dot>.9995)out=mix(a,end,t);else{const angle=Math.acos(clamp(dot,-1,1)),denominator=Math.sin(angle);out=a.map((v,i)=>(v*Math.sin((1-t)*angle)+end[i]*Math.sin(t*angle))/denominator);}const length=Math.hypot(...out)||1;return out.map(v=>v/length);}
function rotateVector(v,q){const[x,y,z]=v,[qx,qy,qz,qw]=q,tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);return[x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];}
function bootClearance(q){let lower=Infinity;for(const x of[-.055,.055])for(const y of[0,.12])for(const z of[-.06,.17])lower=Math.min(lower,rotateVector([x,y,z],q)[1]);return-lower;}
const swap=name=>name.startsWith('Left')?'Right'+name.slice(4):name.startsWith('Right')?'Left'+name.slice(5):name;
const isDive=id=>/^keeper_dive_/.test(id),isLow=id=>isDive(id)||id==='fall'||id==='slide_tackle',isMotor=id=>/^(idle|run_[1-5]|sprint|dribble|decelerate)$/.test(id);
const motorTarget=id=>id==='dribble'?'run_2':id==='decelerate'?'idle':isMotor(id)?id:null;
export function mirrorRecoveryPoseX(pose){
  return {...pose,rotations:Object.fromEntries(Object.entries(pose.rotations).map(([name])=>{const q=pose.rotations[swap(name)];return[name,[q[0],-q[1],-q[2],q[3]]];})),
    hipsOffsetMeters:[-pose.hipsOffsetMeters[0],pose.hipsOffsetMeters[1],pose.hipsOffsetMeters[2]],
    referenceRootTranslationMeters:pose.referenceRootTranslationMeters?[-pose.referenceRootTranslationMeters[0],pose.referenceRootTranslationMeters[1],pose.referenceRootTranslationMeters[2]]:undefined};
}
export function composeRecoveryArms(THREE,base,overlay,weight=1){
  const result={...base,rotations:{...base.rotations}},chest=new THREE.Quaternion();
  for(const name of['Root','Hips','Spine','Chest'])chest.multiply(new THREE.Quaternion().fromArray(base.rotations[name]).normalize());
  for(const side of['Left','Right']){
    let from=chest.clone(),to=chest.clone(),parent=chest.clone();
    for(const suffix of['Arm','ForeArm','Hand']){
      const name=side+suffix;from.multiply(new THREE.Quaternion().fromArray(base.rotations[name]).normalize());to.multiply(new THREE.Quaternion().fromArray(overlay.rotations[name]).normalize());
      const world=from.clone().slerp(to,clamp(weight)).normalize();result.rotations[name]=parent.clone().invert().multiply(world).normalize().toArray();parent=world;
    }
  }
  return result;
}
function measuredStanding(context){
  const measured=context?.measured;
  if(!measured)return false;
  const feet=Object.values(measured.soles||{}),grounded=feet.some(p=>Math.abs(p[1])<=.012);
  return measured.pelvisHeight>=.66&&measured.hipsUpDot>=.7&&grounded;
}
function measuredGround(context){return Number.isFinite(context?.measured?.minimumY)&&context.measured.minimumY<=.008;}
function renderedNeutral(measured){return !!measured&&['LeftFoot','RightFoot'].every(bone=>{const sole=measured.soles?.[bone],minimum=measured.rigidBootMinimumY?.[bone],orientation=measured.footQuaternions?.[bone];return sole&&Math.abs(sole[1])<=.003&&Number.isFinite(minimum)&&minimum>=-.001&&minimum<=.006&&orientation&&rotateVector([0,1,0],orientation)[1]>.995;});}
function motorNeutral(context){const motor=context?.locomotion;return !!motor&&motor.actualSpeed<=.02&&Object.values(motor.feet||{}).length===2&&Object.values(motor.feet).every(foot=>foot.mode==='plant'&&Math.abs(foot.anchor[1])<=.000001&&Math.abs(foot.anchor[2]-motor.rootDistance)<.015)&&measuredStanding(context)&&renderedNeutral(context.measured);}
function uprightAirborne(context){const m=context?.measured;return !!m&&m.hipsUpDot>.55&&!Object.values(m.soles||{}).some(p=>Math.abs(p[1])<=.012);}
function clonePose(pose){return{rotations:copy(pose.rotations),hipsOffsetMeters:pose.hipsOffsetMeters.slice(),referenceRootTranslationMeters:pose.referenceRootTranslationMeters?.slice()||[0,0,0]};}

export class RecoveryState{
  constructor({clips,sample=null,recoveryLimitSeconds=4.5,completionAllowanceSeconds=.35,bridgeDurationSeconds=1.6}={}){
    this.clips=clips instanceof Map?clips:new Map(clips.map(clip=>[clip.id,clip]));this.sample=sample;
    this.recoveryLimitSeconds=recoveryLimitSeconds;this.completionAllowanceSeconds=completionAllowanceSeconds;this.bridgeDurationSeconds=bridgeDurationSeconds;
    this.clock=0;this.serial=0;this.episodeSerial=0;this.transitionSerial=0;this.events=[];this.requests=[];this.episode=null;this.requestRecord=null;this.pending=null;this.overlay=null;this.bridge=null;this.rise=null;
    this.base={clipID:'idle',seconds:0,entrySeconds:0,rate:1,mirror:false};this.phase='direct';this.lastContext=null;
  }
  _event(type,details={}){const event={type,clock:this.clock,...details};this.events.push(event);return event;}
  _clip(id){const clip=this.clips.get(id);if(!clip)throw Error('Unknown recovery clip '+id);return clip;}
  _duration(id){const c=this._clip(id);return c.duration??c.durationSeconds;}
  _newBase(clipID,seconds=0,mirror=false){const from=copy(this.base);this.base={clipID,seconds,entrySeconds:seconds,rate:1,mirror};this.transitionSerial++;this._event('base-changed',{from,to:copy(this.base),transitionSerial:this.transitionSerial});}
  reset({clipID='idle',seconds=0,clock=this.clock}={}){
    this._clip(clipID);if(this.requestRecord&&['queued','active'].includes(this.requestRecord.status)){this.requestRecord.status='cancelled-paused-preview';this.requestRecord.endedAt=this.clock;}
    this.clock=clock;this.episode=null;this.pending=null;this.overlay=null;this.bridge=null;this.rise=null;this.requestRecord=null;this.phase='direct';this._newBase(clipID,seconds,false);return this.snapshot();
  }
  _beginEpisode(context){
    if(this.episode&&this.episode.closedAt==null)return;
    this.episode={id:++this.episodeSerial,startedAt:this.clock,activationDeadline:this.clock+this.recoveryLimitSeconds,
      origin:{clipID:this.base.clipID,seconds:this.base.seconds,frameHeadingQuaternion:copy(context?.frameHeadingQuaternion||[0,0,0,1]),measured:copy(context?.measured||null)},closedAt:null,deadlineBreached:false};
    this._event('recovery-started',{episodeID:this.episode.id,origin:copy(this.episode.origin),activationDeadline:this.episode.activationDeadline});
  }
  _activate(record,{scope='body',entrySeconds=0,mirrored=false}={}){
    record.status='active';record.activatedAt=this.clock;record.entrySeconds=entrySeconds;record.scope=scope;record.mirrored=mirrored;record.playbackRate=1;
    record.completionDeadline=this.clock+(scope==='locomotion'?this.recoveryLimitSeconds:Math.max(0,this._duration(record.clipID)-entrySeconds)+this.completionAllowanceSeconds);record.progress=0;record.sampleSeconds=entrySeconds;
    this._event('action-activated',{requestID:record.id,clipID:record.clipID,scope,entrySeconds,mirrored,completionDeadline:record.completionDeadline});
  }
  _startOverlay(record){
    this.overlay={clipID:'keeper_catch',seconds:0,rate:1,startedAt:this.clock,blendSeconds:.3,holding:false,requestID:record.id,sourceHands:copy(this.lastContext?.measured?.hands||{}),sourceChest:copy(this.lastContext?.measured?.chestPosition||null)};this.transitionSerial++;
    record.episodeID=this.episode.id;record.activationDeadline=this.episode.activationDeadline;this._activate(record,{scope:'arms'});this._event('overlay-started',{requestID:record.id,baseClip:this.base.clipID,overlayClip:'keeper_catch'});
  }
  request(clipID,context={}){
    this._clip(clipID);this.lastContext=copy(context);
    if(context.paused)return this.reset({clipID,seconds:context.seconds||0});
    const previous=this.requestRecord,record={id:++this.serial,clipID,requestedAt:this.clock,status:'queued',progress:0,activatedAt:null,completedAt:null};
    if(previous&&['queued','active'].includes(previous.status)){previous.status='superseded';previous.supersededBy=record.id;previous.endedAt=this.clock;this._event('request-superseded',{requestID:previous.id,supersededBy:record.id});}
    this.requests.push(record);this.requestRecord=record;this._event('request-received',{requestID:record.id,clipID});
    if(isDive(this.base.clipID)&&clipID==='keeper_catch'){
      this._beginEpisode(context);this.pending=null;this._startOverlay(record);this.phase='dive-catch';return this.snapshot();
    }
    if(['await-landing','await-upright-landing','await-turn-finish','seated-bridge','getting-up','braking'].includes(this.phase)){
      this._beginEpisode(context);this.pending=record;record.episodeID=this.episode.id;record.activationDeadline=this.episode.activationDeadline;return this.snapshot();
    }
    if(isLow(this.base.clipID)||this.phase==='dive-catch'||this.phase==='settled'){
      this._beginEpisode(context);this.pending=record;record.episodeID=this.episode.id;record.activationDeadline=this.episode.activationDeadline;
      this.phase='await-landing';this._advanceRecovery(context);return this.snapshot();
    }
    if(this.base.clipID==='get_up'&&this.base.seconds<this._duration('get_up')-.000001){
      this._beginEpisode(context);this.pending=record;this.phase='getting-up';record.episodeID=this.episode.id;record.activationDeadline=this.episode.activationDeadline;return this.snapshot();
    }
    if((context.locomotion||isMotor(this.base.clipID))&&!isMotor(clipID)){
      this._beginEpisode(context);this.pending=record;record.episodeID=this.episode.id;record.activationDeadline=this.episode.activationDeadline;this.phase='braking';this._event('motor-braking-for-action',{requestID:record.id,sourceSpeed:context.locomotion?.actualSpeed??context.measured?.rootSpeedMps??this._clip(this.base.clipID).speedMps??0});return this.snapshot();
    }
    if(/^turn_/.test(this.base.clipID)&&this.base.seconds<this._duration(this.base.clipID)-.000001){
      this._beginEpisode(context);this.pending=record;record.episodeID=this.episode.id;record.activationDeadline=this.episode.activationDeadline;this.phase='await-turn-finish';this._event('turn-completion-required',{requestID:record.id,sourceClip:this.base.clipID,sourceSeconds:this.base.seconds});return this.snapshot();
    }
    if(!context.locomotion&&!isMotor(this.base.clipID)&&uprightAirborne(context)){
      this._beginEpisode(context);this.pending=record;record.episodeID=this.episode.id;record.activationDeadline=this.episode.activationDeadline;this.phase='await-upright-landing';this._event('upright-landing-required',{requestID:record.id,sourceClip:this.base.clipID,sourceSeconds:this.base.seconds});return this.snapshot();
    }
    this._startRequested(record);return this.snapshot();
  }
  _startRequested(record){
    this.pending=null;this.bridge=null;this.rise=null;this.overlay=null;this.phase=isMotor(record.clipID)?'requested-locomotion':'requested-action';this._newBase(record.clipID,0,false);this._activate(record,{scope:isMotor(record.clipID)?'locomotion':'body'});
  }
  _witnessProgress(record,details={}){if(record.firstProgressAt!=null)return;record.firstProgressAt=this.clock;this._event('action-progress',{requestID:record.id,...details});if(record.scope!=='arms'&&this.episode&&this.episode.closedAt==null){this.episode.closedAt=this.clock;this._event('recovery-fulfilled',{episodeID:this.episode.id,requestID:record.id,activationDeadline:this.episode.activationDeadline,firstProgressAt:this.clock});}}
  _startRise(context){
    const source=this.base.clipID;
    if(!context.pose){this._event('recovery-needs-displayed-pose',{requestID:this.pending?.id});return;}
    if(source==='slide_tackle'){
      const measured=context?.measured;
      if(!context.pose||!measured?.soles?.LeftFoot||!measured?.soles?.RightFoot||!measured?.hands?.LeftHand){this._event('recovery-needs-measured-bridge',{requestID:this.pending?.id});return;}
      this.bridge={elapsed:0,duration:this.bridgeDurationSeconds,fromPose:clonePose(context.pose),origin:(context.originMeters||[0,0,0]).slice(),
        soles:copy(measured.soles),kneePoles:copy(measured.kneePoles||{}),footQuaternions:copy(measured.footQuaternions||{}),hand:copy(measured.hands.LeftHand),entrySeconds:.8};
      this.phase='seated-bridge';this.transitionSerial++;this._event('seated-bridge-started',{duration:this.bridge.duration,entrySeconds:.8,episodeID:this.episode.id});return;
    }
    const mirrored=source==='keeper_dive_right',ground=context.measured?.rigidBootMinimumY||{},supported=['LeftFoot','RightFoot'].filter(bone=>ground[bone]<=.008).sort((a,b)=>ground[a]-ground[b]),supportFoot=supported[0]||null;
    this.rise={elapsed:0,firstDuration:.55,secondDuration:.55,bodyHoldSeconds:1.1,bodySettleMeters:0,bodySettleVelocityMps:0,bodySettleClock:null,bodySettleStartedAt:this.clock,bodySettleBoundSeconds:.30,bodySettleTargetClearanceMeters:.0015,bodySettleMaximumRateMps:.05,bodySettleMaximumOffsetMeters:.03,sourceMinimumY:context.measured?.minimumY,bodySettleSourceWitness:copy(context.measured?.bodySupportSurface||null),sourceClipID:source,sourceSeconds:this.base.seconds,sourcePose:clonePose(context.pose),supportFoot,firstFoot:supportFoot?(supportFoot==='LeftFoot'?'RightFoot':'LeftFoot'):(mirrored?'LeftFoot':'RightFoot'),soles:copy(context.measured?.soles||{}),kneePoles:copy(context.measured?.kneePoles||{}),footQuaternions:copy(context.measured?.footQuaternions||{}),rigidBootMinimumY:copy(ground),origin:(context.originMeters||[0,0,0]).slice()};this._newBase('get_up',0,mirrored);this.phase='getting-up';
    this._event('recovery-entry',{clipID:'get_up',entrySeconds:0,transform:mirrored?'mirroredX':'identity',sourceClip:source});
  }
  _advanceRecovery(context){
    if(this.phase==='await-landing'){
      const catchCommitted=!this.overlay||this.overlay.seconds>=this._catchSeconds();
      if(this.base.seconds>=this._duration(this.base.clipID)-.000001&&measuredGround(context)&&catchCommitted)this._startRise(context);
    }else if(this.phase==='await-upright-landing'){
      if(this.base.seconds>=this._duration(this.base.clipID)-.000001&&measuredStanding(context))this._startRequested(this.pending);
    }else if(this.phase==='await-turn-finish'){
      if(this.base.seconds>=this._duration(this.base.clipID)-.000001&&measuredStanding(context))this._startRequested(this.pending);
    }else if(this.phase==='braking'){
      if(motorNeutral(context)&&this.pending)this._startRequested(this.pending);
    }else if(this.phase==='seated-bridge'){
      if(this.bridge.elapsed>=this.bridge.duration-.000001){
        const target=this.bridgeConstraints(),soles=context?.measured?.soles||{},ready=target.feet.every(foot=>soles[foot.bone]&&Math.hypot(...soles[foot.bone].map((v,i)=>v-foot.target[i]))<.006);
        if(ready){this._newBase('get_up',this.bridge.entrySeconds,false);this.phase='getting-up';this._event('recovery-entry',{clipID:'get_up',entrySeconds:this.bridge.entrySeconds,transform:'identity',sourceClip:'seated-bridge'});this.bridge=null;if(this.pending?.clipID==='get_up'){this._activate(this.pending,{entrySeconds:this.base.seconds});this.pending=null;}}
      }
    }else if(this.phase==='getting-up'){
      if(this.base.seconds>=this._duration('get_up')-.000001&&measuredStanding(context)){
        if(this.pending)this._startRequested(this.pending);else{this.phase='direct';if(this.episode)this.episode.closedAt=this.clock;}
      }
    }else if(this.phase==='dive-catch'){
      if(this.base.seconds>=this._duration(this.base.clipID)-.000001&&this.overlay?.holding){this.phase='settled';if(this.episode)this.episode.closedAt=this.clock;}
    }
  }
  _catchSeconds(){return this._clip('keeper_catch').events?.find(event=>/catch/.test(event.name||event.type||''))?.timeSeconds??.4;}
  bindMotor(snapshot,{styleWeight=1,rendered=null}={}){
    const record=this.requestRecord;if(record?.scope!=='locomotion'||record.status!=='active')return;
    const target=motorTarget(record.clipID),source=snapshot.requests?.find(request=>request.id===snapshot.requestID&&request.clip===target);
    if(!source)return;
    if(record.motorRequestID!==source.id){record.motorRequestID=source.id;record.motorClockOffset=this.clock-snapshot.clock;record.motorInitialSpeed=snapshot.actualSpeed;record.motorInitialDistance=snapshot.rootDistance;record.physicalTargetClip=target;this._event('motor-request-bound',{requestID:record.id,motorRequestID:source.id,physicalTargetClip:target});}
    this.observeMotor(snapshot,{styleWeight,rendered});
  }
  observeMotor(snapshot,{styleWeight=1,rendered=null}={}){
    const record=this.requestRecord;if(record?.scope!=='locomotion'||record.status!=='active'||record.motorRequestID==null)return;
    const request=snapshot.requests?.find(request=>request.id===record.motorRequestID);if(!request)return;
    const targetSpeed=request.targetSpeed,initial=record.motorInitialSpeed,range=Math.abs(targetSpeed-initial);
    record.actualSpeed=snapshot.actualSpeed;record.targetSpeed=targetSpeed;record.physicalContributors=copy(snapshot.contributors);record.sampleSeconds=snapshot.unwrappedPhase;
    record.progress=range>1e-6?clamp(1-Math.abs(snapshot.actualSpeed-targetSpeed)/range):request.completedAt==null?0:1;
    const influenced=snapshot.clock>request.at+.000001&&(Math.abs(snapshot.rootDistance-record.motorInitialDistance)>.000001||snapshot.contributors?.some(c=>c.clip===request.clip&&c.weight>0&&c.time>0)||request.completedAt!=null);
    if(record.clipID==='dribble')record.progress=Math.min(record.progress,clamp(styleWeight));
    if(influenced&&(record.clipID!=='dribble'||styleWeight>1e-6))this._witnessProgress(record,{motorRequestID:request.id,actualSpeed:snapshot.actualSpeed,contributors:copy(snapshot.contributors)});
    const neutral=targetSpeed>0||Object.values(snapshot.feet||{}).every(foot=>foot.mode==='plant'&&Math.abs(foot.anchor[1])<=.000001&&Math.abs(foot.anchor[2]-snapshot.rootDistance)<.015)&&renderedNeutral(rendered);
    if(targetSpeed===0&&rendered)record.renderedNeutralFeet=Object.fromEntries(['LeftFoot','RightFoot'].map(bone=>[bone,{sole:copy(rendered.soles?.[bone]),minimumY:rendered.rigidBootMinimumY?.[bone],orientation:copy(rendered.footQuaternions?.[bone])}]));
    if(request.completedAt!=null&&Math.abs(snapshot.actualSpeed-targetSpeed)<1e-6&&neutral&&record.firstProgressAt!=null&&(record.clipID!=='dribble'||styleWeight>=1-1e-6)){record.progress=1;record.status='completed';record.completedAt=this.clock;this._event('action-completed',{requestID:record.id,motorRequestID:request.id,actualSpeed:snapshot.actualSpeed,semantic:'physicalSpeedAndNeutralSupport'});}
  }
  step(dt,context={}){
    if(!Number.isFinite(dt)||dt<0||dt>.25)throw Error('Recovery step requires a finite dt in[0,.25]');
    this.clock+=dt;this.lastContext=copy(context);
    if(this.bridge)this.bridge.elapsed=Math.min(this.bridge.duration,this.bridge.elapsed+dt);
    else if(this.rise&&this.base.clipID==='get_up'){
      this.rise.elapsed+=dt;this.base.seconds=Math.min(this._duration('get_up'),Math.max(0,this.rise.elapsed-this.rise.bodyHoldSeconds));
      if(this.rise.elapsed>=this.rise.bodyHoldSeconds&&this.pending?.clipID==='get_up'){this._activate(this.pending,{entrySeconds:0,mirrored:this.base.mirror});this.pending=null;}
    }
    else this.base.seconds=this._clip(this.base.clipID).loop?this.base.seconds+dt*this.base.rate:Math.min(this._duration(this.base.clipID),this.base.seconds+dt*this.base.rate);
    if(this.overlay){this.overlay.seconds=Math.min(this._duration(this.overlay.clipID),this.overlay.seconds+dt*this.overlay.rate);this.overlay.holding=this.overlay.seconds>=this._duration(this.overlay.clipID)-.000001;}
    const record=this.requestRecord;
    if(record?.status==='active'){
      const seconds=record.scope==='locomotion'?null:record.scope==='arms'?this.overlay?.seconds:this.base.seconds;
      if(Number.isFinite(seconds)){
        record.sampleSeconds=seconds;record.progress=clamp((seconds-record.entrySeconds)/Math.max(.000001,this._duration(record.clipID)-record.entrySeconds));
        if(seconds>record.entrySeconds+.000001)this._witnessProgress(record,{sampleSeconds:seconds});
        if(record.progress>=1){record.status='completed';record.completedAt=this.clock;this._event('action-completed',{requestID:record.id,clipID:record.clipID,sampleSeconds:seconds});}
      }
    }
    this._advanceRecovery(context);
    if(this.episode&&this.episode.closedAt==null&&this.clock>this.episode.activationDeadline+.000001&&this.requestRecord?.firstProgressAt==null){
      if(!this.episode.deadlineBreached)this._event('recovery-deadline-breached',{episodeID:this.episode.id,requestID:this.requestRecord?.id});this.episode.deadlineBreached=true;
    }
    return this.snapshot({history:false});
  }
  _sample(THREE,id,seconds){const pose=this.sample?this.sample(this._clip(id),seconds):sampleClip(THREE,this._clip(id),seconds);return{...pose,referenceRootTranslationMeters:pose.referenceRootTranslationMeters||[0,0,0]};}
  pose(THREE,{aheadSeconds=0}={}){
    let pose;
    if(this.bridge){
      const bridge=this.bridge,t=clamp((bridge.elapsed+aheadSeconds)/bridge.duration),target=this._sample(THREE,'get_up',bridge.entrySeconds);
      pose=blendPoses(THREE,bridge.fromPose,target,smooth(t));
      const y0=bridge.fromPose.hipsOffsetMeters[1],leftLoadedX=.16,rightLoadedX=-.08;
      pose.hipsOffsetMeters[0]=t<.22?bridge.fromPose.hipsOffsetMeters[0]+(leftLoadedX-bridge.fromPose.hipsOffsetMeters[0])*smooth(t/.22):t<.45?leftLoadedX:t<.68?leftLoadedX+(rightLoadedX-leftLoadedX)*smooth((t-.45)/.23):rightLoadedX+(target.hipsOffsetMeters[0]-rightLoadedX)*smooth((t-.68)/.32);
      const rightTransfer=smooth((t/.45-.2)/.6);
      pose.hipsOffsetMeters[2]=bridge.fromPose.hipsOffsetMeters[2]+(target.hipsOffsetMeters[2]-bridge.fromPose.hipsOffsetMeters[2])*rightTransfer;
      pose.hipsOffsetMeters[1]=t<.45?y0+(.145-.86-y0)*smooth(t/.45):t<.775?(.145-.86)+(.26-.145)*smooth((t-.45)/.325):(.26-.86)+(target.hipsOffsetMeters[1]-(.26-.86))*smooth((t-.775)/.225);
    }else{pose=this._sample(THREE,this.base.clipID,this.base.seconds+aheadSeconds*this.base.rate);if(this.base.mirror)pose=mirrorRecoveryPoseX(pose);if(this.rise&&this.base.clipID==='get_up'){
      const bodySeconds=Math.max(0,this.rise.elapsed+aheadSeconds-this.rise.bodyHoldSeconds),settledSource=clonePose(this.rise.sourcePose);settledSource.hipsOffsetMeters[1]-=this.rise.bodySettleMeters||0;
      if(bodySeconds===0)pose=settledSource;else if(bodySeconds<.3)pose=blendPoses(THREE,settledSource,pose,smooth(bodySeconds/.3));
    }}
    if(this.overlay){const time=Math.min(this._duration(this.overlay.clipID),this.overlay.seconds+aheadSeconds*this.overlay.rate),weight=smooth((this.clock+aheadSeconds-this.overlay.startedAt)/this.overlay.blendSeconds);pose=composeRecoveryArms(THREE,pose,this._sample(THREE,this.overlay.clipID,time),weight);}
    return pose;
  }
  bridgeConstraints({aheadSeconds=0}={}){
    if(!this.bridge)return this.riseConstraints({aheadSeconds});
    const b=this.bridge,t=clamp((b.elapsed+aheadSeconds)/b.duration),feet=[];
    // Vertical lift / horizontal transfer / vertical settle are separate. XZ
    // never changes in the first/last near-floor millimetres of either step.
    for(const[bone,start,end,lift]of[['RightFoot',0,.45,.10],['LeftFoot',.45,.775,.08]]){
      const from=b.soles[bone],to=add(b.origin,[bone==='LeftFoot'?.1:-.1,0,0]);to[1]=0;
      const u=clamp((t-start)/(end-start)),transfer=smooth((u-.2)/.6),target=mix(from,to,transfer);
      const y= u<.2?from[1]+lift*smooth(u/.2):u<.8?Math.max(from[1],to[1])+lift:to[1]+lift*(1-smooth((u-.8)/.2));target[1]=u<=0?from[1]:u>=1?to[1]:y;
      const rawPole=mix(b.kneePoles[bone]||[0,1,.2],[0,0,1],smooth(t)),poleLength=Math.hypot(...rawPole)||1;
      feet.push({bone,target,pole:rawPole.map(v=>v/poleLength),mode:u<=0||u>=1?'plant':'flight',anchor:u<=0?from.slice():u>=1?to.slice():null,worldQuaternion:b.footQuaternions[bone]||[0,0,0,1]});
    }
    const handWeight=1-smooth((t-.25)/.15),hands=handWeight>0?[{bone:'LeftHand',target:b.hand.position.slice(),worldQuaternion:b.hand.orientation.slice(),pole:b.hand.pole?.slice(),weight:handWeight,mode:handWeight===1?'hand-support':'release'}]:[];
    return{frame:'headingLocalWorld',feet,hands,elapsed:b.elapsed,duration:b.duration};
  }
  riseConstraints({aheadSeconds=0}={}){
    if(!this.rise||this.base.clipID!=='get_up'||this.rise.elapsed+aheadSeconds>this.rise.bodyHoldSeconds+this._duration('get_up')+1e-8)return null;
    const r=this.rise,time=r.elapsed+aheadSeconds,feet=[];
    for(const bone of['LeftFoot','RightFoot']){
      const from=r.soles[bone];if(!from)continue;
      const to=add(r.origin,[bone==='LeftFoot'?.1:-.1,0,0]);to[1]=0;
      const first=bone===r.firstFoot,start=first?0:r.firstDuration,duration=first?r.firstDuration:r.secondDuration,u=clamp((time-start)/duration),transfer=smooth((u-.2)/.55),target=mix(from,to,transfer),raised=.08;
      target[1]=u===0?from[1]:u<.2?from[1]+(raised-from[1])*smooth(u/.2):u<.75?raised:raised*(1-smooth((u-.75)/.25));
      const raw=mix(r.kneePoles[bone]||[0,0,1],[0,0,1],smooth(u)),length=Math.hypot(...raw)||1;
      const worldQuaternion=quaternionMix(r.footQuaternions[bone]||[0,0,0,1],[0,0,0,1],smooth(u));
      if(u>0&&u<1)target[1]=Math.max(target[1],bootClearance(worldQuaternion)+.012*Math.sin(Math.PI*u)**2);
      const held=u===0&&bone===r.supportFoot,mode=u>=1||held?'plant':u===0?'captured-flight':'flight';
      feet.push({bone,target,pole:raw.map(v=>v/length),mode,anchor:u>=1?to.slice():held?from.slice():null,worldQuaternion,capturedRigidBootMinimumY:r.rigidBootMinimumY[bone]??null,poleMode:'transport-limited',poleGuide:[0,1,.35],poleVelocityLimitRadiansPerSecond:8,unrollProgress:u,nativeReferenceRelaxation:time>=r.firstDuration+r.secondDuration});
    }
    return{frame:'headingLocalWorld',feet,hands:[],elapsed:time,duration:r.firstDuration+r.secondDuration,stage:time<r.firstDuration?'rise-first-foot-with-body-support':'rise-second-foot-with-flat-support'};
  }
  overlayTargets(THREE,chestPosition){
    if(!this.overlay||!this.overlay.sourceChest)return[];
    const overlay=this.overlay,pose=this._sample(THREE,overlay.clipID,overlay.seconds),weight=smooth((this.clock-overlay.startedAt)/overlay.blendSeconds),chestQ=new THREE.Quaternion();
    for(const name of['Root','Hips','Spine','Chest'])chestQ.multiply(new THREE.Quaternion().fromArray(pose.rotations[name]).normalize());
    const result=[];
    for(const side of['Left','Right']){
      const bone=side+'Hand',source=overlay.sourceHands[bone];if(!source)continue;
      const q=chestQ.clone(),relative=new THREE.Vector3(side==='Left'?.16:-.16,.06,0).applyQuaternion(chestQ);
      q.multiply(new THREE.Quaternion().fromArray(pose.rotations[side+'Arm']).normalize());relative.add(new THREE.Vector3(0,-.27,0).applyQuaternion(q));
      q.multiply(new THREE.Quaternion().fromArray(pose.rotations[side+'ForeArm']).normalize());relative.add(new THREE.Vector3(0,-.24,0).applyQuaternion(q));q.multiply(new THREE.Quaternion().fromArray(pose.rotations[bone]).normalize());
      const captured=new THREE.Vector3().fromArray(source.position).sub(new THREE.Vector3().fromArray(overlay.sourceChest));
      const target=new THREE.Vector3().fromArray(chestPosition).add(captured.lerp(relative,weight)),orientation=new THREE.Quaternion().fromArray(source.orientation).normalize().slerp(q,weight).normalize();
      let lower=Infinity;for(const x of[-.07,.07])for(const y of[-.18,.03])for(const z of[-.06,.06])lower=Math.min(lower,new THREE.Vector3(x,y,z).applyQuaternion(orientation).y);
      target.y=Math.max(target.y,.012-lower);
      const sourcePole=new THREE.Vector3().fromArray(source.pole||[0,1,0]).normalize(),up=new THREE.Vector3(side==='Left'?.7:-.7,1,.2).normalize(),pole=sourcePole.clone().applyQuaternion(new THREE.Quaternion().identity().slerp(new THREE.Quaternion().setFromUnitVectors(sourcePole,up),weight)).normalize();
      result.push({bone,target:target.toArray(),worldQuaternion:orientation.toArray(),pole:pole.toArray(),weight,mode:'catch-effector',frame:'headingLocalWorld'});
    }
    return result;
  }
  contacts(){
    if(this.bridge)return this.bridgeConstraints().feet.filter(f=>f.mode==='plant').map(f=>({bone:f.bone,mode:'plant',anchor:f.anchor,key:'recovery-bridge/'+this.episode.id+'/'+f.bone}));
    return contactsAt(this._clip(this.base.clipID),this.base.seconds).filter(c=>!this.overlay||c.mode!=='hand-support').map(c=>this.base.mirror?{...c,bone:swap(c.bone),anchor:[-c.anchor[0],c.anchor[1],c.anchor[2]],yawRadians:-(c.yawRadians||0)}:c);
  }
  snapshot({history=true}={}){
    const contributors=this.bridge?[{clipID:'__seated_recovery_bridge',sampleSeconds:this.bridge.elapsed,playbackRate:1,weight:1,scope:'body',transform:'explicitWorldConstraints',virtual:true}]:[{clipID:this.base.clipID,sampleSeconds:this.base.seconds,playbackRate:this.base.rate,weight:1,scope:'body',transform:this.base.mirror?'mirroredX':'identity'}];
    if(this.rise){const bodySeconds=Math.max(0,this.rise.elapsed-this.rise.bodyHoldSeconds),weight=smooth(bodySeconds/.3);contributors[0].weight=weight;if(weight<1)contributors.unshift({clipID:this.rise.sourceClipID,sampleSeconds:this.rise.sourceSeconds,playbackRate:0,weight:1-weight,scope:'body',transform:'capturedSupportPose',virtual:true});}
    if(this.overlay)contributors.push({clipID:this.overlay.clipID,sampleSeconds:this.overlay.seconds,playbackRate:this.overlay.rate,weight:smooth((this.clock-this.overlay.startedAt)/this.overlay.blendSeconds),scope:'arms',transform:'chestTranslationGravityAlignedSixArmIK',requestID:this.overlay.requestID});
    return{clock:this.clock,phase:this.phase,transitionSerial:this.transitionSerial,activeBaseClip:this.bridge?'__seated_recovery_bridge':this.rise&&this.rise.elapsed<this.rise.bodyHoldSeconds?'__side_support_preplant':this.base.clipID,baseSeconds:this.bridge?this.bridge.elapsed:this.rise&&this.rise.elapsed<this.rise.bodyHoldSeconds?this.rise.elapsed:this.base.seconds,
      overlayClip:this.overlay?.clipID||null,overlaySeconds:this.overlay?.seconds||0,contributors,request:copy(this.requestRecord),pendingRequestID:this.pending?.id||null,episode:copy(this.episode),
      bridgePlan:history&&this.bridge?{kind:'seatedSupportedTuck',frame:'headingLocalWorld',origin:this.bridge.origin.slice(),duration:this.bridge.duration,entrySeconds:this.bridge.entrySeconds,sourceSoles:copy(this.bridge.soles),sourceFootQuaternions:copy(this.bridge.footQuaternions),sourceKneePoles:copy(this.bridge.kneePoles),sourcePalm:copy(this.bridge.hand),sourcePose:copy(this.bridge.fromPose),stages:[{bone:'RightFoot',liftStart:0,landAt:.45*this.bridge.duration},{bone:'LeftFoot',liftStart:.45*this.bridge.duration,landAt:.775*this.bridge.duration}]}:null,
      risePlan:history&&this.rise?{kind:'sequentialSupportedFootUnroll',frame:'headingLocalWorld',origin:this.rise.origin.slice(),duration:this.rise.firstDuration+this.rise.secondDuration,firstFootLandingSeconds:this.rise.firstDuration,secondFootLiftStartSeconds:this.rise.firstDuration,secondFootLandingSeconds:this.rise.firstDuration+this.rise.secondDuration,sourceMinimumY:this.rise.sourceMinimumY,bodySettlePlan:{startClock:this.rise.bodySettleStartedAt,boundSeconds:this.rise.bodySettleBoundSeconds,targetClearanceMeters:this.rise.bodySettleTargetClearanceMeters,maximumRateMps:this.rise.bodySettleMaximumRateMps,maximumOffsetMeters:this.rise.bodySettleMaximumOffsetMeters,firstFootTransferConcurrent:true,initialGeometryWitness:copy(this.rise.bodySettleSourceWitness||null)},bodyHoldSeconds:this.rise.bodyHoldSeconds,bodyBlendSeconds:.3,constraintsEndSeconds:this.rise.bodyHoldSeconds+this._duration('get_up'),flatAnchorsRemainFixed:true,entrySeconds:0,firstFoot:this.rise.firstFoot,supportFoot:this.rise.supportFoot,sourceClipID:this.rise.sourceClipID,sourceSeconds:this.rise.sourceSeconds,sourcePose:copy(this.rise.sourcePose),mirroredX:this.base.mirror,sourceSoles:copy(this.rise.soles),sourceFootQuaternions:copy(this.rise.footQuaternions),sourceKneePoles:copy(this.rise.kneePoles),sourceRigidBootMinimumY:copy(this.rise.rigidBootMinimumY)}:null,
      bodySettling:{active:!!this.rise&&this.rise.elapsed<=this.rise.bodyHoldSeconds+1e-8,phase:!this.rise?'inactive':this.rise.elapsed<=this.rise.bodyHoldSeconds?'held-body-support':this.rise.elapsed<this.rise.bodyHoldSeconds+.3?'carry-fade':'inactive',elapsedSeconds:this.rise?.elapsed||0,carryWeight:this.rise?(this.rise.elapsed<=this.rise.bodyHoldSeconds?1:1-smooth(clamp((this.rise.elapsed-this.rise.bodyHoldSeconds)/.3,0,1))):0,actualGeometryWitness:copy(this.rise?.bodySettleActualWitness||null),offsetMeters:this.rise?.bodySettleMeters||0,velocityMps:this.rise?.bodySettleVelocityMps||0,processedClock:this.rise?.bodySettleClock,startClock:this.rise?.bodySettleStartedAt,boundSeconds:this.rise?.bodySettleBoundSeconds,targetClearanceMeters:this.rise?.bodySettleTargetClearanceMeters,maximumRateMps:this.rise?.bodySettleMaximumRateMps,maximumOffsetMeters:this.rise?.bodySettleMaximumOffsetMeters,firstFootTransferConcurrent:true,initialWitness:copy(this.rise?.bodySettleSourceWitness||this.rise?.bodySettleInitialWitness||null),actualWitness:copy(this.rise?.bodySettleActualWitness||null),deadlineMissed:!!this.rise?.bodySettleDeadlineMissed},
      matchedEntrySeconds:this.base.clipID==='get_up'?this.base.entrySeconds:null,locomotionAllowed:this.phase==='braking'||!this.bridge&&!['await-landing','await-upright-landing','getting-up','dive-catch','settled'].includes(this.phase)&&isMotor(this.base.clipID),motorAction:this.phase==='braking'?'decelerate':isMotor(this.base.clipID)?this.base.clipID:null,
      presentation:this.overlay?{clipID:this.overlay.clipID,seconds:this.overlay.seconds,held:this.overlay.seconds>=this._catchSeconds(),handBones:['LeftHand','RightHand'],attachment:'actualDisplayedHands'}:null,
      constraints:this.bridgeConstraints(),measured:copy(this.lastContext?.measured||null),events:history?copy(this.events):undefined,requests:history?copy(this.requests):undefined};
  }
}

/** Two-bone wrist constraint. Keeps axial twist and returns true reach residual. */
export function solveRecoveryHand(THREE,bones,name,target,orientation,pole=null,referenceWorld=null){
  const side=name.replace(/Hand$/,''),upper=bones[side+'Arm'],middle=bones[side+'ForeArm'],end=bones[name];
  if(referenceWorld){
    if(referenceWorld[side+'Arm'])upper.quaternion.copy(upper.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(new THREE.Quaternion().fromArray(referenceWorld[side+'Arm'])).normalize();upper.updateWorldMatrix(true,true);
    if(referenceWorld[side+'ForeArm'])middle.quaternion.copy(middle.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(new THREE.Quaternion().fromArray(referenceWorld[side+'ForeArm'])).normalize();middle.updateWorldMatrix(true,true);
  }
  const start=upper.getWorldPosition(new THREE.Vector3()),elbow=middle.getWorldPosition(new THREE.Vector3()),wrist=end.getWorldPosition(new THREE.Vector3());
  const a=middle.position.length(),b=end.position.length(),delta=target.clone().sub(start),distance=delta.length(),safe=Math.max(Math.abs(a-b)+1e-7,Math.min(a+b-1e-7,distance)),axis=delta.multiplyScalar(1/Math.max(distance,1e-9));
  let bend=pole?pole.clone():elbow.clone().sub(start);bend.addScaledVector(axis,-bend.dot(axis));
  if(bend.lengthSq()<1e-10){bend.set(0,0,1).addScaledVector(axis,-axis.z);if(bend.lengthSq()<1e-10)bend.set(1,0,0).addScaledVector(axis,-axis.x);}
  bend.normalize();const along=(a*a-b*b+safe*safe)/(2*safe),height=Math.sqrt(Math.max(0,a*a-along*along)),desiredElbow=start.clone().addScaledVector(axis,along).addScaledVector(bend,height),desiredWrist=start.clone().addScaledVector(axis,safe);
  const upperWorld=upper.getWorldQuaternion(new THREE.Quaternion()),upperParent=upper.parent.getWorldQuaternion(new THREE.Quaternion());
  const upperDelta=new THREE.Quaternion().setFromUnitVectors(elbow.sub(start).normalize(),desiredElbow.clone().sub(start).normalize());
  upper.quaternion.copy(upperParent.invert()).multiply(upperDelta.multiply(upperWorld)).normalize();upper.updateWorldMatrix(true,true);
  const nowElbow=middle.getWorldPosition(new THREE.Vector3()),nowWrist=end.getWorldPosition(new THREE.Vector3()),middleWorld=middle.getWorldQuaternion(new THREE.Quaternion()),middleParent=middle.parent.getWorldQuaternion(new THREE.Quaternion());
  const middleDelta=new THREE.Quaternion().setFromUnitVectors(nowWrist.sub(nowElbow).normalize(),desiredWrist.sub(nowElbow).normalize());
  middle.quaternion.copy(middleParent.invert()).multiply(middleDelta.multiply(middleWorld)).normalize();middle.updateWorldMatrix(true,true);
  if(orientation)end.quaternion.copy(end.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(orientation).normalize();end.updateWorldMatrix(true,true);
  return Math.max(0,distance-(a+b),Math.abs(a-b)-distance);
}
