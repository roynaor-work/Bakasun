/** Aliens v24 effects (Codex alien-fx-v1 and the effects of alien-v16, CC0; runtime copies in assets/alien-fx-v1 and assets/alien-v16, without their previews,
 * sources and evidence). Presentation only: the model is read, never written, so the game plays exactly as v23.
 *  - alien-fx-v1: the cannon flame on every regular shot, the Vulcan burst flame while the Vulcan streams (a 500 ms cycle), the Vulcan heat meter next to the
 *    ship (the sprite bar, its green, yellow and red fill, the six-frame shutdown while the Vulcan is locked) and its colours on the Vulcan button ring,
 *    impact sparks on every hit, an explosion on every kill, the boss explosion with its shock wave, the shield ring around the ship, and three sounds
 *    (the Vulcan burst instead of the BRRRT loop, the overheat sigh when it locks, the boss explosion).
 *  - alien-v16, the effects only: the laser beam sprite (the laser bonus and the laser volley), its muzzle flash and the laser zap, and the cyan impact
 *    spark where a shot meets an alien shield or a boss guard. Not connected on purpose: the six bosses and the boss alarm (the 30-boss build is a stage of
 *    its own), the bonus icons and the timer ring (the v10 tokens stay), and the alien plasma (the v10 danger look of enemy fire stays readable).
 * Off with ?alienFx=0 (or globalThis.__alienFx=false): no file is loaded and every draw falls back to the v23 drawing. A sprite that has not loaded (or failed)
 * is skipped and the v23 drawing of that effect stays; a sound that cannot be decoded keeps the previous sound. */
export function alienFxEnabled(search=globalThis.location?.search||'',flag=globalThis.__alienFx){
 if(flag===false||flag==='0')return false;
 try{return new URLSearchParams(search).get('alienFx')!=='0';}catch{return true;}
}
export const FX_DIR='../assets/alien-fx-v1/',V16_DIR='../assets/alien-v16/';
const even=(ms,n)=>Object.freeze(Array(n).fill(ms));
const sprite=(file,w,h,cols,ms,pivot=[.5,.5],extra={})=>Object.freeze({file,w,h,cols,count:ms.length,ms,pivot:Object.freeze(pivot),...extra});
/** Sprite sheets, frame grid and timing as in design/alien-fx-v1/manifest.json and design/alien-v16/animations.json (tests/island-aliens-assets-v24 checks them). */
export const FX_SPRITES=Object.freeze({
 cannon:sprite(FX_DIR+'sprites/cannon-regular.png',128,128,4,even(45,4),[.5,.92]),
 vulcan:sprite(FX_DIR+'sprites/vulcan-burst.png',128,128,8,even(62.5,8),[.5,.92]),
 heatBar:sprite(FX_DIR+'sprites/heat-bar.png',256,32,1,even(0,1),[0,0],{fill:Object.freeze({x:38,y:8,w:208,h:16}),dividers:Object.freeze([106,175]),background:'#243e52',divider:'#152c3b'}),
 heatIcon:sprite(FX_DIR+'sprites/heat-icon.png',32,32,1,even(0,1)),
 shutdown:sprite(FX_DIR+'sprites/overheat-shutdown.png',256,32,6,even(200,6)),
 impact:sprite(FX_DIR+'sprites/alien-impact.png',128,128,6,Object.freeze([35,40,50,65,80,90])),
 explosion:sprite(FX_DIR+'sprites/alien-explosion.png',128,256,4,Object.freeze([45,55,65,80,90,105,120,140]),[.5,.5],{art:Object.freeze({x:8,y:78,w:112,h:100})}),
 boss:sprite(FX_DIR+'sprites/boss-explosion.png',128,128,8,even(23.4375,64),[.5,.5],{lazy:true}),
 shield:sprite(FX_DIR+'sprites/shield-ring.png',128,128,8,even(100,8),[.5,.5],{loop:true}),
 laser:sprite(V16_DIR+'sprites/player-laser.png',128,64,4,even(1000/24,4),[.5,.5],{loop:true}),
 muzzle:sprite(V16_DIR+'sprites/muzzle-flash.png',128,128,4,even(1000/30,4)),
 spark:sprite(V16_DIR+'sprites/impact-spark.png',128,128,6,even(1000/30,6))
});
/** Sounds: OGG first, MP3 where the browser cannot play OGG (the v16 zap is Opus only: a browser without it keeps the drawn laser sound). */
export const FX_SOUNDS=Object.freeze({
 vulcan:Object.freeze({files:Object.freeze([FX_DIR+'audio/vulcan-burst.ogg',FX_DIR+'audio/vulcan-burst.mp3']),gain:.55,voices:4}),
 overheat:Object.freeze({files:Object.freeze([FX_DIR+'audio/overheat.ogg',FX_DIR+'audio/overheat.mp3']),gain:.7,voices:1}),
 boss:Object.freeze({files:Object.freeze([FX_DIR+'audio/boss-explosion.ogg',FX_DIR+'audio/boss-explosion.mp3']),gain:.8,voices:2}),
 laser:Object.freeze({files:Object.freeze([V16_DIR+'audio/laser-zap.ogg']),gain:.5,voices:3})
});
export const FX_FILES=Object.freeze([...new Set([...Object.values(FX_SPRITES).map(s=>s.file),...Object.values(FX_SOUNDS).flatMap(s=>s.files)])]);
/** The Vulcan meter's colours: the stops of the sprite's fill gradient (sampled from heat-bar.png at 2%, 50% and 99% of the fill). */
export const FX_HEAT_COLORS=Object.freeze({green:'#41e892',yellow:'#ffdc46',red:'#ff555a',lock:'#ff555a',blink:'#ffffff'});
/** One Vulcan burst (flame cycle and sound) is 500 ms: while the Vulcan streams, a new one starts every 500 ms of game time. */
export const BURST_SECONDS=.5;
export const LIMITS=Object.freeze({impacts:16,explosions:12,sparks:8,muzzles:4,perAlienGap:.08});

export const durationOf=s=>s.ms.reduce((a,b)=>a+b,0);
/** Frame index at `ms` after the start: one-shot sprites return -1 once they are over, looping ones wrap. */
export function frameAt(s,ms){
 const total=durationOf(s);if(!(total>0))return 0;
 let t=ms<0?0:ms;if(s.loop)t%=total;else if(t>=total)return -1;
 for(let i=0,sum=0;i<s.count;i++){sum+=s.ms[i];if(t<sum)return i;}
 return s.count-1;
}
/** Source rectangle of frame i in the sheet. */
export function frameRect(s,i){return {x:(i%s.cols)*s.w,y:Math.floor(i/s.cols)*s.h,w:s.w,h:s.h};}

const registry=new WeakMap();
/** The draw modules find the effects of a model here (null = the v23 drawing). */
export function attachFx(model,fx){if(model&&fx)registry.set(model,fx);return fx;}
export function fxFor(model){return model?registry.get(model)||null:null;}

/** Presentation state from the model, one call per simulation frame (session tick). Reads only: aliens (id, position, hitTime, boss, radius), the two
 * cannons' last shot times, the Vulcan (on, locked) and the feedback signal. Spawns short-lived effects stamped with model time; returns {lock} when the
 * Vulcan locked this frame (the overheat sound). An alien that leaves the list above the ship was destroyed (the only other way out is landing past the
 * ship, which is a hit on the player, not an explosion). */
export function createFxTracker({limits=LIMITS,random=Math.random}={}){
 const seen=new Map(),effects=[];let lastCannon=[-1,-1],vulcanOn=false,vulcanStart=-1,lockStart=-1,locked=false,lastFeedback=0,started=false;
 const counts={impacts:0,explosions:0,bosses:0,flames:0,bursts:0,sparks:0,muzzles:0,overheats:0};
 const GROUP={impact:'impacts',explosion:'explosions',boss:'explosions',spark:'sparks',muzzle:'muzzles'},LIFE={boss:1.51,explosion:.71,impact:.37,flame:.19,spark:.21,muzzle:.14};   // seconds: each sheet's length and a frame of slack
 function add(kind,x,y,t,extra={}){
  const group=GROUP[kind],cap=limits[group]??99;
  if(group&&effects.reduce((n,e)=>n+(GROUP[e.kind]===group),0)>=cap){const i=effects.findIndex(e=>GROUP[e.kind]===group);if(i>=0)effects.splice(i,1);}
  effects.push({kind,x,y,t,...extra});
 }
 function track(m){
  const t=m.time||0,out={lock:false};
  for(let i=effects.length-1;i>=0;i--)if(t-effects[i].t>(LIFE[effects[i].kind]||1)||t<effects[i].t-1e-9)effects.splice(i,1);
  const field=m.player?.y??Infinity,now=new Set();
  for(const a of m.aliens||[]){now.add(a.id);const prev=seen.get(a.id);
   if(prev&&a.hitTime>prev.hitTime+1e-6&&t-prev.lastImpact>=limits.perAlienGap){add('impact',a.x+(random()-.5)*a.radius*.6,a.y+a.radius*.45,t,{size:a.radius});counts.impacts++;prev.lastImpact=t;}
   if(prev){prev.x=a.x;prev.y=a.y;prev.hitTime=a.hitTime;prev.radius=a.radius;prev.boss=Boolean(a.boss);}
   else seen.set(a.id,{x:a.x,y:a.y,hitTime:a.hitTime||0,radius:a.radius,boss:Boolean(a.boss),lastImpact:-1});}
  for(const [id,prev] of seen)if(!now.has(id)){seen.delete(id);if(started&&prev.y<field+4){if(prev.boss){add('boss',prev.x,prev.y,t,{size:prev.radius});counts.bosses++;}else{add('explosion',prev.x,prev.y,t,{size:prev.radius});counts.explosions++;}}}
  // flames: a regular shot = a one-shot flame on that cannon; the Vulcan stream = a 500 ms burst cycle on both (drawn from vulcanStart)
  // (the bullet that fills the gauge leaves in the frame the Vulcan locks: it still belongs to the stream)
  const cannon=m.cannonLast||[],streaming=Boolean(m.vulcanOn)||vulcanOn;for(const side of [0,1]){const at=cannon[side];if(started&&at>lastCannon[side]&&!streaming){add('flame',side,0,at);counts.flames++;}lastCannon[side]=at??-1;}
  if(m.vulcanOn&&!vulcanOn){vulcanStart=t;counts.bursts++;}vulcanOn=Boolean(m.vulcanOn);
  if(m.vulcanLocked&&!locked){lockStart=t;counts.overheats++;out.lock=started;}locked=Boolean(m.vulcanLocked);
  // a shot that met an alien shield or a boss guard: the cyan spark
  const fb=m.feedback;if(fb&&fb.id!==lastFeedback&&fb.life>0&&(fb.kind==='shield-hit'||fb.kind==='boss-guard')&&started){add('spark',fb.x,fb.y,t);counts.sparks++;}lastFeedback=fb?.id??lastFeedback;
  started=true;return out;
 }
 /** the laser volley fired (the session's 'laser' sound event): a muzzle flash at the ship's nose */
 function muzzle(m){add('muzzle',m.player.x,m.player.y-(m.muzzleForward||22),m.time||0);counts.muzzles++;}
 return {track,muzzle,effects,counts,get vulcanStart(){return vulcanOn?vulcanStart:-1;},get lockStart(){return locked?lockStart:-1;},reset(){seen.clear();effects.length=0;started=false;}};
}

/** Sounds on a small Web Audio context of their own (same mute key as the island): play(id) = one voice, at most `voices` at a time per sound.
 * vulcanPulse(time) is called for every Vulcan bullet and starts a new 500 ms burst when the last one is over, so a held Vulcan is a chain of bursts. */
export function createFxAudio({storage=globalThis.localStorage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch,canPlay=null}={}){
 let context=null,master=null,paused=false,disposed=false,lastBurst=-Infinity,played=0;const buffers=new Map(),active=new Map(),failed=new Set();
 const muted=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
 const playable=canPlay||(type=>{try{return Boolean(globalThis.document?.createElement('audio').canPlayType(type));}catch{return false;}});
 async function load(id){
  for(const file of FX_SOUNDS[id].files){
   if(file.endsWith('.ogg')&&!playable(id==='laser'?'audio/ogg; codecs=opus':'audio/ogg; codecs=vorbis'))continue;
   try{const r=await fetcher(new URL(file+'?v=island-v2-20261107-11',import.meta.url).href);if(!r.ok)continue;const b=await context.decodeAudioData(await r.arrayBuffer());if(!disposed){buffers.set(id,b);return true;}}catch{/* next format */}
  }
  failed.add(id);return false;
 }
 let loading=null;
 function unlock(){
  if(disposed||!AudioContext)return;
  try{if(!context){context=new AudioContext();master=context.createGain();master.gain.value=muted()?0:1;master.connect(context.destination);loading=Promise.all(Object.keys(FX_SOUNDS).map(load));}
   if(!paused&&context.state==='suspended')void context.resume().catch(()=>{});}catch{/* audio never stops the game */}
 }
 function ready(id){return Boolean(context&&context.state==='running'&&buffers.has(id)&&!paused&&!disposed);}
 function play(id){
  if(muted()||!ready(id))return false;
  const spec=FX_SOUNDS[id],list=active.get(id)||[];while(list.length&&list[0].ends<=context.currentTime)list.shift();
  if(list.length>=spec.voices){try{list.shift().source.stop();}catch{}}
  try{const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(id);gain.gain.value=spec.gain;source.connect(gain);gain.connect(master);source.start();
   list.push({source,ends:context.currentTime+source.buffer.duration});active.set(id,list);played++;return true;}catch{return false;}
 }
 return {unlock,play,ready,get loading(){return loading;},
  /** One Vulcan bullet at game time t: true = the burst chain has it (a new burst when the last one ran its 500 ms), false = keep the previous sound. */
  vulcanPulse(t){if(!ready('vulcan')||muted())return false;if(t-lastBurst>=BURST_SECONDS-.02||t<lastBurst){if(!play('vulcan'))return false;lastBurst=t;}return true;},
  setPaused(value){paused=Boolean(value);if(paused){for(const list of active.values())for(const v of list){try{v.source.stop();}catch{}}active.clear();if(context?.state==='running')void context.suspend().catch(()=>{});}else unlock();},
  sync(){if(master)master.gain.value=muted()||paused?0:1;},
  metrics(){return {played,loaded:[...buffers.keys()],failed:[...failed],running:context?.state==='running'};},
  dispose(){disposed=true;for(const list of active.values())for(const v of list){try{v.source.stop();}catch{}}active.clear();if(context)void context.close().catch(()=>{});}};
}

/** The runtime of one game: images (the boss explosion only when the first boss is on screen), the tracker, the audio. null without a DOM (tests, workers). */
export function createAlienFx({doc=globalThis.document,ImageClass=globalThis.Image,audio=true,audioOptions={}}={}){
 if(!doc||!ImageClass)return null;
 const images=new Map(),failed=new Set(),tracker=createFxTracker(),fxAudio=audio?createFxAudio(audioOptions):null;let disposed=false;
 function load(key){
  if(images.has(key)||failed.has(key)||disposed)return;
  const img=new ImageClass();img.decoding='async';images.set(key,img);
  img.onerror=()=>{images.delete(key);failed.add(key);};img.src=new URL(FX_SPRITES[key].file+'?v=island-v2-20261107-11',import.meta.url).href;
 }
 for(const [key,s] of Object.entries(FX_SPRITES))if(!s.lazy)load(key);
 // the controls' Vulcan ring takes the meter's colours (alien-fx.css); removed on dispose
 const link=doc.createElement('link');link.rel='stylesheet';link.dataset.alienFx='v1';link.href=new URL('./alien-fx.css?v=island-v2-20261107-11',import.meta.url).href;doc.head?.append(link);
 return {
  /** the decoded sheet for a sprite, or null while it loads / after it failed (the caller draws the v23 effect then) */
  image(key){const img=images.get(key);return img&&img.complete&&img.naturalWidth>0?img:null;},
  /** once per simulation frame: the effects follow the model; the Vulcan's lock also plays the overheat sigh (on top of the existing sounds) */
  track(m){if(disposed)return;if(!images.has('boss')&&!failed.has('boss')&&(m.aliens||[]).some(a=>a.boss))load('boss');if(tracker.track(m).lock)fxAudio?.play('overheat');},
  tracker,audio:fxAudio,
  unlock(){fxAudio?.unlock();},
  /** The session's sound hook: true = the effects took the event (their own sample played), false = play the previous sound. */
  sound(event,m){
   if(disposed)return false;
   if(event==='laser'&&m)tracker.muzzle(m);
   if(!fxAudio)return false;
   if(event==='shot')return fxAudio.vulcanPulse(m?.time||0);
   if(event==='laser')return fxAudio.play('laser');
   if(event==='explosionBig')return fxAudio.play('boss');
   return false;
  },
  setPaused(v){fxAudio?.setPaused(v);},sync(){fxAudio?.sync();},
  metrics(){return {sprites:[...images.keys()].filter(k=>this.image(k)),failed:[...failed],effects:tracker.effects.length,counts:{...tracker.counts},audio:fxAudio?.metrics()||null};},
  dispose(){disposed=true;fxAudio?.dispose();link.remove();for(const img of images.values()){img.onerror=null;img.src='';}images.clear();tracker.reset();}
 };
}
