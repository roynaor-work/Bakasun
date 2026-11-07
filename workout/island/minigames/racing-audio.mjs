/** Procedural sport engine; no downloaded samples. Shared app mute is authoritative.
 * sync(speed, boosting, {drifting, offroad, steer, throttle}) keeps the two-argument API.
 * Noise and custom harmonics are optional so minimal/headless audio contexts still work.
 */
export function createRacingAudio({storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
 const gears=[0,9,18,28,39,52,70];
 let context,voice,filter,gain,noise,noiseFilter,noiseGain;
 let paused=false,disposed=false,muted=false,gear=1,shiftUntil=0,lastTime=0,lastSpeed=0;
 let speed=0,boosting=false,extras={};
 const nodes=[],sources=[];
 function remember(node,source=false){nodes.push(node);if(source)sources.push(node);return node;}
 function target(param,value,time,constant=.06){
  if(!param)return;
  try{if(typeof param.setTargetAtTime==='function')param.setTargetAtTime(value,time,constant);else param.value=value;}catch{}
 }
 function resume(){try{void context?.resume?.()?.catch?.(()=>{});}catch{}}
 function readMute(){try{muted=storage?.getItem('island.sound')==='off';}catch{}}
 function createNoise(){
  // One reusable loop feeds all road/air cues. No per-frame nodes or timers are created.
  if(!context.createBuffer||!context.createBufferSource)return;
  try{
   const length=Math.max(2048,Math.floor((context.sampleRate||44100)*1.4));
   const buffer=context.createBuffer(1,length,context.sampleRate||44100),data=buffer.getChannelData(0);
   let seed=91473,previous=0;
   for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1;previous=previous*.26+white*.74;data[i]=previous;}
   noise=remember(context.createBufferSource(),true);noise.buffer=buffer;noise.loop=true;
   noiseFilter=remember(context.createBiquadFilter());noiseFilter.type='bandpass';noiseFilter.frequency.value=1100;
   if(noiseFilter.Q)noiseFilter.Q.value=.62;
   noiseGain=remember(context.createGain());noiseGain.gain.value=0;
   noise.connect(noiseFilter);noiseFilter.connect(noiseGain);noiseGain.connect(gain);noise.start();
  }catch{noiseGain&&target(noiseGain.gain,0,context.currentTime,.01);}
 }
 function unlock(){
  if(disposed||paused||!AudioContext)return;
  try{
   if(!context){
    context=new AudioContext();
    voice=remember(context.createOscillator(),true);voice.type='sawtooth';
    // Lower harmonics provide engine body; 4th/8th harmonics add the exhaust note.
    if(context.createPeriodicWave&&voice.setPeriodicWave){
     const real=new Float32Array(17),imaginary=new Float32Array(17);
     for(let harmonic=1;harmonic<17;harmonic++)imaginary[harmonic]=(harmonic===4?.55:harmonic===8?.2:1/harmonic)*(.85+Math.cos(harmonic*.8)*.15);
     try{voice.setPeriodicWave(context.createPeriodicWave(real,imaginary));}catch{}
    }
    filter=remember(context.createBiquadFilter());filter.type='lowpass';filter.frequency.value=380;
    if(filter.Q)filter.Q.value=.58;
    gain=remember(context.createGain());gain.gain.value=0;
    voice.connect(filter);filter.connect(gain);gain.connect(context.destination);voice.start();
    createNoise();lastTime=context.currentTime;
   }
   if(context.state==='suspended')resume();
  }catch{}
 }
 // racing-v11: with rpm and gear from the physics the engine gets a sub oscillator, a rough fifth and an exhaust band; created on first use only.
 let voice2,voice3,gain2,gain3,exhaustGain,lastGear=1,popUntil=0,lastThrottle=1;
 function extraVoices(){
  if(voice2||!context||!filter||!context.createOscillator)return;
  try{
   voice2=remember(context.createOscillator(),true);voice2.type='triangle';gain2=remember(context.createGain());gain2.gain.value=.5;voice2.connect(gain2);gain2.connect(filter);voice2.start();
   voice3=remember(context.createOscillator(),true);voice3.type='sawtooth';gain3=remember(context.createGain());gain3.gain.value=.24;voice3.connect(gain3);gain3.connect(filter);voice3.start();
  }catch{voice2=voice3=undefined;}
 }
 function update(){
  readMute();if(!context||!gain)return;
  const now=number(context.currentTime),delta=clamp(now-lastTime,1/120,.25);
  const acceleration=clamp((speed-lastSpeed)/delta,-30,25);
  const previousGear=gear,real=extras.rpm!==undefined&&Number.isFinite(Number(extras.rpm));
  if(real){gear=clamp(Math.round(number(extras.gear,gear)),1,6);if(gear>lastGear&&!paused&&!disposed){shiftUntil=now+.14;popUntil=now+.09;}lastGear=gear;extraVoices();}
  else{
   while(gear<6&&speed>gears[gear]+.8)gear++;
   while(gear>1&&speed<gears[gear-1]-1.6)gear--;
  }
  if(!real&&gear>previousGear&&!paused&&!disposed)shiftUntil=now+.13;
  const shift=clamp((shiftUntil-now)/.13,0,1);
  const rpm=clamp((speed-gears[gear-1])/(gears[gear]-gears[gear-1]),0,1);
  const throttle=extras.throttle===undefined?clamp(.45+acceleration/25,.16,1):clamp(number(extras.throttle),0,1);
  const drift=!!extras.drifting&&speed>8,offroad=!!extras.offroad;
  const steering=clamp(Math.abs(number(extras.steer)),0,1);
  const revs=real?clamp(number(extras.rpm),0,1):rpm;
  const pitch=real?(40+revs*150)*(1-shift*.18)+(boosting?14:0):(49+(gear-1)*10+rpm*66)*(1-shift*.2)+(boosting?17:0);
  if(real&&voice2){
   target(voice2.frequency,pitch*.5,now,.05);target(voice3.frequency,pitch*1.5*(1+Math.sin(now*29)*.004),now,.05);
   target(gain2.gain,.35+throttle*.35,now,.08);target(gain3.gain,.12+revs*.3,now,.08);
  }
  target(voice.frequency,pitch+Math.sin(now*23)*Math.min(speed/70,.65),now,.045);
  target(filter.frequency,380+rpm*850+speed*8+throttle*190+(boosting?360:0),now,.055);
  // Entire mix remains below the previous .03 gain ceiling, including boosts.
  const volume=real?(.007+Math.min(speed/50,1)*.01+throttle*.0045+revs*.003)*(1-shift*.3):(.006+Math.min(speed/50,1)*.011+throttle*.002)*(1-shift*.16);
  target(gain.gain,paused||muted||disposed?0:volume,now,paused||muted||disposed?.018:.07);
  if(noiseGain){
   const road=Math.min(speed/55,1)*.045;
   const air=boosting?.33:0,slip=drift?.11+steering*.1:0,gravel=offroad?.2:0;
   const pop=real&&now<popUntil?.12:0,backfire=real&&lastThrottle>.7&&throttle<.25&&revs>.55?.1:0,exhaust=real?(.02+throttle*revs*.07):0;
   lastThrottle=throttle;
   target(noiseGain.gain,paused||muted||disposed?0:Math.min(.56,road+air+slip+gravel+shift*.055+pop+backfire+exhaust),now,boosting?.045:.09);
   target(noiseFilter.frequency,offroad?620:drift?1550+steering*850:boosting?1200+speed*13:760+speed*12,now,.07);
   target(noise.playbackRate,.8+Math.min(speed/65,1)*.45,now,.1);
  }
  lastSpeed=speed;lastTime=now;
 }
 function sync(value=0,boost=false,details={}){
  speed=clamp(number(value),0,85);boosting=!!boost;extras=details&&typeof details==='object'?details:{};
  try{update();}catch{}
 }
 return {unlock,sync,
  setPaused(value){
   paused=!!value;try{update();}catch{}
   if(paused&&context?.state==='running'){try{void context.suspend()?.catch?.(()=>{});}catch{}}
   else if(!paused&&!disposed&&context?.state==='suspended'){lastTime=context.currentTime;shiftUntil=0;resume();}
  },
  metrics:()=>({unlocked:!!context,paused,muted,disposed}),
  /** Last values the engine voice was driven with (for tests and the HUD). */
  engine:()=>({gear,pitch:voice?.frequency?.value}),
  dispose(){
   if(disposed)return;disposed=true;
   if(context){target(gain?.gain,0,context.currentTime,.01);target(noiseGain?.gain,0,context.currentTime,.01);}
   for(const source of sources){try{source.stop();}catch{}}
   for(const node of nodes){try{node.disconnect();}catch{}}
   if(context){try{void context.close()?.catch?.(()=>{});}catch{}}
  }
 };
}
