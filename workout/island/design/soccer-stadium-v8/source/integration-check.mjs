// Copy only runtime/ into a fresh host, independent of the repository tree.
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),temporary=await fs.mkdtemp('/tmp/stadium-v8-integration-');
await fs.cp(path.join(root,'runtime'),path.join(temporary,'runtime'),{recursive:true});
await fs.writeFile(path.join(temporary,'index.html'),'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;position:relative;overflow:hidden}canvas{display:block;width:100%;height:100%}</style><script type="module" src="./host.mjs"></script>');
await fs.writeFile(path.join(temporary,'host.mjs'),`
import {THREE,loadStadium} from './runtime/stadium.mjs';
import {frameBroadcastCamera} from './runtime/cameras.mjs';
import {createBroadcastHUD} from './runtime/broadcast.mjs';
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
document.body.append(renderer.domElement);const stadium=await loadStadium({scene}),hud=createBroadcastHUD(document.body);await hud.ready;
function draw(lod=0){renderer.setSize(innerWidth,innerHeight);frameBroadcastCamera(camera,{aspect:innerWidth/innerHeight});stadium.setLOD(lod);stadium.update(camera,0,{autoLOD:false});hud.update({seconds:90});renderer.render(scene,camera);return {total:stadium.metrics().total,submitted:renderer.info.render.triangles};}
window.hostCheck={draw,dispose(){stadium.dispose();hud.dispose();renderer.dispose();}};draw();document.documentElement.dataset.ready='true';
`);
const gameHTML=await fs.readFile(new URL('../../../index.html',import.meta.url),'utf8'),policy=gameHTML.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i)?.[1];
if(!policy)throw new Error('Current game CSP missing');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try{
    const name=new URL(req.url,'http://local').pathname,file=path.resolve(temporary,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(temporary+path.sep))throw 0;
    const data=await fs.readFile(file),headers={'content-type':types[path.extname(file)]||'application/octet-stream'};if(file.endsWith('.html'))headers['content-security-policy']=policy;
    res.writeHead(200,headers);res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],lines=[];
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  for(const [width,height]of [[390,844],[844,390]]){
    await page.setViewportSize({width,height});
    for(let lod=0;lod<3;lod++){
      const result=await page.evaluate(lod=>window.hostCheck.draw(lod),lod);
      if(result.total>40_000||result.submitted>result.total)throw new Error('Fresh host budget mismatch');
      lines.push(`PASS ${width}x${height} LOD${lod}: ${result.total} complete / ${result.submitted} submitted triangles`);
    }
  }
  await page.evaluate(()=>window.hostCheck.dispose());if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(temporary,{recursive:true});}
await fs.writeFile(path.join(root,'verification','integration-check.txt'),'Runtime copied alone into a clean temporary host, with current game CSP.\n'+lines.join('\n')+'\nPASS: no repository dependencies, CDN or browser errors.\n');console.log(`PASS ${lines.length} independent host cases`);
