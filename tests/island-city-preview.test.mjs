import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {previewState,previewPlan,layoutProblems,roadLines,PREVIEW_FOOTPRINT,PREVIEW_MODES} from '../workout/island/view/city-preview-layout.mjs';
import {previewMode,readOnlyStorage} from '../workout/island/ui/city-preview.mjs';
import {citySpec,cityModelPath,CityModels,LOD_DIR,CITY_DIR} from '../workout/island/view/city-models.mjs';
import {serveIsland,islandChromium} from './helpers/island-browser.mjs';

/** `?cityPreview=full|half|empty`: a made-up city drawn over the view, read only. Node part: layout, read-only
 * storage, flag parsing, light model copies. Browser part (ISLAND_CITY_PREVIEW_BROWSER=1): the saved game is
 * byte-identical before, during and after the preview, and the preview shows every building type. */
test('full layout has no overlaps, stays on the island and uses every mapped building', () => {
  const full=previewState('full');
  assert.deepEqual(layoutProblems(full.buildings),[]);
  const types=new Set(full.buildings.map(row=>row.typeId));
  for(const id of ['road','house','shop','factory','park','fireStation','waterTower','hospital','school','police','soccer','cityHall','library','mathLab','powerPlant'])assert.ok(types.has(id),`${id} is in the full city`);
  const levels=new Set(full.buildings.filter(row=>row.typeId==='house').map(row=>row.level));
  assert.deepEqual([...levels].sort(),[1,2,3,4],'every house level appears');
  assert.ok(full.buildings.length>500&&full.buildings.length<700,String(full.buildings.length));
});
test('half keeps every large building and about half of the small ones; empty is the seed road only', () => {
  const full=previewState('full').buildings,half=previewState('half').buildings,empty=previewState('empty').buildings;
  assert.ok(half.length<full.length*.8&&half.length>full.length*.5);
  assert.equal(half.filter(r=>r.large).length,full.filter(r=>r.large).length);
  assert.deepEqual(layoutProblems(half),[]);
  assert.equal(empty.length,9);assert.ok(empty.every(r=>r.typeId==='road'&&r.z===7));
  assert.deepEqual(PREVIEW_MODES,['full','half','empty']);
});
test('plan holds the props the request lists: downtown, trees, rocks, traffic lights, a bridge', () => {
  const plan=previewPlan(),models=new Set([...plan.props,...plan.trees,...plan.rocks,...plan.lights,plan.bridge].map(p=>p.model));
  for(const id of [13,15,16,41,42,44,45,53,55])assert.ok(models.has(id),`prop ${id}`);
  assert.equal(roadLines().length,5);
});
test('large buildings get larger preview footprints, never smaller than 1x1', () => {
  for(const [id,[w,d]] of Object.entries(PREVIEW_FOOTPRINT))assert.ok(w>=1&&d>=1&&Number.isInteger(w)&&Number.isInteger(d),id);
});
test('flag parsing: only the three modes, bare flag means full', () => {
  assert.equal(previewMode('?cityPreview=full'),'full');assert.equal(previewMode('?cityPreview=half'),'half');assert.equal(previewMode('?cityPreview=empty'),'empty');
  assert.equal(previewMode('?cityPreview'),'full');assert.equal(previewMode('?cityPreview=1'),'full');
  assert.equal(previewMode('?cityPreview=nope'),null);assert.equal(previewMode(''),null);
});
test('read-only storage passes reads through and drops every write', () => {
  const real=new Map([['island.v1','{"a":1}']]);
  const store=readOnlyStorage({getItem:k=>real.get(k)??null,setItem:(k,v)=>real.set(k,v),removeItem:k=>real.delete(k),key:i=>[...real.keys()][i]??null,get length(){return real.size;}});
  assert.equal(store.getItem('island.v1'),'{"a":1}');
  store.setItem('island.v1','changed');store.setItem('new','x');store.removeItem('island.v1');store.clear();
  assert.equal(real.get('island.v1'),'{"a":1}');assert.equal(real.size,1);
});
test('light model copies: same file names under lod/, used only when lod is on, full copy stands in until loaded', () => {
  assert.equal(cityModelPath(1),CITY_DIR+'01-small-house-red-roof.glb');assert.equal(cityModelPath(1,true),LOD_DIR+'01-small-house-red-roof.glb');
  const record={id:'house',footprint:[1,1]};
  assert.equal(citySpec(record,1,null,true).path,LOD_DIR+'01-small-house-red-roof.glb');
  assert.equal(citySpec({...record,footprintMargin:.5},1).fit.box.w,.5);
  const assets=new Map(),models={assets,load:async()=>true,has:()=>false};
  const city=new CityModels(models);
  assert.equal(city.spec(record,1).path,CITY_DIR+'01-small-house-red-roof.glb');
  city.lod=true;assert.equal(city.spec(record,1).path,LOD_DIR+'01-small-house-red-roof.glb');
  assets.set(CITY_DIR+'01-small-house-red-roof.glb',{});
  assert.equal(city.spec(record,1).path,CITY_DIR+'01-small-house-red-roof.glb','full copy keeps standing while the light one loads');
  assets.set(LOD_DIR+'01-small-house-red-roof.glb',{});assert.equal(city.spec(record,1).path,LOD_DIR+'01-small-house-red-roof.glb');
});
test('browser: the save is untouched by the preview', {skip:process.env.ISLAND_CITY_PREVIEW_BROWSER!=='1'}, async () => {
  const server=await serveIsland(),chromium=await islandChromium();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:844,height:390}}),page=await context.newPage(),probe=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await probe.goto(server.url+'release.json');
    const snap=async()=>{await page.goto('about:blank');return probe.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));};
    await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
    await page.evaluate(()=>window.__island.engine.save());
    const before=await snap();
    for(const mode of PREVIEW_MODES){
      await page.goto(server.url+`?dev=1&cityPreview=${mode}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__cityPreview);await page.waitForTimeout(3000);
      if(mode==='full'){
        assert.ok(await page.evaluate(()=>window.__cityPreview.count)>500);
        await page.click('[data-mode=half]');await page.click('[data-mode=empty]');await page.click('[data-mode=full]');await page.click('[data-tour]');await page.click('[data-photo]');
        assert.equal(await page.evaluate(()=>'cityPhoto' in document.documentElement.dataset),true);
      }
      assert.deepEqual(await snap(),before,`save unchanged after ${mode}`);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await server.close();}
});
