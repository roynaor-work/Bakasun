/** 11/11/2026: Vulcan sound for the anti-air gun. CC0 samples from the Codex package `sirens-vulcan-audio-v1`
 * (PR #355, synthesised in its build.py; copies under assets/game-naval/audio, see LICENSES.md there).
 * Own small context so the shared naval bank stays untouched; honours the island sound toggle and the pause.
 * `vulcanStart`: spin-up then the firing loop; `vulcanStop`: loop fades, spin-down. Other names are ignored. */
export const NAVAL_AIR_AUDIO_FILES=Object.freeze(['vulcan-spin-up','vulcan-fire-loop','vulcan-spin-down']);
export function createNavalAirAudio({storage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetch:fetcher=globalThis.fetch}={}){
 let context,master,paused=false,disposed=false,muted=false,loaded=false,loop=null,masterLevel=-1;const buffers=new Map(),counts={};
 const sync=()=>{try{muted=storage?.getItem('island.sound')==='off';}catch{}const level=paused||muted?0:.2;if(master&&level!==masterLevel){masterLevel=level;master.gain.setTargetAtTime(level,context.currentTime,.025);}};
 async function load(){
  if(loaded)return;loaded=true;
  await Promise.all(NAVAL_AIR_AUDIO_FILES.map(async name=>{try{const response=await fetcher(new URL(`../assets/game-naval/audio/${name}.ogg?v=island-v2-20261107-11`,import.meta.url));if(!response.ok)return;const bytes=await response.arrayBuffer();const decoded=await context.decodeAudioData(bytes);if(!disposed)buffers.set(name,decoded);}catch{}}));
 }
 function source(name,{loop:looping=false,gain=1,rate=1}={}){
  if(disposed||!context||!buffers.has(name))return null;
  const node=context.createBufferSource(),amp=context.createGain();node.buffer=buffers.get(name);node.loop=looping;node.playbackRate.value=rate;amp.gain.value=gain;node.connect(amp);amp.connect(master);
  node.onended=()=>{node.disconnect();amp.disconnect();};node.start();return {node,amp};
 }
 function unlock(){if(disposed||paused||!AudioContext)return;try{if(!context){context=new AudioContext();master=context.createGain();master.connect(context.destination);sync();void load();}if(context.state!=='running')void context.resume().catch(()=>{});}catch{}}
 function stopLoop(){if(!loop)return;const {node,amp}=loop;loop=null;try{amp.gain.setTargetAtTime(0,context.currentTime,.04);node.stop(context.currentTime+.25);}catch{}}
 function play(name){
  if(name!=='vulcanStart'&&name!=='vulcanStop')return false;sync();if(disposed||paused||muted||!context||context.state!=='running')return false;
  if(name==='vulcanStart'){if(loop)return false;source('vulcan-spin-up',{gain:.9});const l=source('vulcan-fire-loop',{loop:true,gain:0,rate:1});if(l){loop=l;l.amp.gain.setTargetAtTime(.85,context.currentTime+.12,.06);}counts.start=(counts.start||0)+1;return true;}
  if(loop){stopLoop();source('vulcan-spin-down',{gain:.7});counts.stop=(counts.stop||0)+1;return true;}return false;
 }
 return {unlock,play,setPaused(value){paused=Boolean(value);if(paused)stopLoop();sync();if(paused&&context?.state==='running')void context.suspend().catch(()=>{});else if(!paused&&context)void context.resume().catch(()=>{});},
  metrics(){return {loaded:[...buffers.keys()],muted,paused,disposed,looping:Boolean(loop),counts:{...counts},state:context?.state||'locked'};},
  dispose(){disposed=true;stopLoop();buffers.clear();if(context)void context.close().catch(()=>{});}};
}
