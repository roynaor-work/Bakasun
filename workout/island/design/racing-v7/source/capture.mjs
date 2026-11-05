// Browser evidence generator. Existing repository tests are never modified.
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {readCarFraming} from './framing.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const iteration=process.argv[2]||'01';
if(!/^\d{2}$/.test(iteration))throw new Error('Use a two-digit iteration number.');
const quick=process.argv.includes('--quick');
const folder=path.join(root,'iterations',iteration);
if(await fs.access(path.join(folder,'capture.json')).then(()=>true,()=>false))throw new Error(`Iteration ${iteration} already contains evidence. Choose a new number.`);
await fs.mkdir(folder,{recursive:true});
const hashes={};
for(const file of ['app.mjs','loader.mjs','world.mjs','effects.mjs','index.html','style.css'])hashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:[
  '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage',
]});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const page=await context.newPage();const errors=[],external=[],requests=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('requestfailed',r=>errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
await page.route('**/*',route=>{
  const url=route.request().url();
  if(!url.startsWith('http://127.0.0.1:8765/')&&!url.startsWith('data:')&&!url.startsWith('blob:')){
    external.push(url);return route.abort();
  }
  requests.push(url);return route.continue();
});
const startedAt=new Date().toISOString();
await page.goto('http://127.0.0.1:8765/workout/island/design/racing-v7/index.html?capture=1&pause=1',{waitUntil:'networkidle',timeout:60000});
try{await page.waitForFunction(()=>window.__racingV7?.state.ready,{timeout:60000});}
catch(error){
  await page.screenshot({path:path.join(folder,'load-failure.png')});
  await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({errors,external,body:await page.locator('body').innerText()},null,2));
  throw error;
}
await page.waitForTimeout(600);
const records=[];
const scenarios=quick?[{track:'coast',car:'apex',mode:'garage',far:false}]:[
  ...['coast','neon','ridge'].flatMap(track=>[false,true].map(far=>({track,car:'apex',mode:'drive',far}))),
  ...['apex','velour','prism','solis','vector'].map(car=>({track:'coast',car,mode:'garage',far:false})),
  ...['apex','velour','prism','solis','vector'].map(car=>({track:'coast',car,mode:'garage',far:true})),
  ...['coast','neon','ridge'].map(track=>({track,car:'apex',mode:'overview',far:true})),
  {track:'neon',car:'vector',mode:'drive',far:false,drift:true,boost:true,contact:true,time:5.8},
  ...(Number(iteration)>=8?['apex','velour','prism','solis','vector'].flatMap(car=>[
    {track:'coast',car,mode:'garage',far:false,orbit:2.5,tag:'rear'},
    {track:'coast',car,mode:'garage',far:false,forceLOD:2,tag:'lod2'},
  ]):[]),
  ...(Number(iteration)>=13?['coast','neon','ridge'].flatMap(track=>[.23,.52,.79].map((phase,i)=>({track,car:'apex',mode:'drive',far:false,phase,tag:'path-'+(i+1)}))):[]),
  ...(Number(iteration)>=16?[
    {track:'ridge',car:'velour',mode:'garage',far:false,orbit:Math.PI/2,forceLOD:0,tag:'side-limit'},
    {track:'ridge',car:'velour',mode:'garage',far:false,orbit:7*Math.PI/6,forceLOD:0,tag:'rear-limit'},
  ]:[]),
];
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const scenario of scenarios){
    const metrics=await page.evaluate(options=>window.__racingV7.inspect(options),{time:8,phase:.036,quality:'high',orbit:.7,orbitZoom:1,...scenario});
    await page.waitForTimeout(120);
    const name=`${scenario.track}-${scenario.mode}-${scenario.car}-${scenario.far?'far':'near'}${scenario.drift?'-fx':''}${scenario.tag?'-'+scenario.tag:''}-${viewport.width}x${viewport.height}`;
    const filename=`${name}.jpg`;
    await page.screenshot({path:path.join(folder,filename),type:'jpeg',quality:91});
    const framing=await page.evaluate(readCarFraming);
    records.push({filename,scenario,viewport,metrics,framing});
    console.log(filename,JSON.stringify({triangles:metrics.triangles,calls:metrics.drawCalls,lod:metrics.lod}));
  }
}
const report={iteration,startedAt,finishedAt:new Date().toISOString(),sourceSHA256:hashes,browser:await browser.version(),renderer:records[0]?.metrics.renderer,viewports:[{width:390,height:844},{width:844,height:390}],records,errors:[...new Set(errors)],externalRequests:external,uniqueLocalRequests:[...new Set(requests)].length,physicalPhone:false};
await fs.writeFile(path.join(folder,'capture.json'),JSON.stringify(report,null,2)+'\n');
await browser.close();
if(errors.length||external.length)process.exitCode=1;
