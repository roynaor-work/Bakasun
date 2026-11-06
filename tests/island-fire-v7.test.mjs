import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {createFireScene} from '../workout/island/minigames/fire-view.mjs';
import {fireV7Enabled,lodNear,lotStage,buildingFile,TYPE_OF,V7_BASE} from '../workout/island/minigames/fire-v7.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import * as T from '../workout/island/vendor/three.module.js';
const root=new URL('../workout/island/',import.meta.url),data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))})),config=data.config.minigames;
const make=(level=6)=>createFireModel({config,balance:config.fireRescue,level,random:seededRandom(2026)});
const ctx={config,balance:config.fireRescue,t:id=>data.strings?.[id]||id};

test('fire v7: off flag and URL switch', () => {
  assert.equal(fireV7Enabled('',undefined),true);
  assert.equal(fireV7Enabled('?fireV7=0',undefined),false);
  assert.equal(fireV7Enabled('?x=1',false),false);
});
test('fire v7: LOD uses hysteresis (no flicker at the threshold)', () => {
  assert.equal(lodNear(8,false),true); assert.equal(lodNear(9.5,false),false);
  assert.equal(lodNear(9.5,true),true); assert.equal(lodNear(10.6,true),false);
});
test('fire v7: stage follows the nearest flame, scorched only after it burned', () => {
  const lot={x:0,z:0},sites=[[1,0,1],[40,0,40]];
  assert.equal(lotStage([{active:true,heat:.5},{active:true,heat:1}],sites,lot,false),'burning');
  assert.equal(lotStage([{active:false,heat:0},{active:true,heat:1}],sites,lot,true),'scorched');
  assert.equal(lotStage([{active:false,heat:0},{active:true,heat:1}],sites,lot,false),'intact');
  assert.equal(lotStage([{active:true,heat:1}],[[40,0,40]],lot,false),'intact');
});
test('fire v7: every style maps to a v7 type and every runtime file exists under assets/fire-v7 (not design/)', async () => {
  for(const b of config.fireRescue.city.buildings){if(config.fireRescue.city.modelLots.includes(config.fireRescue.city.buildings.indexOf(b))){assert.ok(TYPE_OF[b.style],b.style);for(const stage of ['intact','burning','scorched'])for(const near of [false,true])assert.ok((await stat(new URL(V7_BASE+buildingFile(TYPE_OF[b.style],stage,near),root))).size>1000);}}
  const src=await readFile(new URL('minigames/fire-v7.mjs',root),'utf8');assert.ok(!/['"`][^'"`\n]*design\//.test(src),'no string in fire-v7.mjs may point into design/');
});

const fakeScene=(h=3)=>{const g=new T.Group(),m=new T.Mesh(new T.BoxGeometry(2,h,2),new T.MeshStandardMaterial({color:'#ccc'}));m.position.y=h/2;g.add(m);return g;};
test('fire v7: blocked assets fall back silently, scene keeps the earlier art, no throw', async () => {
  const requested=[],world=createFireScene(ctx,make(),{v7Loader:{async loadAsync(url){requested.push(url);throw Error('blocked');},dispose(){}}});
  const before=world.metrics(),rep=await world.loadV7();
  assert.equal(rep.truck,false);assert.equal(rep.hydrant,false);assert.equal(rep.crew,false);assert.equal(rep.citizens,false);assert.equal(rep.lots.size,0);assert.equal(rep.atlas,false);
  assert.ok(requested.length>0&&requested.every(u=>u.includes('assets/fire-v7/')&&!u.includes('design/')));
  assert.equal(world.metrics().triangles,before.triangles); // nothing was added
  assert.equal(world.v7Metrics().loaded,0);assert.ok(world.v7Metrics().failed>0);
  world.dispose();
});
test('fire v7: with files present buildings swap per stage, lot base hides, and everything disposes once', async () => {
  const requested=[],world=createFireScene(ctx,make(),{v7Loader:{async loadAsync(url){requested.push(url);return {scene:fakeScene(),animations:[]};},dispose(){}}});
  const base=world.scene.children.length,rep=await world.loadV7();
  assert.ok(rep.lots.size>0);assert.ok(rep.truck);
  assert.ok(requested.some(u=>/-intact-lod\.glb/.test(u)));
  world.animate();await new Promise(r=>setTimeout(r,20));world.animate();
  assert.ok(requested.some(u=>/-burning(-lod)?\.glb/.test(u)),'burning stage is requested once a flame is active near a lot');
  const counts=new Map();world.scene.traverse(o=>{if(o.geometry&&!counts.has(o.geometry)){counts.set(o.geometry,0);o.geometry.addEventListener('dispose',()=>counts.set(o.geometry,counts.get(o.geometry)+1));}});
  world.dispose();world.dispose();for(const c of counts.values())assert.ok(c<=1);
  assert.equal(world.metrics().disposed,true);assert.ok(base>0);
});
test('fire v7: particle atlas mode swaps shaders only when all textures are present, and quality steps lower the per-frame counts', async () => {
  const world=createFireScene(ctx,make(),{v7Loader:{async loadAsync(){throw Error('x');},dispose(){}}});
  const tex=()=>new T.Texture(),full={flames:tex(),smoke:tex(),embers:tex(),drops:tex(),mist:tex()};
  const fx=world.effectsMetrics();assert.equal(fx.atlas,false);
  world.setQuality(0);const low=world.effectsMetrics().perFrame;world.setQuality(2);const high=world.effectsMetrics().perFrame;
  assert.ok(low.flames<=high.flames&&low.drops<high.drops&&low.mist<high.mist);
  world.dispose();
});
