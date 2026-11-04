#!/usr/bin/env node
// Real rendered 100ms steps through catch-gated dribble -> hold -> dribble.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/hoops-v7-tools/package.json'),{chromium}=require('playwright'),sharp=require('sharp');
const option=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const iteration=option('--iteration'),role=option('--role','pg');
if(!/^\d{2}$/.test(iteration||''))throw Error('Supply --iteration NN');
const output=path.join(root,'iterations',iteration,'transition',role);await fs.mkdir(output,{recursive:true});
try{await fs.access(path.join(output,'capture.json'));throw Error('Evidence exists');}catch(e){if(e.code!=='ENOENT')throw e;}
const frozen=await fs.mkdtemp('/tmp/hoops-v7-transition-'),inputs=[],hash=b=>createHash('sha256').update(b).digest('hex');
async function freeze(folder=root,rel=''){for(const e of await fs.readdir(folder,{withFileTypes:true})){if(['iterations','verification','standalone.html'].includes(e.name))continue;const n=path.join(rel,e.name),p=path.join(folder,e.name),q=path.join(frozen,n);if(e.isDirectory()){await fs.mkdir(q,{recursive:true});await freeze(p,n);}else{const b=await fs.readFile(p);await fs.writeFile(q,b);inputs.push({file:n,bytes:b.length,sha256:hash(b)});}}}
await freeze();
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{try{const u=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}const p=path.resolve(frozen,'.'+(u==='/'?'/index.html':u));if(!p.startsWith(frozen+path.sep))throw Error('path');const b=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],externalRequests=[],frames=[],startedAtUtc=new Date().toISOString();
try{
 for(const viewport of[{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,deviceScaleFactor:1});await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();externalRequests.push(u);return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin+'/index.html?capture=1');await page.waitForFunction(()=>!!window.__hoopsLab,null,{timeout:120000});
  await page.evaluate(async role=>{const a=window.__hoopsLab;await a.ready;a.pause(true);a.selectRole(role);a.setLOD('high');a.selectAction('dribble_right',{immediate:true});a.seek(.30);a.setView('hands');a.selectAction('idle_hold',{immediate:false});a.setCamera({target:[-.10,.95,.20],distance:3.0,yaw:.30,pitch:0});a.render();},role);
  const size=`${viewport.width}x${viewport.height}`,tiles=[];
  for(let index=0;index<=28;index++){
   const diagnostics=await page.evaluate(async({index,role})=>{const a=window.__hoopsLab,actor=a.actors.find(x=>x.id===role);if(index>0)for(let step=0;step<12;step++)actor.controller.update(1/120);if(index===14){a.selectAction('dribble_right',{immediate:false});a.setCamera({target:[-.10,.95,.20],distance:3.0,yaw:.30,pitch:0});}a.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return actor.controller.getDiagnostics();},{index,role});
   const png=await page.locator('#stage').screenshot({animations:'disabled'}),webp=await sharp(png).webp({quality:94,effort:5}).toBuffer(),name=`${size}-${String(index).padStart(2,'0')}.webp`;
   await fs.writeFile(path.join(output,name),webp);frames.push({file:name,viewport,index,timeSeconds:index/10,diagnostics,bytes:webp.length,sha256:hash(webp)});
   if([0,3,5,7,9,11,14,16,18,20,24,28].includes(index)){
    const m=await sharp(png).metadata(),caption=Buffer.from(`<svg width="${m.width}" height="28"><rect width="100%" height="100%" fill="#141a1d"/><text x="12" y="18" fill="#d6e6de" font-family="monospace" font-size="11">${(index/10).toFixed(1)} s / ${diagnostics.action}</text></svg>`);
    const tile=await sharp({create:{width:m.width,height:m.height+28,channels:3,background:'#141a1d'}}).composite([{input:png,left:0,top:0},{input:caption,left:0,top:m.height}]).png().toBuffer();tiles.push({tile,width:m.width,height:m.height+28});
   }
  }
  const w=tiles[0].width,h=tiles[0].height,sheet=await sharp({create:{width:w*4,height:h*3,channels:3,background:'#141a1d'}}).composite(tiles.map((t,i)=>({input:t.tile,left:i%4*w,top:Math.floor(i/4)*h}))).webp({quality:94,effort:5}).toBuffer();await fs.writeFile(path.join(output,`sheet-${size}.webp`),sheet);
  await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
const pass=errors.length===0&&externalRequests.length===0&&frames.length===58;
await fs.writeFile(path.join(output,'capture.json'),JSON.stringify({schemaVersion:1,iteration,role,startedAtUtc,finishedAtUtc:new Date().toISOString(),source:frozen,inputs,scope:'Rendered actual controller in fixed100ms increments, internally12steps of1/120s. Hold requested at0.0s fromdribblephase.30; reverse requested at1.4s. These are not frame-rate measurements.',frames,errors,externalRequests,pass},null,2)+'\n');
const frameData=JSON.stringify(frames.map(f=>({file:f.file,time:f.timeSeconds,size:`${f.viewport.width}x${f.viewport.height}`,action:f.diagnostics.action,transition:f.diagnostics.transition}))).replaceAll('<','\\u003c');
await fs.writeFile(path.join(output,'flipbook.html'),`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>מעבר כדרור ואחיזה</title><style>body{margin:0;background:#141a1d;color:#e3e9df;font:15px Arial;text-align:center}main{max-width:900px;margin:auto;padding:18px}button,select,input{font:inherit;min-height:44px;margin:5px;background:#263936;color:#d4ebdf;border:1px solid #6a9281;border-radius:6px;padding:6px}img{max-width:100%;max-height:75vh;display:block;margin:10px auto}input{width:90%;padding:0}output{display:block;direction:ltr}</style><main><h1>כדרור → אחיזה → כדרור</h1><p>פריימים מרונדרים כל0.1שנייה. תחילת האחיזה מחכה לקליטת הכדור.</p><select id="size"><option>390x844</option><option>844x390</option></select><button id="play">ניגון הרצף</button><input id="seek" type="range" min="0" max="28" step="1" value="0"><output id="label"></output><img id="frame" alt="תמונת שלב המעבר"></main><script>const data=${frameData},get=id=>document.getElementById(id);let timer=null;function draw(){const x=data.find(f=>f.size===get('size').value&&Math.round(f.time*10)===Number(get('seek').value));get('frame').src=x.file;get('label').textContent=x.time.toFixed(1)+' s / '+x.action+(x.transition?' / transition':'');}get('seek').oninput=draw;get('size').onchange=draw;get('play').onclick=()=>{if(timer){clearInterval(timer);timer=null;get('play').textContent='ניגון הרצף';}else{if(Number(get('seek').value)>=28)get('seek').value='0';timer=setInterval(()=>{const n=Number(get('seek').value)+1;if(n>28){clearInterval(timer);timer=null;get('play').textContent='ניגון מהתחלה';return;}get('seek').value=String(n);draw();},100);get('play').textContent='השהיה';}};draw();</script></html>`);
console.log(JSON.stringify({pass,frames:frames.length,errors,externalRequests}));if(!pass)process.exitCode=1;
