/** CC0-1.0. Acceptance measurements from delivered GLB float32 bytes.
 * Run: node verification/check.mjs [--validator /path/to/gltf-validator]
 * No source animation, author IK, browser mixer, decoder, or WebAssembly is used.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {canonical,names,identity,decode,poseAt,forward,worldAt,point,rootAt,ballAt,distance,horizontal,angleDegrees,sub} from './reader.mjs';

const base=new URL('../',import.meta.url),output=new URL('./',import.meta.url),require=createRequire(import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const rounded=value=>Number.isFinite(value)?Number(value.toFixed(9)):null;
const maximum=(values,fn=v=>v)=>values.reduce((value,item)=>Math.max(value,fn(item)??0),0);
const mean=values=>values.reduce((s,v)=>s+v,0)/(values.length||1);
const demand=(ok,message)=>{if(!ok)throw Error(message);};
export const limits={sampleHz:120,footSlidingM:.02,anchorErrorM:.02,maxSolePenetrationM:.01,inferredGroundHeightM:.0015,inferredFlatHeightSpanM:.004,inferredMinContactSeconds:.05,jumpAirborneSoleHeightM:.02,maxOrdinaryJumpFlightSeconds:.75,eventPositionM:.005,groundEventHeightM:.025,ballSurfaceErrorM:.01,rateErrorPercent:5,boundaryPositionM:.02,boundaryRotationDeg:1,boundaryVelocityMps:.5,validatorErrors:0};
const ticks=(start,end,hz=120)=>{const values=[start,end];for(let i=Math.ceil(start*hz);i/hz<end;i++)values.push(i/hz);return [...new Set(values)].sort((a,b)=>a-b);};
const eventType=e=>e.event??e.type;
const wrap=(time,duration)=>((time%duration)+duration)%duration;

function supportMeasure(data,meta,support){
 const times=ticks(support.start,support.end),locals=[[0,-.08,0],[0,-.08,.12],[0,-.08,-.06]],paths=locals.map(()=>[]),native=[];
 let anchorErrorM=0,verticalErrorM=0;
 for(const time of times){
  const w=worldAt(data,meta,time);for(let i=0;i<locals.length;i++)paths[i].push(point(w,support.bone,locals[i]));
  native.push(point(forward(poseAt(data,time)),support.bone,locals[0]));
  anchorErrorM=Math.max(anchorErrorM,distance(paths[0].at(-1),support.anchor));verticalErrorM=Math.max(verticalErrorM,Math.abs(paths[0].at(-1)[1]-support.anchor[1]));
 }
 const excursion=points=>{let result=0;for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)result=Math.max(result,horizontal(points[i],points[j]));return result;};
 const sliding=paths.map(excursion);
 return {bone:support.bone,start:support.start,end:support.end,duration:rounded(support.end-support.start),samples:times.length,centerSlidingM:rounded(sliding[0]),toeSlidingM:rounded(sliding[1]),heelSlidingM:rounded(sliding[2]),maxSlidingM:rounded(Math.max(...sliding)),anchorErrorM:rounded(anchorErrorM),verticalErrorM:rounded(verticalErrorM),nativeInPlaceCenterExcursionM:rounded(excursion(native))};
}

/** Infer sustained flat sole contact from the decoded geometry, independently
 * of author-declared support windows. Intentional slide tackles retain these
 * measurements but their sliding contact is not a planted-foot constraint.
 */
function inferredGroundContacts(data,meta){
 const result=[],times=ticks(0,data.duration);
 for(const bone of ['LeftFoot','RightFoot']){
  let active=[];
  const finish=()=>{
   if(active.length>=2&&active.at(-1).time-active[0].time>=limits.inferredMinContactSeconds-1e-8){
    let sliding=0;for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++)sliding=Math.max(sliding,horizontal(active[i].position,active[j].position));
    const covered=active.filter(sample=>(meta.supports??[]).some(s=>s.bone===bone&&sample.time>=s.start-1e-8&&sample.time<=s.end+1e-8)).length;
    result.push({bone,start:rounded(active[0].time),end:rounded(active.at(-1).time),duration:rounded(active.at(-1).time-active[0].time),samples:active.length,slidingM:rounded(sliding),declaredCoverageFraction:rounded(covered/active.length),intentionalSlide:/^tackle_slide_/.test(meta.id)});
   }
   active=[];
  };
  for(const time of times){
   const w=worldAt(data,meta,time),center=point(w,bone,[0,-.08,0]),toe=point(w,bone,[0,-.08,.12]),heel=point(w,bone,[0,-.08,-.06]);
   const flat=Math.max(center[1],toe[1],heel[1])-Math.min(center[1],toe[1],heel[1])<=limits.inferredFlatHeightSpanM,grounded=Math.abs(center[1])<=limits.inferredGroundHeightM;
   if(flat&&grounded)active.push({time,position:center});else finish();
  }
  finish();
 }
 return result;
}

function jumpMeasure(data,meta,inferred){
 const times=ticks(0,data.duration),intervals=[];let active=[],peakHips=-Infinity,troughHips=Infinity;
 const finish=()=>{if(active.length){intervals.push({start:active[0],end:active.at(-1),duration:rounded(active.at(-1)-active[0]+1/limits.sampleHz)});active=[];}};
 for(const time of times){
  const world=worldAt(data,meta,time),heights=['LeftFoot','RightFoot'].map(bone=>Math.min(...[[0,-.08,0],[0,-.08,.12],[0,-.08,-.06]].map(local=>point(world,bone,local)[1])));
  peakHips=Math.max(peakHips,world.Hips.position[1]);troughHips=Math.min(troughHips,world.Hips.position[1]);
  if(heights.every(height=>height>limits.jumpAirborneSoleHeightM))active.push(time);else finish();
 }
 finish();
 const initial=worldAt(data,meta,0).Hips.position[1],rise=Math.max(0,peakHips-initial),expected=2*Math.sqrt(2*rise/9.81),largest=maximum(intervals,item=>item.duration);
 const edges=intervals.flatMap(interval=>['LeftFoot','RightFoot'].map(bone=>{
  const before=[...inferred].filter(contact=>contact.bone===bone&&contact.end<=interval.start+.01).sort((a,b)=>b.end-a.end)[0],after=inferred.filter(contact=>contact.bone===bone&&contact.start>=interval.end-.01).sort((a,b)=>a.start-b.start)[0];
  const preSupport=[...(meta.supports??[])].filter(support=>support.bone===bone&&support.end<=interval.start+.01).sort((a,b)=>b.end-a.end)[0],postSupport=(meta.supports??[]).filter(support=>support.bone===bone&&support.start>=interval.end-.01).sort((a,b)=>a.start-b.start)[0];
  const preTime=before?.end??Math.max(0,interval.start-1/30),postTime=after?.start??Math.min(data.duration,interval.end+1/30),prePoint=point(worldAt(data,meta,preTime),bone,[0,-.08,0]),postPoint=point(worldAt(data,meta,postTime),bone,[0,-.08,0]);
  return {bone,flightStart:interval.start,flightEnd:interval.end,groundBeforeTime:before?.end??null,groundAfterTime:after?.start??null,groundBeforeGapSeconds:before?rounded(interval.start-before.end):null,groundAfterGapSeconds:after?rounded(after.start-interval.end):null,takeoffAnchorErrorM:preSupport?rounded(horizontal(prePoint,preSupport.anchor)):null,landingAnchorErrorM:postSupport?rounded(horizontal(postPoint,postSupport.anchor)):null};
 }));
 return {definition:'Both delivered sole center/toe/heel minima exceed 2 cm; consecutive 120 Hz samples. Gravity estimate is descriptive because a bent-leg pose shifts sole height independently of the center of mass.',intervals,maxFlightSeconds:rounded(largest),hipsEntryY:rounded(initial),hipsPeakY:rounded(peakHips),hipsTroughY:rounded(troughHips),hipsRiseFromEntryM:rounded(rise),nominalBallisticFlightSeconds:rounded(expected),durationVsBallisticEstimatePercent:expected?rounded((largest-expected)/expected*100):null,groundEdges:edges};
}

function boundaryMeasure(data,definition,edge,reference){
 const time=edge==='entry'?0:data.duration,sign=edge==='entry'?1:-1,step=1/30,phase=definition.phase??0;
 const rtime=Math.abs(phase-reference.duration)<1e-7?reference.duration:wrap(phase,reference.duration);
 const next=wrap(phase+sign*step,reference.duration),p=poseAt(data,time),r=poseAt(reference,rtime),pw=forward(p),rw=forward(r),pn=forward(poseAt(data,time+sign*step)),rn=forward(poseAt(reference,next));
 const velocity=maximum(names,name=>distance(sub(pn[name].position,pw[name].position).map(v=>v/step),sub(rn[name].position,rw[name].position).map(v=>v/step)));
 return {phase:rounded(phase),maxJointM:rounded(maximum(names,name=>distance(pw[name].position,rw[name].position))),hipsM:rounded(distance(p.hips,r.hips)),maxLocalRotationDeg:rounded(maximum(names,name=>angleDegrees(p.rotations[name],r.rotations[name]))),maxJointVelocityErrorMps:rounded(velocity)};
}

function cadenceMeasure(data,meta){
 if(!meta.cadence)return null;
 const cadence=meta.cadence,fps=meta.nativeRate??30,start=cadence.window?.start??0,end=cadence.window?.end??data.duration,within=e=>e.time>=start-1e-8&&e.time<=end+1e-8,touches=(meta.events??[]).filter(e=>e.ballContact===true&&within(e)),steps=(meta.events??[]).filter(e=>eventType(e)==='plant'&&within(e));
 const frequencies=list=>list.slice(1).map((value,index)=>1/(value-list[index]));
 const touchTimes=touches.map(e=>e.time).sort((a,b)=>a-b),stepTimes=steps.map(e=>e.time).sort((a,b)=>a-b);
 const touchHz=frequencies(touchTimes),stepHz=frequencies(stepTimes),error=(values,target)=>maximum(values,v=>Math.abs(v-target)/target*100);
 const path=meta.referenceRootMotion?.samples??[],speeds=path.slice(1).map((sample,index)=>({speed:horizontal(sample.position,path[index].position)/(sample.time-path[index].time),time:(sample.time+path[index].time)/2})),central=speeds.filter(sample=>sample.time>=Math.max(start,.2)&&sample.time<=Math.min(end,data.duration-.2)).map(sample=>sample.speed).sort((a,b)=>a-b),median=central.length?central[(central.length-1)>>1]:NaN;
 const speedTarget=cadence.targetSpeedMps??meta.targetSpeedMps??meta.metricsTargets?.speedMps;
 const physicalSteps=steps.map(event=>{
  const support=(meta.supports??[]).find(s=>s.bone===event.bone&&event.time>=s.start-1e-8&&event.time<=s.end+1e-8),position=point(worldAt(data,meta,event.time),event.bone,[0,-.08,0]),sampleEnd=Math.min(support?.end??event.time,event.time+.025),after=point(worldAt(data,meta,sampleEnd),event.bone,[0,-.08,0]);
  return {frame:event.frame,bone:event.bone,soleHeightM:rounded(position[1]),supportDuration:rounded(support?support.end-support.start:0),speedMps:sampleEnd>event.time?rounded(distance(position,after)/(sampleEnd-event.time)):null};
 });
 const swings=[];
 for(const bone of ['LeftFoot','RightFoot']){
  const same=steps.filter(event=>event.bone===bone);
  for(let i=1;i<same.length;i++){
   const a=same[i-1],b=same[i],firstSupport=(meta.supports??[]).find(s=>s.bone===bone&&a.time>=s.start-1e-8&&a.time<=s.end+1e-8),begin=firstSupport?.end??a.time;
   const heights=ticks(begin,b.time).map(time=>point(worldAt(data,meta,time),bone,[0,-.08,0])[1]);
   const aPosition=point(worldAt(data,meta,a.time),bone,[0,-.08,0]),bPosition=point(worldAt(data,meta,b.time),bone,[0,-.08,0]);
   swings.push({bone,fromFrame:a.frame,toFrame:b.frame,maxSoleHeightM:rounded(Math.max(...heights)),stepTravelM:rounded(horizontal(aPosition,bPosition))});
  }
 }
 return {window:{start,end},targetStepHz:cadence.targetStepHz,targetTouchHz:cadence.targetTouchHz,targetSpeedMps:speedTarget??null,touchFrames:touches.map(e=>e.frame),plantFrames:steps.map(e=>e.frame),touches:touches.length,plants:steps.length,physicalSteps,swings,alternatingFeet:steps.every((step,index)=>index===0||step.bone!==steps[index-1].bone),measuredTouchHz:rounded(mean(touchHz)),measuredStepHz:rounded(mean(stepHz)),touchRateErrorPercent:rounded(error(touchHz,cadence.targetTouchHz)),stepRateErrorPercent:rounded(error(stepHz,cadence.targetStepHz)),meanPathSpeedMps:rounded(mean(speeds.map(sample=>sample.speed))),medianPathSpeedMps:rounded(median),speedErrorPercent:speedTarget?rounded(Math.abs(median-speedTarget)/speedTarget*100):null,everyStepHasTouch:stepTimes.every(time=>touchTimes.some(t=>Math.abs(t-time)<=1/fps+1e-8)),plantsMatchSupportWindows:steps.every(event=>(meta.supports??[]).some(s=>s.bone===event.bone&&Math.abs(s.start-event.time)<=1/fps+1e-8)),declaredTouchFramesMatch:!cadence.touchFrames||JSON.stringify(cadence.touchFrames)===JSON.stringify(touches.map(e=>e.frame)),declaredStepFramesMatch:!cadence.stepFrames||JSON.stringify(cadence.stepFrames)===JSON.stringify(steps.map(e=>e.frame))};
}

export function measure(data,meta,references){
 const row={id:meta.id,category:meta.category,duration:rounded(data.duration),frames:data.tracks.Hips?.translation?.times.length??0,failures:[]};
 const check=(ok,code,details)=>{if(!ok)row.failures.push({code,...(details===undefined?{}:{details})});};
 const {json,tracks}=data,fps=meta.nativeRate??30,extensions=[...(json.extensionsUsed??[]),...(json.extensionsRequired??[])];
 check(!extensions.some(s=>/draco|meshopt/i.test(s))&&!/draco|meshopt/i.test(JSON.stringify(json.meshes)),'no-codec-extension',extensions);
 check((json.images??[]).every(image=>image.bufferView!==undefined&&!image.uri),'embedded-images');
 const joints=[...new Set((json.skins??[]).flatMap(skin=>skin.joints.map(index=>json.nodes[index].name)))];row.boneCount=joints.length;
 check(joints.length===18&&names.every(name=>joints.includes(name)),'canonical-joints',joints);
 for(const bone of canonical){
  const node=json.nodes.find(node=>node.name===bone.name),index=json.nodes.indexOf(node),parent=json.nodes.find(node=>node.children?.includes(index));
  check(!!node,'bone-present',bone.name);if(!node)continue;
  check(distance(node.translation??[0,0,0],bone.rest)<1e-6,'canonical-rest',bone.name);
  check(bone.name==='Root'||parent?.name===bone.parent,'canonical-parent',bone.name);
  check(!node.matrix&&distance(node.scale??[1,1,1],[1,1,1])<1e-6,'canonical-scale',bone.name);
 }
 check(json.animations.length===1&&json.animations[0].name===meta.id,'single-native-clip');
 check(names.every(name=>tracks[name]?.rotation),'canonical-rotation-tracks');
 check(meta.frameCount===Math.round(meta.duration*fps)+1&&row.frames===meta.frameCount,'frame-count',{actual:row.frames,declared:meta.frameCount});
 let rateError=0,gridError=0,normError=0;
 for(const [name,paths] of Object.entries(tracks))for(const [kind,track] of Object.entries(paths)){
  check(track.interpolation==='LINEAR','linear-track',{name,kind});check(track.times.length===row.frames,'equal-track-length',{name,kind});
  for(let i=0;i<track.times.length;i++){
   gridError=Math.max(gridError,Math.abs(track.times[i]-i/fps));if(i)rateError=Math.max(rateError,Math.abs(1/(track.times[i]-track.times[i-1])-fps)/fps*100);
   check(track.values[i].every(Number.isFinite),'finite-track',{name,kind,frame:i});if(kind==='rotation')normError=Math.max(normError,Math.abs(Math.hypot(...track.values[i])-1));
  }
 }
 row.rateErrorPercent=rounded(rateError);row.maxGridErrorSeconds=rounded(gridError);row.maxQuaternionNormError=rounded(normError);
 row.durationErrorPercent=rounded(Math.abs(data.duration-(meta.timing?.durationSeconds??meta.duration))/meta.duration*100);
 check(rateError<=limits.rateErrorPercent,'native-rate',rateError);check(row.durationErrorPercent<=limits.rateErrorPercent,'duration-rate',row.durationErrorPercent);check(normError<2e-6,'unit-quaternions',normError);
 check(Math.abs(data.duration-meta.duration)<2e-6,'decoded-duration',data.duration);
 check(meta.rootMotion===false,'extracted-root-contract',meta.rootMotion);
 check(meta.referenceRootMotion?.mode==='reference-only','reference-path-mode');
 check(!tracks.Root?.translation&&!tracks.Root?.scale,'no-root-translation-or-scale');
 check((tracks.Root?.rotation?.values??[]).every(value=>angleDegrees(value,identity)<.001),'identity-root-track');
 check(!json.extras?.referenceRootMotion&&!json.animations[0].extras?.referenceRootMotion,'no-double-trajectory');
 check((meta.supports??[]).length>0,'declared-supports');
 row.supports=[];
 for(const support of meta.supports??[]){
  const valid=['LeftFoot','RightFoot'].includes(support.bone)&&Number.isFinite(support.start)&&Number.isFinite(support.end)&&support.start>=0&&support.end<=meta.duration+1e-8&&support.end>support.start&&support.anchor?.length===3;
  check(valid,'valid-support-window',support);if(valid)row.supports.push(supportMeasure(data,meta,support));
 }
 row.maxSlidingM=maximum(row.supports,item=>item.maxSlidingM);row.maxAnchorErrorM=maximum(row.supports,item=>item.anchorErrorM);
 row.totalSupportSeconds=rounded(row.supports.reduce((sum,item)=>sum+item.duration,0));
 const unionLength=windows=>{const sorted=windows.map(s=>[s.start,s.end]).sort((a,b)=>a[0]-b[0]);let total=0,end=-Infinity;for(const [a,b] of sorted){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total;};
 row.supportCoverage={anyFootFraction:rounded(unionLength(row.supports)/meta.duration),leftFootFraction:rounded(unionLength(row.supports.filter(s=>s.bone==='LeftFoot'))/meta.duration),rightFootFraction:rounded(unionLength(row.supports.filter(s=>s.bone==='RightFoot'))/meta.duration)};
 row.inferredGroundContacts=inferredGroundContacts(data,meta);
 for(const contact of row.inferredGroundContacts)if(!contact.intentionalSlide)check(contact.slidingM<=limits.footSlidingM,'inferred-ground-sliding',contact);
 check(row.totalSupportSeconds>=.05,'nontrivial-support-duration',row.totalSupportSeconds);
 check(row.maxSlidingM<=limits.footSlidingM,'foot-sliding',row.maxSlidingM);check(row.maxAnchorErrorM<=limits.anchorErrorM,'plant-anchor',row.maxAnchorErrorM);
 row.entry={};row.exit={};
 for(const edge of ['entry','exit']){
  const definition=meta[edge];check(!!definition,'boundary-definition',edge);if(!definition)continue;
  const semantic=definition.reference.replace(/^v(?:9|10)_/,'');
  for(const version of ['v9','v10']){
   const id=`${version}_${semantic}`,reference=references[id];check(!!reference,'legacy-reference-present',id);if(!reference)continue;
   row[edge][version]={reference:id,...boundaryMeasure(data,definition,edge,reference)};
  }
  const primary=row[edge].v10;
  if(primary){check(primary.maxJointM<=limits.boundaryPositionM,'v10-boundary-position',{edge,...primary});check(primary.maxLocalRotationDeg<=limits.boundaryRotationDeg,'v10-boundary-rotation',{edge,...primary});check(primary.maxJointVelocityErrorMps<=limits.boundaryVelocityMps,'v10-boundary-velocity',{edge,...primary});}
 }
 const first=poseAt(data,0),last=poseAt(data,data.duration),firstWorld=forward(first),lastWorld=forward(last);
 row.loopSeam={maxJointM:rounded(maximum(names,name=>distance(firstWorld[name].position,lastWorld[name].position))),maxRotationDeg:rounded(maximum(names,name=>angleDegrees(first.rotations[name],last.rotations[name])))};
 if(meta.loop){check(row.loopSeam.maxJointM<=limits.boundaryPositionM,'loop-position',row.loopSeam);check(row.loopSeam.maxRotationDeg<=limits.boundaryRotationDeg,'loop-rotation',row.loopSeam);}
 let minFootY=Infinity,maxBodyHeight=0;
 for(const time of ticks(0,data.duration)){
  const w=worldAt(data,meta,time);for(const bone of ['LeftFoot','RightFoot'])for(const local of [[0,-.08,0],[0,-.08,.12],[0,-.08,-.06]])minFootY=Math.min(minFootY,point(w,bone,local)[1]);
  maxBodyHeight=Math.max(maxBodyHeight,w.Head.position[1]);
 }
 row.minSoleHeightM=rounded(minFootY);row.maximumSolePenetrationM=rounded(Math.max(0,-minFootY));row.maximumHeadHeightM=rounded(maxBodyHeight);
 check(minFootY>=-limits.maxSolePenetrationM,'sole-floor-penetration',row.minSoleHeightM);
 if(/^(header_(jumping|defensive|attacking)|set_wall|celebrate_(player|team))$/.test(meta.id)){
  row.jump=jumpMeasure(data,meta,row.inferredGroundContacts);
  check(row.jump.maxFlightSeconds>0&&row.jump.maxFlightSeconds<=limits.maxOrdinaryJumpFlightSeconds,'ordinary-jump-flight-duration',row.jump);
  for(const edge of row.jump.groundEdges){check(edge.groundBeforeGapSeconds!==null&&edge.groundBeforeGapSeconds<=.2&&edge.groundAfterGapSeconds!==null&&edge.groundAfterGapSeconds<=.2,'jump-grounded-takeoff-landing',edge);check(edge.takeoffAnchorErrorM!==null&&edge.takeoffAnchorErrorM<=limits.anchorErrorM&&edge.landingAnchorErrorM!==null&&edge.landingAnchorErrorM<=limits.anchorErrorM,'jump-ground-anchor',edge);}
 }
 row.events=[];
 const ballKeys=meta.ball?.samples??meta.ball?.keys;
 if(ballKeys?.length){let minimum=Infinity;for(const time of ticks(0,data.duration)){const ball=ballAt(meta,time);check(ball.every(Number.isFinite),'finite-ball');minimum=Math.min(minimum,ball[1]);}row.ball={radius:meta.ball.radius,samples:ballKeys.length,minCenterY:rounded(minimum),floorPenetrationM:rounded(Math.max(0,meta.ball.radius-minimum))};check(row.ball.floorPenetrationM<=.001,'ball-floor-penetration',row.ball);}
 check((meta.events??[]).length>0,'contact-event-present');
 for(const event of meta.events??[]){
  check(Number.isInteger(event.frame)&&event.frame>=0&&event.frame<=meta.frameCount-1&&Math.abs(event.time-event.frame/fps)<1e-8,'event-frame',event);
  check(typeof event.ballContact==='boolean','truthful-contact-kind',eventType(event));
  const item={event:eventType(event),frame:event.frame,time:event.time,bone:event.bone,ballContact:event.ballContact};row.events.push(item);
  const physical=names.includes(event.bone)&&event.local?.length===3&&event.position?.length===3;
  check(physical,'contact-effector',item);if(!physical)continue;
  const actual=point(worldAt(data,meta,event.time),event.bone,event.local);
  item.actualPosition=actual.map(rounded);
  item.contactErrorM=rounded(distance(actual,event.position));check(item.contactErrorM<=limits.eventPositionM,'event-position',item);
  if(eventType(event)==='plant'||event.contactKind==='ground'||event.type==='ground_contact'){
   item.contactHeightM=rounded(actual[1]);check(Math.abs(actual[1])<=limits.groundEventHeightM,'ground-contact-height',item);
   if(eventType(event)==='plant')check((meta.supports??[]).some(s=>s.bone===event.bone&&event.time>=s.start-1e-8&&event.time<=s.end+1e-8&&s.end-s.start>=1/fps-1e-8),'plant-event-has-support',item);
  }
  if(event.ballContact){
   check(event.bone!=='Root','ball-contact-real-effector',item);const ball=ballAt(meta,event.time);check(!!ball,'ball-samples-present',item);
   if(ball){item.ballSurfaceErrorM=rounded(Math.abs(distance(actual,ball)-meta.ball.radius));check(item.ballSurfaceErrorM<=limits.ballSurfaceErrorM,'ball-surface-contact',item);
    if(Number.isFinite(event.distanceMeters)){item.declaredDistanceM=event.distanceMeters;item.measuredDistanceM=rounded(horizontal(ball,ballKeys.at(-1).position));item.distanceErrorM=rounded(Math.abs(item.declaredDistanceM-item.measuredDistanceM));check(item.distanceErrorM<=.02,'event-distance',item);}
   }
  }else if(Number.isFinite(event.contactGapMeters)&&ballKeys?.length){item.measuredGapM=rounded(distance(actual,ballAt(meta,event.time))-meta.ball.radius);check(item.measuredGapM>=.1,'miss-does-not-contact-ball',item);}
 }
 const primary=meta.event??meta.events?.find(event=>event.ballContact)??meta.events?.[0];check(!!primary&&Number.isInteger(meta.contactFrame),'primary-contact-frame');
 if(primary)check(meta.contactFrame===primary.frame,'primary-frame-consistency',{primary:primary.frame,contactFrame:meta.contactFrame});
 if(meta.category==='pass'||/^pass_/.test(meta.id))check(row.events.some(event=>event.ballContact&&Number.isFinite(event.declaredDistanceM)&&event.declaredDistanceM>0),'pass-kick-and-distance');
 row.cadence=cadenceMeasure(data,meta);
 if(/^dribble_(slow|medium|sprint)$/.test(meta.id)){
  check(!!row.cadence,'dribble-cadence-contract');const cadence=row.cadence;
  if(cadence){check(cadence.touches>=2&&cadence.plants>=2,'dribble-two-steps',cadence);check(cadence.touchRateErrorPercent<=5&&cadence.stepRateErrorPercent<=5,'dribble-cadence-rate',cadence);check(cadence.everyStepHasTouch&&cadence.plantsMatchSupportWindows&&cadence.declaredTouchFramesMatch&&cadence.declaredStepFramesMatch,'dribble-touch-every-step',cadence);check(cadence.speedErrorPercent!==null&&cadence.speedErrorPercent<=5,'dribble-path-speed',cadence);check(cadence.alternatingFeet&&cadence.physicalSteps.every(step=>Math.abs(step.soleHeightM)<=.025&&step.supportDuration>=1/fps-1e-8&&step.speedMps!==null&&step.speedMps<=.3),'dribble-physical-plants',cadence.physicalSteps);check(cadence.swings.length>=2&&cadence.swings.every(swing=>swing.maxSoleHeightM>=.03&&swing.stepTravelM>=.1),'dribble-real-foot-swings',cadence.swings);}
 }
 row.pass=row.failures.length===0;return row;
}

function coverage(clips,rows){
 const ids=clips.map(clip=>clip.id),has=pattern=>ids.some(id=>pattern.test(id));
 const requirements={
  dribble_slow:/^dribble_slow$/,dribble_medium:/^dribble_medium$/,dribble_sprint:/^dribble_sprint$/,ball_turn_left:/(turn_ball|ball_turn|ball_spin|dribble_turn).*left/,ball_turn_right:/(turn_ball|ball_turn|ball_spin|dribble_turn).*right/,feint_left:/feint.*left/,feint_right:/feint.*right/,shield_left:/shield.*left/,shield_right:/shield.*right/,
  lofted_pass:/pass.*(loft|air)/,cross:/cross/,through_pass:/pass.*through|through.*pass/,power_shot:/shot.*power|power.*shot/,curled_shot:/shot.*(curl|curve)/,lob_shot:/shot.*(lob|chip)/,volley:/volley/,chest_first_time:/chest.*first|first.*chest|shot.*chest/,
  standing_tackle_clean:/tackle.*(stand|standing).*clean/,standing_tackle_miss:/tackle.*(stand|standing).*miss/,slide_tackle_clean:/tackle.*slide.*clean/,slide_tackle_miss:/tackle.*slide.*miss/,interception:/intercept/,light_collision:/collision/,
  standing_header:/header.*stand/,jump_header:/header.*jump/,defensive_header:/header.*defen/,attacking_header:/header.*attack/,
  throw_in:/throw_in/,corner:/corner/,free_kick:/free_kick/,penalty:/penalty/,wall_set:/wall/,
  keeper_parry:/(keeper|goalkeeper).*parry/,keeper_rush:/(keeper|goalkeeper).*rush/,keeper_dive:/(keeper|goalkeeper).*dive/,keeper_after_goal:/(keeper|goalkeeper).*after_goal/,individual_celebration:/celebrat.*(player|individual|solo)/,team_celebration:/celebrat.*team/
 };
 const checks=Object.entries(requirements).map(([requirement,pattern])=>({requirement,pass:has(pattern),matched:ids.filter(id=>pattern.test(id))}));
 const ground=clips.filter(clip=>/^pass_ground_/.test(clip.id)),catches=clips.filter(clip=>/(keeper|goalkeeper)_catch_/.test(clip.id)),degrees=(x,y)=>(Math.atan2(x,y)*180/Math.PI+360)%360,angleError=(a,b)=>Math.abs(((a-b+540)%360)-180);
 const passDirections=ground.map(clip=>{const event=clip.event??clip.events.find(e=>e.ballContact),start=ballAt(clip,event.time),end=(clip.ball.samples??clip.ball.keys).at(-1).position,actual=degrees(end[0]-start[0],end[2]-start[2]),expected=Number(clip.id.split('_').at(-1));return {id:clip.id,expectedDegrees:expected,actualDegrees:rounded(actual),errorDegrees:rounded(angleError(actual,expected)),sector:Math.round(actual/45)%8};});
 checks.push({requirement:'ground_pass_eight_directions',pass:passDirections.length===8&&new Set(passDirections.map(item=>item.sector)).size===8&&passDirections.every(item=>item.errorDegrees<=1),matched:passDirections});
 const catchPoints=catches.map(clip=>({id:clip.id,position:rows.find(row=>row.id===clip.id)?.events.find(event=>event.ballContact)?.actualPosition})),valid=catchPoints.every(item=>item.position?.length===3),center=valid?[mean(catchPoints.map(item=>item.position[0])),mean(catchPoints.map(item=>item.position[1]))]:[0,0],catchExpected={up:0,up_left:45,left:90,down_left:135,down:180,down_right:225,right:270,up_right:315};
 const catchDirections=valid?catchPoints.map(item=>{const expected=catchExpected[item.id.replace(/^(?:goal)?keeper_catch_/,'')],actual=degrees(item.position[0]-center[0],item.position[1]-center[1]);return {id:item.id,expectedDegrees:expected,actualDegrees:rounded(actual),errorDegrees:rounded(angleError(actual,expected)),sector:Math.round(actual/45)%8};}):[];
 const xExtent=valid?Math.max(...catchPoints.map(item=>item.position[0]))-Math.min(...catchPoints.map(item=>item.position[0])):0,yExtent=valid?Math.max(...catchPoints.map(item=>item.position[1]))-Math.min(...catchPoints.map(item=>item.position[1])):0;
 checks.push({requirement:'keeper_catch_eight_directions',pass:catchDirections.length===8&&new Set(catchDirections.map(item=>item.sector)).size===8&&catchDirections.every(item=>item.errorDegrees<=22.5)&&xExtent>=.35&&yExtent>=.5,matched:catchDirections,contactSpreadM:{horizontal:rounded(xExtent),vertical:rounded(yExtent)}});
 const team=clips.find(clip=>/celebrat.*team/.test(clip.id));checks.push({requirement:'team_has_multiple_participants',pass:(team?.actors?.length??0)>=2,matched:team?.actors??[]});
 return {checks,pass:checks.every(check=>check.pass)};
}

async function walk(directory){const result=[];for(const item of await fs.readdir(directory,{withFileTypes:true})){const url=new URL(`${item.name}${item.isDirectory()?'/':''}`,directory);if(item.isDirectory())result.push(...await walk(url));else result.push(url);}return result;}
async function validate(validator,url,bytes){
 const result=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(fileURLToPath(url)),maxIssues:1000,externalResourceFunction:()=>Promise.reject(Error('External resources forbidden'))});
 return {asset:path.relative(fileURLToPath(base),fileURLToPath(url)),sha256:hash(bytes),bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,messages:result.issues.messages};
}
export async function run(){
 const initial=await fs.readFile(new URL('runtime/catalog.json',base)),catalog=JSON.parse(initial),references={},referenceEvidence=[];
 const validatorIndex=process.argv.indexOf('--validator'),validator=require(validatorIndex<0?path.join(process.env.V11_TOOLS??'/tmp/soccer-v11-tools','node_modules/gltf-validator'):process.argv[validatorIndex+1]);
 const validation=[],rows=[],files=await walk(new URL('runtime/',base));
 const byteMap=new Map();
 for(const url of files.filter(url=>url.pathname.endsWith('.glb'))){const bytes=await fs.readFile(url);byteMap.set(fileURLToPath(url),bytes);validation.push(await validate(validator,url,bytes));if(url.pathname.includes('/reference/')){const id=path.basename(fileURLToPath(url),'.glb');references[id]=decode(bytes);referenceEvidence.push({id,sha256:hash(bytes),bytes:bytes.length});}}
 for(const meta of catalog.clips){
  try{
   demand(/^[a-z0-9_]+$/.test(meta.id),'Unsafe clip ID');demand(typeof meta.asset==='string'&&!meta.asset.includes('..')&&!meta.asset.startsWith('/'),'Unsafe clip asset');
   const url=new URL(`runtime/${meta.asset}`,base),bytes=byteMap.get(fileURLToPath(url));demand(bytes,`Clip file not loaded: ${meta.asset}`);
   const row=measure(decode(bytes),meta,references);row.asset=meta.asset;row.bytes=bytes.length;row.sha256=hash(bytes);
   if(row.sha256!==meta.sha256||row.bytes!==meta.bytes){row.failures.push({code:'catalog-file-integrity',details:{expectedSha256:meta.sha256,expectedBytes:meta.bytes}});row.pass=false;}
   rows.push(row);console.log(`${row.pass?'PASS':'FAIL'} ${meta.id}: plant=${(row.maxSlidingM*100).toFixed(4)}cm rate=${row.rateErrorPercent}% ${row.failures.length?JSON.stringify(row.failures):''}`);
  }catch(error){rows.push({id:meta.id,pass:false,failures:[{code:'decode-or-measure',details:error.message}]});console.error(`FAIL ${meta.id}: ${error.stack}`);}
 }
 const stable=hash(initial)===hash(await fs.readFile(new URL('runtime/catalog.json',base))),coverageReport=coverage(catalog.clips,rows);
 const summary={clips:rows.length,passed:rows.filter(row=>row.pass).length,glbFilesLoaded:validation.length,referenceFiles:referenceEvidence.length,maxSlidingM:maximum(rows,row=>row.maxSlidingM),maxInferredSlidingM:maximum(rows,row=>maximum((row.inferredGroundContacts??[]).filter(contact=>!contact.intentionalSlide),contact=>contact.slidingM)),maxSolePenetrationM:maximum(rows,row=>row.maximumSolePenetrationM),maxOrdinaryJumpFlightSeconds:maximum(rows,row=>row.jump?.maxFlightSeconds),maxJumpHipsRiseM:maximum(rows,row=>row.jump?.hipsRiseFromEntryM),maxAnchorErrorM:maximum(rows,row=>row.maxAnchorErrorM),maxNativeRateErrorPercent:maximum(rows,row=>row.rateErrorPercent),maxDribbleRateErrorPercent:maximum(rows,row=>Math.max(row.cadence?.stepRateErrorPercent??0,row.cadence?.touchRateErrorPercent??0)),maxBallSurfaceErrorM:maximum(rows,row=>maximum(row.events??[],event=>event.ballSurfaceErrorM)),maxV10BoundaryJointM:maximum(rows,row=>Math.max(row.entry?.v10?.maxJointM??0,row.exit?.v10?.maxJointM??0)),maxV9RawBoundaryJointM:maximum(rows,row=>Math.max(row.entry?.v9?.maxJointM??0,row.exit?.v9?.maxJointM??0)),maxV10BoundaryVelocityErrorMps:maximum(rows,row=>Math.max(row.entry?.v10?.maxJointVelocityErrorMps??0,row.exit?.v10?.maxJointVelocityErrorMps??0)),validatorErrors:validation.reduce((sum,item)=>sum+item.errors,0),validatorWarnings:validation.reduce((sum,item)=>sum+item.warnings,0)};
 const report={method:'Independent parsing of delivered GLB float32 channels, shortest-path quaternion slerp and canonical FK at 120Hz. No authoring functions or IK. Support diameter of sole center, toe and heel with external reference trajectory applied exactly once. Native Root stays identity. Raw v9 and v10 pose/velocity deltas are both retained; v10 nominated native boundaries are acceptance gates. Browser evidence separately audits displayed blending to v9/v10.',limits,catalogSha256:hash(initial),catalogStable:stable,references:referenceEvidence,coverage:coverageReport,clips:rows,summary,pass:stable&&coverageReport.pass&&rows.every(row=>row.pass)&&validation.length===catalog.clips.length+referenceEvidence.length&&validation.every(item=>item.errors===0)};
 await fs.writeFile(new URL('metrics.json',output),JSON.stringify(report,null,2)+'\n');
 await fs.writeFile(new URL('validator.json',output),JSON.stringify({validator:validator.version(),files:validation,pass:validation.every(item=>item.errors===0)},null,2)+'\n');
 console.log(JSON.stringify({pass:report.pass,...summary,coverage:coverageReport.pass}));if(!report.pass)process.exitCode=1;return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
