// Real Chromium screenshots of the local-file delivery, not synthetic mockups.
import {chromium} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const round=process.argv[2]||'01',out=path.join(root,'iterations',round);await fs.mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  try{const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const content=await fs.readFile(p);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.md':'text/plain'})[path.extname(p)]||'application/octet-stream');res.end(content);
  }catch{res.writeHead(404);res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={round,startedAt:new Date().toISOString(),browser:browser.version(),transport:'loopback HTTP; managed Chromium blocks file:// by policy',
  renderer:'Chromium ANGLE / SwiftShader software renderer; not a physical phone',captures:[],errors:[],externalRequests:[]};
try{
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage();
    page.on('pageerror',e=>{report.errors.push(e.stack||e.message);console.log('PAGE ERROR:',e.message);});
    page.on('console',m=>{if(m.type()==='error'){report.errors.push(m.text());console.log('CONSOLE:',m.text());}});
    page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin))report.externalRequests.push(r.url());});
    await context.route(/^https?:/,route=>route.request().url().startsWith(origin)?route.continue():route.abort('blockedbyclient'));
    await page.goto(origin+'/preview.html');
    await page.waitForFunction(()=>window.firePreview?.ready||document.querySelector('#error:not([hidden])'),{timeout:90000});
    const initial=await page.evaluate(()=>({ready:window.firePreview?.ready,error:window.firePreview?.error}));
    if(!initial.ready)throw Error('Viewer did not become ready: '+JSON.stringify(initial));
    await page.evaluate(async()=>{firePreview.setPlaying(false);await firePreview.seek(10);firePreview.setWater(true);});
    for(const camera of ['near','far']){
      await page.evaluate(camera=>{firePreview.setCamera(camera);firePreview.capture();},camera);
      await page.waitForTimeout(250);
      const filename=`${viewport.width}x${viewport.height}-${camera}.webp`,png=`/tmp/fire-v7-${round}-${viewport.width}-${camera}.png`;
      await page.screenshot({path:png});
      execFileSync('python3',['-c','from PIL import Image;import sys;Image.open(sys.argv[1]).save(sys.argv[2],quality=94,method=6)',png,path.join(out,filename)]);
      const snapshot=await page.evaluate(()=>{
        const p=firePreview;return {view:p.view,camera:p.camera,time:p.time,engine:p.engineRevision,drawCalls:p.drawCalls,
          triangles:p.triangles,particles:p.particles,crowd:p.crowdCount,lod:p.lod,memory:p.memory,loadedAssets:p.loadedAssets,
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth,simulation:p.simulation,
          cameraPosition:p.cameraPosition,target:p.target};
      });
      report.captures.push({file:filename,viewport,...snapshot});console.log(filename,snapshot.triangles,'triangles',snapshot.drawCalls,'draws');
    }
    await context.close();
  }
  report.completedAt=new Date().toISOString();report.passed=!report.errors.length&&!report.externalRequests.length&&report.captures.every(c=>!c.horizontalOverflow);
  report.sourceHashes={};for(const f of ['preview.html','preview.css','preview.js','effects.js','simulation.js','manifest.json','assets-data.js','vendor/fire-core.js'])report.sourceHashes[f]=createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex');
  await fs.writeFile(path.join(out,'capture.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,errors:report.errors,externalRequests:report.externalRequests}));
  if(!report.passed)process.exitCode=1;
}finally{await browser.close();await new Promise(r=>server.close(r));}
