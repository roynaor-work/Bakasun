/** Procedural sport engine; no downloaded samples. Shared app mute is authoritative.
 * sync(speed, boosting, {drifting, offroad, steer, throttle}) keeps the two-argument API.
 * Noise and custom harmonics are optional so minimal/headless audio contexts still work.
 */
/** racing-deep-m3: the context is never suspended by a pause (silence by gain). The shell pauses the session for its start countdown in the same task as the
 * launch tap and unpauses from a timer; a browser that honours resume() only inside a tap (Safari/iOS) then kept the engine silent until the next tap on a
 * button (Roy: "the sound works only after switching to manual"). ?racingAudioHold=0 restores the suspend. */
export const audioHoldEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingAudioHold')!=='0';
export function createRacingAudio({storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,samples:useSamples=false,holdContext=audioHoldEnabled()}={}){
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
 const gears=[0,9,18,28,39,52,70];
 let context,voice,filter,gain,noise,noiseFilter,noiseGain;
 let samples=null,wasBoosting=false,lastRevs=0;
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
  if(disposed||!AudioContext||(paused&&!holdContext))return;
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
    // racing-v11 samples (Codex racing-audio-v2): loaded after the first unlock, layered over the procedural engine; any failure leaves the procedural sound alone.
    if(useSamples)import('./racing-samples.mjs?v=island-v2-20261107-11').then(m=>{if(disposed||!context)return;const layer=m.createRacingSamples({context,base:new URL('../assets/racing-audio-v2/',import.meta.url),base3:new URL('../assets/racing-audio-v3/',import.meta.url),v3:m.audioV3Enabled(),beep:m.shiftBeepEnabled()});samples=layer;return layer.load().catch(()=>{layer.dispose();if(samples===layer)samples=null;});}).catch(()=>{samples=null;});
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
  if(real){gear=clamp(Math.round(number(extras.gear,gear)),1,7);if(gear>lastGear&&!paused&&!disposed){shiftUntil=now+.14;popUntil=now+.09;samples?.shiftUp();}else if(gear<lastGear&&!paused&&!disposed)samples?.shiftDown();lastGear=gear;extraVoices();}
  else{
   while(gear<6&&speed>gears[gear]+.8)gear++;
   while(gear>1&&speed<gears[gear-1]-1.6)gear--;
  }
  if(!real&&gear>previousGear&&!paused&&!disposed)shiftUntil=now+.13;
  const shift=clamp((shiftUntil-now)/.13,0,1);
  const rpm=clamp((speed-gears[gear-1])/(gears[gear]-gears[gear-1]),0,1);
  const throttle=extras.throttle===undefined?clamp(.45+acceleration/25,.16,1):clamp(number(extras.throttle),0,1);
  const drift=!!extras.drifting&&speed>8,offroad=!!extras.offroad,braking=!!extras.brake&&speed>14&&!drift&&!offroad;  // racing-deep-m3: tyre squeal under hard braking
  const steering=clamp(Math.abs(number(extras.steer)),0,1);
  const revs=real?clamp(number(extras.rpm),0,1):rpm;
  // racing-v11 top-speed life: in gear 7 near the rev limit the note hunts up and down (slow cycle toward the limiter), carries a 6 Hz vibrato,
  // drops for an instant at the limiter every ~2.6 s, rattles (28 Hz) above 90% and the wind builds. extras.topVar=false switches it off.
  const top=real&&extras.topVar!==false&&gear>=7?clamp((revs-.72)/.28,0,1):0;
  const hunt=top*(Math.sin(now*2.4)*5.5+Math.sin(now*.9+1)*3.5+Math.sin(now*6*Math.PI*2)*1.1);
  const limiter=top>.6&&(now%2.6)<.09?1:0,rattle=top>.65?1+Math.sin(now*28*Math.PI*2)*.1*top:1;
  const pitch=real?((40+revs*150)*(1-shift*.18)+(boosting?14:0)+hunt)*(1-limiter*.05):(49+(gear-1)*10+rpm*66)*(1-shift*.2)+(boosting?17:0);
  if(real&&voice2){
   target(voice2.frequency,pitch*.5,now,.05);target(voice3.frequency,pitch*1.5*(1+Math.sin(now*29)*.004),now,.05);
   target(gain2.gain,.35+throttle*.35,now,.08);target(gain3.gain,.12+revs*.3+top*.12,now,.08);
  }
  target(voice.frequency,pitch+Math.sin(now*23)*Math.min(speed/70,.65),now,.045);
  target(filter.frequency,380+rpm*850+speed*8+throttle*190+(boosting?360:0)+top*(260+Math.sin(now*3.1)*140),now,.055);
  // Entire mix remains below the previous .03 gain ceiling, including boosts.
  const volume=real?(.007+Math.min(speed/50,1)*.01+throttle*.0045+revs*.003)*(1-shift*.3)*(1-limiter*.55)*rattle:(.006+Math.min(speed/50,1)*.011+throttle*.002)*(1-shift*.16);
  target(gain.gain,paused||muted||disposed?0:volume,now,paused||muted||disposed?.018:.07);
  if(noiseGain){
   const road=Math.min(speed/55,1)*.045;
   const air=boosting?.33:0,slip=drift?.11+steering*.1:braking?.05+Math.min(speed/40,1)*.05:0,gravel=offroad?.2:0;
   const wind=top*.05,pop=real&&now<popUntil?.12:0,backfire=real&&lastThrottle>.7&&throttle<.25&&revs>.55?.1:0,exhaust=real?(.02+throttle*revs*.07):0;
   if(backfire&&!paused&&!disposed)samples?.backfire();
   if(wasBoosting&&!boosting&&!paused&&!disposed)samples?.blowoff();wasBoosting=boosting;
   lastThrottle=throttle;
   if(samples?.ready&&real){if(lastRevs<.95&&revs>=.95&&!paused&&!disposed)samples.shiftBeep?.();lastRevs=revs;}
   if(samples?.ready)samples.update({rpm:real?revs:rpm,throttle,speed,drifting:drift,braking,steer:steering,kerb:number(extras.kerb),offroad,level:paused||muted||disposed?0:1});
   target(noiseGain.gain,paused||muted||disposed?0:Math.min(.56,road+air+slip+gravel+shift*.055+pop+backfire+exhaust+wind),now,boosting?.045:.09);
   target(noiseFilter.frequency,(offroad?620:drift?1550+steering*850:braking?1900+speed*10:boosting?1200+speed*13:760+speed*12)+top*500,now,.07);
   target(noise.playbackRate,.8+Math.min(speed/65,1)*.45,now,.1);
  }
  lastSpeed=speed;lastTime=now;
 }
 // racing-v11 rivals: at most MAX_RIVAL_VOICES live engines (the nearest cars, panned and quieter with distance); the rest share one background voice.
 const MAX_RIVAL_VOICES=3,rivals=[];let pack=null,rivalList=[];
 function buildRivals(){
  if(rivals.length||!context||!context.createOscillator)return;
  const make=(type,cut)=>{const o=remember(context.createOscillator(),true);o.type=type;const f=remember(context.createBiquadFilter());f.type='lowpass';f.frequency.value=cut;const g=remember(context.createGain());g.gain.value=0;
   const pan=context.createStereoPanner?remember(context.createStereoPanner()):null;o.connect(f);f.connect(g);if(pan){g.connect(pan);pan.connect(context.destination);}else g.connect(context.destination);o.start();return {o,f,g,pan};};
  try{for(let i=0;i<MAX_RIVAL_VOICES;i++)rivals.push(make('sawtooth',420));pack=make('sawtooth',260);}catch{rivals.length=0;pack=null;}
 }
 function setOpponents(list){
  rivalList=Array.isArray(list)?list:[];
  if(!context||paused||disposed)return;
  buildRivals();if(!pack)return;
  const now=number(context.currentTime),silent=muted;
  const sorted=[...rivalList].filter(c=>c&&Number.isFinite(Number(c.distance))).sort((a,b)=>a.distance-b.distance),near=sorted.slice(0,MAX_RIVAL_VOICES),rest=sorted.slice(MAX_RIVAL_VOICES);
  rivals.forEach((voiceSet,i)=>{
   const car=near[i];
   if(!car||silent){target(voiceSet.g.gain,0,now,.1);return;}
   const rpm=clamp(number(car.rpm),0,1),att=Math.pow(clamp(1-number(car.distance)/90,0,1),2),thr=clamp(number(car.throttle,1),0,1);
   target(voiceSet.o.frequency,40+rpm*150,now,.06);target(voiceSet.f.frequency,300+rpm*650,now,.08);
   target(voiceSet.g.gain,(.0025+.0055*thr)*att,now,.09);if(voiceSet.pan)target(voiceSet.pan.pan,clamp(number(car.pan),-1,1),now,.1);
  });
  if(!rest.length||silent){target(pack.g.gain,0,now,.12);return;}
  const mean=rest.reduce((n,c)=>n+clamp(number(c.rpm),0,1),0)/rest.length,att=rest.reduce((n,c)=>n+Math.pow(clamp(1-number(c.distance)/140,0,1),2),0)/rest.length;
  target(pack.o.frequency,36+mean*130,now,.12);target(pack.g.gain,Math.min(.005,.0035*att*Math.min(rest.length,3)),now,.15);
 }
 function sync(value=0,boost=false,details={}){
  speed=clamp(number(value),0,85);boosting=!!boost;extras=details&&typeof details==='object'?details:{};
  try{update();}catch{}
 }
 /** racing-deep-m3 one-shot cues from the race model, procedural (no siren, every cue under the .03 ceiling): 'bump' a soft thud (car to car), 'wall' a scrape
  * scaled by how straight the fence was hit, 'crash' a heavier thud with a rattle and a pitch drop, 'crashRecover' a short restart blip, 'pass' the overtake
  * whoosh (sample layer, or a filtered wind sweep without it). Nothing plays while muted, paused or disposed. */
 const CUES={bump:{gain:.02,length:.09,cut:420,rate:.7},wall:{gain:.024,length:.22,cut:1500,rate:1.1},crash:{gain:.03,length:.42,cut:520,rate:.55},crashRecover:{gain:.012,length:.16,cut:900,rate:1.3},pass:{gain:.016,length:.3,cut:2200,rate:1.4}};
 let lastCue=new Map();
 function cue(name,intensity=1){
  const spec=CUES[name];if(!spec||!context||!noise?.buffer||!context.createBufferSource)return;
  const now=number(context.currentTime);if(now-(lastCue.get(name)??-9)<(name==='wall'?.25:.4))return;lastCue.set(name,now);
  try{
   const source=context.createBufferSource(),filter=context.createBiquadFilter(),g=context.createGain(),level=spec.gain*clamp(.35+intensity*.65,.35,1);
   source.buffer=noise.buffer;if(source.playbackRate)source.playbackRate.value=spec.rate;filter.type=name==='pass'?'bandpass':'lowpass';filter.frequency.value=spec.cut;
   if(g.gain.setValueAtTime&&g.gain.linearRampToValueAtTime){g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(level,now+.008);g.gain.linearRampToValueAtTime(name==='crash'?level*.5:level*.3,now+spec.length*.45);g.gain.linearRampToValueAtTime(0,now+spec.length);}
   else g.gain.value=level;
   source.gainValue=level;source.connect(filter);filter.connect(g);g.connect(context.destination);source.start(now);source.stop?.(now+spec.length+.02);
   source.onended=()=>{try{source.disconnect();filter.disconnect();g.disconnect();}catch{}};
   if(name==='crash'&&voice){target(voice.frequency,Math.max(30,number(voice.frequency.value)*.6),now,.03);shiftUntil=now+.3;}
  }catch{}
 }
 function event(name,details={}){
  readMute();if(paused||muted||disposed)return;
  if(name==='pass'){if(samples?.ready)samples.pass();else cue('pass',1);return;}
  if(samples?.ready)samples.event?.(name,clamp(number(details?.intensity,1),0,1));   // racing-audio-v3 layer (a no-op until its files decoded); the procedural cue below always plays
  cue(name,clamp(number(details?.intensity,1),0,1));
 }
 return {unlock,sync,setOpponents,event,
  setPaused(value){
   paused=!!value;try{update();}catch{}
   if(paused&&context?.state==='running'&&!holdContext){try{void context.suspend()?.catch?.(()=>{});}catch{}}
   else if(!paused&&!disposed&&context&&context.state!=='running'&&context.state!=='closed'){lastTime=context.currentTime;shiftUntil=0;resume();}
  },
  metrics:()=>({unlocked:!!context,paused,muted,disposed,contextState:context?.state,gain:gain?.gain?.value}),
  /** Last values the engine voice was driven with (for tests and the HUD). */
  engine:()=>({gear,contextState:context?.state,pitch:voice?.frequency?.value,rivalVoices:rivals.length+(pack?1:0)}),
  dispose(){
   if(disposed)return;disposed=true;
   if(context){target(gain?.gain,0,context.currentTime,.01);target(noiseGain?.gain,0,context.currentTime,.01);}
   samples?.dispose();samples=null;
   for(const source of sources){try{source.stop();}catch{}}
   for(const node of nodes){try{node.disconnect();}catch{}}
   if(context){try{void context.close()?.catch?.(()=>{});}catch{}}
  }
 };
}
