import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TRACKS,createTrack} from '../minigames/racing-tracks.mjs';
import {OFFLINE_GAMES,isManagedPath,pathsFor} from '../ui/offline.mjs';
import {V7_SLOT_CARS,V7_SLOT_COLORS,V7_FILES,V7_REQUIRED,v7Enabled,v7FileList,carLodsFor,carFile,lodDistances,pickLod,crowdSites,CROWD_CAP,CROWD_RADIUS} from '../minigames/racing-v7.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>readFile(path.join(island,file),'utf8');
const config=JSON.parse(await read('data/config.json')).minigames.islandRacing;
const manifest=JSON.parse(await read('offline-manifest.json'));
const params=q=>new URLSearchParams(q);

async function walk(dir){
 const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(f));else out.push(f);}return out;
}

test('v7 switch: the config enables it, ?racingV7=0 kills it, ?racingV7=1 forces it, no config means off',()=>{
 assert.deepEqual(config.v7,{enabled:true,base:'assets/racing-v7/'});
 assert.equal(v7Enabled(config.v7,params('')),true);
 assert.equal(v7Enabled(config.v7,params('racingV7=0')),false,'the query kill flag wins over the config');
 assert.equal(v7Enabled({...config.v7,enabled:false},params('')),false,'config switch off');
 assert.equal(v7Enabled({...config.v7,enabled:false},params('racingV7=1')),true,'forced on for a comparison capture');
 assert.equal(v7Enabled(null,params('')),false);assert.equal(v7Enabled(undefined,undefined),false);
 assert.equal(v7Enabled(config.v7,params('racingV7=0&dev=1')),false);
});

test('v7 bundle: exactly the files the game loads are shipped, byte for byte from the design package, none of them outside assets/racing-v7',async()=>{
 const base=path.join(island,'assets/racing-v7'),all=(await walk(base)).map(f=>path.relative(base,f).split(path.sep).join('/')).sort(),shipped=all.filter(f=>f!=='LICENSE.md');
 assert.ok(all.includes('LICENSE.md'),'the CC-BY attribution travels with the files');
 assert.deepEqual(shipped,[...v7FileList()].sort(),'nothing unused is copied and nothing loaded is missing');
 const design=JSON.parse(await read('design/racing-v7/manifest.json')),sha=new Map(design.runtimeFiles.map(f=>[f.file,f.sha256]));
 const designPath=file=>file.startsWith('textures/')?file:file.startsWith('props/')?'assets/tracks/'+file.slice(6):'assets/'+file;
 for(const file of shipped){
  const digest=createHash('sha256').update(await readFile(path.join(base,file))).digest('hex');
  assert.equal(digest,sha.get(designPath(file)),file+' is the package file, unchanged');
 }
 assert.ok(!shipped.some(f=>/\.(html|md|json|mjs)$/.test(f)),'no viewer, notes or track data');
});

test('v7 bundle: names, per-slot LOD files and weight',async()=>{
 assert.deepEqual(V7_SLOT_CARS,['apex','velour','prism','solis','vector']);assert.equal(V7_SLOT_COLORS.length,5);
 assert.deepEqual(carLodsFor(0),[0,1,2],'the player car loads all three LODs');
 for(let slot=1;slot<5;slot++)assert.deepEqual(carLodsFor(slot),[1,2],'opponents never download lod0');
 const sizes={};let total=0;
 for(const file of v7FileList()){const size=(await stat(path.join(island,'assets/racing-v7',file))).size;sizes[file]=size;total+=size;}
 for(const [file,size] of Object.entries(sizes))if(file.endsWith('.glb'))assert.ok(size<100000,file+' is a small GLB: '+size);
 assert.ok(total<1600000,'the whole v7 download stays under 1.6 MB: '+total);
 assert.equal(v7FileList().length,17);
 assert.deepEqual(Object.keys(V7_REQUIRED).sort(),['car','props','spectator']);
 assert.ok(V7_REQUIRED.car.includes('WheelFrontL')&&V7_REQUIRED.props.includes('Grandstand'));
 assert.equal(V7_FILES.spectator,'crowd/spectator.glb');assert.equal(carFile('apex',2),'cars/apex-lod2.glb');
});

test('v7 never reads design/: the loader and the view take everything from assets/racing-v7',async()=>{
 for(const file of ['minigames/racing-v7.mjs','minigames/racing-v7-assets.mjs','minigames/racing-view.mjs','minigames/racing-session.mjs','minigames/racing-effects.mjs']){
  const code=await read(file);assert.ok(!/['"`][^'"`\n]*design\/[^'"`\n]*['"`]/.test(code),file+' has a string that points into design/');
 }
 assert.ok(!config.v7.base.includes('design'));
});

test('v7 fallback is wired: the previous coupe, trees, canvas asphalt and procedural smoke stay in the code as the silent fallback',async()=>{
 const view=await read('minigames/racing-view.mjs');
 for(const must of ["sport-coupe.glb","sport-coupe-low.glb","palm-tree-512.glb","tree-a-512.glb","canvasAsphalt(rngFor(","failures.push('v7')","v7Enabled(v7Config"])assert.ok(view.includes(must),must);
 assert.ok(view.includes("await import('./racing-v7-assets.mjs')"),'the v7 code is loaded lazily, only when it is on');
 // all or nothing: the scene is touched only after the pack loaded and every part was built
 const attach=view.indexOf('scene.add(v7.parts.standGroup'),build=view.indexOf('assets.buildRacingV7('),load=view.indexOf('assets.loadRacingV7Pack(');
 assert.ok(load>0&&build>load&&attach>build,'load, then build, then attach');
 const assets=await read('minigames/racing-v7-assets.mjs');
 assert.ok(assets.includes('disposePack(pack);throw error'),'a failed load frees what it created');
});

test('v7 does not touch the game: physics and track data are not imported by the v7 modules, the controls file is the unchanged joystick-left layout',async()=>{
 const assets=await read('minigames/racing-v7-assets.mjs'),pure=await read('minigames/racing-v7.mjs');
 for(const code of [assets,pure])assert.ok(!/racing-physics|racing-controls|racing-session/.test(code));
 const controls=await read('minigames/racing-controls.mjs');
 assert.ok(controls.includes("steering=node('div','racing-steering')")&&controls.includes("actions=node('div','racing-actions')"));
});

test('LOD choice by distance and quality tier: opponents use lower LODs, hysteresis stops flicker',()=>{
 for(const quality of [0,1,2]){
  const opp=lodDistances('opponent',quality);assert.equal(opp[0],0,'opponents never use lod0 (quality '+quality+')');
  for(const d of [0,1,5,12,29,40,80,500])assert.ok(pickLod(d,opp)>=1);
 }
 assert.deepEqual(lodDistances('player',0),[17,46]);
 assert.equal(pickLod(5,lodDistances('player',0)),0);assert.equal(pickLod(30,lodDistances('player',0)),1);assert.equal(pickLod(120,lodDistances('player',0)),2);
 assert.equal(pickLod(5,lodDistances('player',2)),1,'the lowest tier never shows lod0 for the player');
 for(const d of [0,10,100])assert.equal(pickLod(d,lodDistances('opponent',2)),2,'lowest tier: opponents are lod2');
 // lower tiers never pick a higher-detail LOD than quality 0 at the same distance
 for(const role of ['player','opponent'])for(let d=0;d<200;d+=3)for(const q of [1,2])assert.ok(pickLod(d,lodDistances(role,q))>=pickLod(d,lodDistances(role,0)),`${role} q${q} d${d}`);
 // hysteresis: a car hovering at the lod0/lod1 border does not change level for +-12%
 const b=lodDistances('player',0);let level=pickLod(16,b);assert.equal(level,0);
 for(const d of [17.5,18.5,16,17,18,19,16.5])level=pickLod(d,b,level);
 assert.equal(level,0,'inside the 12% band the level holds');
 assert.equal(pickLod(20,b,0),1,'beyond the band it steps up');assert.equal(pickLod(16,b,1),1,'and holds on the way back');assert.equal(pickLod(14,b,1),0,'until clearly inside');
 const flips=[];let cur=-1;for(let i=0;i<400;i++){const d=17+Math.sin(i/7)*1.6,next=pickLod(d,b,cur);if(next!==cur)flips.push(i);cur=next;}
 assert.ok(flips.length<=1,'a border oscillation flips at most once: '+flips.length);
});

test('crowd: spectators stand clear of the road on every track and stage, deterministic, bounded',()=>{
 let total=0;
 for(const t of TRACKS){
  const track=createTrack(t.id),ground=()=>0,a=crowdSites(track,ground,7),b=crowdSites(track,ground,7),c=crowdSites(track,ground,8);
  assert.deepEqual(a,b,t.id+' is deterministic');assert.notDeepEqual(a,c,'another seed moves them');
  assert.ok(a.length>60&&a.length<=98,t.id+' count '+a.length);total+=a.length;
  for(const s of a){
   assert.ok(track.project(s.x,s.z).distance>=track.width/2+7,t.id+' keeps clear of the road and shoulder');
   assert.ok(Number.isFinite(s.x+s.y+s.z+s.yaw+s.scale)&&[0,1,2].includes(s.variant)&&s.scale>.9&&s.scale<1.06);
  }
 }
 assert.ok(total>0);
 for(const q of [0,1,2]){assert.ok(CROWD_CAP[q]>=0&&CROWD_RADIUS[q]>=0);}
 assert.equal(CROWD_CAP[2],0,'the lowest tier draws no crowd');assert.ok(CROWD_CAP[0]>CROWD_CAP[1]);
});

const AUDIO_FILES=["engine-high.mp3", "engine-high.ogg", "engine-idle.mp3", "engine-idle.ogg", "engine-low.mp3", "engine-low.ogg", "engine-mid.mp3", "engine-mid.ogg", "engine-redline.mp3", "engine-redline.ogg", "exhaust-pop-1.mp3", "exhaust-pop-1.ogg", "exhaust-pop-2.mp3", "exhaust-pop-2.ogg", "exhaust-pop-3.mp3", "exhaust-pop-3.ogg", "kerb-rumble.mp3", "kerb-rumble.ogg", "pass-whoosh.mp3", "pass-whoosh.ogg", "shift-down.mp3", "shift-down.ogg", "shift-up.mp3", "shift-up.ogg", "turbo-blowoff.mp3", "turbo-blowoff.ogg", "tyre-squeal.mp3", "tyre-squeal.ogg", "wind-speed.mp3", "wind-speed.ogg"].map(f=>'assets/racing-audio-v2/'+f);
test('offline: racing is a game group with exactly the v7 files and the formula car, all cacheable, and the shell lists the new modules',async()=>{
 assert.equal(OFFLINE_GAMES.racing,'מרוצים');
 assert.deepEqual(Object.keys(manifest.games).sort(),Object.keys(OFFLINE_GAMES).sort());
 assert.deepEqual([...manifest.games.racing].sort(),[...v7FileList().map(f=>'assets/racing-v7/'+f),'assets/racing-formula/formula.glb',...AUDIO_FILES].sort());
 for(const p of manifest.games.racing)assert.ok(isManagedPath('/workout/island/'+p),p);
 assert.ok(manifest.shell.includes('minigames/racing-v7.mjs')&&manifest.shell.includes('minigames/racing-v7-assets.mjs'));
 assert.ok(pathsFor(manifest,['racing']).length===48);
 for(const other of ['soccer','hoops','alpine'])for(const p of manifest.games[other])assert.ok(!p.startsWith('assets/racing-v7/'),'only racing owns the v7 files');
});

test('credit: the CC-BY car attribution page names the v7 models, their author, licence and changes',async()=>{
 const credits=await read('assets/racing/credits.html'),license=await read('assets/racing-v7/LICENSE.md');
 for(const text of [credits,license]){assert.ok(/Eric Chadwick/.test(text)&&/Darmstadt Graphics Group/.test(text)&&/CC-BY|Creative Commons Attribution 4\.0/.test(text));}
 assert.ok(/racing-v7|חמישה דגמי|apex/i.test(credits));
});
