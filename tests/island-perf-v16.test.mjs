import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {qualityOverride,staticTier,fpsVerdict,startFpsProbe,LOW_FPS} from '../workout/island/ui/device-tier.mjs';
import {downloadSet} from '../workout/island/ui/offline.mjs';
import {RESCUE_GAMES,loadState,loadActivity} from '../workout/island/ui/load-rescue.mjs';

test('device tier: ?quality override, facts and frame-rate verdict',()=>{
  assert.equal(qualityOverride('?quality=low'),'low');
  assert.equal(qualityOverride('?dev=1&quality=high'),'high');
  assert.equal(qualityOverride('?quality=ultra'),null);
  assert.equal(staticTier({memory:2,cores:8,saveData:false}),'low');
  assert.equal(staticTier({memory:8,cores:2,saveData:false}),'low');
  assert.equal(staticTier({memory:8,cores:8,saveData:true}),'low');
  assert.equal(staticTier({memory:4,cores:8,saveData:false}),'mid');
  assert.equal(staticTier({memory:8,cores:8,saveData:false}),'high');
  assert.equal(staticTier({memory:undefined,cores:undefined,saveData:false}),'mid','iOS gives no facts: not assumed weak');
  assert.equal(fpsVerdict(Array(10).fill(16)),null,'too few frames to judge');
  assert.equal(fpsVerdict(Array(60).fill(16.7)).tier,'ok');
  assert.equal(fpsVerdict(Array(60).fill(50)).tier,'low');
  assert.ok(fpsVerdict(Array(60).fill(1000/(LOW_FPS-1))).tier==='low'&&fpsVerdict(Array(60).fill(1000/(LOW_FPS+1))).tier==='ok');
});

test('fps probe waits while a game is busy and judges only city frames',()=>{
  let t=0,busy=true;const cbs=[];const raf=cb=>cbs.push(cb);let verdict='none';
  startFpsProbe({busy:()=>busy,raf,now:()=>t,duration:1700,onDone:v=>{verdict=v;}});
  const run=(n,gap)=>{for(let i=0;i<n;i++){t+=gap;const cb=cbs.shift();cb(t);}};
  run(50,100);assert.equal(verdict,'none','busy frames are not counted');
  busy=false;run(35,50);assert.equal(verdict.tier,'low');
});

test('download gate: no file starts while a game runs, files resume after, concurrency 1 keeps order',async()=>{
  const started=[];let running=true;const store=new Map();
  const cache={match:async h=>store.get(h),put:async(h,r)=>{store.set(h,r);}};
  const fetcher=async href=>{started.push(href);return new Response('x',{status:200,headers:{'content-type':'image/png'}});};
  const urls=['http://x/a.png','http://x/b.png','http://x/c.png'];
  let waits=0;const wait=async()=>{waits++;if(waits===3)running=false;};
  const result=await downloadSet({urls,cache,fetcher,concurrency:1,gate:async()=>!running,wait});
  assert.equal(result.failed.length,0);
  assert.deepEqual(started,urls);
  assert.ok(waits>=3,'it waited while the game was running');
});

test('rescue: every island game has the stuck button; a session without async work is ready',async()=>{
  const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url)));
  for(const id of Object.keys(config.minigames).filter(k=>config.minigames[k]?.requiresBuilding||['islandRacing','tennis','soccer','streetSlam','alpineRush','navalDuel','fireRescue','alienDefense','boarDefense','catchCriminal'].includes(k)))assert.ok(RESCUE_GAMES[id],id);
  assert.equal(loadState({ready:false}),'loading');
  assert.equal(loadState({ready:true}),'ready');
  assert.equal(loadState({loadFailed:'x',ready:false}),'failed');
  assert.equal(loadState({snapshot:{score:1}}),'ready','no render metrics key = plain canvas');
  assert.equal(loadState({snapshot:{renderMetrics:{calls:0,triangles:0}}}),'loading');
  assert.equal(loadState({snapshot:{renderMetrics:{drawCalls:12}}}),'ready');
  const a=loadActivity(100,[{startTime:50,name:'http://x/old.glb',encodedBodySize:9e6},{startTime:200,name:'http://x/a.glb',encodedBodySize:1048576},{startTime:300,name:'http://x/b.webp?v=1',encodedBodySize:1048576},{startTime:300,name:'http://x/page.html',encodedBodySize:5}]);
  assert.deepEqual(a,{files:2,mb:2});
});

test('heavy features have off switches and a weak-device path',async()=>{
  const view=await readFile(new URL('../workout/island/minigames/racing-view.mjs',import.meta.url),'utf8');
  assert.match(view,/racingFormulaCar/);assert.match(view,/FORMULA_CARS=3/);assert.match(view,/!lite/);
  const city=await readFile(new URL('../workout/island/view/island-view.mjs',import.meta.url),'utf8');
  assert.match(city,/isLowQuality\(\)/);assert.match(city,/qualityOverride\(\)!=='high'/);
  const act=await readFile(new URL('../workout/island/ui/activity.mjs',import.meta.url),'utf8');
  assert.match(act,/rescue\.lite\|\|isLowQuality\(\)/);
});
