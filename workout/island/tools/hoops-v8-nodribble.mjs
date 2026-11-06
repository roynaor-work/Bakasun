// After a stop (dribbling:false) the ball handler must not play a dribble animation until the possession ends.
// Runs an autoplayed game for N ticks (default 6000) and samples every avatar each tick. Usage: node workout/island/tools/hoops-v8-nodribble.mjs [ticks=6000] [seed=4242] [extra=hoopsV8=0]
// (shares the server and browser set-up of hoops-shots.mjs; the next lines are the original description)
// Visual review stills for Island Pro Basketball: broadcast frame, a close-up of the ball
// handler, a wide arena shot and the rim, in each phone viewport, plus an optional frame
// sequence (one tick apart) of the ball handler for motion review. Software WebGL
// (SwiftShader): the pictures show materials, lighting and poses, not the phone's GPU speed.
// Usage: node workout/island/tools/hoops-shots.mjs out=/tmp/shots [viewports=844x390,390x844] [seq=24] [ticks=2] [extra=hoopsV4=0] [seed=4242] [dpr=2] [warm=900]
//        PLAYWRIGHT_MODULE and CHROMIUM_PATH select the browser; writes <viewport>-<name>.jpg into `out`.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/hoops-shots'),viewports=(args.viewports||'844x390,390x844').split(',').map(v=>{const [width,height]=v.split('x').map(Number);return {width,height};});
const seq=Number(args.seq||0),ticks=Number(args.ticks||2),seed=Number(args.seed||4242),dpr=Number(args.dpr||2),warm=Number(args.warm||900);
await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}?dev=1&dur=3600&seed=${seed}&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick${args.extra?'&'+args.extra:''}&dpr=0.15`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 const res=await page.evaluate(({ticks})=>{const d=window.__session.debug;d.hold=true;
  const out={ticks:0,stops:0,handlerFrames:0,dribbleAfterStop:0,v8Frames:0,passes:0,examples:[]};let locked=new Set();
  for(let i=0;i<ticks;i++){d.step(1);d.render();const s=d.engine.snapshot();out.ticks++;
   for(const p of s.players){const av=d.view.avatars.get(p.id);if(!av)continue;
    if(/^v8:/.test(av.motionState))out.v8Frames++;if(p.act==='pass'&&p.actT<.02)out.passes++;
    if(!p.hasBall){locked.delete(p.id);continue;}out.handlerFrames++;
    if(p.dribbling===false){if(!locked.has(p.id))out.stops++;locked.add(p.id);}
    if(locked.has(p.id)&&/dribble/.test(av.motionState)){out.dribbleAfterStop++;if(out.examples.length<5)out.examples.push({id:p.id,state:av.motionState,act:p.act,t:i});}
   }}
  return out;},{ticks:Number(args.ticks||6000)});
 console.log(JSON.stringify(res));
 if(errors.length)console.log('errors',errors.slice(0,3));
 await context.close();
}finally{await browser.close();server.close();}
