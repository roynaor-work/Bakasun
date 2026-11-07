// Probes for the rim-attack and defence work: `dunk`/`layup` = hand-with-ball height over the rim and step timing; `defense` = knee bend, hip height and hand heights of the defenders during autoplay.
// Usage: node tools/hoops-v8-probe.mjs mode=dunk|layup|defense|dribble [dist=3.4] [speed=4.5] [out=file.json] [extra=hoopsV8=0]
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
await mkdir(path.dirname(out),{recursive:true});
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

const mode=args.mode||'dunk';
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}?dev=1&dur=3600&seed=${args.seed||4242}&hoopsAuto=0&hoopsQuality=2&hoopsProfile=quick&dpr=0.15${args.extra?'&'+args.extra:''}`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 await page.evaluate(()=>{document.getElementById('perf').hidden=true;});await page.evaluate(installFixture);
 const res=await page.evaluate(({mode,dist,speed})=>{
  const d=window.__session.debug,e=d.engine,S=e.debug.state,a=e.debug.api,neutral=window.__seq.neutral;
  const {id,side}=window.__seq.base();let p=a.byId(id),home=a.onCourt(0);
  const out={mode};
  const bonesOf=av=>{const b={};av.root.traverse(o=>{if(o.isBone)b[o.name]=o;});return b;};
  const wp=b=>{const w=b.getWorldPosition(new b.position.constructor());return [w.x,w.y,w.z];};
  if(mode==='dunk'||mode==='layup'){
   for(const q of a.onCourt(1))e.debug.place(q.id,-side*10,q.z);
   if(mode==='dunk')p=home.filter(q=>q.r.dunk>=a.C.shot.dunkMinRating).sort((x,y)=>y.r.dunk-x.r.dunk)[0]||p;
   e.debug.place(p.id,side*(e.court.rimX-dist),0.2);e.debug.give(p.id);S.controlled=p.id;p.face=Math.atan2(side*e.court.rimX-p.x,-p.z);p.vx=side*speed;p.vz=0;p.energy=1;
   const ok=a.startShot(p,false);out.type=p.shot?.type;out.started=ok;
   const av=d.view.avatars.get(p.id),b=bonesOf(av),rows=[];let steps=0,lastFootDown=null;
   for(let t=0;t<130;t++){
    d.step(1,{...neutral()});d.render();const q=e.snapshot().players.find(o=>o.id===p.id),s=e.snapshot();av.root.updateMatrixWorld(true);
    const rh=wp(b.RightHand),lh=wp(b.LeftHand),ball=s.ball;
    rows.push({t,act:q.act,actT:q.actT,y:q.y,x:q.x,speed:Math.hypot(q.vx,q.vz),handY:Math.max(rh[1],lh[1]),rh,lh,ballY:ball.y,ballState:ball.state,motion:av.motionState,lf:wp(b.LeftFoot)[1],rf:wp(b.RightFoot)[1],events:s.events});
    if(q.act==null&&t>20)break;
   }
   const rim=e.court.rimY;out.rimY=rim;out.maxHandY=Math.max(...rows.map(r=>r.handY));out.maxBallY=Math.max(...rows.map(r=>r.ballY));out.maxJump=Math.max(...rows.map(r=>r.y));
   out.handOverRim=+(out.maxHandY-rim).toFixed(3);out.ballOverRim=+(out.maxBallY-rim).toFixed(3);
   // contacts of the feet with the floor before take-off = steps (a foot lands when it goes below 0.075 after being above 0.1)
   const air=rows.findIndex(r=>r.y>0.05);let st=0,prevLow=true;for(let i=0;i<(air<0?rows.length:air);i++){const low=Math.min(rows[i].lf,rows[i].rf)<0.075;const foot=rows[i].lf<rows[i].rf?'L':'R';if(low&&(lastFootDown!==foot)){st++;lastFootDown=foot;}}
   out.groundContactsBeforeJump=st;out.takeoffTick=air;out.releaseTick=rows.findIndex(r=>r.ballState==='shot');out.ticks=rows.length;
   out.startSpeed=speed;out.speedAtTakeoff=air>0?+rows[air].speed.toFixed(2):null;out.travelDistance=+(Math.abs(rows[Math.max(0,air)].x-rows[0].x)).toFixed(2);
   out.rows=rows.filter((r,i)=>i%6===0).map(r=>({t:r.t,act:r.act,y:+r.y.toFixed(2),handY:+r.handY.toFixed(2),ballY:+r.ballY.toFixed(2),speed:+r.speed.toFixed(2),motion:r.motion}));
   const evs=[];for(const r of rows)for(const ev of (r.events||[]))evs.push([r.t,ev.type]);out.events=evs.filter(x=>/step|travel|violation|score|gather/.test(x[1])).slice(0,12);
  } else if(mode==='dribble'){
   // ball handler: standing, walking, running dribble. Hand-ball sync: how well ball height follows the dribbling hand (correlation), the palm-to-ball
   // distance while the ball is above 0.6 m (in the hand), and the lowest the ball gets (it must reach the floor)
   for(const q of a.onCourt(1))e.debug.place(q.id,-side*10,q.z);
   e.debug.place(p.id,side*1.5,-2);p.face=Math.atan2(side,0);
   const av=d.view.avatars.get(p.id),b=bonesOf(av),segs=[['stand',0,70,0],['walk',70,150,.35],['run',150,260,.8]],rows=[];
   const palm=()=>{const w=av.hands.r.getWorldPosition(new av.hands.r.position.constructor());return [w.x,w.y,w.z];};
   for(let t=0;t<260;t++){const sg=segs.find(x=>t>=x[1]&&t<x[2]);
    d.step(1,{...neutral(),move:{x:side*sg[3],z:0},sprint:false});d.render();const s=e.snapshot(),q=s.players.find(o=>o.id===p.id);if(!q.hasBall||q.dribbling===false)continue;
    av.root.updateMatrixWorld(true);const pm=palm(),bl=s.ball;
    const vb=d.view.scene.getObjectByName('broadcast-basketball');
    rows.push({seg:sg[0],t,ballY:vb.position.y,handY:pm[1],dist:Math.hypot(vb.position.x-pm[0],vb.position.y-pm[1],vb.position.z-pm[2]),speed:Math.hypot(q.vx,q.vz),motion:av.motionState});}
   const corr=(a,b)=>{const n=a.length,ma=a.reduce((x,y)=>x+y,0)/n,mb=b.reduce((x,y)=>x+y,0)/n;let sa=0,sb=0,sab=0;for(let i=0;i<n;i++){sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2;sab+=(a[i]-ma)*(b[i]-mb);}return sa&&sb?sab/Math.sqrt(sa*sb):0;};
   out.segments={};
   for(const [name] of segs){const r=rows.filter(x=>x.seg===name);if(r.length<10){out.segments[name]=null;continue;}
    const hi=r.filter(x=>x.ballY>0.6);
    out.segments[name]={frames:r.length,corrBallHand:+corr(r.map(x=>x.ballY),r.map(x=>x.handY)).toFixed(2),meanPalmBallWhenHigh:+(hi.reduce((x,y)=>x+y.dist,0)/Math.max(1,hi.length)).toFixed(3),minBall:+Math.min(...r.map(x=>x.ballY)).toFixed(3),maxBall:+Math.max(...r.map(x=>x.ballY)).toFixed(3),meanSpeed:+(r.reduce((x,y)=>x+y.speed,0)/r.length).toFixed(2),motions:[...new Set(r.map(x=>x.motion))]};}
  } else {
   // defence: ten seconds of live autoplay, the defenders' knee bend (hip height / standing hip height), hand height and hand spread
   S.autopilot=true;const rows=[],stand={};
   for(let t=0;t<900;t++){
    d.step(1,{...neutral()});if(t%10)continue;d.render();const s=e.snapshot();
    for(const q of s.players){if(q.team===s.possession||q.hasBall)continue;const av=d.view.avatars.get(q.id);if(!av||!av.root.visible)continue;av.root.updateMatrixWorld(true);const b=bonesOf(av);
     const hip=wp(b.Hips),rh=wp(b.RightHand),lh=wp(b.LeftHand),sp=Math.hypot(q.vx,q.vz);const key=q.id;stand[key]=Math.max(stand[key]||0,hip[1]);
     rows.push({id:q.id,t,speed:sp,hipY:hip[1],handsUp:(rh[1]+lh[1])/2,handSide:Math.abs(rh[0]-lh[0])+Math.abs(rh[2]-lh[2]),motion:av.motionState,act:q.act,hasBallNear:s.players.some(o=>o.hasBall&&Math.hypot(o.x-q.x,o.z-q.z)<4)});}
   }
   for(const r of rows)r.crouch=r.hipY/stand[r.id];
   const near=rows.filter(r=>r.hasBallNear),avg=k=>near.length?+(near.reduce((x,r)=>x+r[k],0)/near.length).toFixed(3):null;
   out.samples=rows.length;out.nearBallSamples=near.length;out.meanHipRatio=avg('crouch');out.meanHandHeight=avg('handsUp');out.meanHandSpread=avg('handSide');
   out.motionShare={};for(const r of near)out.motionShare[r.motion]=(out.motionShare[r.motion]||0)+1;
  }
  return out;
 },{mode,dist:Number(args.dist||3.4),speed:Number(args.speed||4.5)});
 console.log(JSON.stringify(res,null,1));
 if(args.out)await writeFile(args.out,JSON.stringify(res,null,1));
 if(errors.length)console.log('errors',errors.slice(0,3));
 await context.close();
}finally{await browser.close();server.close();}
