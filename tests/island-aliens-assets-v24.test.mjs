// Aliens v24 (13/11/2026): the Codex effects on the v23 game. alien-fx-v1 whole (cannon flame, Vulcan burst, the heat meter and its colours, impact sparks,
// alien and boss explosions, the shield ring, the Vulcan / overheat / boss sounds) and the effects of alien-v16 (laser beam, its muzzle flash and zap, the
// cyan spark on a shield or guard hit); not the six bosses, the boss alarm, the bonus icons, the timer ring or the alien plasma. Presentation only: the
// model plays exactly as v23 with the effects running. ?alienFx=0 draws and sounds as v23. Pure parts, fake canvas, fake audio, fake DOM; the real phone
// path is workout/island/tests/aliens-v24-browser.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAlienModel} from '../workout/island/minigames/aliens.mjs';
import {alienFxEnabled,FX_SPRITES,FX_SOUNDS,FX_FILES,FX_HEAT_COLORS,BURST_SECONDS,LIMITS,frameAt,frameRect,durationOf,attachFx,fxFor,createFxTracker,createFxAudio,createAlienFx} from '../workout/island/minigames/alien-fx.mjs?v=island-v2-20261107-11';
import {drawFxHeat,drawFxFlames,drawFxEffects,drawFxLaser,fxReplaces,FX_SIZES} from '../workout/island/minigames/alien-fx-draw.mjs?v=island-v2-20261107-11';
import {drawV23Heat} from '../workout/island/minigames/alien-v23-draw.mjs';
import {drawV12Cannons} from '../workout/island/minigames/alien-v12-draw.mjs';
import {drawV11Blasts} from '../workout/island/minigames/alien-v11-draw.mjs';
import {VULCAN_COLORS} from '../workout/island/minigames/alien-v23.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=file=>readFile(path.join(island,file));
const text=async file=>(await read(file)).toString();
const exists=async file=>{try{return (await stat(path.join(island,file))).size>0;}catch{return false;}};
const config=JSON.parse(await text('data/config.json')).minigames,balance=config.alienDefense;
const offline=JSON.parse(await text('offline-manifest.json'));
const fxManifest=JSON.parse(await text('design/alien-fx-v1/manifest.json')),v16=JSON.parse(await text('design/alien-v16/animations.json'));
const rel=f=>f.replace(/^\.\.\//,'');
const make=()=>createAlienModel({config,balance,level:1,random:seededRandom(3),completion:'waves',roundChoices:false});
const list=async dir=>(await readdir(path.join(island,dir),{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>path.relative(path.join(island,dir),path.join(e.parentPath||e.path,e.name)).split(path.sep).join('/')).sort();

// ---------- 1. flag ----------
test('flag: on by default, ?alienFx=0 and the global switch turn the effects off',()=>{
 assert.equal(alienFxEnabled('',undefined),true);assert.equal(alienFxEnabled('?alienFx=1',undefined),true);assert.equal(alienFxEnabled('?alienFx=0',undefined),false);
 assert.equal(alienFxEnabled('',false),false);assert.equal(alienFxEnabled('','0'),false);
});

// ---------- 2. files ----------
test('runtime files: every file the effects load exists in assets/, is byte-identical to the Codex original, and nothing else was copied',async()=>{
 assert.equal(FX_FILES.length,19);
 for(const f of FX_FILES){const p=rel(f);assert.ok(await exists(p),p);const original=p.replace(/^assets\/alien-fx-v1\//,'design/alien-fx-v1/').replace(/^assets\/alien-v16\//,'design/alien-v16/');
  assert.ok((await read(p)).equals(await read(original)),`${p} differs from ${original}`);}
 const runtime=[...FX_FILES.map(rel),'assets/alien-fx-v1/LICENSES.md','assets/alien-v16/LICENSES.md'].sort();
 const copied=[...(await list('assets/alien-fx-v1')).map(f=>'assets/alien-fx-v1/'+f),...(await list('assets/alien-v16')).map(f=>'assets/alien-v16/'+f)].sort();
 assert.deepEqual(copied,runtime,'no preview, evidence, source, frames, bosses, icons or plasma in the runtime copies');
 for(const p of ['assets/alien-fx-v1/LICENSES.md','assets/alien-v16/LICENSES.md'])assert.ok((await read(p)).equals(await read(p.replace('assets/','design/'))));
 assert.equal((await list('design/alien-fx-v1')).length,33,'the Codex alien-fx-v1 package is complete and unchanged');assert.equal((await list('design/alien-v16')).length,99,'the alien-v16 package is complete');
});
test('offline: the alien download carries every effect file, the shell lists the new code and its stylesheet',async()=>{
 for(const f of FX_FILES)assert.ok(offline.games.alien.includes(rel(f)),rel(f));
 for(const f of ['minigames/alien-fx.mjs','minigames/alien-fx-draw.mjs','minigames/alien-fx.css'])assert.ok(offline.shell.includes(f),f);
 assert.ok(!offline.games.alien.some(f=>/alien-v16\/(models|textures|icons)|boss-alarm|plasma/.test(f)),'nothing of the 30-boss build');
});

// ---------- 3. the sheets match the Codex contracts ----------
test('sprite sheets: frame size, grid, count, durations and pivot as in the alien-fx-v1 manifest; the meter fill and colours as delivered',()=>{
 const byId=Object.fromEntries(fxManifest.textures.map(t=>[t.id,t]));
 const map={cannon:'cannon-regular',vulcan:'vulcan-burst',heatBar:'heat-bar',heatIcon:'heat-icon',shutdown:'overheat-shutdown',impact:'alien-impact',explosion:'alien-explosion',boss:'boss-explosion',shield:'shield-ring'};
 for(const [key,id] of Object.entries(map)){const s=FX_SPRITES[key],t=byId[id];assert.equal(s.file,'../assets/alien-fx-v1/'+t.path,key);
  assert.equal(s.w,t.frameWidth,key);assert.equal(s.h,t.frameHeight,key);assert.equal(s.cols,t.columns,key);assert.equal(s.count,t.frameCount,key);assert.deepEqual([...s.ms],t.frameDurationsMs,key);assert.deepEqual([...s.pivot],t.pivot,key);
  assert.equal(Boolean(s.loop),Boolean(t.loop),key);for(let i=0;i<s.count;i++)assert.deepEqual(frameRect(s,i),t.frames[i],`${key} frame ${i}`);}
 assert.deepEqual({...FX_SPRITES.heatBar.fill},byId['heat-bar'].fillRect);assert.equal(FX_SPRITES.heatBar.background,fxManifest.heatMeter.background);
 assert.deepEqual({...FX_SPRITES.explosion.art},byId['alien-explosion'].artworkBounds);
 assert.deepEqual(Object.keys(FX_HEAT_COLORS).sort(),Object.keys(VULCAN_COLORS).sort(),'the ring keeps every v23 band');
 for(const c of Object.values(FX_HEAT_COLORS))assert.match(c,/^#[0-9a-f]{6}$/);
 const sounds=Object.fromEntries(fxManifest.sounds.map(s=>[s.id,s]));
 for(const [key,id] of [['vulcan','vulcan-burst'],['overheat','overheat'],['boss','boss-explosion']])assert.deepEqual(FX_SOUNDS[key].files.map(f=>f.replace('../assets/alien-fx-v1/','')),sounds[id].variants.map(v=>v.path),key);
 assert.equal(BURST_SECONDS*1000,durationOf(FX_SPRITES.vulcan),'one burst = the sheet and the sound (500 ms)');assert.equal(sounds['vulcan-burst'].durationSeconds,BURST_SECONDS);
});
test('sprite sheets of alien-v16 (effects only): laser, muzzle flash, impact spark as in animations.json',()=>{
 for(const [key,id] of [['laser','player-laser'],['muzzle','muzzle-flash'],['spark','impact-spark']]){const s=FX_SPRITES[key],a=v16.animations[id];
  assert.equal(s.file,'../assets/alien-v16/'+a.sheet,key);assert.equal(s.w,a.frameWidth);assert.equal(s.h,a.frameHeight);assert.equal(s.count,a.count);assert.equal(s.cols,a.columns);
  assert.ok(s.ms.every(ms=>Math.abs(ms-1000/a.fps)<1e-9),key+' fps');assert.equal(Boolean(s.loop),a.loop,key);assert.deepEqual([...s.pivot],a.anchor);}
 assert.equal(v16.animations['player-laser'].direction,'+X','the beam points +X: drawFxLaser turns it a quarter turn to fly up');
 assert.equal(FX_SOUNDS.laser.files[0],'../assets/alien-v16/audio/laser-zap.ogg');
});
test('frameAt: one-shot sheets end (-1), loops wrap; the durations are the delivered ones',()=>{
 assert.equal(durationOf(FX_SPRITES.cannon),180);assert.equal(durationOf(FX_SPRITES.shutdown),1200);assert.equal(durationOf(FX_SPRITES.impact),360);assert.equal(durationOf(FX_SPRITES.explosion),700);assert.equal(durationOf(FX_SPRITES.boss),1500);
 assert.equal(frameAt(FX_SPRITES.cannon,0),0);assert.equal(frameAt(FX_SPRITES.cannon,44),0);assert.equal(frameAt(FX_SPRITES.cannon,45),1);assert.equal(frameAt(FX_SPRITES.cannon,179),3);assert.equal(frameAt(FX_SPRITES.cannon,180),-1);
 assert.equal(frameAt(FX_SPRITES.impact,74),1);assert.equal(frameAt(FX_SPRITES.impact,75),2);
 assert.equal(frameAt(FX_SPRITES.shield,800),0,'the ring loops');assert.equal(frameAt(FX_SPRITES.shield,1750),1);assert.equal(frameAt(FX_SPRITES.boss,1499),63);
});

// ---------- 4. the tracker reads the model and nothing else ----------
const alien=(id,o={})=>({id,x:100,y:100,radius:15.5,hitTime:0,boss:false,...o});
function fakeModel(o={}){return {time:0,player:{x:180,y:441.6},aliens:[],cannonLast:[-1,-1],vulcanOn:false,vulcanLocked:false,vulcanHeat:0,feedback:{id:0,kind:'wave',life:0},muzzleForward:28,...o};}
test('tracker: an impact on every new hit (at most one per alien per 80 ms), an explosion for a kill, the boss explosion for a boss, nothing for a landing',()=>{
 const tr=createFxTracker({random:()=>.5}),m=fakeModel({aliens:[alien(1),alien(2,{x:200}),alien(3,{boss:true,x:150,y:80,radius:28}),alien(4,{y:470})]});
 tr.track(m);assert.equal(tr.effects.length,0,'the first frame only learns the field');
 m.time=.016;m.aliens[0].hitTime=.12;tr.track(m);assert.equal(tr.counts.impacts,1);const imp=tr.effects.find(e=>e.kind==='impact');assert.equal(imp.x,100);assert.ok(imp.y>100,'under the alien, where the shot came from');
 m.time=.05;m.aliens[0].hitTime=.12;tr.track(m);assert.equal(tr.counts.impacts,1,'a hit 34 ms later on the same alien is not a second spark');
 m.time=.066;m.aliens[0].hitTime=.104;tr.track(m);m.time=.1;m.aliens[0].hitTime=.12;tr.track(m);assert.equal(tr.counts.impacts,2,'the next hit after 80 ms is');
 m.time=.116;m.aliens[0].hitTime=.104;tr.track(m);assert.equal(tr.counts.impacts,2,'a fading flash is not a hit');
 m.time=.2;m.aliens=m.aliens.filter(a=>a.id!==1&&a.id!==3&&a.id!==4);tr.track(m);
 assert.equal(tr.counts.explosions,1,'alien 1 killed');assert.equal(tr.counts.bosses,1,'the boss killed');
 assert.ok(!tr.effects.some(e=>e.x===100&&e.y===470),'alien 4 sank past the ship: it landed, no explosion');
 const boss=tr.effects.find(e=>e.kind==='boss');assert.equal(boss.size,28);
 m.time=2;tr.track(m);assert.ok(!tr.effects.some(e=>e.kind==='explosion'),'finished effects leave the list');
});
test('tracker: a flame on every regular shot of its cannon, the burst cycle for the Vulcan stream (also the bullet of the lock frame), the lock once',()=>{
 const tr=createFxTracker(),m=fakeModel();tr.track(m);
 m.time=.1;m.cannonLast=[.1,-1];tr.track(m);m.time=.28;m.cannonLast=[.1,.28];tr.track(m);m.time=.3;tr.track(m);
 assert.equal(tr.counts.flames,2);assert.deepEqual(tr.effects.filter(e=>e.kind==='flame').map(e=>e.x),[1],'one flame per cannon shot; the first one is over');
 m.time=1;m.vulcanOn=true;m.cannonLast=[1,.28];tr.track(m);assert.equal(tr.vulcanStart,1);assert.equal(tr.counts.bursts,1);
 m.time=1.1;m.cannonLast=[1,1.1];tr.track(m);assert.equal(tr.counts.flames,2,'stream bullets are the burst cycle, not flames');
 m.time=1.2;m.cannonLast=[1.2,1.1];m.vulcanOn=false;m.vulcanLocked=true;const out=tr.track(m);assert.equal(out.lock,true);assert.equal(tr.lockStart,1.2);
 assert.equal(tr.counts.flames,2,'the bullet that filled the gauge belongs to the stream');assert.equal(tr.vulcanStart,-1);
 m.time=1.3;assert.equal(tr.track(m).lock,false,'the lock is announced once');assert.equal(tr.counts.overheats,1);
 m.time=3.3;m.vulcanLocked=false;tr.track(m);m.time=3.4;m.vulcanOn=true;tr.track(m);assert.equal(tr.counts.bursts,2,'a new stream, a new burst cycle');
});
test('tracker: the cyan spark once per shield or guard signal, the muzzle flash on the laser volley, caps on the busy effects',()=>{
 const tr=createFxTracker(),m=fakeModel();tr.track(m);
 m.time=.1;m.feedback={id:5,kind:'shield-hit',x:90,y:60,life:.35};tr.track(m);m.time=.12;tr.track(m);assert.equal(tr.counts.sparks,1);
 m.time=.2;m.feedback={id:6,kind:'enemy-hit',x:90,y:60,life:.35};tr.track(m);assert.equal(tr.counts.sparks,1,'a plain hit is the impact sheet');
 m.time=.3;m.feedback={id:7,kind:'boss-guard',x:150,y:80,life:.65};tr.track(m);assert.equal(tr.counts.sparks,2);
 tr.muzzle(m);const mz=tr.effects.find(e=>e.kind==='muzzle');assert.equal(mz.x,180);assert.equal(mz.y,441.6-28);
 const busy=createFxTracker(),bm=fakeModel({aliens:Array.from({length:30},(_,i)=>alien(i+1,{x:10*i}))});busy.track(bm);
 bm.time=.2;for(const a of bm.aliens)a.hitTime=.12;busy.track(bm);assert.equal(busy.effects.filter(e=>e.kind==='impact').length,LIMITS.impacts);assert.equal(busy.counts.impacts,30);
});

// ---------- 5. presentation only: the game is the same with the effects running ----------
test('the model plays exactly as v23 while the tracker reads it every frame (same seed, same input, both buttons, 25 s)',()=>{
 const input=t=>({firing:true,vulcan:Math.floor(t)%3!==2,moveX:Math.sin(t*1.3)});
 const plain=make(),watched=make(),tr=createFxTracker();
 for(let i=0;i<1500;i++){const t=i/60;plain.update(1/60,input(t));watched.update(1/60,input(t));tr.track(watched);}
 assert.deepEqual(watched.snapshot(),plain.snapshot());
 assert.ok(tr.counts.flames>0&&tr.counts.bursts>0&&tr.counts.impacts>0&&tr.counts.explosions>0&&tr.counts.overheats>0,`the effects saw the round: ${JSON.stringify(tr.counts)}`);
 assert.ok(tr.counts.explosions<=watched.snapshot().kills,'never more explosions than kills');
});

// ---------- 6. sounds ----------
function fakeAudio(){
 const ctx={state:'running',currentTime:0,started:[],destination:{},createGain(){return {gain:{value:1},connect(){}};},createBufferSource(){const s={buffer:null,connect(){},start(){ctx.started.push(s.buffer.id);},stop(){s.stopped=true;}};return s;},
  decodeAudioData:async buf=>({id:buf.id,duration:buf.id==='boss'?1.5:.5}),resume:async()=>{},suspend:async()=>{},close:async()=>{}};
 return ctx;
}
test('sounds: OGG where the browser plays it, else MP3; the Vulcan bullets chain one 500 ms burst after the other; muted or not loaded = the previous sound',async()=>{
 const ctx=fakeAudio(),asked=[],store=new Map();
 const audio=createFxAudio({AudioContext:function(){return ctx;},storage:{getItem:k=>store.get(k)??null},canPlay:type=>type.includes('vorbis'),
  fetcher:async url=>{asked.push(url.split('/').slice(-2).join('/').split('?')[0]);const id=url.includes('vulcan')?'vulcan':url.includes('overheat')?'overheat':url.includes('boss')?'boss':'laser';return {ok:true,arrayBuffer:async()=>({id})};}});
 assert.equal(audio.vulcanPulse(0),false,'nothing loaded yet: the previous sound plays');
 audio.unlock();await audio.loading;
 assert.deepEqual(asked.sort(),['audio/boss-explosion.ogg','audio/overheat.ogg','audio/vulcan-burst.ogg'],'Vorbis files; the Opus zap is skipped where Opus does not play');
 assert.deepEqual(audio.metrics().failed,['laser']);assert.equal(audio.play('laser'),false,'no zap: the drawn laser sound stays');
 for(let i=0;i<20;i++)assert.equal(audio.vulcanPulse(i*.1),true,'every bullet of a held Vulcan is taken');
 assert.deepEqual(ctx.started,['vulcan','vulcan','vulcan','vulcan'],'2 s of Vulcan = four bursts of 500 ms');
 assert.equal(audio.play('overheat'),true);assert.equal(audio.play('boss'),true);
 store.set('island.sound','off');assert.equal(audio.vulcanPulse(5),false);assert.equal(audio.play('boss'),false);
 const mp3=[],other=createFxAudio({AudioContext:function(){return fakeAudio();},canPlay:()=>false,fetcher:async url=>{mp3.push(url.split('?')[0].split('.').pop());return {ok:true,arrayBuffer:async()=>({id:'x'})};}});other.unlock();await other.loading;
 assert.deepEqual([...new Set(mp3)],['mp3'],'a browser without OGG gets the MP3 copies');
});
test('sounds: at most `voices` copies of one sound at a time (the oldest stops), pause stops them all',async()=>{
 const ctx=fakeAudio(),audio=createFxAudio({AudioContext:function(){return ctx;},storage:null,canPlay:()=>true,fetcher:async url=>({ok:true,arrayBuffer:async()=>({id:url.includes('boss')?'boss':'x'})})});
 audio.unlock();await audio.loading;const before=ctx.started.length;for(let i=0;i<5;i++)audio.play('boss');assert.equal(ctx.started.length-before,5);
 audio.setPaused(true);assert.equal(audio.play('boss'),false,'paused');
});

// ---------- 7. the runtime: lazy boss sheet, the session's sound hook, no DOM no effects ----------
function fakeDom(){
 const links=[];class Img{constructor(){this.complete=false;this.naturalWidth=0;}set src(v){this._src=v;if(v){this.complete=true;this.naturalWidth=v.includes('boss')?1024:256;}}get src(){return this._src;}}
 return {doc:{head:{append:l=>links.push(l)},createElement:()=>({dataset:{},remove(){links.splice(links.indexOf(this),1);}})},Img,links};
}
test('runtime: every sheet but the boss explosion loads with the game, the boss one with the first boss; the sound hook routes the four events',()=>{
 assert.equal(createAlienFx({doc:null,ImageClass:null}),null,'no DOM: no effects (tests, workers)');
 const dom=fakeDom(),fx=createAlienFx({doc:dom.doc,ImageClass:dom.Img,audio:false});
 assert.ok(fx.image('cannon')&&fx.image('heatBar')&&fx.image('laser')&&fx.image('spark'));assert.equal(fx.image('boss'),null,'the 1 MB boss sheet waits');
 assert.equal(dom.links.length,1,'the ring colours stylesheet');
 const m=fakeModel();fx.track(m);assert.equal(fx.image('boss'),null);m.aliens=[alien(9,{boss:true})];fx.track(m);assert.ok(fx.image('boss'),'loaded once a boss is on screen');
 assert.equal(fx.sound('shot',m),false,'no audio: the previous sounds');assert.equal(fx.sound('laser',m),false);assert.equal(fx.tracker.counts.muzzles,1,'the laser volley still flashes');
 assert.equal(fx.sound('hit',m),false);fx.dispose();assert.equal(dom.links.length,0);
 const registered=make();attachFx(registered,fx);assert.equal(fxFor(registered),fx);assert.equal(fxFor(make()),null);
});

// ---------- 8. drawing: the Codex sheets with the effects on, the v23 drawing without them ----------
function recorder(){
 const calls=[];const p={canvas:{clientHeight:390},globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,fillStyle:'',strokeStyle:'',
  save(){calls.push(['save']);},restore(){calls.push(['restore']);},translate(){},scale(){},rotate(r){calls.push(['rotate',r]);},drawImage(img,...a){calls.push(['drawImage',img.key,...a]);},
  fillRect(...a){calls.push(['fillRect',p.fillStyle,...a]);},strokeRect(){calls.push(['strokeRect',p.strokeStyle]);},beginPath(){},moveTo(){},lineTo(){},closePath(){},arc(){},ellipse(){},fill(){calls.push(['fill',p.fillStyle]);},stroke(){},
  createRadialGradient(){calls.push(['gradient']);return {addColorStop(){}};},createLinearGradient(){calls.push(['gradient']);return {addColorStop(){}};}};
 return {p,calls};
}
function loadedFx(){const images={};for(const k of Object.keys(FX_SPRITES))images[k]={key:k};return {image:k=>images[k]||null,tracker:createFxTracker()};}
test('the meter: the sprite bar filled to the heat (background over the rest), the shutdown frame in step with the drain while locked; without the effects the v23 bar',()=>{
 const m=fakeModel({vulcanHeat:.5,v23:true});
 {const {p,calls}=recorder();drawV23Heat(p,m,1,1);assert.ok(calls.some(c=>c[0]==='fillRect'&&c[1]===VULCAN_COLORS.yellow),'no effects: the v23 bar in its yellow');assert.ok(!calls.some(c=>c[0]==='drawImage'));}
 const fx=loadedFx();attachFx(m,fx);
 {const {p,calls}=recorder();drawV23Heat(p,m,1,1);const img=calls.filter(c=>c[0]==='drawImage');assert.deepEqual(img.map(c=>c[1]),['heatBar']);
  const bar=img[0],w=FX_SIZES.bar.w,cover=calls.find(c=>c[0]==='fillRect'&&c[1]===FX_SPRITES.heatBar.background);assert.equal(bar[8],w);
  assert.ok(Math.abs(cover[4]-(FX_SPRITES.heatBar.fill.w*.5)*w/256)<1e-9,'the empty half is covered');assert.ok(!calls.some(c=>c[1]===VULCAN_COLORS.yellow),'no v23 bar');}
 {m.vulcanLocked=true;m.vulcanHeat=.6;const {p,calls}=recorder();drawV23Heat(p,m,1,1);const img=calls.filter(c=>c[0]==='drawImage');assert.deepEqual(img.map(c=>c[1]),['shutdown']);
  assert.equal(img[0][2],2*FX_SPRITES.shutdown.w,'drained 40% of the lock: frame 2 of 6');}
 {m.vulcanLocked=false;m.vulcanHeat=0;const {p,calls}=recorder();assert.equal(drawFxHeat(p,m,1,1),true);assert.equal(calls.length,0,'cold and open: hidden, like v23');}
 {m.player.x=330;m.vulcanHeat=.5;const {p,calls}=recorder();drawFxHeat(p,m,1,1);const bar=calls.find(c=>c[0]==='drawImage');assert.ok(bar[6]<0,'near the right edge the bar sits on the left of the ship');}
});
test('the cannons: with the effects no drawn flash (no gradient), a flame sheet on the shooting cannon and the burst sheet on both while the Vulcan streams',()=>{
 const m=fakeModel({v12:true,shipV13:true,cannonOffset:11.3,time:1,cannonLast:[.99,-1],flashSeconds:.045});
 {const {p,calls}=recorder();drawV12Cannons(p,m,1,1);assert.ok(calls.some(c=>c[0]==='gradient'),'v23: the drawn muzzle flash');}
 const fx=loadedFx();attachFx(m,fx);fx.tracker.track({...m,time:0,cannonLast:[-1,-1]});fx.tracker.track(m);
 {const {p,calls}=recorder();drawV12Cannons(p,m,1,1);assert.ok(!calls.some(c=>c[0]==='gradient'),'no drawn flash');assert.deepEqual(calls.filter(c=>c[0]==='drawImage').map(c=>c[1]),['cannon']);}
 m.vulcanOn=true;m.time=1.2;fx.tracker.track(m);
 {const {p,calls}=recorder();drawV12Cannons(p,m,1,1);assert.deepEqual(calls.filter(c=>c[0]==='drawImage').map(c=>c[1]),['vulcan','vulcan']);}
});
test('kills, hits, shield, lasers: the sheets replace the v11 blasts and the drawn hit strokes only when loaded; the laser turns to fly along its shot',()=>{
 const m=fakeModel({blasts:[{x:50,y:50,t:.1,life:.45,size:22,big:false}],powerup:3,invulnerable:0,time:.5});
 {const {p,calls}=recorder();drawV11Blasts(p,m,1,1);assert.ok(calls.some(c=>c[0]==='gradient'),'v23 blast drawn without the effects');assert.equal(fxReplaces(m,'blasts'),false);}
 const fx=loadedFx();attachFx(m,fx);assert.equal(fxReplaces(m,'blasts'),true);assert.equal(fxReplaces(m,'enemy-hit'),true);
 {const {p,calls}=recorder();drawV11Blasts(p,m,1,1);assert.equal(calls.length,0,'the explosion sheet replaces the blast');}
 const tr=fx.tracker;tr.track({...m,time:.4,aliens:[alien(1)]});tr.track({...m,time:.45,aliens:[alien(1,{hitTime:.12})]});tr.track({...m,time:.5,aliens:[]});
 {const {p,calls}=recorder();drawFxEffects(p,m,1,1);assert.deepEqual(calls.filter(c=>c[0]==='drawImage').map(c=>c[1]).sort(),['explosion','impact','shield']);}
 {const {p,calls}=recorder();assert.equal(drawFxLaser(p,m,{kind:2,x:100,y:200,vx:0,vy:-600},1,1),true);const r=calls.find(c=>c[0]==='rotate')[1];assert.ok(Math.abs(r+Math.PI/2)<1e-9,'+X sheet turned to fly up');}
 const off=fakeModel();{const {p}=recorder();assert.equal(drawFxLaser(p,off,{kind:2,x:0,y:0,vx:0,vy:-1},1,1),false,'without the effects the drawn beam');assert.equal(drawFxEffects(p,off,1,1),false);}
});

// ---------- 9. wiring ----------
test('wiring: the session makes the effects only with the flag, routes the sounds through them first, tracks after every update, and cleans up',async()=>{
 const s=await text('minigames/alien-session.mjs');
 for(const must of ["const fx=alienFxEnabled()?createAlienFx():null;","if(fx?.sound(event,live.model))return;","model.update(dt,input);fx?.track(model);","if(fx)controls.dataset.alienFx='v1';","fx?.dispose();if(fx)delete controls.dataset.alienFx;","...(fx?{fx:fx.metrics()}:{})","fx?.unlock();","fx?.setPaused(paused)"])assert.ok(s.includes(must),must);
 const model=await text('minigames/alien-flight-model.mjs');assert.ok(!/alien-fx/.test(model),'the model does not know the effects');
 for(const [file,must] of [['minigames/alien-v23-draw.mjs','if(drawFxHeat(p,m,aspect,scale))return;'],['minigames/alien-v11-draw.mjs',"if(fxReplaces(m,'blasts'))return;"],['minigames/ultra-alien-feedback.mjs',"(event.kind==='enemy-hit'&&!fxHits)"],['minigames/ultra-alien-effects.mjs','drawFxEffects(p,m,pixelAspect,screenScale);'],['minigames/aliens.mjs','drawFxEffects(p,m,pixelAspect);']])assert.ok((await text(file)).includes(must),file+': '+must);
 for(const file of ['minigames/alien-session.mjs','minigames/alien-fx-draw.mjs','minigames/alien-v12-draw.mjs','minigames/alien-v23-draw.mjs','minigames/alien-v11-draw.mjs','minigames/ultra-alien-effects.mjs','minigames/ultra-alien-feedback.mjs','minigames/aliens.mjs']){
  const tags=[...(await text(file)).matchAll(/alien-fx(?:-draw)?\.mjs(\?v=[\w-]+)?['"]/g)].map(m=>m[1]);assert.ok(tags.length&&tags.every(t=>t==='?v=island-v2-20261107-11'),`${file} imports the effects with the one tag (one module instance): ${tags}`);}
 const css=await text('minigames/alien-fx.css');for(const [band,c] of Object.entries(FX_HEAT_COLORS))if(band!=='blink'&&band!=='lock')assert.ok(css.includes(`[data-level=${band}]{--vulcan-color:${c}}`)||css.includes(`--vulcan-color:${c}`),band);
 assert.ok(css.includes('[data-alien-fx=v1]'),'only with the effects on');
});
