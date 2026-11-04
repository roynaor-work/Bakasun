/** Supplemental close inspection of all four hulls in both fleet palettes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'verification/fleet-catalog');await fs.mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=await fs.readFile(path.join(root,'index.html'),'utf8');const report={startedAt:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),offlineContext:true,inspectionOverlay:'Heading, console and camera controls hidden only by capture harness; vessel caption retained',images:[],errors:[],externalRequests:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,offline:true});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
await page.setContent(html);await page.waitForFunction(()=>window.naval?.ready||window.naval?.error,null,{timeout:60000});
if(await page.evaluate(()=>window.naval.error))throw new Error(await page.evaluate(()=>window.naval.error));
await page.waitForTimeout(550);
await page.addStyleTag({content:'.scene-heading,.camera-tools,.bearing,.horizon-marker,.console{display:none!important}.vessel-caption{bottom:23px!important}.vignette{background:linear-gradient(#081b2b66,transparent 35%,transparent 70%,#081b2b66)!important}'});
for(const ship of ['corvette','destroyer','cruiser','carrier'])for(const fleet of ['tide','ember']){
 const options={ship,fleet,view:'near',weather:'sunset',time:12,angle:1.13,elevation:.36,zoom:.88,quality:'high'};
 const metrics=await page.evaluate(o=>window.naval.snapshot(o),options);await page.waitForTimeout(80);const file=`${ship}-${fleet}-844x390.png`;await page.screenshot({path:path.join(out,file)});report.images.push({file,options,metrics});
}
// Exact deterministic water pair, using ordinary showcase UI and no effect spawn.
await page.addStyleTag({content:'.scene-heading,.camera-tools,.bearing,.horizon-marker,.console{display:block!important}.console{display:flex!important}'});
for(const time of [12,14]){
 await page.evaluate(o=>window.naval.snapshot(o),{ship:'cruiser',fleet:'tide',view:'near',weather:'sunset',time,angle:1.13,elevation:.36,quality:'balanced'});await page.waitForTimeout(50);await page.screenshot({path:path.join(root,`verification/water-t${time}.png`)});
}
report.completedAt=new Date().toISOString();report.pass=report.images.length===8&&report.errors.length===0&&report.externalRequests.length===0;
await fs.writeFile(path.join(out,'inspection.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({pass:report.pass,images:report.images.length,offline:true,errors:report.errors,externalRequests:report.externalRequests},null,2));if(!report.pass)process.exitCode=1;
