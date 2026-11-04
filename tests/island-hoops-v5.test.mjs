import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../workout/island/vendor/three.module.js';
import {V5_FILES,V5_REQUIRED,CROWD_LEVELS,v5Enabled,crowdKeeps,crowdStartLevel,createCrowdGovernor} from '../workout/island/minigames/hoops-v5.mjs';
import {sliceByX} from '../workout/island/minigames/hoops-v5-venue.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=async file=>readFile(path.join(island,file),'utf8');
const config=JSON.parse(await read('data/config.json')),cfg=config.minigames.streetSlam.assets;
const offline=JSON.parse(await read('offline-manifest.json'));
const q=s=>new URLSearchParams(s);

test('v5 switches: config default on from quality 1, ?hoopsV5=0 forces the older venue, ?hoopsV5=1 forces v5, quality 0 stays light',()=>{
 assert.equal(v5Enabled(cfg,2,q('')),true);assert.equal(v5Enabled(cfg,1,q('')),true);assert.equal(v5Enabled(cfg,0,q('')),false,'quality 0 (lite) never downloads the v5 venue');
 assert.equal(v5Enabled(cfg,2,q('hoopsV5=0')),false);assert.equal(v5Enabled(cfg,0,q('hoopsV5=1')),true);
 assert.equal(v5Enabled({...cfg,v5:{...cfg.v5,enabled:false}},2,q('')),false);assert.equal(v5Enabled({...cfg,v5:{...cfg.v5,enabled:false}},2,q('hoopsV5=1')),true);
 assert.equal(v5Enabled({},2,q('')),false,'no v5 block in the config, no v5');assert.equal(v5Enabled(cfg,2,undefined),true);
});

test('crowd levels thin the stands evenly: all, two thirds, one third',()=>{
 const count=l=>{let n=0;for(let i=0;i<2762;i++)if(crowdKeeps(l,i))n++;return n;};
 assert.equal(count(2),2762);assert.equal(count(1),1842,'level 1 drops every third card');assert.equal(count(0),921,'level 0 keeps every third card');
 assert.deepEqual(CROWD_LEVELS.map(l=>l.sway),[false,true,true],'only the lowest level freezes the sway');
 // no long gaps: any ten consecutive cards keep at least three at the lowest level
 for(let s=0;s<100;s++){let n=0;for(let i=s;i<s+10;i++)if(crowdKeeps(0,i))n++;assert.ok(n>=3);}
});

test('crowd start level follows the quality tier; ?hoopsV5Level pins it',()=>{
 assert.deepEqual(crowdStartLevel(2,q('')),{level:2,pinned:false});assert.deepEqual(crowdStartLevel(1,q('')),{level:1,pinned:false});
 assert.deepEqual(crowdStartLevel(2,q('hoopsV5Level=0')),{level:0,pinned:true});assert.deepEqual(crowdStartLevel(1,q('hoopsV5Level=9')),{level:2,pinned:true});
 assert.deepEqual(crowdStartLevel(2,q('hoopsV5Level=x')),{level:2,pinned:false});
});

test('governor: steps down after sustained slow frames, never up, ignores hitches, pinned never moves',()=>{
 const run=(g,ms,n)=>{let out=[];for(let i=0;i<n;i++){const r=g.observe(ms/1000);if(r!=null)out.push(r);}return out;};
 let g=createCrowdGovernor({level:2});
 assert.deepEqual(run(g,16.7,600),[],'60 fps keeps the full crowd');
 assert.deepEqual(run(g,25,600),[],'40 fps keeps the full crowd');
 g=createCrowdGovernor({level:2});
 assert.deepEqual(run(g,50,2000),[1,0],'20 fps steps 2 -> 1 -> 0 and stops there (cooldown between steps)');
 assert.deepEqual(run(g,8,3000),[],'a fast device later does not bring the crowd back (no flicker)');
 g=createCrowdGovernor({level:2});
 assert.deepEqual(run(g,400,500),[],'frames over 250 ms are tab switches or loading, not load');
 g=createCrowdGovernor({level:2});const first=run(g,50,150);assert.deepEqual(first,[1],'about 150 slow frames to the first step');
 assert.equal(run(g,50,100).length,0,'cooldown');
 g=createCrowdGovernor({level:1,pinned:true});assert.deepEqual(run(g,60,3000),[]);
 g=createCrowdGovernor({level:2});assert.equal(g.observe(NaN),null);assert.equal(g.observe(-1),null);
});

test('sliceByX keeps one basket per mesh: compact attributes, indices valid, nothing from the other side',()=>{
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-13,3,0, -12,3,0, -12.5,4,0, 13,3,0, 12,3,0, 12.5,4,0],3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1],3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Array(18).fill(1),3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0, 1,0, .5,1, 0,0, 1,0, .5,1],2));
 geometry.setAttribute('tangent',new THREE.Float32BufferAttribute(new Array(24).fill(0),4));
 geometry.setIndex([0,1,2,3,4,5]);
 for(const side of [1,-1]){
  const g=sliceByX(geometry,side),p=g.attributes.position;
  assert.equal(p.count,3);assert.equal(g.index.count,3);assert.ok(g.attributes.uv&&g.attributes.color&&g.attributes.normal);assert.ok(!g.attributes.tangent,'only the attributes the venue uses survive');
  for(let i=0;i<p.count;i++)assert.ok(side*p.getX(i)>0);
 }
 const none=new THREE.BufferGeometry();none.setAttribute('position',new THREE.Float32BufferAttribute([1,0,0,2,0,0,1.5,1,0],3));assert.equal(sliceByX(none,-1),null);
 assert.equal(sliceByX(none,1).attributes.position.count,3,'a non-indexed geometry slices too');
});

test('v5 package: every file the game requests exists, is Draco-only, under the size cap, carries the names the loader checks, and is on the offline list',async()=>{
 const dir=path.join(island,cfg.v5.base);
 let total=0;
 for(const [role,file] of Object.entries(V5_FILES)){
  const full=path.join(dir,file),bytes=await readFile(full);total+=bytes.length;
  assert.ok(bytes.length<=1_500_000,file+' is under the package cap');
  assert.equal(bytes.readUInt32LE(0),0x46546c67,file+' is a GLB');
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),nodes=new Set(json.nodes.map(n=>n.name.replace(/[\[\]\.:\/\s]/g,'')));
  assert.deepEqual((json.extensionsUsed||[]).filter(e=>e==='KHR_draco_mesh_compression'),['KHR_draco_mesh_compression'],file+' is Draco compressed');
  assert.ok(!(json.images||[]).some(i=>i.uri),file+' embeds its textures: no extra request');
  for(const name of V5_REQUIRED[role])assert.ok(nodes.has(name),`${file} has ${name}`);
  assert.ok(offline.games.hoops.includes(cfg.v5.base+file),file+' is on the offline list');
 }
 assert.ok(total<=1_800_000,'the five files the game loads stay at about 1.77 MB ('+total+' bytes)');
 assert.ok(!offline.games.hoops.includes(cfg.v5.base+'uniforms.glb'),'the preview-only jerseys are not downloaded or kept offline');
 for(const m of ['minigames/hoops-v5.mjs','minigames/hoops-v5-venue.mjs'])assert.ok(offline.shell.includes(m),m+' is in the shell list');
 const crowd=JSON.parse((await readFile(path.join(dir,'crowd.glb'))).subarray(20,20+(await readFile(path.join(dir,'crowd.glb'))).readUInt32LE(12)).toString());
 assert.deepEqual(crowd.animations.map(a=>a.name),['Crowd_Sway_4s'],'the crowd sway clip the controller plays');
});

test('the view only touches v5 through the guarded dynamic import, and the jerseys stay with the existing per-player atlas',async()=>{
 const view=await read('minigames/hoops-view.mjs');
 assert.match(view,/import\('\.\/hoops-v5-venue\.mjs'\)/,'v5 loads lazily: the heavy module is not parsed when v5 is off');
 assert.match(view,/onFallback\('v5 arena',error\)/);
 const venue=await read('minigames/hoops-v5-venue.mjs');
 assert.ok(!/uniforms\.glb/.test(venue.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'')),'uniforms.glb is not loaded: its fixed 07/23 sheets cannot carry each player\'s number');
});
