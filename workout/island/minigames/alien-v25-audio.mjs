/** Aliens v25 Vulcan sound: the Codex rotary plasma loop (aliens-vulcan-v2, CC0, copies under assets/alien-v25, see LICENSES.md there)
 * instead of one click per bullet. update(model) follows model.vulcanOn every frame: when the Vulcan starts, spin-up plays and the loop
 * fades in from 0.36 s (40 ms ramp); when it stops (button up or lock) the loop fades out in 40 ms and spin-down plays. play('overheat')
 * on the lock edge plays the dull clutch and the air release 120 ms later. OGG first, MP3 if this browser cannot decode OGG. Own small
 * context (the shared alien bank stays untouched), the island mute key and the pause hold. `ready` is true once the loop is decoded:
 * until then (or if it never loads) the session keeps the shared BRRRT for the Vulcan, so the game is never silent. */
export const ALIEN_V25_AUDIO=Object.freeze(['fire-loop','spin-up','spin-down','overheat','cooldown']);
export function createAlienV25Audio({storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetch:fetcher=globalThis.fetch}={}){
 let context,master,paused=false,disposed=false,loaded=false,loop=null,loopGain=null,on=false;const buffers=new Map(),counts={starts:0,stops:0,overheat:0};
 const muted=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
 async function decode(name){
  for(const ext of ['ogg','mp3']){try{const response=await fetcher(new URL(`../assets/alien-v25/${name}.${ext}?v=island-v2-20261107-19`,import.meta.url));if(!response.ok)continue;const decoded=await context.decodeAudioData(await response.arrayBuffer());if(!disposed)buffers.set(name,decoded);return;}catch{}}
 }
 async function load(){if(loaded||!fetcher)return;loaded=true;await Promise.all(ALIEN_V25_AUDIO.map(decode));}
 function unlock(){if(disposed||paused||!AudioContext)return;try{if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.34;master.connect(context.destination);void load();}if(context.state!=='running')void context.resume().catch(()=>{});}catch{}}
 const live=()=>!disposed&&!paused&&!muted()&&context&&context.state==='running';
 function oneShot(name,at=0,gain=1){if(!live()||!buffers.has(name))return false;try{const node=context.createBufferSource(),amp=context.createGain();node.buffer=buffers.get(name);amp.gain.value=gain;node.connect(amp);amp.connect(master);node.onended=()=>{node.disconnect();amp.disconnect();};node.start(context.currentTime+at);return true;}catch{return false;}}
 function startLoop(){
  if(!live()||!buffers.has('fire-loop'))return false;stopLoop(false);
  try{const now=context.currentTime,node=context.createBufferSource(),amp=context.createGain();node.buffer=buffers.get('fire-loop');node.loop=true;node.loopStart=0;node.loopEnd=node.buffer.duration;
   amp.gain.setValueAtTime(0,now);amp.gain.setValueAtTime(0,now+.36);amp.gain.linearRampToValueAtTime(1,now+.4);node.connect(amp);amp.connect(master);node.start(now);loop=node;loopGain=amp;
   oneShot('spin-up',0,.85);counts.starts++;return true;}catch{return false;}
 }
 let noise=null;
 function noiseBuffer(){if(noise)return noise;const n=Math.round(context.sampleRate*.6),b=context.createBuffer(1,n,context.sampleRate),d=b.getChannelData(0);let s=12345;for(let i=0;i<n;i++){s=(s*1103515245+12345)>>>0;d[i]=s/2147483648-1;}return noise=b;}
 function tone(type,f0,f1,at,dur,gain){const o=context.createOscillator(),g=context.createGain(),t=context.currentTime+at;o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.008);g.gain.exponentialRampToValueAtTime(.0005,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.02);o.onended=()=>{o.disconnect();g.disconnect();};}
 function hiss(at,dur,gain,freq,q){const src=context.createBufferSource(),f=context.createBiquadFilter(),g=context.createGain(),t=context.currentTime+at;src.buffer=noiseBuffer();f.type='bandpass';f.frequency.value=freq;f.Q.value=q;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0005,t+dur);src.connect(f);f.connect(g);g.connect(master);src.start(t);src.stop(t+dur+.02);src.onended=()=>{src.disconnect();f.disconnect();g.disconnect();};}
 function synth(event){
  if(!live())return false;
  try{
   if(event==='lightning'){hiss(0,.16,.9,3200,.8);hiss(.02,.3,.35,1400,.6);tone('sawtooth',1900,320,0,.09,.22);tone('sawtooth',1500,240,.05,.1,.18);tone('square',2400,500,.11,.08,.12);}
   else if(event==='shockwave'){tone('sine',140,38,0,.55,.9);tone('triangle',90,30,.02,.5,.4);hiss(0,.45,.3,420,.7);}
   else{tone('sine',880,880,0,.12,.32);tone('sine',1320,1320,.09,.18,.3);}
   return true;
  }catch{return false;}
 }
 function stopLoop(spinDown=true){
  if(!loop)return;const node=loop,amp=loopGain;loop=loopGain=null;counts.stops++;
  try{const now=context.currentTime;amp.gain.cancelScheduledValues(now);amp.gain.setValueAtTime(amp.gain.value,now);amp.gain.linearRampToValueAtTime(0,now+.04);node.stop(now+.06);node.onended=()=>{node.disconnect();amp.disconnect();};}catch{try{node.stop();}catch{}}
  if(spinDown)oneShot('spin-down',0,.85);
 }
 return {
  unlock,
  get ready(){return buffers.has('fire-loop');},
  /** Follow the model each frame: start/stop the loop on the Vulcan's own firing edge. */
  update(model){const want=Boolean(model?.vulcanOn&&model.v25!==false)&&live();if(want&&!on){on=startLoop();}else if(!want&&on){stopLoop(true);on=false;}else if(want&&on&&!loop)on=false;},
  /** 'overheat' on the lock edge: clutch, then the air release 120 ms later. The v25 arsenal: 'lightning' (a crack: a burst of bright noise and
   * three falling zaps), 'shockwave' (a deep thump sweeping 140 to 38 Hz under low noise), 'ammo' (two rising chimes), synthesized on this
   * context so they need no file. Other events are ignored (false). */
  play(event){
   if(event==='overheat'){counts.overheat++;if(on){stopLoop(false);on=false;}const a=oneShot('overheat',0,.9);oneShot('cooldown',.12,.8);return a;}
   if(event==='lightning'||event==='shockwave'||event==='ammo'){counts[event]=(counts[event]||0)+1;return synth(event);}
   return false;
  },
  setPaused(value){paused=Boolean(value);if(paused){if(on){stopLoop(false);on=false;}if(context?.state==='running')void context.suspend().catch(()=>{});}else unlock();},
  metrics(){return {loaded:[...buffers.keys()],playing:Boolean(loop),counts:{...counts},state:context?.state||'locked'};},
  dispose(){disposed=true;if(loop){try{loop.stop();}catch{}}loop=null;buffers.clear();if(context)void context.close().catch(()=>{});}
 };
}
