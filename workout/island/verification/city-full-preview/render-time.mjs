// Raw render time per frame (readPixels forces the GPU to finish). Run from repo root: CHROMIUM_PATH=<chrome> node workout/island/verification/city-full-preview/render-time.mjs
import {serveIsland,islandChromium} from '../../../../tests/helpers/island-browser.mjs';
const server=await serveIsland(),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const out={};
for(const [name,q] of [['empty','cityPreview=empty'],['full-lod','cityPreview=full'],['full-nolod','cityPreview=full&cityLod=0'],['half-lod','cityPreview=half']]){
  const page=await (await browser.newContext({viewport:{width:844,height:390}})).newPage();
  await page.goto(server.url+'?dev=1&'+q,{waitUntil:'networkidle'});await page.waitForTimeout(10000);
  out[name]=await page.evaluate(()=>{const v=window.__island.view,r=v.renderer,gl=r.getContext();
    // stop the app loop, time raw renders
    const times=[];for(let i=0;i<6;i++){const t=performance.now();r.render(v.scene,v.camera);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));times.push(performance.now()-t);}
    times.sort((a,b)=>a-b);return {medianMs:Math.round(times[3]),tris:r.info.render.triangles,calls:r.info.render.calls,shadow:r.shadowMap.enabled};});
  await page.close();
}
console.log(JSON.stringify(out));await browser.close();await server.close();
