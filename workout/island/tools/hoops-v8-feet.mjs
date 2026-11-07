// Foot slide, turning and stopping metrics for the ball handler and the runner: samples both feet every tick and reports how fast the grounded foot
// slides over the floor (m/s) per phase of a scripted run. Software WebGL is fine here: poses are exact, only speed is not. Usage: node tools/hoops-v8-feet.mjs [out=file.json] [extra=hoopsV8=0] [ball=1]
// engine's debug api (dunk, layup, jump shot, block, chest pass, run that turns into a sprint and
// stops), then steps the simulation N ticks at a time and photographs the athlete from a chase
// camera, labelling each frame with the engine act, the clip, its phase and the ball state.
// Software WebGL: poses and timing are exact, speed is not. Usage:
//   node workout/island/tools/hoops-motion-seq.mjs out=/tmp/seq [cases=dunk,layup,shot,block,pass,run] [frames=14] [ticks=3] [viewport=844x390]
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/hoops-seq'),cases=(args.cases||'dunk,layup,shot,block,pass,run').split(','),frames=Number(args.frames||14),ticks=Number(args.ticks||3);
const [vw,vh]=(args.viewport||'844x390').split('x').map(Number);
await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});

/** Runs in the page: a neutral live possession with the user's point guard holding the ball. */
function installFixture(){
 const d=window.__session.debug,e=d.engine;
 const neutral=()=>({move:{x:0,z:0},sprint:false,shootDown:false,shootUp:false,shootCancel:false,passPress:false,passLong:false,passDir:null,altPress:false,movePress:false,spinPress:false,fakePress:false,switchPress:false,timeoutPress:false,call:null});
 window.__seq={neutral,
  base(){
   const S=e.debug.state,a=e.debug.api;d.hold=true;d.controls.cancel();while(d.controls.held.queued)d.controls.consume();
   S.phase='live';S.phaseT=0;S.pending=null;S.inbound=null;S.ft=null;S.autopilot=false;S.clock=60;S.shotClock=24;S.shotClockOn=true;S.stoppage=null;
   const home=a.onCourt(0),away=a.onCourt(1),side=a.side(0);
   for(const p of [...home,...away]){p.act=null;p.actT=0;p.act2=null;p.shot=null;p.move=null;p.fake=null;p.air=-1;p.jumpH=0;p.jumpQueue=null;p.stumble=0;p.energy=.95;p.sprinting=false;p.think=100000;p.goal=null;p.goalSpeed=0;p.intent={x:0,z:0,speed:0,face:null,sprint:false};p.vx=p.vz=0;p.paintT=0;for(const key in p.cd)p.cd[key]=0;}
   home.forEach((p,i)=>e.debug.place(p.id,side*(4+i%2*2),(i-2)*1.8));away.forEach((p,i)=>e.debug.place(p.id,side*(9-i%2*2),(i-2)*1.8));
   const p=home.find(p=>p.pos==='PG')||home[0];e.debug.place(p.id,side*4,0);e.debug.give(p.id);S.controlled=p.id;S.frontcourtSet=true;S.lastPossessionTick=S.tick;d.step(1,neutral());
   return {id:p.id,side};
  },
  start(){return this.base();}
 };
}

const SCRIPTS={
 // stick script by tick: accelerate from rest, hold, brake to a stop, restart, then turn through 90 and 180 degrees
 run:t=>t<60?{x:1,z:0,sprint:false}:t<150?{x:1,z:0,sprint:true}:t<210?{x:0,z:0,sprint:false}:t<270?{x:1,z:0,sprint:false}:t<330?{x:0,z:1,sprint:false}:t<390?{x:-1,z:0,sprint:false}:{x:0,z:0,sprint:false},
};
const phases=[['accel',0,60],['sprint',60,150],['stop',150,210],['restart',210,270],['turn90',270,330],['turn180',330,390]];
const report={};
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}?dev=1&dur=3600&seed=4242&hoopsAuto=0&hoopsQuality=2&hoopsProfile=quick&dpr=0.15${args.extra?'&'+args.extra:''}`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 await page.evaluate(()=>{document.getElementById('perf').hidden=true;});await page.evaluate(installFixture);
 for(const withBall of args.ball==='0'?[false]:args.ball==='1'?[true]:[true,false]){
  const res=await page.evaluate(({withBall,phases,script})=>{
   const d=window.__session.debug,e=d.engine,S=e.debug.state,a=e.debug.api;
   const {id,side}=window.__seq.base();const p=a.byId(id),home=a.onCourt(0);
   if(!withBall){const other=home.find(q=>q.id!==p.id);e.debug.give(other.id);S.controlled=p.id;}
   e.debug.place(p.id,-side*8,-3);p.face=Math.atan2(side,0);
   const neutral=window.__seq.neutral,feet=[],fb={};
   const bones={};const av=d.view.avatars.get(p.id);av.root.traverse(o=>{if(o.isBone&&/(Left|Right)Foot$/.test(o.name))bones[o.name]=o;});
   const rows=[];let prev=null;
   for(let t=0;t<390+30;t++){
    const s=Function('t','return ('+script+')(t)')(t);
    d.step(1,{...neutral(),move:{x:s.x*side,z:s.z},sprint:s.sprint});d.render();
    const sn=e.snapshot(),q=sn.players.find(o=>o.id===p.id);av.root.updateMatrixWorld(true);
    const cur={};for(const [n,b] of Object.entries(bones)){const w=b.getWorldPosition(new b.position.constructor());cur[n]=[w.x,w.y,w.z];}
    if(prev){
     // the lower foot is the grounded one; its horizontal speed over the floor is the slide
     const lower=cur.LeftFoot[1]<cur.RightFoot[1]?'LeftFoot':'RightFoot',same=prev.lower===lower;
     const sl=same?Math.hypot(cur[lower][0]-prev.cur[lower][0],cur[lower][2]-prev.cur[lower][2])*60:null;
     rows.push({t,speed:Math.hypot(q.vx,q.vz),face:q.face,motion:av.motionState,slide:sl,low:Math.min(cur.LeftFoot[1],cur.RightFoot[1])});
    }
    prev={cur,lower:cur.LeftFoot[1]<cur.RightFoot[1]?'LeftFoot':'RightFoot'};
   }
   return rows;
  },{withBall,phases,script:SCRIPTS.run.toString()});
  const out={};
  for(const [name,a0,b0] of phases){
   const r=res.filter(x=>x.t>=a0&&x.t<b0&&x.slide!=null&&x.low<0.075);if(!r.length){out[name]=null;continue;}
   const sl=r.map(x=>x.slide).sort((x,y)=>x-y),sp=res.filter(x=>x.t>=a0&&x.t<b0).map(x=>x.speed);
   out[name]={frames:r.length,meanSlide:+(sl.reduce((x,y)=>x+y,0)/sl.length).toFixed(3),p95Slide:+sl[Math.floor(sl.length*.95)].toFixed(3),over1:+(sl.filter(v=>v>1).length/sl.length).toFixed(2),meanSpeed:+(sp.reduce((x,y)=>x+y,0)/sp.length).toFixed(2),minFloor:+Math.min(...r.map(x=>x.low)).toFixed(3)};
  }
  report[withBall?'withBall':'noBall']=out;
 }
 console.log(JSON.stringify(report,null,1));
 if(args.out)await writeFile(args.out,JSON.stringify(report,null,1));
 if(errors.length)console.log('errors',errors.slice(0,3));
 await context.close();
}finally{await browser.close();server.close();}
