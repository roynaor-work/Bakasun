// QA (independent) scenario, not part of the suite. MODE=after|bar0. Writes qa/tennis-<mode>-*.jpg and qa/tennis-<mode>.json
import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {serveIsland,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';
import {waitForGameStart,waitForGameNavigation} from '../../../tests/shell-ready.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const MODE=process.env.MODE||'after',FRAMES=Number(process.env.FRAMES)||900,out=fileURLToPath(new URL('./',import.meta.url));
const viewport={width:844,height:390};
const server=await serveIsland('/workout/island/'),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const R={mode:MODE,returns:[],holds:[],drops:[],points:[],errors:[],shots:[]};
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
try{
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
 const csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
 page.on('pageerror',e=>R.errors.push('pageerror '+e.message));page.on('console',m=>{if(m.type()==='error')R.errors.push(m.text());});
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
 const tick=ms=>page.clock.runFor(ms),tap=s=>page.locator(s).tap();
 await page.clock.install();await page.goto(server.url+(MODE==='bar0'?'?dev=1&tennisBar=0':MODE==='before'?'?dev=1&tennisBar=0&tennisDrop=0':'?dev=1'),{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await tap('[data-action=avatar-start]');await tick(32);
 R.saveKeysBefore=await page.evaluate(()=>Object.keys(window.__island.engine.state).sort());
 await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;
  for(const type of ['soccer','tennis']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}
  const r=data.config.minigames.tennis.render;r.slowFrameMs=100000;r.pixelRatios=r.pixelRatios.map(()=>.75);r.shadowEnabled=r.shadowEnabled.map(()=>false);});
 await page.evaluate(()=>window.__island.games.start('tennis',undefined,1));if(await page.locator('[data-action=game-understood]').count()){await tick(32);await tap('[data-action=game-understood]');}await waitForGameStart(page);await tick(100);await waitForGameNavigation(page);
 for(let i=0;i<600;i++){const ok=await page.evaluate(()=>{const m=window.__island.games.current?.session.snapshot.renderMetrics;return Boolean(m&&(m.characterLoaded||m.mode==='canvas'));});if(ok)break;await tick(100);await page.waitForTimeout(50);}
 await tick(600);R.difficulty=await page.evaluate(()=>window.__island.engine.state.tennisDifficulty);R.search=await page.evaluate(()=>location.search);log('loaded',R.difficulty,R.search);
 const cdp=await context.newCDPSession(page);let active=[];
 const send=type=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:active.map(p=>({x:p.x,y:p.y,id:p.id}))});
 const down=async(id,x,y)=>{active=[...active.filter(p=>p.id!==id),{id,x,y}];await send('touchStart');};
 const move=async(id,x,y)=>{const p=active.find(p=>p.id===id);if(!p)return;p.x=x;p.y=y;await send('touchMove');};
 const up=async id=>{const p=active.find(p=>p.id===id);if(!p)return;active=active.filter(q=>q.id!==id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:p.x,y:p.y,id}]});};
 const box=async s=>{const b=await page.locator(s).boundingBox();return b&&{x:b.x+b.width/2,y:b.y+b.height/2};};
 const zone=await box('.soccer-stick-zone'),hit=await box('#shoot'),serveBtn=await box('#pass'),dropBtn=await box('#drop');
 R.labels=await page.evaluate(()=>['#shoot','#pass','#drop'].map(s=>{const b=document.querySelector(s);return {s,label:b?.getAttribute('aria-label'),text:b?.textContent.trim()};}));
 R.hint=await page.evaluate(()=>[...document.querySelectorAll('.game-screen [class*=hint], .game-screen [class*=help]')].map(e=>e.textContent.trim()).filter(Boolean).slice(0,10));
 const read=()=>page.evaluate(()=>{const s=window.__island.games.current.session.snapshot,m=document.querySelector('.tennis-serve-meter'),r=m?.getBoundingClientRect(),cs=m&&getComputedStyle(m),nd=m?.querySelector('.tennis-serve-needle');
  const visible=Boolean(m)&&!m.hidden&&cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0;
  return {phase:s.phase,server:s.server,serveMeter:s.serveMeter,serveZone:s.serveZone,elapsed:s.elapsed,pointNumber:s.pointNumber,rallyHits:s.rallyHits,charge:s.charge,contact:s.contact?{side:s.contact.side,eta:s.contact.eta,x:s.contact.x,z:s.contact.z}:null,shotSide:s.shot?.side??null,shotDrop:Boolean(s.shot?.drop),lastHitter:s.ball.lastHitter,ball:{x:s.ball.x,y:s.ball.y,z:s.ball.z,b:s.ball.bounces},px:s.players[0].x,pz:s.players[0].z,ox:s.players[1].x,oz:s.players[1].z,
   hm:s.hitMeter?{active:s.hitMeter.active,value:+s.hitMeter.value.toFixed(3),zone:s.hitMeter.zone}:null,
   meter:{visible,cls:m?.className,mode:m?.dataset.mode,zone:m?.dataset.zone,rect:r?[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]:null,bg:cs?.backgroundImage?.slice(0,160),needle:nd?.style.bottom||''},
   status:document.querySelector('.game-screen [role=status], .tennis-serve-hint')?.textContent?.trim()?.slice(0,80)||'',
   event:{id:s.event.id,type:s.event.type,side:s.event.side,reason:s.event.reason,winner:s.event.winner,serving:s.event.serving,rating:s.event.rating}};});
 const shot=async name=>{const f=`tennis-${MODE}${process.env.TAG||''}-${name}.jpg`;await page.screenshot({path:out+f,type:'jpeg',quality:72});R.shots.push(f);};
 let s=await read(),frames=0,eventId=-1,inc=null,nInc=0,hold=null,drop=null,stick=false,servedShot=false;
 const stickTo=async dx=>{const d=Math.max(-1,Math.min(1,dx*4))*44;if(!stick){await down(1,zone.x,zone.y);stick=true;}await move(1,zone.x+d,zone.y);};
 const stickOff=async()=>{if(stick){await up(1);stick=false;}};
 const absorb=s=>{if(s.event.id===eventId)return;eventId=s.event.id;const e=s.event;
  if(e.type==='hit'&&e.side===0&&!e.serving){if(inc&&!inc.result)inc.result={rating:e.rating,drop:s.shotDrop};if(s.shotDrop&&drop&&!drop.at)drop.at=s.elapsed;}
  if(e.type==='hit'&&e.side===1&&!e.serving&&drop?.at&&drop.reached==null){drop.reached=true;drop.reachedAfter=+(s.elapsed-drop.at).toFixed(2);drop.oppRating=e.rating;drop.ballAtReach=[+s.ball.x.toFixed(2),+s.ball.y.toFixed(2),+s.ball.z.toFixed(2),s.ball.b];R.drops.push(drop);drop=null;}
  if(e.type==='missSwing'&&inc&&!inc.result)inc.result={miss:e.reason};
  if(['point','game','complete'].includes(e.type)){R.points.push({n:s.pointNumber,winner:e.winner,reason:e.reason,rallyHits:s.rallyHits,t:+s.elapsed.toFixed(2)});
   if(drop?.at){drop.end=s.elapsed;drop.seconds=+(s.elapsed-drop.at).toFixed(2);drop.winner=e.winner;drop.reason=e.reason;drop.reached??=false;R.drops.push(drop);}drop=null;}};
 absorb(s);
 while(frames<FRAMES&&s.phase!=='complete'&&R.drops.length<(Number(process.env.DROPS)||3)){
  let step=40;
  if(s.server===0&&s.phase==='serve'){await stickOff();await down(2,serveBtn.x,serveBtn.y);await tick(70);await up(2);}
  else if(s.phase==='toss'&&s.server===0){step=16;if(!servedShot&&s.meter.visible&&s.serveMeter>.3){await shot('serve-meter');R.serveMeterDom=s.meter;servedShot=true;}if(s.serveZone==='green'&&Math.abs(s.serveMeter-.5)<.09){await down(2,serveBtn.x,serveBtn.y);await tick(70);await up(2);}}
  else if(s.phase==='rally'&&s.contact?.side===0&&s.shotSide===1&&s.lastHitter===1){
   const key=s.pointNumber+':'+s.rallyHits;
   if(!inc||inc.key!==key){const kind=process.env.KINDS?process.env.KINDS.split(',')[nInc%process.env.KINDS.split(',').length]:MODE==='bar0'?'tap':['tap','hold','drop','tap','drop','hold','drop'][nInc%7];nInc++;inc={key,kind,etaStart:+s.contact.eta.toFixed(2),meterAtStart:s.meter,samples:[],done:false};R.returns.push(inc);if(kind==='drop')drop={point:s.pointNumber,kind:'dropbutton'};log('incoming',key,kind,'eta',inc.etaStart,'meterVisible',s.meter.visible);}
   step=s.contact.eta<.7?16:40;
   inc.samples.push({eta:+s.contact.eta.toFixed(2),vis:s.meter.visible,mode:s.meter.mode,needle:s.meter.needle,hm:s.hm,charge:+s.charge.toFixed(3)});
   if(!inc.done){await stickTo(s.contact.x-s.px);
    if(inc.kind==='tap'&&!inc.shotBefore&&s.contact.eta<.6&&s.contact.eta>.3){await shot(`tap${nInc}-before`);inc.shotBefore=true;inc.meterBefore=s.meter;}
    if(inc.kind==='hold'&&!hold&&s.contact.eta<=1.1){await down(2,hit.x,hit.y);hold={t0:s.elapsed,eta0:+s.contact.eta.toFixed(2),samples:[]};inc.hold=hold;R.holds.push(hold);}
    if(hold&&inc.kind==='hold'){hold.samples.push({dt:+(s.elapsed-hold.t0).toFixed(2),needle:s.meter.needle,vis:s.meter.visible,zone:s.hm?.zone,charge:+s.charge.toFixed(3)});
     if(!hold.mid&&s.elapsed-hold.t0>.6){await shot(`hold${nInc}-mid`);hold.mid=true;}
     if(s.elapsed-hold.t0>=1.0||s.contact.eta<=.05){hold.releaseAt={dt:+(s.elapsed-hold.t0).toFixed(2),eta:+s.contact.eta.toFixed(2),needle:s.meter.needle,zone:s.hm?.zone};await up(2);hold=null;inc.done=true;}}
    if(inc.kind!=='hold'&&s.contact.eta<=.08){inc.meterAtTap=s.meter;inc.hmAtTap=s.hm;if(inc.kind==='tap'){await down(2,hit.x,hit.y);await tick(35);const mid=await read();inc.meterDuringTap=mid.meter;await shot(`tap${nInc}-during`);await tick(35);await up(2);}else{await shot(`drop${nInc}-tap`);await down(2,dropBtn.x,dropBtn.y);await tick(70);await up(2);}inc.done=true;const af=await read();inc.after={meter:af.meter,hm:af.hm};}}
  }else{if(hold){await up(2);hold=null;}await stickOff();
   if(drop?.at&&s.lastHitter===0&&s.ball.z<0){if(!drop.track)drop.track=[];drop.track.push({dt:+(s.elapsed-drop.at).toFixed(2),ball:[+s.ball.x.toFixed(2),+s.ball.y.toFixed(2),+s.ball.z.toFixed(2),s.ball.b],opp:[+s.ox.toFixed(2),+s.oz.toFixed(2)]});if(!drop.shot){await shot(`drop-flight-${R.drops.length+1}`);drop.shot=true;}}
   step=drop?.at?40:60;}
  await tick(step);frames++;s=await read();absorb(s);
  if(frames%100===0)log('frame',frames,'points',R.points.length,'drops',R.drops.length,'returns',R.returns.length);
 }
 await stickOff();R.frames=frames;
 R.saveKeysAfter=await page.evaluate(()=>Object.keys(window.__island.engine.state).sort());
 if(!await page.locator('.game-pause-sheet').count())await tap('[data-action=game-pause]');await tap('[data-action=game-exit]');await waitForGameNavigation(page);
 R.saveKeysExit=await page.evaluate(()=>Object.keys(window.__island.engine.state).sort());
 await csp.assertClean();R.csp=csp.snapshot();await context.close();
}catch(e){R.fatal=e.stack;console.error(e);}
finally{await writeFile(out+`tennis-${MODE}${process.env.TAG||''}.json`,JSON.stringify(R,null,1));await browser.close();await server.close();}
log('done',JSON.stringify({returns:R.returns.length,drops:R.drops.map(d=>[d.seconds,d.reached,d.winner]),errors:R.errors.length,fatal:Boolean(R.fatal)}));
