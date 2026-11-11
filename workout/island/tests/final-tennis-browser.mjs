// Acceptance test for Roy's two tennis complaints, played through the REAL island shell (index.html?dev=1 -> games.start('tennis'))
// with real touch (Chromium, hasTouch + isMobile, 844x390, CDP Input.dispatchTouchEvent on the on-screen joystick and buttons), the way a
// child plays: short taps on the hit button when the ball arrives, never a long hold.
//   MODE=after  node workout/island/tests/final-tennis-browser.mjs   (default: the shipped code; must pass)
//   MODE=before node workout/island/tests/final-tennis-browser.mjs   (kill switches ?tennisBar=0&tennisDrop=0 = the v20 behaviour; must FAIL)
// Writes frames to verification/final-fix-fable/frames/tennis-<mode>-*.jpg and the run log to verification/final-fix-fable/tennis-<mode>/.
// Exits non-zero on any failed assertion. CHROMIUM_PATH points at the browser (default /usr/bin/chromium).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland,installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';
import {waitForGameStart,waitForGameNavigation} from './shell-ready.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const MODE=process.env.MODE==='before'?'before':'after',POINTS=Number(process.env.POINTS)||10,DIFFICULTY=process.env.DIFFICULTY||'';
const base=fileURLToPath(new URL('../verification/final-fix-fable/',import.meta.url)),frames=base+'frames/',logDir=base+`tennis-${MODE}/`;
await mkdir(frames,{recursive:true});await mkdir(logDir,{recursive:true});
const viewport={width:844,height:390};
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={mode:MODE,viewport,browser:'Chromium / SwiftShader',browserVersion:browser.version(),physicalPhone:false,touch:'CDP Input.dispatchTouchEvent',checks:{},frames:[]};
let failure=null;
try{
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const csp=await installIslandCspMonitor(context),page=await context.newPage(),errors=[];await csp.attachPage(page);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
 const tick=ms=>page.clock.runFor(ms),tap=s=>page.locator(s).tap();
 await page.clock.install();await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await csp.assertClean();
 await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await tap('[data-action=avatar-start]');await tick(32);
 await page.evaluate(({mode,difficulty})=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;
  for(const type of ['soccer','tennis']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}
  if(difficulty)e.setTennisDifficulty(difficulty);
  data.config.minigames.tennis.render.slowFrameMs=100000;/* SwiftShader timing must not change the render tier */
  // The session reads its kill switches from location.search when the game starts: "before" is the v20 behaviour.
  if(mode==='before')history.replaceState(null,'',location.pathname+'?dev=1&tennisBar=0&tennisDrop=0');},{mode:MODE,difficulty:DIFFICULTY});
 const start=async id=>{await page.evaluate(id=>window.__island.games.start(id,undefined,1),id);if(await page.locator('[data-action=game-understood]').count()){await tick(32);await tap('[data-action=game-understood]');}await waitForGameStart(page);await tick(100);await waitForGameNavigation(page);};
 await start('tennis');
 await page.waitForFunction(()=>{const m=window.__island.games.current?.session.snapshot.renderMetrics;return m&&(m.characterLoaded||m.mode==='canvas');});await tick(600);
 report.difficulty=await page.evaluate(()=>window.__island.engine.state.tennisDifficulty);
 report.search=await page.evaluate(()=>location.search);
 // Real touch through CDP. Finger 1 = left thumb on the joystick, finger 2 = right thumb on a button; every call sends the full set of active points.
 const cdp=await context.newCDPSession(page);let active=[];
 const send=type=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:active.map(p=>({x:p.x,y:p.y,id:p.id}))});
 const down=async(id,x,y)=>{active=[...active.filter(p=>p.id!==id),{id,x,y}];await send('touchStart');};
 const move=async(id,x,y)=>{const p=active.find(p=>p.id===id);if(!p)return;p.x=x;p.y=y;await send('touchMove');};
 const up=async id=>{const p=active.find(p=>p.id===id);if(!p)return;active=active.filter(q=>q.id!==id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:p.x,y:p.y,id}]});/* CDP: touchEnd lists the released fingers only; the others stay down */};
 const box=async s=>{const b=await page.locator(s).boundingBox();assert.ok(b,s+' is on screen');return {x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height};};
 const zone=await box('.soccer-stick-zone'),hit=await box('#shoot'),serveBtn=await box('#pass'),dropBtn=await box('#drop');
 assert.ok(zone.x<viewport.width/2,'joystick on the left half');assert.ok(hit.x>viewport.width/2,'hit button on the right half');
 report.controls={zone,hit,serve:serveBtn,drop:dropBtn};
 // A child's tap: 70 ms down, then up. The hit fires on release (v20) and the bar must already be up before the finger lands.
 const tapButton=async(b,ms=70)=>{await down(2,b.x,b.y);await tick(ms);await up(2);};
 const read=()=>page.evaluate(()=>{const s=window.__island.games.current.session.snapshot,m=document.querySelector('.tennis-serve-meter'),r=m?.getBoundingClientRect(),cs=m&&getComputedStyle(m),needle=m?.querySelector('.tennis-serve-needle');
  const visible=Boolean(m)&&!m.hidden&&cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity)>0&&r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;
  return {phase:s.phase,server:s.server,serveZone:s.serveZone,serveMeter:s.serveMeter,elapsed:s.elapsed,pointNumber:s.pointNumber,rallyHits:s.rallyHits,charge:s.charge,
   contact:s.contact?{side:s.contact.side,eta:s.contact.eta,x:s.contact.x,z:s.contact.z}:null,shotSide:s.shot?.side??null,shotDrop:Boolean(s.shot?.drop),lastHitter:s.ball.lastHitter,ballZ:s.ball.z,ballY:s.ball.y,px:s.players[0].x,pz:s.players[0].z,ox:s.players[1].x,oz:s.players[1].z,
   hm:s.hitMeter?{active:s.hitMeter.active,value:s.hitMeter.value,zone:s.hitMeter.zone,greenHalf:s.hitMeter.greenHalf,yellowHalf:s.hitMeter.yellowHalf}:null,
   meter:{exists:Boolean(m),hidden:m?.hidden??null,visible,mode:m?.dataset.mode??null,zone:m?.dataset.zone??null,rect:r?{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}:null,background:m?.style.background||'',needleBottom:needle?.style.bottom||''},
   event:{id:s.event.id,type:s.event.type,side:s.event.side,reason:s.event.reason,winner:s.event.winner,serving:s.event.serving},renderMode:s.renderMetrics?.mode};});
 const shotFrame=async name=>{const file=`tennis-${MODE}-${name}.jpg`;await page.screenshot({path:frames+file,type:'jpeg',quality:70});report.frames.push(file);};
 const hasGreen=bg=>/#67d398|103,\s*211,\s*152/i.test(bg),hasYellow=bg=>/#efc355|239,\s*195,\s*85/i.test(bg);
 // ---- play ----
 const points=[],returns=[],drops=[];let serveSeen=null,stickOn=false,eventId=-1,incomingKey=null,incoming=null,pendingDrop=null,serveTapAt=0,framesRun=0,shotServe=false,shotReturn=false,shotTap=false,shotDrop=false;
 const stickTowards=async targetX=>{const sx=zone.x,sy=zone.y,dx=Math.max(-1,Math.min(1,targetX*4))*44;if(!stickOn){await down(1,sx,sy);stickOn=true;}await move(1,sx+dx,sy);};
 const stickOff=async()=>{if(stickOn){await up(1);stickOn=false;}};
 let s=await read();const startPoint=s.pointNumber;
 while(s.pointNumber-startPoint<POINTS&&s.phase!=='complete'&&framesRun<9000){
  const step=(s.phase==='rally'&&s.contact?.side===0&&s.contact.eta<.6)||s.phase==='toss'?16:40;
  if(s.event.id!==eventId){eventId=s.event.id;const e=s.event;
   if(e.type==='hit'&&e.side===0&&!e.serving&&s.shotDrop){pendingDrop={at:s.elapsed,reached:false,pointNumber:s.pointNumber,landZ:null};}
   if(e.type==='hit'&&e.side===1&&!e.serving&&pendingDrop)pendingDrop.reached=true;
   if(e.type==='bounce'&&pendingDrop&&pendingDrop.landZ===null&&s.lastHitter===0)pendingDrop.landZ=s.ballZ;
   if(['point','game','complete'].includes(e.type)){points.push({n:s.pointNumber,winner:e.winner,reason:e.reason,rallyHits:s.rallyHits,elapsed:s.elapsed});if(pendingDrop){drops.push({...pendingDrop,end:s.elapsed,seconds:s.elapsed-pendingDrop.at,winner:e.winner,reason:e.reason});pendingDrop=null;}if(incoming){returns.push(incoming);incoming=null;incomingKey=null;}}}
  if(s.server===0&&s.phase==='serve'){await stickOff();await tapButton(serveBtn);serveTapAt=s.elapsed;}
  else if(s.phase==='toss'&&s.server===0){
   if(!serveSeen&&s.meter.visible){serveSeen={...s.meter,serveMeter:s.serveMeter,green:hasGreen(s.meter.background),yellow:hasYellow(s.meter.background)};}
   if(!shotServe&&s.meter.visible&&s.serveMeter>.3){await shotFrame('serve-meter');shotServe=true;}
   if(s.serveZone==='green'&&Math.abs(s.serveMeter-.5)<.09){await tapButton(serveBtn);}
  }
  else if(s.phase==='rally'&&s.contact?.side===0&&s.shotSide===1&&s.lastHitter===1){
   const key=`${s.pointNumber}:${s.rallyHits}`;
   if(key!==incomingKey){if(incoming)returns.push(incoming);incomingKey=key;incoming={key,pointNumber:s.pointNumber,etaAtStart:s.contact.eta,visibleBeforeTap:false,visibleFrames:0,frames:0,meterAtTap:null,hmAtTap:null,tapped:false,drop:false,zoneAtTap:null,greenBand:false,yellowBand:false,modes:new Set()};}
   incoming.frames++;if(s.meter.visible){incoming.visibleFrames++;incoming.modes.add(s.meter.mode);if(hasGreen(s.meter.background))incoming.greenBand=true;if(hasYellow(s.meter.background))incoming.yellowBand=true;}
   if(!incoming.tapped){
    if(s.meter.visible&&s.contact.eta>.2)incoming.visibleBeforeTap=true;
    await stickTowards(s.contact.x-s.px);
    if(!shotReturn&&s.contact.eta<.75&&s.contact.eta>.45){await shotFrame('return-incoming');shotReturn=true;}
    if(s.contact.eta<=.08){const dropNow=(s.pointNumber%2===1)&&s.rallyHits>=2&&s.pz<7.4;incoming.meterAtTap={...s.meter};incoming.hmAtTap=s.hm;incoming.zoneAtTap=s.hm?.zone??null;incoming.tapped=true;incoming.drop=dropNow;
     if(!shotTap){await shotFrame('return-tap');shotTap=true;}
     await tapButton(dropNow?dropBtn:hit);}
   }
  }else{await stickOff();if(pendingDrop&&!shotDrop&&s.lastHitter===0&&s.ballZ<0){await shotFrame('drop-flight');shotDrop=true;}}
  await tick(step);framesRun++;s=await read();
 }
 await stickOff();
 if(incoming)returns.push(incoming);
 report.pointsPlayed=points.length;report.framesRun=framesRun;report.renderMode=s.renderMode;report.points=points;
 const tapped=returns.filter(r=>r.tapped);
 report.returns=tapped.map(r=>({...r,modes:[...r.modes]}));
 report.serveMeter=serveSeen;
 const meterOnTap=tapped.filter(r=>r.visibleBeforeTap&&r.meterAtTap?.visible),withBands=tapped.filter(r=>r.greenBand&&r.yellowBand);
 report.drops=drops.map(d=>({...d,seconds:Math.round(d.seconds*100)/100}));
 const dropsNobodyTouched=drops.filter(d=>!d.reached&&d.winner===0),fast=drops.filter(d=>d.seconds<=1.05&&!d.reached);
 report.summary={tappedReturns:tapped.length,meterVisibleOnTappedReturn:meterOnTap.length,meterWithGreenAndYellow:withBands.length,drops:drops.length,dropsReached:drops.filter(d=>d.reached).length,dropsNobodyTouched:dropsNobodyTouched.length,dropsEndedWithinOneSecondUntouched:fast.length,dropSeconds:drops.map(d=>Math.round(d.seconds*100)/100)};
 console.log(JSON.stringify(report.summary));
 // ---- acceptance ----
 const check=(name,ok,detail)=>{report.checks[name]={ok:Boolean(ok),detail};if(!ok)failure??=new Error(`${name}: ${detail}`);};
 check('servePlayed',points.length>=Math.min(POINTS,4),`points ${points.length}`);
 check('serveMeterVisibleWithGreenAndYellow',serveSeen&&serveSeen.green&&serveSeen.yellow,JSON.stringify(serveSeen));
 check('tappedReturns',tapped.length>=3,`tapped returns ${tapped.length}`);
 // (a) every tapped return: the bar is on screen before the finger lands and when it lands, with green in the middle and yellow around it, like the serve
 check('meterVisibleOnEveryTappedReturn',tapped.length&&meterOnTap.length===tapped.length,`${meterOnTap.length}/${tapped.length} tapped returns had the bar on screen before and at the tap`);
 check('meterHasGreenAndYellowLikeServe',tapped.length&&withBands.length===tapped.length,`${withBands.length}/${tapped.length}`);
 check('meterBigEnough',tapped.every(r=>r.meterAtTap&&r.meterAtTap.rect.h>=100&&r.meterAtTap.rect.w>=14),JSON.stringify(tapped.map(r=>r.meterAtTap?.rect)));
 // (b) a near-net drop is not an automatic one-second win: the opponent reaches it, and the point lasts
 check('dropsPlayed',drops.length>=2,`drops ${drops.length}`);
 check('dropNotOneSecondWin',drops.length&&fast.length===0,`${fast.length}/${drops.length} drops ended untouched within ~1 s (seconds: ${report.summary.dropSeconds.join(', ')})`);
 check('dropReachedByOpponent',drops.length&&drops.filter(d=>d.reached).length>=Math.ceil(drops.length/2),`${drops.filter(d=>d.reached).length}/${drops.length} reached`);
 check('dropLastsAtLeast1_2s',drops.length&&drops.every(d=>d.seconds>=1.2),report.summary.dropSeconds.join(', '));
 check('noPageErrors',errors.length===0,JSON.stringify(errors.slice(0,3)));
 if(!await page.locator('.game-pause-sheet').count())await tap('[data-action=game-pause]');await tap('[data-action=game-exit]');await waitForGameNavigation(page);
 await csp.assertClean();report.csp=csp.snapshot();await context.close();
}catch(e){failure??=e;report.error=e.stack||e.message;}
finally{await writeFile(logDir+'verification.json',JSON.stringify(report,null,1)+'\n');await browser.close();await server.close();}
const failed=Object.entries(report.checks).filter(([,c])=>!c.ok).map(([k,c])=>`${k} (${c.detail})`);
console.log(`tennis ${MODE}: ${Object.keys(report.checks).length-failed.length} checks passed, ${failed.length} failed`);for(const f of failed)console.log('  FAIL',f);
if(failure){console.error(failure.message);process.exit(1);}
