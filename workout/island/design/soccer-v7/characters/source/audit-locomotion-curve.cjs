/** Read-only companion for the independent shared twelve-actor pitch audit.
 * Inject createCurveAuditWitness.toString() into the browser; no imports or
 * production curve helper are used to construct expected world geometry.
 */
function createCurveAuditWitness({radius=8}={}){
  const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,s)=>a.map(x=>x*s),norm=a=>Math.hypot(...a),error=(a,b)=>norm(sub(a,b));
  const right=h=>[Math.cos(h),0,-Math.sin(h)],forward=h=>[Math.sin(h),0,Math.cos(h)];
  const rotate=(v,h)=>add(add(scale(right(h),v[0]),scale(forward(h),v[2])),[0,v[1],0]);
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  // Independent centre/radius construction, rather than the runtime point map.
  const point=(a,p)=>add(add(add(a.origin,scale(right(a.yaw),radius)),scale(right(a.yaw+p[2]/radius),-(radius-p[0]))),[0,p[1],0]);
  const previous=new Map(),seenReleases=new Set(),requests=new Map(),caseSlots=new Map(),caseHeadings=new Map();
  const maxima={rootPositionMeters:0,modelForward:0,worldPredictionMeters:0,reportedReachMeters:0,measurementHipMeters:0,measurementAgeSeconds:0,measuredChordSpeedError:0,longitudinalAcceleration:0,plantMarkerDriftMeters:0};
  const errors=[];let frames=0,actorSamples=0,releaseChecks=0;
  const fail=(kind,detail)=>{if(errors.length<128)errors.push({kind,...detail});};
  function observe(frame){
    const dt=frame.dt||0,caseID=String(frame.caseID??'pitch'),slots=caseSlots.get(caseID)||new Set();caseSlots.set(caseID,slots);frames++;
    for(const a of frame.actors){
      const m=a.motor;if(!m){fail('missing-motor',{caseID,slot:a.slot});continue;}
      slots.add(a.slot);if(!caseHeadings.has(caseID))caseHeadings.set(caseID,new Map());caseHeadings.get(caseID).set(a.slot,a.yaw);actorSamples++;const key=caseID+':'+a.slot,prior=previous.get(key),root=point(a,[0,0,m.rootDistance]),heading=a.yaw+m.rootDistance/radius;
      const rootError=error(root,a.world),headingError=error(forward(heading),a.modelForward);maxima.rootPositionMeters=Math.max(maxima.rootPositionMeters,rootError);maxima.modelForward=Math.max(maxima.modelForward,headingError);
      if(rootError>1e-6||headingError>1e-6)fail('root-circle',{caseID,slot:a.slot,rootError,headingError});
      if(prior&&dt>0){
        const ds=m.rootDistance-prior.motor.rootDistance,expectedChord=2*radius*Math.abs(Math.sin(ds/(2*radius)))/dt,observed=error(a.world,prior.world)/dt,chordError=Math.abs(expectedChord-observed),acceleration=Math.abs(m.actualSpeed-prior.motor.actualSpeed)/dt;
        maxima.measuredChordSpeedError=Math.max(maxima.measuredChordSpeedError,chordError);maxima.longitudinalAcceleration=Math.max(maxima.longitudinalAcceleration,acceleration);
        if(chordError>1e-6||acceleration>4.50001)fail('root-speed',{caseID,slot:a.slot,chordError,acceleration});
        for(const lock of a.locks||[]){const old=(prior.locks||[]).find(l=>l.name===lock.name&&l.key===lock.key);if(old&&prior.toes?.[lock.name]&&a.toes?.[lock.name]){const drift=error(prior.toes[lock.name],a.toes[lock.name]);maxima.plantMarkerDriftMeters=Math.max(maxima.plantMarkerDriftMeters,drift);if(drift>.003)fail('fixed-plant-marker',{caseID,slot:a.slot,side:lock.name,drift});}}
      }
      for(const heel of m.heelRecords||[]){
        const r=heel.release,id=key+':'+heel.id;if(!r||r.reason!=='predicted-leg-reach'||seenReleases.has(id))continue;seenReleases.add(id);releaseChecks++;
        const w=r.reachPrediction?.worldPrediction;if(!prior||!w||!prior.hips?.[heel.side]){fail('missing-world-prediction',{caseID,slot:a.slot,heel:heel.id});continue;}
        const measuredRoot=point(a,[0,0,prior.motor.rootDistance]),measuredHeading=a.yaw+prior.motor.rootDistance/radius,measuredHip=prior.hips[heel.side],d=sub(measuredHip,measuredRoot),offset=[d.reduce((s,x,i)=>s+x*right(measuredHeading)[i],0),d[1],d.reduce((s,x,i)=>s+x*forward(measuredHeading)[i],0)];
        const v=r.releaseSpeed,committed=m.seedCommitUntil!==null&&r.phase<m.seedCommitUntil-1e-9,next=committed?v:v+Math.max(-4.5*.02,Math.min(3.5*.02,m.targetSpeed-v)),futureDistance=r.rootDistance+(v+next)*.5*.02;
        const currentRoot=point(a,[0,0,r.rootDistance]),futureRoot=point(a,[0,0,futureDistance]),currentHeading=a.yaw+r.rootDistance/radius,futureHeading=a.yaw+futureDistance/radius;
        const hip=add(currentRoot,rotate(offset,currentHeading)),futureHip=add(futureRoot,rotate(offset,futureHeading)),anchor=point(a,heel.plannedAnchor),lift=(.10+.015*v)*smooth(.02/.06),ankle=add(anchor,[0,.08,0]),futureAnkle=add(ankle,[0,lift,0]);
        const currentReach=error(hip,ankle),predictedReach=error(futureHip,futureAnkle),rear=sub(hip,anchor).reduce((s,x,i)=>s+x*forward(currentHeading)[i],0),limit=.77-.01*smooth(v/1.6),age=r.time-prior.motor.clock;
        const numericError=Math.max(error(w.measurementRoot,measuredRoot),error(w.hipOffset,offset),error(w.rootWorld,currentRoot),error(w.futureRootWorld,futureRoot),error(w.hipWorld,hip),error(w.futureHipWorld,futureHip),error(w.anchorWorld,anchor),error(w.ankleWorld,ankle),error(w.futureAnkleWorld,futureAnkle),Math.abs(w.futureRootDistance-futureDistance));
        const reachError=Math.max(Math.abs(currentReach-r.reachPrediction.currentReach),Math.abs(predictedReach-r.reachPrediction.predictedReach)),hipError=error(w.measuredHip,measuredHip);
        maxima.worldPredictionMeters=Math.max(maxima.worldPredictionMeters,numericError);maxima.reportedReachMeters=Math.max(maxima.reportedReachMeters,reachError);maxima.measurementHipMeters=Math.max(maxima.measurementHipMeters,hipError);maxima.measurementAgeSeconds=Math.max(maxima.measurementAgeSeconds,age);
        if(numericError>1e-6||reachError>1e-6||hipError>1e-6||Math.abs(w.geometryMeasuredAt-prior.motor.clock)>1e-6||age< -1e-6||age>dt+1e-6||!(rear>0&&(currentReach>limit-1e-7||predictedReach>.772-1e-7)))fail('physical-world-release',{caseID,slot:a.slot,heel:heel.id,numericError,reachError,hipError,age,rear,currentReach,predictedReach,limit});
      }
      const request=(m.requests||[]).filter(r=>!r.superseded).at(-1);
      if(request){const id=key+':request:'+request.id;let check=requests.get(id);if(!check){check={caseID,slot:a.slot,id:request.id,targetSpeed:request.targetSpeed,at:request.at,deadline:request.deadline,stable:0,fulfilledAt:null,superseded:false};requests.set(id,check);}const speed=prior&&dt>0?error(a.world,prior.world)/dt:m.actualSpeed;const neutral=request.targetSpeed>0||Object.entries(m.feet).every(([side,f])=>{const sole=a.soles[side],delta=sub(sole,a.world),front=delta.reduce((s,x,i)=>s+x*forward(heading)[i],0),lateral=delta.reduce((s,x,i)=>s+x*right(heading)[i],0);return f.mode==='plant'&&Math.abs(front)<.015&&Math.abs(lateral-(side==='LeftFoot'?.1:-.1))<.015&&Math.abs(sole[1])<.003;});check.stable=Math.abs(m.actualSpeed-request.targetSpeed)<.01&&Math.abs(speed-request.targetSpeed)<.03&&neutral?check.stable+dt:0;if(check.stable>=.2&&check.fulfilledAt===null)check.fulfilledAt=m.clock;if(m.clock>check.deadline+1e-8&&check.fulfilledAt===null)fail('request-deadline',{...check});}
      for(const r of m.requests||[])if(r.superseded){const check=requests.get(key+':request:'+r.id);if(check)check.superseded=true;}
      previous.set(key,a);
    }
  }
  function finalize(){const coverage=[...caseSlots].map(([caseID,slots])=>{const headings=[...caseHeadings.get(caseID)].sort(([a],[b])=>a-b).map(([slot,yaw])=>({slot,yaw})),a=headings.filter(h=>h.slot<6).reduce((s,h)=>add(s,forward(h.yaw)),[0,0,0]),b=headings.filter(h=>h.slot>=6).reduce((s,h)=>add(s,forward(h.yaw)),[0,0,0]),opposingDot=a.reduce((s,x,i)=>s+x*b[i],0)/Math.max(1e-12,norm(a)*norm(b));return{caseID,slots:[...slots].sort((a,b)=>a-b),initialHeadings:headings,opposingDot,pass:slots.size===12&&opposingDot<0};});const pending=[...requests.values()].filter(r=>!r.superseded&&r.fulfilledAt===null);return{kind:'independent-circle-world-numeric-witness',pass:errors.length===0&&coverage.every(r=>r.pass)&&pending.length===0,radius,frames,actorSamples,releaseChecks,maxima,coverage,requests:[...requests.values()],pendingRequests:pending,errors,limits:{rootAndGeometryMeters:1e-6,plantMarkerMeters:.003,longitudinalAccelerationMps2:4.50001,observedTargetSpeedMps:.03,fulfillmentSeconds:4.5},limitations:['A complementary witness; full visible joint30rad/s, root-relative25m/s, anchor/near-floor3mm, world-foot orientation, full mesh floor, provenance and source clock/contact gates remain the responsibility of the shared independent pitch observer.','No production point-map helper is called. No actor state is mutated. No physical-phone FPS is inferred.']};}
  return{observe,finalize};
}
module.exports={createCurveAuditWitness};
