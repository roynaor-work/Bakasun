import {DATA_VERSION} from '../release.mjs';
import {waitForGameStart,waitForGameNavigation,prepareGameBuildings} from './shell-ready.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const target=process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/?dev=1',directory=fileURLToPath(new URL('../verification/g2f/',import.meta.url));await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[];let portraitGuard=false;
try{for(const width of (process.env.G2F_WIDTH?[Number(process.env.G2F_WIDTH)]:[390,360])){
 const context=await browser.newContext({viewport:{width,height:Number(process.env.G2F_HEIGHT)||(width===390?844:740)},hasTouch:true,deviceScaleFactor:1}),page=await context.newPage(),errors=[],requests=[],shots=[];
 context.setDefaultTimeout(240000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(r.url().includes('/island/'))requests.push(r.url());});
 const tap=s=>page.locator(s).tap(),tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot),cdp=await context.newCDPSession(page);
 const touch=(type,point)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{...point,id:1}]});
 async function point(x,y){return page.locator('.minigame-canvas').evaluate((n,{x,y})=>{const r=n.getBoundingClientRect(),m=window.__island.games.current.session.snapshot,c=window.__island.data.config.minigames,h=m.canvasHeight||c.height,scale=Math.min(r.width/c.width,r.height/h);return {x:r.x+(r.width-c.width*scale)/2+x*scale,y:r.y+(r.height-h*scale)/2+y*scale};},{x,y});}
 async function start(id,stage=1){await page.evaluate(({id,stage})=>window.__island.games.start(id,undefined,stage),{id,stage});if(await page.locator('[data-action=game-understood]').count()){await page.clock.runFor(32);await tap('[data-action=game-understood]');}await waitForGameStart(page);await tick(100);assert.ok(await snap());await page.evaluate(()=>{const a=window.__island.games.current.session.debug?.audio;if(!a)return;const dispose=a.dispose;a.dispose=()=>{const m=a.metrics?.()||a.snapshot?.();if(Array.isArray(m?.played))window.__g2fEvents.push(...m.played);for(const [name,count]of Object.entries(m?.counts||{}))if(count>0)window.__g2fEvents.push(name);dispose();};});if(id==='navalDuel'){await page.evaluate(()=>window.__island.games.current.session.debug.audio.unlock());await page.waitForFunction(()=>window.__island.games.current.session.debug.audio.metrics().loaded.length===8);}const size=page.viewportSize();if(size.width<size.height){assert.equal((await snap()).paused,true);portraitGuard=true;await page.setViewportSize({width:size.height,height:size.width});await tick(32);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.paused===false,undefined,{polling:50});}}
 async function exit(){await page.evaluate(()=>{const played=window.__island.games.current?.session.snapshot.audio?.played;if(Array.isArray(played))window.__g2fEvents.push(...played);});if(!await page.locator('[data-action=game-exit]').count())await page.locator('[data-action=game-pause]').tap();await tap('[data-action=game-exit]');assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);}
 async function shot(name){if(width===390){const file=name+'.png';await page.screenshot({path:directory+file});shots.push(file);}}
 async function hold(selector,ms){const box=await page.locator(selector).boundingBox();await touch('touchStart',{x:box.x+box.width/2,y:box.y+box.height/2});await tick(ms);await touch('touchEnd');}
 try{
  await page.clock.install();await page.goto(target,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);assert.equal(await page.evaluate(()=>window.__island.games.sound.unlocked),false);await tap('[data-action=avatar-start]');assert.equal(await page.evaluate(()=>window.__island.games.sound.unlocked),true);
  await page.evaluate(()=>{window.__island.engine.skipTutorial();window.__island.data.featureFlags.events=false;const sound=window.__island.games.sound,play=sound.play;window.__g2fEvents=[];sound.play=event=>{window.__g2fEvents.push(event);play(event);};});await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));await prepareGameBuildings(page);
  console.log('G2f',width,'aliens');
  await page.evaluate(()=>{const b=window.__island.data.config.minigames.alienDefense;window.__g2fOriginalAlien={...b.levels[0]};Object.assign(b.levels[0],{waves:2,boss:false,seconds:40});});
  await start('alienDefense');
  for(let i=0;i<60&&(await snap()).aliens.some(a=>a.entry>0);i++)await tick(100);
  assert.ok((await snap()).aliens.every(a=>a.entry===0));
  const fleet=await snap();await tap('[data-game-control=nova]');await tick(32);const launched=await snap();assert.equal(launched.novaCharges,fleet.novaCharges-1);assert.ok(launched.nova.flight>0);assert.equal(launched.nova.fromY,launched.player.y);
  for(let i=0;i<60&&(await snap()).nova.life===0;i++)await tick(50);
  const impacted=await snap(),health=new Map(fleet.aliens.map(a=>[a.id,a.hp])),fraction=(fleet.aliens.length-impacted.aliens.length)/fleet.aliens.length;
  assert.ok(impacted.nova.life>0);assert.ok(fraction>=.2&&fraction<=.4,String(fraction));assert.ok(impacted.aliens.some(a=>a.hp<health.get(a.id)));assert.ok(impacted.aliens.some(a=>a.hp===health.get(a.id)));assert.equal(impacted.wave,1);assert.equal(impacted.choosing,false);assert.equal(await page.locator('.game-upgrade-panel button:visible').count(),0);
  // A targeted missile leaves survivors. Clear only after its launch and local
  // damage are verified, then check the ordinary automatic wave transition.
  await page.evaluate(()=>window.__island.games.current.session.debug.model.aliens.splice(0));
  for(let i=0;i<60&&(await snap()).wave<2;i++)await tick(100);
  assert.equal((await snap()).wave,2);assert.equal((await snap()).choosing,false);assert.equal(await page.locator('.game-upgrade-panel button:visible').count(),0);await shot('automatic-next-wave');
  for(let i=0;i<60&&((await snap()).aliens.some(a=>a.entry>0)||await page.locator('[data-game-control=nova]').isDisabled());i++)await tick(100);
  assert.ok((await snap()).aliens.every(a=>a.entry===0));assert.equal(await page.locator('[data-game-control=nova]').isEnabled(),true);
  await tap('[data-game-control=nova]');await tick(32);assert.equal((await snap()).novaCharges,0);assert.ok((await snap()).nova.flight>0);for(let i=0;i<60&&(await snap()).nova.life===0;i++)await tick(50);assert.ok((await snap()).aliens.length>0);await page.evaluate(()=>window.__island.games.current.session.debug.model.aliens.splice(0));for(let i=0;i<60&&!await page.locator('[data-result=alienDefense]').count();i++)await tick(100);
  assert.equal(await page.locator('[data-result=alienDefense]').count(),1);assert.equal(await page.locator('[data-action=game-next-stage]').isEnabled(),true);await tap('[data-action=game-next-stage]');await waitForGameStart(page);await tick(100);assert.equal((await snap()).wave,1);await exit();
  await page.evaluate(()=>{Object.assign(window.__island.data.config.minigames.alienDefense.levels[0],window.__g2fOriginalAlien);window.__island.engine.state.hangar.credits=Math.max(1,window.__island.engine.state.hangar.credits);window.__island.games.stages('alienDefense');});await tap('[data-action=open-hangar]');await tap('[data-action=hangar-upgrade]');await tap('[data-action=hangar-rapid]');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('island.v1')).hangar.rapid),1);await tap('[data-action=close-modal]');await waitForGameNavigation(page);
  console.log('G2f',width,'naval');
  await page.evaluate(()=>{window.__g2fNow=window.__island.games.now;window.__island.games.now=()=>0;});
  await start('navalDuel');assert.equal(await page.locator('[data-game-input]').count(),0);let m=await snap(),initial=m;
  const navalButton=await page.locator('#shoot').boundingBox(),navalFire={x:navalButton.x+navalButton.width/2,y:navalButton.y+navalButton.height/2};
  // 25/10/2026 archery aiming: holding locks the enemy and shows a still preview; a cancelled touch never fires.
  await touch('touchStart',navalFire);await tick(1000);const locked=await snap();assert.ok(locked.aiming);assert.ok(locked.power>.99,'the power ring is full');assert.equal(locked.lockedTargetIndex,locked.enemyShip.index);assert.equal(locked.fired,0);await tick(250);assert.deepEqual((await snap()).prediction.landing,locked.prediction.landing);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await tick(32);assert.equal((await snap()).fired,0);
  const navalStick=await page.locator('.soccer-stick-zone').boundingBox(),navalSx=navalStick.x+navalStick.width*.4,navalSy=navalStick.y+navalStick.height*.6;
  await touch('touchStart',{x:navalSx,y:navalSy});await touch('touchMove',{x:navalSx,y:navalSy-38});await tick(2800);await touch('touchEnd');await tick(700);
  const insideRing=await snap();assert.equal(initial.rangeState.inside,false);assert.equal(insideRing.rangeState.inside,true);assert.ok(insideRing.rangeState.spread<initial.rangeState.spread);
  let calculated,aimed,landed;const navalShots=[];
  for(let attempt=0;attempt<8;attempt++){
   // Each attempt raises the barrel a little by dragging up; the release flies the previewed arc.
   const before=await snap();await touch('touchStart',navalFire);await tick(120);await touch('touchMove',{x:navalFire.x,y:navalFire.y-14});await tick(900);const held=await snap();assert.equal(held.fired,before.fired);assert.ok(held.aiming);
   calculated={...held.prediction.end};await touch('touchEnd');await tick(32);const launch=await snap();aimed=launch.ball;assert.equal(launch.fired,before.fired+1);assert.equal(launch.ammo[0],before.ammo[0]-1);assert.equal(aimed.predicted.end.x,calculated.x);assert.equal(aimed.predicted.end.z,calculated.z);
   await tick(Math.ceil(aimed.duration*1000)+20);landed=await snap();if(!landed.blast.hit){assert.equal(landed.blast.x,aimed.predicted.landing.x);assert.equal(landed.blast.z,aimed.predicted.landing.z);}navalShots.push({calculated,shot:aimed,blast:landed.blast});if(landed.blast.hit)break;await tick(400);
  }
  assert.ok(landed.blast.hit);assert.ok(landed.enemyFleetHp<initial.enemyFleetHp);assert.ok(landed.cooldowns.every(n=>n===0));
  const navalAudio=await page.evaluate(()=>window.__island.games.current.session.debug.audio.metrics());assert.ok(navalAudio.counts.cannon>0);assert.ok(navalAudio.counts.explosion>0);
  await writeFile(new URL(`../verification/g6e/g2f-${width}x${Number(process.env.G2F_HEIGHT)||(width===390?844:740)}-verification.json`,import.meta.url),JSON.stringify({entryWidth:width,portraitGuard,gameplayViewport:page.viewportSize(),insideRing:insideRing.rangeState,outsideRing:initial.rangeState,locked,navalShots,navalAudio,checks:{ring:true,releaseOnly:true,enemyLock:true,stillPreview:true,calculatedLanding:true,actualHit:true}})+'\n');
  const ratio=await page.locator('.game-stage').evaluate(n=>n.getBoundingClientRect().height/innerHeight);assert.ok(ratio>.6);await exit();
  await page.evaluate(()=>{const {engine}=window.__island,s=JSON.parse(engine.exportJSON());s.minigameProgress.navalDuel={stage:10,stars:[1,1,1,1,1,1,1,1,1,0]};if(!engine.importJSON(s).ok)throw Error('stage fixture');});await start('navalDuel',10);m=await snap();assert.equal(m.enemies.filter(e=>e.active).length,3);for(const point of m.enemyScreens.filter((_,i)=>m.enemies[i].active))assert.ok(point.x>0&&point.x<m.viewport.modelWidth&&point.y>0&&point.y<m.viewport.modelHeight);await shot('naval');await exit();
  // One finite locked shot loses, then Retry restores the six-weapon allocation.
  await page.evaluate(()=>{const b=window.__island.data.config.minigames.navalDuel;window.__g2fAmmo=b.levels[0].ammunition;b.levels[0].ammunition=[1,0,0,0,0,0];});await start('navalDuel');const missButton=await page.locator('#shoot').boundingBox(),missPoint={x:missButton.x+missButton.width/2,y:missButton.y+missButton.height/2};await touch('touchStart',missPoint);for(let i=0;i<30;i++){await tick(50);const s=await snap();if(Math.hypot(s.aim.x-s.enemyShip.x,s.aim.z-s.enemyShip.z)>65)break;}await touch('touchEnd');await tick(2000);assert.equal(await page.locator('[data-result=navalDuel]').count(),1);await tap('[data-action=game-again]');await waitForGameStart(page);await tick(100);assert.deepEqual((await snap()).ammo,[1,0,0,0,0,0]);await exit();await page.evaluate(()=>{window.__island.data.config.minigames.navalDuel.levels[0].ammunition=window.__g2fAmmo;window.__island.games.now=window.__g2fNow;});
  console.log('G2f',width,'fire');
  await start('fireRescue');assert.equal(await page.locator('[data-game-control=refill] svg').count(),1);await hold('[data-game-control=fire]',100);
  await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;for(let i=0;i<300;i++)m.update(.02,{firing:true,x:999,y:0});});m=await snap();assert.equal(m.pressure,0);assert.equal(m.warningId,'minigame.noPressure');
  await tick(32);assert.equal(await page.locator('.game-warning').isVisible(),false);
  // PR 145 pumps pressure automatically while idle; there is no charge button.
  await tick(1100);assert.ok((await snap()).pressure>.5);const water=(await snap()).water;
  await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=window.__island.data.config.minigames.fireRescue.hydrant.position;for(let i=0;i<500;i++){m.update(.02,{truckX:p[0],truckZ:p[2]});if(m.atHydrant)break;}});
  await hold('[data-game-control=refill]',1200);assert.ok((await snap()).water>water);await shot('fire');
  const blocked=await page.locator('[data-game-control=refill]').evaluate(n=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});return !n.dispatchEvent(event);});assert.equal(blocked,true);await tap('[data-action=game-pause]');await tap('[data-action=game-pause-sound]');assert.equal(await page.evaluate(()=>localStorage.getItem('island.sound')),'off');await exit();await start('navalDuel');await tap('[data-action=game-pause]');assert.equal(await page.locator('[data-action=game-pause-sound]').getAttribute('aria-pressed'),'true');await exit();
  const events=await page.evaluate(()=>[...new Set(window.__g2fEvents)]);for(const event of ['button','explosion','win','cannon','splash','lose','spray','crackle','refill'])assert.ok(events.includes(event),event);
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);assert.equal(await page.evaluate(()=>window.__island.games.sound.muted),true);assert.equal(await page.evaluate(()=>window.__island.engine.state.hangar.rapid),1);
  // main includes unversioned modules too; audit existing cache keys without changing runtime URLs.
  assert.ok(requests.some(url=>new URL(url).searchParams.has('v')));for(const url of requests){const u=new URL(url);if(/\.(json|mjs)$/.test(u.pathname)&&!u.pathname.includes('/vendor/')&&u.searchParams.has('v'))assert.equal(u.searchParams.get('v'),DATA_VERSION,url);}
  assert.deepEqual(errors,[]);assert.doesNotMatch(await page.locator('body').innerText(),/minigame\.[A-Za-z]/);reports.push({width,portraitGuard,gameplayViewport:page.viewportSize(),novaPartialAreaDamage:true,touchOnly:true,upgradeSavedAfterReload:true,immediateContinue:true,navalTargetMatchesImpact:true,finiteAmmoRetry:true,waterAndPressure:true,muteSaved:true,events,shots,errors});
 }finally{await context.close();}
}
await writeFile(directory+'verification.json',JSON.stringify({release:'task016-20261016-1',browser:'Chromium software rendering, simulated touch',reports,notTested:['Physical phone FPS','Physical Android/iOS audio output and device interruptions','Human difficulty/playability assessment'],omitted:['Optional background music: effects only, to keep the mobile audio graph small']},null,2)+'\n');
}finally{await browser.close();}
