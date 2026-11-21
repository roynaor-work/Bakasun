/** Basketball presentation audio. The authored mix supplies gains, filters, layer
 * recipes and voice limits. Sound never changes the match or saved club state. */
import {hoopsWhistleGain,createWhistleGate,WHISTLE_SPACING} from './sports-audio-rules.mjs';
import {scoreCrowdSample} from './hoops-show.mjs';
import {hoopsImpactSamples,hoopsImpactCue} from './hoops-polish-audio.mjs';
import {hoopsWhistleV241Enabled,hoopsRefereeWhistle,HOOPS_REFEREE_WHISTLES} from './hoops-v241.mjs?v=island-v2-20261107-21';
const phoneFixAEnabled=()=>{try{const p=new URLSearchParams(globalThis.location?.search||'');return p.get('phoneFixes')!=='0'&&p.get('phoneFixA')!=='0';}catch{return true;}};
/** A short, damped rim/ball impact. One deterministic PCM buffer per audio context, JavaScript only.
 * Three inharmonic steel modes decay inside 180 ms, with an 8 ms contact transient and a short ball thump. */
export function createBasketballRimBuffer(context){
 const rate=context.sampleRate||44100,buffer=context.createBuffer(1,Math.round(rate*.18),rate),samples=buffer.getChannelData(0);let seed=1979,peak=0;
 for(let i=0;i<samples.length;i++){const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=(seed/4294967296)*2-1;
  const metal=(.48*Math.sin(2*Math.PI*730*t)+.24*Math.sin(2*Math.PI*1213*t)+.12*Math.sin(2*Math.PI*2247*t))*Math.exp(-t/.025);
  const contact=.28*noise*Math.exp(-t/.008),ball=.23*Math.sin(2*Math.PI*155*t)*Math.exp(-t/.018);
  const end=Math.min(1,(samples.length-i)/(rate*.012));samples[i]=(metal+contact+ball)*end;peak=Math.max(peak,Math.abs(samples[i]));}
 if(peak)for(let i=0;i<samples.length;i++)samples[i]*=.85/peak;
 return buffer;
}
const wallClock=()=>(globalThis.performance?.now()??Date.now())/1000;
// Sneaker squeak on every fast dribble: basketball/shoes.ogg is a 1.7 kHz lead-in that drops
// to a pure 1.08 kHz tone (audio-forensics 11/11/2026: 34 squeaks in 3 minutes of live play,
// the loudest thing in the frame). Roy heard it as "a strange whistle during play".
// Off by default; ?hoopsSqueak=1 restores it. Steals and feel cues keep the sample.
const squeakOn=()=>{try{return new URLSearchParams(globalThis.location?.search||'').get('hoopsSqueak')==='1';}catch{return false;}};
// v24.1 (Roy: "a referee whistle on a steal"): `refereeWhistles` plays the Codex pack's short whistle on a steal or an intercepted pass and its long
// whistle on a foul (hoops-v241.mjs); `?hoopsWhistleV241=0` restores v24 (a shoe squeak on a steal, the old sample on fouls).
export function createHoopsAudio({config={},storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch,clock=wallClock,dribbleSqueak=squeakOn(),refereeWhistles=hoopsWhistleV241Enabled(),phoneFix=phoneFixAEnabled(),impactPolish=false}={}){
 const mixURL=new URL('../design/audio/mix.json',import.meta.url);
 const aliases={bounce:'basketball/bounce',swish:'basketball/swish',rim:'basketball/rim',shoes:'basketball/shoes',buzzer:'basketball/buzzer',crowd:'basketball/crowd-excited',calm:'basketball/crowd-calm',ambience:'basketball/ambience-loop',opening:'scenes/opening',victory:'scenes/victory',defeat:'scenes/defeat'};
 const buffers=new Map(),specs=new Map(),active=new Set(),last=new Map(),played={},altDecoded=[],referee={steal:0,foul:0,fallback:0,gated:0};
 let context,master,bedGain,limiter,pauseTimer,duckTimer,bed=null,mix=null,paused=false,disposed=false,muted=false,decoded=false,openingPlayed=false,final=false,holds=[],jumpBalls=0;
 // Whistle spacing runs on the wall clock (the context may not exist yet).
 const gate=createWhistleGate(WHISTLE_SPACING.hoops);
 const db=n=>Math.pow(10,n/20),fade=()=>Math.max(.001,(mix?.playback?.start_stop_fade_ms??40)/1000);
 const files=(async()=>{
  try{
   const res=await fetcher(mixURL);if(!res.ok)throw Error('audio mix unavailable');mix=await res.json();
   for(const [name,spec] of Object.entries(mix.assets))if(name.startsWith('basketball/')||name.startsWith('scenes/'))specs.set(name,{...spec,url:new URL(spec.file,mixURL)});
  }catch{}
  // The basketball package has no pass, backboard or referee whistle: retain
  // these three existing local samples rather than substituting a buzzer.
  for(const name of ['pass','board','whistle'])if(config.samples?.[name])specs.set(name,{url:new URL('../'+config.samples[name],import.meta.url),recommended_gain_linear:.5,max_voices:2,cooldown_ms:100});
  if(!mix)for(const [name,path] of Object.entries(config.samples||{}))if(!specs.has(aliases[name]||name))specs.set(aliases[name]||name,{url:new URL('../'+path,import.meta.url),recommended_gain_linear:.5,max_voices:2,cooldown_ms:100});
  // v24.1 referee whistles: OGG, and the MP3 of the same pack when the OGG does not decode (decode loop below); one voice each
  if(refereeWhistles)for(const [kind,w] of Object.entries(HOOPS_REFEREE_WHISTLES)){const dir='../assets/hoops-v241/referee-audio/'+w.id;specs.set('ref:'+kind,{url:new URL(dir+'.ogg',import.meta.url),alt:new URL(dir+'.mp3',import.meta.url),recommended_gain_linear:w.volume,max_voices:1,cooldown_ms:250});}
  if(impactPolish)for(const [name,spec] of hoopsImpactSamples())specs.set(name,spec);
  return Promise.all([...specs].filter(([,spec])=>spec.url).map(async([name,spec])=>{
   try{const res=await fetcher(spec.url);if(res.ok)return [name,await res.arrayBuffer()];}catch{}
   return spec.impact?[name,null]:null;
  }));
 })();
 function ramp(param,value,seconds=fade(),delay=0){
  if(!context||!param)return;const now=context.currentTime;
  param.cancelScheduledValues(now);param.setValueAtTime(param.value,now+delay);param.linearRampToValueAtTime(value,now+delay+seconds);
 }
 function sync(){
  try{muted=storage?.getItem('island.sound')==='off';}catch{}
  if(master)ramp(master.gain,muted||paused?0:(config.volume??.42)*db(mix?.master?.recommended_gain_db??-3));
 }
 function duck(){
  clearTimeout(duckTimer);if(!bedGain||disposed||paused||!context)return;
  const now=context.currentTime;holds=holds.filter(h=>h.until>now);
  const target=holds.length?Math.min(...holds.map(h=>h.gain)):1;
  ramp(bedGain.gain,target,(target<bedGain.gain.value?(mix?.master?.duck_attack_ms??35):(mix?.master?.duck_release_ms??350))/1000);
  if(holds.length)duckTimer=setTimeout(duck,Math.max(1,(Math.min(...holds.map(h=>h.until))-now)*1000));
 }
 function disconnect(voice){
  if(voice.ended)return;voice.ended=true;active.delete(voice);if(bed===voice)bed=null;
  for(const node of voice.nodes)try{node.disconnect();}catch{}
 }
 function stopVoice(voice,immediate=false){
  if(voice.ended||voice.stopping&&!immediate)return;voice.stopping=true;
  if(immediate){try{voice.source.stop();}catch{}disconnect(voice);return;}
  ramp(voice.gain.gain,0);try{voice.source.stop(context.currentTime+fade());}catch{disconnect(voice);}
 }
 function stop(immediate=false){for(const voice of [...active])stopVoice(voice,immediate);}
 function layer(name,scoreEvent){
  const recipe=mix?.layers?.[name];if(!recipe)return play(name,{priority:1});
  if(!context||paused||muted||disposed)return false;
  for(const voice of [...active])if(recipe.exclude?.includes(voice.key))stopVoice(voice,true);
  if(recipe.duck_bed_db!==undefined){holds.push({gain:db(recipe.duck_bed_db),until:context.currentTime+(recipe.duck_hold_ms??0)/1000});duck();}
  const timeline=recipe.timeline||recipe.events?.map(asset=>({asset,at_ms:0}))||[];
  let sounded=false;
  for(const event of timeline){
   const options={delay:(event.at_ms??0)/1000,layerName:name,priority:name==='victory'||name==='defeat'?2:1};
   sounded=(scoreEvent&&event.asset===aliases.swish?scoreSwish(scoreEvent,options):play(event.asset,options))||sounded;
  }
  return sounded;
 }
 function ensureBed(){
  if(!decoded||disposed||paused||muted||final||context?.state!=='running')return;
  // No continuous bed: the steady hall-noise loop read as a constant whistle/hiss.
  // The crowd sounds only on events (score, final) and the referee whistle only on a call.
  if(!openingPlayed&&buffers.has(aliases.opening))openingPlayed=layer('opening');
 }
 function unlock(){
  if(disposed||paused||!AudioContext)return;
  try{
   if(!context){
    context=new AudioContext();
    if(phoneFix){buffers.set('phone:rim',createBasketballRimBuffer(context));specs.set('phone:rim',{recommended_gain_linear:.5,max_voices:2,cooldown_ms:90,filters:{highpass_hz:100,lowpass_hz:5000}});}
    master=context.createGain();master.gain.value=0;bedGain=context.createGain();bedGain.connect(master);
    // Catch overlap without raising any of the authored sample gains.
    if(context.createDynamicsCompressor){limiter=context.createDynamicsCompressor();limiter.threshold.value=mix?.master?.suggested_limiter_ceiling_dbtp??-1;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.15;master.connect(limiter);limiter.connect(context.destination);}else master.connect(context.destination);
    const decodingContext=context;
    void files.then(async entries=>{
     for(const entry of entries.filter(Boolean)){
      if(disposed||context!==decodingContext)return;
      try{if(!entry[1])throw Error('Audio sample unavailable');const buffer=await decodingContext.decodeAudioData(entry[1].slice(0));if(!disposed&&context===decodingContext)buffers.set(entry[0],buffer);}
      catch{
       // A sample with a second format can use the MP3 when Ogg is unavailable.
       const alt=specs.get(entry[0])?.alt;
       if(alt)try{const res=await fetcher(alt);if(res.ok){const buffer=await decodingContext.decodeAudioData(await res.arrayBuffer());if(!disposed&&context===decodingContext){buffers.set(entry[0],buffer);altDecoded.push(entry[0]);}}}catch{}
      }
     }
     if(disposed||context!==decodingContext)return;decoded=true;sync();ensureBed();
    });
   }
   sync();if(context.state==='suspended')void context.resume().then(ensureBed).catch(()=>{});else ensureBed();
  }catch{}
 }
 function play(name,{volume=1,rate=1,delay=0,layerName=null,priority=0,impactKind=null,cooldown,lowpass}={}){
  sync();const key=phoneFix&&(name==='rim'||name===aliases.rim)?'phone:rim':aliases[name]||name,spec=specs.get(key),buffer=buffers.get(key);
  if(disposed||paused||muted||!context||context.state!=='running'||!buffer||!spec)return false;
  const loop=!!spec.loop,now=context.currentTime,voiceKey=impactKind?'impact-kind:'+impactKind:key;
  if(loop&&bed)return false;
  if(!loop&&now-(last.get(voiceKey)??-10)<(cooldown??spec.cooldown_ms??100)/1000)return false;
  // Crowd alternatives and scene cues are exclusive, including queued sources.
  const group=Object.values(mix?.exclusive_groups||{}).find(members=>members.includes(key));
  if(group)for(const voice of [...active])if(group.includes(voice.key))stopVoice(voice,true);
  if([...active].filter(v=>v.voiceKey===voiceKey&&!v.ended).length>=(spec.max_voices??2))return false;
  const eventVoices=[...active].filter(v=>!v.loop&&!v.ended);
  if(layerName&&eventVoices.filter(v=>v.layerName===layerName).length>=(mix?.layers?.[layerName]?.max_concurrent_events??Infinity))return false;
  if(!loop&&eventVoices.length>=(mix?.master?.max_simultaneous_events??3)){
   const victim=eventVoices.find(v=>v.priority<priority);if(!victim)return false;stopVoice(victim,true);
  }
  let voice;
  try{
   const source=context.createBufferSource(),gain=context.createGain(),nodes=[source,gain];source.buffer=buffer;source.loop=loop;source.playbackRate.value=rate;
   // Preserve the package's exact full decoded loop endpoints.
   if(loop){source.loopStart=0;source.loopEnd=buffer.duration;}
   let tail=source;
   for(const [type,freq] of [['highpass',spec.filters?.highpass_hz],['lowpass',lowpass??spec.filters?.lowpass_hz]])if(freq){const filter=context.createBiquadFilter();filter.type=type;filter.frequency.value=freq;filter.Q.value=spec.filters.q??.7071;tail.connect(filter);tail=filter;nodes.push(filter);}
   tail.connect(gain);gain.connect(loop?bedGain:master);gain.gain.value=0;
   voice={source,gain,nodes,key,voiceKey,loop,layerName,priority,startAt:now+delay,ended:false,stopping:false};active.add(voice);if(loop)bed=voice;
   source.onended=()=>disconnect(voice);ramp(gain.gain,volume*(spec.recommended_gain_linear??db(spec.recommended_gain_db??0)),spec.attack??(key==='phone:rim'?.002:fade()),delay);source.start(now+delay);
   last.set(voiceKey,now);const metricName=Object.keys(aliases).find(alias=>aliases[alias]===key)||name;played[metricName]=(played[metricName]||0)+1;return true;
  }catch{if(voice)disconnect(voice);return false;}
 }
 // Return true for an available sample even when muted or gated; never double a contact with the old sound.
 function playImpact(kind,speed,{level=1,...options}={}){
  if(!impactPolish)return false;
  const cue=hoopsImpactCue(kind,speed);
  if(!cue)return false;
  const key='impact:'+cue.sample;
  if(!buffers.has(key))return false;
  play(key,{...options,impactKind:kind,volume:cue.volume*level,rate:cue.rate??1,lowpass:cue.lowpass,cooldown:cue.cooldown,priority:cue.priority});
  return true;
 }
 function scoreSwish(e,options){
  if(impactPolish&&e.goaltend)return false;
  return playImpact('net',undefined,options)||play('swish',options);
 }
 const map={floor:['bounce',.8],rim:['rim',.75],board:['board',.9],pad:['board',.5],pass:['pass',.8],release:['pass',.45],steal:['shoes',.6],interception:['shoes',.6],block:['board',1],buzzer:['buzzer',1],quarterEnd:['buzzer',1]};
 // Referee whistle: foul, violation (out of bounds quieter), goaltending, timeout
 // and the opening tip only; inbounds and quarter starts are silent or the horn.
 // Two calls close together (out then foul) sound as one whistle.
 function whistle(e){
  // phone A: only rule infringements, ball out, and expired possession/game clocks earn a call. Timeouts and the opening tip stay quiet.
  if(phoneFix&&!['foul','violation','goaltending'].includes(e.type))return false;
  const gain=hoopsWhistleGain(e.type,e,{jumpBalls});if(e.type==='jumpBall')jumpBalls++;
  if(!gain||!gate.allow(clock()))return false;
  return play('whistle',{volume:gain});
 }
 // v24.1: the referee's own whistles. A steal or an intercepted pass blows the short one (in place of the v24 shoe squeak), a foul the long one
 // (at the v24 foul gain). The same 2.5 s gate as every call, so a steal and a foul right after it sound once. A whistle whose file did not
 // load falls back to v24: the old sample for a foul, the squeak for a steal.
 function refereeWhistle(kind,e){
  const key='ref:'+kind;
  if(!buffers.has(key)){referee.fallback++;return kind==='foul'?whistle(e):play('shoes',{volume:.6});}
  if(!gate.allow(clock())){referee.gated++;return false;}
  const ok=play(key,{volume:kind==='foul'?hoopsWhistleGain('foul',e):1,priority:1});if(ok)referee[kind]++;return ok;
 }
 return {
  unlock,play,sync,
  // show (M4): the visitors' basket gets the swish and the calm crowd instead of the excited layer (same cooldowns, one voice, no bed)
  events(list,{show=false,userTeam=0}={}){for(const e of list){
   if(e.type==='final'){final=true;stop(true);layer(e.won?'victory':'defeat');continue;}
   if(e.type==='score'){
    if(show&&scoreCrowdSample(e,{show,userTeam})==='calm'){scoreSwish(e);play('calm');}
    else if(mix?.layers?.basketball_score)layer('basketball_score',impactPolish?e:null);
    else {scoreSwish(e);play('crowd');}
    continue;
   }
   // A clean possession change never blows a whistle or consumes the call spacing gate.
   if(phoneFix&&(e.type==='steal'||e.type==='interception'))continue;
   const ref=refereeWhistles?hoopsRefereeWhistle(e):null;
   if(ref){refereeWhistle(ref,e);continue;}
   if(e.type==='foul'||e.type==='violation'||e.type==='goaltending'||e.type==='timeout'||e.type==='jumpBall'){whistle(e);continue;}
   const type=e.type==='contact'?e.what:e.type;
   if(playImpact(type==='bounce'?'floor':type,e.speed))continue;
   const m=map[type];if(!m)continue;
   const v=e.speed?Math.min(1,.35+e.speed*.12):1;play(m[0],{volume:m[1]*v,rate:type==='floor'?1+Math.min(.3,(e.speed||0)*.03):1});
  }},
  dribble(speed){
   if(!playImpact('floor',1.4+Math.max(0,speed)*.32,{level:.55,layerName:'basketball_play'}))play('bounce',{volume:.35+Math.min(.3,speed*.05),rate:1.05,layerName:'basketball_play'});
   if(dribbleSqueak&&speed>3)play('shoes',{volume:.4,layerName:'basketball_play'});
  },
  setPaused(value){
   paused=!!value;clearTimeout(pauseTimer);clearTimeout(duckTimer);holds=[];sync();
   if(paused){stop();pauseTimer=setTimeout(()=>{if(paused&&!disposed&&context?.state==='running')void context.suspend().catch(()=>{});},fade()*1000);}
   else {stop(true);if(bedGain)bedGain.gain.value=1;unlock();}
  },
  metrics(){return {impact:impactPolish?{ready:[...buffers.keys()].filter(k=>k.startsWith('impact:')),mp3:altDecoded.filter(k=>k.startsWith('impact:'))}:null,phoneFixA:phoneFix,rim:phoneFix?{source:'javascript',seconds:.18}:null,context:context?.state||'none',buffers:buffers.size,active:active.size,events:[...active].filter(v=>!v.loop).length,loops:[...active].filter(v=>v.loop&&!v.ended).length,bed:bed?.key||null,played:{...played},muted,paused,disposed,mix:!!mix,duckGain:bedGain?.gain.value??1,whistle:{last:gate.last,blocked:gate.blocked,jumpBalls,v241:refereeWhistles,referee:{...referee,ready:['steal','foul'].filter(k=>buffers.has('ref:'+k)),mp3:altDecoded.filter(k=>k.startsWith('ref:'))}},dribbleSqueak,scheduled:[...active].filter(v=>v.startAt>(context?.currentTime??0)).map(v=>({sample:v.key,at:v.startAt}))};},
  dispose(){if(disposed)return;disposed=true;clearTimeout(pauseTimer);clearTimeout(duckTimer);holds=[];stop(true);buffers.clear();for(const node of [bedGain,master,limiter])try{node?.disconnect();}catch{}if(context&&context.state!=='closed')void context.close().catch(()=>{});context=null;},
 };
}
