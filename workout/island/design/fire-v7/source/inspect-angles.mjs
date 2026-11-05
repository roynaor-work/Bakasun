// Supplemental inspection of final compressed assets from all sides and six
// walking phases. Full screenshots are preserved in an archive, with a sheet.
import{chromium}from'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createServer}from'node:http';import{execFileSync}from'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'iterations/11/angles');await fs.mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={startedAt:new Date().toISOString(),errors:[],frames:[]};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await context.route(/^https?:/,r=>r.request().url().startsWith(origin)?r.continue():r.abort());await page.goto(origin+'/preview.html');await page.waitForFunction(()=>window.firePreview?.ready,{timeout:60000});await context.setOffline(true);
 await page.evaluate(()=>{firePreview.setPlaying(false);firePreview.setQuality('detail');});
 const tasks=[];for(let index=0;index<3;index++)for(let angle=0;angle<4;angle++)tasks.push({view:'fleet',index,yaw:angle*Math.PI/2,label:`fleet-${index}-side-${angle}`});
 for(let index=0;index<3;index++){
  for(let frame=0;frame<6;frame++)tasks.push({view:'crew',index,clip:'walk',time:frame/6,yaw:0,label:`crew-${index}-walk-${frame}`});
  tasks.push({view:'crew',index,clip:'role',time:.4,yaw:Math.PI,label:`crew-${index}-back`});
 }
 for(let index=0;index<5;index++)tasks.push({view:'buildings',index,damage:'ruined',yaw:Math.PI,label:`building-${index}-ruined-back`});
 for(const task of tasks){
  await page.evaluate(async t=>{if(firePreview.view!==t.view)await firePreview.setView(t.view);await firePreview.setIndex(t.index);if(t.damage)await firePreview.setDamage(t.damage);if(t.clip)firePreview.setClip(t.clip);await firePreview.seek(t.time||0);if(t.yaw)firePreview.orbit(t.yaw);firePreview.capture();},task);
  await page.waitForTimeout(100);const png='/tmp/fire-v7-angle.png',file=path.join(out,task.label+'.webp');await page.screenshot({path:png});
  execFileSync('python3',['-c','from PIL import Image;import sys;Image.open(sys.argv[1]).save(sys.argv[2],quality=94,method=6)',png,file]);report.frames.push({...task,file:task.label+'.webp'});
 }
 report.completedAt=new Date().toISOString();report.passed=!report.errors.length;await fs.writeFile(path.join(out,'inspection.json'),JSON.stringify(report,null,2)+'\n');
 execFileSync('python3',['-c',`from PIL import Image,ImageDraw
from pathlib import Path
import sys,math,zipfile
p=Path(sys.argv[1]);files=sorted(p.glob('*.webp'));tw,th,cols=156,362,6
sheet=Image.new('RGB',(tw*cols,math.ceil(len(files)/cols)*th),'#122333');draw=ImageDraw.Draw(sheet)
for i,f in enumerate(files):
 im=Image.open(f);im.thumbnail((tw,th-23));x=i%cols*tw;y=i//cols*th;sheet.paste(im,(x,y));draw.text((x+3,y+th-20),f.stem,fill='#ead6bc')
sheet.save(p/'contact-sheet.webp',quality=93,method=6)
with zipfile.ZipFile(p/'frames.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as z:
 for f in files:z.write(f,f.name)
with zipfile.ZipFile(p/'frames.zip')as z:
 assert z.testzip()is None
 for f in files:assert z.read(f.name)==f.read_bytes()
for f in files:f.unlink()
`,out]);
}finally{await browser.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({frames:report.frames.length,errors:report.errors}));}
