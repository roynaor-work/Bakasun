// SPDX-License-Identifier: CC0-1.0
// Live playback evidence from the actual rendered skinned skeleton.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const base=path.join(root,'workout/island/design/hoops-motion-v13');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{
 try{
  const target=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const bytes=await fs.readFile(target);res.setHeader('Content-Type',types[path.extname(target)]??'application/octet-stream');res.end(bytes);
 }catch{res.statusCode=404;res.end();}
});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/lib/chromium/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/workout/island/design/hoops-motion-v13/preview.html`);
 await page.waitForFunction(()=>window.hoopsMotionPreview?.ready);
 await page.evaluate(()=>{const api=window.hoopsMotionPreview;api.seek(.07);api.setPlaying(true);});
 const before=await page.evaluate(()=>window.hoopsMotionPreview.poseSnapshot());
 await page.waitForTimeout(260);
 const after=await page.evaluate(()=>window.hoopsMotionPreview.poseSnapshot());
 const delta=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 const quaternionDelta=Math.max(...Object.keys(before.joints).map(name=>Math.min(delta(before.joints[name].quaternion,after.joints[name].quaternion),delta(before.joints[name].quaternion,after.joints[name].quaternion.map(v=>-v)))));
 const positionDelta=Math.max(...Object.keys(before.joints).map(name=>delta(before.joints[name].position,after.joints[name].position)));
 const clipBytes=await fs.readFile(path.join(base,'runtime/clips/run.glb'));
 const evidence={clip:'run',glbSha256:createHash('sha256').update(clipBytes).digest('hex'),mode:'real browser requestAnimationFrame wallclock playback, without seek between observations',before,after,maxJointQuaternionDelta:quaternionDelta,maxJointPositionDeltaMeters:positionDelta,errors,passed:!errors.length&&quaternionDelta>.01&&positionDelta>.01&&before.time!==after.time};
 await fs.writeFile(path.join(base,'verification/playback.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({passed:evidence.passed,quaternionDelta,positionDelta}));
 if(!evidence.passed)process.exitCode=1;
}finally{
 await browser?.close();
 if(server.listening)await new Promise(resolve=>server.close(resolve));
}
