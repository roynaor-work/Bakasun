import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';

// Always render the preserved pre-expression sources. Existing shots/r9 stay untouched.
const base=fileURLToPath(new URL('.',import.meta.url));
const archive=path.join(base,'shots/faces/baseline-r9');
const manifest=JSON.parse(await readFile(path.join(archive,'source-hashes.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const runtimeSources=new Set(['index.html','scene.mjs','model.mjs','rounds.json']);
for(const name of [...runtimeSources,'three.module.js']){
 const file=name==='three.module.js'?path.join(base,name):path.join(archive,'source',name);
 if(sha(await readFile(file))!==manifest.hashes.source[name])throw Error('Preserved baseline source hash mismatch: '+name);
}
for(const [name,expected] of Object.entries(manifest.hashes.original)){
 if(sha(await readFile(path.join(archive,'original',name)))!==expected)throw Error('Preserved round 9 artifact hash mismatch: '+name);
}
const server=await new Promise(resolve=>{
 const s=http.createServer(async(req,res)=>{
  try{
   const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
   const file=name==='shots/metrics.json'?path.join(archive,'original','metrics.json'):
    runtimeSources.has(name)?path.join(archive,'source',name):name==='three.module.js'?path.join(base,name):null;
   if(!file){res.writeHead(404);res.end('Not found');return;}
   res.setHeader('Content-Type',name.endsWith('.json')?'application/json':name.endsWith('.html')?'text/html':'text/javascript');
   res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
 }).listen(0,'127.0.0.1',()=>resolve(s));
});
let browser;
try{
 const executablePath=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin=`http://127.0.0.1:${server.address().port}`;
 await page.goto(origin+'/?capture=1&round=9');
 await page.waitForFunction(()=>window.lab?.ready);
 await page.evaluate(()=>window.lab.setRound(9));
 const dir=path.join(archive,'fresh');await mkdir(dir,{recursive:true});
 const views=['front','side','back','frontRepeat','threeQuarter'];
 const captures={};
 for(const view of views){
  await page.evaluate(v=>window.lab.setView(v),view);
  for(const headOnly of [false,true]){
   await page.evaluate(v=>window.lab.headOnly(v),headOnly);
   const name=view+(headOnly?'-head':'')+'.png',buffer=await page.screenshot({path:path.join(dir,name)});
   const old=PNG.sync.read(await readFile(path.join(archive,'original',name))),fresh=PNG.sync.read(buffer);
   let changedPixels=0,maxChannelDifference=0;
   if(old.width!==fresh.width||old.height!==fresh.height)throw Error('Baseline image dimensions changed');
   for(let i=0;i<old.data.length;i+=4){let changed=false;for(let c=0;c<4;c++){const d=Math.abs(old.data[i+c]-fresh.data[i+c]);if(d)changed=true;maxChannelDifference=Math.max(maxChannelDifference,d);}if(changed)changedPixels++;}
   captures[name]={sha256:sha(buffer),width:fresh.width,height:fresh.height,changedPixelsFromOriginal:changedPixels,maxChannelDifference};
  }
  await page.evaluate(()=>window.lab.headOnly(false));
 }
 const triangleCounts=await page.evaluate(async()=>{
  const {targetModel}=await import('./model.mjs');
  const rounds=await (await fetch('./rounds.json')).json();
  const {root,body}=targetModel(rounds.find(p=>p.round===9));
  const count=(includeBody)=>{
   body.forEach(o=>o.visible=includeBody);
   const geometries=new Set();let uniqueSurfaceTriangles=0,submittedMeshTriangles=0,meshCount=0;
   root.traverseVisible(o=>{if(!o.isMesh)return;const triangles=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;submittedMeshTriangles+=triangles;meshCount++;if(!geometries.has(o.geometry.uuid)){geometries.add(o.geometry.uuid);uniqueSurfaceTriangles+=triangles;}});
   return {uniqueSurfaceTriangles,submittedMeshTriangles,meshCount,uniqueGeometryCount:geometries.size};
  };
  const full=count(true),headOnly=count(false);
  root.traverse(o=>{o.geometry?.dispose();});
  return {full,headOnly,meaning:'uniqueSurfaceTriangles counts each shared geometry once; submittedMeshTriangles includes the inverted outline shell. Counts are scene geometry submissions, not fragment work or measured FPS.'};
 });
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{window.lab.headOnly(false);window.lab.setView('front');});
 await page.screenshot({path:path.join(dir,'phone-front.png')});
 const mobile=await page.evaluate(async()=>{
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  const extension=gl.getExtension('WEBGL_debug_renderer_info');
  const renderer=extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const draw=()=>{window.lab.setView('front');gl.finish();};
  const warmupStart=performance.now();while(performance.now()-warmupStart<700){await frame();draw();}
  const start=performance.now(),intervals=[];let previous=start;
  while(performance.now()-start<3000||intervals.length<12){await frame();draw();const now=performance.now();intervals.push(now-previous);previous=now;}
  const sorted=[...intervals].sort((a,b)=>a-b),elapsedMs=intervals.reduce((n,v)=>n+v,0);
  return {viewport:[390,844],deviceScaleFactor:1,renderer,warmupMs:700,sampleMs:elapsedMs,frames:intervals.length,fps:1000*intervals.length/elapsedMs,medianFrameMs:sorted[Math.floor(sorted.length*.5)],p95FrameMs:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],gpuFinish:true,method:'requestAnimationFrame, one original full-r9 front render per frame plus gl.finish(); 700ms warmup and >=3000ms / >=12 measured intervals; software browser result, not physical-phone FPS'};
 });
 const parameters=JSON.parse(await readFile(path.join(archive,'original','parameters.json')));
 const report={round:9,status:'preserved-baseline',viewport:[1024,1024],camera:'Original orthographic ±2.25, elevation 0.08; fixed world lighting',views,parameters,triangleCounts,
  featureDimensions:{units:'model local units; ellipsoid full diameters before eye/ear group rotation',eyeOutline:[.452,.498,.156],eyeWhite:[.416,.456,.150],iris:[.244,.328,.058],pupil:[.142,.232,.036],earOuter:[.410,.460,.270],earInner:[.230,.290,.068],headProfileWidth:1.54*.99,headProfileHeight:1.95,eyeCenter:[.335*.99,-.23,.575],earGroupCenter:[.78*.99,-.45,-.025],eyeYRotationRadians:.21,earZRotationRadians:.17},
  browserVersion:browser.version(),executablePath,mobile,errors,captures};
 await writeFile(path.join(archive,'capture.json'),JSON.stringify(report,null,2)+'\n');
 if(errors.length)throw Error(errors.join('\n'));
 console.log(`Preserved r9: ${views.length} fixed views, ${triangleCounts.headOnly.uniqueSurfaceTriangles} head surface / ${triangleCounts.headOnly.submittedMeshTriangles} submitted triangles; ${Object.values(captures).reduce((n,c)=>n+c.changedPixelsFromOriginal,0)} changed pixels from original captures.`);
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
