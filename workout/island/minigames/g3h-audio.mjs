// Soccer owns this bank and ambience. The existing shell still owns island.sound.
export const G3H_AUDIO_FILES=Object.freeze({
 kick:new URL('../assets/audio/g3h/kick.ogg?v=g9-20261020-1',import.meta.url).href,
 pass:new URL('../assets/audio/g3h/pass.ogg?v=g9-20261020-1',import.meta.url).href,
 whistle:new URL('../assets/audio/g3h/whistle.ogg?v=g9-20261020-1',import.meta.url).href,
 crowd:new URL('../assets/audio/g3h/crowd.ogg?v=g9-20261020-1',import.meta.url).href
});
export function soccerAudioCues(event){
 return {goal:['whistle','net','cheer'],restart:['whistle'],halftime:['whistle'],fulltime:['whistle','whistle','whistle'],play:['whistle'],shot:['kick'],header:['kick'],volley:['kick'],pass:['pass'],loft:['pass'],throw:['pass'],post:['kick'],slide:['slide']}[event?.type]||[];
}
export function createG3hAudio({storage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch}={}){
 let context,master,ambience,ambienceGain,loading,disposed=false,paused=false,muted=false,excitement=0;
 let netBuffer;
 const buffers=new Map(),sources=new Set(),pending=[],counts={};
 const readMute=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
 function sync(){muted=readMute();if(master)master.gain.setTargetAtTime(paused||muted?0:.32,context.currentTime,.025);}
 async function unlock(){
  if(disposed||paused||!AudioContext)return;
  try{
   if(!context){
    context=new AudioContext();master=context.createGain();master.gain.value=0;master.connect(context.destination);
    loading=Promise.all(Object.entries(G3H_AUDIO_FILES).map(async([key,url])=>{
     try{const response=await fetcher(url);if(!response.ok)return;const data=await response.arrayBuffer(),buffer=await context.decodeAudioData(data);if(!disposed)buffers.set(key,buffer);}catch{/* A missing sample cannot stop a match. */}
    })).then(()=>{if(!disposed){startCrowd();for(const [cue,delay]of pending.splice(0))voice(cue,delay);}});
   }
   sync();if(context.state==='suspended')await context.resume();startCrowd();
  }catch{/* Audio interruptions are non-fatal. */}
 }
 function startCrowd(){
  if(disposed||ambience||!buffers.has('crowd'))return;
  ambience=context.createBufferSource();ambience.buffer=buffers.get('crowd');ambience.loop=true;
  const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1900;
  ambienceGain=context.createGain();ambienceGain.gain.value=.09;ambience.connect(filter);filter.connect(ambienceGain);ambienceGain.connect(master);ambience.start();
 }
 function voice(cue,delay=0){
  if(disposed||paused||readMute()||!context||context.state==='closed')return;
  if(cue==='net'&&!netBuffer){
   netBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.28),context.sampleRate);
   const samples=netBuffer.getChannelData(0);let seed=39,last=0;
   for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;last=last*.4+noise*.6;samples[i]=last*Math.exp(-i/samples.length*5);}
  }
  const key=cue==='cheer'?'crowd':cue==='slide'?'pass':cue,buffer=cue==='net'?netBuffer:buffers.get(key);
  if(!buffer){if(pending.length<12)pending.push([cue,delay]);return;}
  const source=context.createBufferSource(),gain=context.createGain(),now=context.currentTime+delay;
  source.buffer=buffer;source.playbackRate.value=cue==='cheer'?1.07:cue==='slide'?.65:cue==='net'?.72:1;
  const duration=cue==='cheer'?Math.min(2,buffer.duration):buffer.duration;
  gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(cue==='cheer'?.65:cue==='kick'?.9:.65,now+.012);gain.gain.setTargetAtTime(.001,now+duration*.65,duration*.12);
  if(cue==='net'){const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=850;source.connect(filter);filter.connect(gain);}else source.connect(gain);gain.connect(master);sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();if(disposed&&!sources.size&&context.state!=='closed')void context.close().catch(()=>{});};source.start(now);source.stop(now+duration+.08);
 }
 function play(cue,delay=0){if(disposed||paused||readMute())return;counts[cue]=(counts[cue]||0)+1;voice(cue,delay);}
 function event(value){soccerAudioCues(value).forEach((cue,index)=>play(cue,value?.type==='goal'?[0,.04,.08][index]:index*.45));}
 return {
  unlock,play,event,
  update(state){
   if(disposed)return;sync();
   const b=state.ball,hx=18,owner=b.owner===null?null:state.players[b.owner],danger=owner?Math.max(0,owner.x*(owner.team===0?state.attackDir:-state.attackDir)/hx):Math.abs(b.x)/hx;
   excitement=state.phase==='goal'?1:Math.min(1,danger*.8+(Math.hypot(b.vx,b.vz)>10?.2:0));
   if(ambienceGain)ambienceGain.gain.setTargetAtTime(.09+excitement*.22,context.currentTime,.4);
  },
  setPaused(value){paused=Boolean(value);pending.length=0;sync();if(paused){for(const source of sources){try{source.stop();}catch{}}if(context?.state==='running')void context.suspend().catch(()=>{});}else void unlock();},
  get snapshot(){return {muted,paused,disposed,contextState:context?.state||'uninitialized',loaded:[...buffers.keys()],crowd:Boolean(ambience),excitement,counts:{...counts},active:sources.size};},
  get ready(){return loading||Promise.resolve();},
  dispose({finish=false}={}){if(disposed)return;disposed=true;pending.length=0;ambience?.stop();if(!finish)for(const source of sources){try{source.stop();}catch{}}if(context&&context.state!=='closed'&&(!finish||!sources.size))void context.close().catch(()=>{});}
 };
}
