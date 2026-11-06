// Authoring/review only. Uses a separately installed Playwright and Chromium.
// node source/capture.mjs 01 [http://127.0.0.1:8765]
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const number=process.argv[2];if(!/^\d{2}$/.test(number??''))throw new Error('Supply a two-digit iteration');
const base=process.argv[3]||'http://127.0.0.1:8765',out=path.join(root,'iterations',number);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const audit=[],failures=[];
try{
  for(const [width,height]of [[390,844],[844,390]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const consoleErrors=[];page.on('pageerror',e=>consoleErrors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)consoleErrors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
    await page.goto(`${base}/preview.html?capture=1`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',{timeout:45_000});
    await page.evaluate(()=>window.stadiumReview.stop());await page.evaluate(()=>document.fonts.ready);
    const cases=[{view:'main',lod:0,prefix:'far'},{view:'close',lod:0,prefix:'close'},{view:'opening',lod:0,prefix:'opening'},
      {view:'main',lod:1,prefix:'lod1-diagnostic'},{view:'main',lod:2,prefix:'lod2-diagnostic'}];
    for(const {view,lod,prefix} of cases){
      await page.evaluate(({view,lod})=>{window.stadiumReview.setView(view,{angle:0,lod});window.stadiumReview.render(6);},{view,lod});
      // Ensure CSS and compositor have presented the same fixed simulation time.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const name=`${prefix}-${width}x${height}`;
      const temporary=`/tmp/stadium-v8-${number}-${name}.png`;
      await page.screenshot({path:temporary,scale:'css',animations:'disabled'});
      const converted=spawnSync('python',['-c','from PIL import Image; import sys; Image.open(sys.argv[1]).save(sys.argv[2],"WEBP",quality=94,method=6)',temporary,path.join(out,name+'.webp')],{encoding:'utf8'});
      if(converted.status!==0)throw new Error(converted.stderr);
      await fs.unlink(temporary);
      const result=await page.evaluate(()=>{const m=window.stadiumReview.metrics();delete m.frames;return m;});
      audit.push({name,...result});
      if(result.runtime.total>40_000)failures.push(`${name}: triangle budget exceeded`);
    }
    if(consoleErrors.length)failures.push(...consoleErrors);
    await page.close();
  }
}finally{await browser.close();}
const rows=['view,lod,runtime_triangles,submitted_triangles,draw_calls,geometries,textures,buffer_width,buffer_height'];
for(const a of audit)rows.push([a.name,a.runtime.lod,a.runtime.total,a.submitted,a.calls,a.memory.geometries,a.memory.textures,...a.drawingBuffer].join(','));
await fs.writeFile(path.join(out,'render-metrics.csv'),rows.join('\n')+'\n');
const files=(await fs.readdir(path.join(root,'runtime'))).filter(f=>/\.(mjs|glb|webp|css)$/.test(f)).sort();
const digest=createHash('sha256');
for(const file of files){digest.update(file);digest.update(await fs.readFile(path.join(root,'runtime',file)));}
await fs.writeFile(path.join(out,'SOURCE.txt'),`Captured ${new Date().toISOString()}\nRuntime content SHA-256: ${digest.digest('hex')}\nExact CSS viewport screenshots, device DPR 2, renderer capped at 1.25. Software WebGL, not a physical handset.\n${failures.length?failures.join('\n'):'No browser errors, failed HTTP responses or budget overrun.'}\n`);
console.log(`Iteration ${number}: ${audit.length} captures, ${failures.length} failures. ${out}`);
for(const a of audit)console.log(a.name,'triangles',a.runtime.total,'calls',a.calls);
if(failures.length)throw new Error(failures.join('\n'));
