/** Ships v24 sounds: CC0 samples from the Codex packs refill-enemyfire-v1 and torpedo-sub-v1 (copies under assets/game-naval/audio,
 * see LICENSES.md there). `incoming`: one incoming-shell whoosh per enemy shot or salvo (not per frame), `enemyCannon`: the enemy cannon,
 * `incomingTorpedo`: bubbles for an enemy torpedo on its way, `torpedoLaunch`: a torpedo leaves a tube (ours or a submarine's),
 * `underwaterExplosion`: a torpedo meets a diving submarine, `sonarPing`: a submarine dives.
 * Own small context so the shared naval bank stays untouched; honours the island sound toggle and the pause. Other names are ignored.
 * Created only when the v24 enemy fire or the v24 submarine is on (?navalEnemyFire=v23&navalSub=v23 keep the v23 sounds). */
export const NAVAL_V24_AUDIO=Object.freeze({incoming:'incoming-shell',incomingTorpedo:'bubbles',enemyCannon:'enemy-cannon',torpedoLaunch:'torpedo-launch',underwaterExplosion:'underwater-explosion',sonarPing:'sonar-ping'});
export function createNavalV24Audio({storage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetch:fetcher=globalThis.fetch}={}){
 let context,master,paused=false,disposed=false,loaded=false;const buffers=new Map(),counts={},last=new Map();
 const muted=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
 async function load(){
  if(loaded||!fetcher)return;loaded=true;
  await Promise.all([...new Set(Object.values(NAVAL_V24_AUDIO))].map(async name=>{try{const response=await fetcher(new URL(`../assets/game-naval/audio/${name}.ogg?v=island-v2-20261107-15`,import.meta.url));if(!response.ok)return;const decoded=await context.decodeAudioData(await response.arrayBuffer());if(!disposed)buffers.set(name,decoded);}catch{}}));
 }
 function unlock(){if(disposed||paused||!AudioContext)return;try{if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.22;master.connect(context.destination);void load();}if(context.state!=='running')void context.resume().catch(()=>{});}catch{}}
 function play(event){
  const name=NAVAL_V24_AUDIO[event];if(!name)return false;counts[event]=(counts[event]||0)+1;
  if(disposed||paused||muted()||!context||context.state!=='running'||!buffers.has(name))return false;
  const now=context.currentTime;if(now-(last.get(name)??-1)<.25)return false;last.set(name,now);
  try{const node=context.createBufferSource(),amp=context.createGain();node.buffer=buffers.get(name);amp.gain.value=event==='sonarPing'?.55:event==='incomingTorpedo'?.75:.9;node.connect(amp);amp.connect(master);node.onended=()=>{node.disconnect();amp.disconnect();};node.start();return true;}catch{return false;}
 }
 return {unlock,play,setPaused(value){paused=Boolean(value);if(paused&&context?.state==='running')void context.suspend().catch(()=>{});else if(!paused)unlock();},
  metrics(){return {loaded:[...buffers.keys()],counts:{...counts},state:context?.state||'locked'};},dispose(){disposed=true;buffers.clear();if(context)void context.close().catch(()=>{});}};
}
