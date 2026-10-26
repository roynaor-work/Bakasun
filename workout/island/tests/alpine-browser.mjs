import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

/** Alpine Rush in the real island page: entry, race, hit, jump, boost, pause, result,
 * ten entry/exit cycles, exit while loading, low quality, missing model and no WebGL.
 * Screenshots: verification/alpine/. Sizes: ALPINE_WIDTH/ALPINE_HEIGHT or the three defaults. */
const directory=fileURLToPath(new URL('../verification/alpine/',import.meta.url));await mkdir(directory,{recursive:true});
const viewports=process.env.ALPINE_WIDTH?[{width:Number(process.env.ALPINE_WIDTH),height:Number(process.env.ALPINE_HEIGHT)}]:[{width:390,height:844},{width:844,height:390},{width:1440,height:900}];
const executablePath=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
const server=await serveIsland(),chromium=await islandChromium(),reports=[];

async function open(width,height,{query='',init}={}){
  const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,deviceScaleFactor:1,timezoneId:'Asia/Jerusalem'});
  await context.route('**/data/featureFlags.json*',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),events:false}});});
  if(init)await context.addInitScript(init);
  const page=await context.newPage(),errors=[],outside=[];page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/missing-alpine-rider/.test(m.text())&&!/404/.test(m.text()))errors.push(m.text());});
  page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(server.url).origin)outside.push(u.href);});
  await page.goto(server.url+'?dev=1'+query,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
  await page.locator('[data-action=avatar-start]').tap();
  await page.evaluate(()=>{const {engine:e}=window.__island;e.skipTutorial();window.__realTick=e.tick;e.tick=()=>({ok:true});});
  return {browser,page,errors,outside,async close(){await browser.close();}};
}
const session=page=>page.evaluate(()=>window.__island.ui.activityInterface.current?.session?.snapshot);
const launch=page=>page.evaluate(()=>{const e=window.__island.engine;if(!e.state.instructionsSeen.includes('alpineRush'))e.state.instructionsSeen.push('alpineRush');window.__island.ui.activityInterface.launch('alpineRush',undefined,1);});
const ready=page=>page.waitForFunction(()=>document.querySelector('[data-action=alpine-start]')&&!document.querySelector('[data-action=alpine-start]').disabled&&document.querySelector('.game-screen')?.dataset.starting!=='true');
/** Drives the engine in simulation time (same commands the controller sends) until a condition. */
const drive=(page,goal,maxSeconds=40)=>page.evaluate(([goal,maxSeconds])=>{
  const s=window.__island.ui.activityInterface.current.session,e=s.debug.engine;
  for(let i=0;i<maxSeconds*60;i++){
    const d=e.debug()[0],ahead=e.course.objects.filter(o=>o.s>d.s+2&&o.s<d.s+60),want=goal==='ramp'?'ramp':goal==='rock'?'rock':null;
    const target=want?ahead.find(o=>o.type===want):null;let x=target?target.x:d.x;
    if(!target&&goal==='finish'){let best=d.x,bc=1e9;for(let cx=-8;cx<=8;cx+=.4){let c=Math.abs(cx-d.x)*.1;for(const o of ahead.filter(o=>o.s<d.s+35))if(o.type==='rock'&&Math.abs(cx-o.x)<o.radius+1.2||o.type==='gate'&&Math.abs(Math.abs(cx-o.x)-2.2)<1.2)c+=100;if(c<bc){bc=c;best=cx;}}x=best;}
    e.command({type:'steer',value:Math.max(-1,Math.min(1,(x-d.x)*.8))});if(goal==='finish'&&e.snapshot().boostReady)e.command({type:'boost'});
    e.step(1/60);const now=e.debug()[0];
    if(goal==='ramp'&&now.height>1.6)return true;if(goal==='rock'&&now.hitTime>.8)return true;if(goal==='finish'&&e.phase==='finished')return true;
  }return false;},[goal,maxSeconds]);

for(const {width,height} of viewports){
  const f=await open(width,height),{page}=f,shots=[],report={width,height};
  const shot=async name=>{const file=`${width}x${height}-${name}.jpg`;await page.screenshot({path:directory+file,type:'jpeg',quality:78});shots.push(file);};
  try{
    // Real library path once: library card → game home → stages → first stage.
    await page.evaluate(()=>window.__island.ui.activityInterface.menu());
    await page.locator('[data-action=game-enter][data-game-id=alpineRush]').click();
    await page.locator('[data-action=game-play]').click();
    await page.evaluate(()=>{window.__island.ui.activityInterface.requireDaily=()=>false;});
    await page.locator('[data-action=stage-play][data-stage="1"]').click();
    if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
    await ready(page);await page.waitForTimeout(400);await shot('opening');
    const opening=await session(page);assert.equal(opening.phase,'menu');assert.equal(opening.loaded,true);assert.equal(opening.renderMetrics.mode,'model');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll');
    // Keyboard reaches the start button.
    await page.locator('[data-action=alpine-start]').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.phase==='countdown');
    await page.waitForTimeout(300);await shot('countdown');
    await page.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.phase==='racing');
    // Drag right on the slope steers right; release leaves no steering behind.
    const box=await page.locator('.minigame-canvas').boundingBox(),x0=(await session(page)).frame.player.x;
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.55,{steps:6});
    await page.waitForTimeout(900);const dragged=(await session(page)).frame.player.x;await page.mouse.up();
    assert.ok(dragged>x0+1,`drag right moved ${x0} → ${dragged}`);await page.waitForTimeout(150);
    assert.equal((await session(page)).input.dragging,false);
    await page.waitForTimeout(1200);await shot('race');
    // Boost button: active state and speed above base speed.
    await page.locator('[data-action=alpine-boost]').click();await page.waitForTimeout(1500);
    const boosted=await session(page);assert.equal(boosted.frame.player.boosting,true);assert.ok(boosted.frame.speedKmh>80,`boost ${boosted.frame.speedKmh}`);
    await shot('boost');
    // Jump: ride the next ramp, freeze in the air for the picture.
    assert.ok(await drive(page,'ramp'),'reached a ramp');await page.evaluate(()=>window.__island.ui.activityInterface.current.session.setPaused(true));
    await page.waitForTimeout(250);const air=await session(page);assert.ok(air.frame.player.height>1);await shot('jump');
    await page.evaluate(()=>window.__island.ui.activityInterface.current.session.setPaused(false));
    // Hit: steer into the next rock.
    assert.ok(await drive(page,'rock'),'hit a rock');await page.evaluate(()=>window.__island.ui.activityInterface.current.session.setPaused(true));
    await page.waitForTimeout(250);const hit=await session(page);assert.equal(hit.frame.player.hit,true);
    assert.equal(await page.locator('.alpine-callout').isVisible(),true);await shot('hit');
    await page.evaluate(()=>window.__island.ui.activityInterface.current.session.setPaused(false));
    // Pause button: frozen clock and rivals, resume keeps going.
    await page.locator('.game-pause').click();const p1=await session(page);await page.waitForTimeout(1500);const p2=await session(page);
    assert.equal(p1.frame.timeMs,p2.frame.timeMs);assert.deepEqual(p1.frame.rivals,p2.frame.rivals);assert.equal(p2.phase,'paused');await shot('pause');
    await page.locator('[data-action=game-resume]').click();await page.waitForFunction(t=>window.__island.ui.activityInterface.current.session.snapshot.frame.timeMs>t,p2.frame.timeMs,{timeout:20000});
    // Finish: complete the race; the island result dialog shows the real numbers once.
    const money=await page.evaluate(()=>window.__island.engine.state.money);
    assert.ok(await drive(page,'finish',140),'finished');
    await page.waitForSelector('.modal.alpine-result');await page.waitForTimeout(300);await shot('result');
    const result=await page.evaluate(()=>({rows:[...document.querySelectorAll('[data-alpine-summary]')].map(r=>[r.dataset.alpineSummary,r.querySelector('bdi').textContent]),medal:document.querySelector('.alpine-medal')?.textContent,money:window.__island.engine.state.money,progress:window.__island.engine.state.minigameProgress.alpineRush,records:localStorage.getItem('island.alpine.v1'),canvases:document.querySelectorAll('canvas.minigame-canvas').length,apps:document.querySelectorAll('.alpine-app').length}));
    assert.ok(result.medal);assert.ok(result.rows.some(([k])=>k==='time'));assert.equal(result.canvases,0);assert.equal(result.apps,0);
    assert.ok(result.money>=money);assert.ok(JSON.parse(result.records).runs.length===1);
    assert.ok(await page.locator('[data-action=game-again]').isVisible());
    report.result=result;
    // Ten entry → exit cycles plus one exit while still loading: one canvas, no leftovers.
    for(let i=0;i<10;i++){await launch(page);await ready(page);await page.evaluate(()=>window.__island.ui.closeModal());
      const left=await page.evaluate(()=>({canvases:document.querySelectorAll('canvas.minigame-canvas').length,apps:document.querySelectorAll('.alpine-app').length,css:document.querySelectorAll('link[href*="alpine.css"]').length,active:window.__island.engine.isMinigameActive()}));
      assert.deepEqual(left,{canvases:0,apps:0,css:0,active:false},`cycle ${i}`);}
    await launch(page);await page.evaluate(()=>window.__island.ui.closeModal());await page.waitForTimeout(4000);
    assert.equal(await page.evaluate(()=>document.querySelectorAll('canvas').length<=2&&!document.querySelector('.alpine-app')),true,'exit during loading');
    assert.deepEqual(f.errors,[]);assert.deepEqual(f.outside,[]);
    report.shots=shots;reports.push(report);console.log(`alpine ${width}x${height}: ok (${shots.length} shots)`);
  } catch(error){await shot('failure').catch(()=>{});throw error;} finally {await f.close();}
}

// Degraded modes (one size): low quality, missing character model, and no WebGL.
{
  const low=await open(390,844,{query:'&quality=low&alpineModel=missing'});
  try{await launch(low.page);await ready(low.page);const s=await session(low.page);assert.equal(s.quality,'low');assert.equal(s.renderMetrics.mode,'primitive');
    await low.page.locator('[data-action=alpine-start]').click();await low.page.waitForFunction(()=>window.__island.ui.activityInterface.current.session.snapshot.phase==='racing');await low.page.waitForTimeout(800);
    await low.page.screenshot({path:directory+'390x844-low-primitive.jpg',type:'jpeg',quality:78});reports.push({mode:'low+primitive',metrics:(await session(low.page)).renderMetrics});console.log('alpine low quality + missing model: ok');}
  finally{await low.close();}
  const none=await open(390,844,{init:()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){if(/webgl/.test(type)&&this.classList.contains('minigame-canvas'))return null;return original.call(this,type,...rest);};}});
  try{await launch(none.page);await none.page.waitForSelector('.alpine-loading[data-error=true] [data-action=alpine-back]');
    await none.page.screenshot({path:directory+'390x844-no-webgl.jpg',type:'jpeg',quality:78});await none.page.locator('[data-action=alpine-back]').click();
    assert.equal(await none.page.evaluate(()=>window.__island.engine.isMinigameActive()),false);reports.push({mode:'no-webgl',ok:true});console.log('alpine without WebGL: ok');}
  finally{await none.close();}
}
await server.close();
await writeFile(directory+'report.json',JSON.stringify(reports,null,1)+'\n');
console.log('alpine browser: all checks passed');
