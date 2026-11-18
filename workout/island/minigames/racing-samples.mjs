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
/** racing-v24 (Roy after v23: "while braking there is a metal noise instead of a proper braking sound"; Codex package design/racing-audio-v4, CC0; assets/racing-audio-v4):
 * three brake loops (asphalt friction with rubber stick-slip, no metallic resonance) picked by speed, one at a time with a 50 ms crossfade, instead of the v2 tyre squeal
 * and the v3 brake squeal under braking; a soft and a hard car bump and a side scrape for contacts. Gains follow the package's -13/-9/-6 dB and -10/-5 dB steps at the
 * level of the v3 one-shots. All or nothing like v3: any missing file leaves v2/v3 as they were. ?racingAudioV4=0 skips the group. */
export const V4_LOOPS=Object.freeze([{id:'brake-loop-light',gain:.016},{id:'brake-loop-medium',gain:.024},{id:'brake-loop-hard',gain:.034}]);
export const V4_SHOTS=Object.freeze({'car-bump-soft':.022,'car-bump-hard':.04,'side-scrape':.02});
/** racing-v24 wind (Roy: "a background noise, like air or a hiss"): the v2 wind loop played at .012 standing still and .07 at speed, over the whole engine; now silent
 * under 12 m/s and at most .03 at the top. hiss='v23' keeps the old curve. racing-v24.5 (Roy after v24.4: "a kind of noise, maybe the air you make while driving";
 * air='v245', the session's default): silent at every speed; air='v244' keeps the v24 curve. */
/** racing-v24 pit stop sounds (Codex package design/racing-pit-v1, CC0; assets/racing-pit-v1/audio): the jack at the stop, the wheel guns loosening, a wheel dropped and a
 * wheel attached, the guns tightening during the 2 s change, the crew's cheer and the engine leaving at the end. Loaded only in a race with stops (pit=true). */
export const PIT_SHOTS=Object.freeze({wheel_gun_loosen:.03,wheel_gun_tighten:.03,jack:.026,wheel_drop:.024,wheel_attach:.024,crew_cheer:.026,engine_exit:.028});
/** racing-v24.4 (Roy after v24.3: "still an annoying noise when the car goes a little off the track, the same noise in the pit lane"; Codex package design/racing-audio-v5,
 * CC0; assets/racing-audio-v5): 13 loops, every one 2.304 s inside its file (0.288..2.592 s), mixed by the package's nominal gains (dB, 0 dB = V5_REF). Gravel or grass
 * in three strengths by speed (silent under 6 m/s, full at 12, the strength changes at 18 and 30 m/s, 450 ms crossfades), the v5 brake loops instead of the v4 ones,
 * and four pit lane layers (the slow engine and the limiter while the car moves in the lane, the bay and the crew near and at the box, 650 ms fades). All or nothing:
 * a missing file leaves v2/v3/v4 as they were. v5=true only with the session's flag (?racingAudioV5=0 never loads it). */
export const V5_REF=.08,V5_LOOP=Object.freeze([.288,2.592]);
export const V5_SURFACE=Object.freeze({gravel:[['offtrack-gravel-low',-18],['offtrack-gravel-medium',-14],['offtrack-gravel-high',-10]],grass:[['offtrack-grass-low',-18],['offtrack-grass-medium',-14],['offtrack-grass-high',-10]]});
export const V5_BRAKE=Object.freeze([['brake-low',-18],['brake-medium',-14],['brake-high',-10]]);
export const V5_PIT=Object.freeze({'pit-engine-slow':-10,'pit-limiter':-18,'pit-bay-proximity':-24,'pit-crew-background':-28});
export const v5Gain=db=>V5_REF*Math.pow(10,db/20);
/** the strength index for a speed (0 low, 1 medium, 2 high) and the fade-in under 12 m/s (0 under 6) */
export const v5Strength=speed=>speed>30?2:speed>18?1:0;
export const v5Ramp=speed=>Math.max(0,Math.min(1,(speed-6)/6));
/** the pit lane layers for a pit phase: [engine, limiter, bay, crew] weights 0..1 */
export function v5PitMix(phase,speed=0,toBox=Infinity){
 if(!phase)return [0,0,0,0];const moving=['entry','lane','leave','exit'].includes(phase),standing=phase==='stop'||phase==='change';
 const near=standing?1:phase==='lane'?Math.max(0,Math.min(1,1-toBox/30)):phase==='leave'?.6:0;
 return [1,moving&&speed>2?1:0,near,standing?1:near*.5];
}
/** racing-v24.5 rec (Roy's own engine recordings, assets/racing-rec, README there): the idling engine on the grid (a 2.7 s seamless loop) and an engine driving away
 * (two 6 s takes) for the overtake; loaded only with rec=true (the session's default; ?racingRec=0 keeps the synthesis), all or nothing. The 12 s "accelerate and shift"
 * take is not used: its shifts come at its own times and cannot follow the game's gearbox (README). Gains put the takes (about -18 LUFS) at the level of the synthesis
 * they replace; a 3.2 kHz low-pass keeps the phone microphone's rasp out (no air). */
export const REC=Object.freeze({idle:'engine-idle-loop',away:Object.freeze(['engine-away-1','engine-away-2']),idleGain:.045,passGain:.1,passLength:2.4,lowpass:3200});
export function windGain(speed,hiss='v24',air='v244'){if(air==='v245')return 0;if(hiss==='v23')return Math.min(.07,.012+speed/55*.055);return speed<12?0:Math.min(.03,Math.pow((speed-12)/38,1.5)*.03);}
export function createRacingSamples({context,destination=context?.destination,base,fetchFn=globalThis.fetch,format,engineLoops=engineLoopsOn(),v3=false,beep=false,base3=base?new URL('../racing-audio-v3/',base):null,v4=false,base4=base?new URL('../racing-audio-v4/',base):null,hiss='v23',air='v244',pit=false,basePit=base?new URL('../racing-pit-v1/audio/',base):null,rec=false,baseRec=base?new URL('../racing-rec/',base):null,v5=false,base5=base?new URL('../racing-audio-v5/',base):null}){
  const ext=format||((()=>{try{return new Audio().canPlayType('audio/ogg; codecs="vorbis"')?'ogg':'mp3';}catch{return 'mp3';}})());
  const buffers=new Map(),loops=new Map(),nodes=[];let ready=false,disposed=false,pop=0,v3Ready=false,v4Ready=false,pitReady=false,v5Ready=false,sideNext=false,recReady=false,recIdle=null,recBus=null,recPasses=0;const lastShot=new Map(),lv={wind:0,squeal:0,brakeSqueal:0,brake:[0,0,0],surface:{},pit:[0,0,0,0],brake5:[0,0,0]};   // racing-v24: the levels last set (levels())
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
    if(v4)await loadV4().catch(()=>{});   // racing-v24: the same, for the v4 brake loops and contact shots
    if(pit)await loadPit().catch(()=>{});   // racing-v24: the pit stop sounds, all or nothing
    if(v5)await loadV5().catch(()=>{});   // racing-v24.4: the v5 surface, brake and pit lane loops, all or nothing
    if(rec)await loadRec().catch(()=>{});   // racing-v24.5: Roy's recordings (idle loop, engine driving away), all or nothing
  }
  const V5_IDS=[...V5_SURFACE.gravel,...V5_SURFACE.grass,...V5_BRAKE].map(e=>e[0]).concat(Object.keys(V5_PIT));
  async function loadV5(){
    const got=new Map();
    await Promise.all(V5_IDS.map(async id=>{const response=await fetchFn(new URL(`${id}.${ext}`,base5).href);if(!response.ok)throw new Error('sample '+id);got.set(id,await context.decodeAudioData(await response.arrayBuffer()));}));
    if(disposed)return;
    for(const [id,buffer] of got){buffers.set(id,buffer);const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=true;source.loopStart=V5_LOOP[0];source.loopEnd=V5_LOOP[1];
      gain.gain.value=0;source.connect(gain);gain.connect(bus);source.start(0,V5_LOOP[0]);loops.set(id,{source,gain,spec:{id}});nodes.push(source,gain);}
    v5Ready=true;
  }
  async function loadRec(){
    const ids=[REC.idle,...REC.away],got=new Map();
    await Promise.all(ids.map(async id=>{const response=await fetchFn(new URL(`${id}.${ext}`,baseRec).href);if(!response.ok)throw new Error('sample '+id);got.set(id,await context.decodeAudioData(await response.arrayBuffer()));}));
    if(disposed)return;for(const [id,buffer] of got)buffers.set(id,buffer);
    // one low-passed bus for the takes (straight to the destination: the idle plays on the grid, before the sample bus is raised by the first update)
    recBus=context.createBiquadFilter();recBus.type='lowpass';recBus.frequency.value=REC.lowpass;if(recBus.Q)recBus.Q.value=.6;recBus.connect(destination);nodes.push(recBus);
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(REC.idle);source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(recBus);source.start(0);
    recIdle={source,gain};nodes.push(source,gain);recReady=true;
  }
  async function loadPit(){
    const got=new Map();
    await Promise.all(Object.keys(PIT_SHOTS).map(async id=>{const response=await fetchFn(new URL(`${id}.${ext}`,basePit).href);if(!response.ok)throw new Error('sample '+id);got.set(id,await context.decodeAudioData(await response.arrayBuffer()));}));
    if(disposed)return;for(const [id,buffer] of got)buffers.set(id,buffer);pitReady=true;
  }
  async function loadV4(){
    const ids=[...V4_LOOPS.map(l=>l.id),...Object.keys(V4_SHOTS)],got=new Map();
    await Promise.all(ids.map(async id=>{const response=await fetchFn(new URL(`${id}.${ext}`,base4).href);if(!response.ok)throw new Error('sample '+id);got.set(id,await context.decodeAudioData(await response.arrayBuffer()));}));
    if(disposed)return;
    for(const [id,buffer] of got)buffers.set(id,buffer);
    for(const spec of V4_LOOPS){const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(spec.id);source.loop=true;source.loopStart=0;source.loopEnd=2;
      gain.gain.value=0;source.connect(gain);gain.connect(bus);source.start(0);loops.set(spec.id,{source,gain,spec});nodes.push(source,gain);}
    v4Ready=true;
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
  // length (racing-v23): play only the first `length` seconds, with a 70 ms fade at the end (the shift 'pssh' is the start of the 0.75 s blow-off)
  function shot(id,gain=.1,rate=1,minGap=.12,length=0,delay=0){
    if(!ready||disposed)return;const now=context.currentTime+delay;if(now-(lastShot.get(id)||-9)<minGap)return;
    // one gearbox/exhaust sound per 0.45 s: a shift never stacks a shift sound, a pop and a blow-off on top of each other
    if(GEARBOX.has(id)){if(now-lastGearbox<.45)return;lastGearbox=now;}lastShot.set(id,now);
    // 12 ms attack ramp: the samples start at full scale and a hard onset is a click (measured by tools/racing-shift-audio.mjs).
    const source=context.createBufferSource(),g=context.createGain();source.buffer=buffers.get(id);source.playbackRate.value=rate;
    // racing-v23: from 0, not from the default 1 (one frame at full scale when the start rounds before the ramp)
    g.gain.value=0;if(g.gain.setValueAtTime){g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(gain,now+.012);if(length>0){g.gain.setValueAtTime(gain,now+Math.max(.02,length-.07));g.gain.linearRampToValueAtTime(0,now+length);}}else g.gain.value=gain;
    source.connect(g);g.connect(bus);source.start(now);if(length>0)try{source.stop(now+length+.02);}catch{}
    source.onended=()=>{try{source.disconnect();g.disconnect();}catch{}};
  }
  /** rpm 0..1 (the physics rpm); level is the overall sample level (0 when muted or paused). */
  function update({rpm=0,throttle=1,speed=0,drifting=false,braking=false,brakePedal=braking,steer=0,kerb=0,offroad=false,level=1,surface,pitPhase='',toBox=Infinity}={}){
    if(!ready||disposed)return;const now=context.currentTime;
    target(bus.gain,level,now,.05);
    // fake engine rpm from the physics value: idle 4900 .. redline about 15300; crossfade the two nearest loops (equal power)
    const fake=3500+clamp(rpm,0,1)*11800;let lo=0;while(lo<ENGINE_IDS.length-2&&fake>=LOOPS[ENGINE_IDS[lo+1]].rpm)lo++;
    const a=LOOPS[ENGINE_IDS[lo]],b=LOOPS[ENGINE_IDS[lo+1]],t=clamp((fake-a.rpm)/(b.rpm-a.rpm),0,1),load=.55+.45*clamp(throttle,0,1);
    ENGINE_IDS.forEach((id,i)=>{
      const loop=loops.get(id);if(!loop)return;let weight=0;if(i===lo)weight=Math.cos(t*Math.PI/2);else if(i===lo+1)weight=Math.sin(t*Math.PI/2);
      target(loop.gain.gain,weight*.07*load,now,.045);target(loop.source.playbackRate,clamp(fake/loop.spec.rpm,.82,1.2),now,.045);
    });
    const slip=drifting?.07+Math.abs(steer)*.05:braking&&speed>14&&!(v4Ready||v5Ready)?.03+Math.min(speed/45,1)*.03:0;  // racing-deep-m3: the squeal loop also under hard braking (racing-v24: not with the v4 brake loops)
    lv.squeal=offroad?0:slip;target(loops.get('tyre-squeal').gain.gain,lv.squeal,now,.08);
    lv.wind=windGain(speed,hiss,air);target(loops.get('wind-speed').gain.gain,lv.wind,now,.15);
    target(loops.get('wind-speed').source.playbackRate,.85+Math.min(speed/60,1)*.35,now,.2);
    if(kerb>.5)shot('kerb-rumble',.05+.04*Math.min(1,speed/45),1,.7);
    // racing-audio-v3: hard braking at speed (not while drifting: the v2 tyre squeal covers that) fades the brake squeal in and out in 80 ms steps
    const squeal=loops.get('brake-squeal-loop');lv.brakeSqueal=squeal&&!(v4Ready||v5Ready)&&braking&&!drifting&&!offroad&&speed>26?squeal.spec.gain*Math.min(1,(speed-20)/20):0;if(squeal)target(squeal.gain.gain,lv.brakeSqueal,now,.08);
    // racing-v24: one brake loop by speed (light under 18 m/s, medium to 30, hard above), faded in with the speed so a crawl brakes silently; 50 ms crossfades
    // racing-v24.4 v5: one surface loop (gravel or grass) by speed where the car really is on it; the v5 brake loops replace the v4 ones; the pit lane layers
    if(v5Ready){
      const kind=surface==='gravel'||surface==='grass'?surface:null,str=v5Strength(speed),ramp=v5Ramp(speed);
      for(const k of ['gravel','grass'])V5_SURFACE[k].forEach(([id,db],i)=>{const g=k===kind&&i===str?v5Gain(db)*ramp:0;lv.surface[id]=g;target(loops.get(id).gain.gain,g,now,.15);target(loops.get(id).source.playbackRate,.82+.26*Math.min(1,speed/45),now,.2);});
      const pick=brakePedal&&!drifting&&!offroad&&speed>6&&!pitPhase?v5Strength(speed):-1;
      V5_BRAKE.forEach(([id,db],i)=>{const g=i===pick?v5Gain(db)*Math.min(1,(speed-4)/10):0;lv.brake5[i]=g;target(loops.get(id).gain.gain,g,now,.06);});
      const mix=v5PitMix(pitPhase,speed,toBox);Object.entries(V5_PIT).forEach(([id,db],i)=>{const g=v5Gain(db)*mix[i];lv.pit[i]=g;target(loops.get(id).gain.gain,g,now,.22);if(i<2)target(loops.get(id).source.playbackRate,.82+.26*Math.min(1,speed/20),now,.2);});
    }
    if(v4Ready){const pick=!v5Ready&&brakePedal&&!drifting&&!offroad&&speed>6?(speed>30?2:speed>18?1:0):-1;V4_LOOPS.forEach((spec,i)=>{const loop=loops.get(spec.id);lv.brake[i]=i===pick?spec.gain*Math.min(1,(speed-4)/10):0;if(loop)target(loop.gain.gain,lv.brake[i],now,.02);});}
  }
  return {
    load,get ready(){return ready;},get engineLoops(){return engineLoops;},update,
    shiftUp(){shot('shift-up',.035,1,.45);},shiftDown(){shot('shift-down',.03,1,.45);},
    /** racing-v23 shift styles (racing-audio ?racingShift=b|c): the blow-off cut to its first 0.32 s, one exhaust crack, the down blips quieter */
    turbo(){shot('turbo-blowoff',.028,1.2,.45,.32);},crack(){shot(`exhaust-pop-${1+(pop++%3)}`,.03,1.05,.45);},shiftDownSoft(){shot('shift-down',.02,1,.45);},
    backfire(){shot(`exhaust-pop-${1+(pop++%3)}`,.04,1,.45);},blowoff(){shot('turbo-blowoff',.04,1,.6);},pass(){shot('pass-whoosh',.07,1,1.2);},
    get recReady(){return recReady;},
    /** racing-v24.5 rec: the recorded idle at `level` 0..1 (the synthesis' idle level), `rate` the playback rate (revs held up on the start lights) */
    recIdle(level=0,rate=1){if(!recReady||disposed)return false;const now=context.currentTime;lv.recIdle=REC.idleGain*Math.max(0,Math.min(1,level));target(recIdle.gain.gain,lv.recIdle,now,.12);target(recIdle.source.playbackRate,Math.max(.7,Math.min(1.8,rate)),now,.08);return true;},
    /** racing-v24.5 rec: the overtake = the passed car's engine driving away (the two takes in turn): the first REC.passLength s, in quickly and fading with the distance,
     * the pitch falling 4% -> -6% (doppler), panned from its side towards the middle */
    recPass({pan=.5,level=1}={}){if(!recReady||disposed)return false;const now=context.currentTime,len=REC.passLength,id=REC.away[recPasses++%REC.away.length],peak=REC.passGain*Math.max(0,Math.min(1,level));
      const source=context.createBufferSource(),g=context.createGain(),p=context.createStereoPanner?context.createStereoPanner():null;source.buffer=buffers.get(id);
      if(source.playbackRate.setValueAtTime&&source.playbackRate.linearRampToValueAtTime){source.playbackRate.setValueAtTime(1.04,now);source.playbackRate.linearRampToValueAtTime(.94,now+len);}else source.playbackRate.value=1;
      g.gain.value=0;if(g.gain.setValueAtTime&&g.gain.linearRampToValueAtTime){g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(peak,now+.08);g.gain.linearRampToValueAtTime(peak*.45,now+.7);g.gain.linearRampToValueAtTime(peak*.12,now+len*.75);g.gain.linearRampToValueAtTime(0,now+len);}else g.gain.value=peak*.5;
      const p0=Math.max(-1,Math.min(1,Number(pan)||.5));if(p&&p.pan.setValueAtTime&&p.pan.linearRampToValueAtTime){p.pan.setValueAtTime(p0,now);p.pan.linearRampToValueAtTime(p0*.3,now+len);}
      source.connect(g);if(p){g.connect(p);p.connect(recBus);}else g.connect(recBus);source.start(now);try{source.stop(now+len+.02);}catch{}
      source.onended=()=>{try{source.disconnect();g.disconnect();p?.disconnect();}catch{}};lv.recPass={id,peak};return true;},
    get v3Ready(){return v3Ready;},get v4Ready(){return v4Ready;},get pitReady(){return pitReady;},get v5Ready(){return v5Ready;},
    /** racing-v24: the next 'bump' was a side-by-side contact (the engine marks it before the event) */
    contactSide(){sideNext=true;},
    /** racing-v24: the sounds of one step of the player's stop: 'pitStop' the jack, 'pitChange' guns, wheel off, wheel on, guns (over `seconds`), 'pitDone' the cheer and the engine */
    /** racing-v24.4 (seq): timed to the Codex sequence played over `seconds` (its 0.46 .. 2.30 s): guns at the nut 0.66, old wheels dropped 1.08, new wheels on 1.60, guns 1.69 */
    pitCue(type,seconds=2,seq=false){if(!pitReady||disposed)return false;const S=PIT_SHOTS,at=x=>seq?seconds*(x-.46)/1.84:null;
      if(type==='pitStop')shot('jack',S.jack,1,.5);
      else if(type==='pitChange'){if(seq){shot('wheel_gun_loosen',S.wheel_gun_loosen,1.15,.5,0,at(.66));shot('wheel_drop',S.wheel_drop,1,.5,0,at(1.08));shot('wheel_attach',S.wheel_attach,1,.5,0,at(1.6));shot('wheel_gun_tighten',S.wheel_gun_tighten,1.15,.5,0,at(1.69));}
        else{shot('wheel_gun_loosen',S.wheel_gun_loosen,1.15,.5);shot('wheel_drop',S.wheel_drop,1,.5,0,seconds*.25);shot('wheel_attach',S.wheel_attach,1,.5,0,seconds*.52);shot('wheel_gun_tighten',S.wheel_gun_tighten,1.15,.5,0,seconds*.66);}}
      else if(type==='pitDone'){shot('crew_cheer',S.crew_cheer,1,.5);shot('engine_exit',S.engine_exit,1,.5,0,.25);}
      else return false;return true;},
    /** the levels the layer last set (for tests and the audio log): wind, the v2 tyre squeal, the v3 brake squeal, the three v4 brake loops */
    levels:()=>({...(recReady?{recIdle:lv.recIdle??0,recPass:lv.recPass??null}:{}),wind:lv.wind,squeal:lv.squeal,brakeSqueal:lv.brakeSqueal,brake:[...lv.brake],...(v5Ready?{surface:{...lv.surface},pit:[...lv.pit],brake5:[...lv.brake5]}:{})}),
    /** a game event by the audio engine's names ('bump', 'wall', 'crash', 'crashRecover'); intensity 0..1. Does nothing until v3 is ready. */
    event(name,intensity=1,details={}){
      if(disposed)return;
      // racing-v24 contacts: the hard bump from intensity .5, the soft one under it, a side scrape when the cars touched side by side (or a post); the v3 roll and restart stay
      if(v4Ready&&(name==='bump'||name==='wall')){const side=name==='wall'||details?.side||sideNext;sideNext=false;if(name==='bump')shot(intensity>=.5?'car-bump-hard':'car-bump-soft',intensity>=.5?V4_SHOTS['car-bump-hard']:V4_SHOTS['car-bump-soft'],1,.15);if(side)shot('side-scrape',V4_SHOTS['side-scrape']*(.6+.4*intensity),1,.2);return;}
      if(!v3Ready)return;
      if(name==='bump')shot('car-bump',V3_SHOTS['car-bump'],1,.2);
      else if(name==='wall')shot(intensity>=.5?'wall-scrape-long':'wall-scrape-short',V3_SHOTS['wall-scrape-short'],1,.25);
      else if(name==='crash')shot('crash-roll',V3_SHOTS['crash-roll'],1,.6);
      else if(name==='crashRecover')shot('engine-restart',V3_SHOTS['engine-restart'],1,.6);
    },
    shiftBeep(){if(v3Ready&&beep)shot('shift-light-beep',V3_SHOTS['shift-light-beep'],1,.3);},
    dispose(){if(disposed)return;disposed=true;for(const n of nodes){try{n.stop?.();}catch{}try{n.disconnect();}catch{}}}
  };
}
