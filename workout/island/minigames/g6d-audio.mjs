/** Naval-only CC0 sample bank; island.sound remains owned by the existing toggle. */
export const G6D_AUDIO_FILES=Object.freeze(['cannon','whistle','splash','metal','explosion','torpedo','waves','engine']);
export function createNavalAudio({storage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetch:fetcher=globalThis.fetch}={}){
 let context,master,paused=false,disposed=false,muted=false,loaded=false,speed=0,voices=0,masterLevel=-1;const buffers=new Map(),loops=new Map(),last=new Map(),counts={};
 const sync=()=>{try{muted=storage?.getItem('island.sound')==='off';}catch{}const level=paused||muted?0:.22;if(master&&level!==masterLevel){masterLevel=level;master.gain.setTargetAtTime(level,context.currentTime,.025);}};
 async function load(){
  if(loaded)return;loaded=true;
  await Promise.all(G6D_AUDIO_FILES.map(async name=>{try{const response=await fetcher(new URL(`../assets/audio/g6d/${name}.ogg?v=island-naval-aim-20261028-1`,import.meta.url));if(!response.ok)return;const bytes=await response.arrayBuffer();const decoded=await context.decodeAudioData(bytes);if(!disposed)buffers.set(name,decoded);}catch{}}));
  if(!disposed)ambience();
 }
 function source(name,{loop=false,gain=1,rate=1,lowpass}={}){
  if(disposed||!context||!buffers.has(name)||!loop&&voices>=18)return;
  const node=context.createBufferSource(),amp=context.createGain();node.buffer=buffers.get(name);node.loop=loop;node.playbackRate.value=rate;amp.gain.value=gain;
  let filter;if(lowpass){filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=lowpass;node.connect(filter);filter.connect(amp);}else node.connect(amp);amp.connect(master);
  if(!loop)voices++;node.onended=()=>{if(!loop)voices--;node.disconnect();amp.disconnect();filter?.disconnect();};node.start();return {node,amp};
 }
 function ambience(){if(disposed||!context)return;if(!loops.has('waves')){const l=source('waves',{loop:true,gain:.28});if(l)loops.set('waves',l);}if(!loops.has('engine')){const l=source('engine',{loop:true,gain:0,lowpass:520,rate:.65});if(l)loops.set('engine',l);}}
 function unlock(){if(disposed||paused||!AudioContext)return;try{if(!context){context=new AudioContext();master=context.createGain();master.connect(context.destination);sync();void load();}if(context.state!=='running')void context.resume().catch(()=>{});}catch{}}
 /** Weak-centre hit: the metal hit pitched up plus a bright two-partial chime, loud enough to stand out over the explosion. */
 function chime(){try{const now=context.currentTime,out=context.createGain();out.gain.setValueAtTime(.0001,now);out.gain.exponentialRampToValueAtTime(1.15,now+.008);out.gain.exponentialRampToValueAtTime(.0001,now+.36);out.connect(master);
  const tones=[['triangle',1320,990,1],['sine',2640,1980,.35]].map(([type,from,to,level])=>{const osc=context.createOscillator(),amp=context.createGain();osc.type=type;osc.frequency.setValueAtTime(from,now);osc.frequency.exponentialRampToValueAtTime(to,now+.3);amp.gain.value=level;osc.connect(amp);amp.connect(out);osc.start(now);osc.stop(now+.38);return {osc,amp};});
  tones[0].osc.onended=()=>{for(const {osc,amp} of tones){osc.disconnect();amp.disconnect();}out.disconnect();};return true;}catch{return false;}}
 function play(name){sync();if(disposed||paused||muted||!context||context.state!=='running')return;const now=context.currentTime;if(now-(last.get(name)??-1)<(name==='whistle'?.18:.045))return;last.set(name,now);
  const options={cannon:{gain:1.8,rate:.72,lowpass:950},metal:{gain:.8},explosion:{gain:1.2,rate:.82,lowpass:2800},whistle:{gain:.28},splash:{gain:1.1},torpedo:{gain:.65,rate:.7,lowpass:1000}};
  if(name==='critical'){source('metal',{gain:.9,rate:1.65});if(chime())counts.critical=(counts.critical||0)+1;return;}
  if(options[name]&&source(name,options[name]))counts[name]=(counts[name]||0)+1;
 }
 return {unlock,play,update(value){speed=value;sync();ambience();const engine=loops.get('engine');if(engine){engine.amp.gain.setTargetAtTime(Math.min(1,speed/32)*.7,context.currentTime,.12);engine.node.playbackRate.setTargetAtTime(.6+speed/100,context.currentTime,.18);}},setPaused(value){paused=Boolean(value);sync();if(paused&&context?.state==='running')void context.suspend().catch(()=>{});else if(!paused&&context)void context.resume().catch(()=>{});},metrics(){return {loaded:[...buffers.keys()],muted,paused,disposed,speed,voices,loops:[...loops.keys()],counts:{...counts},state:context?.state||'locked'};},dispose(){disposed=true;for(const {node}of loops.values())try{node.stop();}catch{}loops.clear();buffers.clear();if(context)void context.close().catch(()=>{});}};
}
