// QA round 2 (independent), not part of the suite. MODE=after|v14. Writes qa/tennis2-<mode>-*.jpg and qa/tennis2-<mode>.json
// Per incoming ball: needle per frame (model + DOM), value at contact; taps by plan: green / red / natural (eta<=0.05, ignores the meter) / drop (natural timing).
import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {serveIsland,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';
import {waitForGameStart,waitForGameNavigation} from '../../../tests/shell-ready.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const MODE=process.env.MODE||'after',FRAMES=Number(process.env.FRAMES)||1500,out=fileURLToPath(new URL('./',import.meta.url));
const PLAN=(process.env.PLAN||'green,red,natural,drop,green,drop,natural,drop,red,drop,natural,drop').split(',');
const viewport={width:844,height:390};
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const R={mode:MODE,returns:[],drops:[],points:[],errors:[],shots:[],serveMeters:[]};
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),MODE,...a);
const r3=v=>v==null?null:Math.round(v*1000)/1000;
try{
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
 page.on('pageerror',e=>R.errors.push('pageerror '+e.message));page.on('console',m=>{if(m.type()==='error')R.errors.push(m.text());});
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
 const tick=ms=>page.clock.runFor(ms),tap=s=>page.locator(s).tap();
 await page.clock.install();await page.goto(server.url+(MODE==='v14'?'?dev=1&tennisReturn=v14':'?dev=1'),{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await tap('[data-action=avatar-start]');await tick(32);
 R.saveKeysBefore=await page.evaluate(()=>Object.keys(window.__island.engine.state).sort());
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;
  for(const type of ['soccer','tennis']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}
  const r=data.config.minigames.tennis.render;r.slowFrameMs=100000;r.pixelRatios=r.pixelRatios.map(()=>.75);r.shadowEnabled=r.shadowEnabled.map(()=>false);});
 await page.evaluate(()=>window.__island.games.start('tennis',undefined,1));
 if(await page.locator('[data-action=game-understood]').count()){R.introText=(await page.locator('.game-screen, [role=dialog]').first().textContent()).slice(0,600);await shot0(page,'intro');await tick(32);await tap('[data-action=game-understood]');}
 await waitForGameStart(page);await tick(100);await waitForGameNavigation(page);
 for(let i=0;i<600;i++){const ok=await page.evaluate(()=>{const m=window.__island.games.current?.session.snapshot.renderMetrics;return Boolean(m&&(m.characterLoaded||m.mode==='canvas'));});if(ok)break;await tick(100);await page.waitForTimeout(50);}
 await tick(600);R.difficulty=await page.evaluate(()=>window.__island.engine.state.tennisDifficulty);R.search=await page.evaluate(()=>location.search);log('loaded',R.difficulty,R.search);
 const cdp=await context.newCDPSession(page);let active=[];
 const send=type=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:active.map(p=>({x:p.x,y:p.y,id:p.id}))});
 const down=async(id,x,y)=>{active=[...active.filter(p=>p.id!==id),{id,x,y}];await send('touchStart');};
 const move=async(id,x,y)=>{const p=active.find(p=>p.id===id);if(!p)return;p.x=x;p.y=y;await send('touchMove');};
 const up=async id=>{const p=active.find(p=>p.id===id);if(!p)return;active=active.filter(q=>q.id!==id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:p.x,y:p.y,id}]});};
 const box=async s=>{const b=await page.locator(s).boundingBox();return b&&{x:b.x+b.width/2,y:b.y+b.height/2,r:[Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};};
 const zone=await box('.soccer-stick-zone'),hit=await box('#shoot'),serveBtn=await box('#pass'),dropBtn=await box('#drop');R.buttons={hit:hit.r,serve:serveBtn.r,drop:dropBtn.r};
 const read=()=>page.evaluate(()=>{const s=window.__island.games.current.session.snapshot,m=document.querySelector('.tennis-serve-meter'),r=m?.getBoundingClientRect(),cs=m&&getComputedStyle(m),nd=m?.querySelector('.tennis-serve-needle'),pb=m?.querySelector('.tennis-perfect-band'),pbs=pb&&getComputedStyle(pb);
  const visible=Boolean(m)&&!m.hidden&&cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity)>0&&r.width>0&&r.height>0;
  return {phase:s.phase,server:s.server,serveMeter:s.serveMeter,serveZone:s.serveZone,elapsed:s.elapsed,pointNumber:s.pointNumber,rallyHits:s.rallyHits,charge:s.charge,contact:s.contact?{side:s.contact.side,eta:s.contact.eta,at:s.contact.at,x:s.contact.x}:null,shotSide:s.shot?.side??null,shotDrop:Boolean(s.shot?.drop),lastHitter:s.ball.lastHitter,ball:{x:s.ball.x,y:s.ball.y,z:s.ball.z,b:s.ball.bounces},px:s.players[0].x,ox:s.players[1].x,oz:s.players[1].z,
   hm:s.hitMeter?{active:s.hitMeter.active,value:s.hitMeter.value,zone:s.hitMeter.zone,sweep:Boolean(s.hitMeter.sweep),g:s.hitMeter.greenHalf,y:s.hitMeter.yellowHalf,p:s.hitMeter.perfectHalf}:null,
   meter:{visible,mode:m?.dataset.mode,zone:m?.dataset.zone,sweepAttr:m?.dataset.sweep,cls:m?.className,rect:r?[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]:null,bg:m?.style.background||'',needle:nd?.style.bottom||'',perfect:pb?{hidden:pb.hidden,display:pbs.display,bg:pbs.backgroundColor,h:pb.style.height,b:pb.style.bottom}:null},
   event:{id:s.event.id,type:s.event.type,side:s.event.side,reason:s.event.reason,winner:s.event.winner,serving:s.event.serving,rating:s.event.rating,grade:s.event.grade,zone:s.event.zone,needle:s.event.needle,power:s.event.power}};});
 const shot=async name=>{const f=`tennis2-${MODE}${process.env.TAG||""}-${name}.jpg`;await page.screenshot({path:out+f,type:'jpeg',quality:72});R.shots.push(f);};
 let openDrops=[],s=await read(),frames=0,eventId=-1,inc=null,nInc=0,drop=null,stick=false,serveShots=0,lastZ=null,lastY=null,oppHitId=-1;
 const stickTo=async dx=>{const d=Math.max(-1,Math.min(1,dx*4))*44;if(!stick){await down(1,zone.x,zone.y);stick=true;}await move(1,zone.x+d,zone.y);};
 const stickOff=async()=>{if(stick){await up(1);stick=false;}};
 const tapBtn=async b=>{await down(2,b.x,b.y);await tick(70);await up(2);};
 const absorb=s=>{if(s.event.id===eventId)return;eventId=s.event.id;const e=s.event;
  if(e.type==='hit'&&e.side===1)oppHitId=e.id;
  if(e.type==='hit'&&e.side===0&&!e.serving){if(inc&&inc.tapped&&!inc.result)inc.result={rating:e.rating,grade:e.grade,zone:e.zone,needle:r3(e.needle),power:r3(e.power),drop:s.shotDrop};if(s.shotDrop&&drop&&!drop.at){drop.at=s.elapsed;lastZ=s.ball.z;lastY=s.ball.y;}}
  if(e.type==='hit'&&e.side===1&&!e.serving&&drop?.at&&drop.reached==null){drop.reached=true;drop.reachedAfter=+(s.elapsed-drop.at).toFixed(2);drop.oppRating=e.rating;R.drops.push(drop);openDrops.push(drop);drop=null;}
  if(e.type==='missSwing'&&inc&&!inc.result)inc.result={miss:e.reason};
  if(['point','game','complete'].includes(e.type)){R.points.push({n:s.pointNumber,winner:e.winner,reason:e.reason,rallyHits:s.rallyHits,t:+s.elapsed.toFixed(2)});
   for(const d of openDrops)d.secondsToPointEnd=+(s.elapsed-d.at).toFixed(2);openDrops=[];if(drop?.at){drop.seconds=+(s.elapsed-drop.at).toFixed(2);drop.winner=e.winner;drop.reason=e.reason;drop.reached??=false;R.drops.push(drop);}drop=null;}};
 absorb(s);
 while(frames<FRAMES&&s.phase!=='complete'&&!(R.drops.length>=4&&R.returns.filter(r=>r.tapped).length>=8)){
  let step=40;
  if(s.server===0&&s.phase==='serve'){await stickOff();await tapBtn(serveBtn);}
  else if(s.phase==='toss'&&s.server===0){step=16;
   if(s.meter.visible&&R.serveMeters.length<40)R.serveMeters.push({t:r3(s.elapsed),v:r3(s.serveMeter),needle:s.meter.needle,rect:s.meter.rect,mode:s.meter.mode,perfect:s.meter.perfect,cls:s.meter.cls});
   if(serveShots<1&&s.meter.visible&&s.serveMeter>.35&&s.serveMeter<.6){await shot('serve-meter');serveShots++;R.serveMeterDom=s.meter;}
   if(s.serveZone==='green'&&Math.abs(s.serveMeter-.5)<.09)await tapBtn(serveBtn);}
  else if(s.phase==='rally'&&s.contact?.side===0&&s.shotSide===1&&s.lastHitter===1){
   const key=s.pointNumber+':'+oppHitId;
   if(!inc||inc.key!==key){const plan=PLAN[nInc%PLAN.length];nInc++;inc={key,plan,etaStart:r3(s.contact.eta),contactAt:r3(s.contact.at),samples:[],tapped:false};R.returns.push(inc);if(plan==='drop')drop={point:s.pointNumber,crossY:null};log('incoming',nInc,plan,'eta',inc.etaStart);}
   step=s.contact.eta<.7?16:30;
   inc.samples.push({t:r3(s.elapsed),eta:r3(s.contact.eta),v:r3(s.hm?.value),zone:s.hm?.zone,act:s.hm?.active,sweep:s.hm?.sweep,vis:s.meter.visible,mode:s.meter.mode,needle:s.meter.needle,perfectShown:Boolean(s.meter.perfect&&!s.meter.perfect.hidden&&s.meter.perfect.display!=='none')});
   if(!inc.bands&&s.hm?.active)inc.bands={g:r3(s.hm.g),y:r3(s.hm.y),p:r3(s.hm.p),bg:s.meter.bg.slice(0,220),rect:s.meter.rect,perfect:s.meter.perfect};
   if(!inc.tapped){await stickTo(s.contact.x-s.px);
    if(nInc<=4){const v=s.hm?.value??0;for(const [lo,hi,nm] of [[.15,.3,'lo'],[.42,.58,'mid']])if(v>=lo&&v<hi&&!inc['sh'+nm]){await shot(`ball${nInc}-needle-${nm}`);inc['sh'+nm]=true;}}
    const v=s.hm?.value,zn=s.hm?.zone,eta=s.contact.eta;
    const due=inc.plan==='green'?(zn==='green'&&Math.abs(v-.5)<=(s.hm.p||.03)+.02)||eta<=0.0:inc.plan==='red'?(MODE==='v14'?eta<=.5:(s.hm?.active&&v>=.08&&v<=.2)):eta<=.05;
    if(due){inc.tapped=true;inc.atTap={eta:r3(eta),v:r3(v),zone:zn,needle:s.meter.needle,vis:s.meter.visible};if(nInc<=6)await shot(`ball${nInc}-${inc.plan}-tap`);await tapBtn(inc.plan==='drop'?dropBtn:hit);}}
  }else{await stickOff();
   if(drop?.at&&s.lastHitter===0){step=16;const z=s.ball.z,y=s.ball.y;if(drop.crossY==null&&lastZ!=null&&lastZ>0&&z<=0){const f=lastZ/(lastZ-z);drop.crossY=r3(lastY+(y-lastY)*f);if(!drop.shot){await shot(`drop${R.drops.length+1}-flight`);drop.shot=true;}}lastZ=z;lastY=y;}}
  await tick(step);frames++;s=await read();absorb(s);
  if(frames%100===0)log('frame',frames,'points',R.points.length,'drops',R.drops.length,'returns',R.returns.length);
 }
 await stickOff();R.frames=frames;
 R.saveKeysAfter=await page.evaluate(()=>Object.keys(window.__island.engine.state).sort());
 if(!await page.locator('.game-pause-sheet').count())await tap('[data-action=game-pause]');await tap('[data-action=game-exit]');await waitForGameNavigation(page);
 R.saveKeysExit=await page.evaluate(()=>Object.keys(window.__island.engine.state).sort());
 await csp.assertClean();R.csp=csp.snapshot();await context.close();
}catch(e){R.fatal=e.stack;console.error(e);}
finally{await writeFile(out+`tennis2-${MODE}${process.env.TAG||""}.json`,JSON.stringify(R,null,1));await browser.close();await server.close();}
async function shot0(page,name){const f=`tennis2-${MODE}${process.env.TAG||""}-${name}.jpg`;await page.screenshot({path:out+f,type:'jpeg',quality:72});R.shots.push(f);}
log('done',JSON.stringify({returns:R.returns.length,drops:R.drops.map(d=>[d.seconds,d.reached,d.crossY]),errors:R.errors.length,fatal:Boolean(R.fatal)}));
