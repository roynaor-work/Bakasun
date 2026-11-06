// Sustained rendering test. Keeps rotating views, orientation and LODs, checks
// budget/errors, and periodically reloads the current files to catch regressions.
// node source/soak.mjs 100 [http://127.0.0.1:8765]
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),minutes=Number(process.argv[2]||30),base=process.argv[3]||'http://127.0.0.1:8765';
if(!Number.isFinite(minutes)||minutes<=0)throw new Error('Positive duration required');
const out=path.join(root,'verification');await fs.mkdir(out,{recursive:true});
const file=path.join(out,'soak.csv'),errors=[],start=Date.now(),deadline=start+minutes*60_000;
await fs.writeFile(file,'elapsed_seconds,utc,width,height,view,lod,angle,triangles,draw_calls,geometries,textures,p50_ms,p95_ms,runtime_sha256\n');
const signature=async()=>{
  const h=createHash('sha256');
  for(const name of (await fs.readdir(path.join(root,'runtime'))).filter(n=>/\.(mjs|webp|glb|css)$/.test(n)).sort()){
    h.update(name);h.update(await fs.readFile(path.join(root,'runtime',name)));
  }return h.digest('hex');
};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let samples=0,reloads=0,lastSignature='',maxTriangles=0;
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
  await page.goto(`${base}/preview.html?capture=1`,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  lastSignature=await signature();
  for(let i=0;Date.now()<deadline;i++){
    if(i&&i%60===0){
      await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');lastSignature=await signature();reloads++;
    }
    const portrait=Math.floor(i/6)%2===0,width=portrait?390:844,height=portrait?844:390;
    await page.setViewportSize({width,height});
    const view=['main','close','opening'][Math.floor(i/3)%3],lod=i%3,angle=i%24*15;
    await page.evaluate(({view,lod,angle})=>{window.stadiumReview.setView(view,{angle:angle*Math.PI/180,lod});window.stadiumReview.resetFrameTimes();},{view,lod,angle});
    await page.waitForTimeout(5000);
    {
      const metrics=await page.evaluate(()=>{
        const m=window.stadiumReview.metrics(),f=m.frames.slice(-180).sort((a,b)=>a-b);
        return {triangles:m.runtime.total,calls:m.calls,memory:m.memory,p50:f[Math.floor(f.length*.5)]||0,p95:f[Math.floor(f.length*.95)]||0};
      });
      maxTriangles=Math.max(maxTriangles,metrics.triangles);
      if(metrics.triangles>40_000)errors.push('Triangle budget exceeded during soak');
      const elapsed=Math.round((Date.now()-start)/1000);
      await fs.appendFile(file,[elapsed,new Date().toISOString(),width,height,view,lod,angle,metrics.triangles,metrics.calls,metrics.memory.geometries,metrics.memory.textures,metrics.p50.toFixed(2),metrics.p95.toFixed(2),lastSignature].join(',')+'\n');
      samples++;if(samples%12===0)console.log(`${elapsed}s: ${samples} samples, ${reloads} reloads, ${errors.length} errors; ${metrics.triangles} triangles, ${metrics.memory.geometries} geometries`);
    }
    if(errors.length)throw new Error(errors.join('\n'));
  }
}catch(error){if(!errors.includes(String(error)))errors.push(String(error));}
finally{await browser.close();}
const elapsed=Math.round((Date.now()-start)/1000);
await fs.writeFile(path.join(out,'soak.txt'),`Sustained browser rendering: ${elapsed} seconds\nSamples: ${samples}\nReloads: ${reloads}\nMaximum triangles: ${maxTriangles}\nFinal loaded runtime SHA-256: ${lastSignature}\nSoftware Chromium WebGL; these timings do not certify a physical midrange handset.\n${errors.length?'FAIL\n'+errors.join('\n'):'PASS: no browser errors, failed resources or triangle budget overrun.'}\n`);
console.log(`Soak finished: ${elapsed}s, ${samples} samples, ${errors.length} errors.`);
if(errors.length)process.exitCode=1;
