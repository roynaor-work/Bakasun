// Uses installed Playwright; does not add dependencies to the main repository.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
const require=createRequire(import.meta.url);
const {PNG}=require(process.env.PNGJS_MODULE || '/opt/codex/cua_node/lib/node_modules/pngjs/lib/png.js');
const root=fileURLToPath(new URL('../',import.meta.url)),verification=path.join(root,'verification');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary','.md':'text/plain'};
const server=createServer(async(req,res)=>{
 try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);if(!file.startsWith(root)){res.writeHead(403).end();return;}const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[],errors=[],external=[],httpFailures=[];
const check=(name,passed,details)=>results.push({check:name,passed:!!passed,...(details===undefined?{}:{details})});
let fingerprints={};
async function page(options={}){
 const p=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1,...options});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 p.on('response',r=>{if(r.status()>=400)httpFailures.push({url:r.url(),status:r.status()});});
 await p.route('**/*',r=>{if(r.request().url().startsWith(base+'/'))return r.continue();external.push(r.request().url());return r.abort();});
 await p.goto(base+'/preview.html');await p.waitForFunction(()=>window.seaPreview?.state.ready,null,{timeout:60000});
 return p;
}
async function snapshot(p,name){await p.screenshot({path:path.join(verification,name+'.png'),animations:'disabled'});}
try{
 const p=await page();
 check('844x390 canvas',await p.evaluate(()=>JSON.stringify(window.seaPreview.inspect().canvas)==='[844,390]'));
 check('ten local GLBs render',await p.evaluate(()=>window.seaPreview.inspect().models.length===10));
 for(const mode of ['day','sunset','night']){
  await p.locator(`[data-mode="${mode}"]`).click();
  for(const wave of ['calm','breeze','rough']){
   await p.locator(`[data-wave="${wave}"]`).click();await p.evaluate(()=>window.seaPreview.at(1.25));
   check(mode+' / '+wave+' controls',await p.evaluate(([m,w])=>window.seaPreview.state.mode===m&&window.seaPreview.state.wave===w,[mode,wave]));
  }
  await p.locator('[data-wave="breeze"]').click();await p.evaluate(()=>window.seaPreview.at(1.25));
  await snapshot(p,mode+'-844x390');
  const raw=PNG.sync.read(await p.locator('#sea').screenshot());
  let sum=0;for(let i=0;i<raw.data.length;i+=4)sum+=raw.data[i]+raw.data[i+1]+raw.data[i+2];fingerprints[mode]=sum;
 }
 check('day sunset night produce different pixels',new Set(Object.values(fingerprints)).size===3,fingerprints);
 const geometryBaseline=await p.evaluate(()=>window.seaPreview.inspect().memory.geometries);
 await p.locator('[data-mode="sunset"]').click();await p.locator('[data-wave="rough"]').click();await p.evaluate(()=>window.seaPreview.at(1.25));await snapshot(p,'rough-844x390');
 await p.locator('[data-wave="breeze"]').click();
 for(let i=0;i<4;i++){
  await p.evaluate(()=>window.seaPreview.at(1.25));await p.locator('#splash').click();
  check('splash variant '+(i+1),await p.evaluate(v=>window.seaPreview.state.impact===v+1&&window.seaPreview.inspect().effects===1,i));
  await snapshot(p,'splash-'+(i+1)+'-844x390');
 }
 await p.evaluate(()=>window.seaPreview.at(1.25));await p.locator('#column').click();
 check('near miss creates column and ring',await p.evaluate(()=>window.seaPreview.inspect().effects===1));await snapshot(p,'near-miss-844x390');
 await p.evaluate(()=>window.seaPreview.advance(1.3));check('one-shot effects expire',await p.evaluate(()=>window.seaPreview.inspect().effects===0));
 await p.evaluate(()=>window.seaPreview.at(0));const start=PNG.sync.read(await p.locator('#sea').screenshot());
 await p.evaluate(()=>window.seaPreview.at(4));const end=PNG.sync.read(await p.locator('#sea').screenshot());
 let maximum=0,different=0;
 for(let y=190;y<315;y++)for(let x=0;x<844;x++)for(let c=0;c<3;c++){const i=(y*844+x)*4+c,d=Math.abs(start.data[i]-end.data[i]);maximum=Math.max(maximum,d);if(d)different++;}
 check('actual rendered four-second water loop',maximum<=1,{maximumRGBDelta:maximum,differentChannels:different,region:[0,190,844,125]});
 await p.locator('#pause').click();const t=await p.evaluate(()=>window.seaPreview.state.time);
 await p.waitForFunction(t=>window.seaPreview.state.time>t+.15,t);
 check('animation resumes',await p.evaluate(t=>!window.seaPreview.state.paused&&window.seaPreview.state.time>t,t));
 await p.locator('#pause').click();check('pause button',await p.evaluate(()=>window.seaPreview.state.paused));
 await p.evaluate(()=>{window.seaPreview.pause(false);for(let i=0;i<40;i++)window.seaPreview.impact(i%2===0);window.seaPreview.pause(true);});
 check('effect pool bounded at twelve',await p.evaluate(()=>window.seaPreview.inspect().effects===12));
 await p.evaluate(()=>window.seaPreview.at(1.25));
 const clean=await p.evaluate(()=>window.seaPreview.inspect());
 check('effect geometries return to baseline',clean.memory.geometries===geometryBaseline,{before:geometryBaseline,after:clean.memory.geometries});
 await p.locator('#catalog').click();check('catalog opens',await p.locator('#asset-panel').isVisible());
 await snapshot(p,'catalog-844x390');await p.keyboard.press('Escape');check('catalog Escape and focus',await p.locator('#asset-panel').isHidden()&&await p.locator('#catalog').evaluate(n=>n===document.activeElement));
 for(const size of [[740,360],[390,844],[320,568]]){
  await p.setViewportSize({width:size[0],height:size[1]});
  check('no overflow '+size.join('x'),await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight));
  check('all controls within viewport '+size.join('x'),await p.locator('header button,.sea-state button,footer button').evaluateAll(ns=>ns.every(n=>{const b=n.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;})));
  if(size[0]===390)await snapshot(p,'portrait-390x844');
 }
 const reduced=await page({reducedMotion:'reduce'});check('reduced motion starts paused',await reduced.evaluate(()=>window.seaPreview.state.paused));await reduced.close();
 const props=await browser.newPage({viewport:{width:1260,height:840},deviceScaleFactor:1});
 props.on('pageerror',e=>errors.push(e.message));
 await props.goto(base+'/source/model-contact.html');await props.waitForFunction(()=>window.propsReady?.count===9);
 check('nine original models render in contact sheet',await props.evaluate(()=>window.propsReady.count===9));
 await snapshot(props,'models-1260x840');await props.close();
 check('no JavaScript or WebGL errors',errors.length===0,errors);
 check('no HTTP failures',httpFailures.length===0,httpFailures);
 check('no external requests; offline assets',external.length===0,external);
 const report={passed:results.every(r=>r.passed),environment:'Chromium / ANGLE SwiftShader software renderer; no physical-device FPS claim',checks:results.length,sourceSha256:null,sceneAtRest:clean,results};
 const {createHash}=await import('node:crypto');report.sourceSha256={};
 for(const file of ['preview.html','preview.js','preview.css','manifest.json'])report.sourceSha256[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
 await writeFile(path.join(verification,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,checks:report.checks,failures:results.filter(r=>!r.passed),sceneAtRest:clean},null,2));
 if(!report.passed)process.exitCode=1;
}finally{await browser.close();await new Promise(r=>server.close(r));}
