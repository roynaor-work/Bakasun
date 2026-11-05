// Inspect final compressed meshes at mobile aspect ratios. No render substitutes.
import {chromium} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath}from'node:url';import{createServer}from'node:http';import{execFileSync}from'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),round=process.argv[2]||'02';
const out=path.join(root,'iterations',round,'details');await fs.mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const records=[],errors=[];
try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1}),page=await context.newPage();
  await context.route(/^https?:/,r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin+'/preview.html');await page.waitForFunction(()=>window.firePreview?.ready,{timeout:60000});
  await page.evaluate(async()=>{firePreview.setPlaying(false);firePreview.setQuality('detail');await firePreview.seek(.5);});
  const tasks=[];
  for(let i=0;i<3;i++)tasks.push({view:'fleet',index:i});
  for(let i=0;i<3;i++)tasks.push({view:'crew',index:i});
  for(let i=0;i<5;i++)for(const damage of ['intact','scorched','burning','ruined'])tasks.push({view:'buildings',index:i,damage});
  for(let i=0;i<5;i++)tasks.push({view:'effects',index:i});
  for(const task of tasks){
    await page.evaluate(async task=>{const p=firePreview;if(p.view!==task.view)await p.setView(task.view);await p.setIndex(task.index);if(task.damage)await p.setDamage(task.damage);p.capture();},task);
    await page.waitForTimeout(100);
    const name=`${task.view}-${task.index}${task.damage?'-'+task.damage:''}`;
    const png='/tmp/fire-v7-gallery-'+name+'.png',file=path.join(out,name+'.webp');await page.screenshot({path:png});
    execFileSync('python3',['-c','from PIL import Image;import sys;Image.open(sys.argv[1]).save(sys.argv[2],quality=94,method=6)',png,file]);
    const snapshot=await page.evaluate(()=>({triangles:firePreview.triangles,drawCalls:firePreview.drawCalls,geometry:firePreview.memory.geometries,error:firePreview.error}));
    records.push({...task,file:name+'.webp',...snapshot});console.log(name,snapshot.triangles);
  }
  await fs.writeFile(path.join(out,'gallery.json'),JSON.stringify({capturedAt:new Date().toISOString(),viewport:{width:390,height:844},records,errors},null,2)+'\n');
  execFileSync('python3',['-c',`from PIL import Image,ImageDraw
import pathlib,sys,math
p=pathlib.Path(sys.argv[1]);files=list(p.glob('*.webp'));cols=7;tw,th=156,362
out=Image.new('RGB',(cols*tw,math.ceil(len(files)/cols)*th),'#13202d');d=ImageDraw.Draw(out)
for i,f in enumerate(files):
 im=Image.open(f);im.thumbnail((tw,th-24));x=i%cols*tw;y=i//cols*th;out.paste(im,(x,y));d.text((x+3,y+th-21),f.stem,fill='#eee0ce')
out.save(p/'contact-sheet.webp',quality=92,method=6)
`,out]);
}finally{await browser.close();await new Promise(r=>server.close(r));}
