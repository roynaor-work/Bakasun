// Exercise real HTTP/worker/abort failure paths and retry the same THREE.Scene.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=process.argv[2]||'http://127.0.0.1:8765',lines=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(base+'/preview.html?capture=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.evaluate(()=>window.stadiumReview.stop());
  const cases=[
    {name:'missing texture',glob:'**/crowd-atlas.webp',kind:'404'},
    {name:'missing GLB',glob:'**/stadium-lod1.glb',kind:'404'},
    {name:'truncated GLB',glob:'**/stadium-lod1.glb',kind:'truncated'},
    {name:'missing WASM',glob:'**/draco_decoder.wasm',kind:'404'},
    {name:'worker load failure',glob:'**/draco-worker.js',kind:'404'},
    {name:'abort while loading',glob:'**/stadium-lod0.glb',kind:'delay'},
  ];
  for(const scenario of cases){
    await page.route(scenario.glob,async route=>{
      if(scenario.kind==='delay'){await new Promise(resolve=>setTimeout(resolve,250));return route.continue();}
      if(scenario.kind==='truncated')return route.fulfill({status:200,contentType:'model/gltf-binary',body:Buffer.alloc(12)});
      return route.fulfill({status:404,body:'Expected diagnostic failure'});
    });
    const result=await page.evaluate(async abort=>{
      const {THREE,loadStadium}=await import('/runtime/stadium.mjs');
      const scene=new THREE.Scene(),background=new THREE.Color('#123456'),fog=new THREE.Fog('#203040',4,80);scene.background=background;scene.fog=fog;
      const controller=new AbortController();let rejected=false,message='',textures=0,geometries=0;
      const texDispose=THREE.Texture.prototype.dispose,geoDispose=THREE.BufferGeometry.prototype.dispose;
      THREE.Texture.prototype.dispose=function(){textures++;return texDispose.call(this);};
      THREE.BufferGeometry.prototype.dispose=function(){geometries++;return geoDispose.call(this);};
      try{
        const promise=loadStadium({scene,signal:controller.signal});if(abort)setTimeout(()=>controller.abort(),25);
        await Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Failure path did not settle')),20_000))]);
      }catch(error){rejected=true;message=String(error);}
      finally{THREE.Texture.prototype.dispose=texDispose;THREE.BufferGeometry.prototype.dispose=geoDispose;}
      if(!rejected||message.includes('did not settle'))throw new Error('Loader failure did not reject promptly');
      if(scene.children.length||scene.background!==background||scene.fog!==fog)throw new Error('Failed load changed the host scene');
      if(abort&&(textures<9||geometries<1))throw new Error('Abort failed to dispose completed resources');
      window.__retryScene=scene;return {message,textures,geometries};
    },scenario.kind==='delay');
    await page.unroute(scenario.glob);
    const retry=await page.evaluate(async()=>{
      const {loadStadium}=await import('/runtime/stadium.mjs');
      const stadium=await loadStadium({scene:window.__retryScene});const total=stadium.metrics().total;stadium.dispose();delete window.__retryScene;return total;
    });
    if(retry>40_000||retry<=0)throw new Error('Retry did not load the real stadium');
    lines.push(`PASS ${scenario.name}: rejected, scene preserved, retry succeeded; disposed ${result.textures} textures / ${result.geometries} geometries`);
    console.log(lines.at(-1));
  }
  const ownership=await page.evaluate(async()=>{
    const {THREE,loadStadium}=await import('/runtime/stadium.mjs'),scene=new THREE.Scene();
    const first=loadStadium({scene});let rejected=false;try{await loadStadium({scene});}catch{rejected=true;}
    const stadium=await first;stadium.dispose();const replacement=await loadStadium({scene});replacement.dispose();return rejected&&scene.children.length===0;
  });
  if(!ownership)throw new Error('Concurrent ownership/replacement contract failed');lines.push('PASS concurrent scene ownership rejected; replacement after dispose succeeds');
}finally{await browser.close();}
await fs.writeFile(path.join(root,'verification','failure-check.txt'),lines.join('\n')+'\n');console.log(`PASS ${lines.length} failure/recovery scenarios`);
