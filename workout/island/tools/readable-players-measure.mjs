// Player size on a phone screen (evidence only): Chromium + SwiftShader, hasTouch + isMobile, 844x390. Measures the height in CSS pixels of
// the player the child controls (floor to the top of the head, projected through the game's own camera) in staged moments of the real
// basketball match, and keeps one frame per moment. Run before (`readablePlayers=0`) and after.
// Football: tools/soccer-v250-touch.mjs <out> --scenarios=camera,tapPass,freeKick,corner [--query=readablePlayers=0] reads the same number and keeps the frames.
// Usage: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node workout/island/tools/readable-players-measure.mjs out=/tmp/rp [variants=before:readablePlayers=0,after:] [moments=wing,paint] [viewport=844x390] [seed=4242]
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/readable-players'),[width,height]=(args.viewport||'844x390').split('x').map(Number);
const variants=(args.variants||'before:readablePlayers=0,after:').split(',').map(v=>{const i=v.indexOf(':');return {name:v.slice(0,i),extra:v.slice(i+1).replaceAll('+','&')};});
const seed=Number(args.seed||4242),dpr=Number(args.dpr||1.5);
await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const report={};
function install(){
 const d=window.__session.debug,view=d.view,draw=view.render;
 const no=()=>({move:{x:0,z:0},sprint:false,shootDown:false,shootUp:false,shootCancel:false,passPress:false,passLong:false,passDouble:false,passDir:null,altPress:false,movePress:false,spinPress:false,fakePress:false,switchPress:false,timeoutPress:false,call:null});
 const quiet=fn=>{view.render=()=>{};try{return fn();}finally{view.render=draw;}};
 const me=()=>{const s=d.engine.snapshot();return s.players.find(p=>p.id===s.controlled);};
 window.__t={no,me,quiet,
  step(n=1){quiet(()=>{if(n>1)d.step(n-1,no());});d.step(1,no());},
  setBall(x,z,defX=3.2){const e=d.engine,S=e.debug.state,s=e.snapshot(),dir=s.dir[0],m=me();S.phase='live';e.debug.give(m.id);e.debug.place(m.id,dir*x,z);
   let k=0;for(const p of s.players)if(p.team===1){const a=(k++-2)*0.5;e.debug.place(p.id,dir*(x+defX+Math.cos(a)*1.2),z+Math.sin(a)*4.5);}
   quiet(()=>{d.step(20,no());for(let i=0;i<90&&(me().act||!me().hasBall);i++)d.step(1,no());});return {x:me().x,z:me().z};},
  /** pixels: floor to head of a player; the rim and every player inside the frame */
  measure(w,h){const s=d.engine.snapshot(),m=me(),court=d.engine.court,P=(x,y,z)=>view.project(x,y,z);
   const ph=p=>{const a=P(p.x,0,p.z),b=P(p.x,1.9,p.z);return {id:p.id,team:p.team,px:+(a.y-b.y).toFixed(1),x:+a.x.toFixed(0),y:+b.y.toFixed(0),on:a.visible&&a.x>12&&a.x<w-12&&b.y>8&&a.y<h-6};};
   const dirA=s.dir[0],rim=P(dirA*court.rimX,3.05,0);
   const near=s.players.filter(p=>p.id!==m.id&&Math.hypot(p.x-m.x,p.z-m.z)<7).map(ph);
   // the bodies as drawn: body, LOD and the height of hips, knees and feet above the floor (a body sunk into the floor shows here)
   const wy=o=>{if(!o)return null;o.updateWorldMatrix(true,false);return +o.matrixWorld.elements[13].toFixed(2);};
   const bodies=s.players.map(p=>{const av=view.avatars?.get(p.id),b={};av?.root.traverse(o=>{if(o.isBone&&!b[o.name])b[o.name]=o;});return {id:p.id,team:p.team,act:p.act||'',speed:+Math.hypot(p.vx||0,p.vz||0).toFixed(1),body:av?.root.userData.bodyId||av?.instance?.bodyId||null,version:av?.root.userData.characterVersion??null,lod:av?.lod??null,scale:av?+av.root.scale.y.toFixed(3):null,hips:wy(b.Hips),knee:wy(b.LeftLeg),footL:wy(b.LeftFoot),footR:wy(b.RightFoot)};});
   return {bodies,me:ph(m),rim:{x:+rim.x.toFixed(0),y:+rim.y.toFixed(0),on:rim.visible&&rim.x>12&&rim.x<w-12&&rim.y>8&&rim.y<h-6},nearCount:near.length,nearOn:near.filter(q=>q.on).length,near,all:s.players.map(ph).filter(q=>q.on).length};}};
}
// the last two are not staged: the match as the engine plays it, 150 and 240 more steps on
const moments=[['backcourt',-3,0,3.2],['half',2,-3,3.2],['wing',6,5,2.4],['top',8,0,2],['paint',10.4,2,1.6],['free1',150,0,0],['free2',240,0,0]].filter(m=>!args.moments||args.moments.split(',').includes(m[0]));
for(const variant of variants){
 const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:dpr}),page=await ctx.newPage(),errors=[];
 ctx.setDefaultTimeout(300000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}?dev=1&dur=3600&seed=${seed}&hoopsAuto=0&hoopsQuality=2&hoopsProfile=quick${variant.extra?'&'+variant.extra:''}`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 await page.evaluate(()=>{document.getElementById('perf').hidden=true;window.__session.debug.hold=true;});
 await page.evaluate(install);
 const R=report[variant.name]={moments:{}};let n=0;
 for(const [name,x,z,def] of moments){
  if(name.startsWith('free'))await page.evaluate(n=>{window.__t.step(n);},x);else await page.evaluate(([x,z,def])=>{window.__t.setBall(x,z,def);window.__session.debug.view.snapCamera();for(let i=0;i<40;i++)window.__t.step(1);window.__session.debug.view.snapCamera();window.__t.step(1);},[x,z,def]);
  R.moments[name]=await page.evaluate(([w,h])=>window.__t.measure(w,h),[width,height]);
  const M=R.moments[name];console.log(variant.name,name,'player px',M.me.px,'rim on',M.rim.on,'near on',M.nearOn+'/'+M.nearCount);
  await page.evaluate(async()=>{window.__session.debug.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  try{await page.screenshot({path:path.join(out,`hoops-${variant.name}-${++n}-${name}.jpg`),type:'jpeg',quality:86,timeout:240000,animations:'disabled'});}catch(e){console.log('screenshot failed',name,String(e.message).split('\n')[0]);}
 }
 R.errors=errors.slice(0,5);await ctx.close();
}
await writeFile(path.join(out,'hoops-measure.json'),JSON.stringify(report,null,1));
await browser.close();server.close();
