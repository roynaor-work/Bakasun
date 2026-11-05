/** Every hull, both orientations and both distances; supplemental JPEG evidence. */
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'verification/layout-matrix');await fs.mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,offline:true,hasTouch:true,isMobile:true});
const errors=[],external=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
await page.setContent(html);await page.waitForFunction(()=>window.naval?.ready,null,{timeout:60000});await page.waitForTimeout(550);const cases=[];
for(const [w,h]of [[390,844],[844,390]]){await page.setViewportSize({width:w,height:h});for(const ship of ['corvette','destroyer','cruiser','carrier'])for(const view of ['near','far']){
 const options={ship,fleet:view==='near'?'tide':'ember',view,weather:'sunset',time:12,quality:'balanced'};
 const metrics=await page.evaluate(o=>window.naval.snapshot(o),options);await page.waitForTimeout(40);
 const file=`${ship}-${w}x${h}-${view}.jpg`;await page.screenshot({path:path.join(out,file),type:'jpeg',quality:86});cases.push({file,options,metrics});
}}
const report={at:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),offline:true,cases,errors,external,pass:cases.length===16&&errors.length===0&&external.length===0};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({pass:report.pass,cases:cases.length,errors,external}));if(!report.pass)process.exitCode=1;
