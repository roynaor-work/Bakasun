const EVENTS=['shot','hit','explosion','missileLaunch','missileExplosion','bonus','stageEnd'];
export const G2M_SAMPLES=Object.freeze(Object.fromEntries(EVENTS.map(id=>[id,new URL(`../assets/audio/g2m/${id}.ogg?v=g9-20261020-1`,import.meta.url).href])));
/** Alien-only sample bank. The shared shell owns the existing island.sound switch. */
export function createG2mAudio({storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch}={}){
 let context,master,paused=false,disposed=false,loaded=0,played=0;const buffers=new Map(),sources=new Set(),last=new Map();
 const muted=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
 function unlock(){
  if(disposed||!AudioContext)return;
  try{if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.22;master.connect(context.destination);}
   if(!paused&&context.state==='suspended')void context.resume().catch(()=>{});
  }catch{/* Audio support must never stop gameplay. */}
 }
 unlock();
 const ready=context?Promise.all(Object.entries(G2M_SAMPLES).map(async([event,url])=>{try{const r=await fetcher(url);if(!r.ok)return;const b=await context.decodeAudioData(await r.arrayBuffer());if(!disposed){buffers.set(event,b);loaded++;}}catch{}})):Promise.resolve();
 function stop(){for(const s of sources){try{s.stop();}catch{}}sources.clear();}
 function play(event){
  event=event==='upgrade'?'bonus':event;
  if(disposed||paused||muted()||!buffers.has(event)||sources.size>=12)return;
  unlock();if(context.state!=='running')return;
  const now=context.currentTime;if(now-(last.get(event)??-1)<.045)return;last.set(event,now);
  try{if(event==='stageEnd')stop();const source=context.createBufferSource();source.buffer=buffers.get(event);source.connect(master);source.onended=()=>{sources.delete(source);source.disconnect();};sources.add(source);source.start();played++;
   if(event==='missileLaunch'){
    // A soft falling whistle follows the 600 ms motor sample.
    const whistle=context.createOscillator(),gain=context.createGain();whistle.type='sine';whistle.frequency.setValueAtTime(1500,now);whistle.frequency.exponentialRampToValueAtTime(240,now+.6);gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(.12,now+.05);gain.gain.exponentialRampToValueAtTime(.001,now+.6);whistle.connect(gain);gain.connect(master);sources.add(whistle);whistle.onended=()=>{sources.delete(whistle);whistle.disconnect();gain.disconnect();};whistle.start();whistle.stop(now+.6);
   }
  }catch{/* Device interruption is non-fatal. */}
 }
 return {ready,play,unlock,sync(){if(master)master.gain.value=muted()||paused?0:.22;if(muted())stop();},setPaused(value){paused=Boolean(value);if(paused){stop();if(context?.state==='running')void context.suspend().catch(()=>{});}else unlock();},metrics(){return {loaded,played,active:sources.size,muted:muted(),paused,disposed};},dispose({finishTail=false}={}){disposed=true;buffers.clear();const close=()=>{stop();if(context)void context.close().catch(()=>{});};if(finishTail&&sources.size)setTimeout(close,1300);else close();}};
}
