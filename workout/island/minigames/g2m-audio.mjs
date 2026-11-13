import {alienV13Enabled,V13_AUDIO} from './alien-v13.mjs';
import {alienV12Enabled,vulcanSamples,vulcanSpin} from './alien-v12.mjs';
import {alienV11Enabled,BOAR_MG,LASER_SFX,whiteNoise,playLayers} from './alien-v11.mjs';
const EVENTS=['shot','hit','explosion','missileLaunch','missileExplosion','bonus','stageEnd'];
export const G2M_SAMPLES=Object.freeze(Object.fromEntries(EVENTS.map(id=>[id,new URL(`../assets/audio/g2m/${id}.ogg?v=island-v2-20261107-12`,import.meta.url).href])));
export const G2M_LEVELS=Object.freeze({shot:.07,hit:.145,explosion:.21,missileLaunch:.22,missileExplosion:.36,bonus:.195,stageEnd:.235,laser:.1,explosionBig:.36});
/** Alien-only sample bank. The shared shell owns the existing island.sound switch. */
export function createG2mAudio({v13:v13cfg=null,storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch}={}){
 let context,master,noise,white,paused=false,disposed=false,loaded=0,played=0;const buffers=new Map(),sources=new Set(),last=new Map(),v11=alienV11Enabled(),v12=alienV12Enabled(),v13=alienV13Enabled()?{loopGain:1.5,spinGain:1.2,flashGain:.6,spinUpOverlap:.15,...v13cfg}:null,synth=[],v13buf=new Map();let vulcan=null,vulcanBuffer=null,lastShot=-9,vulcanStarts=0;
 const muted=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
 function unlock(){
  if(disposed||!AudioContext)return;
  try{if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.3;master.connect(context.destination);
    noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=noise.getChannelData(0);let low=0;for(let i=0;i<data.length;i++){low=low*.92+(Math.random()*2-1)*.08;data[i]=low;}white=whiteNoise(context);}
   if(!paused&&context.state==='suspended')void context.resume().catch(()=>{});
  }catch{/* Audio support must never stop gameplay. */}
 }
 unlock();
 const ready=context?Promise.all([...Object.entries(G2M_SAMPLES).map(async([event,url])=>{try{const r=await fetcher(url);if(!r.ok)return;const b=await context.decodeAudioData(await r.arrayBuffer());if(!disposed){buffers.set(event,b);loaded++;}}catch{}}),...(v13?Object.entries(V13_AUDIO).map(async([id,url])=>{try{const r=await fetcher(url);if(!r.ok)return;const b=await context.decodeAudioData(await r.arrayBuffer());if(!disposed)v13buf.set(id,b);}catch{/* v12 synth stays */}}):[])]):Promise.resolve();
 function stop(){for(const s of sources){try{s.stop();}catch{}}sources.clear();if(vulcan&&context)stopVulcan(context.currentTime,true);}
 // A codec/network failure still produces a soft layered cue. Every voice has
 // an attack/release envelope; no hard-edged single oscillator fallback.
 function fallback(event,now){
  const level=G2M_LEVELS[event],duration={shot:.105,hit:.17,explosion:.38,missileLaunch:.6,missileExplosion:.8,bonus:.42,stageEnd:.92}[event];
  const hz={shot:420,hit:220,explosion:95,missileLaunch:950,missileExplosion:62,bonus:523,stageEnd:392}[event];
  function voice(source,amount,filter){const gain=context.createGain();gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(amount,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);source.connect(filter||gain);filter?.connect(gain);gain.connect(master);sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();filter?.disconnect();gain.disconnect();};source.start();source.stop(now+duration);}
  for(const ratio of [1,1.997]){const tone=context.createOscillator();tone.type='sine';tone.frequency.setValueAtTime(hz*ratio,now);tone.frequency.exponentialRampToValueAtTime(hz*ratio*.48,now+duration);voice(tone,level*(ratio===1?.65:.18));}
  const air=context.createBufferSource(),filter=context.createBiquadFilter();air.buffer=noise;filter.type='lowpass';filter.frequency.value=event==='missileLaunch'?1500:650;voice(air,level*.4,filter);
 }
 function startVulcanSamples(now){
  const up=v13buf.get('vulcan-spin-up'),loop=v13buf.get('vulcan-fire-loop');if(!loop)return false;
  try{
   const parts=[],voice=(buffer,gainValue,when,looping=false)=>{const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=looping;gain.gain.value=gainValue;source.connect(gain);gain.connect(master);source.start(when);parts.push({source,gain});return {source,gain};};
   const flash=v13buf.get('vulcan-flash');if(flash)voice(flash,v13.flashGain,now);
   let at=now;if(up){voice(up,v13.spinGain,now);at=now+Math.max(0,up.duration-v13.spinUpOverlap);}
   const body=voice(loop,v13.loopGain,at,true);body.gain.gain.setValueAtTime(.0001,at);body.gain.gain.linearRampToValueAtTime(v13.loopGain,at+.05);
   vulcan={samples:true,parts,body,start:now};vulcanStarts++;played++;return true;
  }catch{vulcan=null;return false;}
 }
 function stopVulcanSamples(now,fast){
  const v=vulcan;vulcan=null;if(!v)return;
  try{v.body.gain.gain.cancelScheduledValues(now);v.body.gain.gain.setValueAtTime(Math.max(.0001,v.body.gain.gain.value||v13.loopGain),now);v.body.gain.gain.linearRampToValueAtTime(.0001,now+.04);
   for(const p of v.parts){try{p.source.stop(now+.06);}catch{}p.source.onended=()=>{try{p.source.disconnect();p.gain.disconnect();}catch{}};}
   const down=v13buf.get('vulcan-spin-down');if(down&&!fast){const source=context.createBufferSource(),gain=context.createGain();source.buffer=down;gain.gain.value=v13.spinGain;source.connect(gain);gain.connect(master);source.start(now);source.onended=()=>{try{source.disconnect();gain.disconnect();}catch{}};}
  }catch{}
 }
 function startVulcan(now){
  if(v13&&v13buf.has('vulcan-fire-loop')&&startVulcanSamples(now))return;
  try{if(!vulcanBuffer){const data=vulcanSamples(context.sampleRate,66);vulcanBuffer=context.createBuffer(1,data.length,context.sampleRate);vulcanBuffer.copyToChannel(data,0);}
   const source=context.createBufferSource(),gain=context.createGain(),low=context.createBiquadFilter(),high=context.createBiquadFilter();source.buffer=vulcanBuffer;source.loop=true;
   low.type='lowpass';low.frequency.value=4200;high.type='highpass';high.frequency.value=70;gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(1.7,now+.08);
   source.playbackRate.setValueAtTime(.35,now);for(let i=1;i<=7;i++)source.playbackRate.linearRampToValueAtTime(vulcanSpin(i*.05,true).rate,now+i*.05);
   source.connect(high);high.connect(low);low.connect(gain);gain.connect(master);source.start(now);vulcan={source,gain,start:now};vulcanStarts++;played++;
  }catch{vulcan=null;}
 }
 function stopVulcan(now,fast=false){
  if(vulcan?.samples)return stopVulcanSamples(now,fast);
  const v=vulcan;if(!v)return;vulcan=null;const d=fast?.02:.45;
  try{v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(Math.max(.0001,v.gain.gain.value||1.7),now);v.gain.gain.linearRampToValueAtTime(.0001,now+d);
   v.source.playbackRate.cancelScheduledValues(now);v.source.playbackRate.setValueAtTime(Math.max(.35,v.source.playbackRate.value||1),now);v.source.playbackRate.linearRampToValueAtTime(.3,now+d);v.source.stop(now+d+.02);v.source.onended=()=>{try{v.source.disconnect();v.gain.disconnect();}catch{}};
  }catch{}
 }
 function play(event){
  event=event==='upgrade'?'bonus':event;
  if(disposed||paused||muted()||!G2M_LEVELS[event]||sources.size>=18)return;
  unlock();if(context.state!=='running')return;
  const now=context.currentTime;
  if(v12&&event==='shot'){lastShot=now;if(!vulcan)startVulcan(now);return;}
  if(v11&&(event==='shot'||event==='laser')){
   const spec=event==='shot'?BOAR_MG:LASER_SFX;if(now-(last.get(event)??-1)<spec.minGap)return;last.set(event,now);
   while(synth.length&&synth[0]<=now)synth.shift();if(synth.length>=8)return;synth.push(now+.2);
   try{playLayers(context,master,white,spec.layers,now,{vol:event==='shot'?2:1.6,pitch:event==='shot'?.92+Math.random()*.16:1});played++;}catch{}
   return;
  }
  if(event==='explosionBig')event='missileExplosion';
  if(now-(last.get(event)??-1)<.045)return;last.set(event,now);
  try{if(event==='stageEnd')stop();if(buffers.has(event)){const source=context.createBufferSource();source.buffer=buffers.get(event);source.connect(master);source.onended=()=>{sources.delete(source);source.disconnect();};sources.add(source);source.start();}else fallback(event,now);played++;
  }catch{/* Device interruption is non-fatal. */}
 }
 return {ready,play,unlock,sync(){if(vulcan&&context&&context.currentTime-lastShot>.14)stopVulcan(context.currentTime);if(master)master.gain.value=muted()||paused?0:.3;if(muted())stop();},setPaused(value){paused=Boolean(value);if(paused){stop();if(context?.state==='running')void context.suspend().catch(()=>{});}else unlock();},metrics(){return {vulcanActive:Boolean(vulcan),vulcanSamples:Boolean(vulcan?.samples),vulcanStarts,v13Loaded:v13buf.size,loaded,played,active:sources.size,muted:muted(),paused,disposed};},dispose({finishTail=false}={}){disposed=true;buffers.clear();const close=()=>{stop();if(context)void context.close().catch(()=>{});};if(finishTail&&sources.size)setTimeout(close,1300);else close();}};
}
