// v22 racing assets: four Codex packages (crash FX, broadcast, league, audio v3) wired behind their own URL flags.
// Each flag returns the previous behaviour exactly; the files exist in assets/ (byte-identical to design/); the offline list carries them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from '../workout/island/vendor/three.module.js';
import {GLTFLoader} from '../workout/island/vendor/GLTFLoader.js';
import {createTrack} from '../workout/island/minigames/racing-tracks.mjs';
import {createRacingEffects} from '../workout/island/minigames/racing-effects.mjs';
import {crashAssetsEnabled,CRASH_FILES,FRAGMENTS} from '../workout/island/minigames/racing-crash-assets.mjs';
import {bake} from '../workout/island/minigames/racing-env-v2.mjs';
import {broadcastArtEnabled,ART_FILES,CREST_IDS,LAMPS,crestUrl,litCount,loadGantry,buildGantry} from '../workout/island/minigames/racing-broadcast-art.mjs';
import {leagueArtEnabled,LEAGUE_ART_FILES,TEAM_CREST,MEDAL,leagueArtUrl} from '../workout/island/ui/racing-league-art.mjs';
import {createRacingSamples,audioV3Enabled,shiftBeepEnabled,V3_SHOTS,V3_LOOPS} from '../workout/island/minigames/racing-samples.mjs';
import {GRID_DRIVERS,TEAMS} from '../workout/island/minigames/racing-league-core.mjs';
import {startLights} from '../workout/island/minigames/racing-broadcast.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=file=>readFile(path.join(island,file));
const exists=async file=>{try{return (await stat(path.join(island,file))).size>0;}catch{return false;}};
const manifest=JSON.parse(await read('offline-manifest.json'));

// ---------- files ----------
const PACKS={
 'racing-crash-fx-v1':{design:'design/racing-crash-fx',files:[...CRASH_FILES,'LICENSE.txt']},
 'racing-broadcast-v1':{design:'design/racing-broadcast',map:f=>f==='LICENSES.md'?f:f.startsWith('teams/')?f:'assets/'+f,files:ART_FILES},
 'racing-league-v1':{design:'design/racing-league',files:LEAGUE_ART_FILES},
 'racing-audio-v3':{design:'design/racing-audio-v3',files:[...Object.keys(V3_SHOTS),...Object.keys(V3_LOOPS)].flatMap(id=>[id+'.ogg',id+'.mp3']).concat('LICENSE.md')}
};
for(const [dir,pack] of Object.entries(PACKS))test(`${dir}: every runtime file exists in assets/ and is byte-identical to the Codex original in design/`,async()=>{
 assert.ok(pack.files.length>=5);
 for(const file of pack.files){
  assert.ok(await exists(`assets/${dir}/${file}`),`assets/${dir}/${file}`);
  const original=`${pack.design}/${pack.map?pack.map(file):file}`;
  assert.ok((await read(`assets/${dir}/${file}`)).equals(await read(original)),`${file} differs from ${original}`);
 }
});
test('the CC0 licence text travels with each package',async()=>{
 for(const [dir,file] of [['racing-crash-fx-v1','LICENSE.txt'],['racing-broadcast-v1','LICENSES.md'],['racing-league-v1','LICENSES.md'],['racing-audio-v3','LICENSE.md']])assert.match((await read(`assets/${dir}/${file}`)).toString(),/CC0/);
});
test('no Arabic letters in any text or code this change added',async()=>{
 for(const file of ['minigames/racing-crash-assets.mjs','minigames/racing-broadcast-art.mjs','ui/racing-league-art.mjs','minigames/racing-effects.mjs','minigames/racing-samples.mjs','ui/racing-league.mjs','minigames/racing-broadcast.mjs'])assert.ok(!/[؀-ۿ]/.test((await read(file)).toString()),file);
});

// ---------- flags ----------
test('every flag is on by default and its =0 value turns the whole package off',()=>{
 assert.equal(crashAssetsEnabled('?x=1'),true);assert.equal(crashAssetsEnabled('?racingCrashAssets=0'),false);
 assert.equal(broadcastArtEnabled('?x=1'),true);assert.equal(broadcastArtEnabled('?racingBroadcastArt=0'),false);assert.equal(broadcastArtEnabled('?racingBroadcast=0'),false,'the art belongs to the broadcast HUD');
 assert.equal(leagueArtEnabled('?x=1'),true);assert.equal(leagueArtEnabled('?racingLeagueArt=0'),false);
 assert.equal(audioV3Enabled('?x=1'),true);assert.equal(audioV3Enabled('?racingAudioV3=0'),false);
 assert.equal(shiftBeepEnabled('?x=1'),false,'the shift-light beep is off unless asked for');assert.equal(shiftBeepEnabled('?racingShiftBeep=1'),true);
});

// ---------- 1. crash FX ----------
function effectsFixture(){
 const resources=new Set(),scene=new T.Scene(),track=createTrack(1),camera=new T.PerspectiveCamera();camera.position.set(0,3,-8);
 const context={createRadialGradient(){return {addColorStop(){}};},fillRect(){}};
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement(){return {width:0,height:0,getContext(){return context;}};}}});
 let effects;try{effects=createRacingEffects({T,scene,track,keep:v=>(resources.add(v),v),carColors:['#ff0000','#00ff00']});}finally{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
 const p=track.sample(60),car={id:'player',x:p.x,y:p.y,z:p.z,heading:p.heading,speed:40,lateral:2,crashT:.8,crashDur:.8,crashAir:1,drifting:false,offroad:false};
 const state={time:0,events:[],player:car,cars:[car]};
 const root=scene.getObjectByName('racing-effects');
 return {effects,scene,root,state,camera,resources,car,step(dt=1/30,q=0){state.time+=dt;effects.update(state,dt,camera,q);}};
}
async function realPack(){
 const parse=async f=>{const buffer=await read('assets/racing-crash-fx-v1/'+f);return new Promise((res,rej)=>new GLTFLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'',res,rej));};
 const frag=await parse('body-fragments.glb'),find=name=>{let m=null;frag.scene.traverse(o=>{if(o.isMesh&&o.name===name)m=o;});return m;};
 return {sparksMap:new T.Texture(),smokeMap:new T.Texture(),fragments:FRAGMENTS.map(n=>find(n).geometry),tyreGeometry:new T.CylinderGeometry(.35,.35,.38,12).rotateZ(Math.PI/2),tyreMaterial:new T.MeshStandardMaterial({color:'#222'})};
}
test('crash FX: the six named fragments are in the real GLB, one mesh each with triangles inside the limit',async()=>{
 const pack=await realPack();assert.equal(pack.fragments.length,6);
 for(const g of pack.fragments)assert.ok(g.index.count/3<=60&&g.index.count>0);
});
test('crash FX: without the pack nothing changes (five meshes, old pools, crashAssets false); a bad pack is refused',()=>{
 const f=effectsFixture();
 try{
  assert.equal(f.root.children.length,5);assert.equal(f.effects.metrics().crashAssets,false);
  assert.equal(f.effects.setCrashAssets(null),false);assert.equal(f.effects.setCrashAssets({sparksMap:new T.Texture(),smokeMap:new T.Texture(),fragments:[],tyreGeometry:null}),false);
  assert.equal(f.root.children.length,5,'a refused pack adds nothing');
  f.state.events=[{type:'crash',car:'player'}];f.step();f.state.events=[];for(let i=0;i<10;i++)f.step();
  const m=f.effects.metrics();assert.ok(m.debris>0||m.tyres>0,'the old boxes still fly: '+JSON.stringify(m));
 }finally{f.effects.dispose();}
});
test('crash FX: with the pack, sparks/dust/fragments/tyre use the new meshes, the old pools stay empty, the show ends and nothing allocates per frame',async()=>{
 const f=effectsFixture(),pack=await realPack();
 try{
  assert.equal(f.effects.setCrashAssets(pack),true);assert.equal(f.effects.setCrashAssets(pack),false,'only once');
  assert.equal(f.effects.metrics().crashAssets,true);
  const kids=f.root.children,instanced=kids.filter(m=>m.isInstancedMesh);assert.equal(instanced.length,5+2+6+1,'old five + sparks, dust, six fragments, tyre');
  f.state.events=[{type:'crash',car:'player'}];f.step();f.state.events=[];
  const old={debris:kids[3],tyres:kids[4]};
  let fragmentInstances=0,peakSparks=0,peakDust=0,tyreCount=0;
  for(let i=0;i<24;i++){f.step();fragmentInstances=Math.max(fragmentInstances,kids.slice(7,13).reduce((n,m)=>n+m.count,0));peakSparks=Math.max(peakSparks,kids[5].count);peakDust=Math.max(peakDust,kids[6].count);tyreCount=Math.max(tyreCount,kids[13].count);
   assert.equal(old.debris.count,0);assert.equal(old.tyres.count,0);assert.equal(kids[1].count>=0,true);}
  assert.ok(fragmentInstances>=4&&fragmentInstances<=5,'five fragments per crash: '+fragmentInstances);assert.ok(peakSparks>0&&peakDust>0&&tyreCount===1,`sparks ${peakSparks} dust ${peakDust} tyre ${tyreCount}`);
  const sparkFrames=kids[5].geometry.getAttribute('aFrame');assert.ok(sparkFrames.array.every(v=>[0,.25,.5,.75].includes(v)),'atlas offsets are quarters');
  f.car.crashT=0;   // the car has landed: no more trail
  const matrices=kids.filter(m=>m.isInstancedMesh).map(m=>m.instanceMatrix.array);
  for(let i=0;i<120;i++)f.step();
  assert.deepEqual(kids.filter(m=>m.isInstancedMesh).map(m=>m.instanceMatrix.array),matrices,'the same typed arrays are reused');
  assert.equal(kids.slice(5).reduce((n,m)=>n+(m.isInstancedMesh?m.count:0),0),0,'the show is over: no new mesh draws any instance');
 }finally{f.effects.dispose();}
});
test('crash FX: quality 2 caps the new dust like the old smoke, and a pause frame (dt 0) freezes it',async()=>{
 const f=effectsFixture(),pack=await realPack();
 try{
  f.effects.setCrashAssets(pack);f.state.events=[{type:'crash',car:'player'}];f.step(1/30,2);f.state.events=[];
  const dust=f.root.children[6];assert.ok(dust.count<=8);const before=Array.from(dust.instanceMatrix.array);f.effects.update(f.state,0,f.camera,2);assert.deepEqual(Array.from(dust.instanceMatrix.array),before);
 }finally{f.effects.dispose();}
});

// ---------- 2. broadcast ----------
test('broadcast art: twelve crests map to the twelve grid drivers by race number; an unknown number has no crest',()=>{
 assert.equal(CREST_IDS.length,12);assert.equal(GRID_DRIVERS.length,12);
 GRID_DRIVERS.forEach((d,i)=>assert.ok(crestUrl(d.number).endsWith(`/assets/racing-broadcast-v1/teams/${CREST_IDS[i]}.svg`),d.name));
 assert.equal(crestUrl(99),'');assert.equal(new Set(GRID_DRIVERS.map(d=>d.number)).size,12,'numbers are unique, so they are a safe key');
});
test('broadcast art: lamps follow the start lights (0 to 5 lit, none once the race runs or when out)',()=>{
 const counting=countdown=>litCount(startLights({phase:'countdown',countdown,time:0}));
 assert.deepEqual([3,2.4,1.9,1.4,.9,.4].map(counting),[0,1,2,3,4,5]);
 assert.equal(litCount(startLights({phase:'racing',countdown:0,time:.3})),0);assert.equal(litCount(null),0);
});
test('broadcast art: the real gantry has lamp1..lamp5; buildGantry bakes the rest, lights lamps one by one and is dark by default',async()=>{
 const buffer=await read('assets/racing-broadcast-v1/start-gantry.glb'),scene=new T.Scene();
 const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'',res,rej));
 const kept=new Set(),g=buildGantry({T,scene,track:{length:1000,width:14},keep:v=>(kept.add(v),v),f1:{at:()=>({x:5,y:1,z:2,heading:.5})},model:gltf.scene,bake});
 assert.equal(g.lamps.size,5);assert.deepEqual([...g.lamps.keys()].sort(),[...LAMPS]);
 assert.ok(g.root.children.length<=9,'merged to at most one mesh per lamp plus the plain parts: '+g.root.children.length);
 assert.ok([...g.lamps.values()].every(m=>m.emissiveIntensity===0),'dark until the lights start');
 g.light(3);assert.deepEqual(LAMPS.map(n=>g.lamps.get(n).emissiveIntensity),[1,1,1,0,0]);
 g.light(5,true);assert.ok(LAMPS.every(n=>g.lamps.get(n).emissiveIntensity>1));g.light(0);assert.ok(LAMPS.every(n=>g.lamps.get(n).emissiveIntensity===0));
 assert.equal(g.root.position.x,5);assert.ok(Math.abs(g.root.rotation.y-(.5+Math.PI))<1e-9,'faces the grid like the env-v2 gantry');
 g.dispose();assert.equal(g.root.parent,null);
});
test('broadcast art: the env-v2 gantry is skipped only when asked (default keeps it)',async()=>{
 const src=(await read('minigames/racing-env-v2.mjs')).toString();
 assert.match(src,/skip=\[\]/);assert.match(src,/if\(!skip\.includes\('start-gantry'\)\)put\('start-gantry'/);
 const view=(await read('minigames/racing-view.mjs')).toString();
 assert.match(view,/skip:gantryModel\?\['start-gantry'\]:\[\]/);assert.match(view,/broadcastArtEnabled\(\)\)gantryModel=/);
});
test('broadcast art: with the flag off the broadcast keeps no art (lamps() is 0, no art class on the tower) and loadGantry rejects a model without lamps',async()=>{
 const src=(await read('minigames/racing-broadcast.mjs')).toString();
 assert.match(src,/const gantryLamps=state=>art\?litCount\(startLights\(state\)\):0;/);assert.match(src,/chip\(row,true,art\)/);assert.match(src,/if\(art\)applyPanelArt\(root\)/);
 const tower=(await read('minigames/racing-tower.mjs')).toString();assert.match(tower,/if\(art\)root\.classList\.add\('rb-art'\)/);assert.match(tower,/\}else r\.bar\.style\.background=car\.color;/);
 class FakeLoader{loadAsync(){return Promise.resolve({scene:new T.Scene()});}}
 await assert.rejects(loadGantry({GLTFLoader:FakeLoader}),/lacks lamp1/);
});

// ---------- 3. league ----------
test('league art: every TEAMS id has a crest file, trophies, medals and both backgrounds exist; unknown ids have none',async()=>{
 assert.deepEqual(Object.keys(TEAM_CREST).sort(),TEAMS.map(t=>t.id).sort());
 for(const file of LEAGUE_ART_FILES)assert.ok(await exists('assets/racing-league-v1/'+file),file);
 assert.deepEqual(Object.keys(MEDAL),['1','2','3']);assert.match(leagueArtUrl(MEDAL[1]),/medals\/gold\.svg$/);
 const src=(await read('ui/racing-league.mjs')).toString();
 for(const guard of ["leagueArtEnabled()?crestImg(t.id):null","art=leagueArtEnabled()","if(leagueArtEnabled())markArt(root)","leagueArtEnabled()?medalImg(r.place):null"])assert.ok(src.includes(guard),guard);
});
// ---------- 4. audio v3 ----------
function audioContext(){
 const param=()=>({value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(){},linearRampToValueAtTime(){}});
 const node=()=>({gain:param(),playbackRate:param(),frequency:param(),connect(){},disconnect(){},start(){this.started=true;},stop(){},loop:false});
 const sources=[],gains=[];
 return {currentTime:1,destination:{},sources,gains,createGain(){const n=node();gains.push(n);return n;},createBufferSource(){const n=node();sources.push(n);return n;},decodeAudioData:async()=>({duration:1})};
}
const recorder=(fail=null)=>{const urls=[];return {urls,fetch:async url=>{urls.push(url);return fail&&fail(url)?{ok:false}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};}};};
test('audio v3: off by default in the layer; the v2 loops and 15 files stay exactly as before',async()=>{
 const c=audioContext(),r=recorder(),layer=createRacingSamples({context:c,base:'http://x/assets/racing-audio-v2/',fetchFn:r.fetch,format:'ogg'});
 await layer.load();assert.equal(layer.v3Ready,false);assert.equal(r.urls.length,15);assert.ok(r.urls.every(u=>u.includes('racing-audio-v2')));assert.equal(c.sources.filter(s=>s.loop).length,2,'tyre squeal and wind (the engine loops stay off by default)');
 layer.event('bump');layer.event('crash');layer.shiftBeep();assert.equal(c.sources.filter(s=>!s.loop).length,0,'no v3 sound without v3');layer.dispose();
});
test('audio v3: loads six files from racing-audio-v3 (the beep only on request), adds one loop at 0.05-1.95 s and plays events through the gearbox gate',async()=>{
 const c=audioContext(),r=recorder(),layer=createRacingSamples({context:c,base:'http://x/assets/racing-audio-v2/',fetchFn:r.fetch,format:'mp3',v3:true});
 await layer.load();assert.equal(layer.v3Ready,true);
 const v3=r.urls.filter(u=>u.includes('racing-audio-v3'));assert.deepEqual(v3.map(u=>u.split('/').pop()).sort(),['brake-squeal-loop.mp3','car-bump.mp3','crash-roll.mp3','engine-restart.mp3','wall-scrape-long.mp3','wall-scrape-short.mp3']);
 const loops=c.sources.filter(s=>s.loop);assert.equal(loops.length,3);const squeal=loops.at(-1);assert.equal(squeal.loopStart,.05);assert.equal(squeal.loopEnd,1.95);
 const shots=()=>c.sources.filter(s=>!s.loop).length;
 layer.event('bump');assert.equal(shots(),1);layer.event('wall',.9);assert.equal(shots(),1,'0.45 s gearbox gate: a second sound in the window is dropped');
 c.currentTime=2;layer.event('wall',.9);assert.equal(shots(),2);c.currentTime=3;layer.event('wall',.2);assert.equal(shots(),3);c.currentTime=4;layer.event('crash');c.currentTime=5;layer.event('crashRecover');assert.equal(shots(),5);
 c.currentTime=6;layer.shiftBeep();assert.equal(shots(),5,'beep not requested');layer.dispose();
});
test('audio v3: brake squeal rises under hard braking at speed and is silent when drifting, off the road or slow; gains stay at the package values',async()=>{
 const c=audioContext(),layer=createRacingSamples({context:c,base:'http://x/assets/racing-audio-v2/',fetchFn:recorder().fetch,format:'ogg',v3:true});await layer.load();
 const gain=c.gains.at(-1);   // the squeal loop's gain node is the last one created
 const level=opts=>{layer.update({rpm:.5,...opts});return gain.gain.value;};
 assert.equal(level({speed:40,braking:true}),V3_LOOPS['brake-squeal-loop'].gain);assert.equal(level({speed:40,braking:true,drifting:true}),0);assert.equal(level({speed:40,braking:true,offroad:true}),0);assert.equal(level({speed:10,braking:true}),0);assert.equal(level({speed:40,braking:false}),0);
 assert.ok(Object.values(V3_SHOTS).every(g=>g<=.035)&&V3_LOOPS['brake-squeal-loop'].gain<=.025,'conservative gains');layer.dispose();
});
test('audio v3: any v3 failure leaves the v2 layer ready and v3 off',async()=>{
 const c=audioContext(),r=recorder(u=>u.includes('crash-roll')),layer=createRacingSamples({context:c,base:'http://x/assets/racing-audio-v2/',fetchFn:r.fetch,format:'ogg',v3:true});
 await layer.load();assert.equal(layer.ready,true);assert.equal(layer.v3Ready,false);assert.equal(c.sources.filter(s=>s.loop).length,2);layer.event('crash');layer.dispose();
});
test('audio v3: the engine passes the flag and the base, and calls the layer for the four events (the procedural cue always plays too)',async()=>{
 const src=(await read('minigames/racing-audio.mjs')).toString();
 assert.match(src,/base3:new URL\('\.\.\/assets\/racing-audio-v3\/',import\.meta\.url\),v3:m\.audioV3Enabled\(\),beep:m\.shiftBeepEnabled\(\)/);
 assert.match(src,/if\(samples\?\.ready\)samples\.event\?\.\(name,clamp\(number\(details\?\.intensity,1\),0,1\)\);/);assert.match(src,/\n  cue\(name,clamp\(number\(details\?\.intensity,1\),0,1\)\);/);
});

// ---------- offline gate ----------
test('offline list: every new asset is in the racing pack and every new module is in the shell list',async()=>{
 const racing=new Set(manifest.games.racing);
 const wanted=[...CRASH_FILES.map(f=>'assets/racing-crash-fx-v1/'+f),...ART_FILES.filter(f=>/\.(glb|webp|svg)$/.test(f)).map(f=>'assets/racing-broadcast-v1/'+f),
  ...LEAGUE_ART_FILES.filter(f=>/\.(webp|svg)$/.test(f)).map(f=>'assets/racing-league-v1/'+f),
  ...[...Object.keys(V3_SHOTS),...Object.keys(V3_LOOPS)].flatMap(id=>[`assets/racing-audio-v3/${id}.ogg`,`assets/racing-audio-v3/${id}.mp3`])];
 assert.ok(wanted.length>=45);for(const file of wanted)assert.ok(racing.has(file),file+' missing from the offline racing list');
 for(const mod of ['minigames/racing-crash-assets.mjs','minigames/racing-broadcast-art.mjs','ui/racing-league-art.mjs'])assert.ok(manifest.shell.includes(mod),mod+' missing from the shell list');
 assert.deepEqual([...racing],[...racing].sort(),'the list stays sorted');
});
test('the new modules import with the current version tag',async()=>{
 for(const file of ['minigames/racing-crash-assets.mjs','minigames/racing-broadcast-art.mjs','ui/racing-league-art.mjs']){
  const tags=[...(await read(file)).toString().matchAll(/\?v=([\w-]+)/g)].map(m=>m[1]);assert.ok(tags.every(t=>t==='island-v2-20261107-10'),file+' '+tags);
 }
});
