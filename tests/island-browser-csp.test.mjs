import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,readIslandCsp,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

test('island server sends the exact shipped CSP on index, tools and viewer HTML',async()=>{
  const server=await serveIsland();
  try {
    const source=await readFile(new URL('../workout/island/index.html',import.meta.url),'utf8');
    const original=source.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
    assert.ok(original,'The production index must declare its policy');
    assert.equal(await readIslandCsp(),original);
    for(const page of ['', 'tools/perf-alpine.html', 'tools/perf-hoops.html', 'design/viewer/viewer.html']){
      const response=await fetch(server.url+page);
      assert.equal(response.status,200,page);
      assert.equal(response.headers.get('content-security-policy'),original,page);
      await response.arrayBuffer();
    }
  }finally{await server.close();}
});

// Opt-in browser integration, run separately from Node-only CI/unit tests:
// ISLAND_CSP_BROWSER=1 node --test tests/island-browser-csp.test.mjs
test('actual island CSP blocks inline/blob workers, monitors frames/report-only and permits static Draco',
  {skip:process.env.ISLAND_CSP_BROWSER!=='1',timeout:420000},async()=>{
  const server=await serveIsland(),chromium=await islandChromium();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const reports=[];
  async function fixture(name,{body='',reportOnly=null,omitPolicy=false,contextOptions={}}={}){
    const context=await browser.newContext(contextOptions);
    const csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
    const headers={'content-type':'text/html',...(omitPolicy?{}:{'content-security-policy':server.csp}),...(reportOnly?{'content-security-policy-report-only':reportOnly}:{})};
    await page.route('**/tools/csp-fixture.html',route=>route.fulfill({headers,body:`<!doctype html><html><head></head><body>${body}</body></html>`}));
    await page.goto(server.url+'tools/csp-fixture.html');
    return {context,page,csp,async close(){await context.close();reports.push({name,...csp.snapshot()});await csp.dispose();}};
  }
  try {
    const blankContext=await browser.newContext(),blankCsp=await installIslandCspMonitor(blankContext),blankPage=await blankContext.newPage();
    await blankCsp.attachPage(blankPage);
    try{
      await blankPage.setContent('<!doctype html><p>No production response loaded</p>');
      await assert.rejects(()=>blankCsp.assertClean(),/No HTML response audited/);
      assert.equal(blankCsp.snapshot().htmlResponsesSeen,0);
    }finally{await blankContext.close();reports.push({name:'blank-unprotected-harness-is-failure',...blankCsp.snapshot()});await blankCsp.dispose();}

    const inline=await fixture('blocked-inline');
    try{
      assert.equal(await inline.page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.__islandInlineRan=true';document.head.append(script);return !!window.__islandInlineRan;}),false);
      await assert.rejects(()=>inline.csp.assertClean(),/Island CSP audit failed/);
      assert.ok(inline.csp.violations.some(v=>v.kind==='event'&&v.blockedURI==='inline'&&v.disposition==='enforce'));
    }finally{await inline.close();}

    const blob=await fixture('blocked-blob-worker');
    try{
      const executed=await blob.page.evaluate(async()=>{
        const url=URL.createObjectURL(new Blob(["postMessage('ran')"],{type:'application/javascript'}));let worker;
        try{return await new Promise(resolve=>{try{worker=new Worker(url);worker.onmessage=()=>resolve(true);worker.onerror=()=>resolve(false);setTimeout(()=>resolve(false),1000);}catch{resolve(false);}});}
        finally{worker?.terminate();URL.revokeObjectURL(url);}
      });
      assert.equal(executed,false);
      await assert.rejects(()=>blob.csp.assertClean(),/Island CSP audit failed/);
      assert.ok(blob.csp.violations.some(v=>v.kind==='event'&&v.effectiveDirective==='worker-src'&&v.blockedURI.startsWith('blob')));
    }finally{await blob.close();}

    const workerStartup=await fixture('blocked-worker-startup-eval');
    try{
      await workerStartup.page.route('**/tools/csp-startup-worker.js',route=>route.fulfill({headers:{'content-type':'text/javascript','content-security-policy':server.csp},
        body:"let blocked=false;try{eval('self.__startupEvalRan=true')}catch(error){blocked=true}postMessage({blocked,executed:!!self.__startupEvalRan});"}));
      const startup=await workerStartup.page.evaluate(url=>new Promise((resolve,reject)=>{
        const worker=window.__cspStartupWorker=new Worker(url);worker.onmessage=event=>resolve(event.data);worker.onerror=event=>reject(Error(event.message));
      }),server.url+'tools/csp-startup-worker.js');
      assert.deepEqual(startup,{blocked:true,executed:false});
      await assert.rejects(()=>workerStartup.csp.assertClean(),/Island CSP audit failed/);
      assert.ok(workerStartup.csp.violations.length>0,'Worker startup policy violations cannot be silently lost before its hook');
      await workerStartup.page.evaluate(()=>window.__cspStartupWorker.terminate());
    }finally{await workerStartup.close();}

    const frame=await fixture('blocked-child-frame-inline');
    try{
      await frame.page.route('**/tools/csp-child.html',route=>route.fulfill({headers:{'content-type':'text/html','content-security-policy':server.csp},body:'<!doctype html><script>window.__childInlineRan=true</script>'}));
      await frame.page.evaluate(url=>new Promise(resolve=>{const child=document.createElement('iframe');child.onload=resolve;child.src=url;document.body.append(child);}),server.url+'tools/csp-child.html');
      await assert.rejects(()=>frame.csp.assertClean(),/Island CSP audit failed/);
      assert.ok(frame.csp.violations.some(v=>v.kind==='event'&&v.frameUrl?.endsWith('/csp-child.html')&&v.blockedURI==='inline'));
    }finally{await frame.close();}

    const reportOnly=await fixture('report-only-is-failure',{reportOnly:"script-src 'none'"});
    try{
      await reportOnly.page.route('**/tools/csp-probe.js',route=>route.fulfill({contentType:'text/javascript',body:'window.__reportOnlyScriptRan=true;'}));
      await reportOnly.page.evaluate(url=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.onload=resolve;script.onerror=reject;script.src=url;document.head.append(script);}),server.url+'tools/csp-probe.js');
      assert.equal(await reportOnly.page.evaluate(()=>window.__reportOnlyScriptRan),true,'Report-only did not enforce blocking');
      await assert.rejects(()=>reportOnly.csp.assertClean(),/Island CSP audit failed/);
      assert.ok(reportOnly.csp.violations.some(v=>v.kind==='event'&&v.disposition==='report'));
    }finally{await reportOnly.close();}

    const omitted=await fixture('different-harness-policy-is-failure',{omitPolicy:true});
    try{
      await assert.rejects(()=>omitted.csp.assertClean(),/HTML response omitted the shipped CSP header/);
      assert.equal(omitted.csp.violations.length,0);
      assert.equal(omitted.csp.policyErrors.length,1);
    }finally{await omitted.close();}

    const staticWorker=await fixture('static-alpine-draco');
    try{
      const result=await staticWorker.page.evaluate(async()=>{
        const [{AlpineDracoLoader},{GLTFLoader}]=await Promise.all([import('../minigames/alpine-draco.mjs'),import('../vendor/GLTFLoader.js')]);
        const draco=new AlpineDracoLoader().setDecoderPath(new URL('../vendor/draco/',location.href).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(1);
        let gltf;
        try{
          gltf=await new GLTFLoader().setDRACOLoader(draco).loadAsync(new URL('../design/characters/skier.glb',location.href).href);
          let meshes=0,triangles=0,bones=0;gltf.scene.traverse(node=>{if(node.isSkinnedMesh){meshes++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;bones=node.skeleton.bones.length;}});
          return {meshes,triangles,bones,workerUrls:draco.workerPool.map(worker=>worker._alpineFailure?.message||draco.workerSourceURL)};
        }finally{gltf?.scene.traverse(node=>{node.geometry?.dispose();node.material?.dispose();node.skeleton?.dispose();});draco.dispose();}
      });
      assert.deepEqual({...result,workerUrls:undefined},{meshes:1,triangles:1920,bones:20,workerUrls:undefined});
      assert.equal(result.workerUrls.length,1);
      assert.ok(result.workerUrls.every(url=>url.endsWith('/minigames/alpine-draco-worker.mjs')));
      await staticWorker.csp.assertClean();
    }finally{await staticWorker.close();await staticWorker.csp.assertClean();}

    // Use the actual shipped tool HTML, its external module, the complete game
    // session and the server's production CSP header. This catches UI/loading
    // regressions that an isolated successful GLB decode cannot detect.
    const alpine=await fixture('alpine-session-start',{contextOptions:{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      await alpine.page.goto(server.url+'tools/perf-alpine.html?autostart=1&seconds=30',{waitUntil:'load'});
      await alpine.page.waitForFunction(()=>window.__perfSession?.snapshot.loaded||window.__perfSession?.snapshot.error,null,{timeout:90000});
      const loaded=await alpine.page.evaluate(()=>({loaded:window.__perfSession.snapshot.loaded,error:window.__perfSession.snapshot.error,metrics:window.__perfSession.snapshot.renderMetrics}));
      assert.equal(loaded.error,null);assert.equal(loaded.loaded,true);
      assert.equal(await alpine.page.locator('[data-action=alpine-start]').isEnabled(),true,'The real game start button must become enabled');
      await alpine.page.waitForFunction(()=>['countdown','racing'].includes(window.__perfSession?.snapshot.phase),null,{timeout:20000});
      const phase=await alpine.page.evaluate(()=>window.__perfSession.snapshot.phase);
      assert.ok(['countdown','racing'].includes(phase));assert.equal(loaded.metrics.mode,'model');
      // alpine-v7 is the default rider (05/11): LOD0 for the player under the production CSP; skier3 (the ?alpineV7=0 fallback) is checked in island-alpine-v7.test.mjs.
      // Either asset's clips become 10 game states (idle/glide/tuck/air/pole_push/fall/recover/getup/land/celebrate).
      assert.equal(loaded.metrics.character.mode,'v7');assert.equal(loaded.metrics.character.bones,18);
      assert.equal(loaded.metrics.character.clips,10);assert.equal(loaded.metrics.character.trianglesPerRider,19916);
      await alpine.csp.assertClean();
      reports.push({name:'alpine-session-start-result',phase,...loaded});
      await alpine.page.evaluate(()=>window.__perfSession.dispose());
      await alpine.csp.assertClean();
    }finally{await alpine.close();await alpine.csp.assertClean();}

    // Basketball v4 (02/11, GPT/Codex hoops-v4 package): the real perf page, the whole game session and the
    // production CSP. First the five position bodies and the 3D-crowd venue must load from the static Draco worker
    // with no external request; then the same page with every v4 file blocked must silently fall back to the v3
    // bodies and the v3 venue (sprite crowd) and still start.
    // v5 (04/11) is the default venue now, so the v4 checks pin it off with ?hoopsV5=0 and v5 has its own checks below
    const hoopsBase='tools/perf-hoops.html?dev=1&dur=3600&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick&seed=4242&hoopsV7=0&hoopsV8=0&hoopsTall=0',hoopsUrl=hoopsBase+'&hoopsV5=0';
    // v7 (05/11) is the default body set now: the v4/v5 checks pin it off with ?hoopsV7=0 and v7 has its own checks after the v5 ones
    const hoopsV7Base=hoopsBase.replace('&hoopsV7=0','');
    const hoopsReady=page=>page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||(s.renderMetrics?.calls>0&&s.stepsRun>10));},null,{timeout:120000}).then(()=>page.evaluate(()=>({error:window.__session.snapshot.error,m:window.__session.snapshot.renderMetrics})));
    const hoops=await fixture('hoops-v4-session-start',{contextOptions:{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      const requests=[];hoops.page.on('request',r=>requests.push(r.url()));
      await hoops.page.goto(server.url+hoopsUrl,{waitUntil:'load'});
      const live=await hoopsReady(hoops.page);
      assert.equal(live.error,null);assert.equal(live.m.characterVersion,4);assert.deepEqual(live.m.v4Fallbacks,[]);assert.equal(live.m.crowd3d,true);assert.ok(live.m.arenaSource.endsWith('lod-v4/hoops-v4-arena-lod.glb'));
      assert.ok(requests.every(u=>u.startsWith(server.url)||/^(data|blob):/.test(u)),'no request leaves the island origin');
      for(const role of ['pg','sg','sf','pf','c'])assert.ok(requests.some(u=>u.includes(`lod-v4/hoops-v4-${role}-lod.glb`)),role+' body requested');
      assert.ok(requests.some(u=>u.includes('lod-v4/hoops-v4-arena-lod.glb')));
      assert.ok(!requests.some(u=>/design\/hoops\/lod\/hoops-(guard|wing|forward|big)-lod/.test(u)),'the v3 bodies are not downloaded when v4 loads');
      await hoops.csp.assertClean();reports.push({name:'hoops-v4-session-start-result',...live.m,loadTimes:undefined});
    }finally{await hoops.close();await hoops.csp.assertClean();}
    const fallback=await fixture('hoops-v4-fallback',{contextOptions:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      await fallback.page.route(/design\/hoops\/lod-v4\//,route=>route.abort());
      await fallback.page.goto(server.url+hoopsUrl,{waitUntil:'load'});
      const live=await hoopsReady(fallback.page);
      assert.equal(live.error,null,'a missing v4 asset never stops the game');assert.equal(live.m.characterVersion,1);assert.deepEqual([...live.m.v4Fallbacks].sort(),['arena','players']);
      assert.equal(live.m.crowd3d,false);assert.ok(live.m.crowd>0,'the v3 sprite crowd is back');assert.ok(live.m.arenaSource.endsWith('models2/basketball-arena.glb'));
      await fallback.csp.assertClean();reports.push({name:'hoops-v4-fallback-result',...live.m,loadTimes:undefined});
    }finally{await fallback.close();await fallback.csp.assertClean();}

    // Basketball v7 (05/11, GPT hoops-v7 characters): five bodies from assets/hoops-v7 under the production CSP; then the
    // bodies blocked: the game silently falls back to the v4 bodies.
    const v7=await fixture('hoops-v7-session-start',{contextOptions:{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      const requests=[];v7.page.on('request',r=>requests.push(r.url()));
      await v7.page.goto(server.url+hoopsV7Base,{waitUntil:'load'});
      const live=await hoopsReady(v7.page);
      assert.equal(live.error,null);assert.equal(live.m.characterVersion,7);assert.deepEqual(live.m.v4Fallbacks,[]);
      assert.ok(requests.every(u=>u.startsWith(server.url)||/^(data|blob):/.test(u)),'no request leaves the island origin');
      for(const role of ['pg','sg','sf','pf','c'])assert.ok(requests.some(u=>u.includes(`assets/hoops-v7/${role}.glb`)),role+' body requested');
      assert.ok(!requests.some(u=>u.includes('design/hoops-v7/')),'the unpublished review pack is never requested');
      assert.ok(!requests.some(u=>u.includes('lod-v4/hoops-v4-pg-lod.glb')),'the v4 bodies are not downloaded when v7 loads');
      await v7.csp.assertClean();reports.push({name:'hoops-v7-session-start-result',...live.m,loadTimes:undefined});
    }finally{await v7.close();await v7.csp.assertClean();}
    const v7fallback=await fixture('hoops-v7-fallback-v4',{contextOptions:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      await v7fallback.page.route(/assets\/hoops-v7\//,route=>route.abort());
      await v7fallback.page.goto(server.url+hoopsV7Base,{waitUntil:'load'});
      const live=await hoopsReady(v7fallback.page);
      assert.equal(live.error,null,'a missing v7 asset never stops the game');assert.equal(live.m.characterVersion,4);assert.ok(live.m.v4Fallbacks.includes('players-v7'));
      await v7fallback.csp.assertClean();reports.push({name:'hoops-v7-fallback-v4-result',...live.m,loadTimes:undefined});
    }finally{await v7fallback.close();await v7fallback.csp.assertClean();}

    // Basketball v5 (04/11, GPT/Codex hoops-v5 package): the new arena with the animated crowd under the production CSP;
    // then v5 files blocked (falls back to the v4 venue, bodies untouched) and v5 + v4 blocked (all the way to v3).
    const v5=await fixture('hoops-v5-session-start',{contextOptions:{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      const requests=[];v5.page.on('request',r=>requests.push(r.url()));
      await v5.page.goto(server.url+hoopsBase,{waitUntil:'load'});
      const live=await hoopsReady(v5.page);
      assert.equal(live.error,null);assert.equal(live.m.v5,true);assert.deepEqual(live.m.v4Fallbacks,[]);assert.equal(live.m.crowd3d,true);assert.equal(live.m.crowd,2762,'every spectator at quality 2');assert.equal(live.m.crowdLevel,2);
      assert.ok(live.m.arenaSource.endsWith('design/hoops-v5/models/'));assert.equal(live.m.characterVersion,4,'the v4 bodies still play on the v5 floor');
      assert.ok(requests.every(u=>u.startsWith(server.url)||/^(data|blob):/.test(u)),'no request leaves the island origin');
      for(const file of ['arena','court','hoops','crowd','ball'])assert.ok(requests.some(u=>u.includes(`design/hoops-v5/models/${file}.glb`)),file+' requested');
      assert.ok(!requests.some(u=>u.includes('design/hoops-v5/models/uniforms.glb')),'the preview-only jerseys are not downloaded');
      assert.ok(!requests.some(u=>u.includes('lod-v4/hoops-v4-arena-lod.glb')),'the v4 venue is not downloaded when v5 loads');
      await v5.csp.assertClean();reports.push({name:'hoops-v5-session-start-result',...live.m,loadTimes:undefined});
    }finally{await v5.close();await v5.csp.assertClean();}
    const v5fallback=await fixture('hoops-v5-fallback-v4',{contextOptions:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      await v5fallback.page.route(/design\/hoops-v5\/models\//,route=>route.abort());
      await v5fallback.page.goto(server.url+hoopsBase,{waitUntil:'load'});
      const live=await hoopsReady(v5fallback.page);
      assert.equal(live.error,null,'a missing v5 asset never stops the game');assert.equal(live.m.v5,false);assert.deepEqual(live.m.v4Fallbacks,['v5 arena']);
      assert.equal(live.m.characterVersion,4);assert.equal(live.m.crowd3d,true);assert.ok(live.m.arenaSource.endsWith('lod-v4/hoops-v4-arena-lod.glb'),'the v4 venue is back');
      await v5fallback.csp.assertClean();reports.push({name:'hoops-v5-fallback-v4-result',...live.m,loadTimes:undefined});
    }finally{await v5fallback.close();await v5fallback.csp.assertClean();}
    const v5v3=await fixture('hoops-v5-fallback-v3',{contextOptions:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      await v5v3.page.route(/design\/hoops-v5\/models\/|design\/hoops\/lod-v4\//,route=>route.abort());
      await v5v3.page.goto(server.url+hoopsBase,{waitUntil:'load'});
      const live=await hoopsReady(v5v3.page);
      assert.equal(live.error,null);assert.equal(live.m.characterVersion,1);assert.deepEqual([...live.m.v4Fallbacks].sort(),['arena','players','v5 arena']);
      assert.equal(live.m.crowd3d,false);assert.ok(live.m.crowd>0,'the v3 sprite crowd is back');assert.ok(live.m.arenaSource.endsWith('models2/basketball-arena.glb'));
      await v5v3.csp.assertClean();reports.push({name:'hoops-v5-fallback-v3-result',...live.m,loadTimes:undefined});
    }finally{await v5v3.close();await v5v3.csp.assertClean();}
    // Basketball v8 (06/11, GPT hoops-arena-v8 + hoops-motion-v8): the hall and the authored passes under the production CSP, nothing from design/;
    // then the hall blocked (falls back to v5) and the motion pack blocked (v7 arm-IK passes, the hall stays).
    const v8Base='tools/perf-hoops.html?dev=1&dur=3600&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick&seed=4242&hoopsTall=0';
    const v8=await fixture('hoops-v8-session-start',{contextOptions:{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      const requests=[];v8.page.on('request',r=>requests.push(r.url()));
      await v8.page.goto(server.url+v8Base,{waitUntil:'load'});
      const live=await hoopsReady(v8.page);
      assert.equal(live.error,null);assert.equal(live.m.v8,true);assert.equal(live.m.v8Motion,true);assert.deepEqual(live.m.v4Fallbacks,[]);assert.equal(live.m.v5,false);
      assert.ok(live.m.crowd>0&&live.m.crowd<=2084);assert.equal(live.m.characterVersion,7);
      assert.ok(requests.some(u=>u.includes('assets/hoops-v8/arena/arena-lod0.glb')));assert.ok(requests.some(u=>u.includes('assets/hoops-v8/motion.json')));
      assert.ok(!requests.some(u=>/\/design\/hoops-(arena|motion)-v8\//.test(u)),'nothing is read from the unpublished design folder');
      assert.ok(!requests.some(u=>u.includes('design/hoops-v5/models/')),'the v5 venue is not downloaded when v8 loads');
      await v8.csp.assertClean();reports.push({name:'hoops-v8-session-start-result',...live.m,loadTimes:undefined});
    }finally{await v8.close();await v8.csp.assertClean();}
    const v8hall=await fixture('hoops-v8-fallback-v5',{contextOptions:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      await v8hall.page.route(/assets\/hoops-v8\/arena\//,route=>route.abort());
      await v8hall.page.goto(server.url+v8Base,{waitUntil:'load'});
      const live=await hoopsReady(v8hall.page);
      assert.equal(live.error,null,'a missing v8 hall never stops the game');assert.equal(live.m.v8,false);assert.equal(live.m.v5,true);assert.deepEqual(live.m.v4Fallbacks,['v8 arena']);assert.equal(live.m.v8Motion,true);
      await v8hall.csp.assertClean();reports.push({name:'hoops-v8-fallback-v5-result',...live.m,loadTimes:undefined});
    }finally{await v8hall.close();await v8hall.csp.assertClean();}
    const v8motion=await fixture('hoops-v8-fallback-motion',{contextOptions:{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      await v8motion.page.route(/assets\/hoops-v8\/motion\.json/,route=>route.abort());
      await v8motion.page.goto(server.url+v8Base,{waitUntil:'load'});
      const live=await hoopsReady(v8motion.page);
      assert.equal(live.error,null,'a missing motion pack never stops the game');assert.equal(live.m.v8Motion,false);assert.equal(live.m.v8,true);assert.deepEqual(live.m.v4Fallbacks,['v8 motion']);assert.equal(live.m.characterVersion,7);
      await v8motion.csp.assertClean();reports.push({name:'hoops-v8-fallback-motion-result',...live.m,loadTimes:undefined});
    }finally{await v8motion.close();await v8motion.csp.assertClean();}
    // The shared athlete body (11/11, sports-deep-fable M1/M2): the default basketball players are assets/athlete/athlete.glb with its textures and
    // the repaired v12 motion pack, under the production CSP, from assets/ only; two draw calls per body (skin, kit).
    const tallBase='tools/perf-hoops.html?dev=1&dur=3600&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick&seed=4242';
    const athlete=await fixture('hoops-athlete-session-start',{contextOptions:{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      const requests=[];athlete.page.on('request',r=>requests.push(r.url()));
      await athlete.page.goto(server.url+tallBase,{waitUntil:'load'});
      const live=await hoopsReady(athlete.page);
      assert.equal(live.error,null);assert.equal(live.m.tall,true);assert.equal(live.m.athleteBody,true);assert.equal(live.m.characterVersion,10);assert.equal(live.m.motionSource,'v12');assert.deepEqual(live.m.v4Fallbacks,[]);
      assert.ok(requests.some(u=>u.includes('assets/athlete/athlete.glb')),'the shared body');assert.ok(requests.some(u=>u.includes('assets/athlete/textures/')),'its textures');
      assert.ok(requests.some(u=>u.includes('assets/hoops-tall/motion-v12.json')),'the repaired motion pack');assert.ok(!requests.some(u=>/assets\/hoops-tall\/(guard|wing|center)\.glb/.test(u)),'the tall bodies are not downloaded');
      assert.ok(!requests.some(u=>/\/design\/(hoops-(tall|motion)|motion-fix)/.test(u)),'nothing is read from the unpublished design folder');
      assert.ok(live.m.calls<=52,'two draw calls per body: '+live.m.calls);
      await athlete.csp.assertClean();reports.push({name:'hoops-athlete-session-start-result',...live.m,loadTimes:undefined});
    }finally{await athlete.close();await athlete.csp.assertClean();}
    // ?athleteBody=0: the tall bodies + the v9 library (08/11, Codex) as before.
    const tall=await fixture('hoops-tall-session-start',{contextOptions:{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      const requests=[];tall.page.on('request',r=>requests.push(r.url()));
      await tall.page.goto(server.url+tallBase+'&athleteBody=0',{waitUntil:'load'});
      const live=await hoopsReady(tall.page);
      assert.equal(live.error,null);assert.equal(live.m.tall,true);assert.equal(live.m.characterVersion,9);assert.deepEqual(live.m.v4Fallbacks,[]);
      for(const f of ['guard.glb','wing.glb','center.glb','motion.json'])assert.ok(requests.some(u=>u.includes('assets/hoops-tall/'+f)),f);
      assert.ok(!requests.some(u=>/\/design\/hoops-(tall|motion)/.test(u)),'nothing is read from the unpublished design folder');
      assert.ok(live.m.calls<=45,'one draw call per body: '+live.m.calls);
      await tall.csp.assertClean();reports.push({name:'hoops-tall-session-start-result',...live.m,loadTimes:undefined});
    }finally{await tall.close();await tall.csp.assertClean();}
    // a missing athlete GLB falls back to the tall bodies; a missing tall folder (motion packs and bodies) falls back to v7
    const athleteFallback=await fixture('hoops-athlete-fallback-tall',{contextOptions:{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      await athleteFallback.page.route(/assets\/athlete\//,route=>route.abort());
      await athleteFallback.page.goto(server.url+tallBase,{waitUntil:'load'});
      const live=await hoopsReady(athleteFallback.page);
      assert.equal(live.error,null,'a missing athlete body never stops the game');assert.equal(live.m.athleteBody,false);assert.equal(live.m.characterVersion,9);assert.ok(live.m.v4Fallbacks.includes('players-athlete'));
      await athleteFallback.csp.assertClean();reports.push({name:'hoops-athlete-fallback-tall-result',...live.m,loadTimes:undefined});
    }finally{await athleteFallback.close();await athleteFallback.csp.assertClean();}
    const tallFallback=await fixture('hoops-tall-fallback-v7',{contextOptions:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}});
    try{
      await tallFallback.page.route(/assets\/hoops-tall\//,route=>route.abort());
      await tallFallback.page.goto(server.url+tallBase,{waitUntil:'load'});
      const live=await hoopsReady(tallFallback.page);
      assert.equal(live.error,null,'a missing tall body never stops the game');assert.equal(live.m.tall,false);assert.equal(live.m.characterVersion,7);assert.ok(live.m.v4Fallbacks.includes('players-tall'));assert.ok(live.m.v4Fallbacks.includes('players-athlete'));
      await tallFallback.csp.assertClean();reports.push({name:'hoops-tall-fallback-v7-result',...live.m,loadTimes:undefined});
    }finally{await tallFallback.close();await tallFallback.csp.assertClean();}
  }finally{
    await browser.close();await server.close();
    if(process.env.ISLAND_CSP_AUDIT_DIR){await mkdir(process.env.ISLAND_CSP_AUDIT_DIR,{recursive:true});await writeFile(path.join(process.env.ISLAND_CSP_AUDIT_DIR,'csp-negative-fixtures.json'),JSON.stringify(reports,null,2)+'\n');}
  }
});
