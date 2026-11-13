// 13/11/2026 fire v23 acceptance: the two bonus missions through the real island shell with real touch (Chromium, hasTouch + isMobile,
// 844x390, CDP Input.dispatchTouchEvent with one or two fingers). The menus are reached by touch (city "games" button, the fire card,
// the stage map), a full water-target stage is played (two of them: the first, and the one with wind, smoke and a moving fireball),
// and the whole building: door, three rooms with their rule and tool, rescues, the victory screen and the result card.
// Preparation only (not the behaviour under test): tutorial skipped, events off, a fire station placed, earlier campaign stages marked
// as won so the bonus missions are open (the shell refuses them otherwise). Nothing is written into a running game.
//   CHROMIUM_PATH=... ISLAND_PLAYWRIGHT=... node workout/island/tests/fire-v23-browser.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../tests/helpers/island-browser.mjs';
import {waitForGameStart,waitForGameNavigation} from './shell-ready.mjs';

const directory=fileURLToPath(new URL('../verification/fire-v23/',import.meta.url)),shots=directory+'shots/';await mkdir(shots,{recursive:true});
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const report={startedAt:new Date().toISOString(),viewport:'844x390 hasTouch isMobile',runs:{},checks:{}};let failures=0;
const check=(name,pass,detail={})=>{report.checks[name]={pass:Boolean(pass),...detail};if(!pass){failures++;console.log('FAIL',name,JSON.stringify(detail).slice(0,400));}else console.log('ok  ',name);};

async function open(query=''){
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});context.setDefaultTimeout(240000);
  const csp=await installIslandCspMonitor(context);
  await context.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});});
  const page=await context.newPage();await csp.attachPage(page);
  const errors=[],outside=[];page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);});
  const client=await context.newCDPSession(page),active=new Map();
  const touch=async(type,id,x,y)=>{ // CDP releases every point missing from touchEnd, so a release lists only the finger that lifts
    if(type==='touchEnd'||type==='touchCancel'){const point=active.get(id);active.delete(id);await client.send('Input.dispatchTouchEvent',{type,touchPoints:point?[point]:[]});return;}
    active.set(id,{x:Math.round(x),y:Math.round(y),id});await client.send('Input.dispatchTouchEvent',{type,touchPoints:[...active.values()]});};
  const tick=ms=>page.clock.runFor(ms);
  const tapAt=async(x,y,ms=80,id=9)=>{await touch('touchStart',id,x,y);await tick(ms);await touch('touchEnd',id);await tick(48);};
  const tapEl=async(selector,id=9)=>{const l=page.locator(selector).first();if(!await l.isVisible())throw Error('not shown: '+selector);await l.scrollIntoViewIfNeeded({timeout:5000});await tick(32);const b=await l.boundingBox();if(!b)throw Error('not on screen: '+selector);await tapAt(b.x+b.width/2,b.y+b.height/2,80,id);};
  const center=async selector=>{const b=await page.locator(selector).first().boundingBox();return b?{x:b.x+b.width/2,y:b.y+b.height/2}:null;};
  const snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot??null);
  const shot=async name=>{const file=shots+name+'.jpg';await page.screenshot({path:file,type:'jpeg',quality:74});return 'shots/'+name+'.jpg';};
  await page.clock.install();await page.goto(server.url+'?dev=1'+query,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await page.locator('[data-action=avatar-start]').tap();await tick(32);
  await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=5000;
    let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place('fireStation',x,z).ok)done=true;
    const p=e.state.minigameProgress.fireRescue;p.stage=Math.max(p.stage,6);p.stars.fill(1,0,5);e.save();});
  return {context,page,csp,errors,outside,touch,tick,tapAt,tapEl,center,snap,shot,active};
}
/** Paths of every key in the saved island (shape only), the fire campaign record and the money. */
const saveShape=page=>page.evaluate(()=>{const raw=localStorage.getItem('island.v1');const save=JSON.parse(raw);const paths=[];
  const walk=(v,p)=>{if(Array.isArray(v)){paths.push(p+'[]'+v.length);v.forEach((x,i)=>{if(x&&typeof x==='object')walk(x,p+'['+i+']');});}else if(v&&typeof v==='object')for(const k of Object.keys(v).sort())walk(v[k],p+'.'+k);else paths.push(p);};
  walk(save,'');return {paths,version:save.version,money:save.money,fireProgress:save.minigameProgress.fireRescue,fireCertificates:save.fireCertificates,highScore:save.highScores?.fireRescue??null,wins:save.minigameWins?.fireRescue??0};});
async function toFireStages(t){await t.tapEl('[data-action=quick-games]');await t.tick(200);await waitForGameNavigation(t.page);await t.tapEl('[data-action=game-enter][data-game-id=fireRescue]');await t.tick(200);await waitForGameNavigation(t.page);}
async function waitReady(t,phase){for(let i=0;i<150;i++){const s=await t.snap();if(s?.ready&&(!phase||s.phase===phase))return s;await t.tick(100);}throw Error('bonus session not ready');}

// ---- water targets: one finger aims (it follows the water: aim moves by where the jet lands), the other thumb holds the hose ---------
async function playTargets(t,level,name){
  await t.tapEl('[data-action=game-play]');await t.tick(200);await waitForGameNavigation(t.page);
  await t.tapEl(`[data-action=fire-bonus-play][data-fire-bonus=targets][data-level="${level}"]`);await waitForGameStart(t.page);
  let s=await waitReady(t),lastGood=s;const run={level,steps:0,frames:[],sprayPresses:0,emptyHits:0};report.runs[name]=run;
  run.shots=[await t.shot(name+'-start')];const spray=await t.center('#shoot');let aim=null,fingerDown=false,sprayDown=false,current=null,startTime=s.time;
  for(let step=0;step<1400&&!s.result;step++){
    const next=s.targets.find(x=>x.kind==='smoke'&&!x.done)||s.targets.find(x=>!x.done&&!x.covered&&!x.falling); // smoke first: it hides a window
    if(!next){if(sprayDown){await t.touch('touchEnd',2);sprayDown=false;}if(fingerDown){await t.touch('touchEnd',1);fingerDown=false;}await t.tick(100);s=await t.snap();if(!s)break;lastGood=s;continue;}
    const target=s.screen.targets.find(x=>x.id===next.id);
    if(current!==next.id){current=next.id;aim={x:target.x,y:target.y};}
    else if(s.spraying){aim.x+=(target.x-s.screen.impact.x)*.35;aim.y+=(target.y-s.screen.impact.y)*.35;}
    aim.x=Math.max(70,Math.min(700,aim.x));aim.y=Math.max(60,Math.min(380,aim.y));
    if(!fingerDown){await t.touch('touchStart',1,aim.x,aim.y);fingerDown=true;}else await t.touch('touchMove',1,aim.x,aim.y);
    if(s.empty&&sprayDown){await t.touch('touchEnd',2);sprayDown=false;run.emptyHits++;}
    else if(!sprayDown&&!s.empty&&s.pressure>.85){await t.touch('touchStart',2,spray.x,spray.y);sprayDown=true;run.sprayPresses++;}
    await t.tick(100);s=await t.snap();run.steps++;if(!s)break;lastGood=s;
    if(step===14)run.shots.push(await t.shot(name+'-spray'));
    if(step%10===0)run.frames.push({time:+s.time.toFixed(1),pressure:+s.pressure.toFixed(2),spraying:s.spraying,wind:Math.round(s.wind),remaining:s.remaining,score:s.score,hit:s.hitTarget});
    if(s.targets.some(x=>x.kind==='fireball'&&!x.done)&&!run.fireballShot&&s.hitTarget!==null&&s.targets[s.hitTarget]?.kind==='fireball'){run.fireballShot=await t.shot(name+'-fireball');run.shots.push(run.fireballShot);}
  }
  if(sprayDown)await t.touch('touchEnd',2);if(fingerDown)await t.touch('touchEnd',1);
  const last=lastGood;run.final=last?{time:+last.time.toFixed(1),score:last.score,remaining:last.remaining,result:last.result,sessionEnded:!s}:null;
  for(let i=0;i<40;i++){if(await t.page.locator('[data-fire-bonus-result=targets]').count())break;await t.tick(100);}
  run.resultCard=await t.page.locator('[data-fire-bonus-result=targets]').count()>0;run.shots.push(await t.shot(name+'-result'));
  run.resultRows=await t.page.evaluate(()=>[...document.querySelectorAll('[data-fire-bonus-result] .result-row')].map(r=>r.textContent.trim()));
  return run;
}
// ---- inside the building --------------------------------------------------------------------------------------------------------------
async function holdOn(t,point,seconds,id=1,until){await t.touch('touchStart',id,point.x,point.y);for(let i=0;i<seconds*10;i++){await t.tick(100);if(until&&await until())break;}await t.touch('touchEnd',id);await t.tick(64);}
async function putOut(t,spotId,tool,run,maxSeconds=14){
  if(tool)for(let tryTool=0;tryTool<4;tryTool++){await t.tapEl(`.fv-tool[data-tool=${tool}]`,7);await t.tick(80);if((await t.snap()).tool===tool)break;} // the tool must actually switch before spraying
  let s=await t.snap();let spot=s.screen.spots.find(x=>x.id===spotId);if(!spot||spot.done)return true;
  if(tool==='blanket'){await t.tapAt(spot.x,spot.y,80,1);await t.tick(200);s=await t.snap();return s.room.spots.find(x=>x.id===spotId).done;}
  await holdOn(t,spot,maxSeconds,1,async()=>{const n=await t.snap();return n.room?.spots.find(x=>x.id===spotId)?.done||n.phase!=='play';});
  s=await t.snap();return s.room?s.room.spots.find(x=>x.id===spotId)?.done:true;
}
async function playInterior(t,name){
  await t.tapEl('[data-action=fire-bonus-interior]');await waitForGameStart(t.page);
  let s=await waitReady(t);const run={rooms:[],shots:[]};report.runs[name]=run;run.shots.push(await t.shot(name+'-arrive'));
  s=await waitReady(t,'door');run.shots.push(await t.shot(name+'-door'));
  await t.tapAt(s.screen.door.x,s.screen.door.y,90,3);for(let i=0;i<10;i++)await t.tick(100);s=await t.snap();run.afterDoor=s.phase;
  const plan={living:[['rug','water'],['rescue'],['sofa','water'],['television','water-then-extinguisher']],kitchen:[['power_strip','water'],['rescue'],['kitchen_table','water'],['oil_pot','water-then-blanket']],bedroom:[['mattress','foam'],['rescue'],['wardrobe','foam'],['curtain_left','water']]};
  // the rescue: in the smoky bedroom the kid is low and hidden, so crawl (one thumb) only for the tap; the high fires are sprayed standing
  const rescue=async(room,id,crawling)=>{for(let attempt=0;attempt<3;attempt++){let s=await t.snap();if(s.phase!=='play'||!s.screen.rescue||s.room.rescue.state!=='waiting')return;
      if(crawling){const c=await t.center('.fv-crawl');await t.touch('touchStart',5,c.x,c.y);for(let i=0;i<7;i++)await t.tick(100);}
      s=await t.snap();room.rescueTries=(room.rescueTries||0)+1;room.coveredAtTap=s.room.covered;room.crawlAtTap=+s.room.crawl.toFixed(2);room.smokeAtTap=+s.room.smoke.toFixed(2);
      await t.tapAt(s.screen.rescue.x,s.screen.rescue.y,80,1);for(let i=0;i<4;i++)await t.tick(100);s=await t.snap();room.rescueAfter=s.room?.rescue.state;room.rescueFeedback=s.feedback?.key||null;
      if(crawling)await t.touch('touchEnd',5);
      if(room.rescueAfter==='leaving'||room.rescueAfter==='saved'){run.shots.push(await t.shot(`${name}-${id}-rescue`));return;}}};
  for(let r=0;r<3;r++){
    for(let i=0;i<40&&s.phase!=='intro';i++){await t.tick(100);s=await t.snap();}
    const id=s.room.id,room={id,mistakes:0};run.rooms.push(room);run.shots.push(await t.shot(`${name}-${id}-card`));
    await t.tapEl('.fv-card',3);await t.tick(200);s=await t.snap();room.phaseAfterCard=s.phase;
    const crawling=id==='bedroom';
    if(crawling){const c=await t.center('.fv-crawl');await t.touch('touchStart',5,c.x,c.y);for(let i=0;i<6;i++)await t.tick(100);s=await t.snap();room.crawlBefore=+s.room.crawl.toFixed(2);room.coveredWhileCrawling=s.room.covered;run.shots.push(await t.shot(`${name}-${id}-crawl`));await t.touch('touchEnd',5);for(let i=0;i<4;i++)await t.tick(100);}
    for(const [spot,how] of plan[id]){
      if(spot==='rescue'){await rescue(room,id,crawling);continue;}
      if(how==='water-then-extinguisher'||how==='water-then-blanket'){ // the rule: show what water does, then use the right tool
        await t.tapEl('.fv-tool[data-tool=water]',7);s=await t.snap();const p=s.screen.spots.find(x=>x.id===spot);await holdOn(t,p,1.2,1);s=await t.snap();
        room.rule={coach:await t.page.locator('.fv-coach-text').textContent(),feedback:s.feedback?.key||null,mistakes:s.room.mistakes};run.shots.push(await t.shot(`${name}-${id}-rule`));
        room[spot]=await putOut(t,spot,how.endsWith('extinguisher')?'extinguisher':'blanket',run);
        if(id==='kitchen')run.shots.push(await t.shot(`${name}-${id}-blanket`));
      }else room[spot]=await putOut(t,spot,how,run);
      s=await t.snap();if(s.phase!=='play')break;
    }
    s=await t.snap();room.spots=s.room?.spots.map(x=>({id:x.id,done:x.done}));
    await rescue(room,id,crawling); // in case the plan's rescue came too early
    for(let i=0;i<40;i++){s=await t.snap();if(s.phase==='clear'||s.phase==='intro'||s.phase==='victory')break;await t.tick(100);}
    s=await t.snap();room.mistakes=s.rooms[r].mistakes;room.rescue=s.rooms[r].rescue;room.cleared=s.rooms[r].cleared;
  }
  for(let i=0;i<40&&s.phase!=='victory';i++){await t.tick(100);s=await t.snap();}
  for(let i=0;i<12;i++)await t.tick(100);run.shots.push(await t.shot(name+'-victory'));s=await t.snap();run.victory=s?.phase==='victory';if(!run.victory)throw Error('no victory: '+JSON.stringify(run.rooms).slice(0,600));
  await t.tapEl('.fv-finish',3);for(let i=0;i<40;i++){if(await t.page.locator('[data-fire-bonus-result=interior]').count())break;await t.tick(100);}
  run.resultCard=await t.page.locator('[data-fire-bonus-result=interior]').count()>0;run.shots.push(await t.shot(name+'-result'));
  run.resultRows=await t.page.evaluate(()=>[...document.querySelectorAll('[data-fire-bonus-result] .result-row')].map(r=>r.textContent.trim()));
  return run;
}

try{
  // ---- 1. bonus missions on (default) --------------------------------------------------------------------------------------------
  const t=await open();const before=await saveShape(t.page);
  await toFireStages(t);report.homeShortcuts=await t.page.evaluate(()=>['fire-bonus-targets','fire-bonus-interior'].map(a=>Boolean(document.querySelector(`[data-action=${a}]`))));
  await t.tapEl('[data-action=game-play]');await t.tick(200);await waitForGameNavigation(t.page);
  const cards=await t.page.evaluate(()=>[...document.querySelectorAll('[data-action=fire-bonus-play]')].map(n=>({mode:n.dataset.fireBonus,level:Number(n.dataset.level),stage:Number(n.dataset.stage),disabled:n.disabled,label:n.textContent.trim()})));
  await t.page.locator('[data-fire-bonus-map]').scrollIntoViewIfNeeded();await t.tick(64);report.stageMapShot=await t.shot('stage-map');report.cards=cards;
  check('stageMapListsBonusMissionsAfterTheCampaign',cards.length===6&&cards.every(c=>c.stage>30)&&cards.filter(c=>!c.disabled).length===6,{cards});
  await t.tapEl('[data-action=game-home-back]');await t.tick(200);await waitForGameNavigation(t.page);
  const moneyStart=(await saveShape(t.page)).money;
  const t1=await playTargets(t,1,'targets-1');
  check('targetsStageOneComplete',t1.final?.remaining===0&&t1.resultCard,{final:t1.final,rows:t1.resultRows,steps:t1.steps});
  check('targetsPressureEmptiesAndRefills',t1.emptyHits>=1||t1.sprayPresses>=2,{emptyHits:t1.emptyHits,presses:t1.sprayPresses});
  await t.tapEl('[data-action=game-stages]');await t.tick(200);await waitForGameNavigation(t.page);await t.tapEl('[data-action=game-home-back]');await t.tick(200);await waitForGameNavigation(t.page);
  const t4=await playTargets(t,4,'targets-4');
  check('targetsWindSmokeMovingFireballComplete',t4.final?.remaining===0&&t4.resultCard&&t4.frames.some(f=>Math.abs(f.wind)>60),{final:t4.final,rows:t4.resultRows,windSeen:Math.max(...t4.frames.map(f=>Math.abs(f.wind)))});
  await t.tapEl('[data-action=game-exit]');await t.tick(200);await waitForGameNavigation(t.page);await toFireStages(t);
  const inside=await playInterior(t,'interior');
  check('interiorThroughTheDoor',inside.afterDoor==='enter'||inside.afterDoor==='intro',{afterDoor:inside.afterDoor});
  check('interiorThreeRoomsClearedWithRescues',inside.rooms.length===3&&inside.rooms.every(r=>r.cleared&&r.rescue==='saved'),{rooms:inside.rooms.map(r=>({id:r.id,cleared:r.cleared,rescue:r.rescue,mistakes:r.mistakes}))});
  check('interiorRulesShown',inside.rooms[0].rule?.feedback==='fire.v23.say.electric'&&inside.rooms[1].rule?.feedback==='fire.v23.say.oil'&&inside.rooms[2].crawlBefore>.8&&inside.rooms[2].coveredWhileCrawling===false,{living:inside.rooms[0].rule,kitchen:inside.rooms[1].rule,crawl:inside.rooms[2].crawlBefore,covered:inside.rooms[2].coveredWhileCrawling});
  check('interiorVictoryAndResult',inside.victory&&inside.resultCard,{rows:inside.resultRows});
  const after=await saveShape(t.page);
  const sameShape=JSON.stringify(after.paths)===JSON.stringify(before.paths),sameFire=JSON.stringify(after.fireProgress)===JSON.stringify(before.fireProgress)&&JSON.stringify(after.fireCertificates)===JSON.stringify(before.fireCertificates);
  check('saveShapeUnchangedOnlyCoins',sameShape&&sameFire&&after.version===before.version&&after.highScore===before.highScore&&after.wins===before.wins&&after.money>moneyStart,{version:after.version,paths:after.paths.length,moneyStart,moneyEnd:after.money,progress:after.fireProgress?.stage,highScore:[before.highScore,after.highScore],wins:[before.wins,after.wins]});
  await t.csp.assertClean().then(()=>check('cspClean',true,{}),e=>check('cspClean',false,{error:String(e).slice(0,300)}));
  check('noPageErrors',t.errors.length===0,{errors:t.errors.slice(0,10)});check('noRequestsOutsideIsland',t.outside.length===0,{outside:t.outside.slice(0,5)});
  await t.context.close();
  // ---- 2. kill switches: ?fireTargets=0&fireInterior=0 is the previous game ----------------------------------------------------------
  const k=await open('&fireTargets=0&fireInterior=0');await toFireStages(k);
  const shortcuts=await k.page.evaluate(()=>['fire-bonus-targets','fire-bonus-interior'].filter(a=>document.querySelector(`[data-action=${a}]`)));
  await k.tapEl('[data-action=game-play]');await k.tick(200);await waitForGameNavigation(k.page);
  const section=await k.page.locator('[data-fire-bonus-map]').count(),refused=await k.page.evaluate(()=>{const {engine:e}=window.__island;return e.startMinigame('fireRescue',{fireMode:'targets',fireBonusLevel:1,canvas:document.createElement('canvas')});});
  check('killSwitchesRestorePreviousGame',shortcuts.length===0&&section===0&&refused.ok===false,{shortcuts,section,refused});
  check('killSwitchNoErrors',k.errors.length===0,{errors:k.errors.slice(0,5)});
  await k.context.close();
}catch(error){failures++;report.error=String(error.stack||error).slice(0,1500);console.log(report.error);}
report.failures=failures;report.finishedAt=new Date().toISOString();
await writeFile(directory+'fire-v23-browser.json',JSON.stringify(report,null,1)+'\n');
await browser.close();await server.close?.();
console.log(failures?`${failures} failed`:'all passed');process.exit(failures?1:0);
