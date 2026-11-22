// Ships v24.9 (Roy on the phone, 22/11/2026: "why does he talk during the ships game? it is not supposed to be like that").
// The battle makes no speech call: the weapon picker no longer reads its sentence aloud (?navalVoice=1 brings it back), and the lock, radar
// and "slow down" (v24.8 lock lost) messages are small written text only. Sound effects stay.
// The proof: a device with a Hebrew voice, speechSynthesis / SpeechSynthesisUtterance / Audio replaced by counters, the real weapon picker
// (kid UX on, as on the phone), the real model played through stages 1 and 30 with the HUD drawn every frame, and a v24.8 lost lock on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

// --- the device: a page (so the kid UX fixes are on), a local Hebrew voice, counters on every way to speak ---
const speech={spoken:[],utterances:0,audio:0,cancel:0};
class Utterance{constructor(text){speech.utterances++;this.text=text;}addEventListener(){}}
class FakeAudio{constructor(src){speech.audio++;this.src=src;}canPlayType(){return 'probably';}play(){speech.audio++;return Promise.resolve();}}
globalThis.speechSynthesis={getVoices:()=>[{lang:'he-IL',localService:true,name:'local Hebrew'}],speak(u){speech.spoken.push(u.text);},cancel(){speech.cancel++;},addEventListener(){}};
globalThis.SpeechSynthesisUtterance=Utterance;globalThis.Audio=FakeAudio;
const store=new Map([['island.sound','on']]);globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
/** A small DOM: enough for the weapon picker (class, id and data-ammo-index selectors, events, attributes). */
class El{
 constructor(tag='div'){this.tag=tag;this.children=[];this.parent=null;this.dataset={};this.attrs=new Map();this.listeners=[];this.className='';this.id='';this.textContent='';this.innerHTML='';this.disabled=false;
  const props=new Map();this.style={setProperty:(k,v)=>props.set(k,v),getPropertyValue:k=>props.get(k)||''};
  const names=()=>this.className.split(/\s+/).filter(Boolean);this.classList={add:(...n)=>{this.className=[...new Set([...names(),...n])].join(' ');},remove:(...n)=>{this.className=names().filter(c=>!n.includes(c)).join(' ');},contains:n=>names().includes(n)};}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 cloneNode(){const c=new El(this.tag);c.className=this.className;c.innerHTML=this.innerHTML;return c;}
 setAttribute(k,v){this.attrs.set(k,String(v));}getAttribute(k){return this.attrs.has(k)?this.attrs.get(k):null;}removeAttribute(k){this.attrs.delete(k);}
 addEventListener(type,fn,{signal}={}){const entry={type,fn};this.listeners.push(entry);signal?.addEventListener('abort',()=>{this.listeners=this.listeners.filter(l=>l!==entry);});}
 dispatch(type,target=this){const event={type,target,key:'',code:'',stopPropagation(){}};for(let n=target;n;n=n.parent)for(const l of [...n.listeners])if(l.type===type)l.fn(event);}
 matches(sel){return sel.split(',').some(one=>{const s=one.trim();if(s.startsWith('.'))return this.classList.contains(s.slice(1));if(s.startsWith('#'))return this.id===s.slice(1);
  const m=/^\[data-ammo-index(?:="(\d+)")?\]$/.exec(s);return Boolean(m)&&this.dataset.ammoIndex!==undefined&&(m[1]===undefined||this.dataset.ammoIndex===m[1]);});}
 all(){return this.children.flatMap(c=>[c,...c.all()]);}
 querySelectorAll(sel){const parts=sel.trim().split(/\s+(?![^\[]*\])/);if(sel.includes(',')||parts.length===1)return this.all().filter(n=>n.matches(sel));return this.all().filter(n=>n.matches(parts[0])).flatMap(n=>n.querySelectorAll(parts.slice(1).join(' ')));}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
 closest(sel){for(let n=this;n;n=n.parent)if(n.matches(sel))return n;return null;}
 contains(node){for(let n=node;n;n=n.parent)if(n===this)return true;return false;}
 focus(){globalThis.document.activeElement=this;}
}
globalThis.document={createElement:tag=>new El(tag),head:new El('head'),activeElement:null,querySelector:()=>null};
globalThis.location={search:''};

// Imported only now: kid-ux.mjs reads the page once, and the phone runs with the kid UX fixes on.
const {kidUx}=await import('../workout/island/kid-ux.mjs');
const {mountNavalWeaponPicker,navalVoiceEnabled,drawNavalHud}=await import('../workout/island/minigames/naval-hud.mjs');
const {drawNavalV241}=await import('../workout/island/minigames/naval-v241-hud.mjs');
const {createNavalModel}=await import('../workout/island/minigames/naval.mjs');
const {NAVAL_V241_WORDS}=await import('../workout/island/minigames/naval-v241.mjs');
const {G6D_AUDIO_FILES}=await import('../workout/island/minigames/g6d-audio.mjs');
const {NAVAL_V24_AUDIO}=await import('../workout/island/minigames/naval-v24-audio.mjs');
const {NAVAL_AIR_AUDIO_FILES}=await import('../workout/island/minigames/naval-air-audio.mjs');
const {seededRandom}=await import('../workout/island/minigames/context.mjs');
const {playStage}=await import('./helpers/naval-kid-bot.mjs');
const island=new URL('../workout/island/',import.meta.url),read=async p=>String(await readFile(new URL(p,island)));
const cfg=JSON.parse(await read('data/config.json')).minigames,nb=cfg.navalDuel,phone={...cfg,width:844,height:390},FRAME=1/60;
const strings=JSON.parse(await read('data/strings.he.json')),t=key=>strings[key]||key;
const reset=()=>{speech.spoken.length=0;speech.utterances=0;speech.audio=0;speech.cancel=0;};
const silent=label=>{assert.deepEqual(speech.spoken,[],label+': speechSynthesis.speak was called');assert.equal(speech.utterances,0,label+': an utterance was made');assert.equal(speech.audio,0,label+': an Audio voice clip was made');};

function controls(){
 const root=new El('div'),rack=new El('div'),shoot=new El('button'),icon=new El('svg');rack.className='ammo-rack';shoot.id='shoot';icon.className='game-icon';shoot.append(icon);
 const buttons=nb.ammo.map((ammo,i)=>{const b=new El('button'),drawing=new El('svg');drawing.className='game-icon';b.dataset.ammoIndex=String(i);b.append(drawing);return b;});
 rack.append(...buttons);root.append(rack,shoot);return {root,rack,buttons};
}
/** The child opens the picker and takes each of the six weapons (a finger: pointerup, then the click the browser sends). */
function pickEveryWeapon(search){
 globalThis.location={search};const ui=controls(),model={ammoIndex:0,ammo:nb.ammo.map(()=>3),cooldowns:[],loaded:3},picker=mountNavalWeaponPicker({controls:ui.root,t,balance:nb},()=>model);
 const open=ui.root.querySelector('.naval-weapon-picker'),hints=[];assert.ok(open,'the picker is mounted');
 for(const [i,button] of ui.buttons.entries()){open.dispatch('click');assert.equal(ui.root.dataset.weaponMenu,'true');button.dispatch('pointerup');button.dispatch('click');model.ammoIndex=i;picker.update();hints.push(ui.root.querySelector('.naval-weapon-hint').textContent);}
 picker.dispose();globalThis.location={search:''};return hints;
}

test('v24.9 flag: the naval voice is off unless ?navalVoice=1',()=>{
 assert.equal(navalVoiceEnabled(''),false);assert.equal(navalVoiceEnabled('?navalVoice=1'),true);assert.equal(navalVoiceEnabled('?navalVoice=0'),false);assert.equal(navalVoiceEnabled('?navalVoice=true'),false);assert.equal(navalVoiceEnabled('?dev=1&navalBattle=1'),false);
 assert.equal(kidUx('034'),true,'this test runs the kid picker of the phone (the one that spoke)');
});
test('v24.9 picker: choosing each of the six weapons makes no speech call, and the written hint is still there',()=>{
 reset();const hints=pickEveryWeapon('');silent('weapon picker');
 assert.equal(hints.length,6);for(const hint of hints)assert.ok(hint&&hint.length<=48,`a short written hint: "${hint}"`);
 assert.equal(new Set(hints).size,6,'each weapon has its own hint');
});
test('v24.9 picker: ?navalVoice=1 speaks the weapon sentence again, once a choice (so the counters above do see speech)',()=>{
 reset();pickEveryWeapon('?navalVoice=1');
 assert.equal(speech.spoken.length,6);assert.equal(speech.utterances,6);assert.equal(new Set(speech.spoken).size,6);for(const text of speech.spoken)assert.match(text,/[א-ת]/);
 store.set('island.sound','off');reset();pickEveryWeapon('?navalVoice=1');store.set('island.sound','on');assert.equal(speech.spoken.length,0,'the island sound switch still mutes it');
});

function paint(){const texts=[],state={font:'10px sans-serif'};const p=new Proxy(state,{get(target,key){if(key==='measureText')return text=>({width:String(text).length*6});if(key in target)return target[key];if(key==='fillText')return text=>{texts.push({text:String(text),font:target.font});};return ()=>{};},set(target,key,value){target[key]=value;return true;}});return {p,texts};}
const project=(x,z,y=0)=>({x:422+z*1.3,y:250-(x-80)*.4-y*3,depth:2});

test('v24.9 battle: stages 1 and 30 played by the child bot with the HUD drawn make sounds and not one speech call',()=>{
 reset();
 for(const stage of [1,30]){const sounds=[],screen=paint();
  const make=(level,seed)=>{const m=createNavalModel({config:phone,balance:nb,level,seed,random:seededRandom(seed),navalBattle:true,navalHarder:true,sound:name=>sounds.push(name)});
   const update=m.update;let frame=0;m.update=(dt,input)=>{update(dt,input);if(frame++%6===0){drawNavalHud(screen.p,m,{config:phone,balance:nb,art:{enemyNames:[]},t},project);drawNavalV241(screen.p,m,nb,project,844,390);}};return m;};
  const played=playStage(make,stage,1,{balance:nb,style:'lockButton',notice:.6},90);assert.ok(played,'the bot played stage '+stage);
  assert.ok(sounds.length>20,`stage ${stage}: ${sounds.length} sound effects still play`);assert.ok(sounds.includes('cannon'),'the cannon is heard by the model');
  assert.ok(screen.texts.length>50,'the HUD was drawn');silent('battle stage '+stage);
 }
});
test('v24.8 lock lost in a v24.9 battle: the message is small written text ("slow down"), a sound effect, and no speech call',()=>{
 // The tracker of this test gives up sooner than the game's (break speed 12 instead of 100, after .3 s instead of 1 s), so the weaving below
 // is sure to lose the lock; the code path (reason 'track', the radarLost effect, the HUD word) is the game's own.
 const tight={...nb,harder:{...nb.harder,lock:{...nb.harder.lock,slowSpeed:[4,4],breakSpeed:[12,12],breakSeconds:[.3,.3]}}};
 reset();const sounds=[],screen=paint(),m=createNavalModel({config:phone,balance:tight,level:30,seed:3,random:seededRandom(3),navalBattle:true,navalHarder:true,sound:name=>sounds.push(name)});
 for(let i=0;i<40;i++)m.update(FRAME,{});let lost=0,seen=null,shown=null;
 // The recipe of the v24.8 test: weaving at full speed while the Lock button is tapped whenever nothing is locked or acquiring.
 for(let i=0;i<60*25&&!m.result;i++){const input={moveX:Math.sin(i/22),moveZ:Math.cos(i/31)};if(!m.radar&&!m.homing)input.lockSmart=true;m.update(FRAME,input);
  drawNavalHud(screen.p,m,{config:phone,balance:tight,art:{enemyNames:[]},t},project);const out=drawNavalV241(screen.p,m,tight,project,844,390);if(out?.lost?.reason==='track')shown=out.lost;
  if(m.radarLost&&m.radarLost.reason==='track'&&m.radarLost.time!==seen){seen=m.radarLost.time;lost++;}}
 assert.ok(lost>=1,'the tracker lost the hull at least once: '+lost);assert.ok(sounds.includes('radarLost'),'the lost lock has its sound effect');
 assert.ok(shown,'the lost-lock message was on the screen');assert.equal(shown.word,NAVAL_V241_WORDS.track);assert.match(shown.word,/האטו/);
 const drawn=screen.texts.filter(x=>x.text===NAVAL_V241_WORDS.track);assert.ok(drawn.length>0);for(const x of drawn)assert.ok(Number(/(\d+)px/.exec(x.font)[1])<=12,'the message is drawn at 12 px or less: '+x.font);assert.ok(shown.box.h<=24&&shown.box.w<=260,JSON.stringify(shown.box));
 silent('lock lost');
});
test('v24.9 code: the naval modules hold no speech engine and no voice clip; the only spoken line is the picker\'s, behind the flag',async()=>{
 const files=(await readdir(new URL('minigames/',island))).filter(n=>/^(naval|ultra-naval|g6d|g6e)[\w.-]*\.mjs$/.test(n));assert.ok(files.length>40);
 for(const name of files){const code=await read('minigames/'+name);
  assert.ok(!/speechSynthesis|SpeechSynthesisUtterance|new Audio\(|createLearningVoice|voice\.mjs/.test(code),name+' has no speech engine and no Audio clip');
  if(name!=='naval-hud.mjs')assert.ok(!/kidSpeak/.test(code),name+' does not speak');}
 const hud=await read('minigames/naval-hud.mjs');assert.equal(hud.match(/kidSpeak\(/g).length,1);assert.match(hud,/if\(kidPicker&&voice&&button&&!button\.disabled&&open\)\{\s*try \{ if\(localStorage\.getItem\('island\.sound'\)!=='off'\)kidSpeak\(/);assert.match(hud,/const voice=navalVoiceEnabled\(\);/);
 // Every naval sample is an effect (cannon, water, radar tone, engine...): no file is a spoken clip.
 const samples=[...G6D_AUDIO_FILES,...Object.values(NAVAL_V24_AUDIO),...NAVAL_AIR_AUDIO_FILES];assert.ok(samples.length>10);
 for(const name of samples)assert.ok(!/voice|speech|say|talk|word|call|announce|narrat|rec\b/i.test(name),name+' is a sound effect');
});
