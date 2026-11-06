// Render a diagnostic sky colour and inspect actual pixels at the field sides.
// node source/coverage.mjs 03 [http://127.0.0.1:8765]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),iteration=process.argv[2];
if(!/^\d{2}$/.test(iteration??''))throw new Error('Supply an existing iteration number');
const out=path.join(root,'iterations',iteration),base=process.argv[3]||'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=['width,height,view,lod,azimuth_degrees,guard_sky_pixels,guard_pixels,total_sky_pixels'],failures=[];
try{
  for(const [width,height]of [[390,844],[844,390]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.goto(`${base}/preview.html?capture=1`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');await page.evaluate(()=>window.stadiumReview.stop());
    const results=await page.evaluate(async()=>{
      const {THREE}=await import('/runtime/stadium.mjs'),r=window.stadiumReview,renderer=r.renderer;
      const w=innerWidth,h=innerHeight,target=new THREE.WebGLRenderTarget(w,h),pixels=new Uint8Array(w*h*4),result=[];
      const background=r.scene.background;
      try{
        r.scene.background=new THREE.Color('#ff00ff');
        for(const view of ['main','close','opening'])for(let lod=0;lod<3;lod++)for(let degree=0;degree<360;degree+=15){
          r.setView(view,{angle:degree*Math.PI/180,lod});renderer.setRenderTarget(target);renderer.render(r.scene,r.camera);
          renderer.readRenderTargetPixels(target,0,0,w,h,pixels);renderer.setRenderTarget(null);
          let sky=0,guard=0,area=0;
          // Side strips, below the top 18% (main/close) or 40% (opening).
          // The sky above the roof is an intentional part of the opening shot.
          const top=view==='opening'?.4:.18;
          for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const i=(y*w+x)*4,marked=pixels[i]>190&&pixels[i+1]<55&&pixels[i+2]>150;
            if(marked)sky++;
            if(y>=h*.02&&y<h*(1-top)&&(x<w*.12||x>=w*.88)){area++;if(marked)guard++;}
          }
          result.push({view,lod,degree,guard,area,sky});
        }
      }finally{r.scene.background=background;renderer.setRenderTarget(null);target.dispose();r.render(6);}
      return result;
    });
    for(const r of results){
      rows.push([width,height,r.view,r.lod,r.degree,r.guard,r.area,r.sky].join(','));
      if(r.guard)failures.push(`${width}x${height} ${r.view} LOD${r.lod} ${r.degree}°: ${r.guard} exposed sky pixels`);
    }
    console.log(`${width}x${height}: ${results.length} rendered camera/LOD cases; ${results.filter(x=>x.guard>0).length} failed`);
    await page.close();
  }
}finally{await browser.close();}
await fs.writeFile(path.join(out,'coverage.csv'),rows.join('\n')+'\n');
await fs.writeFile(path.join(out,'coverage.txt'),`Rendered ${rows.length-1} camera/LOD/viewport combinations.\nSky guard: left/right 12%, main/close y=18..98%, opening y=40..98%.\nThe sky above the roof is intentional. No claim about arbitrary upward/free-flight cameras.\n${failures.length?failures.join('\n'):'PASS: 0 exposed sky pixels at the field-side guard strips.'}\n`);
if(failures.length)throw new Error(`${failures.length} camera coverage failures. See iterations/${iteration}/coverage.txt`);
