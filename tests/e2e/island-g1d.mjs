import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.ISLAND_PLAYWRIGHT ? pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href : 'playwright');
const root = path.resolve(fileURLToPath(new URL('../../workout/island/', import.meta.url)));
const output = process.env.ISLAND_OUTPUT_DIR ? path.resolve(process.env.ISLAND_OUTPUT_DIR) : fileURLToPath(new URL('./screenshots/g1d/', import.meta.url));
await mkdir(output, { recursive: true });
const types = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.glb':'model/gltf-binary', '.svg':'image/svg+xml' };
const server = createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    assert.ok(pathname.startsWith('/workout/island/'));
    let filename = path.resolve(root, pathname.slice('/workout/island/'.length) || '.');
    assert.ok(filename === root || filename.startsWith(root + path.sep));
    if ((await stat(filename)).isDirectory()) filename = path.join(filename,'index.html');
    res.writeHead(200,{'content-type':types[path.extname(filename)] || 'application/octet-stream'}).end(await readFile(filename));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({executablePath:process.env.ISLAND_BROWSER,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports = [];
const baseline = process.env.ISLAND_G1D_BASELINE === '1';
try {
  for (const width of [360,390]) {
    const context = await browser.newContext({viewport:{width,height:844},hasTouch:true,deviceScaleFactor:1});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/workout/island/?dev=1`);
    await page.waitForFunction(() => window.__island?.view.avatar?.root);
    await page.evaluate(() => { const {engine,ui}=window.__island;engine.setAvatar({...engine.state.avatar,created:true});ui.closeModal(); });
    const performanceReport = await page.evaluate(() => {
      const {engine,view,ui}=window.__island;
      view.paused=true;
      engine.state.world={stage:2,size:24};
      const ids=['house','factory','farm','harbor','park','fireStation','waterTower','hospital','school','police','prison','soccer','tennis','basketball','pool','athletics','house','house','house','waterTower'];
      engine.state.buildings=ids.map((typeId,i)=>({id:`perf-${i}`,typeId,x:(i%5)*4,z:Math.floor(i/5)*5,level:typeId==='house'?4:3}));
      engine.state.tutorial.completed=true;ui.refresh();view.clearGhost();
      view.target.set(0,0,0);view.zoom=1;view.resize();
      const counts=[];
      for(const shadows of [false,true]) {
        view.renderer.shadowMap.enabled=shadows;
        view.renderer.render(view.scene,view.camera);
        const all={...view.renderer.info.render};
        const previous=view.scene.children.map(c=>[c,c.visible]);
        for(const child of view.scene.children)if(child!==view.buildingRoot&&!child.isLight)child.visible=false;
        view.renderer.render(view.scene,view.camera);
        counts.push({shadows,scene:all,buildings:{...view.renderer.info.render}});
        for(const [child,visible] of previous)child.visible=visible;
      }
      return {width:innerWidth,buildingCount:engine.state.buildings.length,counts,renderer:view.metrics().renderer};
    });
    reports.push(performanceReport);
    console.log(JSON.stringify(performanceReport));
    if (!baseline) {
      const before=JSON.parse(await readFile(new URL('./screenshots/g1d/baseline.json',import.meta.url),'utf8')).find(row=>row.width===width);
      for(let i=0;i<before.counts.length;i++) {
        assert.ok(performanceReport.counts[i].scene.calls<=before.counts[i].scene.calls*1.2,'20-building scene draw calls within +20%');
        assert.ok(performanceReport.counts[i].buildings.calls<=before.counts[i].buildings.calls*1.2);
      }
      performanceReport.game=await verifyGame(page,width,output);
    }
    assert.deepEqual(errors,[]);
    await context.close();
  }
  await writeFile(path.join(output,baseline?'baseline.json':'verification.json'),JSON.stringify(reports,null,2)+'\n');
} finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }

async function verifyGame(page,width,output) {
  const shot=async name=>page.screenshot({path:path.join(output,`${width}-${name}.png`)});
  const action=name=>page.locator(`[data-action="${name}"]`);
  async function parentGate() {
    const point=await action('parent').boundingBox();
    await page.mouse.move(point.x+point.width/2,point.y+point.height/2);
    await page.mouse.down();
    await page.waitForTimeout(await page.evaluate(()=>window.__island.data.config.ui.parentHoldMs+100));
    await page.mouse.up();
    await action('reset-game').waitFor();
  }
  assert.equal(await action('reset-game').count(),0,'reset is hidden outside parent gate');
  await action('parent').click();assert.equal(await action('reset-game').count(),0,'short click does not pass gate');
  await page.evaluate(async()=>{
    const {engine}=window.__island;engine.tick=()=>{};
    engine.setAvatar({...engine.state.avatar,created:true,shirtColor:'#f2ad59'});
    engine.save();
    for(const [key,value]of Object.entries({'kidfit.profile':'profile','kidfit.activeWorkout':'workout','site.foreign':'foreign','island.v1.corrupt.notes':'notes','island.other':'other'}))localStorage.setItem(key,value);
    localStorage.setItem('island.v1.corrupt.123','corrupt backup');
    await new Promise((resolve,reject)=>{const req=indexedDB.open('g1d-foreign',1);req.onupgradeneeded=()=>req.result.createObjectStore('foreign');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('foreign','readwrite');tx.objectStore('foreign').put('keep database','sentinel');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  });
  const original=await page.evaluate(()=>JSON.stringify(window.__island.engine.state));
  await parentGate();await action('reset-game').click();await shot('reset-warning');
  assert.equal(await page.locator('#reset-keep-avatar').isChecked(),true);
  const downloadEvent=page.waitForEvent('download');await action('reset-backup').click();
  const download=await downloadEvent;
  const backup=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(backup.buildings.length,20);assert.equal(backup.avatar.shirtColor,'#f2ad59');
  await action('reset-cancel').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__island.engine.state)),original);
  await action('reset-game').click();await action('reset-next').click();
  await page.locator('#reset-confirmation').fill('wrong');assert.equal(await action('reset-confirm').isDisabled(),true);
  await shot('reset-confirmation');await action('reset-cancel').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__island.engine.state)),original,'cancel at either stage preserves save');
  await action('reset-game').click();await action('reset-next').click();await page.locator('#reset-confirmation').fill('איפוס');
  await Promise.all([page.waitForNavigation(),action('reset-confirm').click()]);
  await page.waitForFunction(()=>window.__island?.view.avatar?.root);
  const fresh=await page.evaluate(()=>({state:window.__island.engine.state,keys:Object.fromEntries(Object.entries(localStorage))}));
  assert.equal(fresh.state.avatar.created,true);assert.equal(fresh.state.avatar.shirtColor,'#f2ad59');
  assert.equal(fresh.state.tutorial.step,0);assert.equal(fresh.state.tutorial.completed,false);assert.equal(fresh.state.tutorial.skipped,false);
  assert.ok(fresh.state.buildings.every(row=>row.typeId==='road'));
  assert.equal(fresh.keys['island.v1.corrupt.123'],undefined);
  for(const [key,value]of Object.entries({'kidfit.profile':'profile','kidfit.activeWorkout':'workout','site.foreign':'foreign','island.v1.corrupt.notes':'notes','island.other':'other'}))assert.equal(fresh.keys[key],value);
  await shot('reset-kept-avatar-tutorial');
  await parentGate();await action('reset-game').click();await page.locator('#reset-keep-avatar').uncheck();await action('reset-next').click();
  await page.locator('#reset-confirmation').fill('איפוס');
  await Promise.all([page.waitForNavigation(),action('reset-confirm').click()]);
  await page.waitForFunction(()=>window.__island?.ui);
  assert.equal(await page.evaluate(()=>window.__island.engine.state.avatar.created),false);
  await action('avatar-start').waitFor();await shot('reset-new-avatar');
  const foreign=await page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('g1d-foreign',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('foreign'),read=tx.objectStore('foreign').get('sentinel');read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();};}));
  assert.equal(foreign,'keep database','foreign IndexedDB survives both resets');
  await action('avatar-start').click();
  await page.waitForFunction(()=>window.__island.view.avatar?.root);
  const records=await page.evaluate(()=>window.__island.data.buildings.map(row=>({id:row.id,levels:row.levels.length})));
  const upgrades=[];
  for(const record of records) {
    await page.evaluate(id=>{
      const {engine,view,ui,data}=window.__island,type=engine.registry.buildings.get(id),stage=data.config.worldStages.length-1;
      engine.tick=()=>{};view.paused=true;view.renderer.shadowMap.enabled=false;
      engine.state.world={stage,size:data.config.worldStages[stage].size};engine.state.money=100000;
      engine.state.tutorial={step:0,completed:true,skipped:true};
      engine.state.buildings=[{id:'visual',typeId:id,x:4,z:4,level:1}];
      ui.closeInfo();ui.setDockOpen(false);ui.refresh();
      view.target.copy(view.worldPosition(4,4,type.footprint));view.target.y=(type.visual.height||1)*.45;
      const span=Math.max(...type.footprint, id==='house'?5.8:(type.visual.height||1)*1.5,3.5);
      view.zoom=1;view.resize();
      const aspect=innerWidth/innerHeight;view.camera.left=-span*.75;view.camera.right=span*.75;view.camera.top=span*.75/aspect;view.camera.bottom=-span*.75/aspect;view.camera.updateProjectionMatrix();view.updateCamera();
    },record.id);
    for(let level=1;level<=record.levels;level++) {
      if(level>1) {
        const before=await page.evaluate(()=>{const {view,ui}=window.__island;ui.showInfo('visual');window.__g1dOldGroup=view.groups.get('visual').group;return window.__island.engine.state.money;});
        assert.equal(await action('upgrade').isEnabled(),true,`${record.id} upgrade ${level}`);
        await action('upgrade').click();
        const result=await page.evaluate(()=>{const {engine,view}=window.__island;return {level:engine.state.buildings[0].level,money:engine.state.money,replaced:view.groups.get('visual').group!==window.__g1dOldGroup,saved:JSON.parse(localStorage.getItem('island.v1')).buildings[0].level};});
        assert.equal(result.level,level);assert.equal(result.saved,level);assert.ok(result.money<before);assert.equal(result.replaced,true);
        upgrades.push(`${record.id}:${level}`);
        await action('close-info').click();
      }
      await page.evaluate(()=>{
        const {view,engine,ui}=window.__island,type=engine.registry.buildings.get(engine.state.buildings[0].typeId),level=engine.state.buildings[0].level;
        view.target.y=(type.levels[level-1].visual.height||type.visual.height||1)*.45;view.updateCamera();view.renderer.render(view.scene,view.camera);
        document.querySelector('#toast').classList.remove('visible');
        // Keep the actual scene and HUD; show the level name for review after closing the info card.
        let caption=document.querySelector('#g1d-caption');if(!caption){caption=document.createElement('div');caption.id='g1d-caption';caption.style.cssText='position:fixed;top:165px;left:10px;right:10px;text-align:center;background:#fff4dc;padding:8px;border-radius:12px;pointer-events:none;font:700 16px sans-serif;z-index:5';document.body.append(caption);}
        caption.textContent=ui.t(type.title)+' · '+ui.t(type.levels[level-1].title||'app.level')+' · '+level;
      });
      await shot(`${record.id}-level-${level}`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
    }
  }
  return {reset:{backupExport:true,wrongConfirmationBlocked:true,cancelBothStages:true,keepAvatar:true,newAvatar:true,foreignLocalStorage:true,foreignIndexedDB:true},screenshots:records.reduce((sum,row)=>sum+row.levels,0)+4,upgrades};
}
