// Reference only: software Chromium timings do not certify a physical phone.
// Run after the soak (without competing review browsers) for six quiet cases.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=process.argv[2]||'http://127.0.0.1:8766';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=['width,height,lod,samples,triangles,draw_calls,render_finish_p50_ms,render_finish_p95_ms,raf_p50_ms,raf_p95_ms'],drivers=new Set();
try{
  for(const [width,height]of [[390,844],[844,390]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,reducedMotion:'reduce'});
    await page.goto(base+'/preview.html?capture=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
    for(let lod=0;lod<3;lod++){
      const result=await page.evaluate(async lod=>{
        const r=window.stadiumReview;r.stop();r.setView('main',{lod,angle:0});
        const gl=r.renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
        const driver=extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
        const times=[],intervals=[];let previous;
        for(let i=0;i<360;i++){
          const timestamp=await new Promise(requestAnimationFrame),begin=performance.now();r.render(i/30);gl.finish();const duration=performance.now()-begin;
          if(i>=60){times.push(duration);if(previous!==undefined)intervals.push(timestamp-previous);}previous=timestamp;
        }
        const percentile=(list,p)=>list.sort((a,b)=>a-b)[Math.floor((list.length-1)*p)];
        const m=r.metrics();return {driver,total:m.runtime.total,calls:m.calls,samples:times.length,
          p50:percentile(times,.5),p95:percentile(times,.95),raf50:percentile(intervals,.5),raf95:percentile(intervals,.95)};
      },lod);
      if(result.total>40_000)throw new Error('Performance case exceeds triangle budget');drivers.add(result.driver);
      rows.push([width,height,lod,result.samples,result.total,result.calls,result.p50.toFixed(3),result.p95.toFixed(3),result.raf50.toFixed(3),result.raf95.toFixed(3)].join(','));
      console.log(`${width}x${height} LOD${lod}: ${result.samples} reference samples; ${result.total} triangles`);
    }
    await page.close();
  }
}finally{await browser.close();}
await fs.writeFile(path.join(root,'verification','performance-reference.csv'),rows.join('\n')+'\n');
await fs.writeFile(path.join(root,'verification','performance-reference.txt'),'Software reference, not a handset certification.\n300 measured frames after 60 warm-up frames per case.\nRender time includes gl.finish(); RAF includes the software compositor and host scheduling.\nRenderer DPR capped at 1.25.\nDrivers:\n'+[...drivers].join('\n')+'\n');
