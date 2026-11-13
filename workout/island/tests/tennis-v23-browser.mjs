// Tennis v23 acceptance, played through the REAL island shell (index.html?dev=1 -> games.start('tennis')) with real touch (Chromium, hasTouch +
// isMobile, 844x390, CDP Input.dispatchTouchEvent on the on-screen joystick and buttons), no state injection.
// Roy after v22: "the bar that shows when to press is in the way of the game, it should be more to the side" and "there has to be a situation where
// the ball takes time and bounces, with enough time to run even if you do not get there".
//   MODE=after  node workout/island/tests/tennis-v23-browser.mjs   (default: v23; must pass)
//   MODE=before node workout/island/tests/tennis-v23-browser.mjs   (?tennisMeter=v15&tennisSoftDrop=0 = v22; the side checks must FAIL)
//   DIFFICULTY=normal|hard  POINTS=6  FRAMES=1600  CHROMIUM_PATH=/usr/bin/google-chrome
// Writes frames and the run log to verification/tennis-v23/browser-<mode>-<difficulty>/. Exits non-zero on a failed check.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as T from '../vendor/three.module.js';
import {serveIsland,installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';
import {waitForGameStart,waitForGameNavigation} from './shell-ready.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const MODE=process.env.MODE==='before'?'before':'after',POINTS=Number(process.env.POINTS)||6,FRAMES=Number(process.env.FRAMES)||1600,DIFFICULTY=process.env.DIFFICULTY||'easy';
const dir=fileURLToPath(new URL(`../verification/tennis-v23/browser-${MODE}-${DIFFICULTY}/`,import.meta.url));await mkdir(dir,{recursive:true});
const viewport={width:844,height:390},cfg=JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.tennis;
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={mode:MODE,difficulty:DIFFICULTY,viewport,browser:'Chromium / SwiftShader',browserVersion:browser.version(),physicalPhone:false,touch:'CDP Input.dispatchTouchEvent',checks:{},frames:[]};
let failure=null;
// The court and the players as the view's camera sees them (same camera as tennis-view.mjs: base position + follow, look-at target + follow*.45).
const camera=new T.PerspectiveCamera(cfg.render.cameraFov,1,.1,300);
function projector(canvas,follow){camera.aspect=canvas.w/canvas.h;camera.position.fromArray(cfg.render.cameraLandscape);camera.position.x+=follow;camera.lookAt(cfg.render.cameraTarget[0]+follow*.45,cfg.render.cameraTarget[1],cfg.render.cameraTarget[2]);camera.updateMatrixWorld();camera.updateProjectionMatrix();
 return (x,y,z)=>{const v=new T.Vector3(x,y,z).project(camera);return {x:canvas.x+(v.x+1)*canvas.w/2,y:canvas.y+(1-v.y)*canvas.h/2};};}
const overlap=(a,b,pad=0)=>a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;
const inPolygon=(p,poly)=>{let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;};
const rectHitsPolygon=(r,poly)=>{for(let x=r.x;x<=r.x+r.w;x+=4)for(let y=r.y;y<=r.y+r.h;y+=4)if(inPolygon({x,y},poly))return true;return poly.some(p=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h);};
try{
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const csp=await installIslandCspMonitor(context),page=await context.newPage(),errors=[];await csp.attachPage(page);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
 const tick=ms=>page.clock.runFor(ms),tap=s=>page.locator(s).tap(),log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
 await page.clock.install();await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await csp.assertClean();
 await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await tap('[data-action=avatar-start]');await tick(32);
 await page.evaluate(({mode,difficulty})=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;
  for(const type of ['soccer','tennis']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}
  e.setTennisDifficulty(difficulty);
  const r=data.config.minigames.tennis.render;r.slowFrameMs=100000;r.pixelRatios=r.pixelRatios.map(()=>.75);r.shadowEnabled=r.shadowEnabled.map(()=>false);/* SwiftShader must not change the render tier; the bar is DOM */
  if(mode==='before')history.replaceState(null,'',location.pathname+'?dev=1&tennisMeter=v15&tennisSoftDrop=0');},{mode:MODE,difficulty:DIFFICULTY});
 const start=async id=>{await page.evaluate(id=>window.__island.games.start(id,undefined,1),id);if(await page.locator('[data-action=game-understood]').count()){await tick(32);await tap('[data-action=game-understood]');}await waitForGameStart(page);await tick(100);await waitForGameNavigation(page);};
 await start('tennis');
 for(let i=0;i<600;i++){const loaded=await page.evaluate(()=>{const m=window.__island.games.current?.session.snapshot.renderMetrics;return Boolean(m&&(m.characterLoaded||m.mode==='canvas'));});if(loaded)break;await tick(100);await page.waitForTimeout(50);}
 await tick(600);log('tennis ready',MODE,DIFFICULTY);
 report.search=await page.evaluate(()=>location.search);report.tennisDifficulty=await page.evaluate(()=>window.__island.engine.state.tennisDifficulty);
 const cdp=await context.newCDPSession(page);let active=[];
 const send=type=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:active.map(p=>({x:p.x,y:p.y,id:p.id}))});
 const down=async(id,x,y)=>{active=[...active.filter(p=>p.id!==id),{id,x,y}];await send('touchStart');};
 const move=async(id,x,y)=>{const p=active.find(p=>p.id===id);if(!p)return;p.x=x;p.y=y;await send('touchMove');};
 const up=async id=>{const p=active.find(p=>p.id===id);if(!p)return;active=active.filter(q=>q.id!==id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:p.x,y:p.y,id}]});};
 const box=async s=>{const b=await page.locator(s).first().boundingBox();assert.ok(b,s+' is on screen');return {x:b.x,y:b.y,w:b.width,h:b.height,cx:b.x+b.width/2,cy:b.y+b.height/2};};
 const zone=await box('.soccer-stick-zone'),hit=await box('#shoot'),serveBtn=await box('#pass'),dropBtn=await box('#drop');
 // everything the bar must not cover: the four buttons and their captions, the action pad, the score board, the pause button
 const keepOut={};for(const s of ['#shoot','#pass','#sprint','#drop','#shoot .tennis-control-caption','#pass .tennis-control-caption','#sprint .tennis-control-caption','#drop .tennis-control-caption','.soccer-actions','.tennis-board','[data-action=game-pause]'])keepOut[s]=await box(s);
 report.keepOut=keepOut;
 const tapButton=async(b,ms=70)=>{await down(2,b.cx,b.cy);await tick(ms);await up(2);};
 const read=()=>page.evaluate(()=>{const s=window.__island.games.current.session.snapshot,m=document.querySelector('.tennis-serve-meter'),r=m.getBoundingClientRect(),cs=getComputedStyle(m),c=document.querySelector('.game-screen[data-game=tennis] .game-stage canvas:not([hidden])'),cr=c.getBoundingClientRect(),needle=m.querySelector('.tennis-serve-needle');
  const visible=!m.hidden&&cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity)>0&&r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;
  return {phase:s.phase,server:s.server,serveZone:s.serveZone,serveMeter:s.serveMeter,elapsed:s.elapsed,pointNumber:s.pointNumber,rallyHits:s.rallyHits,
   contact:s.contact?{side:s.contact.side,eta:s.contact.eta,x:s.contact.x,z:s.contact.z,soft:s.contact.soft?{reach:s.contact.soft.reach,readAt:s.contact.soft.readAt}:null}:null,shotSide:s.shot?.side??null,shotDrop:Boolean(s.shot?.drop),shotSoft:Boolean(s.shot?.soft),
   ball:{x:s.ball.x,y:s.ball.y,z:s.ball.z,vy:s.ball.vy,bounces:s.ball.bounces,lastHitter:s.ball.lastHitter},players:s.players.map(p=>({x:p.x,z:p.z,running:p.running,vx:p.vx||0,vz:p.vz||0})),deadBall:Boolean(s.deadBall),deadBounces:s.deadBounces||0,
   hm:s.hitMeter?{active:s.hitMeter.active,value:s.hitMeter.value,zone:s.hitMeter.zone,greenHalf:s.hitMeter.greenHalf,yellowHalf:s.hitMeter.yellowHalf}:null,
   meter:{visible,mode:m.dataset.mode||null,place:m.dataset.place||null,idle:m.dataset.idle||null,opacity:Number(cs.opacity),fading:m.getAnimations().some(a=>a.playState==='running'),rect:{x:r.x,y:r.y,w:r.width,h:r.height},background:m.style.background||'',needleBottom:needle?.style.bottom||''},
   canvas:{x:cr.x,y:cr.y,w:cr.width,h:cr.height},follow:s.renderMetrics?.cameraFollow??0,event:{id:s.event.id,type:s.event.type,side:s.event.side,reason:s.event.reason,winner:s.event.winner,serving:s.event.serving,grade:s.event.grade,zone:s.event.zone,rating:s.event.rating}};});
 const shot=async name=>{const file=`${name}.jpg`;await page.screenshot({path:dir+file,type:'jpeg',quality:72});report.frames.push(file);};
 const hasGreen=bg=>/#67d398|103,\s*211,\s*152/i.test(bg),hasYellow=bg=>/#efc355|239,\s*195,\s*85/i.test(bg);
 // Where the bar is, every frame: against the buttons, the score board, the court (singles lines + run-off, as the camera projects it) and the child.
 const place={frames:0,onButtons:0,onCourt:0,onPlayer:0,activeFrames:0,activeOpaque:0,idleFrames:0,idleDim:0,fadingFrames:0,rects:[]};
 const where=s=>{if(!s.meter.visible)return;const m=s.meter.rect,P=projector(s.canvas,s.follow),court=[P(-cfg.court.playerLimit-.5,0,-cfg.court.halfLength-1),P(cfg.court.playerLimit+.5,0,-cfg.court.halfLength-1),P(cfg.court.playerLimit+.5,0,cfg.court.halfLength+1.05),P(-cfg.court.playerLimit-.5,0,cfg.court.halfLength+1.05)];
  const kid=s.players[0],feet=P(kid.x,0,kid.z),head=P(kid.x,1.9,kid.z),half=Math.abs(P(kid.x+.6,1,kid.z).x-P(kid.x,1,kid.z).x),player={x:Math.min(feet.x,head.x)-half,y:head.y,w:Math.abs(feet.x-head.x)+2*half,h:feet.y-head.y};
  place.frames++;if(Object.values(keepOut).some(b=>overlap(m,b)))place.onButtons++;if(rectHitsPolygon(m,court))place.onCourt++;if(overlap(m,player))place.onPlayer++;
  const inUse=Boolean(s.hm?.active)||s.phase==='toss'&&s.server===0;/* the 0.16 s fade runs on real time while the game clock is stepped: frames caught mid-fade are counted apart */if(s.meter.fading)place.fadingFrames++;else if(inUse){place.activeFrames++;if(s.meter.opacity>=.9)place.activeOpaque++;}else{place.idleFrames++;if(s.meter.opacity<=.6)place.idleDim++;}
  if(place.rects.length<400)place.rects.push({x:Math.round(m.x),y:Math.round(m.y),w:Math.round(m.w),h:Math.round(m.h),inUse,opacity:s.meter.opacity});};
 // ---- play ----
 const points=[],returns=[],drops=[];let serveSeen=null,stickOn=false,tapNo=0,oppHit=0,eventId=-1,incomingKey=null,incoming=null,drop=null,framesRun=0,shotsTaken=new Set(),deadTrack=null;
 const stick=async(dx,dz)=>{const sx=zone.cx,sy=zone.cy;if(!stickOn){await down(1,sx,sy);stickOn=true;}await move(1,sx+Math.max(-1,Math.min(1,dx*4))*44,sy+Math.max(-1,Math.min(1,dz*4))*44);};
 const stickOff=async()=>{if(stickOn){await up(1);stickOn=false;}};
 const once=async(name,cond)=>{if(cond&&!shotsTaken.has(name)){shotsTaken.add(name);await shot(name);}};
 const absorb=s=>{if(s.event.id===eventId)return;eventId=s.event.id;const e=s.event;
  if(e.type==='hit'&&e.side===0&&!e.serving&&incoming?.tapped&&!incoming.hit)incoming.hit={grade:e.grade,zone:e.zone,rating:e.rating,drop:s.shotDrop};
  if(e.type==='missSwing'&&incoming?.tapped&&!incoming.hit)incoming.miss=e.reason;
  if(e.type==='hit'&&e.side===0&&!e.serving&&s.shotDrop)drop={at:s.elapsed,soft:s.shotSoft,apex:s.ball.y,b1:null,bounceTop:null,touch:null,touchBounced:null,end:null,oppStartZ:s.players[1].z,oppBackMost:s.players[1].z,plan:null};
  if(e.type==='bounce'&&drop&&drop.b1===null&&s.ball.lastHitter===0)drop.b1=s.elapsed-drop.at;
  if(e.type==='hit'&&e.side===1&&!e.serving&&drop&&drop.touch===null){drop.touch=s.elapsed-drop.at;drop.touchBounced=drop.b1!==null;drop.touchY=s.ball.y;}
  if(['point','game','complete'].includes(e.type)){points.push({n:s.pointNumber,winner:e.winner,reason:e.reason,rallyHits:s.rallyHits,elapsed:s.elapsed});
   if(drop){drop.end=s.elapsed-drop.at;drop.winner=e.winner;drop.reason=e.reason;if(e.reason==='doubleBounce'&&drop.touch===null)deadTrack={start:{x:s.ball.x,z:s.ball.z},moved:0,maxY:0,bounces:0,frames:0,oppGap:Math.hypot(s.players[1].x-s.ball.x,s.players[1].z-s.ball.z),oppRunning:s.players[1].running};drops.push(drop);drop=null;}
   if(incoming){returns.push(incoming);incoming=null;incomingKey=null;}}};
 let s=await read();const startPoint=s.pointNumber;absorb(s);
 while(s.pointNumber-startPoint<POINTS&&s.phase!=='complete'&&framesRun<FRAMES){
  const incomingNow=s.phase==='rally'&&s.contact?.side===0&&s.shotSide===1&&s.ball.lastHitter===1;
  const step=(incomingNow&&s.contact.eta<.6)||(s.phase==='toss'&&s.server===0&&s.serveMeter>.3)||drop?16:(s.phase==='rally'&&s.contact?.side===1)?48:40;
  if(s.server===0&&s.phase==='serve'){await stickOff();await tapButton(serveBtn);}
  else if(s.phase==='toss'&&s.server===0){
   if(!serveSeen&&s.meter.visible&&s.serveMeter>.3)serveSeen={...s.meter,green:hasGreen(s.meter.background),yellow:hasYellow(s.meter.background)};
   await once('serve-meter',s.meter.visible&&s.serveMeter>.3);
   if(s.serveZone==='green'&&Math.abs(s.serveMeter-.5)<.09)await tapButton(serveBtn);
  }else if(incomingNow){
   if(s.event.type==='hit'&&s.event.side===1)oppHit=s.event.id;const key=`${s.pointNumber}:${oppHit}`;
   if(key!==incomingKey){if(incoming)returns.push(incoming);incomingKey=key;incoming={key,plan:['green','drop'][tapNo%2],tapped:false,visibleBeforeTap:false,meterAtTap:null,needleMoves:0,lastNeedle:null,greenBand:false,yellowBand:false,hit:null,miss:null,frames:0};}
   incoming.frames++;if(s.hm){if(incoming.lastNeedle!==null&&s.hm.value!==incoming.lastNeedle)incoming.needleMoves++;incoming.lastNeedle=s.hm.value;}
   if(s.meter.visible){if(hasGreen(s.meter.background))incoming.greenBand=true;if(hasYellow(s.meter.background))incoming.yellowBand=true;}
   if(!incoming.tapped){
    if(s.meter.visible&&s.contact.eta>.2)incoming.visibleBeforeTap=true;
    await stick(s.contact.x-s.players[0].x,s.contact.z-s.players[0].z);
    await once('return-incoming',s.contact.eta<.75&&s.contact.eta>.4);
    if(s.contact.eta<=.08){incoming.tapped=true;incoming.meterAtTap={...s.meter};incoming.hmAtTap=s.hm;tapNo++;await once('return-tap',true);await tapButton(incoming.plan==='drop'?dropBtn:hit);}
   }
  }else{await stickOff();await once('bar-idle',s.phase==='rally'&&s.contact?.side===1&&s.meter.visible&&!drop);}
  if(drop){drop.apex=Math.max(drop.apex,s.ball.lastHitter===0?s.ball.y:0);drop.oppBackMost=Math.min(drop.oppBackMost,s.players[1].z);if(s.contact?.soft&&!drop.plan)drop.plan=s.contact.soft;
   if(drop.b1!==null&&drop.touch===null&&s.ball.lastHitter===0&&s.ball.bounces===1)drop.bounceTop=Math.max(drop.bounceTop||0,s.ball.y);
   const age=s.elapsed-drop.at;await once(`drop-flight-${drops.length+1}`,age>.7&&age<1.3);await once(`drop-bounce-${drops.length+1}`,drop.b1!==null&&s.ball.lastHitter===0&&s.ball.bounces===1&&s.ball.vy<1);}
  if(deadTrack&&['point','game'].includes(s.phase)){deadTrack.frames++;deadTrack.moved=Math.max(deadTrack.moved,Math.hypot(s.ball.x-deadTrack.start.x,s.ball.z-deadTrack.start.z));deadTrack.maxY=Math.max(deadTrack.maxY,s.ball.y);deadTrack.bounces=s.deadBounces;await once(`dead-ball-${drops.length}`,deadTrack.frames===6);}
  else if(deadTrack){report.deadBalls=[...(report.deadBalls||[]),deadTrack];deadTrack=null;}
  where(s);
  await tick(step);framesRun++;s=await read();absorb(s);
  if(framesRun%200===0)log('frame',framesRun,'points',s.pointNumber-startPoint,'returns',returns.length,'drops',drops.length);
 }
 await stickOff();if(incoming)returns.push(incoming);if(drop)drops.push(drop);if(deadTrack)report.deadBalls=[...(report.deadBalls||[]),deadTrack];
 // portrait: the game waits behind the rotate screen and the bar is not drawn over it
 await page.setViewportSize({width:390,height:844});await tick(64);
 const portrait=await page.evaluate(()=>{const m=document.querySelector('.tennis-serve-meter'),r=m.getBoundingClientRect(),overlay=document.querySelector('.soccer-rotate'),hit=r.width&&r.height?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2):null;return {blocked:document.querySelector('.game-screen').dataset.orientationBlocked,overlay:Boolean(overlay&&!overlay.hidden),meterOnTop:Boolean(hit&&(hit===m||m.contains(hit))),meterInside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};});
 await shot('portrait');report.portrait=portrait;await page.setViewportSize(viewport);await tick(64);
 // left-handed: the game has had no hand switch since v9 (the stick is always on the left), but the stylesheet still mirrors the pad for
 // `.left-handed`; with that layout the bar must go to the pad's inner side and still cover nothing
 const sideOf=()=>page.evaluate(()=>{const m=document.querySelector('.tennis-serve-meter').getBoundingClientRect(),pad=document.querySelector('.soccer-actions').getBoundingClientRect(),ids=['#shoot','#pass','#sprint','#drop','.tennis-board','[data-action=game-pause]'],hits=ids.filter(s=>{const b=document.querySelector(s)?.getBoundingClientRect();return b&&m.left<b.right&&m.right>b.left&&m.top<b.bottom&&m.bottom>b.top;});return {meter:{x:Math.round(m.x),y:Math.round(m.y),w:Math.round(m.width),h:Math.round(m.height)},pad:{x:Math.round(pad.x),w:Math.round(pad.width)},hits};});
 let lefty=null;if(MODE==='after'){await page.evaluate(()=>document.querySelector('.soccer-controls').classList.add('left-handed'));await tick(900);lefty=await sideOf();await shot('left-handed-layout');await page.evaluate(()=>document.querySelector('.soccer-controls').classList.remove('left-handed'));await tick(900);}
 report.leftHanded=lefty;report.rightHanded=await sideOf();
 const tapped=returns.filter(r=>r.tapped);
 report.points=points;report.framesRun=framesRun;report.place={...place,rects:place.rects.slice(0,40)};report.serveMeter=serveSeen;
 report.returns=tapped.map(r=>({plan:r.plan,visibleBeforeTap:r.visibleBeforeTap,meterAtTap:r.meterAtTap&&{...r.meterAtTap,background:undefined},needleMoves:r.needleMoves,greenBand:r.greenBand,yellowBand:r.yellowBand,hit:r.hit,miss:r.miss}));
 report.drops=drops.map(d=>({...d,oppBackpedal:Math.round((d.oppStartZ-d.oppBackMost)*100)/100}));
 console.log(JSON.stringify({points:points.length,frames:framesRun,returns:tapped.length,drops:drops.length,place:{...place,rects:undefined},drops:report.drops.map(d=>({b1:d.b1,apex:d.apex,bounceTop:d.bounceTop,touch:d.touch,touchBounced:d.touchBounced,reason:d.reason,end:d.end,backpedal:d.oppBackpedal})),dead:report.deadBalls,portrait}));
 // ---- acceptance ----
 const check=(name,ok,detail)=>{report.checks[name]={ok:Boolean(ok),detail};if(!ok)failure??=new Error(`${name}: ${detail}`);};
 const green=tapped.filter(r=>r.plan==='green'&&r.hit),meterH=tapped.map(r=>r.meterAtTap?.rect.h||0),meterW=tapped.map(r=>r.meterAtTap?.rect.w||0);
 check('tappedReturns',tapped.length>=3,`tapped returns ${tapped.length}`);
 check('serveMeterSeen',serveSeen&&serveSeen.green&&serveSeen.yellow,JSON.stringify(serveSeen&&{...serveSeen,background:undefined}));
 check('barOnEveryIncomingBall',tapped.length&&tapped.every(r=>r.visibleBeforeTap&&r.meterAtTap?.visible),`${tapped.filter(r=>r.visibleBeforeTap&&r.meterAtTap?.visible).length}/${tapped.length}`);
 check('barColoursLikeServe',tapped.length&&tapped.every(r=>r.greenBand&&r.yellowBand),`${tapped.filter(r=>r.greenBand&&r.yellowBand).length}/${tapped.length}`);
 check('needleSweeps',tapped.length&&tapped.every(r=>r.needleMoves>=10),JSON.stringify(tapped.map(r=>r.needleMoves)));
 check('greenTapIsGood',green.length>=1&&green.every(r=>r.hit.grade==='good'),JSON.stringify(green.map(r=>[r.hit.zone,r.hit.grade,r.hit.rating])));
 check('barBigEnough',meterH.every(h=>h>=140)&&meterW.every(w=>w>=20),`${meterW.join(',')} x ${meterH.join(',')}`);
 const greenPx=tapped.filter(r=>r.hmAtTap&&r.meterAtTap).map(r=>Math.round(r.hmAtTap.greenHalf*2*r.meterAtTap.rect.h));
 report.greenPixels=greenPx;check('greenAtLeast40px',DIFFICULTY!=='easy'||greenPx.every(p=>p>=40),greenPx.join(','));
 check('barNeverOnButtonsOrScore',place.frames>0&&place.onButtons===0,`${place.onButtons}/${place.frames} frames`);
 check('barNeverOnCourt',place.frames>0&&place.onCourt===0,`${place.onCourt}/${place.frames} frames`);
 check('barNeverOnPlayer',place.frames>0&&place.onPlayer===0,`${place.onPlayer}/${place.frames} frames`);
 check('barDimWhenNotInUse',place.idleFrames>=20&&place.idleDim===place.idleFrames,`${place.idleDim}/${place.idleFrames} idle frames dimmed`);
 check('barOpaqueInUse',place.activeFrames>=20&&place.activeOpaque===place.activeFrames,`${place.activeOpaque}/${place.activeFrames} in-use frames opaque (${place.fadingFrames} frames mid-fade not counted)`);
 check('portraitWaitsBehindRotate',portrait.blocked==='true'&&portrait.overlay&&!portrait.meterOnTop,JSON.stringify(portrait));
 const r=report.rightHanded;check('rightHandedBarLeftOfPad',r.hits.length===0&&r.meter.x+r.meter.w<=r.pad.x-8,JSON.stringify(r));
 if(lefty)check('leftHandedBarRightOfPad',lefty.hits.length===0&&lefty.meter.x>=lefty.pad.x+lefty.pad.w+8,JSON.stringify(lefty));
 check('dropsPlayed',drops.length>=2,`drops ${drops.length}`);
 check('dropFloats',drops.length&&drops.every(d=>d.b1===null||d.b1>=1.55),JSON.stringify(drops.map(d=>d.b1)));
 check('dropBouncesHigh',drops.filter(d=>d.bounceTop!==null).length>=1&&drops.filter(d=>d.bounceTop!==null).every(d=>d.bounceTop>=.55),JSON.stringify(drops.map(d=>d.bounceTop)));
 check('dropNeverOutOfTheAir',drops.every(d=>d.touch===null||d.touchBounced),JSON.stringify(drops.map(d=>[d.touch,d.touchBounced])));
 check('dropNotOneSecondWin',drops.every(d=>d.touch!==null||d.end===null||d.end>=2.2),JSON.stringify(drops.map(d=>d.end)));
 check('noPageErrors',errors.length===0,JSON.stringify(errors.slice(0,3)));
 if(!await page.locator('.game-pause-sheet').count())await tap('[data-action=game-pause]');await tap('[data-action=game-exit]');await waitForGameNavigation(page);
 await csp.assertClean();report.csp=csp.snapshot();await context.close();
}catch(e){failure??=e;report.error=e.stack||e.message;}
finally{await writeFile(dir+'verification.json',JSON.stringify(report,null,1)+'\n');await browser.close();await server.close();}
const failed=Object.entries(report.checks).filter(([,c])=>!c.ok).map(([k,c])=>`${k} (${c.detail})`);
console.log(`tennis v23 ${MODE} ${DIFFICULTY}: ${Object.keys(report.checks).length-failed.length} checks passed, ${failed.length} failed`);for(const f of failed)console.log('  FAIL',f);
if(failure){console.error(failure.message);process.exit(1);}
