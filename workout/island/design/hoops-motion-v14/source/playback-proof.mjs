// SPDX-License-Identifier: CC0-1.0
// Wallclock playback verifies actual skinned-joint movement in every delivered GLB.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const base=path.join(root,'workout/island/design/hoops-motion-v14');
const catalog=JSON.parse(await fs.readFile(path.join(base,'runtime/catalog.json')));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{
 try{const target=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const bytes=await fs.readFile(target);res.setHeader('Content-Type',types[path.extname(target)]??'application/octet-stream');res.end(bytes);}catch{res.statusCode=404;res.end();}
});
let browser;
const delta=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/lib/chromium/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],headless:true});
 const page=await browser.newPage({viewport:{width:844,height:390}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/workout/island/design/hoops-motion-v14/preview.html`);
 await page.waitForFunction(()=>window.hoopsMotionPreview?.ready);
 const clips=[];
 for(const clip of catalog.clips){
  const duration=clip.durationSeconds??clip.duration,start=duration*.35;
  await page.evaluate(async({id,start})=>{const api=window.hoopsMotionPreview;await api.select(id);api.seek(start);api.setPlaying(true);},{id:clip.id,start});
  const before=await page.evaluate(()=>window.hoopsMotionPreview.poseSnapshot());
  await page.waitForTimeout(320);
  const after=await page.evaluate(()=>window.hoopsMotionPreview.poseSnapshot());
  const quaternionDelta=Math.max(...Object.keys(before.joints).map(name=>Math.min(delta(before.joints[name].quaternion,after.joints[name].quaternion),delta(before.joints[name].quaternion,after.joints[name].quaternion.map(v=>-v)))));
  const positionDelta=Math.max(...Object.keys(before.joints).map(name=>delta(before.joints[name].position,after.joints[name].position)));
  const bytes=await fs.readFile(path.join(base,'runtime',clip.asset));
  clips.push({id:clip.id,glbSha256:createHash('sha256').update(bytes).digest('hex'),beforeTime:before.time,afterTime:after.time,maxJointQuaternionDelta:quaternionDelta,maxJointPositionDeltaMeters:positionDelta,passed:quaternionDelta>.001&&positionDelta>.001&&before.time!==after.time});
 }
 const evidence={mode:'real requestAnimationFrame wallclock playback; no seek between observations',clipCount:clips.length,clips,errors,passed:clips.length===20&&clips.every(c=>c.passed)&&!errors.length};
 await fs.writeFile(path.join(base,'verification/playback.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({playbackPassed:evidence.passed,clipCount:clips.length,failed:clips.filter(c=>!c.passed).map(c=>c.id),errors}));
 if(!evidence.passed)process.exitCode=1;
}finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
