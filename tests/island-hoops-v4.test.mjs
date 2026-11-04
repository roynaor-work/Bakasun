import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../workout/island/vendor/three.module.js';
import {hipScaledClips} from '../workout/island/minigames/hoops-players.mjs';
import {splitStaticMesh} from '../workout/island/minigames/hoops-models.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {V4_ROLES,v4RoleKey,v4Enabled,v4ArenaEnabled,jerseyUVs,shortsColors} from '../workout/island/minigames/hoops-v4.mjs';

const island=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../workout/island');
const read=async file=>readFile(path.join(island,file),'utf8');
const config=JSON.parse(await read('data/config.json')),cfg=config.minigames.streetSlam.assets;
const offline=JSON.parse(await read('offline-manifest.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');

test('v4 switches: config default on, ?hoopsV4=0 forces v3, ?hoopsV4=1 forces v4, the 3D crowd needs quality 2',()=>{
 const q=s=>new URLSearchParams(s);
 assert.equal(v4Enabled(cfg,q('')),true);assert.equal(v4Enabled(cfg,q('hoopsV4=0')),false);
 assert.equal(v4Enabled({...cfg,v4:{...cfg.v4,enabled:false}},q('')),false);assert.equal(v4Enabled({...cfg,v4:{...cfg.v4,enabled:false}},q('hoopsV4=1')),true);
 assert.equal(v4Enabled({},q('')),false);assert.equal(v4Enabled(cfg,undefined),true);
 assert.equal(v4ArenaEnabled(cfg,2,q('')),true);assert.equal(v4ArenaEnabled(cfg,1,q('')),false,'quality 1 keeps the lighter v3 venue');assert.equal(v4ArenaEnabled(cfg,0,q('')),false);
 assert.equal(v4ArenaEnabled(cfg,2,q('hoopsV4=0')),false);
});

test('v4 role keys: five positions, anything else gets the wing body',()=>{
 assert.deepEqual([...V4_ROLES],['PG','SG','SF','PF','C']);
 for(const r of V4_ROLES)assert.equal(v4RoleKey(r),r);
 assert.equal(v4RoleKey(undefined),'SF');assert.equal(v4RoleKey('G'),'SF');
});

test('jersey UVs: front on the left half of the sheet, back mirrored on the right, v from the neckline down',()=>{
 // four vertices of a 0.5 m wide, 0.6 m tall torso: front-left, front-right, back-left, back-right
 const positions=new Float32Array([-.25,.6,.1, .25,.6,.1, -.25,0,-.1, .25,0,-.1]),normals=new Float32Array([0,0,1, 0,0,1, 0,0,-1, 0,0,-1]);
 const uv=jerseyUVs(positions,normals);
 assert.deepEqual([...uv].map(n=>+n.toFixed(3)),[0,0, .5,0, 1,1, .5,1]);
 for(const n of uv)assert.ok(n>=0&&n<=1);
});

test('v4 shorts take the club colour (darkened by the avatar) and the second colour for the trim',()=>{
 assert.deepEqual(shortsColors({primary:'#123456',secondary:'#abcdef',trim:'#ffffff'}),{base:'#123456',trim:'#abcdef'});
 assert.deepEqual(shortsColors({primary:'#123456',trim:'#ffffff'}),{base:'#123456',trim:'#ffffff'});
});

test('v4 package: every file the game requests exists, is listed for offline use, and the live config matches the asset heights',async()=>{
 const manifest=JSON.parse(await read('design/hoops-v4/manifest.json')),provenance=JSON.parse(await read('design/hoops/lod-v4/hoops-v4-lod-provenance.json'));
 const files=[...Object.values(cfg.v4.players),cfg.v4.arena];
 for(const f of files){await stat(path.join(island,f));assert.ok(offline.games.hoops.includes(f),f+' is in the basketball offline list');}
 assert.equal(new Set(offline.games.hoops).size,offline.games.hoops.length);
 assert.ok(offline.shell.includes('minigames/hoops-v4.mjs'),'the new module is in the shell list');
 let playerBytes=0;
 for(const r of manifest.roles){
  const role=r.role,lod=provenance.assets.find(a=>a.role===role.toLowerCase());
  assert.equal(cfg.v4.baseHeights[role],Math.round(r.heightMeters*100),role+' base height is the asset height in cm');
  assert.equal(cfg.v4.players[role],lod.output);
  const source=await readFile(path.join(island,'design/hoops-v4/assets/players',role.toLowerCase()+'.glb')),bytes=await readFile(path.join(island,lod.output));
  assert.equal(sha(source),r.asset.sha256,role+' source is the delivered v4 file');assert.equal(lod.sourceSha256,r.asset.sha256);assert.equal(sha(bytes),lod.outputSha256,role+' LOD matches its provenance');
  assert.ok(lod.bones===52&&lod.bindIdentical&&lod.originalNodeTransforms);
  assert.ok(lod.triangles>=4500&&lod.triangles<=6500,`${role}: ${lod.triangles} triangles (source ${lod.sourceTriangles})`);
  assert.ok(bytes.length<=1500000,role+' stays under the 1.5 MB GLB limit');playerBytes+=bytes.length;
 }
 const arena=await stat(path.join(island,cfg.v4.arena)),venue=provenance.assets.find(a=>a.role==='arena'),venueSource=await readFile(path.join(island,'design/hoops-v4/assets/arena.glb')),venueBytes=await readFile(path.join(island,cfg.v4.arena));
 assert.ok(arena.size<=1500000);assert.equal(venue.output,cfg.v4.arena);assert.equal(sha(venueSource),venue.sourceSha256,'the venue source is the delivered v4 file');assert.equal(sha(venueBytes),venue.outputSha256);
 assert.ok(venue.triangles>=90000&&venue.triangles<=130000,`venue ${venue.triangles} triangles (source ${venue.sourceTriangles}): the crowd is reduced, the rest of the venue is not`);
 // what a cold start downloads on top of the shared files: the five bodies and the venue (the v3 bodies are not requested)
 assert.ok(playerBytes+arena.size<=2200000,'v4 additions: '+(playerBytes+arena.size));
 assert.ok(playerBytes+arena.size<=config.ui.downloadBudget.gameAdditional,'inside the per-game download budget');
});

test('v4 bodies keep the 52-bone Mixamo rig of the v3 bodies, so every v3 motion clip and procedural hand layer still applies',async()=>{
 const names=async f=>{const b=await readFile(path.join(island,f)),length=b.readUInt32LE(12),json=JSON.parse(b.subarray(20,20+length));return json.skins[0].joints.map(i=>json.nodes[i].name);};
 const v3=await names(cfg.lodModels.guard);
 for(const f of Object.values(cfg.v4.players))assert.deepEqual(await names(f),v3,f);
});

test('hoops view and players wire the v4 path with a silent fall back to v3',async()=>{
 const view=await read('minigames/hoops-view.mjs'),players=await read('minigames/hoops-players.mjs'),models=await read('minigames/hoops-models.mjs');
 assert.ok(/v4ArenaEnabled\(config\.assets,quality,params\)/.test(view)&&/onFallback\('arena'/.test(view)&&/if\(!models\)models=await replaceArenaAssets\(arena,dyn,court,arenaOptions\)/.test(view),'arena falls back to the v3 venue');
 assert.ok(/loadPlayerAssets\(config\.assets,assetBase,onProgress,\{params,onFallback\}\)/.test(view));
 assert.ok(/catch\(error\)\{onFallback\?\.\('players',error\);\}\s*\}\s*return loadPlayerAssetsV1/.test(players),'players fall back to the v3 bodies');
 assert.ok(/validate before anything visible changes/.test(models),'the v4 venue is checked before the arena is touched');
 assert.ok(/characterVersion:assets\.v2\?2:assets\.v4\?4:1/.test(view)&&/v4Fallbacks/.test(view),'metrics report which assets are live');
});

test('the 3D crowd is cut into culling chunks that share one vertex buffer and lose no triangle',()=>{
 // a ring of 400 small triangles around a 36 x 48 m footprint, like the stands around the court
 const positions=[],colors=[],indices=[];
 for(let i=0;i<400;i++){const a=i/400*Math.PI*2,x=Math.cos(a)*16,z=Math.sin(a)*22,base=positions.length/3;
  positions.push(x,1,z,x+.3,1,z,x,1.5,z+.3);colors.push(1,1,1,1,1,1,1,1,1);indices.push(base,base+1,base+2);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
 const parent=new THREE.Group(),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true}));mesh.name='seated_crowd';parent.add(mesh);
 const group=splitStaticMesh(mesh);
 assert.equal(parent.getObjectByName('seated_crowd'),group,'the group takes the name of the mesh');assert.equal(parent.children.length,1);
 assert.ok(group.children.length>=6&&group.children.length<=9,'a ring leaves the centre cell empty: '+group.children.length);
 let triangles=0;for(const part of group.children){triangles+=part.geometry.index.count/3;assert.equal(part.geometry.attributes.position,geometry.attributes.position,'vertex buffer is shared');assert.equal(part.material,mesh.material);
  const sphere=part.geometry.boundingSphere;assert.ok(sphere.radius<geometry.boundingSphere?.radius||sphere.radius<30,'chunk bounds are its own, not the whole ring');}
 assert.equal(triangles,400);
 const widths=group.children.map(p=>p.geometry.boundingBox.max.x-p.geometry.boundingBox.min.x);assert.ok(Math.max(...widths)<24,'no chunk spans the whole footprint');
});

test('hip scaling retargets the v3 clips to a body with other leg length: only the hip track changes',()=>{
 const rot=new THREE.QuaternionKeyframeTrack('mixamorigSpine.quaternion',[0,1],[0,0,0,1,0,0,0,1]);
 const hips=new THREE.VectorKeyframeTrack('mixamorigHips.position',[0,1],[0,1.1,0,0.1,1.2,0]);
 const clips=new Map([['idle',new THREE.AnimationClip('idle',1,[rot,hips])]]);
 const scaled=hipScaledClips(clips,1.25).get('idle'),original=clips.get('idle');
 assert.equal(scaled.name,'idle');assert.equal(scaled.duration,1);assert.equal(scaled.tracks[0],rot,'rotation tracks are shared, not copied');
 assert.deepEqual([...scaled.tracks[1].values].map(n=>+n.toFixed(4)),[0,1.375,0,.125,1.5,0]);assert.deepEqual([...hips.values].map(n=>+n.toFixed(4)),[0,1.1,0,.1,1.2,0],'the source clip is untouched');
 assert.notEqual(scaled,original);
 assert.throws(()=>hipScaledClips(clips,0),/hip ratio/);assert.throws(()=>hipScaledClips(clips,3),/hip ratio/);
});
