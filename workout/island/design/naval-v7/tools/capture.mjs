/** Repeatable local HTML browser evidence. No external network. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const round=String(process.argv[2]||'01').padStart(2,'0'),out=path.join(root,'iterations',round);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const report={round,startedAt:new Date().toISOString(),navigationMode:'local HTML via Playwright setContent; environment administrator blocks file:// navigation',sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),screens:[],errors:[],externalRequests:[],failedRequests:[]};
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const page=await context.newPage();
page.on('pageerror',e=>{report.errors.push(String(e));console.log('Browser exception:',String(e).slice(0,1200));});
page.on('console',m=>{if(m.type()==='error'){report.errors.push(m.text().slice(0,1200));console.log('Browser error:',m.text().slice(0,1200));}});
page.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
page.on('requestfailed',r=>report.failedRequests.push({url:r.url().slice(0,80),error:r.failure()}));
await page.setContent(html,{waitUntil:'load'});
console.log('Local HTML injected.');
await page.waitForFunction(()=>window.naval?.ready||window.naval?.error,null,{timeout:120000});
const error=await page.evaluate(()=>window.naval?.error);if(error)throw new Error(error);
await page.waitForTimeout(600);
for(const [w,h]of [[390,844],[844,390]]){
 await page.setViewportSize({width:w,height:h});
 for(const view of ['near','far']){
  const options={time:12,ship:'cruiser',fleet:'tide',view,weather:'sunset',quality:'balanced'};
  const metrics=await page.evaluate(o=>window.naval.snapshot(o),options);
  await page.waitForTimeout(80);
  const file=`${w}x${h}-${view}.png`;await page.screenshot({path:path.join(out,file)});
  const ui=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,
   buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width&&b.getBoundingClientRect().height&&b.closest('dialog')?.open!==false).map(b=>{const r=b.getBoundingClientRect();return{text:b.getAttribute('aria-label')||b.textContent.trim(),width:r.width,height:r.height,x:r.x,y:r.y};})}));
  report.screens.push({file,options,metrics,ui});
 }
}
// Supplementary coverage: storm, water impact, carrier detail and opposite fleet.
for(const shot of [
 {file:'390x844-storm-impact.png',w:390,h:844,options:{time:12,view:'near',weather:'storm',ship:'destroyer',fleet:'ember',effect:'splash'}},
 {file:'844x390-carrier-detail.png',w:844,h:390,options:{time:12,view:'near',weather:'sunset',ship:'carrier',fleet:'tide',elevation:.39}},
 {file:'844x390-storm-fire.png',w:844,h:390,options:{time:12,view:'far',weather:'storm',ship:'cruiser',fleet:'ember',effect:'explosion'}},
 {file:'390x844-corvette-detail.png',w:390,h:844,options:{time:12,view:'near',weather:'sunset',ship:'corvette',fleet:'ember',angle:1.13}},
 {file:'844x390-material-macro.png',w:844,h:390,options:{time:12,view:'near',weather:'sunset',ship:'cruiser',fleet:'tide',angle:1.45,elevation:.42,zoom:.62}},
 {file:'844x390-salvo-flash.png',w:844,h:390,options:{time:12,view:'near',weather:'sunset',ship:'cruiser',fleet:'tide',effect:'salvo',angle:1.1,elevation:.30}},
]){
 await page.setViewportSize({width:shot.w,height:shot.h});
 const metrics=await page.evaluate(o=>window.naval.snapshot(o),shot.options);await page.waitForTimeout(80);
 await page.screenshot({path:path.join(out,shot.file)});report.screens.push({file:shot.file,options:shot.options,metrics});
}
report.completedAt=new Date().toISOString();
await fs.writeFile(path.join(out,'capture.json'),JSON.stringify(report,null,2)+'\n');
await browser.close();
console.log(JSON.stringify({round,screens:report.screens.length,errors:report.errors,externalRequests:report.externalRequests,triangles:report.screens.map(s=>[s.file,s.metrics.triangles,s.metrics.drawCalls])},null,2));
if(report.errors.length||report.externalRequests.length||report.failedRequests.length)process.exitCode=1;
