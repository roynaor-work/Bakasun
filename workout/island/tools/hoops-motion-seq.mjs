// Frame-by-frame motion review for Island Pro Basketball. Places a scripted situation with the
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
  start(kind){
   const {id,side}=this.base(),S=e.debug.state,a=e.debug.api,home=a.onCourt(0);let p=a.byId(id);
   for(const q of a.onCourt(1))e.debug.place(q.id,-side*10,q.z);
   if(kind==='dunk'||kind==='layup'||kind==='shot'){
    if(kind==='dunk'){p=home.filter(q=>q.r.dunk>=a.C.shot.dunkMinRating).sort((x,y)=>y.r.dunk-x.r.dunk)[0]||p;}
    const dist=kind==='dunk'?1.2:kind==='layup'?1.6:5.2;
    e.debug.place(p.id,side*(e.court.rimX-dist),kind==='layup'?.35:0);e.debug.give(p.id);S.controlled=p.id;p.face=Math.atan2(side*e.court.rimX-p.x,-p.z);p.vx=kind==='shot'?0:side*3.5;p.vz=0;
    a.startShot(p,kind==='shot');
   } else if(kind==='block'){
    // the user's player guards the shooter and jumps as the shot goes up
    const shooter=a.onCourt(1)[0];e.debug.place(shooter.id,side*(e.court.rimX-4.5),0);e.debug.give(shooter.id);S.possession=1;shooter.face=Math.atan2(side*e.court.rimX-shooter.x,0);
    e.debug.place(p.id,side*(e.court.rimX-3.4),0.3);p.face=Math.atan2(shooter.x-p.x,shooter.z-p.z);S.controlled=p.id;
    a.startShot(shooter,false);d.step(8,neutral());a.startJump(p,'block');
   } else if(kind==='pass'){
    const target=home.find(q=>q.id!==p.id);e.debug.place(p.id,side*2,0);e.debug.place(target.id,side*7,.5);p.face=Math.atan2(target.x-p.x,target.z-p.z);a.startPass(p,target,'chest');
   } else if(kind==='cross'||kind==='spin'){
    // the trick button with the ball: crossover on a tap, spin on a hold (one press at frame 1)
    e.debug.place(p.id,side*4,0);p.face=Math.atan2(side,0);const key=kind==='spin'?'spinPress':'movePress';
    window.__seq.script=i=>i===1?{move:{x:side,z:0},[key]:true}:{move:{x:side,z:0}};
   } else if(kind==='dribble'){
    // with the ball: walk, run, sprint, stop (dribble_slow / dribble_fast / sprint_ball phases and the ball bounce)
    // starts in the frontcourt (a backcourt start is a violation and a dead ball)
    e.debug.place(p.id,side*1.5,-2);p.face=Math.atan2(side,0);
    window.__seq.script=i=>i<4?{move:{x:side*0.35,z:0},sprint:false}:i<8?{move:{x:side*0.8,z:0},sprint:false}:i<13?{move:{x:side,z:0},sprint:true}:{move:{x:0,z:0},sprint:false};
   } else if(kind==='run'){
    // no ball: run across, break into a sprint, then let go of the stick
    const other=home.find(q=>q.id!==p.id);e.debug.give(other.id);S.controlled=p.id;e.debug.place(p.id,-side*2,-3);p.face=Math.atan2(side,0);
    window.__seq.script=i=>i<4?{move:{x:side*0.6,z:0},sprint:false}:i<9?{move:{x:side,z:0},sprint:true}:{move:{x:0,z:0},sprint:false};
   }
   window.__seq.focus=p.id;return {id:p.id,side,controlled:S.controlled,autopilot:S.autopilot,phase:S.phase};
  },
  step(n,i){const s=window.__seq.script?window.__seq.script(i):null;window.__seq.lastInput=s;for(let k=0;k<n;k++)d.step(1,{...neutral(),...(s||{})});},
  frame(){const s=e.snapshot(),p=s.players.find(q=>q.id===window.__seq.focus),av=d.view.avatars.get(p.id);av.root.updateMatrixWorld(true);const feet={};av.root.traverse(o=>{if(o.isBone&&/(Left|Right)Foot$/.test(o.name)){const w=o.getWorldPosition(new o.position.constructor());feet[o.name.replace(/^mixamorig:?/,'')]=[+w.x.toFixed(3),+w.y.toFixed(3),+w.z.toFixed(3)];}});
   const phase=av.motionPhase||0,planted=(av.motionContacts||[]).filter(c=>phase>=c.startTime&&phase<=c.endTime).map(c=>c.bone);
   return {x:p.x,y:p.y,z:p.z,face:p.face,act:p.act,actT:+(p.actT||0).toFixed(2),speed:+Math.hypot(p.vx,p.vz).toFixed(2),motion:av.motionState,phase:+phase.toFixed(3),time:+(av.motionTime||0).toFixed(2),ball:s.ball.state,hasBall:p.hasBall,ballY:+s.ball.y.toFixed(2),feet,planted,pivot:av.motionPivot,input:window.__seq.lastInput};}
 };
}

const report={};
try{
 const context=await browser.newContext({viewport:{width:vw,height:vh},hasTouch:true,isMobile:true,deviceScaleFactor:1.5});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${base}?dev=1&dur=3600&seed=4242&hoopsAuto=0&hoopsQuality=2&hoopsProfile=quick`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 const err=await page.evaluate(()=>window.__session.snapshot.error);if(err)throw Error(err);
 await page.evaluate(()=>{document.getElementById('perf').hidden=true;});await page.evaluate(installFixture);
 for(const kind of cases){
  await page.evaluate(k=>{window.__seq.script=null;window.__seq.start(k);},kind);report[kind]=[];
  for(let i=0;i<frames;i++){
   const f=await page.evaluate(()=>window.__seq.frame());report[kind].push(f);
   const cx=f.x+Math.sin(f.face+1.25)*3.6,cz=f.z+Math.cos(f.face+1.25)*3.6;
   await page.evaluate(([pos,look])=>{const v=window.__session.debug.view;v.setCameraOverride(pos,look,34);v.snapCamera();window.__session.debug.render();},[{x:cx,y:1.5,z:cz},{x:f.x,y:1.05,z:f.z}]);
   await page.waitForTimeout(80);
   await page.screenshot({path:path.join(out,`${kind}-${String(i).padStart(2,'0')}.jpg`),type:'jpeg',quality:80,timeout:120000,animations:'disabled'});
   // foot slide: a foot inside its authored support window in two consecutive frames (same clip)
   // should not travel horizontally; reported in metres between the frames
   const prev=report[kind][i-1];let slide='';
   if(prev&&prev.motion===f.motion){for(const bone of f.planted){if(!prev.planted.includes(bone))continue;const d=Math.hypot(f.feet[bone][0]-prev.feet[bone][0],f.feet[bone][2]-prev.feet[bone][2]);slide+=` slide=${d.toFixed(3)}m(${bone[0]})`;f.slide=Math.max(f.slide||0,+d.toFixed(3));}}
   console.log(kind,i,`act=${f.act||'-'}@${f.actT} ${f.motion}@${f.phase} t=${f.time} y=${f.y.toFixed(2)} v=${f.speed} ball=${f.ball}${f.hasBall?'(held)':''}${slide} pivot=${JSON.stringify(f.pivot)}`);
   await page.evaluate(([n,i])=>window.__seq.step(n,i),[ticks,i]);
  }
 }
 await page.evaluate(()=>window.__session.debug.view.setCameraOverride(null));
 await writeFile(path.join(out,'frames.json'),JSON.stringify(report,null,1));
 if(errors.filter(e=>!/favicon|404/.test(e)).length)console.log('console errors:',errors.slice(0,5));
 await context.close();
}finally{await browser.close();server.close();}
console.log('frames written to',out);
