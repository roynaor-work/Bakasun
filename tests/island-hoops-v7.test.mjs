import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../workout/island/vendor/three.module.js';
import {v7Enabled,v7RoleKey,V7_ROLES,V7_REQUIRED_CLIPS,chooseV7Motion,shotClipTime,splitClip,flattenFlight,stripAnchor,reachArm} from '../workout/island/minigames/hoops-v7.mjs';
const island=new URL('../workout/island/',import.meta.url);
const read=async f=>readFile(new URL(f,island),'utf8');
const config=JSON.parse(await read('data/config.json')),cfg=config.minigames.streetSlam.assets;
const offline=JSON.parse(await read('offline-manifest.json'));
const clipTable=JSON.parse(await read('assets/hoops-v7/clips.json')).clips;

test('v7 switch: config default on, ?hoopsV7=0 off, ?hoopsV7=1 forces on only when configured',()=>{
 const q=s=>new URLSearchParams(s);
 assert.equal(v7Enabled(cfg,q('')),true);assert.equal(v7Enabled(cfg,q('hoopsV7=0')),false);
 assert.equal(v7Enabled({v7:{enabled:false}},q('')),false);assert.equal(v7Enabled({v7:{enabled:false}},q('hoopsV7=1')),true);
 assert.equal(v7Enabled({},q('hoopsV7=1')),false);assert.equal(v7Enabled(null,null),false);
 assert.equal(v7Enabled(cfg,q(''),0),false,'the lite quality tier keeps the v4 bodies');assert.equal(v7Enabled(cfg,q(''),1),true);assert.equal(v7Enabled(cfg,q('hoopsV7=1'),0),true);
 assert.equal(v7RoleKey('PG'),'PG');assert.equal(v7RoleKey('X'),'SF');
});
test('v7 runtime files live under assets/, are not in design/, exist, and are in the offline list',async()=>{
 const files=[...Object.values(cfg.v7.players),cfg.v7.clips];
 const games=new Set(offline.games.hoops);
 for(const f of files){assert.ok(f.startsWith('assets/hoops-v7/'),f);assert.ok(!f.includes('design/'),f);await stat(new URL(f,island));assert.ok(games.has(f),f+' is in offline-manifest games.hoops');}
 assert.deepEqual(Object.keys(cfg.v7.players),[...V7_ROLES]);
 assert.ok(offline.shell.includes('minigames/hoops-v7.mjs'));assert.ok(offline.shell.includes('vendor/meshopt_decoder.module.js'));
 for(const r of V7_ROLES)assert.ok((await stat(new URL(cfg.v7.players[r],island))).size<1_100_000,r+' under 1.1 MB');
});
test('the clip table covers every clip the motion layer names',()=>{
 for(const n of V7_REQUIRED_CLIPS)assert.ok(clipTable[n],n);
 assert.ok(clipTable.run.refSpeed>1&&clipTable.walk.refSpeed>0.3);
 const names=new Set();
 const ctxs=[{},{dribbling:false},{defending:true},{catching:true}];
 for(const hasBall of [false,true])for(const speed of [0,.2,.8,1.5,2.5,5])for(const ctx of ctxs)for(const act of [null,'shoot','fake','cross','spin','pass','block','rebound','steal'])for(const shotType of ['jump','ft','layup','dunk'])for(const stumble of [0,1]){
  const plan=chooseV7Motion({vx:speed,vz:0,face:Math.PI/2,hasBall,act,shotType,stumble,sprinting:speed>4},ctx,null);
  for(const k of ['full','upper','lower'])if(plan[k])names.add(k==='full'?plan[k]:k+':'+plan[k]);
 }
 for(const n of names){const base=n.replace(/^(upper|lower):/,'');assert.ok(clipTable[base],n+' is in the clip table');}
 assert.ok(names.has('upper:dribble_right')&&names.has('lower:run')&&names.has('upper:idle_hold'),'the ball handler runs with a dribbling upper body');
});
test('ball handler: dribble over legs; a dead dribble holds the ball with two hands; no ball: plain gait',()=>{
 const run={vx:3,vz:0,face:Math.PI/2,hasBall:true},hold=chooseV7Motion(run,{dribbling:false}),dr=chooseV7Motion(run,{dribbling:true});
 assert.deepEqual([dr.upper,dr.lower],['dribble_right','run']);assert.deepEqual([hold.upper,hold.lower],['idle_hold','run']);
 assert.equal(chooseV7Motion({vx:0,vz:0,hasBall:true},{dribbling:true}).lower,'idle');
 assert.equal(chooseV7Motion({vx:3,vz:0,face:Math.PI/2,hasBall:false},{}).full,'run');
 assert.equal(chooseV7Motion({vx:0.7,vz:0,face:Math.PI/2,hasBall:false},{}).full,'walk');
 assert.equal(chooseV7Motion({vx:0,vz:0,hasBall:false},{}).full,'idle');
 assert.equal(chooseV7Motion({vx:1,vz:0,face:Math.PI/2,hasBall:false},{defending:true}).full,'defense_shuffle');
 assert.equal(chooseV7Motion({stumble:.4,vx:0,vz:0},{}).full,'fall');
});
test('shot clip time: release marker lines up with the engine release and never runs ahead while the ball is held',()=>{
 const meta={events:[{name:'visual_ball_release',at:.86}]},em={release:.77,duration:1.45};
 const held=[0,.2,.5,.77,1].map(t=>shotClipTime(meta,1.75,t,true,null,em));
 assert.ok(held.every((v,i)=>i===0||v>=held[i-1])&&held.every(v=>v<=.86-.01),'held: monotone and before contact');
 assert.ok(Math.abs(shotClipTime(meta,1.75,.77,false,.77,em)-.86)<1e-6,'at the release the clip is at its release marker');
 assert.ok(shotClipTime(meta,1.75,1.45,false,.77,em)<=1.75);
});
test('flattenFlight removes the jump above standing height and keeps the crouch; anchors are stripped',()=>{
 const hips=new THREE.VectorKeyframeTrack('Hips.position',[0,.5,1],[0,1,0, 0,.8,0, 0,1.4,0]),anchor=new THREE.VectorKeyframeTrack('MotionBallAnchor.position',[0,1],[0,0,0,0,1,0]);
 const out=flattenFlight(stripAnchor(new THREE.AnimationClip('x',1,[hips,anchor])),1);
 assert.equal(out.tracks.length,1);assert.deepEqual([...out.tracks[0].values].filter((_,i)=>i%3===1).map(v=>+v.toFixed(2)),[1,.8,1]);
 const upper=splitClip(new THREE.AnimationClip('y',1,[new THREE.QuaternionKeyframeTrack('Spine.quaternion',[0,1],[0,0,0,1,0,0,0,1]),new THREE.QuaternionKeyframeTrack('LeftLeg.quaternion',[0,1],[0,0,0,1,0,0,0,1]),new THREE.NumberKeyframeTrack('pg-athlete.morphTargetInfluences',[0,1],[0,1])]),'upper','u');
 assert.deepEqual(upper.tracks.map(t=>t.name).sort(),['Spine.quaternion','pg-athlete.morphTargetInfluences']);
});
test('reachArm puts the wrist on a reachable goal and keeps the bone lengths',()=>{
 const root=new THREE.Object3D(),mk=(n,p,parent)=>{const b=new THREE.Bone();b.name=n;b.position.set(...p);parent.add(b);return b;};
 const sh=mk('Arm',[0,1.5,0],root),el=mk('ForeArm',[0,-.3,0],sh),wr=mk('Hand',[0,-.28,0],el);root.updateMatrixWorld(true);
 const goal=new THREE.Vector3(.35,1.3,.2);
 assert.ok(reachArm(sh,el,wr,goal,1));root.updateMatrixWorld(true);
 const w=wr.getWorldPosition(new THREE.Vector3());assert.ok(w.distanceTo(goal)<.01,'wrist at goal '+w.toArray());
 assert.ok(Math.abs(el.getWorldPosition(new THREE.Vector3()).distanceTo(sh.getWorldPosition(new THREE.Vector3()))-.3)<1e-5);
 const before=wr.getWorldPosition(new THREE.Vector3());assert.equal(reachArm(sh,el,wr,new THREE.Vector3(5,5,5),0),false);assert.ok(wr.getWorldPosition(new THREE.Vector3()).distanceTo(before)<1e-9);
});
test('v7 asset files: five bodies with 27 clips each (GLB header)',async()=>{
 for(const r of V7_ROLES){
  const buf=await readFile(new URL(cfg.v7.players[r],island)),len=buf.readUInt32LE(12),json=JSON.parse(buf.subarray(20,20+len).toString('utf8'));
  assert.equal(buf.toString('utf8',0,4),'glTF');assert.equal(json.animations.length,27);
  assert.ok(json.nodes.filter(n=>/^(Root|Hips|Spine|Chest|Neck|Head|Left|Right)/.test(n.name)).length>=18);
 }
});

test('meshopt runs in a static module worker, never in the page (the island CSP has no WebAssembly exception)',async()=>{
 const {createMeshoptWorkerDecoder}=await import('../workout/island/minigames/hoops-v7.mjs');
 const page=await readFile(new URL('minigames/hoops-v7.mjs',island),'utf8');
 assert.ok(!/vendor\/meshopt_decoder/.test(page),'the page module does not import the decoder (its wasm instantiation would break under script-src self)');
 const worker=await readFile(new URL('minigames/hoops-meshopt-worker.mjs',island),'utf8');
 assert.match(worker,/vendor\/meshopt_decoder\.module\.js/);
 const made=[];
 class FakeWorker{constructor(url,opts){this.url=String(url);this.opts=opts;made.push(this);}postMessage(m){this.last=m;queueMicrotask(()=>this.onmessage({data:{id:m.id,value:new Uint8Array(m.count*m.size)}}));}terminate(){this.dead=true;}}
 const d=createMeshoptWorkerDecoder(FakeWorker);
 assert.equal(made.length,0,'no worker until the first decode');
 const out=await d.decodeGltfBufferAsync(4,12,new Uint8Array([1,2,3]),'ATTRIBUTES','NONE');
 assert.equal(out.buffer.byteLength,48);assert.equal(made.length,1);assert.equal(made[0].opts.type,'module');assert.match(made[0].url,/hoops-meshopt-worker\.mjs$/);
 d.dispose();assert.ok(made[0].dead);
});
