import {MotionPlayer, sample, expandedTransitions} from './animation.js';

// Fixed acceptance limits. Failures remain in the report and make the CLI fail.
export const limits = Object.freeze({supportMeters:.02,loopMeters:.001,transitionMeters:.001,rotationRadians:.01,floorMeters:.001,cpuMeanMs:1000/60});
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((s,v,i)=>s+v*b[i],0))));
export function difference(a,b,relative=false) {
  let meters=0,radians=0,bone='';
  for(const n of Object.keys(a.bones)) {
    const pa=relative?a.bones[n].map((v,i)=>v-a.bones.Root[i]):a.bones[n];
    const pb=relative?b.bones[n].map((v,i)=>v-b.bones.Root[i]):b.bones[n];
    const d=distance(pa,pb); if(d>meters){meters=d;bone=n;}
    radians=Math.max(radians,angle(a.rotations[n],b.rotations[n]));
  }
  return {meters,radians,bone};
}
const jumpPass = (d,limit)=>d.meters<=limit && d.radians<=limits.rotationRadians;
const frame=()=>new Promise(r=>requestAnimationFrame(r));
export async function runChecks({data,rig,render,character,game,onProgress=()=>{}}) {
  const clips=[],loops=[],transitions=[],supportFailures=[],floorFailures=[];
  let maxSupport=0,minY=Infinity,samples=0;
  // Negative controls alter the actual target skeleton, then read the same
  // rendered-world measurements as the production checks. They must be caught.
  const idle=sample(data.states.idle,0,false);
  const restore=()=>rig.apply(idle,{referenceRoot:idle.referenceRootTranslationMeters,contacts:idle.contacts,floor:true});
  const plantProbe=sample(data.states.run,0,false);
  rig.apply(plantProbe,{referenceRoot:plantProbe.referenceRootTranslationMeters,contacts:plantProbe.contacts,floor:true});
  rig.bones.LeftFoot.position.x+=.1;rig.update();
  const slipDetected=rig.snapshot().maxSupportErrorMeters>limits.supportMeters;
  const baseline=restore();
  restore();rig.bones.Root.position.y-=.1;rig.update();
  const penetrationDetected=rig.snapshot().minY < -limits.floorMeters;
  restore();rig.bones.LeftHand.position.x+=.05;rig.update();
  const openedLoopDetected=!jumpPass(difference(baseline,rig.snapshot(),true),limits.loopMeters);
  restore();rig.bones.Hips.position.x+=.05;rig.update();
  const transitionPopDetected=!jumpPass(difference(baseline,rig.snapshot()),limits.transitionMeters);
  restore();
  const negativeControls={pass:slipDetected&&penetrationDetected&&openedLoopDetected&&transitionPopDetected,slipDetected,penetrationDetected,openedLoopDetected,transitionPopDetected,injectionsMeters:{foot:.1,rootBelowFloor:.1,loopHand:.05,transitionHips:.05}};
  function inspect(s,where,contacts=[]) {
    samples++; minY=Math.min(minY,s.minY);
    if(s.minY < -limits.floorMeters && floorFailures.length<30) floorFailures.push({...where,minY:s.minY});
    maxSupport=Math.max(maxSupport,s.maxSupportErrorMeters);
    if(s.maxSupportErrorMeters>limits.supportMeters && supportFailures.length<30) supportFailures.push({...where,errorMeters:s.maxSupportErrorMeters,contacts:contacts.map(c=>c.bone)});
  }
  for(const [name,clip] of Object.entries(data.states)) {
    onProgress(`בודק קליפ ${name}`);
    let maxSlip=0,clipSupport=0,clipMin=Infinity;
    const anchors=new Map();
    const times=new Set([0,clip.durationSeconds,...clip.keyframes.map(k=>k.time*clip.durationSeconds),...(clip.supportContacts||[]).flatMap(c=>[c.startTime,c.endTime].map(t=>t*clip.durationSeconds))]);
    for(let t=0;t<clip.durationSeconds;t+=1/120) times.add(t);
    for(const time of [...times].sort((a,b)=>a-b)) {
      const pose=sample(clip,time,false);
      const s=rig.apply(pose,{referenceRoot:pose.referenceRootTranslationMeters,contacts:pose.contacts,floor:true});
      inspect(s,{clip:name,time},pose.contacts);
      clipSupport=Math.max(clipSupport,s.maxSupportErrorMeters); clipMin=Math.min(clipMin,s.minY);
      for(const c of pose.contacts) {
        if(c.weight<1-1e-9)continue;
        const id=c.contactKey || c.bone+':'+c.startTime;
        const p=s.feet[c.bone];
        if(!anchors.has(id)) anchors.set(id,p);
        const drift=c.mode==='ski-slide'?Math.abs(p[1]-anchors.get(id)[1]):distance(p,anchors.get(id));
        maxSlip=Math.max(maxSlip,drift);
      }
    }
    clips.push({clip:name,support:{pass:clipSupport<=limits.supportMeters && maxSlip<=limits.supportMeters,maxAnchorErrorMeters:clipSupport,maxSlipMeters:maxSlip,contactCount:clip.supportContacts.length},floor:{pass:clipMin>=-limits.floorMeters,minY:clipMin}});
    if(clip.loop) {
      const endpoints=[clip.durationSeconds,0].map(time=>{const p=sample(clip,time,false);return rig.apply(p,{referenceRoot:p.referenceRootTranslationMeters,contacts:p.contacts,floor:true});});
      const d=difference(endpoints[0],endpoints[1],true);
      // Also exercise an actual modulo wrap with advancing root reference.
      const p=new MotionPlayer(data,rig);p.reset(name,clip.durationSeconds-1e-5);const before=rig.snapshot();p.step(2e-5);const near=difference(before,rig.snapshot());
      loops.push({clip:name,pass:jumpPass(d,limits.loopMeters)&&jumpPass(near,limits.loopMeters),endpoint:d,acrossWrap:near});
    }
    await frame();
  }
  const edges=expandedTransitions(data);
  for(let index=0;index<edges.length;index++) {
    const edge=edges[index];onProgress(`בודק מעבר ${index+1}/${edges.length}`);
    for(const phase of [.19,.53,.91]) {
      const p=new MotionPlayer(data,rig);
      p.reset(edge.source,data.states[edge.source].durationSeconds*phase-1/120);p.step(1/120);
      const before=rig.snapshot();
      const actual=p.event(edge.on);
      if(!actual || actual.target!==edge.target) throw Error('State-machine edge was not exercised');
      p.step(1e-6); const entry=difference(before,rig.snapshot());
      let transitionMin=rig.snapshot().minY,transitionSupport=0,interior={meters:0,radians:0,bone:''};
      const duration=actual.visualBlendSeconds;
      const probeTimes=new Set();
      for(let time=1/120;time<duration-2e-6;time+=1/120)probeTimes.add(time);
      for(const c of data.states[edge.target].supportContacts)for(const time of [c.startTime*data.states[edge.target].durationSeconds-.06,c.startTime*data.states[edge.target].durationSeconds,c.endTime*data.states[edge.target].durationSeconds,c.endTime*data.states[edge.target].durationSeconds+.06])if(time>2e-6&&time<duration-2e-6)probeTimes.add(time);
      for(const time of [...probeTimes].sort((a,b)=>a-b)) {
        const dt=time-1e-6-(p.fade?.elapsed??duration);if(dt>0)p.step(dt);
        const prior=rig.snapshot();p.step(2e-6);const d=difference(prior,rig.snapshot());
        if(d.meters>interior.meters)interior={...d,radians:Math.max(interior.radians,d.radians)};else interior.radians=Math.max(interior.radians,d.radians);
        const s=rig.snapshot();inspect(s,{edge:`${edge.source}->${edge.target}`,phase,time:p.time},p.display.contacts);
        transitionMin=Math.min(transitionMin,s.minY);transitionSupport=Math.max(transitionSupport,s.maxSupportErrorMeters);
      }
      if(p.fade && p.fade.elapsed<duration-1e-6)p.step(duration-1e-6-p.fade.elapsed);
      const beforeExit=rig.snapshot();p.step(2e-6);const exit=difference(beforeExit,rig.snapshot());
      // Interrupt a live fade using reset, which must snapshot the displayed mix.
      p.reset(edge.source,data.states[edge.source].durationSeconds*phase);p.step(1/120);p.event(edge.on);p.step(duration*.37);
      const interruptBefore=rig.snapshot();p.event('reset');p.step(1e-6);const interrupted=difference(interruptBefore,rig.snapshot());
      transitions.push({source:edge.source,target:edge.target,event:edge.on,phase,visualBlendSeconds:duration,pass:[entry,exit,interior,interrupted].every(d=>jumpPass(d,limits.transitionMeters)),entry,exit,interior,interrupted,minY:transitionMin,maxSupportErrorMeters:transitionSupport});
    }
    if(index%3===0) await frame();
  }
  onProgress('מודד CPU במשך 100 פריימים');
  const p=new MotionPlayer(data,rig);p.reset('run');
  // Warm renderer/shaders before collecting exactly 100 real rendered frames.
  for(let i=0;i<10;i++){p.step(1/60);render();await frame();}
  const costs=[];
  for(let i=0;i<100;i++) {await frame();const start=performance.now();p.step(1/60);render();costs.push(performance.now()-start);}
  const sorted=[...costs].sort((a,b)=>a-b),mean=costs.reduce((a,b)=>a+b,0)/100;
  const proof=rig.proof();
  const checks={
    negativeControls,
    retarget:{pass:proof.sourceBoneCount===18 && proof.targetBoneCount===20 && proof.mappedBoneCount===18 && proof.extraBones.length===2 && proof.mappingComplete && proof.bindMaxTranslationErrorMeters<1e-5 && proof.bindMaxRotationErrorRadians<1e-4 && proof.bindMaxScaleError<1e-5 && proof.inverseBindMaxError<1e-5 && proof.calibrationMaxDirectionErrorRadians<1e-6 && proof.calibrationMaxBasisErrorRadians<1e-6 && proof.motionScaleError<1e-9,proof},
    support:{pass:clips.every(c=>c.support.pass)&&supportFailures.length===0,maxAnchorErrorMeters:maxSupport,clips:clips.map(c=>({clip:c.clip,...c.support})),failures:supportFailures},
    loop:{pass:loops.every(c=>c.pass),cases:loops},
    transition:{pass:transitions.every(c=>c.pass),edgeCount:edges.length,cases:transitions},
    floor:{pass:floorFailures.length===0,minY,samples,failures:floorFailures},
    cpu:{pass:mean<=limits.cpuMeanMs,frames:100,meanMs:mean,p95Ms:sorted[94],maxMs:sorted[99],samplesMs:costs,scope:'CPU synchronous sampling + retarget + IK + complete mesh floor scan + render submission; excludes RAF waiting and GPU completion'}
  };
  return {schemaVersion:1,character,game,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},limits,pass:Object.values(checks).every(c=>c.pass),checks};
}
