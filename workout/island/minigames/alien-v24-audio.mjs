/** Aliens v24 sounds: CC0 samples from the Codex packs (copies under assets/alien-v24, see LICENSES.md there): `refill` plays
 * refill-pickup.ogg (refill-enemyfire-v1) when a Vulcan magazine is picked up, `overheat` plays overheat.ogg (alien-fx-v1) once
 * when the Vulcan locks. Own small context so the shared alien bank stays untouched; honours the island sound toggle and the pause.
 * Other event names are ignored. Only created with the refill on (?alienRefill=0 keeps the v23 sounds exactly). */
export const ALIEN_V24_AUDIO=Object.freeze({refill:'refill-pickup',overheat:'overheat'});
export function createAlienV24Audio({storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetch:fetcher=globalThis.fetch}={}){
 let context,master,paused=false,disposed=false,loaded=false;const buffers=new Map(),counts={};
 const muted=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
 async function load(){
  if(loaded||!fetcher)return;loaded=true;
  await Promise.all(Object.values(ALIEN_V24_AUDIO).map(async name=>{try{const response=await fetcher(new URL(`../assets/alien-v24/${name}.ogg?v=island-v2-20261107-20`,import.meta.url));if(!response.ok)return;const decoded=await context.decodeAudioData(await response.arrayBuffer());if(!disposed)buffers.set(name,decoded);}catch{}}));
 }
 function unlock(){if(disposed||paused||!AudioContext)return;try{if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.32;master.connect(context.destination);void load();}if(context.state!=='running')void context.resume().catch(()=>{});}catch{}}
 function play(event){
  const name=ALIEN_V24_AUDIO[event];if(!name)return false;counts[event]=(counts[event]||0)+1;
  if(disposed||paused||muted()||!context||context.state!=='running'||!buffers.has(name))return false;
  try{const node=context.createBufferSource(),amp=context.createGain();node.buffer=buffers.get(name);amp.gain.value=event==='overheat'?.8:1;node.connect(amp);amp.connect(master);node.onended=()=>{node.disconnect();amp.disconnect();};node.start();return true;}catch{return false;}
 }
 return {unlock,play,setPaused(value){paused=Boolean(value);if(paused&&context?.state==='running')void context.suspend().catch(()=>{});else if(!paused)unlock();},
  metrics(){return {loaded:[...buffers.keys()],counts:{...counts},state:context?.state||'locked'};},dispose(){disposed=true;buffers.clear();if(context)void context.close().catch(()=>{});}};
}
