/** Street Slam sound: reuses the island's existing CC0 samples (no new files).
 * The island switch (localStorage island.sound) stays authoritative. Sound is
 * feedback only and never changes the match. */
export function createSlamAudio({config,storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch}={}){
 let context,master,paused=false,disposed=false,muted=false;const buffers=new Map(),active=new Set(),last=new Map(),played={};
 const sync=()=>{try{muted=storage?.getItem('island.sound')==='off';}catch{}if(master)master.gain.value=muted||paused?0:config.volume;};
 const files=Promise.all(Object.entries(config.samples).map(async([name,path])=>{try{const res=await fetcher(new URL('../'+path,import.meta.url));if(!res.ok)return null;return [name,await res.arrayBuffer()];}catch{return null;}}));
 function unlock(){
  if(disposed||paused||!AudioContext)return;
  try{
   if(!context){context=new AudioContext();master=context.createGain();master.connect(context.destination);sync();
    void files.then(async entries=>{for(const entry of entries.filter(Boolean)){try{buffers.set(entry[0],await context.decodeAudioData(entry[1].slice(0)));}catch{}}});}
   if(context.state==='suspended')void context.resume().catch(()=>{});
  }catch{}
 }
 function play(name,{volume=1,rate=1}={}){
  sync();if(disposed||paused||muted||!context||context.state!=='running'||!buffers.has(name)||active.size>=8)return false;
  const now=context.currentTime;if(now-(last.get(name)??-10)<.06)return false;last.set(name,now);
  try{const src=context.createBufferSource(),gain=context.createGain();src.buffer=buffers.get(name);src.playbackRate.value=rate;gain.gain.value=volume;src.connect(gain);gain.connect(master);active.add(src);src.onended=()=>active.delete(src);src.start();played[name]=(played[name]||0)+1;return true;}catch{return false;}
 }
 function stop(){for(const s of active){try{s.stop();}catch{}}active.clear();}
 const map={floor:['bounce',.8],rim:['rim',.7],board:['board',.9],fence:['board',.5],pass:['pass',.8],shotReleased:['pass',.5],score:['swish',1],steal:['pass',1],block:['board',1],buzzer:['whistle',.8],overtime:['whistle',.8],tipoff:['whistle',.6],finished:['whistle',.9]};
 return {
  unlock,play,sync,
  events(list){for(const e of list){const m=map[e.type];if(!m)continue;const v=e.speed?Math.min(1,.35+e.speed*.12):1;play(m[0],{volume:m[1]*v,rate:e.type==='floor'?1+Math.min(.3,(e.speed||0)*.03):1});if(e.type==='score'){play('crowd',{volume:e.kind==='dunk'?1:.7});}}},
  setPaused(v){paused=!!v;sync();if(paused){stop();if(context?.state==='running')void context.suspend().catch(()=>{});}else unlock();},
  metrics(){return {context:context?.state||'none',buffers:buffers.size,active:active.size,played:{...played},muted};},
  dispose(){disposed=true;stop();buffers.clear();if(context&&context.state!=='closed')void context.close().catch(()=>{});context=null;},
 };
}
