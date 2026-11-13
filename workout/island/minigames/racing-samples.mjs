/** Racing audio v2 samples (Codex package design/racing-audio-v2, CC0): five engine loops crossfaded by rpm, gear and exhaust one-shots, kerb, tyre and wind layers.
 * Layered over the procedural engine in racing-audio.mjs, never instead of it: if anything fails to load the procedural sound plays alone.
 * Loop points come from the package manifest (seconds, end exclusive). ?racingSamples=0 disables the layer. */
const LOOPS={
  'engine-idle':{rpm:4000,loop:[0.1800,3.1800]},'engine-low':{rpm:6000,loop:[0.1504,3.1504]},'engine-mid':{rpm:9000,loop:[0.1278,3.1278]},
  'engine-high':{rpm:12000,loop:[0.1632,3.1632]},'engine-redline':{rpm:15000,loop:[0.1047,3.1047]},
  'tyre-squeal':{loop:[0.1736,3.1736]},'wind-speed':{loop:[0.1501,3.1501]}
};
const SHOTS=['shift-up','shift-down','turbo-blowoff','exhaust-pop-1','exhaust-pop-2','exhaust-pop-3','pass-whoosh','kerb-rumble'];
const ENGINE_IDS=['engine-idle','engine-low','engine-mid','engine-high','engine-redline'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const samplesEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingSamples')!=='0';
// Every engine loop carries a strong harmonic line at 1.6-2.4 kHz (idle 1798 Hz +26 dB, high +38 dB,
// redline 2250 Hz the loudest bin); the rpm playback-rate slide turned it into a continuous whine
// (audio-forensics 11/11/2026: a 33 s glide and 64 segments in 3 minutes; 0 with ?racingSamples=0,
// 34 still with a 1.3 kHz low-pass because the lines are 26-40 dB above their surroundings).
// The procedural engine (racing-audio.mjs) carries the motor; the sample layer keeps gearbox,
// exhaust, kerb, tyre and wind. ?racingEngineLoops=1 restores the five engine loops.
export const engineLoopsOn=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingEngineLoops')==='1';
/** racing-audio-v3 (Codex package design/racing-audio-v3, CC0; assets/racing-audio-v3): collision, wall scrape, roll-over, restart, brake squeal and an optional shift-light beep.
 * Same bus, same 12 ms attack and the same 0.45 s gearbox gate as the v2 one-shots; loaded separately, so a missing v3 file never takes the v2 layer down.
 * Gains are the package's recommendedGain (Roy has not listened yet: conservative). ?racingAudioV3=0 skips the whole group; ?racingShiftBeep=1 adds the beep (off by default, as the package asks). */
export const audioV3Enabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingAudioV3')!=='0';
export const shiftBeepEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingShiftBeep')==='1';
export const V3_SHOTS=Object.freeze({'car-bump':.03,'wall-scrape-short':.025,'wall-scrape-long':.025,'crash-roll':.035,'engine-restart':.03,'shift-light-beep':.02});
export const V3_LOOPS=Object.freeze({'brake-squeal-loop':{gain:.025,loop:[0.05,1.95]}});
export function createRacingSamples({context,destination=context?.destination,base,fetchFn=globalThis.fetch,format,engineLoops=engineLoopsOn(),v3=false,beep=false,base3=base?new URL('../racing-audio-v3/',base):null}){
  const ext=format||((()=>{try{return new Audio().canPlayType('audio/ogg; codecs="vorbis"')?'ogg':'mp3';}catch{return 'mp3';}})());
  const buffers=new Map(),loops=new Map(),nodes=[];let ready=false,disposed=false,pop=0,v3Ready=false;const lastShot=new Map();
  const bus=context.createGain();bus.gain.value=0;bus.connect(destination);nodes.push(bus);
  const target=(param,value,time,k=.06)=>{try{if(typeof param.setTargetAtTime==='function')param.setTargetAtTime(value,time,k);else param.value=value;}catch{}};
  async function load(){
    const ids=[...Object.keys(LOOPS),...SHOTS];
    await Promise.all(ids.map(async id=>{
      const response=await fetchFn(new URL(`${id}.${ext}`,base).href);if(!response.ok)throw new Error('sample '+id);
      buffers.set(id,await context.decodeAudioData(await response.arrayBuffer()));
    }));
    if(disposed)return;
    for(const [id,spec] of Object.entries(LOOPS)){
      if(!engineLoops&&ENGINE_IDS.includes(id))continue;
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(id);source.loop=true;source.loopStart=spec.loop[0];source.loopEnd=spec.loop[1];
      gain.gain.value=0;source.connect(gain);gain.connect(bus);source.start(0,spec.loop[0]);loops.set(id,{source,gain,spec});nodes.push(source,gain);
    }
    ready=true;
    if(v3)await loadV3().catch(()=>{});   // v3 is extra: any failure leaves the v2 layer (already ready) as it was
  }
  /** all-or-nothing: v3 becomes usable only when every file of the group decoded */
  async function loadV3(){
    const ids=[...Object.keys(V3_SHOTS).filter(id=>beep||id!=='shift-light-beep'),...Object.keys(V3_LOOPS)],got=new Map();
    await Promise.all(ids.map(async id=>{const response=await fetchFn(new URL(`${id}.${ext}`,base3).href);if(!response.ok)throw new Error('sample '+id);got.set(id,await context.decodeAudioData(await response.arrayBuffer()));}));
    if(disposed)return;
    for(const [id,buffer] of got)buffers.set(id,buffer);
    for(const [id,spec] of Object.entries(V3_LOOPS)){
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(id);source.loop=true;source.loopStart=spec.loop[0];source.loopEnd=spec.loop[1];
      gain.gain.value=0;source.connect(gain);gain.connect(bus);source.start(0);loops.set(id,{source,gain,spec});nodes.push(source,gain);   // from the file start: it rises softly, then loops 0.05-1.95 s
    }
    v3Ready=true;
  }
  let lastGearbox=-9;const GEARBOX=new Set(['shift-up','shift-down','exhaust-pop-1','exhaust-pop-2','exhaust-pop-3','turbo-blowoff',...Object.keys(V3_SHOTS)]);
  function shot(id,gain=.1,rate=1,minGap=.12){
    if(!ready||disposed)return;const now=context.currentTime;if(now-(lastShot.get(id)||-9)<minGap)return;
    // one gearbox/exhaust sound per 0.45 s: a shift never stacks a shift sound, a pop and a blow-off on top of each other
    if(GEARBOX.has(id)){if(now-lastGearbox<.45)return;lastGearbox=now;}lastShot.set(id,now);
    // 12 ms attack ramp: the samples start at full scale and a hard onset is a click (measured by tools/racing-shift-audio.mjs).
    const source=context.createBufferSource(),g=context.createGain();source.buffer=buffers.get(id);source.playbackRate.value=rate;
    if(g.gain.setValueAtTime){g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(gain,now+.012);}else g.gain.value=gain;
    source.connect(g);g.connect(bus);source.start(now);
    source.onended=()=>{try{source.disconnect();g.disconnect();}catch{}};
  }
  /** rpm 0..1 (the physics rpm); level is the overall sample level (0 when muted or paused). */
  function update({rpm=0,throttle=1,speed=0,drifting=false,braking=false,steer=0,kerb=0,offroad=false,level=1}={}){
    if(!ready||disposed)return;const now=context.currentTime;
    target(bus.gain,level,now,.05);
    // fake engine rpm from the physics value: idle 4900 .. redline about 15300; crossfade the two nearest loops (equal power)
    const fake=3500+clamp(rpm,0,1)*11800;let lo=0;while(lo<ENGINE_IDS.length-2&&fake>=LOOPS[ENGINE_IDS[lo+1]].rpm)lo++;
    const a=LOOPS[ENGINE_IDS[lo]],b=LOOPS[ENGINE_IDS[lo+1]],t=clamp((fake-a.rpm)/(b.rpm-a.rpm),0,1),load=.55+.45*clamp(throttle,0,1);
    ENGINE_IDS.forEach((id,i)=>{
      const loop=loops.get(id);if(!loop)return;let weight=0;if(i===lo)weight=Math.cos(t*Math.PI/2);else if(i===lo+1)weight=Math.sin(t*Math.PI/2);
      target(loop.gain.gain,weight*.07*load,now,.045);target(loop.source.playbackRate,clamp(fake/loop.spec.rpm,.82,1.2),now,.045);
    });
    const slip=drifting?.07+Math.abs(steer)*.05:braking&&speed>14?.03+Math.min(speed/45,1)*.03:0;  // racing-deep-m3: the squeal loop also under hard braking
    target(loops.get('tyre-squeal').gain.gain,offroad?0:slip,now,.08);
    target(loops.get('wind-speed').gain.gain,Math.min(.07,.012+speed/55*.055),now,.15);
    target(loops.get('wind-speed').source.playbackRate,.85+Math.min(speed/60,1)*.35,now,.2);
    if(kerb>.5)shot('kerb-rumble',.05+.04*Math.min(1,speed/45),1,.7);
    // racing-audio-v3: hard braking at speed (not while drifting: the v2 tyre squeal covers that) fades the brake squeal in and out in 80 ms steps
    const squeal=loops.get('brake-squeal-loop');if(squeal)target(squeal.gain.gain,braking&&!drifting&&!offroad&&speed>26?squeal.spec.gain*Math.min(1,(speed-20)/20):0,now,.08);
  }
  return {
    load,get ready(){return ready;},get engineLoops(){return engineLoops;},update,
    shiftUp(){shot('shift-up',.035,1,.45);},shiftDown(){shot('shift-down',.03,1,.45);},
    backfire(){shot(`exhaust-pop-${1+(pop++%3)}`,.04,1,.45);},blowoff(){shot('turbo-blowoff',.04,1,.6);},pass(){shot('pass-whoosh',.07,1,1.2);},
    get v3Ready(){return v3Ready;},
    /** a game event by the audio engine's names ('bump', 'wall', 'crash', 'crashRecover'); intensity 0..1. Does nothing until v3 is ready. */
    event(name,intensity=1){
      if(!v3Ready||disposed)return;
      if(name==='bump')shot('car-bump',V3_SHOTS['car-bump'],1,.2);
      else if(name==='wall')shot(intensity>=.5?'wall-scrape-long':'wall-scrape-short',V3_SHOTS['wall-scrape-short'],1,.25);
      else if(name==='crash')shot('crash-roll',V3_SHOTS['crash-roll'],1,.6);
      else if(name==='crashRecover')shot('engine-restart',V3_SHOTS['engine-restart'],1,.6);
    },
    shiftBeep(){if(v3Ready&&beep)shot('shift-light-beep',V3_SHOTS['shift-light-beep'],1,.3);},
    dispose(){if(disposed)return;disposed=true;for(const n of nodes){try{n.stop?.();}catch{}try{n.disconnect();}catch{}}}
  };
}
