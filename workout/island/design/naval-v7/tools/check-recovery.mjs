/** Deterministic pixel recovery and context loss during cold Draco loading. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const round=process.argv[2]||'10';if(!/^\d\d$/.test(round))throw new Error('Invalid iteration');
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const report={at:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),offline:true,errors:[],checks:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,offline:true});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
async function recover(p){return p.evaluate(async()=>{
 const canvas=document.querySelector('#sea'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl'),ext=gl.getExtension('WEBGL_lose_context');
 if(!ext)throw new Error('Context loss extension unavailable in verification browser');
 const restored=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('restore timeout')),10000);canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);resolve();},{once:true});});
 ext.loseContext();await new Promise(r=>setTimeout(r,450));ext.restoreContext();await restored;
});}
await page.setContent(html);await page.waitForFunction(()=>window.naval?.ready,null,{timeout:60000});
const options={view:'near',quality:'high',time:12};
await page.evaluate(o=>window.naval.snapshot(o),options);await page.screenshot({path:path.join(root,`iterations/${round}/recovery-before.png`)});report.before=await page.evaluate(()=>window.naval.metrics());
await recover(page);await page.evaluate(o=>window.naval.snapshot(o),options);await page.screenshot({path:path.join(root,`iterations/${round}/recovery-after.png`)});report.after=await page.evaluate(()=>window.naval.metrics());
report.checks.push({label:'Sky probe count and GPU texture count recover',pass:report.before.textures===report.after.textures&&report.after.contextRestores===1&&!report.after.contextLost});
await page.evaluate(()=>window.naval.snapshot({view:'far',quality:'high',time:12}));
report.disposed=await page.evaluate(()=>{window.naval.dispose();const m=window.naval.metrics();return{geometries:m.geometries,textures:m.textures};});
report.checks.push({label:'Far scenery textures dispose after restoration',pass:report.disposed.geometries===0&&report.disposed.textures===0});await context.close();

const cold=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,offline:true});
await cold.addInitScript(()=>{
 const Native=window.Worker;window.Worker=class extends Native{
  postMessage(message,transfer){
   if(message?.type==='decode'&&!window.__navalDelayedDecode){window.__navalDelayedDecode=true;setTimeout(()=>super.postMessage(message,transfer),900);}
   else super.postMessage(message,transfer);
  }
 };
});
const cp=await cold.newPage();cp.on('pageerror',e=>report.errors.push(String(e)));await cp.setContent(html);
await cp.waitForFunction(()=>window.__navalDelayedDecode&&window.naval&&!window.naval.ready,null,{timeout:15000});
report.startupBefore=await cp.evaluate(()=>({ready:window.naval.ready,loading:window.naval.metrics().state.loading}));
await recover(cp);await cp.waitForFunction(()=>window.naval?.ready&&!window.naval.metrics().contextLost,null,{timeout:60000});await cp.waitForTimeout(250);
report.startupAfter=await cp.evaluate(()=>window.naval.metrics());report.checks.push({label:'Context loss during delayed first Draco decode recovers',pass:report.startupBefore.loading&&report.startupAfter.contextRestores===1&&report.startupAfter.drawCalls>0});
await cp.evaluate(()=>window.naval.dispose());await cold.close();
report.pass=report.errors.length===0&&report.checks.every(c=>c.pass);await fs.writeFile(path.join(root,'verification/recovery-check.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({pass:report.pass,checks:report.checks,errors:report.errors},null,2));if(!report.pass)process.exitCode=1;
