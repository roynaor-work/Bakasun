/** Continuous-phase locomotion and explicit world-frame footstep planning.
 * Positions are in a heading-local WORLD frame: +Z is travel, +Y is up.
 * This authoring/runtime module never changes the canonical clips or rig.
 */
export class LocomotionSpace {
  constructor(THREE, clips, sample, skeleton=null) {
    this.THREE=THREE;this.sample=sample;this.clips=clips;this.skeleton=skeleton;
    const ids=['run_1','run_2','run_3','run_4','run_5','sprint'];
    this.nodes=ids.map(id=>clips.find(c=>c.id===id));
    if(this.nodes.some(c=>!c))throw Error('All six authored gaits are required');
    this.idle=clips.find(c=>c.id==='idle');this.byId=new Map(clips.map(c=>[c.id,c]));
    this.acceleration=3.5;this.deceleration=4.5;this.flightReachRadius=.74;
    this.clock=0;this.phase=0;this.distance=0;this.speed=0;this.targetSpeed=0;
    this.requestID=0;this.nextHeelID=0;this.requestedClip='idle';this.requests=[];this.heelRecords=[];this.phaseReseeds=[];this.feet={};
  }
  static accepts(id){return id==='idle'||/^run_[1-5]$/.test(id)||id==='sprint';}
  clamp(x,a,b){return Math.max(a,Math.min(b,x));}
  smooth(x){x=this.clamp(x,0,1);return x*x*(3-2*x);}
  bracket(speed=this.speed){
    if(speed<=this.nodes[0].speedMps)return{a:this.nodes[0],b:this.nodes[0],weight:0};
    for(let i=1;i<this.nodes.length;i++)if(speed<=this.nodes[i].speedMps){const a=this.nodes[i-1],b=this.nodes[i];return{a,b,weight:(speed-a.speedMps)/(b.speedMps-a.speedMps)};}
    return{a:this.nodes.at(-1),b:this.nodes.at(-1),weight:0};
  }
  frequency(speed=this.speed){
    if(speed<=.00001)return 0;
    if(speed<this.nodes[0].speedMps)return .65+(1/this.nodes[0].duration-.65)*speed/this.nodes[0].speedMps;
    const {a,b,weight:w}=this.bracket(speed);return(1-w)/a.duration+w/b.duration;
  }
  stanceFraction(speed=this.speed){
    const {a,b,weight:w}=this.bracket(speed);
    const f=c=>{const contact=c.contacts.find(c=>c.bone==='LeftFoot'&&c.mode==='plant');return(contact.end-contact.start)/c.duration;};
    return f(a)*(1-w)+f(b)*w;
  }
  reset({speed=0,phase=0,distance=0,feet=null,idleSeconds=0,sourceClip=null}={}){
    this.clock=0;this.phase=phase;this.distance=distance;this.speed=speed;this.targetSpeed=speed;this.idleSeconds=idleSeconds;
    this.seedSourceClip=sourceClip&&this.byId.get(sourceClip);this.seedCommitUntil=null;this.seedPhase=phase;this._fkPhase=null;
    const inheritedGait=!!this.seedSourceClip&&(LocomotionSpace.accepts(this.seedSourceClip.id)&&this.seedSourceClip.id!=='idle'||this.seedSourceClip.id==='dribble');
    this.requestedClip=speed===0?'idle':this.bracket(speed).a.id;this.heelRecords=[];this.phaseReseeds=[];this.requests=[];this.requestID=0;this.nextHeelID=0;
    for(const [name,x,offset]of [['LeftFoot',.1,0],['RightFoot',-.1,.5]]){
      const initial=feet?.[name],position=initial?.position?.slice()||[x,0,distance];
      const local=((phase-offset)%1+1)%1,cycle=Math.floor(phase-offset),heel=cycle+offset;
      this.feet[name]={name,x,offset,position,orientation:initial?.orientation?.slice()||[0,0,0,1],mode:'plant',anchor:position.slice(),heelPhase:heel,stanceEndPhase:speed?heel+this.stanceFraction(speed):Infinity,record:null};
      const sourceSeconds=this.seedSourceClip?(this.seedSourceClip.loop?((phase%1)+1)%1:this.clamp(phase,0,1))*this.seedSourceClip.duration:null,sourceContact=this.seedSourceClip?.contacts.find(c=>c.bone===name&&c.mode==='plant'&&sourceSeconds>=c.start-1e-8&&sourceSeconds<=c.end+1e-8);
      if(!inheritedGait)this.feet[name].sourceSupport={sourceClip:this.seedSourceClip?.id||null,sourceSeconds,phase,soleHeight:position[1],grounded:position[1]<=.003,authoredPlant:!!sourceContact,contactStart:sourceContact?.start??null,contactEnd:sourceContact?.end??null};
      if(speed>0&&(inheritedGait?local>=this.stanceFraction(speed):!(position[1]<=.003&&sourceContact))){const f=this.feet[name];this.takeoff(f,'seed-swing');if(inheritedGait&&this.skeleton){f.mode='inherited';f.heelPhase=Math.floor(phase-f.offset)+1+f.offset;f.inheritedClip=this.seedSourceClip.id;f.inheritedStartPhase=phase;const source=this.sourceFK(phase)[name],expected=source.position.slice();expected[2]+=this.distance;f.inheritedCorrection=position.map((x,i)=>x-expected[i]);f.inheritedOrientation=new this.THREE.Quaternion().fromArray(source.orientation).invert().multiply(new this.THREE.Quaternion().fromArray(f.orientation)).toArray();this.seedCommitUntil=Math.max(this.seedCommitUntil??phase,f.heelPhase);}}
      else if(speed>0){const f=this.feet[name];if(inheritedGait)this.recordHeel(f,heel,'seed');else{f.heelPhase=this.phase;this.recordHeel(f,this.phase,'nongait-inherited-support');f.record.sourceSupport={...f.sourceSupport};}}
    }
    if(speed<=.01){const clip=sourceClip&&this.byId.get(sourceClip),time=clip?(clip.loop?((phase%1)+1)%1:Math.min(1,Math.max(0,phase)))*clip.duration:null;for(const f of Object.values(this.feet)){const grounded=f.position[1]<=.003;f.sourceSupport={sourceClip:sourceClip||null,sourceSeconds:time,phase,soleHeight:f.position[1],grounded,authoredPlant:clip?clip.contacts.some(c=>c.bone===f.name&&c.mode==='plant'&&time>=c.start-1e-8&&time<=c.end+1e-8):null};if(!grounded)f.mode='free';}}
    if(speed<=.01)this.settleFeet();
    return this;
  }
  request(id){
    if(!LocomotionSpace.accepts(id))throw Error('Not a locomotion request: '+id);
    if(this.requestedClip===id&&this.requests.length)return this.requestID;
    for(const r of this.requests)if(r.completedAt===null&&!r.superseded)r.superseded=true;
    const clip=this.byId.get(id),target=id==='idle'?0:clip.speedMps;
    this.targetSpeed=target;this.requestedClip=id;
    const record={id:++this.requestID,clip:id,at:this.clock,deadline:this.clock+4.5,targetSpeed:target,startedAt:null,completedAt:null,superseded:false};
    this.requests.push(record);if(this.requests.length>64)this.requests.shift();
    if(this.speed<.01&&target>0){
      const left=this.feet.LeftFoot,right=this.feet.RightFoot,support=left.position[1]<=.003?'LeftFoot':right.position[1]<=.003?'RightFoot':'LeftFoot',basis=support==='LeftFoot'?.25:.75,before=this.phase;
      this.phase=Math.max(before,Math.ceil(before-basis-1e-10)+basis);this.phaseReseeds.push({reason:'standing-restart',time:this.clock,requestID:record.id,from:before,to:this.phase,sourceSpeed:this.speed,support});if(this.phaseReseeds.length>64)this.phaseReseeds.shift();
      for(const f of Object.values(this.feet)){
        const previousHeel=Math.floor(this.phase-f.offset)+f.offset;
        if(f.name===support){f.mode='plant';f.anchor=f.position.slice();f.heelPhase=previousHeel;this.recordHeel(f,f.heelPhase,'standing-inherited');}
        else{if(f.position[1]<=.003)this.recordHeel(f,previousHeel,'standing-inherited');else f.record=null;this.takeoff(f,'start-step');}
      }
    }
    return record.id;
  }
  advanceSpeed(speed,dt,phase=this.phase){if(this.seedCommitUntil!==null&&phase<this.seedCommitUntil-1e-9)return speed;return speed+this.clamp(this.targetSpeed-speed,-this.deceleration*dt,this.acceleration*dt);}
  hipHeightAt(speed,phase){const {a,b,weight}=this.bracket(speed),aa=this.sample(a,phase*a.duration).hipsOffsetMeters[1],bb=this.sample(b,phase*b.duration).hipsOffsetMeters[1];let offset=aa+(bb-aa)*weight;if(speed<1.6){const idle=this.sample(this.idle,(this.idleSeconds||0)+this.clock).hipsOffsetMeters[1];offset=idle+(offset-idle)*this.smooth(speed/1.6);}return .86+offset;}
  forecast(phaseTarget){
    let phase=this.phase,speed=this.speed,distance=this.distance,elapsed=0;
    while(phase<phaseTarget-1e-9&&elapsed<4){
      const dt=1/240,next=this.advanceSpeed(speed,dt,phase),frequency=this.frequency((speed+next)/2);
      if(frequency<=1e-8)break;
      const part=Math.min(dt,(phaseTarget-phase)/frequency);
      distance+=(speed+this.advanceSpeed(speed,part,phase))*.5*part;speed=this.advanceSpeed(speed,part,phase);phase+=frequency*part;elapsed+=part;
    }
    const freq=this.frequency(Math.max(speed,.1)),hipHeight=this.hipHeightAt(speed,((phaseTarget%1)+1)%1),availableFront=Math.sqrt(Math.max(0,.777*.777-(hipHeight-.08)**2))-.015,front=this.clamp(speed*this.stanceFraction(speed)/Math.max(freq,1e-6)*.5,.02,Math.max(.02,Math.min(.36,availableFront)));
    return{distance,speed,seconds:elapsed,front,hipHeight,availableFront};
  }
  sourceFK(phase){
    if(this._fkPhase===phase&&this._fkResult)return this._fkResult;
    const pose=this.sample(this.seedSourceClip,phase*this.seedSourceClip.duration),objects={};
    for(const bone of this.skeleton.bones){const rotation=new this.THREE.Quaternion().fromArray(pose.rotations[bone.name]).normalize(),position=new this.THREE.Vector3().fromArray(bone.restTranslationMeters);if(bone.name==='Hips')position.add(new this.THREE.Vector3().fromArray(pose.hipsOffsetMeters));if(bone.parent){const parent=objects[bone.parent];position.applyQuaternion(parent.rotation).add(parent.position);rotation.premultiply(parent.rotation);}objects[bone.name]={position,rotation};}
    const result=Object.fromEntries(['LeftFoot','RightFoot'].map(name=>{const object=objects[name];return[name,{position:object.position.clone().add(new this.THREE.Vector3(0,-.08,0).applyQuaternion(object.rotation)).toArray(),orientation:object.rotation.toArray()}];}));
    this._fkPhase=phase;this._fkResult=result;return result;
  }
  takeoff(f,reason){
    if(f.record&&!f.record.release){f.record.release={phase:this.phase,time:this.clock,reason,releaseSpeed:this.speed,rootDistance:this.distance,rearDistance:this.distance-f.anchor[2],reachPrediction:f.reachPrediction&&{...f.reachPrediction}};}
    f.mode='flight';f.from=f.position.slice();f.fromOrientation=f.orientation.slice();f.startPhase=this.phase;f.startTime=this.clock;
    f.heelPhase=Math.floor(this.phase-f.offset)+1+f.offset;
    if(f.heelPhase-this.phase<.08)f.heelPhase+=1;
    const future=this.forecast(f.heelPhase);f.target=[f.x,0,future.distance+future.front];
    f.totalSeconds=Math.max(.14,future.seconds);f.transferStart=Math.min(.12,.02/f.totalSeconds);f.transferEnd=1-Math.min(.25,.050/f.totalSeconds);
    f.riseFraction=Math.min(.35,.06/f.totalSeconds);f.height=.10+.015*Math.max(this.speed,future.speed);
    f.targetFrozen=false;f.nextForecastAt=this.clock;f.record=null;
  }
  recordHeel(f,heelPhase,reason='heel-crossing'){
    const stance=this.stanceFraction(this.speed),record={id:f.name+':'+heelPhase.toFixed(6)+':'+(++this.nextHeelID),side:f.name,heelPhase,heelSpeed:this.speed,stanceFraction:stance,stanceEndPhase:heelPhase+stance,plannedAnchor:f.anchor.slice(),touchdownPhase:this.phase,touchdownTime:this.clock,rootDistance:this.distance,reason,release:null};
    f.record=record;f.stanceEndPhase=record.stanceEndPhase;this.heelRecords.push(record);if(this.heelRecords.length>64)this.heelRecords.shift();
  }
  step(dt,geometry=null,{includeHistory=true}={}){
    if(geometry)this.geometry=geometry;
    if(dt<=0)return this.snapshot({includeHistory});
    if(this.geometry?.curve?.kind==='circle'&&typeof this.geometry.predictWorldReach!=='function')throw Error('Rebind curved world geometry before stepping cloned feet');
    const count=Math.max(1,Math.ceil(dt*240)),h=dt/count;
    for(let n=0;n<count;n++){
      const prior=this.speed;this.speed=this.advanceSpeed(prior,h);const mid=(prior+this.speed)*.5;
      this.distance+=mid*h;this.phase+=this.frequency(mid)*h;this.clock+=h;
      for(const f of Object.values(this.feet))this.advanceFoot(f,h);
      this.settleFeet(h);
    }
    for(const r of this.requests)if(!r.superseded){
      if(r.startedAt===null)r.startedAt=this.clock;
      if(r.completedAt===null&&Math.abs(this.speed-r.targetSpeed)<1e-6&&(r.targetSpeed>0||Object.values(this.feet).every(f=>f.mode==='plant'&&Math.abs(f.anchor[0]-f.x)<.015&&Math.abs(f.anchor[1])<.001&&Math.abs(f.anchor[2]-this.distance)<.015)))r.completedAt=this.clock;
    }
    return this.snapshot({includeHistory});
  }
  advanceFoot(f,dt){
    if(f.mode==='plant'){
      f.position=f.anchor.slice();f.orientation=[0,0,0,1];
      const rear=this.distance-f.anchor[2];
      const g=this.geometry||{hipHeight:.86+this.pose().hipsOffsetMeters[1],hipZ:0,hipX:0},anticipation=.02;
      const hip=g.hips?.[f.name]||{x:(g.hipX||0)+f.x,y:g.hipHeight,z:g.hipZ||0};
      const next=this.advanceSpeed(this.speed,anticipation),futureRoot=this.distance+(this.speed+next)*.5*anticipation;
      const lift=(.10+.015*this.speed)*this.smooth(anticipation/.06),dy=hip.y-(f.anchor[1]+.08+lift),dx=hip.x-f.anchor[0],dz=futureRoot+hip.z-f.anchor[2];
      let predictedReach=Math.hypot(dx,dy,dz);
      let currentReach=Math.hypot(hip.x-f.anchor[0],hip.y-(f.anchor[1]+.08),this.distance+hip.z-f.anchor[2]);const currentLimit=.77-.01*this.smooth(this.speed/1.6);
      f.reachPrediction={anticipationSeconds:anticipation,hipHeight:hip.y,hipX:hip.x,hipZ:hip.z,geometryMeasuredAt:g.measuredAt??null,currentReach,currentLimit,isRearward:this.distance+hip.z>f.anchor[2],rootDistance:this.distance,futureRoot,ankleHeight:f.anchor[1]+.08+lift,predictedReach,limit:.772};
      // An optional curved-world adapter replaces only the geometry metric.
      // It receives numeric inputs; the gait, phase, limits and toeoff rule stay
      // identical. Its numeric world inputs are retained for independent audit.
      if(typeof g.predictWorldReach==='function'){
        const world=g.predictWorldReach({name:f.name,anchor:f.anchor.slice(),rootDistance:this.distance,futureRootDistance:futureRoot,anticipatedLift:lift,ankleOffset:.08,geometryMeasuredAt:g.measuredAt??null});
        if(!world||!Number.isFinite(world.currentReach)||!Number.isFinite(world.predictedReach)||typeof world.isRearward!=='boolean')throw Error('Invalid world reach prediction');
        currentReach=world.currentReach;predictedReach=world.predictedReach;
        Object.assign(f.reachPrediction,{currentReach,predictedReach,isRearward:world.isRearward,worldPrediction:structuredClone(world.worldPrediction)});
      }
      if(this.targetSpeed>0||this.speed>.05){
        if(this.phase>=f.stanceEndPhase-1e-10)this.takeoff(f,'authored-toeoff');
        else if(f.reachPrediction.isRearward&&(currentReach>currentLimit||predictedReach>.772))this.takeoff(f,'predicted-leg-reach');
      }
      return;
    }
    if(f.mode==='inherited'){
      const source=this.sourceFK(this.phase)[f.name],u=this.clamp((this.phase-f.inheritedStartPhase)/(f.heelPhase-f.inheritedStartPhase),0,1),weight=1-this.smooth(u);
      f.position=source.position.map((x,i)=>x+(i===2?this.distance:0)+f.inheritedCorrection[i]*weight);
      const offset=new this.THREE.Quaternion().fromArray(f.inheritedOrientation).slerp(new this.THREE.Quaternion(),1-weight);f.orientation=new this.THREE.Quaternion().fromArray(source.orientation).multiply(offset).normalize().toArray();
      if(u===1){f.mode='plant';f.anchor=f.position.slice();f.anchor[1]=0;f.position=f.anchor.slice();f.orientation=[0,0,0,1];this.recordHeel(f,f.heelPhase,'inherited-touchdown');}
      return;
    }
    if(f.mode==='settle'){
      const u=this.clamp((this.clock-f.startTime)/f.duration,0,1),w=this.smooth(this.clamp((u-.18)/.64,0,1));
      f.position=f.from.map((x,i)=>i===1?f.from[1]*(1-this.smooth(u))+(f.settleVerticalOnly?0:.10*Math.sin(Math.PI*u)**2):x+(f.target[i]-x)*w);f.orientation=new this.THREE.Quaternion().fromArray(f.fromOrientation||[0,0,0,1]).slerp(new this.THREE.Quaternion(),this.smooth(u)).normalize().toArray();
      if(u===1){f.mode='plant';f.anchor=f.target.slice();f.position=f.anchor.slice();f.stanceEndPhase=Infinity;this.recordHeel(f,this.phase,'idle-settle');f.stanceEndPhase=Infinity;}
      return;
    }
    const u=this.clamp((this.phase-f.startPhase)/(f.heelPhase-f.startPhase),0,1);
    if(!f.targetFrozen&&this.clock>=f.nextForecastAt){
      const forecast=this.forecast(f.heelPhase),desired=forecast.distance+forecast.front;
      f.target[2]+=this.clamp(desired-f.target[2],-.05,.05);f.nextForecastAt=this.clock+1/30;
      if(u>=f.transferEnd-.10)f.targetFrozen=true;
    }
    const transfer=this.smooth((u-f.transferStart)/(f.transferEnd-f.transferStart));
    const lift=this.smooth(u/f.riseFraction)*this.smooth((1-u)/f.riseFraction);
    f.position=[f.from[0]+(f.target[0]-f.from[0])*transfer,Math.max(f.from[1]*(1-this.smooth(u)),f.height*lift),f.from[2]+(f.target[2]-f.from[2])*transfer];
    const pitch=.25*Math.sin(Math.PI*u),q=new this.THREE.Quaternion().setFromAxisAngle(new this.THREE.Vector3(1,0,0),pitch);
    f.orientation=new this.THREE.Quaternion().fromArray(f.fromOrientation).slerp(q,this.smooth(Math.min(1,u/.3))).toArray();
    if(u===1){f.mode='plant';f.anchor=f.target.slice();f.position=f.anchor.slice();f.orientation=[0,0,0,1];this.recordHeel(f,f.heelPhase);}
  }
  settleFeet(){
    if(this.targetSpeed!==0||this.speed>.03)return;
    if(Object.values(this.feet).some(f=>f.mode==='settle'))return;
    const feet=Object.values(this.feet),flight=feet.find(f=>f.mode==='flight'||f.mode==='free');
    const candidate=flight||feet.filter(f=>Math.abs(f.anchor[0]-f.x)>.012||Math.abs(f.anchor[1])>.001||Math.abs(f.anchor[2]-this.distance)>.012).sort((a,b)=>Math.hypot(b.anchor[0]-b.x,b.anchor[1],b.anchor[2]-this.distance)-Math.hypot(a.anchor[0]-a.x,a.anchor[1],a.anchor[2]-this.distance))[0];
    if(candidate){if(candidate.mode==='plant'&&candidate.record&&!candidate.record.release)candidate.record.release={phase:this.phase,time:this.clock,reason:'neutral-stop-step',releaseSpeed:this.speed,rootDistance:this.distance,neutralGap:Math.abs(candidate.anchor[2]-this.distance),otherFootPlanted:feet.some(f=>f!==candidate&&f.mode==='plant')};candidate.mode='settle';candidate.from=candidate.position.slice();candidate.fromOrientation=candidate.orientation.slice();candidate.target=[candidate.x,0,this.distance];candidate.settleVerticalOnly=Math.hypot(candidate.from[0]-candidate.x,candidate.from[2]-this.distance)<.001;candidate.startTime=this.clock;candidate.duration=.30;}
  }
  pose(){return this.poseAt(this.speed,this.phase,this.clock);}
  poseAt(speed=this.speed,unwrappedPhase=this.phase,clock=this.clock){
    const {a,b,weight:w}=this.bracket(speed),phase=((unwrappedPhase%1)+1)%1,pa=this.sample(a,phase*a.duration),pb=this.sample(b,phase*b.duration),q=new this.THREE.Quaternion(),q2=new this.THREE.Quaternion();
    const rotations={};for(const name of Object.keys(pa.rotations))rotations[name]=q.fromArray(pa.rotations[name]).slerp(q2.fromArray(pb.rotations[name]),w).toArray();
    let hipsOffsetMeters=pa.hipsOffsetMeters.map((x,i)=>x+(pb.hipsOffsetMeters[i]-x)*w);
    if(speed<1.6){const idle=this.sample(this.idle,(this.idleSeconds||0)+clock),m=this.smooth(speed/1.6);for(const name of Object.keys(rotations))rotations[name]=q.fromArray(idle.rotations[name]).slerp(q2.fromArray(rotations[name]),m).toArray();hipsOffsetMeters=idle.hipsOffsetMeters.map((x,i)=>x+(hipsOffsetMeters[i]-x)*m);}
    return{rotations,hipsOffsetMeters,local:phase*a.duration};
  }
  predict(dt=0){
    if(!Number.isFinite(dt)||dt<0)throw Error('Prediction time must be finite and nonnegative');
    let speed=this.speed,phase=this.phase,distance=this.distance,clock=this.clock;
    const count=Math.max(1,Math.ceil(dt*240)),h=dt/count;
    for(let n=0;n<count;n++){const prior=speed;speed=this.advanceSpeed(prior,h,phase);const mid=(prior+speed)*.5;distance+=mid*h;phase+=this.frequency(mid)*h;clock+=h;}
    return{clock,actualSpeed:speed,targetSpeed:this.targetSpeed,unwrappedPhase:phase,rootDistance:distance,pose:this.poseAt(speed,phase,clock)};
  }
  predictPose(dt=0){return this.predict(dt).pose;}
  clone(){return new LocomotionSpace(this.THREE,this.clips,this.sample,this.skeleton).restore(this.exportState());}
  copyFrom(other){return this.restore(other.exportState());}
  flightTarget(name,hip){
    const f=this.feet[name],position=f.position.slice();
    if(f.mode==='plant'||f.mode==='inherited')return{position,foreAftProjection:0,radius:null};
    const age=this.clock-f.startTime,u=f.mode==='flight'?this.clamp((this.phase-f.startPhase)/(f.heelPhase-f.startPhase),0,1):1;
    const middle=.777-(.777-this.flightReachRadius)*this.smooth(this.speed/1.6);
    const radius=Math.max(.777-(.777-middle)*this.smooth(age/.08),middle+(.777-middle)*this.smooth((u-.70)/.30));
    const offset=new this.THREE.Vector3(0,.08,0).applyQuaternion(new this.THREE.Quaternion().fromArray(f.orientation));
    const delta=position.map((x,i)=>x+offset.getComponent(i)-hip[i]),available=Math.sqrt(Math.max(0,radius*radius-delta[0]*delta[0]-delta[1]*delta[1])),z=this.clamp(delta[2],-available,available),projection=delta[2]-z;
    position[2]-=projection;return{position,foreAftProjection:projection,preservedSoleY:position[1],radius};
  }
  exportState(){const keys=['clock','phase','distance','speed','targetSpeed','flightReachRadius','nextHeelID','requestID','requestedClip','requests','heelRecords','phaseReseeds','feet','idleSeconds','seedCommitUntil','seedPhase'];const geometry=this.geometry&&Object.fromEntries(Object.entries(this.geometry).filter(([,value])=>typeof value!=='function'));return structuredClone({...Object.fromEntries(keys.map(k=>[k,this[k]])),geometry,seedSourceClipID:this.seedSourceClip?.id||null});}
  restore(state){Object.assign(this,structuredClone(state));this.seedSourceClip=this.byId.get(state.seedSourceClipID)||null;this._fkPhase=null;this._fkResult=null;for(const f of Object.values(this.feet))if(f.record)f.record=this.heelRecords.find(r=>r.id===f.record.id)||f.record;return this;}
  snapshot({includeHistory=true}={}){
    const {a,b,weight}=this.bracket(),gaitWeight=this.speed<1.6?this.smooth(this.speed/1.6):1;const contributors=[...(gaitWeight<1?[{clip:'idle',weight:1-gaitWeight,time:(this.idleSeconds||0)+this.clock}]:[]),{clip:a.id,weight:(1-weight)*gaitWeight,time:((this.phase%1)+1)%1*a.duration},...(weight>0?[{clip:b.id,weight:weight*gaitWeight,time:((this.phase%1)+1)%1*b.duration}]:[])].filter(c=>c.weight>1e-12);return{kind:'continuous-phase-locomotion',clock:this.clock,actualSpeed:this.speed,targetSpeed:this.targetSpeed,requestedClip:this.requestedClip,inheritedSourceClip:this.seedCommitUntil!==null&&this.phase<this.seedCommitUntil?this.seedSourceClip?.id||null:null,seedCommitUntil:this.seedCommitUntil,requestID:this.requestID,unwrappedPhase:this.phase,rootDistance:this.distance,frequency:this.frequency(),contributors,stanceFraction:this.stanceFraction(),feet:Object.fromEntries(Object.entries(this.feet).map(([k,f])=>[k,{mode:f.mode,position:f.position.slice(),orientation:f.orientation.slice(),anchor:f.anchor?.slice(),heelPhase:f.heelPhase,stanceEndPhase:f.stanceEndPhase,flightStartPhase:f.startPhase,flightStartTime:f.startTime,flightProgress:f.mode==='flight'?this.clamp((this.phase-f.startPhase)/(f.heelPhase-f.startPhase),0,1):null,target:f.target?.slice(),targetFrozen:f.targetFrozen,sourceSupport:f.sourceSupport&&{...f.sourceSupport},neutralStep:f.mode==='settle'?{from:f.from.slice(),target:f.target.slice(),startTime:f.startTime,duration:f.duration,verticalOnly:f.settleVerticalOnly}:null}])),lastPhaseReseed:this.phaseReseeds?.length?structuredClone(this.phaseReseeds.at(-1)):null,phaseReseeds:includeHistory?structuredClone(this.phaseReseeds||[]):[],historyIncluded:includeHistory,heelRecords:includeHistory?structuredClone(this.heelRecords):[],requests:includeHistory?this.requests.map(r=>({...r})):[]};
  }
}

/** Minimal vertical correction of an unplanted world-space sole goal.
 * Vertices are the bound exact Foot-local rigid-boot hull; padding is applied
 * after rotation. This function never changes phase, orientation, XZ or plants.
 */
export function airborneFootGoalClearance({mode,position,orientation,vertices,paddingMeters=.0005,minimumY=.001}){
  const before=position.slice();
  if(mode==='plant')return{mode,position:before,liftMeters:0,minimumBefore:null,minimumAfter:null,minimumY,excludedPlant:true};
  if(!vertices?.length)throw Error('A bound Foot-local boot hull is required');
  const norm=Math.hypot(...orientation);if(!Number.isFinite(norm)||norm<1e-12)throw Error('Invalid foot orientation');
  const[x,y,z,w]=orientation.map(v=>v/norm),r0=2*(x*y+z*w),r1=1-2*(x*x+z*z),r2=2*(y*z-x*w),ankleY=before[1]+r1*.08;
  let bound=Infinity;for(const p of vertices)bound=Math.min(bound,ankleY+r0*p[0]+r1*p[1]+r2*p[2]-paddingMeters);
  const lift=Math.max(0,minimumY-bound),after=before.slice();after[1]+=lift;
  return{mode,position:after,liftMeters:lift,minimumBefore:bound,minimumAfter:bound+lift,minimumY,excludedPlant:false};
}
