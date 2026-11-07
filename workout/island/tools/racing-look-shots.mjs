// Screenshots of the real racing session (844x390) via tools/perf-racing.html.
// Usage: node tools/racing-shots.mjs <outDir> [extra query] [touch=x,y]  (touch: press that point on the page and hold before the shot)
import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,stat} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=process.argv[2],extra=process.argv[3]||'',touch=(process.argv[4]||'').replace('touch=','').split(',').filter(Boolean).map(Number);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(workout,p.slice(1));if(!f.startsWith(workout)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
const page=await ctx.newPage();page.on('pageerror',e=>console.log('ERR',e.message));page.on('console',m=>{if(m.text().startsWith('formula'))console.log(m.text())});
await page.goto(`http://127.0.0.1:${server.address().port}/island/tools/perf-racing.html?shot=1&${/hold=/.test(extra)?'':'hold=1&'}frames=10${extra?'&'+extra:''}`);
await page.waitForFunction(()=>window.__session?.snapshot?.renderMetrics?.frames>1,null,{timeout:240000});if(/at=/.test(extra))await page.waitForFunction(()=>window.__perf?.shot,null,{timeout:600000});
await page.waitForTimeout(1500);
await page.screenshot({path:path.join(out,process.env.SHOT_NAME||'idle.png')});
if(touch.length===2){
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch[0],y:touch[1],id:1}]});
 await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'touch-down.png')});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch[0]+50,y:touch[1],id:1}]});
 await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'touch-right.png')});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
await browser.close();server.close();
