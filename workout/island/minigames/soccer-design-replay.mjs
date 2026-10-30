import * as T from '../vendor/three.module.js';

const root=new URL('../design/vfx/cameras/',import.meta.url);
const preference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const reduced=()=>preference?.matches===true;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);};
const playerFields=['x','z','vx','vz','fx','fz','kickTime','stealTime','slideTime','recover','headerTime','throwTime','diveTime','catchTime','diveZ','turnLean','request','sprinting','hands','hold'];
const ballFields=['x','y','z','vx','vy','vz','curve','owner','lastTeam','lastPlayer','grace'];
const stateFields=['elapsed','halfElapsed','controlled','attackDir','charge','charging','selectionTime','half'];
const capacity=64,frequency=30,historySeconds=2.1;

function hermite(a,b,ma,mb,u,d){const u2=u*u,u3=u2*u;return (2*u3-3*u2+1)*a+(u3-2*u2+u)*d*ma+(-2*u3+3*u2)*b+(u3-u2)*d*mb;}

/** A bounded render recording; it never writes to the model or extends a goal. */
export function createSoccerDesignReplay({config,fetcher=globalThis.fetch,reducedMotion=reduced}={}){
  const rosterCount=config?.players?.roster?.length||8,playerWidth=playerFields.length,ballOffset=rosterCount*playerWidth,stateOffset=ballOffset+ballFields.length,extraOffset=stateOffset+stateFields.length,stride=extraOffset+14;
  const values=new Float32Array(capacity*stride),times=new Float64Array(capacity),controller=new AbortController(),paths={};
  const directionVector=new T.Vector3(),lookTarget=new T.Vector3(),livePosition=[0,0,0],liveTarget=[0,0,0],startPosition=[0,0,0],startTarget=[0,0,0],pathPosition=[0,0,0],pathTarget=[0,0,0];
  const flight={fromX:0,fromZ:0,x:0,z:0,height:0},shot={shooter:0};
  let rendered=null,write=0,count=0,clock=0,lastWrite=-100,recordedSinceSample=false,disposed=false,active=false,path=null,elapsed=0,total=0,pathDuration=0,contactClock=0,contactPathTime=0,anchorX=0,direction=1,baseFov=50,startFov=50,startAspect=1,visualStart=0,lastPhase=null,lastCamera=null,starts=0,reason='idle',recordTime=0;
  const ready=Promise.all(['left','right','behind'].map(async side=>{try{const response=await fetcher(new URL(`goal-replay-${side}.json`,root),{signal:controller.signal});if(response.ok){const data=await response.json();if(!disposed)paths[side]=data;}}catch{/* A replay is optional presentation. */}}));

  function ensureState(state){
    if(rendered||state.players.length!==rosterCount)return;
    rendered={...state,players:state.players.map(player=>({...player})),ball:{...state.ball},sprint:{...state.sprint},aim:{...state.aim},replay:true};
  }
  function store(state,force=false){
    ensureState(state);if(!rendered||!force&&clock-lastWrite<1/frequency-1e-6)return;
    const at=write*stride;let k=at;
    for(let i=0;i<rosterCount;i++){const player=state.players[i];for(let j=0;j<playerWidth;j++){const field=playerFields[j];values[k++]=Number(player[field])||0;}}
    for(let i=0;i<ballFields.length;i++){const field=ballFields[i];values[k++]=field==='owner'?(state.ball.owner??-1):(Number(state.ball[field])||0);}
    for(let i=0;i<stateFields.length;i++)values[k++]=Number(state[stateFields[i]])||0;
    values[k++]=state.mode==='defense'?1:0;values[k++]=state.chargeKind==='pass'?1:state.chargeKind==='shot'?2:0;values[k++]=Number(state.sprint?.active)||0;
    const f=state.ball.flight;values[k++]=f?1:0;values[k++]=f?.fromX||0;values[k++]=f?.fromZ||0;values[k++]=f?.x||0;values[k++]=f?.z||0;values[k++]=f?.height||0;
    values[k++]=state.ball.shot?1:0;values[k++]=state.ball.shot?.shooter??-1;values[k++]=state.sprint?.value||0;
    const aim=state.actionAim||state.kickAim||state.aim;values[k++]=aim?.x??state.attackDir;values[k++]=aim?.z||0;
    times[write]=clock;write=(write+1)%capacity;count=Math.min(capacity,count+1);lastWrite=clock;
    while(count>1&&clock-times[(write-count+capacity)%capacity]>historySeconds)count--;
  }
  function record(state,dt=0){
    if(disposed)return;recordedSinceSample=true;clock+=Math.max(0,Number.isFinite(dt)?dt:0);
    if(state.phase==='playing'||state.phase==='goal')store(state);
    else {count=0;lastWrite=-100;}
  }
  function capture(camera){
    livePosition[0]=camera.position.x;livePosition[1]=camera.position.y;livePosition[2]=camera.position.z;
    camera.getWorldDirection(directionVector);const distance=directionVector.y<-.001?-camera.position.y/directionVector.y:(config?.view?.camera?.nearDistance||20);
    liveTarget[0]=camera.position.x+directionVector.x*distance;liveTarget[1]=camera.position.y+directionVector.y*distance;liveTarget[2]=camera.position.z+directionVector.z*distance;
  }
  function apply(camera,position,target,fov){
    camera.position.set(position[0],position[1],position[2]);lookTarget.set(target[0],target[1],target[2]);camera.lookAt(lookTarget);camera.updateMatrixWorld();
    if(Math.abs(camera.fov-fov)>.00001){camera.fov=fov;camera.updateProjectionMatrix();}
  }
  function restoreFov(){if(lastCamera&&lastCamera.fov!==baseFov){lastCamera.fov=baseFov;lastCamera.updateProjectionMatrix();}}
  function skip(why='skipped'){if(active){active=false;restoreFov();}reason=why;}
  function start(state,camera){
    const angle=config?.view?.designReplay?.angle||['left','right','behind'][Math.abs(state.eventId||0)%3];path=paths[angle]||paths.left||paths.right||paths.behind;
    const oldest=(write-count+capacity)%capacity;
    if(!path||!rendered||count<2||clock-times[oldest]<.4){reason=!path?'track-unavailable':'short-recording';return false;}
    const goalSeconds=config?.match?.goalSeconds||2.2;total=Math.min(2.2,goalSeconds,Math.max(0,state.phaseTime??goalSeconds));
    if(total<1){reason='short-goal-pause';return false;}
    store(state,true);contactClock=clock;contactPathTime=path.replayContactPathTime;pathDuration=total-.4;elapsed=0;
    direction=Math.sign(state.ball.x)||state.attackDir*(state.event?.team===1?-1:1);anchorX=direction*(config?.pitch?.length||36)/2;
    baseFov=config?.view?.camera?.fovDegrees||camera.fov;startFov=baseFov;startAspect=camera.aspect;visualStart=state.elapsed;capture(camera);
    for(let i=0;i<3;i++){startPosition[i]=livePosition[i];startTarget[i]=liveTarget[i];}
    active=true;lastCamera=camera;starts++;reason='playing';return true;
  }
  function samplePath(time){
    const points=path.points;let a=points[0],b=points[1];
    for(let i=1;i<points.length;i++){a=points[i-1];b=points[i];if(time<=b.time)break;}
    const d=b.time-a.time,u=clamp((time-a.time)/d,0,1);
    for(let i=0;i<3;i++){pathPosition[i]=hermite(a.position[i],b.position[i],a.positionTangent[i],b.positionTangent[i],u,d);pathTarget[i]=hermite(a.target[i],b.target[i],a.targetTangent[i],b.targetTangent[i],u,d);}
    const px=pathPosition[0],pz=pathPosition[2],tx=pathTarget[0],tz=pathTarget[2];pathPosition[0]=anchorX-direction*pz;pathPosition[2]=direction*px;pathTarget[0]=anchorX-direction*tz;pathTarget[2]=direction*tx;
    return hermite(a.fov,b.fov,a.fovTangent,b.fovTangent,u,d);
  }
  function read(time,live,blend){
    let first=(write-count+capacity)%capacity,second=first;
    for(let i=1;i<count;i++){second=(first+1)%capacity;if(time<=times[second])break;first=second;}
    if(time>=times[(write-1+capacity)%capacity])first=second=(write-1+capacity)%capacity;
    const span=times[second]-times[first],u=span>0?clamp((time-times[first])/span,0,1):0,a=first*stride,b=second*stride,nearest=u<.5?a:b;
    let k=0;
    for(let i=0;i<rosterCount;i++){
      const player=rendered.players[i],current=live.players[i];
      for(let j=0;j<playerWidth;j++,k++){
        const field=playerFields[j];let value=values[a+k]+(values[b+k]-values[a+k])*u;
        if(field==='hands'||field==='sprinting'){player[field]=Boolean(values[nearest+k]);continue;}
        if(j<6&&blend<1)value=(Number(current[field])||0)+(value-(Number(current[field])||0))*blend;
        player[field]=value;
      }
      const facing=Math.sqrt(player.fx*player.fx+player.fz*player.fz)||1;player.fx/=facing;player.fz/=facing;
    }
    for(let i=0;i<ballFields.length;i++,k++){
      const field=ballFields[i];let value=values[a+k]+(values[b+k]-values[a+k])*u;
      if(field==='owner'||field==='lastTeam'||field==='lastPlayer'){value=values[nearest+k];rendered.ball[field]=field==='owner'&&value<0?null:value;continue;}
      if(i<6&&blend<1)value=(Number(live.ball[field])||0)+(value-(Number(live.ball[field])||0))*blend;
      rendered.ball[field]=value;
    }
    for(let i=0;i<stateFields.length;i++,k++)rendered[stateFields[i]]=values[a+k]+(values[b+k]-values[a+k])*u;
    rendered.controlled=values[nearest+stateOffset+2];rendered.attackDir=values[nearest+stateOffset+3];rendered.charging=Boolean(values[nearest+stateOffset+5]);rendered.half=values[nearest+stateOffset+7];
    const e=nearest+extraOffset;rendered.mode=values[e]?'defense':'attack';rendered.chargeKind=values[e+1]===1?'pass':values[e+1]===2?'shot':null;rendered.sprint.active=Boolean(values[e+2]);
    if(values[e+3]){flight.fromX=values[e+4];flight.fromZ=values[e+5];flight.x=values[e+6];flight.z=values[e+7];flight.height=values[e+8];rendered.ball.flight=flight;}else rendered.ball.flight=null;
    if(values[e+9]){shot.shooter=values[e+10];rendered.ball.shot=shot;}else rendered.ball.shot=null;rendered.sprint.value=values[e+11];
    rendered.aim.x=values[e+12];rendered.aim.z=values[e+13];
    rendered.phase='playing';rendered.elapsed=visualStart+elapsed;rendered.phaseTime=live.phaseTime;rendered.event=null;rendered.eventId=live.eventId;rendered.score=live.score;rendered.passTarget=null;rendered.restart=null;rendered.actionAim=null;rendered.kickAim=null;rendered.result=live.result;rendered.replay=true;
    return rendered;
  }
  return {
    ready,record,skip,get active(){return active;},
    sample(state,dt=0,camera){
      if(disposed)return state;if(!recordedSinceSample)record(state,dt);recordedSinceSample=false;
      const enteredGoal=state.phase==='goal'&&lastPhase!=='goal';lastPhase=state.phase;
      if(!camera||reducedMotion()||state.phase!=='goal'){skip(reducedMotion()?'reduced-motion':state.phase!=='goal'?'live':'camera-unavailable');return state;}
      let started=false;
      // A frame can contain several simulation events. Phase is authoritative
      // even if the last event has already overwritten the goal notification.
      if(enteredGoal)started=start(state,camera);
      if(!active)return state;
      if(Math.abs(camera.aspect-startAspect)>.00001){skip('resize');return state;}
      if(!started)elapsed+=Math.max(0,Number.isFinite(dt)?dt:0);
      if(elapsed>=total){skip('complete');return state;}
      capture(camera);
      const entry=.2,exit=.2,pathTime=contactPathTime-pathDuration/2+pathDuration*smooth((elapsed-entry)/pathDuration),fov=samplePath(pathTime);
      recordTime=contactClock+(pathTime-contactPathTime);let blend=1,cameraFov=fov;
      if(elapsed<entry){blend=smooth(elapsed/entry);for(let i=0;i<3;i++){pathPosition[i]=startPosition[i]+(pathPosition[i]-startPosition[i])*blend;pathTarget[i]=startTarget[i]+(pathTarget[i]-startTarget[i])*blend;}cameraFov=startFov+(fov-startFov)*blend;}
      else if(elapsed>total-exit){const out=smooth((elapsed-total+exit)/exit);blend=1-out;for(let i=0;i<3;i++){pathPosition[i]+=(livePosition[i]-pathPosition[i])*out;pathTarget[i]+=(liveTarget[i]-pathTarget[i])*out;}cameraFov=fov+(baseFov-fov)*out;}
      if(startAspect<1){const wide=2*Math.atan(Math.tan(cameraFov*Math.PI/360)/Math.max(.45,startAspect))*180/Math.PI;cameraFov=cameraFov+(Math.min(94,wide)-cameraFov)*blend;}
      apply(camera,pathPosition,pathTarget,cameraFov);return read(recordTime,state,blend);
    },
    metrics:()=>({active,recordedSamples:count,historySeconds:count>1?times[(write-1+capacity)%capacity]-times[(write-count+capacity)%capacity]:0,bufferBytes:values.byteLength+times.byteLength,starts,reason,elapsed,duration:total,sourcePath:path?.id||null,sourcePathSeconds:pathDuration,recordingOffset:recordTime-contactClock}),
    dispose(){if(disposed)return;skip('disposed');disposed=true;controller.abort();count=0;rendered=null;lastCamera=null;}
  };
}
