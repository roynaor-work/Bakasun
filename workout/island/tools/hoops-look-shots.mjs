// Player-look stills for Island Pro Basketball (v24.9): the same seeded moment with and without a set of URL switches, close on the things
// Roy called "weird": the broadcast frame, a line-up, a face, a back with its armholes, legs and shoes. The HUD is hidden on the close-ups.
// Software WebGL (SwiftShader): the pictures show shape, materials and poses, not a phone's GPU speed.
// Usage: node workout/island/tools/hoops-look-shots.mjs out=/tmp/look [variants=before:hoopsLook=0,after:] [viewport=844x390] [seed=4242] [warm=900] [dpr=2]
//        PLAYWRIGHT_MODULE and CHROMIUM_PATH select the browser; writes <variant>-<name>.jpg and look.json (triangles, draw calls, cull) into `out`.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/hoops-look'),[width,height]=(args.viewport||'844x390').split('x').map(Number);
const variants=(args.variants||'before:hoopsLook=0,after:').split(',').map(v=>{const i=v.indexOf(':');return {name:v.slice(0,i),extra:v.slice(i+1).replaceAll('+','&')};});
const seed=Number(args.seed||4242),dpr=Number(args.dpr||2),warm=Number(args.warm||900);
await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const report={};
try{
 for(const variant of variants){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:dpr});context.setDefaultTimeout(300000);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}?dev=1&dur=3600&seed=${seed}&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick${variant.extra?'&'+variant.extra:''}`,{waitUntil:'load'});
  await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
  const err=await page.evaluate(()=>window.__session.snapshot.error);if(err)throw Error(variant.name+': '+err);
  await page.evaluate(()=>{document.getElementById('perf').hidden=true;window.__session.debug.hold=true;});
  await page.evaluate(n=>{const d=window.__session.debug;d.step(n);for(let i=0;i<1800;i++){const s=d.engine.snapshot();const h=s.players.find(p=>p.hasBall);if(s.phase==='live'&&h&&Math.abs(h.x)>4)break;d.step(1);}},warm);
  const shot=async(name,hud)=>{
   await page.evaluate(async hud=>{let st=document.getElementById('look-shots-hud');if(!st){st=document.createElement('style');st.id='look-shots-hud';document.head.append(st);}
    st.textContent=hud?'':'body *{visibility:hidden !important}canvas{visibility:visible !important}';
    const d=window.__session.debug;d.view.snapCamera();d.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},hud);
   await page.waitForTimeout(250);await page.screenshot({path:path.join(out,`${variant.name}-${name}.jpg`),type:'jpeg',quality:90,timeout:120000,animations:'disabled'});console.log(variant.name,name);};
  const override=(pos,look,fov)=>page.evaluate(([pos,look,fov])=>window.__session.debug.view.setCameraOverride(pos,look,fov),[pos,look,fov]);
  const who=await page.evaluate(()=>{const d=window.__session.debug,s=d.engine.snapshot(),h=s.players.find(p=>p.hasBall)||s.players[0];
   const near=s.players.filter(p=>p.id!==h.id).sort((a,b)=>Math.hypot(a.x-h.x,a.z-h.z)-Math.hypot(b.x-h.x,b.z-h.z))[0];
   const height=id=>{const av=d.view.avatars.get(id);let y=1.9;try{const b=new (av.root.constructor)();}catch{}const head=av?.root?.getObjectByName?.('Head');if(head){head.updateWorldMatrix(true,false);y=head.matrixWorld.elements[13];}return y;};
   return {h:{x:h.x,z:h.z,face:h.face,head:height(h.id)},n:{x:near.x,z:near.z,face:near.face,head:height(near.id)}};});
  const at=(p,ang,dist,y,ly,fov)=>override({x:p.x+Math.sin(p.face+ang)*dist,y,z:p.z+Math.cos(p.face+ang)*dist},{x:p.x,y:ly,z:p.z},fov);
  await shot('01-broadcast',true);
  await at(who.h,.5,4.6,1.5,1.05,34);await shot('02-lineup',false);
  await at(who.h,.35,1.35,who.h.head+.12,who.h.head+.1,30);await shot('03-face',false);
  await at(who.n,.35,1.35,who.n.head+.12,who.n.head+.1,30);await shot('04-face-2',false);
  await at(who.h,Math.PI-.5,2.1,1.6,1.3,32);await shot('05-back',false);
  await at(who.h,.9,2.0,.55,.38,32);await shot('06-legs',false);
  await at(who.n,1.4,2.6,1.2,1.0,36);await shot('07-side',false);
  await override(null,null,0);
  report[variant.name]=await page.evaluate(()=>{const d=window.__session.debug,s=window.__session.snapshot,r=s.renderMetrics||{};let tris=0,meshes=0;
   for(const av of d.view.avatars.values())av.root.traverse(o=>{if(o.isMesh&&o.visible){meshes++;tris+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
   const one=[...d.view.avatars.values()][0];
   return {playerTriangles:tris,playerMeshes:meshes,sceneTriangles:r.triangles,calls:r.calls,headScale:one?.root?.getObjectByName?.('Head')?.scale.x,flags:location.search};});
  report[variant.name].errors=errors.filter(e=>!/favicon|manifest|404/.test(e)).slice(0,5);
  await context.close();
 }
}finally{await browser.close();server.close();}
await writeFile(path.join(out,'look.json'),JSON.stringify(report,null,1));
console.log(JSON.stringify(report));
