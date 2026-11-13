import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {buildShell} from '../workout/island/tools/offline-shell.mjs';
import {planCrowd} from '../workout/island/assets/tennis-crowd-v22/lod-policy.mjs';
import {standSeats,PLACEMENTS,fitZ} from '../workout/island/minigames/tennis-v12-stadium.mjs';
import {DATA_VERSION} from '../workout/island/release.mjs';

const root=new URL('../workout/island/',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const crowd='assets/tennis-crowd-v22/';

test('tennis crowd v22: every runtime file exists (3 levels x 12 variants, modules, config, licence)',async()=>{
  for(const f of ['crowd-lod.mjs','lod-policy.mjs','assets.json','lod-config.json','LICENSES.md'])await access(new URL(crowd+f,root));
  const assets=JSON.parse(await read(crowd+'assets.json'));
  assert.equal(assets.assets.length,36);
  for(const a of assets.assets)await access(new URL(crowd+a.file,root));
  for(const d of ['design/tennis-crowd-3d-v1/runtime/crowd.mjs','design/tennis-crowd-3d-v1/lod/lod-config.json'])await access(new URL(d,root));
});

test('tennis crowd v22: LOD levels and triangle budget follow lod-config.json (crowd under 90,000, 600 fans)',async()=>{
  const config=JSON.parse(await read(crowd+'lod-config.json')),assets=JSON.parse(await read(crowd+'assets.json'));
  assert.equal(config.levels.length,3);assert.equal(config.instances,600);
  assert.ok(config.distanceThresholds[0]<config.distanceThresholds[1]);
  assert.ok(config.crowdTriangleLimit<=90000);
  config.levels.forEach((level,i)=>{
    const files=assets.assets.filter(a=>a.level===i);assert.equal(files.length,12,'level '+i);
    for(const a of files){assert.ok(a.triangles<=level.maxTriangles,a.file);assert.ok(a.file.includes('/lod'+i+'/'));}
  });
  const seats=[],cam=[0,12.8,25];
  for(const stand of PLACEMENTS.filter(p=>p.model==='stand-10m'))for(const s of standSeats()){
    const c=Math.cos(stand.rotationY),n=Math.sin(stand.rotationY);
    seats.push({x:stand.position[0]+c*s.x+n*s.z,y:s.y,z:fitZ(stand.position[2],9)-n*s.x+c*s.z});
  }
  assert.equal(seats.length,600);
  for(const camera of [cam,[-26,7,2],[0,6,30],[0,3,12]]){
    const plan=planCrowd(seats,camera,config);
    assert.equal(plan.instances,600);assert.ok(plan.triangles<=config.crowdTriangleLimit,camera.join());
    assert.ok(plan.triangles<=90000);
  }
  // distance picks the level: the nearest seat to the camera is LOD0-weighted, the farthest LOD2.
  const plan=planCrowd(seats,[0,3,12],config),byDist=[...plan.assignments].sort((a,b)=>a.distance-b.distance);
  assert.ok(byDist[0].weights[0]>=byDist.at(-1).weights[0]);assert.ok(byDist.at(-1).weights[2]>=byDist[0].weights[2]);
});

test('tennis crowd v22: ?tennisCrowd3d=0 returns the billboard crowd, and the 3D crowd falls back by itself on a load error',async()=>{
  const stadium=await read('minigames/tennis-v12-stadium.mjs'),view=await read('minigames/tennis-view.mjs');
  assert.ok(stadium.includes("params?.get?.('tennisCrowd3d')!=='0'"),'flag read');
  assert.ok(stadium.includes("crowd-atlas.webp")&&stadium.includes("if(!crowd3d){"),'billboard crowd is kept behind the fallback');
  assert.ok(/catch\(error\)\{crowd3d\?\.dispose\?\.\(\);crowd3d=null;\}/.test(stadium),'load error leaves no half crowd');
  assert.ok(stadium.includes("crowd:crowd3d?'3d-lod':'billboard'"),'metrics say which crowd runs');
  assert.ok(stadium.includes('crowd3d.update(')&&stadium.includes('ballPosition')&&stadium.includes('celebration:cheer.value'),'heads follow the ball, cheer lifts the arms');
  assert.ok(/GLTFLoader:Loader,base:import\.meta\.url,camera\}/.test(view),'the view passes its camera for the LOD distance');
  assert.ok(!/island-v2-2026(?!1107-11)\d{4}-\d+/.test(stadium.replace(/island-v2-20261107-11/g,'')),'only the current version tag');
});

test('tennis crowd v22: the offline list carries the crowd files and the shell list is current',async()=>{
  const manifest=JSON.parse(await read('offline-manifest.json')),assets=JSON.parse(await read(crowd+'assets.json'));
  for(const f of ['assets.json','lod-config.json',...assets.assets.map(a=>a.file)])assert.ok(manifest.games.tennis.includes(crowd+f),f);
  for(const f of ['crowd-lod.mjs','lod-policy.mjs'])assert.ok(manifest.shell.includes(crowd+f),f);
  assert.deepEqual(manifest.shell,await buildShell(),'run node workout/island/tools/offline-shell.mjs');
});

test('offline panel: a small Hebrew version line shows the running DATA_VERSION (no exclamation marks)',async()=>{
  const {versionLine}=await import('../workout/island/ui/offline-panel.mjs');
  assert.equal(versionLine(),`גרסה: ${DATA_VERSION}`);assert.ok(!versionLine().includes('!'));
  const source=await read('ui/offline-panel.mjs');
  assert.ok(source.includes("import {DATA_VERSION} from '../release.mjs'"));
  assert.ok(source.includes("node('p','offline-version',versionLine())")&&source.includes('panel.append(heading,status,bar,games,download,check,versionRow)'));
});
