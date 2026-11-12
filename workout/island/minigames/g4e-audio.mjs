// Tennis owns its sample bank and lifecycle; the island's shared sound switch
// remains authoritative. Impacts: Kenney CC0; applause: original CC0 synthesis
// (source and listening evidence in notes/g4f-qa.md).
export function createTennisAudio({config,storage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch}={}){
 let context,master,paused=false,disposed=false,muted=false;const buffers=new Map(),active=new Set(),last=new Map(),played={};
 function sync(){try{muted=storage?.getItem('island.sound')==='off';}catch{}if(master)master.gain.value=muted||paused?0:config.volume;}
 const files=Promise.all(Object.entries(config.samples).map(async([name,path])=>{try{const response=await fetcher(new URL('../'+path+'?v=island-v2-20261107-11',import.meta.url));if(!response.ok)return;return [name,await response.arrayBuffer()];}catch{return;}}));
 function unlock(){if(disposed||paused||!AudioContext)return;try{if(!context){context=new AudioContext();master=context.createGain();master.connect(context.destination);sync();void files.then(async entries=>{for(const entry of entries.filter(Boolean)){try{const decoded=await context.decodeAudioData(entry[1]);if(!disposed)buffers.set(entry[0],decoded);}catch{}}});}if(context.state==='suspended')void context.resume().catch(()=>{});}catch{}}
 function play(name,{gain=1}={}){sync();if(disposed||paused||muted||!context||context.state!=='running'||!buffers.has(name)||active.size>=8)return;const now=context.currentTime;if(now-(last.get(name)??-10)<.05)return;last.set(name,now);try{const source=context.createBufferSource();source.buffer=buffers.get(name);let filter,level;if(name==='applause'){filter=context.createBiquadFilter();filter.type='highpass';filter.frequency.value=720;filter.Q.value=.7;source.connect(filter);filter.connect(master);}else if(gain!==1){level=context.createGain();level.gain.value=Math.max(0,Math.min(1,gain));source.connect(level);level.connect(master);}else source.connect(master);active.add(source);source.onended=()=>{active.delete(source);source.disconnect();filter?.disconnect();level?.disconnect();};source.start();played[name]=(played[name]||0)+1;}catch{}}
 // Quiet looping crowd bed: the level follows the rally and eases, so it never jumps.
 let bed=null,bedLevel=0,bedTarget=0;
 function ambient(name,level){bedTarget=Math.max(0,Math.min(1,level));if(disposed||paused||muted||!context||context.state!=='running'||!buffers.has(name))return;
  try{if(!bed){const source=context.createBufferSource(),gainNode=context.createGain();source.buffer=buffers.get(name);source.loop=true;gainNode.gain.value=0;source.connect(gainNode);gainNode.connect(master);source.start();bed={source,gainNode};}
   bedLevel+=(bedTarget-bedLevel)*.04;bed.gainNode.gain.value=bedLevel;}catch{}}
 function stop(){for(const s of active){try{s.stop();}catch{}}active.clear();if(bed){try{bed.source.stop();}catch{}bed.source.disconnect();bed.gainNode.disconnect();bed=null;bedLevel=0;}}
 return {unlock,play,ambient,sync,setPaused(value){paused=Boolean(value);sync();if(paused){stop();if(context?.state==='running')void context.suspend().catch(()=>{});}else unlock();},dispose(){disposed=true;stop();buffers.clear();if(context&&context.state!=='closed')void context.close().catch(()=>{});},metrics(){return {loaded:[...buffers.keys()].sort(),active:active.size,muted,paused,played:{...played}};}};
}
