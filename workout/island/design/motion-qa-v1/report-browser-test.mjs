// SPDX-License-Identifier: CC0-1.0 — HTTP/browser verification of generated diagnostic pages.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {generate} from './run.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../../..');
let pw;
for(const candidate of [process.env.HOCKEY_PLAYWRIGHT,'playwright','/opt/codex/runtimes/cua/lib/node_modules/playwright-core/index.mjs','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'].filter(Boolean)){try{pw=await import(candidate);break;}catch{}}
if(!pw)throw Error('Playwright is required for the report browser check.');
const evidence={generatedAt:new Date().toISOString(),license:'CC0-1.0',pages:[],checkedLinks:[],errors:[],measurementHashes:{}};
const inputs=['run.mjs','report.mjs','style.css','report-ui.mjs','hockey-source.mjs','metrics.mjs','skating.mjs','../hockey-v2/clips.json'];
const inputHashes=()=>Promise.all(inputs.map(async file=>({path:resolve(here,file).slice(root.length+1),sha256:createHash('sha256').update(await readFile(resolve(here,file))).digest('hex')})));
evidence.inputsBefore=await inputHashes();
const stages=[['qa',false],['legacy',true]];
for(const [name,legacy]of stages){
 const out=resolve(here,`../hockey-v2/evidence/${name}`);
 const previous=JSON.parse(await readFile(resolve(out,'report.json'),'utf8'));
 const report=await generate({out,only:['hockey-v2'],legacy});
 const measured=r=>r.libraries.map(l=>({id:l.id,clips:l.clips.map(c=>({id:c.id,score:c.score,coverage:c.coverage,metrics:c.metrics}))}));
 assert.equal(JSON.stringify(measured(report)),JSON.stringify(measured(previous)),'HTML fixes must not alter serialized measurements: '+name);
 evidence.measurementHashes[name]=createHash('sha256').update(JSON.stringify(measured(report))).digest('hex');
}
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.md':'text/plain','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
 const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await pw.chromium.launch({executablePath:process.env.HOCKEY_CHROMIUM??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),checked=new Set();
page.on('pageerror',error=>evidence.errors.push({kind:'pageerror',message:error.message,url:page.url()}));
page.on('console',message=>{if(message.type()==='error')evidence.errors.push({kind:'console',message:message.text(),url:page.url()});});
page.on('response',response=>{if(response.status()>=400)evidence.errors.push({kind:'response',status:response.status(),url:response.url()});});
async function visit(path,{report=false}={}){
 const url=origin+'/'+path;
 const response=await page.goto(url,{waitUntil:'load'});assert.equal(response.status(),200);
 await page.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(16, 23, 34)');
 const links=await page.evaluate(()=>[...document.querySelectorAll('a[href],link[href],script[src],img[src]')].map(el=>el.href??el.src).filter(url=>url.startsWith(location.origin)));
 for(const link of links){const clean=link.split('#')[0];if(checked.has(clean))continue;checked.add(clean);const response=await page.request.get(clean);if(response.status()!==200)evidence.errors.push({kind:'link',status:response.status(),url:clean});}
 if(report){
  await page.locator('#search').fill('skate_turn_180');
  assert.equal(await page.locator('#clipTable tbody tr:visible').count(),1);
  await page.locator('#search').fill('');await page.locator('#sort').selectOption('score-desc');
  const values=await page.locator('#clipTable tbody tr').evaluateAll(rows=>rows.map(row=>Number(row.dataset.score)));
  assert.deepEqual(values,[...values].sort((a,b)=>b-a));
 }
 evidence.pages.push({path,status:response.status(),styled:true,reportControlsChecked:report});
}
try{
 for(const [stage]of stages){
  const prefix=`workout/island/design/hockey-v2/evidence/${stage}`;
  await visit(prefix+'/report.html',{report:true});
  const r=JSON.parse(await readFile(resolve(root,prefix,'report.json'),'utf8'));
  for(const clip of r.libraries[0].clips)await visit(prefix+'/'+clip.htmlPath);
 }
 evidence.checkedLinks=[...checked].map(url=>url.slice(origin.length));
 assert.deepEqual(evidence.errors,[]);
 evidence.inputsAfter=await inputHashes();assert.deepEqual(evidence.inputsAfter,evidence.inputsBefore);
 evidence.assertions=['All report and clip pages return HTTP 200.','All local links and CSS/JS/image dependencies return HTTP 200.','No page errors, console errors or HTTP errors.','Both reports render local styles and filter/sort correctly.','HTML fixes preserve every serialized score, coverage and metric object.','All measured motion and renderer inputs retain their SHA-256 before/after testing.'];
 evidence.passed=true;
}finally{
 await browser.close();await new Promise(r=>server.close(r));
 await writeFile(resolve(here,'report-browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
}
console.log(JSON.stringify({passed:evidence.passed,pages:evidence.pages.length,links:evidence.checkedLinks.length,errors:evidence.errors.length,measurementHashes:evidence.measurementHashes}));
