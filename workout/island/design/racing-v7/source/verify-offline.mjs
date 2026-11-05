import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hashRuntime} from './evidence.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceSHA256=await hashRuntime(root,true);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,offline:true});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('request',r=>requests.push(r.url()));
const startedAt=new Date().toISOString();
// The managed browser prohibits navigation to file:// by enterprise policy.
// Reading our own HTML and injecting it into a blank offline document preserves
// the self-contained resource requirement without bypassing that browser policy.
await page.setContent(await fs.readFile(path.join(root,'offline.html'),'utf8'),{waitUntil:'load',timeout:60000});
try{await page.waitForFunction(()=>window.__racingV7?.state.ready,{timeout:60000});}
catch(error){console.log(errors);await fs.writeFile(path.join(root,'verification/offline-failure.json'),JSON.stringify({errors,loading:await page.locator('#loading').innerText()},null,2));throw error;}
await page.waitForTimeout(500);
const records=[];
for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);
  for(const track of ['coast','neon','ridge']){
    const data=await page.evaluate(track=>window.__racingV7.inspect({track,mode:'drive',far:false,quality:'high',time:8,phase:.036}),track);
    const filename=`offline-${track}-${size.width}x${size.height}.jpg`;
    await page.screenshot({path:path.join(root,'verification',filename),type:'jpeg',quality:91});
    records.push({filename,metrics:data});
  }
}
for(const car of ['apex','velour','prism','solis','vector'])await page.evaluate(car=>window.__racingV7.inspect({car,mode:'garage',track:'coast'}),car);
const report={startedAt,finishedAt:new Date().toISOString(),sourceSHA256,method:'self-contained HTML injected into an offline blank document; file:// navigation blocked by managed browser policy',offline:true,externalRequests:requests.filter(u=>/^https?:/.test(u)),requests:requests.map(u=>u.startsWith('blob:')?'blob:local':u),errors,records,pass:errors.length===0&&requests.every(u=>!/^https?:/.test(u))};
await fs.writeFile(path.join(root,'verification/offline.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,errors,externalRequests:report.externalRequests,scenarios:records.length}));
await browser.close();if(!report.pass)process.exitCode=1;
