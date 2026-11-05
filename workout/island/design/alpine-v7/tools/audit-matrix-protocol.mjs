/** Independent checks for schema2 real playback and optional seek-assisted end. */
export function inspectMatrixCase(c,{bundleBuiltAt,minDwell=10,pixelRatio=1.5,requireDiagnostics=false}={}){
  const errors=[];
  const check=(condition,message)=>{if(!condition)errors.push(`${c.id??'?'}: ${message}`);return !!condition;};
  const s=c.snapshot??{},p=c.progressObservation??{},config=c.configuration??{};
  const looping=['glide','carve_left','carve_right','crouch','celebrate'].includes(config.clip);
  const duration=s.clipDuration;
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const resources=x=>finite(x?.memory?.geometries)&&x.memory.geometries>=0&&x.memory.geometries<200&&finite(x?.memory?.textures)&&x.memory.textures>=0&&x.memory.textures<64&&x.loadedRecords===9&&x.characterRoots===9;
  const identity=x=>x?.bundleBuiltAt===bundleBuiltAt&&x?.pixelRatio===pixelRatio&&['athlete','view','environment','clip'].every(key=>x[key]===config[key]);
  check(finite(c.elapsedSeconds)&&c.elapsedSeconds>=minDwell,'real-playback dwell below required minimum');
  check(finite(duration)&&duration>0,'invalid clip duration');
  check(c.looping===looping,'loop classification differs from canonical clip behavior');
  check(identity(s),'run snapshot package, DPR or configuration mismatch');
  check(Array.isArray(c.viewport)&&c.viewport.length===2&&s.viewport?.length===2&&s.viewport.every((v,i)=>v===c.viewport[i]),'actual run viewport differs from prescribed orientation');
  check(s.drawingBufferSize?.length===2&&s.drawingBufferSize.every((v,i)=>v===Math.floor(c.viewport?.[i]*pixelRatio)),'actual drawing buffer differs from viewport multiplied by DPR');
  const progress=Number.isInteger(p.observedSamples)&&Number.isInteger(p.changedSamples)&&p.observedSamples>=p.changedSamples&&p.changedSamples>=2&&[p.initialTime,p.minTime,p.maxTime,p.lastTime].every(finite)&&p.initialTime>=p.minTime-1e-6&&p.initialTime<=p.maxTime+1e-6&&p.lastTime>=p.minTime-1e-6&&p.lastTime<=p.maxTime+1e-6&&p.minTime>=-0.01&&p.maxTime<=duration+0.01&&p.maxTime>p.minTime;
  check(progress,'independent rAF trace lacks two bounded time changes');
  if(requireDiagnostics){
    check(finite(p.observationElapsedMilliseconds)&&p.observationElapsedMilliseconds+1>=minDwell*1000&&finite(p.maximumRAFGapMilliseconds)&&p.maximumRAFGapMilliseconds>=0&&p.maximumRAFGapMilliseconds<=p.observationElapsedMilliseconds+1&&finite(p.finalRAFGapMilliseconds)&&p.finalRAFGapMilliseconds>=0&&p.finalRAFGapMilliseconds<=p.maximumRAFGapMilliseconds+1,'rAF start/end gap or actual observation duration evidence invalid');
    check(p.initialVisibility==='visible'&&p.finalVisibility==='visible'&&typeof p.initialFocus==='boolean'&&typeof p.finalFocus==='boolean','foreground visibility/focus diagnostics missing');
  }
  const naturalEnd=looping?null:s.playing===false&&Math.abs(s.time-duration)<0.01;
  check(c.naturalEnd===naturalEnd,'naturalEnd does not match actual ten-second snapshot');
  const runPass=progress&&Number.isInteger(s.renderTimingMilliseconds?.samples)&&s.renderTimingMilliseconds.samples>=2&&finite(s.time)&&s.time>=-0.01&&s.time<=duration+0.01&&(looping?s.playing===true:s.playing===true||naturalEnd);
  check(c.runPlaybackPass===runPass,'recorded real-playback assertion differs from independent result');
  check(runPass,'real playback did not advance through at least two rendered samples');
  let probePass=false;
  if(!looping&&!naturalEnd){
    const probe=c.endProbe??{},end=probe.finalSnapshot??{};
    check(typeof probe.method==='string'&&probe.method.length>0,'seek-assisted end probe method missing');
    check(finite(probe.seekStartTime)&&Math.abs(probe.seekStartTime-(duration-0.05))<0.0001,'end probe did not seek to duration minus 50ms');
    check(Number.isFinite(Date.parse(probe.startedAt))&&Date.parse(probe.startedAt)<=Date.now()+1000&&finite(probe.elapsedSeconds)&&probe.elapsedSeconds>=0,'end probe timing evidence invalid');
    if(requireDiagnostics)check(probe.timeoutSeconds===45&&end.visibility==='visible'&&typeof end.focused==='boolean','end probe timeout or foreground diagnostics missing');
    probePass=identity(end)&&end.playing===false&&finite(end.time)&&Math.abs(end.time-duration)<0.01;
    check(probe.pass===probePass,'end probe assertion differs from its actual final snapshot');
    check(probePass,'seek-assisted one-shot end assertion failed');
    check(resources(end),'end probe resource bounds failed');
  }else check(c.endProbe===undefined||c.endProbe===null,'unnecessary end probe obscures a natural or looping run');
  const playbackPass=runPass&&(looping||naturalEnd||probePass);
  check(c.playbackPass===playbackPass&&playbackPass,'combined real-playback/end assertion failed');
  const resourcePass=resources(s)&&(!c.endProbe||resources(c.endProbe.finalSnapshot));
  check(c.resourcesPass===resourcePass&&resourcePass,'combined run/probe resource bounds failed');
  check(finite(c.totalElapsedSeconds)&&c.totalElapsedSeconds+0.01>=c.elapsedSeconds+(c.endProbe?.elapsedSeconds??0),'total duration omits run or probe time');
  if(c.screenshot){
    const pose=c.screenshotPose??{},expectedPhase=c.endProbe?'seek-assisted end probe':'ten-second run',expectedTime=c.endProbe?.finalSnapshot?.time??s.time;
    check(pose.clip===config.clip&&pose.playing===false&&pose.phaseSource===expectedPhase&&finite(pose.time)&&pose.time>=-0.01&&pose.time<=duration+0.01&&((!looping||c.endProbe)?Math.abs(pose.time-expectedTime)<0.01:true),'screenshot pose does not identify the actual run or assisted-end phase');
  }
  return{errors,runPass,naturalEnd,probePass,playbackPass,resourcePass};
}
