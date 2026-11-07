// Racing wheel coverage in a real browser (844x390): which left-half points hit the steering pad, and what a touch does.
// Usage: node tools/racing-wheel-browser.mjs [out.json]
import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,stat,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(workout,p.slice(1));if(!f.startsWith(workout)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const out={};
for(const mode of ['v1','old']){
 const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await ctx.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/island/tools/perf-racing.html?shot=1&hold=1&frames=10${mode==='old'?'&racingWheel=0':''}`);
 await page.waitForFunction(()=>window.__session?.snapshot?.renderMetrics?.frames>1,null,{timeout:240000});await page.waitForTimeout(500);
 // 1. coverage: every grid point asks the browser what a touch there would hit
 const cover=await page.evaluate(()=>{const res={left:{total:0,steer:0,other:{}},right:{total:0,steer:0,other:{}}};
  for(let x=4;x<844;x+=14)for(let y=4;y<390;y+=14){const side=x<422?'left':'right',el=document.elementFromPoint(x,y),cls=el?.closest('.racing-pad,.racing-action,.racing-auto,.racing-credit,.game-header button')?.className||el?.className||el?.tagName;
   res[side].total++;if(el?.closest('.racing-pad,.racing-steer'))res[side].steer++;else res[side].other[String(cls).split(' ')[0]]=(res[side].other[String(cls).split(' ')[0]]||0)+1;}return res;});
 // 2. a real touch at several left-half points: does the wheel move under the thumb, and what steer does a 40px drag give
 const cdp=await ctx.newCDPSession(page),touches=[];
 for(const [x,y] of [[20,20],[200,60],[60,330],[300,200],[410,380]]){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await page.waitForTimeout(80);
  const down=await page.evaluate(()=>{const w=document.querySelector('.racing-wheel'),s=document.querySelector('.racing-steering');const r=w.getBoundingClientRect();return {active:s.classList.contains('active'),cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)};});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:Math.min(x+40,420),y,id:1}]});await page.waitForTimeout(80);
  const moved=await page.evaluate(()=>({turn:document.querySelector('.racing-wheel').style.getPropertyValue('--turn'),steer:window.__session.debug.input.sample().steer}));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80);
  const up=await page.evaluate(()=>({active:document.querySelector('.racing-steering').classList.contains('active'),steer:window.__session.debug.input.sample().steer}));
  touches.push({at:[x,y],down,moved,up});
 }
 out[mode]={cover,touches};await ctx.close();
}
await browser.close();server.close();
const pct=(a,b)=>Math.round(a/b*1000)/10;
for(const m of Object.keys(out)){const c=out[m].cover;console.log(m,'left half steers:',pct(c.left.steer,c.left.total)+'%','of',c.left.total,'| others on left:',JSON.stringify(c.left.other),'| right half steers:',pct(c.right.steer,c.right.total)+'%');
 for(const t of out[m].touches)console.log(' touch',t.at.join(','),'wheel',t.down.active,`(${t.down.cx},${t.down.cy})`,'| drag40 steer',t.moved.steer,t.moved.turn,'| after release',t.up.active,t.up.steer);}
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(out,null,1));
