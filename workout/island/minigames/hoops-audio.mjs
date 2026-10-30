/** Basketball presentation audio. The authored mix supplies gains, filters, layer
 * recipes and voice limits. Sound never changes the match or saved club state. */
export function createHoopsAudio({config={},storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch}={}){
 const mixURL=new URL('../design/audio/mix.json',import.meta.url);
 const aliases={bounce:'basketball/bounce',swish:'basketball/swish',rim:'basketball/rim',shoes:'basketball/shoes',buzzer:'basketball/buzzer',crowd:'basketball/crowd-excited',calm:'basketball/crowd-calm',ambience:'basketball/ambience-loop',opening:'scenes/opening',victory:'scenes/victory',defeat:'scenes/defeat'};
 const buffers=new Map(),specs=new Map(),active=new Set(),last=new Map(),played={};
 let context,master,bedGain,limiter,pauseTimer,duckTimer,bed=null,mix=null,paused=false,disposed=false,muted=false,decoded=false,openingPlayed=false,final=false,holds=[];
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
  return Promise.all([...specs].map(async([name,spec])=>{try{const res=await fetcher(spec.url);if(!res.ok)return null;return [name,await res.arrayBuffer()];}catch{return null;}}));
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
 function layer(name){
  const recipe=mix?.layers?.[name];if(!recipe)return play(name,{priority:1});
  if(!context||paused||muted||disposed)return false;
  for(const voice of [...active])if(recipe.exclude?.includes(voice.key))stopVoice(voice,true);
  if(recipe.duck_bed_db!==undefined){holds.push({gain:db(recipe.duck_bed_db),until:context.currentTime+(recipe.duck_hold_ms??0)/1000});duck();}
  const timeline=recipe.timeline||recipe.events?.map(asset=>({asset,at_ms:0}))||[];
  let sounded=false;
  for(const event of timeline)sounded=play(event.asset,{delay:(event.at_ms??0)/1000,layerName:name,priority:name==='victory'||name==='defeat'?2:1})||sounded;
  return sounded;
 }
 function ensureBed(){
  if(!decoded||disposed||paused||muted||final||bed||context?.state!=='running')return;
  play('ambience');
  if(!openingPlayed&&buffers.has(aliases.opening))openingPlayed=layer('opening');
 }
 function unlock(){
  if(disposed||paused||!AudioContext)return;
  try{
   if(!context){
    context=new AudioContext();master=context.createGain();master.gain.value=0;bedGain=context.createGain();bedGain.connect(master);
    // Catch overlap without raising any of the authored sample gains.
    if(context.createDynamicsCompressor){limiter=context.createDynamicsCompressor();limiter.threshold.value=mix?.master?.suggested_limiter_ceiling_dbtp??-1;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.15;master.connect(limiter);limiter.connect(context.destination);}else master.connect(context.destination);
    const decodingContext=context;
    void files.then(async entries=>{
     for(const entry of entries.filter(Boolean)){
      if(disposed||context!==decodingContext)return;
      try{const buffer=await decodingContext.decodeAudioData(entry[1].slice(0));if(!disposed&&context===decodingContext)buffers.set(entry[0],buffer);}catch{}
     }
     if(disposed||context!==decodingContext)return;decoded=true;sync();ensureBed();
    });
   }
   sync();if(context.state==='suspended')void context.resume().then(ensureBed).catch(()=>{});else ensureBed();
  }catch{}
 }
 function play(name,{volume=1,rate=1,delay=0,layerName=null,priority=0}={}){
  sync();const key=aliases[name]||name,spec=specs.get(key),buffer=buffers.get(key);
  if(disposed||paused||muted||!context||context.state!=='running'||!buffer||!spec)return false;
  const loop=!!spec.loop,now=context.currentTime;
  if(loop&&bed)return false;
  if(!loop&&now-(last.get(key)??-10)<(spec.cooldown_ms??100)/1000)return false;
  // Crowd alternatives and scene cues are exclusive, including queued sources.
  const group=Object.values(mix?.exclusive_groups||{}).find(members=>members.includes(key));
  if(group)for(const voice of [...active])if(group.includes(voice.key))stopVoice(voice,true);
  if([...active].filter(v=>v.key===key&&!v.ended).length>=(spec.max_voices??2))return false;
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
   for(const [type,freq] of [['highpass',spec.filters?.highpass_hz],['lowpass',spec.filters?.lowpass_hz]])if(freq){const filter=context.createBiquadFilter();filter.type=type;filter.frequency.value=freq;filter.Q.value=spec.filters.q??.7071;tail.connect(filter);tail=filter;nodes.push(filter);}
   tail.connect(gain);gain.connect(loop?bedGain:master);gain.gain.value=0;
   voice={source,gain,nodes,key,loop,layerName,priority,startAt:now+delay,ended:false,stopping:false};active.add(voice);if(loop)bed=voice;
   source.onended=()=>disconnect(voice);ramp(gain.gain,volume*(spec.recommended_gain_linear??db(spec.recommended_gain_db??0)),fade(),delay);source.start(now+delay);
   last.set(key,now);const metricName=Object.keys(aliases).find(alias=>aliases[alias]===key)||name;played[metricName]=(played[metricName]||0)+1;return true;
  }catch{if(voice)disconnect(voice);return false;}
 }
 const map={floor:['bounce',.8],rim:['rim',.75],board:['board',.9],pad:['board',.5],pass:['pass',.8],release:['pass',.45],steal:['shoes',.6],interception:['shoes',.6],block:['board',1],foul:['whistle',.9],violation:['whistle',.9],buzzer:['buzzer',1],quarterEnd:['buzzer',1],jumpBall:['whistle',.7],timeout:['whistle',.8],goaltending:['whistle',.9]};
 return {
  unlock,play,sync,
  events(list){for(const e of list){
   if(e.type==='final'){final=true;stop(true);layer(e.won?'victory':'defeat');continue;}
   if(e.type==='score'){if(mix?.layers?.basketball_score)layer('basketball_score');else {play('swish');play('crowd');}continue;}
   const type=e.type==='contact'?e.what:e.type,m=map[type];if(!m)continue;
   const v=e.speed?Math.min(1,.35+e.speed*.12):1;play(m[0],{volume:m[1]*v,rate:type==='floor'?1+Math.min(.3,(e.speed||0)*.03):1});
  }},
  dribble(speed){play('bounce',{volume:.35+Math.min(.3,speed*.05),rate:1.05,layerName:'basketball_play'});if(speed>3)play('shoes',{volume:.4,layerName:'basketball_play'});},
  setPaused(value){
   paused=!!value;clearTimeout(pauseTimer);clearTimeout(duckTimer);holds=[];sync();
   if(paused){stop();pauseTimer=setTimeout(()=>{if(paused&&!disposed&&context?.state==='running')void context.suspend().catch(()=>{});},fade()*1000);}
   else {stop(true);if(bedGain)bedGain.gain.value=1;unlock();}
  },
  metrics(){return {context:context?.state||'none',buffers:buffers.size,active:active.size,events:[...active].filter(v=>!v.loop).length,bed:bed?.key||null,played:{...played},muted,paused,disposed,mix:!!mix,duckGain:bedGain?.gain.value??1,scheduled:[...active].filter(v=>v.startAt>(context?.currentTime??0)).map(v=>({sample:v.key,at:v.startAt}))};},
  dispose(){if(disposed)return;disposed=true;clearTimeout(pauseTimer);clearTimeout(duckTimer);holds=[];stop(true);buffers.clear();for(const node of [bedGain,master,limiter])try{node?.disconnect();}catch{}if(context&&context.state!=='closed')void context.close().catch(()=>{});context=null;},
 };
}
