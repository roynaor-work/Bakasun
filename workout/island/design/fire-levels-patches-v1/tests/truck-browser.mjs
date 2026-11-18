import assert from 'node:assert/strict';
import {islandChromium,serveIsland} from '../../../../../tests/helpers/island-browser.mjs';

const chromium=await islandChromium(),server=await serveIsland();
const mesh='/assets/models/fire-truck-512.glb',pumper='/assets/fire-v7/models/engine-pumper.glb';
const hydrant='/assets/fire-v7/models/hydrant.glb';
const sample=()=>{const session=window.__island?.games.current?.session,s=session?.snapshot,m=s?.renderMetrics;
  return s&&{time:s.time,range:s.range,ready:session.ready??null,draws:m?.rendererDrawCalls??0,truck:m?.truck?.kind??null,pending:Boolean(m?.truck?.pending)};};
const isAsset=path=>url=>url.pathname.endsWith(path);
const waitForStreet=async(page,{pending=false,withModel=false}={})=>page.waitForFunction(({pending,withModel})=>{
  const s=window.__island?.games.current?.session?.snapshot,m=s?.renderMetrics;
  return pending?m?.truck?.pending:m?.rendererDrawCalls>0&&(!withModel||m.truck.loaded);
},{pending,withModel});
const hold=()=>{let open,seen;
  return {barrier:new Promise(resolve=>{open=resolve;}),requested:new Promise(resolve=>{seen=resolve;}),open,seen};};

async function check(browser,{name,query='',asset=mesh,fail=false,rollback=false}){
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  context.setDefaultTimeout(120_000);
  const page=await context.newPage(),requests=[],pageErrors=[];
  page.on('request',req=>requests.push(new URL(req.url()).pathname));
  page.on('pageerror',error=>pageErrors.push(error.message));
  const model=hold(),city=hold();
  try{
    await page.route(isAsset(asset),async route=>{model.seen();await model.barrier;return fail?route.abort():route.continue();});
    await page.route(isAsset(hydrant),async route=>{city.seen();await city.barrier;return route.continue();});
    await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;});
    await page.goto(server.url+'?dev=1&fireLevel=0'+query,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(window.__island?.games));
    await page.locator('[data-action=avatar-start]').tap();
    await page.evaluate(()=>{
      const {engine,data,games}=window.__island;engine.skipTutorial();engine.tick=()=>({ok:true});engine.state.money=5000;
      data.featureFlags.events=false;data.config.minigames.fireRescue.render.fallbackFrameMs=10_000;
      let placed=false;
      for(let z=0;z<engine.state.world.size&&!placed;z++)for(let x=0;x<engine.state.world.size&&!placed;x++)placed=engine.place('fireStation',x,z).ok;
      if(!placed)throw Error('Cannot place fire station fixture');
      games.start('fireRescue',undefined,1);
    });
    const understood=page.locator('[data-action=game-understood]');
    await Promise.race([understood.waitFor({timeout:10_000}),city.requested]);
    if(await understood.isVisible())await understood.tap();
    await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
    if(rollback){
      await waitForStreet(page);
      if(!requests.some(path=>path.endsWith(hydrant)))await page.waitForRequest(req=>isAsset(hydrant)(new URL(req.url())));
      assert.equal(requests.filter(path=>path.endsWith(asset)).length,0,'legacy truck waits for city GLBs');
      city.open();
    }
    if(!requests.some(path=>path.endsWith(asset)))await page.waitForRequest(req=>isAsset(asset)(new URL(req.url())));
    await waitForStreet(page,{pending:!rollback});
    const before=await page.evaluate(sample);
    assert.equal(before.truck,null);
    if(!rollback){
      assert.equal(before.time,0);
      assert.equal(before.draws,0);
      assert.equal(before.ready,false);
      if(!requests.some(path=>path.endsWith(hydrant)))await page.waitForRequest(req=>isAsset(hydrant)(new URL(req.url())));
    }
    assert.equal(before.range,rollback?270:210);
    assert.equal(requests.filter(path=>path.endsWith(asset)).length,1,'selected truck begins loading once');
    model.open();
    const chosen=fail?null:asset===pumper?'v7':'meshy';
    await waitForStreet(page,{withModel:!fail});
    const first=await page.evaluate(sample);
    assert.equal(first.truck,chosen);
    city.open();
    await page.waitForTimeout(3000);
    const after=await page.evaluate(sample);
    assert.equal(after.truck,chosen);
    assert.equal(after.range,rollback?270:210);
    const truckRequests=requests.filter(path=>path.endsWith(mesh)||path.endsWith(pumper));
    assert.equal(truckRequests.length,1);
    assert.deepEqual(pageErrors,[]);
    console.log(JSON.stringify({name,before,first,after,truckRequests}));
  }finally{
    model.open();city.open();
    await context.close();
  }
}

let browser;
try{
  browser=await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  });
  await check(browser,{name:'preload'});
  await check(browser,{name:'failure',fail:true});
  await check(browser,{name:'explicit-pumper',query:'&fireTruckModel=v20',asset:pumper});
  await check(browser,{name:'rollback',query:'&fireLevels=0',rollback:true});
}finally{
  await browser?.close();
  await server.close();
}
