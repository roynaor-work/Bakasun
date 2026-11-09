import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../workout/island/vendor/three.module.js';
import {V7_FILES,V7_REQUIRED,REAL,v7Enabled,surfaceFor,courtWarpZ,sceneWarpZ,CROWD_LEVELS,crowdKeeps,crowdStartLevel,cheerRole,createCrowdGovernor} from '../workout/island/minigames/tennis-v7.mjs';
import {createTennisV7,warpGeometry,trimAlleys,connectedPieces,warpPieces} from '../workout/island/minigames/tennis-v7-venue.mjs';
import {RUNTIME_GLBS,compactLayout} from '../workout/island/tools/tennis-v7-pack.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=async file=>readFile(path.join(island,file),'utf8');
const config=JSON.parse(await read('data/config.json')),tennis=config.minigames.tennis,env=tennis.environment;
const offline=JSON.parse(await read('offline-manifest.json'));
const q=s=>new URLSearchParams(s);
const COURT={halfLength:tennis.court.halfLength,serviceLength:tennis.court.serviceLength};
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');

test('v7 switches: config default on, ?tennisV7=0 is the kill switch, ?tennisV7=1 forces it, no v7 block means no v7',()=>{
 assert.equal(v7Enabled(env,0,q('')),true);assert.equal(v7Enabled(env,2,q('')),true,'v7 runs at every tier: the crowd level, not the venue, is what the tier thins');
 assert.equal(v7Enabled(env,0,q('tennisV7=0')),false);assert.equal(v7Enabled(env,0,q('tennisV7=1')),true);
 const off={...env,v7:{...env.v7,enabled:false}};assert.equal(v7Enabled(off,0,q('')),false,'config switch');assert.equal(v7Enabled(off,0,q('tennisV7=1')),true,'query forces it even when the switch is off');
 assert.equal(v7Enabled({models:[]},0,q('')),false);assert.equal(v7Enabled(undefined,0,q('')),false);assert.equal(v7Enabled(env,0,undefined),true);
 assert.equal(v7Enabled({v7:{minQuality:1}},0,q('')),false,'minQuality is honoured');assert.equal(v7Enabled({v7:{minQuality:1}},1,q('')),true);
});

test('surface per stage: ten stages each in the configured order, only that one is requested, ?tennisSurface pins it',()=>{
 assert.deepEqual(env.v7.surfaces,['clay','hard','grass']);
 const pick=stage=>surfaceFor(env.v7,stage,q(''));
 assert.deepEqual([1,10,11,20,21,30,31,999].map(pick),['clay','clay','hard','hard','grass','grass','grass','grass']);
 assert.equal(pick(0),'clay');assert.equal(pick(NaN),'clay');assert.equal(pick('3'),'clay');
 assert.equal(surfaceFor(env.v7,1,q('tennisSurface=grass')),'grass');assert.equal(surfaceFor(env.v7,1,q('tennisSurface=ice')),'clay','an unknown surface is ignored');
 assert.equal(surfaceFor(undefined,5,q('')),'clay');assert.equal(surfaceFor({surfaces:['nope']},5,q('')),'clay');
 assert.equal(tennis.levels.length,30,'three surfaces of ten stages cover the whole tour');
});

test('court map puts the package lines on the rules lines and keeps order; scenery map only moves stands in by the missing length',()=>{
 const f=z=>courtWarpZ(z,COURT),g=z=>sceneWarpZ(z,COURT);
 assert.equal(f(0),0);assert.ok(Math.abs(f(REAL.halfLength)-COURT.halfLength)<1e-9,'baseline');assert.ok(Math.abs(f(REAL.serviceLength)-COURT.serviceLength)<1e-9,'service line');
 assert.ok(Math.abs(f(-REAL.halfLength)+COURT.halfLength)<1e-9&&Math.abs(f(-REAL.serviceLength)+COURT.serviceLength)<1e-9,'symmetric');
 let last=-Infinity;for(let z=-30;z<=30;z+=.05){const v=f(z);assert.ok(v>=last-1e-9,'monotonic at '+z);last=v;}
 assert.ok(Math.abs(f(20.1)-(20.1-(REAL.halfLength-COURT.halfLength)))<1e-9,'a stand behind the baseline moves in by exactly the missing length');
 assert.ok(Math.abs(g(REAL.halfLength)-COURT.halfLength)<1e-9);assert.ok(Math.abs(g(REAL.halfLength+.001)-g(REAL.halfLength))<.01,'scenery map is continuous at the baseline');
 assert.equal(g(0),0);assert.ok(Math.abs(g(5)-5*COURT.halfLength/REAL.halfLength)<1e-9,'one uniform squeeze inside the baselines (no kink at the service line)');
 assert.ok(Math.abs(g(-20.1)+17.215)<1e-9);
 assert.equal(COURT.halfLength,9);assert.equal(COURT.serviceLength,4.5,'the numbers the maps are fed come from the game config');
});

test('crowd levels: all / cheap model / two thirds; start level per tier from config; ?tennisCrowdLevel pins it',()=>{
 const count=l=>{let n=0;for(let i=0;i<480;i++)if(crowdKeeps(l,i))n++;return n;};
 assert.equal(count(2),480);assert.equal(count(1),480);assert.equal(count(0),320,'the lowest level keeps two of every three');
 for(let s=0;s<100;s++){let n=0;for(let i=s;i<s+9;i++)if(crowdKeeps(0,i))n++;assert.equal(n,6,'the stands thin out evenly, no holes');}
 assert.deepEqual(CROWD_LEVELS.map(l=>l.detail),[false,false,true],'only the top level draws the 266-triangle model');
 assert.deepEqual(env.v7.crowdLevels,[2,1,-1]);
 assert.deepEqual([0,1,2].map(t=>crowdStartLevel(env.v7,t,q('')).level),[2,1,-1],'tier 2 (lowest) has no crowd, as the previous venue');
 assert.deepEqual(crowdStartLevel(env.v7,0,q('tennisCrowdLevel=0')),{level:0,pinned:true});assert.deepEqual(crowdStartLevel(env.v7,0,q('tennisCrowdLevel=9')),{level:2,pinned:true});assert.deepEqual(crowdStartLevel(env.v7,2,q('tennisCrowdLevel=x')),{level:-1,pinned:false});
 assert.deepEqual(crowdStartLevel(undefined,0,q('')),{level:2,pinned:false});
 const roles={always:0,burst:0,seated:0};for(let i=0;i<96;i++)roles[cheerRole(i)]++;assert.ok(roles.always>=8&&roles.burst>=20&&roles.seated>=50,JSON.stringify(roles));
});

test('governor: steps the crowd down after sustained slow frames, never up, ignores hitches, pinned never moves, goes before the view quality drop',()=>{
 const run=(g,ms,n)=>{const out=[];for(let i=0;i<n;i++){const r=g.observe(ms);if(r!=null)out.push(r);}return out;};
 let g=createCrowdGovernor({level:2});
 assert.deepEqual(run(g,16.7,600),[],'60 fps keeps the full crowd');assert.deepEqual(run(g,20,600),[],'50 fps keeps it too');
 g=createCrowdGovernor({level:2});assert.deepEqual(run(g,50,1000),[1,0],'20 fps steps 2 -> 1 -> 0 and stops (a cooldown between steps)');
 assert.deepEqual(run(g,8,3000),[],'a fast device later does not bring the crowd back (no flicker)');
 g=createCrowdGovernor({level:2});assert.deepEqual(run(g,400,500),[],'frames over 250 ms are tab switches or loading, not load');
 g=createCrowdGovernor({level:2});const first=run(g,50,60);assert.deepEqual(first,[1],'about 45 slow frames to the first step');assert.equal(run(g,50,60).length,0,'cooldown');
 g=createCrowdGovernor({level:1,pinned:true});assert.deepEqual(run(g,60,3000),[]);
 g=createCrowdGovernor({level:2});assert.equal(g.observe(NaN),null);assert.equal(g.observe(-1),null);assert.equal(g.observe(0),null);
 // the view's own tier drop needs slowSamples frames over slowFrameMs; the governor must act first at a 25 ms frame (40 fps)
 const r=tennis.render;g=createCrowdGovernor({level:2});assert.ok(run(g,r.slowFrameMs+.5,r.slowSamples).length>=1,'at '+(r.slowFrameMs+.5)+' ms the crowd steps down before the tier does');
});

test('geometry helpers: line trim keeps the singles court, pieces move as a whole, maps move only z',()=>{
 // two baseline-like boxes: one spanning the doubles width, one doubles sideline
 const lines=new THREE.BufferGeometry(),pos=[],idx=[];
 const box=(x0,x1,z0,z1)=>{const b=pos.length/3;for(const x of [x0,x1])for(const z of [z0,z1])pos.push(x,.02,z);idx.push(b,b+1,b+2,b+1,b+3,b+2);};
 box(-5.485,5.485,11.835,11.935);box(5.46,5.51,-11.885,11.885);box(4.09,4.14,-11.885,11.885);
 lines.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));lines.setIndex(idx);
 trimAlleys(lines);
 assert.equal(lines.index.count,12,'the doubles sideline is gone (its triangles are dropped), the baseline and the singles line stay');
 for(let i=0;i<lines.attributes.position.count;i++)assert.ok(Math.abs(lines.attributes.position.getX(i))<=4.14+1e-6,'nothing outside the singles lines');
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([1,2,3,4,5,6],3));warpGeometry(g,z=>z*2);
 assert.deepEqual([...g.attributes.position.array],[1,2,6,4,5,12],'only z moves');
 // two separate people (two triangles apart) move by their own centre
 const people=new THREE.BufferGeometry();people.setAttribute('position',new THREE.Float32BufferAttribute([0,0,6,1,0,6.2,0,1,6.4, 0,0,-12,1,0,-12.2,0,1,-12.4],3));people.setIndex([0,1,2,3,4,5]);
 assert.equal(connectedPieces(people).length,2);
 warpPieces(people,z=>z>0?z-2:z+2);
 const p=people.attributes.position;assert.ok(Math.abs(p.getZ(1)-4.2)<1e-6&&Math.abs(p.getZ(4)+10.2)<1e-6,'each piece moved by the map of its own centre, keeping its shape');
 assert.ok(Math.abs((p.getZ(2)-p.getZ(0))-.4)<1e-6,'a person keeps their depth');
});

test('load failures reject (the view falls back): HTTP error, timeout, and nothing is half built',async()=>{
 const cfg={...tennis,environment:env};
 const notFound=async()=>({ok:false,status:404,arrayBuffer:async()=>new ArrayBuffer(0),json:async()=>({})});
 await assert.rejects(()=>createTennisV7({scene:{},config:cfg,keep:x=>x,params:q(''),surface:'clay',fetcher:notFound}),/HTTP 404/);
 const hang=(url,{signal}={})=>new Promise((_,reject)=>signal?.addEventListener('abort',()=>reject(signal.reason||Error('aborted'))));
 await assert.rejects(()=>createTennisV7({scene:{},config:cfg,keep:x=>x,params:q(''),surface:'clay',timeoutMs:60,fetcher:hang}),/timeout/);
 const garbage=async()=>({ok:true,status:200,arrayBuffer:async()=>new Uint8Array([1,2,3,4]).buffer,json:async()=>({instances:[],count:0})});
 await assert.rejects(()=>createTennisV7({scene:{},config:cfg,keep:x=>x,params:q(''),surface:'clay',fetcher:garbage}));
});

test('v7 package: every file the game loads is in assets/, Draco only, under the cap, equals the design copy, carries the names the loader checks',async()=>{
 const dir=path.join(island,env.v7.base),design=path.join(island,'design/tennis-v7'),manifest=JSON.parse(await readFile(path.join(design,'manifest.json'),'utf8'));
 assert.equal(env.v7.base,'assets/tennis-v7/');
 const runtime=[...Object.values(V7_FILES.courts),V7_FILES.venue,V7_FILES.net,V7_FILES.ball,V7_FILES.crowd,V7_FILES.crew];
 assert.deepEqual(runtime.map(f=>f.replace('.glb','')).sort(),[...RUNTIME_GLBS].sort(),'the pack tool and the loader agree on the file list');
 assert.deepEqual((await readdir(dir)).sort(),[...runtime,V7_FILES.layout].sort(),'assets/tennis-v7 holds the runtime files and nothing else (no standalone.html, offline/, vendor, iterations, verification, characters)');
 let total=0;
 const roleOf={venue:V7_FILES.venue,net:V7_FILES.net,ball:V7_FILES.ball,crowd:V7_FILES.crowd,crew:V7_FILES.crew};
 for(const file of runtime){
  const bytes=await readFile(path.join(dir,file));total+=bytes.length;
  assert.ok(bytes.length<=1_500_000,file+' is under the package cap');assert.equal(bytes.readUInt32LE(0),0x46546c67,file+' is a GLB');
  const listed=manifest.assets.find(a=>a.file==='models/'+file);assert.equal(bytes.length,listed.bytes,file+' bytes equal the design manifest');
  assert.deepEqual(bytes,await readFile(path.join(design,'models',file)),file+' is byte-identical to the design copy');
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),names=new Set(json.nodes.map(n=>n.name.replace(/[\[\]\.:\/\s]/g,'_')));
  assert.deepEqual((json.extensionsUsed||[]).filter(e=>e==='KHR_draco_mesh_compression'),['KHR_draco_mesh_compression'],file+' is Draco compressed');
  assert.ok(!(json.images||[]).some(i=>i.uri),file+' embeds its textures: no extra request');assert.ok(!(json.buffers||[]).some(b=>b.uri),file+' has no external buffer');
  const role=file.startsWith('court-')?'court':Object.keys(roleOf).find(r=>roleOf[r]===file);
  // GLTFLoader turns spaces into underscores and drops . : / [ ]; compare with runs of underscores collapsed
  const collapsed=new Set([...names].map(n=>n.replace(/_+/g,'_')));
  for(const name of V7_REQUIRED[role])assert.ok(collapsed.has(name.replace(/_+/g,'_')),`${file} has ${name} (${[...names].join(',')})`);
 }
 const layoutFile=await readFile(path.join(dir,V7_FILES.layout),'utf8'),layout=JSON.parse(layoutFile),original=JSON.parse(await readFile(path.join(design,'crowd-layout.json'),'utf8'));
 assert.equal(layout.count,480);assert.equal(layout.instances.length,480);assert.deepEqual(layout,compactLayout(original),'the compact layout is exactly what the pack tool derives');
 original.instances.forEach((o,i)=>{const r=layout.instances[i];assert.ok(Math.abs(r[0]-o.position[0])<1e-3&&Math.abs(r[1]-o.position[1])<1e-3&&Math.abs(r[2]-o.position[2])<1e-3&&Math.abs(r[3]-o.yaw)<1e-3&&r[4]===o.row&&layout.sections[r[5]]===o.section);});
 assert.ok(layoutFile.length<20_000,'the layout is compact ('+layoutFile.length+' bytes instead of 91 KB)');
 assert.ok(total+layoutFile.length<=700_000,'the pack stays under 0.7 MB for all three surfaces ('+(total+layoutFile.length)+')');
 const surfaceBytes=async s=>(await stat(path.join(dir,V7_FILES.courts[s]))).size;
 let others=0;for(const f of [V7_FILES.venue,V7_FILES.net,V7_FILES.ball,V7_FILES.crowd,V7_FILES.crew])others+=(await stat(path.join(dir,f))).size;
 for(const s of ['hard','clay','grass'])assert.ok(others+await surfaceBytes(s)+layoutFile.length<=470_000,'one surface cold = '+(others+await surfaceBytes(s)+layoutFile.length));
});

test('the game never reads design/ for v7, no character GLB of the pack is loaded, the controls and the stick side are untouched',async()=>{
 for(const f of ['minigames/tennis-v7.mjs','minigames/tennis-v7-venue.mjs','minigames/tennis-draco.mjs','minigames/tennis-view.mjs','tools/perf-tennis-page.mjs'])assert.ok(!/design\/tennis-v7/.test(strip(await read(f))),f+' does not point at design/tennis-v7');
 assert.ok(!/design\/tennis-v7/.test(JSON.stringify(env)),'config does not point at design/tennis-v7');
 const venue=strip(await read('minigames/tennis-v7-venue.mjs')),module=strip(await read('minigames/tennis-v7.mjs'));
 assert.ok(!/man-0[12]|woman-0[12]/.test(venue+module),'the four v7 characters are not loaded (see TENNIS.md)');
 const session=await read('minigames/tennis-session.mjs');
 assert.match(session,/input\.setHanded\(true\);\/\* stick always on the left/,'joystick stays on the left');
 assert.ok(!/tennis-v7/.test(await read('minigames/tennis-controls.mjs')),'controls are not touched');
});

test('the view only touches v7 through the guarded dynamic import: lazy, failure keeps the previous court and crowd, one switch each',async()=>{
 const view=await read('minigames/tennis-view.mjs');
 assert.match(view,/import\('\.\/tennis-v7-venue\.mjs\?v=[^']+'\)/,'v7 loads lazily: the heavy module is not parsed when v7 is off');
 assert.ok(!/^import .*tennis-v7-venue/m.test(view),'no static import of the venue loader');
 assert.match(view,/v7Fallbacks\.push\('tennis v7 venue'\)/);assert.match(view,/v7\?\{metrics:v7\.courtMetrics\}:createUltraTennisCourt/);assert.match(view,/v7\|\|await createTennisEnvironment/);
 const v7src=await read('minigames/tennis-v7-venue.mjs');
 assert.ok(v7src.indexOf('namesOf(loaded[role])')<v7src.indexOf('root.add(loaded.court)'),'names are checked before anything is added');
 assert.match(view,/scene\.add\(v7\.root\)/,'the root is added only after the whole load succeeded');
});

test('offline: tennis has its own group on the list (v7 files, the Draco decoder, the previous assets the fallback needs, audio), the shell has the new code',async()=>{
 const list=offline.games.tennis;assert.ok(Array.isArray(list));
 for(const f of [...Object.values(V7_FILES.courts),V7_FILES.venue,V7_FILES.net,V7_FILES.ball,V7_FILES.crowd,V7_FILES.crew,V7_FILES.layout])assert.ok(list.includes(env.v7.base+f),f+' is on the tennis list');
 for(const f of ['vendor/draco/draco_decoder.wasm','vendor/draco/draco_wasm_wrapper.js','assets/tennis-kid.glb',...env.models,...Object.values(tennis.audio.samples)])assert.ok(list.includes(f),f+' is on the tennis list');
 assert.equal(new Set(list).size,list.length);
 for(const p of list)await stat(path.join(island,p));
 assert.ok(!list.some(p=>/design\/tennis-v7/.test(p)),'the design package is not downloaded');
 for(const m of ['minigames/tennis-v7.mjs','minigames/tennis-v7-venue.mjs','minigames/tennis-draco.mjs','minigames/tennis-draco-worker.mjs'])assert.ok(offline.shell.includes(m),m+' is in the shell list');
 const ui=await read('ui/offline.mjs');assert.match(ui,/tennis:'טניס'/);
});
