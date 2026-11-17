/** Replace this adapter with licensed recordings without changing station UI. */
export function createLearningVoice({synthesis=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance}={}) {
  let voices=[],previous=false,failed=false;const listeners=new Set();
  const refresh=()=>{
    voices=(synthesis?.getVoices?.()||[]).filter(v=>/^he(?:[-_]|$)/i.test(v.lang)||/^iw(?:[-_]|$)/i.test(v.lang));
    const available=voices.length>0&&Boolean(Utterance)&&!failed;
    if(available!==previous){previous=available;for(const fn of listeners)fn(available);}
  };
  const voicesChanged=()=>{failed=false;refresh();};
  synthesis?.addEventListener?.('voiceschanged',voicesChanged);refresh();
  return {
    get available(){return voices.length>0&&Boolean(Utterance)&&!failed;},
    speak(text){
      refresh();if(!voices.length||!Utterance||failed)return false;
      try{
        synthesis.cancel();const utterance=new Utterance(text);utterance.lang='he-IL';utterance.voice=voices.find(v=>v.localService)||voices[0];utterance.rate=.82;utterance.pitch=1;utterance.volume=1;synthesis.speak(utterance);return true;
      }catch{failed=true;refresh();return false;}
    },
    stop(){try{synthesis?.cancel?.();}catch{}},
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    dispose(){try{synthesis?.cancel?.();}catch{}synthesis?.removeEventListener?.('voiceschanged',voicesChanged);listeners.clear();},
  };
}
