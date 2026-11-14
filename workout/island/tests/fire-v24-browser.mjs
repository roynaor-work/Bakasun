// 14/11/2026 fire v24 acceptance: an entry stage (stage 3) end to end through the real island shell with real touch (Chromium, hasTouch +
// isMobile, 844x390, CDP Input.dispatchTouchEvent, SwiftShader WebGL). Drive to the burning building (a tap on its fire marker, the engine
// drives along the roads), the door marker and the enter button, inside: the lesson, the room card, the clock, spraying the fires with a
// finger on the room, the friend carried out, back on the street, the rest of the fires, the finish, the result card with stars. Then a
// second run that does nothing inside: the ten-second warning and the gentle handover at zero. Then `?fireFlow=v23`: no entry at all.
// Preparation only (not the behaviour under test): tutorial skipped, events off, a fire station placed, stage 3 open. No state is injected
// into a running game; the game is read through the session snapshot and the dev debug handle.
//   CHROMIUM_PATH=... ISLAND_PLAYWRIGHT=... node workout/island/tests/fire-v24-browser.mjs
import {mkdir,writeFile,stat,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';
import {waitForGameStart,waitForGameNavigation} from './shell-ready.mjs';

const directory=fileURLToPath(new URL('../verification/fire-v24/',import.meta.url)),shots=directory+'shots/';await mkdir(shots,{recursive:true});
const island=fileURLToPath(new URL('../',import.meta.url));
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const report={startedAt:new Date().toISOString(),viewport:'844x390 hasTouch isMobile, SwiftShader',runs:{},checks:{}};let failures=0;
const check=(name,pass,detail={})=>{report.checks[name]={pass:Boolean(pass),...detail};if(!pass){failures++;console.log('FAIL',name,JSON.stringify(detail).slice(0,500));}else console.log('ok  ',name);};

async function open(query=''){
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
  const csp=await installIslandCspMonitor(context);
  await context.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
  const page=await context.newPage();await csp.attachPage(page);
  const errors=[],outside=[];page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);});
  const client=await context.newCDPSession(page),active=new Map();
  const touch=async(type,id,x,y)=>{if(type==='touchEnd'||type==='touchCancel'){const point=active.get(id);active.delete(id);await client.send('Input.dispatchTouchEvent',{type,touchPoints:point?[point]:[]});return;}
    active.set(id,{x:Math.round(x),y:Math.round(y),id});await client.send('Input.dispatchTouchEvent',{type,touchPoints:[...active.values()]});};
  const tick=ms=>page.clock.runFor(ms);
  const tapAt=async(x,y,ms=80,id=9)=>{await touch('touchStart',id,x,y);await tick(ms);await touch('touchEnd',id);await tick(48);};
  const tapEl=async(selector,id=9)=>{const l=page.locator(selector).first();if(!await l.isVisible())throw Error('not shown: '+selector);await l.scrollIntoViewIfNeeded({timeout:5000});await tick(32);const b=await l.boundingBox();if(!b)throw Error('not on screen: '+selector);await tapAt(b.x+b.width/2,b.y+b.height/2,80,id);};
  const center=async selector=>{const b=await page.locator(selector).first().boundingBox();return b?{x:b.x+b.width/2,y:b.y+b.height/2}:null;};
  const snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot??null);
  const shot=async name=>{const file=shots+name+'.jpg';await page.screenshot({path:file,type:'jpeg',quality:76});return 'shots/'+name+'.jpg';};
  await page.clock.install();await page.goto(server.url+'?dev=1'+query,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await page.locator('[data-action=avatar-start]').tap();await tick(32);
  await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=5000;
    let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place('fireStation',x,z).ok)done=true;
    const p=e.state.minigameProgress.fireRescue;p.stage=Math.max(p.stage,6);p.stars.fill(1,0,5);e.save();data.config.minigames.fireRescue.render.fallbackFrameMs=10000;});
  return {context,page,csp,errors,outside,touch,tick,tapAt,tapEl,center,snap,shot};
}
const saveShape=page=>page.evaluate(()=>{const save=JSON.parse(localStorage.getItem('island.v1'));const paths=[];
  const walk=(v,p)=>{if(Array.isArray(v)){paths.push(p+'[]'+v.length);v.forEach((x,i)=>{if(x&&typeof x==='object')walk(x,p+'['+i+']');});}else if(v&&typeof v==='object')for(const k of Object.keys(v).sort())walk(v[k],p+'.'+k);else paths.push(p);};
  walk(save,'');return {paths,version:save.version,money:save.money,fireProgress:JSON.parse(JSON.stringify(save.minigameProgress.fireRescue)),certificates:save.fireCertificates.filter(Boolean).length};});
async function startStage(t,stage){
  await t.page.evaluate(s=>window.__island.games.start('fireRescue',undefined,s),stage);
  if(await t.page.locator('[data-action=game-understood]').count()){await t.tick(32);await t.page.locator('[data-action=game-understood]').tap();}
  await waitForGameStart(t.page);await waitForGameNavigation(t.page);
  for(let i=0;i<300;i++){const s=await t.snap();if(s?.renderMetrics?.truck?.loaded&&s.renderMode==='three')break;await t.tick(50);}
  return t.snap();
}
const inView=p=>p&&p.x>=0&&p.x<=844&&p.y>=0&&p.y<=390;
/** The flame that burns on the entry building (nearest site to the lot), read from the dev handle. */
const entryFlame=t=>t.page.evaluate(()=>{const d=window.__island.games.current.session.debug,b=d.flow.building,sites=d.model.balance.render.sites;let best=-1,dist=Infinity;sites.forEach((s,i)=>{if(!d.model.flames[i]?.active)return;const dd=Math.hypot(s[0]-b.x,s[2]-b.z);if(dd<dist){dist=dd;best=i;}});return best;});
/** Drive to the building: a tap on its fire marker (the engine drives the roads); if parked short of the door, nudge with the stick. */
async function driveToBuilding(t,run){
  let s=await t.snap();const flame=await entryFlame(t);run.entryFlame=flame;
  const target=inView(s.flameScreens[flame])?s.flameScreens[flame]:s.indicators.find(a=>a.kind==='fire'&&a.index===flame);
  if(!target)throw Error('no marker for the building fire');
  await t.tapAt(target.x,target.y);await t.tick(100);s=await t.snap();run.navigationAfterTap={active:s.navigation.active,kind:s.navigation.kind};
  let arrived=false;const trace=[];
  for(let i=0;i<450;i++){await t.tick(100);s=await t.snap();if(i%10===0)trace.push({time:+s.time.toFixed(1),door:s.v24.doorDistance,state:s.v24.state,marker:s.v24.markerKind});if(s.v24.state==='ready'){arrived=true;break;}
    if(!s.navigation.active&&!s.truck.driving&&i>20){ // parked short: steer toward the door with the stick
      const stick=await t.center('#joystick'),door=s.v24.doorScreen,truck=s.truckScreen;if(!stick||!door||!truck)continue;const dx=door.x-truck.x,dy=door.y-truck.y,l=Math.hypot(dx,dy)||1;
      await t.touch('touchStart',4,stick.x,stick.y);await t.touch('touchMove',4,stick.x+dx/l*60,stick.y+dy/l*60);for(let j=0;j<6;j++){await t.tick(100);}await t.touch('touchEnd',4);await t.tick(400);}
  }
  run.driveTrace=trace;run.arrived=arrived;run.arriveTime=+s.time.toFixed(1);return s;
}
async function waitInside(t,predicate,ticks=400){let s;for(let i=0;i<ticks;i++){await t.tick(100);s=await t.snap();if(predicate(s))return s;}return s;}
async function playRoom(t,run,name){
  let s=await t.snap();const inside=()=>s?.v24?.interior;
  // the lesson card (first entry stage), then the room card
  s=await waitInside(t,x=>x?.v24?.interior?.tutorialOpen||x?.v24?.interior?.phase==='intro',200);
  if(inside()?.tutorialOpen){run.lessonShown=true;for(let i=0;i<8;i++)await t.tick(100);run.shots.push(await t.shot(name+'-lesson'));await t.tapEl('.fv24-card',3);await t.tick(150);}
  s=await waitInside(t,x=>x?.v24?.interior?.phase==='intro',60);run.roomCard=await t.page.locator('.fv24-card').evaluate(n=>n.hidden?null:n.textContent.trim()).catch(()=>null);run.shots.push(await t.shot(name+'-room-card'));
  await t.tapEl('.fv24-card',3);s=await waitInside(t,x=>x?.v24?.interior?.phase==='play',40);run.playStarted=inside()?.phase==='play';run.clockAtStart=inside()?.room?.remaining;
  const metrics=[];
  for(let guard=0;guard<40;guard++){
    s=await t.snap();const it=inside();if(!it||it.phase!=='play')break;
    const spot=it.screen.spots.find(x=>!x.done);const friend={...it.screen.friend,state:it.room.friend.state};
    if(spot){ // hold the finger on the fire until it is out (the water lands where the finger is)
      await t.touch('touchStart',1,spot.x,spot.y);let out=false;
      for(let i=0;i<140;i++){await t.tick(100);s=await t.snap();const now=inside();if(!now||now.phase!=='play'){break;}const sp=now.room.spots.find(x=>x.id===spot.id);if(i===6){metrics.push(now.renderMetrics);run.shots.push(await t.shot(name+'-spray-'+spot.id));run.sprayingSeen=run.sprayingSeen||now.spraying;run.hitSeen=run.hitSeen||now.hitSpot===spot.id;}
        if(sp.done){out=true;break;}if(now.empty){await t.touch('touchEnd',1);for(let k=0;k<25;k++)await t.tick(100);await t.touch('touchStart',1,spot.x,spot.y);}}
      await t.touch('touchEnd',1);await t.tick(200);run.spots=run.spots||{};run.spots[spot.id]=out;continue;}
    if(friend.state==='waiting'){run.shots.push(await t.shot(name+'-friend'));await t.tapAt(friend.x,friend.y,80,1);for(let i=0;i<5;i++)await t.tick(100);s=await t.snap();run.friendAfterTap=inside()?.room?.friend?.state;run.shots.push(await t.shot(name+'-rescue'));continue;}
    await t.tick(300);
  }
  run.renderMetrics=metrics;
  s=await waitInside(t,x=>x?.v24?.done,200);run.done=s?.v24?.done;run.insideResult=s?.v24?.result;run.shots.push(await t.shot(name+'-back-on-street'));
  return s;
}
/** The rest of the street stage: fires one by one (tap the marker, drive, hold the hose in bursts), the hydrant when water is low, finish. */
async function finishStreet(t,run,name){
  let s=await t.snap();const spray=await t.center('#shoot');const trace=[];let shotDone=false;
  for(let guard=0;guard<900;guard++){
    s=await t.snap();if(!s)break;if(guard%20===0)trace.push({time:+s.time.toFixed(1),remaining:Math.ceil(s.remaining),water:Math.round(s.water),active:s.flames.filter(f=>f.active&&f.heat>0).length,canFinish:s.canFinish});
    if(s.canFinish){await t.tapEl('#fire-finish');for(let i=0;i<30;i++){await t.tick(100);if(await t.page.locator('[data-result=fireRescue]').count())break;}break;}
    if(s.water/s.maxWater<.2&&!s.atHydrant){const h=s.indicators.find(a=>a.kind==='hydrant');if(h){await t.tapAt(h.x,h.y);for(let i=0;i<120;i++){await t.tick(100);const n=await t.snap();if(n.atHydrant&&!n.truck.driving){for(let k=0;k<40;k++){await t.tick(100);const w=await t.snap();if(w.water/w.maxWater>.9)break;}break;}}continue;}}
    const fires=s.flames.map((f,i)=>({...f,i})).filter(f=>f.active&&f.heat>0);if(!fires.length){await t.tick(200);continue;}
    const near=fires.filter(f=>Math.hypot(f.x-s.nozzle.x,f.y-s.nozzle.y)<=s.range*.85);
    if(near.length&&!s.truck.driving){await t.touch('touchStart',2,spray.x,spray.y);for(let i=0;i<12;i++)await t.tick(100);await t.touch('touchEnd',2);if(!shotDone){shotDone=true;run.shots.push(await t.shot(name+'-street-spray'));}await t.tick(500);continue;}
    const f=fires.sort((a,b)=>Math.hypot(a.x-s.nozzle.x,a.y-s.nozzle.y)-Math.hypot(b.x-s.nozzle.x,b.y-s.nozzle.y))[0];
    const marker=inView(s.flameScreens[f.i])?s.flameScreens[f.i]:s.indicators.find(a=>a.kind==='fire'&&a.index===f.i);
    if(marker){await t.tapAt(marker.x,marker.y);for(let i=0;i<200;i++){await t.tick(100);const n=await t.snap();if(!n||!n.navigation.active||n.flames[f.i].heat<=0)break;}}else await t.tick(300);
  }
  run.streetTrace=trace;
  run.resultCard=await t.page.locator('[data-result=fireRescue]').count()>0;if(run.resultCard)run.shots.push(await t.shot(name+'-result'));
  run.resultRows=await t.page.evaluate(()=>[...document.querySelectorAll('[data-result=fireRescue] .result-row')].map(r=>r.textContent.trim()));
  run.resultStars=await t.page.evaluate(()=>{const n=document.querySelector('[data-result=fireRescue] [data-stars]');return n?Number(n.dataset.stars):null;});
}

try{
  // ---- 1. stage 3 end to end ------------------------------------------------------------------------------------------------------------
  const t=await open();const before=await saveShape(t.page);const run={shots:[]};report.runs.stage3=run;
  let s=await startStage(t,3);run.renderMode=s.renderMode;run.v24AtStart=s.v24;run.shots.push(await t.shot('stage3-street-start'));
  check('entryStageStartsOnTheStreetWithADoorMarker',s.v24&&s.v24.state==='drive'&&!s.v24.inside&&s.v24.markerKind&&!s.v24.enterButton&&s.v24.doorDistance>12,{v24:s.v24,mode:s.renderMode});
  s=await driveToBuilding(t,run);run.shots.push(await t.shot('stage3-street-arrived'));
  const enterShown=await t.page.locator('#fire-enter').isVisible();
  check('drivingToTheBuildingOpensTheDoorAndTheEnterButton',run.arrived&&s.v24.state==='ready'&&enterShown&&s.v24.doorDistance<=6.5,{arrived:run.arrived,doorDistance:s.v24.doorDistance,enterShown,arriveTime:run.arriveTime,trace:run.driveTrace.slice(-4)});
  const streetTimeAtEnter=s.remaining;
  await t.tapEl('#fire-enter');s=await waitInside(t,x=>x?.v24?.inside&&x.v24.interior?.ready,400);
  run.insideReady=Boolean(s?.v24?.interior?.ready);run.insideMetricsAtStart=s?.v24?.interior?.renderMetrics;
  check('enterLoadsTheRoomIn3DOverTheFrozenStreet',run.insideReady&&s.v24.interior.renderMetrics.triangles>2000&&s.v24.interior.renderMetrics.crew&&s.v24.interior.renderMetrics.friend&&!s.v24.interior.renderMetrics.roomBuilt,{metrics:s?.v24?.interior?.renderMetrics});
  s=await playRoom(t,run,'stage3-inside');
  check('lessonThenRoomCardThenPlay',run.lessonShown&&run.roomCard&&run.playStarted&&run.clockAtStart>=49,{lesson:run.lessonShown,card:run.roomCard,clock:run.clockAtStart});
  check('fingerOnTheFirePutsItOutWithWaterAndSteam',run.spots&&Object.values(run.spots).length===2&&Object.values(run.spots).every(Boolean)&&run.sprayingSeen&&run.hitSeen,{spots:run.spots,spraying:run.sprayingSeen,hit:run.hitSeen});
  check('tapOnTheFriendCarriesThemOut',['rescued','walking','out'].includes(run.friendAfterTap),{friend:run.friendAfterTap});
  check('roomDoneReturnsToTheStreetWithAnInsideResult',run.done&&run.insideResult&&run.insideResult.rescued===1&&run.insideResult.rooms===1&&run.insideResult.handovers===0&&run.insideResult.performance>=.8,{result:run.insideResult});
  const afterInside=await t.snap();
  check('streetClockFrozenWhileInside',Math.abs(afterInside.remaining-streetTimeAtEnter)<1.5&&afterInside.v24.state==='done',{atEnter:streetTimeAtEnter,after:afterInside.remaining,insideSeconds:run.insideResult?.seconds});
  const m=run.renderMetrics[0]||{};
  check('insideRenderBudget',m.triangles>0&&m.triangles<=40000&&m.drawCalls<=90,{triangles:m.triangles,drawCalls:m.drawCalls,sceneObjects:m.sceneObjects,fps:m.fps});
  await finishStreet(t,run,'stage3');
  const after=await saveShape(t.page);run.saveAfter={progress:after.fireProgress,money:after.money,certificates:after.certificates};
  check('stageEndsWithTheResultCardAndStars',run.resultCard&&after.fireProgress.stars[2]>=1&&after.money>before.money,{rows:run.resultRows,stars:after.fireProgress.stars[2],uiStars:run.resultStars,trace:run.streetTrace.slice(-3)});
  // a won campaign stage changes exactly what it always changed (stars, certificate, high score, wins, money); nothing new is written
  const allowed=['.fireCertificates','.minigameProgress.fireRescue','.highScores','.minigameWins','.money','.learning','.parts','.playTime','.lastPlayed','.statistics','.stats'];
  const changed=[...new Set([...after.paths.filter(p=>!before.paths.includes(p)),...before.paths.filter(p=>!after.paths.includes(p))])],foreign=changed.filter(p=>!allowed.some(a=>p.startsWith(a)));
  check('saveShapeUnchangedBeyondTheUsualStageWin',foreign.length===0&&after.version===before.version,{changed:changed.slice(0,12),foreign:foreign.slice(0,12),version:after.version});
  // stage map badges (default flow)
  await t.tapEl('[data-action=game-stages]').catch(()=>{});await t.tick(200);await waitForGameNavigation(t.page);
  const badges=await t.page.evaluate(()=>[...document.querySelectorAll('.stage-map [data-fire-entry]')].map(n=>Number(n.dataset.stage)));run.badges=badges;
  check('stageMapMarksTheEntryStages',badges.length===10&&badges[0]===3&&badges[9]===30,{badges});
  run.shots.push(await t.shot('stage3-stage-map'));
  await t.csp.assertClean().then(()=>check('cspClean',true,{}),e=>check('cspClean',false,{error:String(e).slice(0,300)}));
  check('noPageErrors',t.errors.length===0,{errors:t.errors.slice(0,10)});check('noRequestsOutsideIsland',t.outside.length===0,{outside:t.outside.slice(0,5)});
  await t.context.close();
  // ---- 2. idle inside: the ten-second warning and the gentle handover --------------------------------------------------------------------
  const u=await open();const idle={shots:[]};report.runs.idle=idle;
  s=await startStage(u,3);s=await driveToBuilding(u,idle);
  if(!idle.arrived)throw Error('idle run: did not arrive');
  await u.tapEl('#fire-enter');s=await waitInside(u,x=>x?.v24?.interior?.tutorialOpen,400);await u.tapEl('.fv24-card',3);s=await waitInside(u,x=>x?.v24?.interior?.phase==='intro',60);await u.tapEl('.fv24-card',3);
  let warned=false,critical=false,handover=false,bands=new Set();
  for(let i=0;i<700;i++){await u.tick(100);s=await u.snap();const it=s?.v24?.interior;if(!it)break;if(it.room)bands.add(it.room.band);if(it.feedback?.key==='fire.v24.say.tenSeconds')warned=true;if(it.room?.band==='critical'&&!critical){critical=true;idle.shots.push(await u.shot('idle-ten-seconds'));}if(it.phase==='handover'&&!handover){handover=true;idle.shots.push(await u.shot('idle-handover'));}if(s.v24.done)break;}
  idle.result=s?.v24?.result;idle.bands=[...bands];
  check('idleInsideWarnsAtTenSecondsAndHandsOverGently',warned&&critical&&handover&&s?.v24?.done&&idle.result?.handovers===1&&idle.result.outcome==='win',{warned,critical,handover,bands:idle.bands,result:idle.result});
  check('idleNoPageErrors',u.errors.length===0,{errors:u.errors.slice(0,6)});
  await u.context.close();
  // ---- 3. ?fireFlow=v23: the stage is the plain v23 stage ------------------------------------------------------------------------------
  const k=await open('&fireFlow=v23');s=await startStage(k,3);
  const noEntry=!('v24' in s)&&await k.page.locator('#fire-enter').count()===0;
  check('fireFlowV23RestoresThePreviousStage',noEntry,{keys:Object.keys(s).filter(x=>x==='v24'),enter:await k.page.locator('#fire-enter').count()});
  check('v23NoPageErrors',k.errors.length===0,{errors:k.errors.slice(0,6)});
  await k.context.close();
  // ---- download size of the inside (stage 3 plan and the whole set) ---------------------------------------------------------------------
  const {v24AssetFiles}=await import('../minigames/fire-v24-scene.mjs'),{entryPlan,ENTRY_PLANS}=await import('../minigames/fire-v24.mjs');
  const bytes=async list=>{let n=0;for(const f of list)n+=(await stat(island+f)).size;return n;};
  const code=['minigames/fire-v24.mjs','minigames/fire-v24-interior.mjs','minigames/fire-v24-anchors.mjs','minigames/fire-v24-scene.mjs','minigames/fire-v24-session.mjs','minigames/fire-v24-flow.mjs','minigames/fire-v24.css'];
  report.download={stage3AssetsKB:Math.round(await bytes(v24AssetFiles(entryPlan(3)))/1024),allAssetsKB:Math.round(await bytes([...new Set(ENTRY_PLANS.flatMap(p=>v24AssetFiles(p)))])/1024),codeKB:Math.round(await bytes(code)/1024),note:'firefighter GLB and fx sheets are already part of the fire pack; rooms and friends are new'};
}catch(error){failures++;report.error=String(error.stack||error).slice(0,2000);console.log(report.error);}
report.failures=failures;report.finishedAt=new Date().toISOString();
await writeFile(directory+'fire-v24-browser.json',JSON.stringify(report,null,1)+'\n');
await browser.close();await server.close?.();
console.log(failures?`${failures} failed`:'all passed');process.exit(failures?1:0);
