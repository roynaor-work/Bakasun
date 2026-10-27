const EVENTS=['shot','hit','explosion','missileLaunch','missileExplosion','bonus','stageEnd'];
export const G2M_SAMPLES=Object.freeze(Object.fromEntries(EVENTS.map(id=>[id,new URL(`../assets/audio/g2m/${id}.ogg?v=island-naval-aim-20261027-1`,import.meta.url).href])));
export const G2M_LEVELS=Object.freeze({shot:.07,hit:.145,explosion:.21,missileLaunch:.22,missileExplosion:.36,bonus:.195,stageEnd:.235});
/** Alien-only sample bank. The shared shell owns the existing island.sound switch. */
export function createG2mAudio({storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch}={}){
 let context,master,noise,paused=false,disposed=false,loaded=0,played=0;const buffers=new Map(),sources=new Set(),last=new Map();
 const muted=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
 function unlock(){
  if(disposed||!AudioContext)return;
  try{if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.3;master.connect(context.destination);
    noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=noise.getChannelData(0);let low=0;for(let i=0;i<data.length;i++){low=low*.92+(Math.random()*2-1)*.08;data[i]=low;}}
   if(!paused&&context.state==='suspended')void context.resume().catch(()=>{});
  }catch{/* Audio support must never stop gameplay. */}
 }
 unlock();
 const ready=context?Promise.all(Object.entries(G2M_SAMPLES).map(async([event,url])=>{try{const r=await fetcher(url);if(!r.ok)return;const b=await context.decodeAudioData(await r.arrayBuffer());if(!disposed){buffers.set(event,b);loaded++;}}catch{}})):Promise.resolve();
 function stop(){for(const s of sources){try{s.stop();}catch{}}sources.clear();}
 // A codec/network failure still produces a soft layered cue. Every voice has
 // an attack/release envelope; no hard-edged single oscillator fallback.
 function fallback(event,now){
  const level=G2M_LEVELS[event],duration={shot:.105,hit:.17,explosion:.38,missileLaunch:.6,missileExplosion:.8,bonus:.42,stageEnd:.92}[event];
  const hz={shot:420,hit:220,explosion:95,missileLaunch:950,missileExplosion:62,bonus:523,stageEnd:392}[event];
  function voice(source,amount,filter){const gain=context.createGain();gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(amount,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);source.connect(filter||gain);filter?.connect(gain);gain.connect(master);sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();filter?.disconnect();gain.disconnect();};source.start();source.stop(now+duration);}
  for(const ratio of [1,1.997]){const tone=context.createOscillator();tone.type='sine';tone.frequency.setValueAtTime(hz*ratio,now);tone.frequency.exponentialRampToValueAtTime(hz*ratio*.48,now+duration);voice(tone,level*(ratio===1?.65:.18));}
  const air=context.createBufferSource(),filter=context.createBiquadFilter();air.buffer=noise;filter.type='lowpass';filter.frequency.value=event==='missileLaunch'?1500:650;voice(air,level*.4,filter);
 }
 function play(event){
  event=event==='upgrade'?'bonus':event;
  if(disposed||paused||muted()||!G2M_LEVELS[event]||sources.size>=18)return;
  unlock();if(context.state!=='running')return;
  const now=context.currentTime;if(now-(last.get(event)??-1)<.045)return;last.set(event,now);
  try{if(event==='stageEnd')stop();if(buffers.has(event)){const source=context.createBufferSource();source.buffer=buffers.get(event);source.connect(master);source.onended=()=>{sources.delete(source);source.disconnect();};sources.add(source);source.start();}else fallback(event,now);played++;
  }catch{/* Device interruption is non-fatal. */}
 }
 return {ready,play,unlock,sync(){if(master)master.gain.value=muted()||paused?0:.3;if(muted())stop();},setPaused(value){paused=Boolean(value);if(paused){stop();if(context?.state==='running')void context.suspend().catch(()=>{});}else unlock();},metrics(){return {loaded,played,active:sources.size,muted:muted(),paused,disposed};},dispose({finishTail=false}={}){disposed=true;buffers.clear();const close=()=>{stop();if(context)void context.close().catch(()=>{});};if(finishTail&&sources.size)setTimeout(close,1300);else close();}};
}
