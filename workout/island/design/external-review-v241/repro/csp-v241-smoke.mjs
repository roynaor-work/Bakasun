/** Focused read-only CSP smoke on the two shipped v24.1 performance pages.
 * ISLAND_PLAYWRIGHT=/opt/codex/runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages/playwright/driver/package/index.mjs CHROMIUM_PATH=/usr/bin/chromium node workout/island/design/external-review-v241/repro/csp-v241-smoke.mjs
 * No routes, policy changes, network mocks, source edits or CSP bypasses.
 * The soccer tool keeps its session lexical: a read-only CDP breakpoint reads
 * view.metrics() just before the tool's own final snapshot/disposal.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';

const output=process.env.V241_CSP_OUTPUT||'/tmp/v241-csp-evidence.json';
const server=await serveIsland(),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const report={merge:'43b27dc235387e3cb737aee9558cdf9d5fd5a262',viewport:{width:844,height:390},hasTouch:true,isMobile:true,
  policy:server.csp,policySha256:createHash('sha256').update(server.csp).digest('hex'),scenes:[],
  limits:'Chromium SwiftShader CSP/resource/render smoke only; no phone FPS or repeated GPU/heap soak inference.'};

async function runScene(kind){
  const context=await browser.newContext({viewport:report.viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const monitor=await installIslandCspMonitor(context),page=await context.newPage();await monitor.attachPage(page);
  const origin=new URL(server.url).origin,requests=[],outside=[],failed=[],httpErrors=[],pageErrors=[],consoleErrors=[],finished=new Set(),responses=new Map();
  let tearingDown=false;
  const item={kind,query:kind==='hoops'?'dev=1&dur=3600&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick&seed=4242':'dev=1&auto=1&seconds=5&warmup=0&seed=7&level=4',status:'running'};
  const relative=url=>url.startsWith(server.url)?url.slice(server.url.length):url;
  page.on('request',r=>{const url=r.url();requests.push(url);try{const u=new URL(url);if(['http:','https:'].includes(u.protocol)&&u.origin!==origin)outside.push(url);}catch{}});
  page.on('requestfinished',r=>finished.add(r.url()));
  page.on('requestfailed',r=>failed.push({url:relative(r.url()),failure:r.failure()?.errorText,duringTeardown:tearingDown}));
  page.on('response',r=>{responses.set(r.url(),r.status());if(r.status()>=400)httpErrors.push({url:relative(r.url()),status:r.status()});});
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push({text:m.text(),location:m.location()});});
  let cdp=null,inspectionPromise=null,inspectionTimer=null;
  const started=Date.now();
  try{
    if(kind==='soccer'){
      cdp=await context.newCDPSession(page);await cdp.send('Debugger.enable');
      const source=await readFile(new URL('../../../tools/perf-soccer.mjs',import.meta.url),'utf8');
      const lineNumber=source.split('\n').findIndex(s=>s.includes('const metrics=view.metrics(),snapshot=session.snapshot;'));
      assert.ok(lineNumber>0,'Find the actual shipped final-snapshot line');
      inspectionPromise=new Promise((resolve,reject)=>{
        inspectionTimer=setTimeout(()=>reject(Error('Soccer final-snapshot breakpoint not reached')),240000);
        cdp.on('Debugger.paused',async event=>{
          try{
            const value=await cdp.send('Debugger.evaluateOnCallFrame',{callFrameId:event.callFrames[0].callFrameId,
              expression:'JSON.stringify({metrics:view.metrics(),phase:model.getState().phase,elapsed:model.getState().elapsed})',returnByValue:true});
            if(value.exceptionDetails)throw Error('Read-only soccer metrics evaluation failed: '+JSON.stringify(value.exceptionDetails));
            resolve(JSON.parse(value.result.value));
          }catch(error){reject(error);}finally{clearTimeout(inspectionTimer);await cdp.send('Debugger.resume').catch(()=>{});}
        });
      });
      // Attach rejection immediately; the main wait below still receives it.
      inspectionPromise.catch(()=>{});
      await cdp.send('Debugger.setBreakpointByUrl',{url:server.url+'tools/perf-soccer.mjs',lineNumber});
    }
    await page.goto(server.url+`tools/perf-${kind}.html?`+item.query,{waitUntil:'load',timeout:120000});
    console.log(kind+': page loaded with the shipped CSP');
    let metrics;
    if(kind==='hoops'){
      await page.waitForFunction(()=>{const s=window.__session?.snapshot,v=s?.renderMetrics?.v241;
        return s&&(s.error||(s.stepsRun>10&&s.renderMetrics?.calls>0&&v&&v.crowd3d.status!=='loading'&&v.referee.status!=='loading'));},null,{timeout:240000});
      const live=await page.evaluate(()=>({error:window.__session.snapshot.error,steps:window.__session.snapshot.stepsRun,m:window.__session.snapshot.renderMetrics}));
      metrics=live.m;item.sessionError=live.error;item.steps=live.steps;
      assert.equal(live.error,null);assert.equal(metrics.v241.bodyV2,true);assert.equal(metrics.v241.crowd3d.status,'ready');assert.equal(metrics.v241.referee.status,'ready');
      item.render={calls:metrics.calls,triangles:metrics.triangles,quality:metrics.quality,
        v241:{bodyV2:metrics.v241.bodyV2,motionV13:metrics.v241.motionV13,crowd3d:metrics.v241.crowd3d,referee:metrics.v241.referee}};
    }else{
      const inspected=await inspectionPromise;metrics=inspected.metrics;
      await page.waitForFunction(()=>window.__perf?.done,null,{timeout:120000});
      const perf=await page.evaluate(()=>({error:window.__perf.error||null,quality:window.__perf.result?.quality,match:window.__perf.result?.match}));
      item.sessionError=perf.error;assert.equal(perf.error,null);assert.equal(metrics.assetStatus,'ready');
      assert.equal(typeof metrics.referee,'object','The real v24.1 referee must finish loading');
      assert.ok(metrics.referee.triangles>0);assert.ok(metrics.drawCalls>0&&metrics.triangles>0);
      item.render={calls:metrics.drawCalls,triangles:metrics.triangles,quality:metrics.quality,assetStatus:metrics.assetStatus,
        referee:metrics.referee,v24:metrics.v24,full:metrics.full,modelCount:metrics.modelCount};
      item.match=perf.match;
      item.soccerInspection='Read-only CDP view.metrics() on the unmodified shipped tool before its own session.dispose().';
    }
    const prefix=`assets/${kind}-v241/`;
    item.newResources=[...new Set(requests)].filter(u=>u.includes(prefix)).map(u=>({path:relative(u),status:responses.get(u)??null,finished:finished.has(u)}));
    assert.ok(item.newResources.some(r=>r.path.includes('/referee/')&&r.status===200&&r.finished),'Referee file downloaded completely');
    if(kind==='hoops')assert.ok(item.newResources.some(r=>r.path.includes('/crowd/runtime/')&&r.status===200&&r.finished),'New crowd files downloaded completely');
    else for(const file of ['tackle','kicks','aerial','loco'])assert.ok(item.newResources.some(r=>r.path.includes(`/clips/${file}.json`)&&r.status===200&&r.finished),file+' downloaded completely');
    await monitor.assertClean();
    assert.equal(pageErrors.length,0,'No uncaught page errors');assert.equal(outside.length,0,'No outside-origin requests');
    item.status='passed';
    console.log(kind+': v24.1 assets ready; calls='+item.render.calls+' triangles='+item.render.triangles+'; CSP clean');
  }catch(error){item.status='failed';item.error=String(error.stack||error);console.log(kind+': '+String(error.message||error));}
  finally{
    clearTimeout(inspectionTimer);
    if(cdp)await cdp.send('Debugger.resume').catch(()=>{});
    item.wallSeconds=+((Date.now()-started)/1000).toFixed(2);item.requests=requests.length;item.outsideOriginRequests=outside;
    item.requestFailures=failed;item.httpErrors=httpErrors;item.pageErrors=pageErrors;item.consoleErrors=consoleErrors;
    tearingDown=true;await context.close();
    await monitor.assertClean().catch(error=>{item.status='failed';item.teardownCspError=String(error.message||error);});
    const csp=monitor.snapshot();item.csp={htmlResponsesSeen:csp.htmlResponsesSeen,violations:csp.violations,policyErrors:csp.policyErrors,workers:csp.workers};
    await monitor.dispose();await cdp?.detach().catch(()=>{});
    report.scenes.push(item);
    await writeFile(output,JSON.stringify(report,null,2)+'\n');
  }
}
try{await runScene('hoops');await runScene('soccer');}
finally{await browser.close();await server.close();}
report.passed=report.scenes.length===2&&report.scenes.every(s=>s.status==='passed');
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,output:output.pathname,scenes:report.scenes.map(s=>({kind:s.kind,status:s.status,render:s.render&&{calls:s.render.calls,triangles:s.render.triangles},cspViolations:s.csp.violations.length,pageErrors:s.pageErrors.length,outsideOriginRequests:s.outsideOriginRequests.length}))}));
if(!report.passed)process.exitCode=1;
