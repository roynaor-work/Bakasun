import assert from 'node:assert/strict';
import test from 'node:test';
import {browserCleanup,serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

// Opt-in browser integration under the real island CSP (static Draco worker, no blob workers), run separately from the node tests:
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chrome node --test tests/island-tennis-v7-browser.test.mjs
// Covers the default (v7 on, both phone orientations), ?tennisV7=0, a blocked v7 folder (silent fallback), one court surface per stage
// (lazy) and the crowd governor. Software WebGL: it proves the wiring and the fallback, not a phone's speed.
test('tennis v7 in the browser: default, kill switch, blocked files fall back silently, lazy surface, crowd governor',
  {skip:process.env.ISLAND_CSP_BROWSER!=='1',timeout:900000},async t=>{
  const defer=browserCleanup(t);
  const chromium=await islandChromium(),server=await serveIsland();
  defer(()=>server.close());
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-certificate-errors']});
  defer(()=>browser.close());
  const rows=[];
  defer(()=>console.log(JSON.stringify(rows)));
  async function scenario(name,query,{viewport={width:844,height:390},block=null,after=null}={}){
    const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
    let csp;
    try{
      csp=await installIslandCspMonitor(context);
      const page=await context.newPage();await csp.attachPage(page);
      const errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      page.on('request',r=>requests.push(new URL(r.url()).pathname.replace(/^.*\/island\//,'')));
      let blocked=0;
      if(block)await page.route(block,route=>{blocked++;return route.fulfill({status:404,body:'blocked by the test'});});
      await page.goto(`${server.url}tools/perf-tennis.html?dur=3600&${query}`,{waitUntil:'load'});
      await page.waitForFunction(()=>window.__tennis||window.__perf?.error);
      assert.ok(await page.evaluate(()=>Boolean(window.__tennis)),name+': the view was created (a v7 failure must never stop the game)');
      const before=await page.evaluate(()=>window.__tennis.view.metrics().frames);
      await page.waitForFunction(before=>{
        const metrics=window.__tennis.view.metrics();
        return metrics.frames>before&&metrics.triangles>0;
      },before,{timeout:120000});
      const metrics=await page.evaluate(()=>window.__tennis.view.metrics());
      assert.ok(metrics.frames>before,name+': frames keep rendering');
      const extra=after?await after(page):null;
      if(block)assert.ok(blocked>0,name+': the requested fixture was blocked');
      await csp.assertClean();
      const v7Requests=requests.filter(p=>p.startsWith('assets/tennis-v7/')),designRequests=requests.filter(p=>p.startsWith('design/tennis-v7/'));
      assert.deepEqual(designRequests,[],name+': nothing is read from design/tennis-v7');
      assert.deepEqual(errors.filter(e=>!/404/.test(e)),[],name+': no page errors');
      const row={name,viewport:`${viewport.width}x${viewport.height}`,metrics:{tennisV7:metrics.tennisV7,surface:metrics.surface??null,crowd:metrics.crowd,crowdLevel:metrics.crowdLevel??null,crowdDrawn:metrics.crowdDrawn??null,standsInView:metrics.standsInView??null,triangles:metrics.triangles,drawCalls:metrics.drawCalls,v7Fallbacks:metrics.v7Fallbacks,loadedModels:metrics.loadedModels},v7Requests,extra,oldAssets:requests.filter(p=>/assets\/models\/(adult|palm)/.test(p))};
      rows.push(row);
      return {metrics,v7Requests,requests,errors,extra};
    }finally{
      try{await csp?.dispose();}finally{await context.close();}
    }
  }
    for(const viewport of [{width:844,height:390},{width:390,height:844}]){
     await t.test(`default ${viewport.width}x${viewport.height}`,async()=>{
      const a=await scenario('default',`tennisV7=1`,{viewport});
      assert.equal(a.metrics.tennisV7,true);assert.equal(a.metrics.surface,'clay');assert.equal(a.metrics.crowd,480);assert.deepEqual(a.metrics.v7Fallbacks,[]);
      if(viewport.width>viewport.height)assert.equal(a.metrics.crowdDrawn,480,'landscape: every stand is in view');
      else assert.ok(a.metrics.standsInView<3&&a.metrics.crowdDrawn<480&&a.metrics.crowdDrawn>0,`portrait: the side stands are outside the camera and are not drawn (${a.metrics.standsInView} stands, ${a.metrics.crowdDrawn} spectators)`);
      assert.deepEqual(a.v7Requests.map(p=>p.replace(/\?.*$/,'')).sort(),['assets/tennis-v7/ball.glb','assets/tennis-v7/court-clay.glb','assets/tennis-v7/crew.glb','assets/tennis-v7/crowd-prototypes.glb','assets/tennis-v7/crowd.json','assets/tennis-v7/net.glb','assets/tennis-v7/venue.glb'],'only the chosen surface and the shared files are requested (lazy)');
      assert.deepEqual(a.requests.filter(p=>/assets\/models\/(adult|palm)/.test(p)),[],'v7 on: the previous crowd and palm models are not downloaded');
      assert.ok(a.metrics.triangles<=tennis90k,'inside the configured triangle budget: '+a.metrics.triangles);
     });
    }
    await t.test('kill switch and silent fallbacks',async()=>{
    const off=await scenario('kill-switch','tennisV7=0');
    assert.equal(off.metrics.tennisV7,false);assert.equal(off.metrics.crowd,144);assert.deepEqual(off.v7Requests,[],'?tennisV7=0 requests no v7 file');
    const blocked=await scenario('blocked','tennisV7=1',{block:'**/assets/tennis-v7/**'});
    assert.equal(blocked.metrics.tennisV7,false);assert.deepEqual(blocked.metrics.v7Fallbacks,['tennis v7 venue']);assert.equal(blocked.metrics.crowd,144,'the previous crowd is back');assert.ok(blocked.metrics.triangles>0);
    const bad=await scenario('missing-court','tennisV7=1',{block:'**/assets/tennis-v7/court-clay.glb*'});
    assert.equal(bad.metrics.tennisV7,false,'one missing file keeps the whole previous venue (nothing half built)');assert.equal(bad.metrics.crowd,144);
    });
    await t.test('lazy court surfaces and crowd governor',async()=>{
    const grass=await scenario('stage-25','tennisV7=1&stage=25');
    assert.equal(grass.metrics.surface,'grass');assert.ok(grass.v7Requests.some(p=>p.includes('court-grass'))&&!grass.v7Requests.some(p=>p.includes('court-clay')||p.includes('court-hard')),'only the grass court is requested');
    const pinned=await scenario('surface-pin','tennisV7=1&tennisSurface=hard');assert.equal(pinned.metrics.surface,'hard');
    const governor=await scenario('governor','tennisV7=1&slowMs=100000&adapt=0',{after:async page=>page.evaluate(()=>{
      const {view}=window.__tennis,seen=[view.metrics().crowdLevel];
      for(let i=0;i<400;i++){view.observeFrame(40);const l=view.metrics().crowdLevel;if(l!==seen.at(-1))seen.push(l);}
      return {seen,crowd:view.metrics().crowd,quality:view.metrics().quality};
    })});
    assert.deepEqual(governor.extra.seen,[2,1,0],'slow frames step the crowd 2 -> 1 -> 0');assert.equal(governor.extra.crowd,320);assert.equal(governor.extra.quality,0,'the view tier stayed put (its own threshold was out of the way)');
    const tier=await scenario('tier-2','tennisV7=1&quality=2');assert.equal(tier.metrics.crowd,0,'the lowest tier has no crowd, as before');assert.equal(tier.metrics.tennisV7,true);
    });
});
const tennis90k=90000;
