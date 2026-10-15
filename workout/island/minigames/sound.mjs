/** Stable semantic events. A future sample bank can replace these synthesizers. */
export const SOUND_EVENTS=Object.freeze(['shot','hit','explosion','bonus','upgrade','win','lose','button','cannon','splash','spray','crackle','refill']);
export const SOUND_KEY='island.sound';
const voices={shot:[740,180,.07,'triangle'],hit:[320,90,.09,'square'],explosion:[650,50,.28,'noise'],bonus:[680,1200,.16,'sine'],upgrade:[440,1320,.24,'triangle'],win:[520,1040,.45,'triangle'],lose:[240,90,.4,'sine'],button:[580,740,.045,'sine'],cannon:[450,70,.2,'noise'],splash:[800,180,.26,'noise'],spray:[1200,700,.15,'noise'],crackle:[2400,800,.07,'noise'],refill:[380,640,.17,'sine']};
export function createSound({storage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,volume=.045}={}){
  let muted=false,context,master,noise,disposed=false,active=0;const last=new Map();
  try{muted=storage?.getItem(SOUND_KEY)==='off';}catch{/* Sound remains usable without storage. */}
  function unlock(){
    if(disposed||!AudioContext)return;
    try{
      if(!context){context=new AudioContext();master=context.createGain();master.gain.value=muted?0:volume;master.connect(context.destination);noise=context.createBuffer(1,context.sampleRate*.4,context.sampleRate);const samples=noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;}
      if(context.state!=='running'&&context.state!=='closed')void context.resume().catch(()=>{});
    }catch{/* Unsupported audio must never interrupt play. */}
  }
  function play(event){
    if(disposed||muted||!context||context.state!=='running'||!voices[event]||active>=10)return;
    const now=context.currentTime;if(now-(last.get(event)??-1)<((event==='spray'||event==='crackle') ? .22 : .045))return;last.set(event,now);
    try{
      const [from,to,seconds,type]=voices[event],gain=context.createGain();gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(type==='noise'?.6:.7,now+.008);gain.gain.exponentialRampToValueAtTime(.001,now+seconds);gain.connect(master);
      let source,filter;
      if(type==='noise'){source=context.createBufferSource();source.buffer=noise;filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(from,now);filter.frequency.exponentialRampToValueAtTime(to,now+seconds);source.connect(filter);filter.connect(gain);}
      else{source=context.createOscillator();source.type=type;source.frequency.setValueAtTime(from,now);source.frequency.exponentialRampToValueAtTime(to,now+seconds);source.connect(gain);}
      active++;source.onended=()=>{active--;source.disconnect();filter?.disconnect();gain.disconnect();};source.start(now);source.stop(now+seconds);
    }catch{/* Browser audio interruptions are non-fatal. */}
  }
  return {unlock,play,get muted(){return muted;},get unlocked(){return Boolean(context);},setMuted(value){muted=Boolean(value);if(master)master.gain.value=muted?0:volume;try{storage?.setItem(SOUND_KEY,muted?'off':'on');}catch{}},suspend(){if(context?.state==='running')void context.suspend().catch(()=>{});},dispose(){disposed=true;if(context)void context.close().catch(()=>{});}};
}
