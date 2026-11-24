// Real-browser touch check of Island Pro Basketball v25.0 at phone size (844x390, touch): one frame per feature, before
// (`hoopsV250=0`) and after, plus the numbers behind them. Every action goes through the real controls: CDP touch points on
// the shoot button (hold and release), a finger tap on a team-mate, a tap on the jump button when the rebound ring is green.
// The simulation is stepped by the harness (session.debug) so the frames are the same on every run.
// Software WebGL (SwiftShader): shapes, HUD and timing are exact, the speed of a phone's GPU is not measured here.
// Usage: node workout/island/tools/hoops-v250-touch.mjs out=/tmp/v250 [variants=before:hoopsV250=0,after:] [viewport=844x390] [seed=4242] [dpr=1.5] [feet=1] [feetTicks=900]
//        PLAYWRIGHT_MODULE and CHROMIUM_PATH select the browser. Writes <variant>-<nn>-<name>.jpg and v250.json into `out`.
//        feet=1 measures foot slide instead (all ten players of an autoplay game, per clip); extra=<query> adds switches to it.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a,'1']:[a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/hoops-v250'),[width,height]=(args.viewport||'844x390').split('x').map(Number);
const variants=(args.variants||'before:hoopsV250=0,after:').split(',').map(v=>{const i=v.indexOf(':');return {name:v.slice(0,i),extra:v.slice(i+1).replaceAll('+','&')};});
const seed=Number(args.seed||4242),dpr=Number(args.dpr||1.5),FEET=args.feet==='1',feetTicks=Number(args.feetTicks||900);
await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.ogg':'audio/ogg','.jpg':'image/jpeg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(!p.startsWith('/workout/')){res.writeHead(404).end();return;}let f=path.resolve(workout,p.slice('/workout/'.length)||'.');if(f!==workout&&!f.startsWith(workout+path.sep)){res.writeHead(403).end();return;}if((await stat(f)).isDirectory())f=path.join(f,'index.html');res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/workout/island/tools/perf-hoops.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const report={};

/** In the page: helpers on window.__t. `ff` steps without drawing (fast forward), `step` steps and draws once. */
function install(){
 const d=window.__session.debug,view=d.view,draw=view.render;
 const no=()=>({move:{x:0,z:0},sprint:false,shootDown:false,shootUp:false,shootCancel:false,passPress:false,passLong:false,passDouble:false,passDir:null,altPress:false,movePress:false,spinPress:false,fakePress:false,switchPress:false,timeoutPress:false,call:null});
 const events=[];const drain=d.engine.drainEvents.bind(d.engine);d.engine.drainEvents=()=>{const q=drain();for(const e of q)events.push(e);if(events.length>4000)events.splice(0,2000);return q;};
 const quiet=fn=>{view.render=()=>{};try{return fn();}finally{view.render=draw;}};
 const me=()=>{const s=d.engine.snapshot();return s.players.find(p=>p.id===s.controlled);};
 window.__t={no,events,me,
  /** fast forward until `test(snapshot)` or `max` ticks; `input(snapshot)` may steer (null = the real controls) */
  ff(test,max=4000,input){return quiet(()=>{let i=0;for(;i<max;i++){const s=d.engine.snapshot();if(test(s))break;d.step(1,input?input(s):undefined);}return i;});},
  quiet,
  step(n=1){quiet(()=>{if(n>1)d.step(n-1);});d.step(1);},
  /** the child's player holds the ball in the front court, set and facing the basket, defenders a step away */
  setBall(x,z){const e=d.engine,S=e.debug.state,s=e.snapshot(),dir=s.dir[0],m=me();S.phase='live';e.debug.give(m.id);e.debug.place(m.id,dir*x,z);
   let k=0;for(const p of s.players)if(p.team===1){const a=(k++-2)*0.5;e.debug.place(p.id,dir*(x+3.2+Math.cos(a)*1.2),z+Math.sin(a)*4.5);}
   quiet(()=>{d.step(20,no());for(let i=0;i<90&&(me().act||!me().hasBall);i++)d.step(1,no());});const r=me();return {id:r.id,hasBall:r.hasBall,act:r.act,x:r.x,z:r.z};},
  rect(sel){const el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect(),st=getComputedStyle(el);return {x:r.x,y:r.y,w:r.width,h:r.height,shown:!el.hidden&&st.display!=='none'&&st.visibility!=='hidden'&&r.width>0};},
 };
}

async function features(variant){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:dpr});context.setDefaultTimeout(300000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const cdp=await context.newCDPSession(page);
 const start=async()=>{
  await page.goto(`${base}?dev=1&dur=3600&seed=${seed}&hoopsAuto=0&hoopsQuality=2&hoopsProfile=quick${variant.extra?'&'+variant.extra:''}`,{waitUntil:'load'});
  await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
  const err=await page.evaluate(()=>window.__session.snapshot.error);if(err)throw Error(variant.name+': '+err);
  await page.evaluate(()=>{document.getElementById('perf').hidden=true;window.__session.debug.hold=true;});
  await page.evaluate(install);
 };
 await start();
 const R={flags:await page.evaluate(()=>window.__session.snapshot.v250?.flags||null)};let n=0;
 try{
 const shot=async name=>{
  await page.evaluate(async()=>{const d=window.__session.debug;d.view.snapCamera();d.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  await page.screenshot({path:path.join(out,`${variant.name}-${String(++n).padStart(2,'0')}-${name}.jpg`),type:'jpeg',quality:88,timeout:120000,animations:'disabled'});console.log(variant.name,name);};
 const centre=sel=>page.evaluate(sel=>{const el=[...document.querySelectorAll(sel)].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&!e.closest('[hidden]');});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},sel);
 let fingerDown=false;
 const touch=async(type,p,id=1)=>{if(type==='touchEnd'&&!fingerDown)return;if(type==='touchStart'&&fingerDown)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});fingerDown=type==='touchStart';await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:p.x,y:p.y,id}]});};
 const hud=()=>page.evaluate(()=>window.__session.snapshot.v250?.hud||null);

 // 1. the child's player with the ball in the front court: what is on the screen
 // (natural play, no fixture: the child's player dribbles into the front court with the stick held towards the basket)
 await page.evaluate(()=>{const t=window.__t;t.ff(s=>{const m=s.players.find(p=>p.id===s.controlled);return s.phase==='live'&&m?.hasBall&&m.x*s.dir[0]>3.5;},4000,s=>{const m=s.players.find(p=>p.id===s.controlled);return m?.hasBall?{...t.no(),move:{x:s.dir[0],z:0}}:t.no();});});
 await shot('ball');
 R.hudLayout=await page.evaluate(()=>{const t=window.__t,stick=t.rect('.hoops-stick'),labels=[...document.querySelectorAll('.hoops-role-label')].filter(l=>!l.hidden&&l.getBoundingClientRect().width>0).map(l=>{const r=l.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  const hit=(a,b)=>a&&b&&a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;const buttons=[...document.querySelectorAll('.game-controls button,.kid-hoops-pass-launch,.hoops-kit-trigger')].filter(b=>b.getBoundingClientRect().width>0&&!b.closest('[hidden]')).map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  const words=[...document.querySelectorAll('.game-stage *,.kid-hoops-pass-launch')].filter(e=>e.children.length===0&&/[\u0590-\u05ff]/.test(e.textContent||'')&&e.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(e).fontSize)>1&&!e.closest('[hidden],.hoops-loading')).map(e=>e.textContent.trim());
  return {roleLabels:labels.length,labelsUnderControls:labels.filter(l=>hit(l,stick)||buttons.some(b=>hit(l,b))).length,hebrewWordsOverCourt:words};});

 // 2. shot meter: a real finger holds the shoot button, the meter rises, the finger lifts in the green window
 const shootBtn=await centre('[data-hoops-control=shoot]');
 const holdShot=async(lift,x=5.2,z=2.6)=>{
  let rel=null;
  for(let k=0;k<4;k++){
   const set=await page.evaluate(([x,z])=>window.__t.setBall(x,z),[x,z]);
   await touch('touchStart',shootBtn);await page.evaluate(()=>window.__t.step(2));
   rel=await page.evaluate(()=>{const s=window.__session.debug.engine.snapshot(),m=s.players.find(p=>p.id===s.controlled);return {type:m.shotType,held:m.shotHeld,act:m.act};});rel.set=set;rel.attempt=k+1;
   if(rel.act==='shoot'&&rel.held)break;
   // the press did not start a shot (the player was still busy): lift, let it settle, press again
   await touch('touchEnd',shootBtn);await page.evaluate(()=>window.__t.ff(s=>s.phase==='live'&&s.ball.state==='held',600));
  }
  // step to `lift` seconds before/after the ideal release (read from the engine's own shot), one tick at a time
  const ticks=await page.evaluate(lift=>{const d=window.__session.debug,S=d.engine.debug.state;let i=0;for(;i<120;i++){const p=S.teams[0].roster.find(q=>q.id===S.controlled);if(!p.shot||p.actT>=p.shot.releaseAt+lift-1/120)break;window.__t.quiet(()=>d.step(1));}return i;},lift);
  return {...rel,ticks};
 };
 R.meter={start:await holdShot(-0.09)};await page.evaluate(()=>window.__t.step(1));await shot('meter-rising');
 R.meter.rising=await hud();R.meter.oldMeter=await page.evaluate(()=>window.__t.rect('.hoops-meter'));R.meter.newMeter=await page.evaluate(()=>window.__t.rect('.hv250-meter'));
 await page.evaluate(()=>{const d=window.__session.debug,S=d.engine.debug.state;for(let i=0;i<30;i++){const p=S.teams[0].roster.find(q=>q.id===S.controlled);if(!p.shot||p.actT>=p.shot.releaseAt-1/120)break;window.__t.quiet(()=>d.step(1));}});
 await touch('touchEnd',shootBtn);await page.evaluate(()=>window.__t.step(2));await shot('meter-release-green');
 R.meter.green={hud:await hud(),timing:await page.evaluate(()=>window.__t.events.filter(e=>e.type==='timing').slice(-1)[0]||null),oldGrade:await page.evaluate(()=>window.__t.rect('.hoops-grade'))};
 await page.evaluate(()=>window.__t.ff(s=>s.phase==='live'&&s.ball.state==='held',900));
 R.meter.lateStart=await holdShot(0.27);await touch('touchEnd',shootBtn);await page.evaluate(()=>window.__t.step(2));await shot('meter-release-late');
 R.meter.late={hud:await hud(),timing:await page.evaluate(()=>window.__t.events.filter(e=>e.type==='timing').slice(-1)[0]||null)};

 // 3. pass by tapping a team-mate: a finger tap on his body on the court
 await page.evaluate(()=>{window.__t.ff(s=>s.phase==='live'&&s.ball.state==='held',900);window.__t.setBall(4.4,-1.5);window.__t.step(1);});
 const mates=await page.evaluate(([w,h])=>{const d=window.__session.debug,s=d.engine.snapshot(),v=d.view,stickZ=document.querySelector('.hoops-stick-zone').getBoundingClientRect();
  return s.players.filter(p=>p.team===0&&p.id!==s.controlled).map(p=>{const q=v.project(p.x,1.0,p.z);const el=document.elementFromPoint(q.x,q.y);return {id:p.id,x:q.x,y:q.y,onButton:!!el?.closest('button'),inStickZone:q.x>=stickZ.left&&q.x<=stickZ.right&&q.y>=stickZ.top&&q.y<=stickZ.bottom,on:q.x>10&&q.x<w-10&&q.y>70&&q.y<h-10};}).filter(m=>m.on&&!m.onButton);},[width,height]);
 await shot('tap-before');
 R.tap={candidates:mates.length,tries:[]};
 for(const m of mates.slice(0,3)){
  await page.evaluate(()=>{window.__t.ff(s=>s.phase==='live'&&s.ball.state==='held',900);window.__t.setBall(4.4,-1.5);window.__t.step(1);window.__t.events.length=0;});
  const p=await page.evaluate(id=>{const d=window.__session.debug,s=d.engine.snapshot(),q=s.players.find(x=>x.id===id),v=d.view.project(q.x,1.0,q.z);return {x:v.x,y:v.y};},m.id);
  await page.touchscreen.tap(p.x,p.y);await page.evaluate(()=>window.__t.step(14));
  const res=await page.evaluate(()=>({tapPass:window.__t.events.find(e=>e.type==='tapPass')||null,pass:window.__t.events.find(e=>e.type==='passStart')||null,ball:window.__session.debug.engine.snapshot().ball}));
  R.tap.tries.push({target:m.id,inStickZone:m.inStickZone,passedTo:res.pass?.targetId??null,byTap:!!res.tapPass,ok:res.pass?.targetId===m.id});
  if(R.tap.tries.length===1)await shot('tap-pass');
 }
 R.tap.hud=await hud();

 // 4. rebound: the opponents shoot, the ring shows the spot, the finger taps the jump button when it turns green
 const reb=await page.evaluate(()=>{const t=window.__t,d=window.__session.debug,e=d.engine,S=e.debug.state;let found=null;
  for(let k=0;k<12&&!found;k++){t.ff(s=>s.phase==='live'&&s.possession===1&&s.ball.state==='shot',5000,()=>t.no());const s=e.snapshot();if(s.ball.state!=='shot')break;
   // stand the child's player in front of the rim so the jump is a contest, not a run
   const rimX=s.dir[1]*e.court.rimX;e.debug.place(s.controlled,rimX-Math.sign(rimX)*1.3,0.4);
   if(s.rebound!==undefined){found={cue:s.rebound,k};break;}found={cue:null,k};}
  return found;});
 R.rebound={first:reb};await shot('rebound-flight');
 const jumpBtn=await centre('[data-hoops-control=block]')||shootBtn;
 const rebRun=await page.evaluate(async()=>{const t=window.__t,d=window.__session.debug;let go=-1,seen=0;
  for(let i=0;i<160;i++){const s=d.engine.snapshot();if(s.rebound)seen++;if(s.rebound?.go){go=i;break;}if(s.ball.state==='held'||s.phase!=='live')break;t.quiet(()=>d.step(1,t.no()));}return {go,seen,state:d.engine.snapshot().ball.state};});
 R.rebound.run=rebRun;
 if(rebRun.go>=0){await page.evaluate(()=>window.__t.step(1));await shot('rebound-go');await touch('touchStart',jumpBtn);await page.evaluate(()=>window.__t.step(2));await touch('touchEnd',jumpBtn);
  await page.evaluate(()=>{const t=window.__t,d=window.__session.debug;t.events.length=0;t.ff(s=>s.ball.state==='held'||s.phase!=='live',120);t.step(1);});await shot('rebound-result');
  R.rebound.result=await page.evaluate(()=>({timing:window.__t.events.find(e=>e.type==='reboundTiming')||null,rebound:window.__t.events.find(e=>e.type==='rebound')||null,jump:window.__t.events.find(e=>e.type==='jump')||null,controlled:window.__session.debug.engine.snapshot().controlled}));}
 else await shot('rebound-none');
 R.rebound.hud=await hud();

 // 5. special gauge: nearly full, then a perfect release fills it and the next shot burns it
 R.special={};
 if(R.flags?.special){
  await page.evaluate(()=>{const t=window.__t,S=window.__session.debug.engine.debug.state;t.ff(s=>s.phase==='live'&&s.ball.state==='held',900);S.special.v=0.95;S.special.ready=false;t.events.length=0;});
  await holdShot(0);await touch('touchEnd',shootBtn);await page.evaluate(()=>window.__t.step(3));await shot('special-ready');
  R.special.ready=await page.evaluate(()=>({special:window.__session.debug.engine.snapshot().special,readyEvent:!!window.__t.events.find(e=>e.type==='specialReady'),gauge:window.__t.rect('.hv250-special')}));
  await page.evaluate(()=>window.__t.ff(s=>s.phase==='live'&&s.ball.state==='held',900));
  await holdShot(0);await touch('touchEnd',shootBtn);await page.evaluate(()=>window.__t.ff(s=>window.__t.events.some(e=>e.type==='release'&&e.special),60));await page.evaluate(()=>window.__t.step(1));await shot('special-used');
  R.special.used=await page.evaluate(()=>({special:window.__session.debug.engine.snapshot().special,release:window.__t.events.filter(e=>e.type==='release').slice(-1)[0]||null}));
 }

 // 6. made-basket replay: perfect releases from the three-point line until one drops, then the automatic short replay
 // (a fresh game: the earlier sections may already have used the one replay the cooldown allows)
 await touch('touchEnd',shootBtn);await start();
 R.replay={tries:0,made:false,log:[]};
 for(let k=0;k<14&&!R.replay.made;k++){
  R.replay.tries++;
  await page.evaluate(()=>{const t=window.__t;t.ff(s=>s.phase==='live'&&s.ball.state==='held',1200);t.events.length=0;});
  const h=await holdShot(0,5.4,0.5);await touch('touchEnd',shootBtn);
  const res=await page.evaluate(()=>{const t=window.__t;t.ff(s=>t.events.some(e=>e.type==='score'||e.type==='miss'||e.type==='block'),260);const rel=t.events.find(e=>e.type==='release');return {made:t.events.some(e=>e.type==='score'&&e.team===0),types:[...new Set(t.events.map(e=>e.type))].join(','),points:rel?.points,chance:rel?.chance,zone:t.events.find(e=>e.type==='timing')?.zone};});
  R.replay.made=res.made;R.replay.log.push({attempt:h.attempt,act:h.act,held:h.held,type:h.type,set:h.set,...res});
 }
 if(R.replay.made){
  // the game goes on for a second after the basket (the celebration), as it does on the phone; the replay waits for the harness
  await page.evaluate(()=>{const d=window.__session.debug;d.holdReplay=true;window.__t.quiet(()=>d.step(66,window.__t.no()));});
  await page.waitForTimeout(1400);await page.evaluate(()=>{const d=window.__session.debug;d.holdReplay=false;d.render();});
  R.replay.started=await page.evaluate(()=>({replaying:window.__session.snapshot.replaying,info:window.__session.snapshot.replayInfo,show:window.__session.snapshot.show}));
  if(R.replay.started.replaying){
   const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   // the replay runs on the wall clock: a few frames in for the first picture, about a second later for the second
   await page.evaluate(()=>{const d=window.__session.debug;for(let i=0;i<3;i++)d.render();});await settle();
   await page.screenshot({path:path.join(out,`${variant.name}-${String(++n).padStart(2,'0')}-replay-slow.jpg`),type:'jpeg',quality:88,timeout:120000,animations:'disabled'});console.log(variant.name,'replay-slow');
   R.replay.mid=await page.evaluate(()=>window.__session.snapshot.replayInfo);
   await page.evaluate(async()=>{const d=window.__session.debug,t0=performance.now();while(performance.now()-t0<1100&&window.__session.snapshot.replaying){d.render();await new Promise(r=>setTimeout(r,0));}});
   R.replay.second=await page.evaluate(()=>window.__session.snapshot.replayInfo);
   await page.screenshot({path:path.join(out,`${variant.name}-${String(++n).padStart(2,'0')}-replay-back-live.jpg`),type:'jpeg',quality:88,timeout:120000,animations:'disabled'});
   R.replay.wall=await page.evaluate(async()=>{const d=window.__session.debug;for(let i=0;i<4000&&window.__session.snapshot.replaying;i++){d.render();await new Promise(r=>setTimeout(r,0));}const sh=window.__session.snapshot.show;return {seconds:sh.replayWall.slice(-1)[0]??null,show:sh};});
  }else await shot('replay-none');
 }
 }catch(e){R.error=String(e?.message||e).slice(0,400);}
 R.errors=errors.filter(e=>!/favicon|manifest|404/.test(e)).slice(0,6);
 await context.close();return R;
}

/** Foot slide of all ten players in an autoplay game: the lower foot of each player, sampled every tick, per clip. */
async function feet(variant){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(600000);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}?dev=1&dur=3600&seed=${seed}&hoopsAuto=1&hoopsQuality=2&hoopsProfile=quick&dpr=0.15${variant.extra?'&'+variant.extra:''}`,{waitUntil:'load'});
 await page.waitForFunction(()=>{const s=window.__session?.snapshot;return s&&(s.error||s.renderMetrics?.calls>0&&s.stepsRun>30);});
 await page.evaluate(()=>{document.getElementById('perf').hidden=true;window.__session.debug.hold=true;});
 const res=await page.evaluate(async([ticks,trace])=>{
  const {plantedSlide,slideSummary}=await import('/workout/island/minigames/hoops-v250.mjs');
  const d=window.__session.debug,bones=new Map(),prev=new Map(),rows=[];
  const feetOf=id=>{let b=bones.get(id);if(!b){b={};d.view.avatars.get(id)?.root.traverse(o=>{if(o.isBone&&/(Left|Right)Foot$/.test(o.name))b[o.name]=o;});bones.set(id,b);}return b;};
  const pos=o=>{o.updateWorldMatrix(true,false);const e=o.matrixWorld.elements;return {x:e[12],y:e[13],z:e[14]};};
  d.step(120);
  for(let i=0;i<ticks;i++){
   d.step(1);const s=d.engine.snapshot();
   for(const p of s.players){
    const av=d.view.avatars.get(p.id),b=feetOf(p.id);if(!av||!b.LeftFoot||!b.RightFoot||!av.root.visible)continue;
    const L=pos(b.LeftFoot),Rr=pos(b.RightFoot),st=av.motionState||'?',q=prev.get(p.id);
    // both ankles every tick; which foot is planted is decided after the run. A tick in which the body itself jumped (a substitution, an
    // inbound placement) is not motion and is left out.
    if(q&&s.phase==='live'&&q.phase==='live'&&p.y<0.02&&Math.hypot(p.x-q.x,p.z-q.z)<0.3)rows.push({id:p.id,st,sw:q.st!==st,v:Math.hypot(p.vx,p.vz),
     L:{y:Math.max(L.y,q.L.y),d:Math.hypot(L.x-q.L.x,L.z-q.L.z)},R:{y:Math.max(Rr.y,q.R.y),d:Math.hypot(Rr.x-q.R.x,Rr.z-q.R.z)}});
    prev.set(p.id,{L,R:Rr,st,phase:s.phase,x:p.x,z:p.z});
   }
  }
  // a foot is on the floor when its ankle is within 2.5 cm of that player's own standing ankle height (the 10th percentile of his samples).
  // The slide of a tick is the slower of the feet on the floor: in a step or a shuffle one foot carries the body and should stand still
  // while the other skims past; when no foot is down (the flight of a sprint) the tick does not count.
  const h0=new Map();for(const id of new Set(rows.map(r=>r.id))){const ys=rows.filter(r=>r.id===id).map(r=>Math.min(r.L.y,r.R.y)).sort((a,b)=>a-b);h0.set(id,ys[Math.floor(ys.length*0.1)]);}
  for(const r of rows){const lim=h0.get(r.id)+0.025,c=[r.L,r.R].filter(f=>f.y<=lim);r.y=c.length?lim-0.03:9;r.d=c.length?Math.min(...c.map(f=>f.d)):0;}
  const by={},all=[],sw=[],blend={n:0,jump:0};
  for(const r of rows){if(r.y>h0.get(r.id)+0.025)continue;const sl=plantedSlide({x:0,y:0,z:0},{x:r.d,y:0,z:0});(by[r.st]||(by[r.st]=[])).push(sl);all.push(sl);
   // a clip change between two ticks: how far the planted foot jumps in that one tick (blend pop: more than 1.5 m/s)
   if(r.sw){blend.n++;if(sl*60>1.5)blend.jump++;sw.push(sl);}}
  const out={all:slideSummary(all),clips:{},switches:{...blend,...slideSummary(sw)},ankle:+([...h0.values()].reduce((a,b)=>a+b,0)/Math.max(1,h0.size)).toFixed(3),rows:rows.length};
  for(const [k,v] of Object.entries(by))if(v.length>=30)out.clips[k]=slideSummary(v);
  // trace=1: the first 150 samples of one player, trace=<clip name part>: of that clip (player, clip, body speed, each ankle's height and speed)
  if(trace){const id=rows[Math.floor(rows.length/2)].id,pick=typeof trace==='string'&&trace!=='1'?rows.filter(r=>r.st.includes(trace)):rows.filter(r=>r.id===id);out.trace=pick.slice(0,150).map(r=>[r.id,r.st,+r.v.toFixed(2),'L',+r.L.y.toFixed(3),+(r.L.d*60).toFixed(2),'R',+r.R.y.toFixed(3),+(r.R.d*60).toFixed(2)].join(' '));}
  return out;
 },[feetTicks,args.trace||null]);
 res.errors=errors.slice(0,4);await context.close();return res;
}

try{for(const variant of variants){report[variant.name]=FEET?await feet(variant):await features(variant).catch(e=>({error:String(e?.message||e).slice(0,400)}));}}
finally{await browser.close();server.close();}
await writeFile(path.join(out,FEET?'feet.json':'v250.json'),JSON.stringify(report,null,1));
console.log(JSON.stringify(report,null,1));
