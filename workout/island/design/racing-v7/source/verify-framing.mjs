import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readCarFraming} from './framing.mjs';
import {hashRuntime} from './evidence.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const label=process.argv[2]||'framing';
const sweep=process.argv.includes('--sweep');
const orbits=sweep?[.7,2.5,...Array.from({length:12},(_,i)=>i*Math.PI/6)]:[.7,2.5];
const tracks=sweep?['coast','neon','ridge']:['coast'];
const sourceSHA256=await hashRuntime(root),lifecycle=[];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844}}),records=[],errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.goto('http://127.0.0.1:8765/workout/island/design/racing-v7/index.html?capture=1&pause=1',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__racingV7?.state.ready,undefined,{timeout:60000});
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const track of tracks)for(const car of ['apex','velour','prism','solis','vector'])for(const orbit of orbits)for(const far of [false,true]){
    await page.evaluate(options=>window.__racingV7.inspect(options),{track,car,mode:'garage',far,orbit,orbitZoom:1,quality:'high'});
    const framing=await page.evaluate(readCarFraming);
    const inside=framing.car.left>=1&&framing.car.right<=viewport.width-1&&framing.car.top>=1&&framing.car.bottom<=viewport.height-1;
    const occluded=Object.entries(framing.overlays).filter(([selector,r])=>r.conservativeOverlapArea>.5).map(([selector])=>selector);
    records.push({viewport,track,carId:car,orbit,far,...framing,inside,occluded,pass:inside&&!occluded.length&&!framing.foregroundOccluders.length});
    if(sweep&&records.length%140===0)console.log('SWEEP_PROGRESS',records.length,'of',840,'failures',records.filter(r=>!r.pass).length);
  }
  for(const mode of ['drive','overview']){
    await page.evaluate(mode=>window.__racingV7.inspect({mode}),mode);
    const cleared=await page.evaluate(()=>!window.__racingV7.camera.view?.enabled);
    const restored=await page.evaluate(()=>{
      let hidden=0,spectators=0;
      window.__racingV7.world.root.traverse(o=>{if(o.isInstancedMesh){if(o.name==='Instanced spectators'&&o.visible)spectators+=o.count;for(let i=0;i<o.count;i++)if(o.instanceMatrix.array[i*16+13]<-9000)hidden++;}});
      return hidden===0&&spectators===72;
    });
    lifecycle.push({viewport,mode,viewOffsetCleared:cleared,sceneryRestored:restored,pass:cleared&&restored});
  }
}
const report={generatedAt:new Date().toISOString(),label,sourceSHA256,records,lifecycle,errors,pass:records.every(r=>r.pass)&&lifecycle.every(r=>r.pass)&&!errors.length};
await fs.writeFile(path.join(root,'verification',label+'.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,cases:records.length,failures:records.filter(r=>!r.pass).map(r=>({viewport:r.viewport,carId:r.carId,orbit:r.orbit,far:r.far,carBounds:r.car,occluded:r.occluded})),errors},null,2));
await browser.close();if(!report.pass)process.exitCode=1;
