// Starts a loopback-only static server and checks the actual locally decoded GLBs.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {createRequire}=require('node:module');
const tooling=process.argv[process.argv.indexOf('--modules')+1];
if(!process.argv.includes('--modules')||!tooling)throw Error('--modules /absolute/tooling required');
const external=createRequire(path.resolve(tooling,'package.json'));
let playwright;try{playwright=external('playwright');}catch{playwright=require('playwright');}
const {chromium}=playwright,sharp=external('sharp');
const folder=path.resolve(__dirname,'..'),repo=path.resolve(folder,'../../../..');
const type={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.wasm':'application/wasm','.webp':'image/webp','.json':'application/json'};
(async()=>{
 const server=http.createServer(async(req,res)=>{
  try{const p=path.resolve(repo,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(repo+path.sep))throw Error('path');
   const data=await fs.readFile(p);res.writeHead(200,{'Content-Type':type[path.extname(p)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/workout/island/design/models2/preview.html`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
 page.on('response',r=>{if(r.status()>=400&& !r.url().endsWith('favicon.ico'))errors.push(`${r.status()} ${r.url()}`);});
 page.on('request',r=>requests.push(r.url()));
 await fs.mkdir(path.join(folder,'previews'),{recursive:true});
 const results=[];
 const measured=JSON.parse(await fs.readFile(path.join(folder,'validation.json'),'utf8'));
 for(const asset of ['basketball-arena','soccer-stadium','ski-slope']){
  await page.setViewportSize({width:1200,height:1000});
  await page.goto(`${base}?asset=${asset}&capture=1`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.previewReady||window.previewError);
  await sharp(await page.screenshot()).webp({quality:86}).toFile(path.join(folder,'previews',`${asset}-detail.webp`));
 }
 for(const [orientation,width,height]of [['portrait',390,844],['landscape',844,390]]){
  await page.setViewportSize({width,height});
  for(const asset of ['basketball-arena','soccer-stadium','ski-slope']){
   await page.goto(`${base}?asset=${asset}`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.previewReady||window.previewError);
   const state=await page.evaluate(()=>({ready:window.previewReady,error:window.previewError,metrics:window.previewMetrics,overflow:document.documentElement.scrollWidth>innerWidth}));
   if(!state.ready||state.error||state.overflow)throw Error(JSON.stringify(state));
   const expected=measured.assets.find(x=>x.asset===asset);
   if(expected.triangles!==state.metrics.triangles||expected.drawCallsEstimate!==state.metrics.drawCalls)throw Error('Renderer/statistics mismatch: '+asset);
   // Exercise pointer orbit and reset on both phone layouts.
   const before=await page.locator('canvas').screenshot();
   const rect=await page.locator('canvas').boundingBox();
   await page.mouse.move(rect.x+rect.width*.45,rect.y+rect.height*.45);await page.mouse.down();
   await page.mouse.move(rect.x+rect.width*.65,rect.y+rect.height*.50,{steps:8});await page.mouse.up();
   const after=await page.locator('canvas').screenshot();
   if(before.equals(after))throw Error('Orbit did not change the rendered view');
   await page.locator('#reset').click();
   const reset=await page.locator('canvas').screenshot();
   if(!reset.equals(before))throw Error('View reset failed');
   results.push({orientation,width,height,...state,orbitChangedImage:true,resetRestoredImage:true});
   await sharp(await page.screenshot()).webp({quality:82}).toFile(path.join(folder,'previews',`${asset}-${orientation}.webp`));
  }
 }
 // Every prop must decode and render too. Save a compact contact sheet.
 await page.setViewportSize({width:320,height:280});
 const names=(await fs.readdir(folder)).filter(x=>x.endsWith('.glb')).map(x=>x.slice(0,-4));
 const tiles=[];
 for(const asset of names.filter(x=>!['basketball-arena','soccer-stadium','ski-slope'].includes(x))){
  await page.goto(`${base}?asset=${asset}&capture=1`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.previewReady||window.previewError);
  const state=await page.evaluate(()=>({ready:window.previewReady,error:window.previewError,metrics:window.previewMetrics}));
  if(!state.ready||state.error)throw Error(JSON.stringify(state));results.push({asset,...state});
  const svg=Buffer.from(`<svg width="320" height="32"><rect width="320" height="32" fill="#183b48"/><text x="12" y="22" fill="white" font-family="sans-serif" font-size="16">${asset}</text></svg>`);
  const tile=await sharp(await page.screenshot()).extend({bottom:32,background:'#183b48'}).composite([{input:svg,left:0,top:280}]).png().toBuffer();tiles.push(tile);
 }
 await sharp({create:{width:960,height:Math.ceil(tiles.length/3)*312,channels:3,background:'#e0e8ed'}}).composite(tiles.map((input,i)=>({input,left:i%3*320,top:Math.floor(i/3)*312}))).webp({quality:80}).toFile(path.join(folder,'previews','props.webp'));
 const nonlocal=requests.filter(url=>!url.startsWith('http://127.0.0.1:')&&!url.startsWith('blob:')&&!url.startsWith('data:'));
 const report={allPassed:!errors.length&&!nonlocal.length,renderer:'Chromium WebGL / SwiftShader; deviceScaleFactor 1',errors,externalRequests:nonlocal,results};
 await fs.writeFile(path.join(folder,'browser-validation.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();await new Promise(resolve=>server.close(resolve));
 if(!report.allPassed)throw Error(JSON.stringify(report));console.log('PASS',results.length,'render checks');
})().catch(e=>{console.error(e);process.exit(1);});
