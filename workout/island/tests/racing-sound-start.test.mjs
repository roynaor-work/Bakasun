import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacingControls} from '../minigames/racing-controls.mjs';
import {createRacingAudio} from '../minigames/racing-audio.mjs';
import {bindAudioUnlock} from '../minigames/racing-unlock.mjs';

class Element extends EventTarget{
  constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.attributes={};this.className='';this.hidden=false;
    this.style={setProperty(){},removeProperty(){},getPropertyValue(){return '';}};this.classList={add(){},remove(){},contains(){return false;}};}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}append(...e){for(const x of e)this.children.push(x);}
  getBoundingClientRect(){return {left:0,top:0,width:400,height:300};}setPointerCapture(){}closest(){return null;}
}
function controls(options={},{storage,search}={}){
  const doc=new EventTarget();doc.defaultView=new EventTarget();doc.defaultView.localStorage=storage;doc.defaultView.location={search:search||''};doc.hidden=false;
  doc.createElement=tag=>new Element(tag,doc);doc.createElementNS=(_,tag)=>new Element(tag,doc);
  const root=doc.createElement('div'),canvas=doc.createElement('canvas'),c=createRacingControls({root,canvas,t:k=>k,...options});
  const all=[];const walk=e=>{all.push(e);e.children.forEach(walk);};walk(root);
  return {c,auto:all.find(e=>e.className==='racing-auto'),accelerate:all.find(e=>e.dataset.gameControl==='accelerate'),root};
}
const memory=initial=>{const map=new Map(initial?Object.entries(initial):[]);return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),map};};

test('the race starts with ordinary (manual) throttle; automatic is a saved choice; ?racingAuto=1 restores the old default',()=>{
  const m=controls({}, {storage:memory()});
  assert.equal(m.c.sample().autoAccelerate,false);assert.equal(m.auto.attributes['aria-pressed'],'false');assert.equal(m.accelerate.hidden,false);assert.equal(m.root.dataset.racingAutomatic,'false');
  m.c.dispose();
  const storage=memory();const t=controls({}, {storage});t.auto.dispatchEvent(new Event('click'));
  assert.equal(t.c.sample().autoAccelerate,true);assert.equal(storage.map.get('island.racing.auto'),'1');assert.equal(t.accelerate.hidden,true);
  const again=controls({}, {storage});assert.equal(again.c.sample().autoAccelerate,true,'the choice is kept for the next race');
  again.auto.dispatchEvent(new Event('click'));assert.equal(storage.map.get('island.racing.auto'),'0');
  const forced=controls({}, {storage:memory(),search:'?racingAuto=1'});assert.equal(forced.c.sample().autoAccelerate,true);
  assert.equal(controls({automatic:true},{storage:memory()}).c.sample().autoAccelerate,true,'an explicit option wins');
  for(const x of [m,t,again,forced])x.c.dispose();
});

/** A context that behaves like a strict mobile browser: it starts suspended and resume() only works inside an activation event (pointerup, touchend, click, keydown). */
function strictAudio(){
  const flags={activation:false};const param=()=>({value:0,setTargetAtTime(v){this.value=v;}});
  const node=()=>({frequency:param(),gain:param(),Q:{value:0},connect(){},disconnect(){},start(){},stop(){}});
  class Ctx{constructor(){this.state='suspended';this.currentTime=1;this.destination={};this.sampleRate=44100;}
    createOscillator(){return node();}createBiquadFilter(){return node();}createGain(){return node();}createBuffer(){return {getChannelData:()=>new Float32Array(16)};}createBufferSource(){return Object.assign(node(),{playbackRate:{value:1}});}
    resume(){if(flags.activation)this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}close(){return Promise.resolve();}}
  return {flags,audio:createRacingAudio({AudioContext:Ctx,storage:{getItem:()=>'on'}})};
}
test('sound start: a held-thumb first touch (pointerdown, no activation) cannot start audio, the next activation event or the retry timer does',()=>{
  const {flags,audio}=strictAudio(),screen=new EventTarget(),canvas=new EventTarget(),controller=new AbortController();let tick=null;
  bindAudioUnlock({screen,canvas,audio,signal:controller.signal,setTimer:fn=>{tick=fn;return 1;},clearTimer(){}});
  assert.equal(audio.engine().contextState,'suspended','created at start but not allowed to run yet');
  screen.dispatchEvent(new Event('pointerdown'));assert.equal(audio.engine().contextState,'suspended','touch pointerdown alone does not activate');
  flags.activation=true;screen.dispatchEvent(new Event('pointerup'));assert.equal(audio.engine().contextState,'running','the first release or tap starts it');
  controller.abort();audio.dispose();
  // the retry timer path: activation exists without any further event reaching the screen
  const second=strictAudio(),sc2=new EventTarget();let timer=null;
  bindAudioUnlock({screen:sc2,canvas:new EventTarget(),audio:second.audio,setTimer:fn=>{timer=fn;return 2;},clearTimer(){}});
  assert.equal(second.audio.engine().contextState,'suspended');second.flags.activation=true;timer();assert.equal(second.audio.engine().contextState,'running','the timer keeps trying until the browser allows it');
  second.audio.dispose();
});
test('sound start: every activation-capable event is bound on the screen, and audio is unlocked once immediately',()=>{
  const {flags,audio}=strictAudio();flags.activation=true;const screen=new EventTarget(),seen=[],orig=screen.addEventListener.bind(screen);screen.addEventListener=(type,fn,o)=>{seen.push(type);return orig(type,fn,o);};
  bindAudioUnlock({screen,canvas:new EventTarget(),audio,setTimer:()=>1,clearTimer(){}});
  for(const type of ['pointerdown','pointerup','touchend','click','keydown'])assert.ok(seen.includes(type),type);
  assert.equal(audio.engine().contextState,'running','the Play tap that opened the race is still an activation');audio.dispose();
});

/** racing-deep-m3: the shell pauses the session while its start countdown runs (bind → applyPause → setPaused(true)) in the same task as the launch tap,
 * and unpauses from a timer. A browser that lets resume() work only inside a tap (Safari/iOS) then never got the context back: the context must stay
 * running through that pause (silence by gain), and a touch during the pause must still be allowed to create or resume it. ?racingAudioHold=0 restores the old suspend. */
function gestureOnlyAudio(options={}){
  const flags={activation:false};const param=()=>({value:0,setTargetAtTime(v){this.value=v;}});
  const node=()=>({frequency:param(),gain:param(),Q:{value:0},connect(){},disconnect(){},start(){},stop(){}});
  const log=[];
  class Ctx{constructor(){this.state=flags.activation?'running':'suspended';this.currentTime=1;this.destination={};this.sampleRate=44100;}
    createOscillator(){return node();}createBiquadFilter(){return node();}createGain(){return node();}createBuffer(){return {getChannelData:()=>new Float32Array(16)};}createBufferSource(){return Object.assign(node(),{playbackRate:{value:1}});}
    resume(){log.push('resume');if(flags.activation)this.state='running';return Promise.resolve();}suspend(){log.push('suspend');this.state='suspended';return Promise.resolve();}close(){return Promise.resolve();}}
  return {flags,log,audio:createRacingAudio({AudioContext:Ctx,storage:{getItem:()=>'on'},...options})};
}
test('sound start: the shell start pause no longer suspends the context; silent by gain, audible again after the timer unpause (holdContext:false restores the suspend)',()=>{
  const {flags,log,audio}=gestureOnlyAudio();flags.activation=true;audio.unlock();flags.activation=false;
  audio.setPaused(true);assert.equal(audio.engine().contextState,'running','pause keeps the context running');assert.ok(!log.includes('suspend'));
  audio.sync(0,false,{rpm:.2,gear:1,throttle:0});assert.equal(audio.metrics().gain,0,'silent while paused');
  audio.setPaused(false);audio.sync(0,false,{rpm:.2,gear:1,throttle:0});assert.equal(audio.engine().contextState,'running');assert.ok(audio.metrics().gain>0,'audible again without any tap');
  audio.dispose();
  const old=gestureOnlyAudio({holdContext:false});old.flags.activation=true;old.audio.unlock();old.flags.activation=false;
  old.audio.setPaused(true);assert.equal(old.audio.engine().contextState,'suspended','the previous behaviour suspends');old.audio.setPaused(false);assert.equal(old.audio.engine().contextState,'suspended','and a timer unpause cannot bring it back on a gesture-only browser');
  old.audio.dispose();
});
test('sound start: a tap during the start pause creates or resumes the context (unlock is not blocked by pause), still silent until unpaused',()=>{
  const {flags,audio}=gestureOnlyAudio();audio.setPaused(true);
  flags.activation=true;audio.unlock();assert.equal(audio.engine().contextState,'running','created and running from the tap even while paused');
  audio.sync(0,false,{rpm:.2,gear:1,throttle:0});assert.equal(audio.metrics().gain,0);
  audio.setPaused(false);audio.sync(0,false,{rpm:.2,gear:1,throttle:0});assert.ok(audio.metrics().gain>0);audio.dispose();
});
test('collision and overtake sounds: bump, wall, crash, crashRecover and pass each play one short cue from the racing audio; nothing while muted',()=>{
  const param=()=>({value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const sources=[];const node=()=>({frequency:param(),gain:param(),playbackRate:param(),Q:{value:0},connect(){},disconnect(){},start(){},stop(){}});
  let mute='on';
  class Ctx{constructor(){this.state='running';this.currentTime=2;this.destination={};this.sampleRate=44100;}createOscillator(){return node();}createBiquadFilter(){return node();}createGain(){return node();}createBuffer(){return {getChannelData:()=>new Float32Array(16)};}createBufferSource(){const n=node();sources.push(n);return n;}resume(){return Promise.resolve();}close(){return Promise.resolve();}}
  const audio=createRacingAudio({AudioContext:Ctx,storage:{getItem:()=>mute}});audio.unlock();audio.sync(20,false,{rpm:.5,gear:3,throttle:1});
  const base=sources.length;
  for(const [name,details] of [['bump',{}],['wall',{intensity:.5}],['crash',{}],['crashRecover',{}]]){const before=sources.length;audio.event(name,details);assert.equal(sources.length-before,1,name+' plays one cue');}
  assert.ok(sources.slice(base).every(s=>s.gainValue===undefined||s.gainValue<=.03));
  mute='off';audio.sync(20,false,{rpm:.5,gear:3,throttle:1});const muted=sources.length;for(const name of ['bump','wall','crash','crashRecover','pass'])audio.event(name,{intensity:1});
  assert.equal(sources.length,muted,'muted: no cue at all');audio.dispose();
});
