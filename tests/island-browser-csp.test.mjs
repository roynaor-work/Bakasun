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
    for(const page of ['', 'tools/perf-alpine.html', 'design/viewer/viewer.html']){
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
  {skip:process.env.ISLAND_CSP_BROWSER!=='1',timeout:120000},async()=>{
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
      assert.equal(loaded.metrics.character.clips,12);assert.equal(loaded.metrics.character.trianglesPerRider,1920);
      await alpine.csp.assertClean();
      reports.push({name:'alpine-session-start-result',phase,...loaded});
      await alpine.page.evaluate(()=>window.__perfSession.dispose());
      await alpine.csp.assertClean();
    }finally{await alpine.close();await alpine.csp.assertClean();}
  }finally{
    await browser.close();await server.close();
    if(process.env.ISLAND_CSP_AUDIT_DIR){await mkdir(process.env.ISLAND_CSP_AUDIT_DIR,{recursive:true});await writeFile(path.join(process.env.ISLAND_CSP_AUDIT_DIR,'csp-negative-fixtures.json'),JSON.stringify(reports,null,2)+'\n');}
  }
});
