const VERSION='island-naval-aim-20261030-1';
export const G2N_SAMPLES=Object.freeze(['engine','fire','ladder','rescue']);
/** Fire-only mix: CC0 samples, filtered noise and harmonic envelopes. */
export function createG2nAudio({storage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch}={}){
  let context,master,noise,disposed=false,paused=false,siren=false,muted=false;
  const buffers=new Map(),loops=new Map(),voices=new Set(),last=new Map(),played=new Set();let generation=0;
  function readMute(){try{return (storage??globalThis.localStorage)?.getItem('island.sound')==='off';}catch{return false;}}
  async function load(){const id=++generation;await Promise.all(G2N_SAMPLES.map(async name=>{try{const response=await fetcher(new URL(`../assets/audio/g2n/${name}.ogg?v=${VERSION}`,import.meta.url));if(!response.ok)return;const buffer=await context.decodeAudioData(await response.arrayBuffer());if(!disposed&&id===generation)buffers.set(name,buffer);}catch{/* Layered synthesis also covers unavailable codecs. */}}));}
  function unlock(){
    if(disposed||paused||!AudioContext)return;
    try{if(!context){context=new AudioContext();master=context.createGain();master.connect(context.destination);noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate);const a=noise.getChannelData(0);let brown=0;for(let i=0;i<a.length;i++){brown=(brown+(Math.random()*2-1)*.04)/1.02;a[i]=brown*3+(Math.random()*2-1)*.18;}void load();}
      muted=readMute();master.gain.value=muted?0:.16;if(context.state==='suspended')void context.resume().catch(()=>{});
    }catch{/* Unsupported audio cannot stop the mission. */}
  }
  function voice(source,gain,seconds,filter){
    const now=context.currentTime,out=context.createGain();out.gain.setValueAtTime(.001,now);out.gain.exponentialRampToValueAtTime(gain,now+.018);out.gain.exponentialRampToValueAtTime(.001,now+seconds);out.connect(master);
    if(filter){const f=context.createBiquadFilter();f.type='bandpass';f.frequency.value=filter;source.connect(f);f.connect(out);source.onended=()=>{voices.delete(source);source.disconnect();f.disconnect();out.disconnect();};}
    else{source.connect(out);source.onended=()=>{voices.delete(source);source.disconnect();out.disconnect();};}
    voices.add(source);source.start();source.stop(now+seconds);
  }
  function tone(hz,to,seconds,gain=.2,type='triangle'){const s=context.createOscillator();s.type=type;s.frequency.setValueAtTime(hz,context.currentTime);s.frequency.linearRampToValueAtTime(to,context.currentTime+seconds);voice(s,gain,seconds);}
  function hiss(seconds,gain,frequency){const s=context.createBufferSource();s.buffer=noise;s.loop=true;voice(s,gain,seconds,frequency);}
  function sample(name,gain=.5){const b=buffers.get(name);if(!b)return;const s=context.createBufferSource();s.buffer=b;voice(s,gain,Math.max(.04,b.duration));}
  function play(event){
    if(disposed||paused||muted||context?.state!=='running')return;
    const now=context.currentTime;if(now-(last.get(event)??-10)<.2)return;last.set(event,now);
    if(event==='steam'){hiss(.5,.65,2800);hiss(.28,.3,900);played.add(event);}
    if(event==='crackle'){hiss(.045,.12,2300);hiss(.08,.06,430);played.add(event);}
    if(event==='refill'){hiss(.18,.14,1300);tone(160,310,.14,.06,'sine');played.add(event);}
    if(event==='ladder'){sample('ladder',.5);hiss(.3,.2,600);tone(90,160,.32,.13,'sawtooth');played.add(event);}
    if(event==='rescue'){sample('rescue',.35);tone(523,659,.28,.18);tone(784,1046,.48,.13);played.add(event);}
    if(event==='timeout'){tone(240,140,.35,.1);tone(180,95,.4,.06);hiss(.15,.07,600);played.add(event);}
    if(event==='siren'){tone(580,920,.7,.17);tone(870,1380,.7,.07);hiss(.2,.05,1200);played.add(event);}
  }
  function loop(name,amount,rate=1){
    let node=loops.get(name);const sampled=buffers.has(name==='spray'?'fire':name);
    if(node&&sampled&&!node.sampled){node.source.stop();node.source.disconnect();node.filter.disconnect();node.gain.disconnect();loops.delete(name);node=null;}
    if(!node&&amount>0){const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffers.get(name==='spray'?'fire':name)||noise;source.loop=true;filter.type='lowpass';filter.frequency.value={engine:300,fire:650,spray:6000,refill:1700,ladder:420}[name]||1200;source.connect(filter);filter.connect(gain);gain.connect(master);gain.gain.value=0;source.start();node={source,filter,gain,sampled};loops.set(name,node);}
    if(node){node.gain.gain.setTargetAtTime(amount,context.currentTime,.045);node.source.playbackRate.setTargetAtTime(rate,context.currentTime,.08);}
  }
  return {unlock,play,
    update(model,balance){if(disposed)return;muted=readMute();if(master)master.gain.setTargetAtTime(paused||muted?0:.16,context.currentTime,.02);if(paused||muted||context?.state!=='running')return;
      if(!siren){play('siren');siren=true;}
      const speed=Math.min(1,(model.truck.speed||0)/balance.vehicle.speed);
      loop('engine',speed*.55,.6+speed*.9);loop('spray',model.spraying?.3:0,1.5);loop('fire',model.flames.some(f=>f.active&&f.heat>0)?.11:0,.72);loop('refill',model.refilling&&model.water<model.maxWater?.3:0,.85);loop('ladder',model.rescuing&&model.ladder.extension>0&&model.ladder.extension<1?.16:0,1.1);
      if(speed)played.add('engine');if(model.spraying)played.add('spray');if(model.refilling)played.add('refill');played.add('crackle');
    },
    setPaused(value){paused=Boolean(value);if(master)master.gain.value=paused||readMute()?0:.16;if(!paused)unlock();},
    snapshot(){return {unlocked:Boolean(context),state:context?.state||'locked',muted,paused,disposed,samples:[...buffers.keys()],played:[...played],loops:Object.fromEntries([...loops].map(([k,n])=>[k,{gain:n.gain.gain.value,rate:n.source.playbackRate.value}]))};},
    dispose(){if(disposed)return;disposed=true;generation++;for(const n of loops.values()){n.source.stop();n.source.disconnect();n.filter.disconnect();n.gain.disconnect();}loops.clear();for(const s of voices){try{s.stop();}catch{}s.disconnect();}voices.clear();buffers.clear();master?.disconnect();if(context)void context.close().catch(()=>{});}
  };
}
