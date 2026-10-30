import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
if(!option('--out'))throw Error('Pass --out /path/to/temporary-shots outside the package.');
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(here,'../..');
const out=path.resolve(option('--out'));assert.ok(!out.startsWith(here+path.sep),'Keep screenshots outside variants/');
await fs.mkdir(out,{recursive:true});
const require=createRequire(path.resolve(path.dirname(process.execPath),'../node_modules/package.json'));
let playwright;
if(process.env.PLAYWRIGHT_MODULE){
 let p=path.resolve(process.env.PLAYWRIGHT_MODULE);if((await fs.stat(p)).isDirectory())p=path.join(p,'index.mjs');
 playwright=await import(pathToFileURL(p).href);
}else{try{playwright=await import('playwright');}catch{playwright=require('playwright');}}
let sharp;try{sharp=(await import('sharp')).default;}catch{sharp=require('sharp');}
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.md':'text/plain','.json':'application/json','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
 try{
  const target=await fs.realpath(path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname)));
  assert.ok(target.startsWith(root+path.sep));
  const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await playwright.chromium.launch({channel:option('--channel','chrome'),headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1100,height:800},deviceScaleFactor:1}),errors=[],external=[];
 const origin=`http://127.0.0.1:${server.address().port}`;
 await page.route('**/*',route=>{
  const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
  external.push(url);return route.abort();
 });
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${origin}/design/variants/preview.html`);
 await page.waitForFunction(()=>window.variantPreview,{timeout:20000});await page.evaluate(()=>window.variantPreview.ready);
 await page.addStyleTag({content:'#stage button{visibility:hidden}'});
 const ids=await page.evaluate(()=>window.variantPreview.outfits.map(o=>o.id)),front=[],back=[];
 const tile=async(id,i,kind)=>{
  const shot=await page.locator('canvas').screenshot();await fs.writeFile(path.join(out,`${id}-${kind}.png`),shot);
  return [{input:await sharp(shot).resize(210,235,{fit:'cover'}).png().toBuffer(),left:(i%8)*210,top:Math.floor(i/8)*265},
   {input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="30"><text x="105" y="20" text-anchor="middle" fill="#d9eddc" font-size="14" font-family="sans-serif">${id}</text></svg>`),left:(i%8)*210,top:Math.floor(i/8)*265+235}];
 };
 for(const [i,id] of ids.entries()){
  await page.evaluate(async id=>{const v=window.variantPreview;await v.selectOutfit(id);v.model.rotation.y=.24;v.render();},id);
  front.push(...await tile(id,i,'front'));
  await page.evaluate(()=>{const v=window.variantPreview;v.model.rotation.y=Math.PI+.24;v.render();});
  back.push(...await tile(id,i,'back'));
 }
 for(const [name,tiles] of [['overview',front],['back',back]])await sharp({create:{width:1680,height:795,channels:3,background:'#101f29'}}).composite(tiles).webp({quality:83}).toFile(path.join(out,name+'.webp'));
 const paletteTiles=[];
 for(const [row,kind] of ['skin','hair'].entries())for(let i=0;i<6;i++){
  await page.evaluate(async({kind,i})=>{
   const v=window.variantPreview;
   document.getElementById('skin').value=kind==='skin'?v.palettes.skins[i].id:v.palettes.defaultSkin;
   document.getElementById('hair').value=kind==='hair'?v.palettes.hair[i].id:v.palettes.defaultHair;
   await v.selectOutfit('soccer-01');v.model.rotation.y=.24;v.render();
  },{kind,i});
  const shot=await page.locator('canvas').screenshot();
  paletteTiles.push({input:await sharp(shot).resize(210,235,{fit:'cover'}).png().toBuffer(),left:i*210,top:row*265});
 }
 await sharp({create:{width:1260,height:530,channels:3,background:'#101f29'}}).composite(paletteTiles).webp({quality:85}).toFile(path.join(out,'palettes.webp'));
 await page.addStyleTag({content:'#stage button{visibility:visible}'});
 const viewports=[{width:390,height:844},{width:844,height:390}],screens=[];
 for(const viewport of viewports){
  await page.setViewportSize(viewport);await page.evaluate(()=>{scrollTo(0,0);window.variantPreview.render();});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);
  await page.screenshot({path:path.join(out,`${viewport.width}x${viewport.height}.png`),fullPage:true});screens.push(viewport);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const report={browser:await browser.version(),renderer:'Chrome WebGL via SwiftShader',outfits:ids,frontViews:ids.length,backViews:ids.length,
  skinViews:6,hairViews:6,viewports:screens,horizontalOverflow:false,pageErrors:errors,externalRequests:external};
 await fs.writeFile(path.join(out,'browser-validation.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
