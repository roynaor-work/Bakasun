// Tennis owns its sample bank and lifecycle; the island's shared sound switch
// remains authoritative. Samples are Kenney CC0 (sources in notes/g4e-qa.md).
export function createTennisAudio({config,storage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch}={}){
 let context,master,paused=false,disposed=false,muted=false;const buffers=new Map(),active=new Set(),last=new Map();
 function sync(){try{muted=storage?.getItem('island.sound')==='off';}catch{}if(master)master.gain.value=muted||paused?0:config.volume;}
 const files=Promise.all(Object.entries(config.samples).map(async([name,path])=>{try{const response=await fetcher(new URL('../'+path+'?v=g9-20261020-1',import.meta.url));if(!response.ok)return;return [name,await response.arrayBuffer()];}catch{return;}}));
 function unlock(){if(disposed||paused||!AudioContext)return;try{if(!context){context=new AudioContext();master=context.createGain();master.connect(context.destination);sync();void files.then(async entries=>{for(const entry of entries.filter(Boolean)){try{const decoded=await context.decodeAudioData(entry[1]);if(!disposed)buffers.set(entry[0],decoded);}catch{}}});}if(context.state==='suspended')void context.resume().catch(()=>{});}catch{}}
 function play(name){sync();if(disposed||paused||muted||!context||context.state!=='running'||!buffers.has(name)||active.size>=8)return;const now=context.currentTime;if(now-(last.get(name)??-10)<.05)return;last.set(name,now);try{const source=context.createBufferSource();source.buffer=buffers.get(name);source.connect(master);active.add(source);source.onended=()=>{active.delete(source);source.disconnect();};source.start();}catch{}}
 function stop(){for(const s of active){try{s.stop();}catch{}}active.clear();}
 return {unlock,play,sync,setPaused(value){paused=Boolean(value);sync();if(paused){stop();if(context?.state==='running')void context.suspend().catch(()=>{});}else unlock();},dispose(){disposed=true;stop();buffers.clear();if(context&&context.state!=='closed')void context.close().catch(()=>{});},metrics(){return {loaded:[...buffers.keys()].sort(),active:active.size,muted,paused};}};
}
