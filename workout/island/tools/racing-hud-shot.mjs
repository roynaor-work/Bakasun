// HUD screenshots of the racing session at 844x390 (gear cluster, shift lights, ERS meter) through tools/perf-racing.html, with the race frozen at a chosen
// second. Usage: node tools/racing-hud-shot.mjs <outDir> [seconds=12] [query]   (CHROMIUM_PATH optional). Writes <outDir>/hud-<seconds>s.png and a crop of the dial.
import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=path.resolve(process.argv[2]||'.'),at=Number(process.argv[3]||12),extra=process.argv[4]||'';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.mp3':'audio/mpeg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(workout,p.slice(1));if(!f.startsWith(workout)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await ctx.newPage();page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/island/tools/perf-racing.html?shot=1&at=${at}&frames=10${extra}`);
await page.waitForFunction(()=>window.__perf?.shot,null,{timeout:600000});await page.waitForTimeout(400);
await mkdir(out,{recursive:true});
await page.screenshot({path:path.join(out,`hud-${at}s.png`)});
const box=await page.evaluate(()=>{const r=document.querySelector('.racing-readout').getBoundingClientRect(),e=document.querySelector('.racing-energy').getBoundingClientRect();return {x:Math.max(0,Math.min(r.left,e.left)-70),y:Math.max(0,Math.min(r.top,e.top)-30),w:Math.max(r.right,e.right)-Math.min(r.left,e.left)+90,h:Math.max(r.bottom,e.bottom)-Math.min(r.top,e.top)+40};});
await page.screenshot({path:path.join(out,`hud-${at}s-dial.png`),clip:{x:box.x,y:box.y,width:box.w,height:box.h}});
const state=await page.evaluate(()=>{const s=window.__session.snapshot,g=document.querySelector('.racing-gearbox');return {time:s.time,speed:s.player.speed,gear:s.player.gear,rpm:s.player.rpm,nitro:s.player.nitro,lights:g?.dataset.lights,shift:g?.dataset.shift,gearText:g?.querySelector('.racing-gear')?.textContent,ersTag:document.querySelector('.racing-energy-tag')?.textContent,full:document.querySelector('.racing-energy')?.dataset.full,audio:s.audioMetrics};});
console.log(JSON.stringify(state));await writeFile(path.join(out,`hud-${at}s.json`),JSON.stringify(state,null,1));
await browser.close();server.close();
