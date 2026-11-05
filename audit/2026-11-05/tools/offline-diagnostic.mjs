// Diagnose the existing two-context automatic-download test without modifying it.
import fs from 'node:fs/promises';
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';
const server=await serveIsland('/workout/island/');
const chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={started:new Date().toISOString(),conditions:'Contexts opened sequentially, unlike the original test which creates both before navigation; same source CSP monitor. Diagnostics only, not an exact replay.',contexts:[]};
const opened=[];
try{
  for(const saver of [true,false]){
    const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:1});
    await ctx.route('**/*',r=>new URL(r.request().url()).origin===new URL(server.url).origin?r.continue():r.abort());
    if(saver)await ctx.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true}));
    const monitor=await installIslandCspMonitor(ctx);const page=await ctx.newPage();await monitor.attachPage(page);
    const record={saver,errors:[],failed:[],snapshots:[]};report.contexts.push(record);opened.push({ctx,monitor,page});
    page.on('pageerror',e=>record.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')record.errors.push(m.text().slice(0,800));});
    page.on('requestfailed',r=>record.failed.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
    await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});
    for(let i=0;i<6;i++){
      await page.waitForTimeout(5000);
      record.snapshots.push(await page.evaluate(()=>({at:Date.now(),dev:new URLSearchParams(location.search).get('dev'),island:!!window.__island,avatarLoaded:window.__island?.view.metrics().avatarLoaded,
        offline:window.__offlineState?.state,avatarResponse:performance.getEntriesByType('resource').filter(e=>e.name.includes('kid-full.glb')).map(e=>({duration:e.duration,bytes:e.transferSize})),loadError:!!document.querySelector('.load-error')})));
      await fs.writeFile(new URL('../iterations/05/offline-diagnostic.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
    }
    record.csp=monitor.snapshot();
  }
}finally{for(const x of opened){await x.monitor.dispose();await x.ctx.close();}await browser.close();await server.close();report.finished=new Date().toISOString();await fs.writeFile(new URL('../iterations/05/offline-diagnostic.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
