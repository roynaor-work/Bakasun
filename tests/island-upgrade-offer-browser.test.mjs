import test from 'node:test';
import assert from 'node:assert/strict';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

/** Real browser check of the end-of-stage upgrade offer under the shipped CSP. Opt in with ISLAND_CSP_BROWSER=1 (or ISLAND_UPGRADE_BROWSER=1).
 * ISLAND_UPGRADE_SHOTS=<dir> also writes screenshots. */
const enabled=process.env.ISLAND_CSP_BROWSER==='1'||process.env.ISLAND_UPGRADE_BROWSER==='1';
const args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const shots=process.env.ISLAND_UPGRADE_SHOTS;

async function boot(browser,server,query,viewport={width:390,height:844}){
  const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
  const csp=await installIslandCspMonitor(context),page=await context.newPage();page.setDefaultTimeout(120000);await csp.attachPage(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.url+`?dev=1${query}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
  if(await page.locator('[data-action=avatar-start]').count())await page.locator('[data-action=avatar-start]').click();
  await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=400;e.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;});
  await page.waitForTimeout(2500);
  return {context,page,csp,errors};
}
const showTennisWin=async page=>{await page.evaluate(()=>{const ui=window.__island.ui.activityInterface;ui.showResult('tennis',undefined,{outcome:'win',score:120,money:30,parts:0,stars:2,stage:1});});await page.waitForSelector('[data-result=tennis]');};

test('tennis: a won stage with enough coins shows one offer; the upgrade buys through the normal path',{skip:!enabled,timeout:300000},async()=>{
  const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args});
  const t=await boot(browser,server,'');
  try{
    await showTennisWin(t.page);
    await t.page.waitForSelector('.uo-card');
    assert.equal(await t.page.locator('.uo-card').count(),1,'one offer per stage');
    const card=await t.page.evaluate(()=>{const c=document.querySelector('.uo-card'),b=[...c.querySelectorAll('button')].map(x=>{const r=x.getBoundingClientRect();return {text:x.textContent,w:r.width,h:r.height};});return {state:c.dataset.state,dir:c.dir,title:c.querySelector('.uo-title').textContent,name:c.querySelector('.uo-name').textContent,buttons:b,text:c.textContent};});
    assert.equal(card.state,'ready');assert.equal(card.dir,'rtl');assert.deepEqual(card.buttons.map(b=>b.text),['שדרג','אחר כך']);
    for(const b of card.buttons)assert.ok(b.w>=48&&b.h>=48,`touch target ${b.text} ${b.w}x${b.h}`);
    assert.ok(!card.text.includes('!'),'no exclamation marks');
    if(shots){await t.page.waitForTimeout(800);await t.page.screenshot({path:`${shots}/tennis-offer-390x844.png`});}
    const before=await t.page.evaluate(()=>({money:window.__island.engine.state.money,eq:structuredClone(window.__island.engine.state.minigameEquipment.tennis),lvl:window.__island.engine.state.minigameLevels.tennis}));
    await t.page.locator('.uo-primary').click();
    await t.page.waitForFunction(()=>document.querySelector('.uo-card')?.dataset.state==='purchased');
    const after=await t.page.evaluate(()=>({money:window.__island.engine.state.money,eq:structuredClone(window.__island.engine.state.minigameEquipment.tennis),lvl:window.__island.engine.state.minigameLevels.tennis}));
    assert.ok(after.money<before.money,'coins were spent');
    assert.ok(JSON.stringify(after.eq)!==JSON.stringify(before.eq)||after.lvl>before.lvl,'an upgrade was applied');
    if(shots){await t.page.waitForTimeout(800);await t.page.screenshot({path:`${shots}/tennis-bought-390x844.png`});}
    await t.page.locator('.uo-later').click();assert.equal(await t.page.locator('.uo-card').count(),0);
    assert.deepEqual(t.errors,[]);await t.csp.assertClean();
  }finally{await t.context.close();await t.csp.dispose();await browser.close();await server.close();}
});

test('tennis: "later" removes the card, and the same stage opened again does not offer the same upgrade',{skip:!enabled,timeout:300000},async()=>{
  const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args});
  const t=await boot(browser,server,'',{width:844,height:390});
  try{
    await showTennisWin(t.page);await t.page.waitForSelector('.uo-card');
    const first=await t.page.evaluate(()=>document.querySelector('.uo-card').parentElement.dataset.upgradeOffer);
    if(shots){await t.page.waitForTimeout(800);await t.page.screenshot({path:`${shots}/tennis-offer-844x390.png`});}
    await t.page.locator('.uo-later').click();assert.equal(await t.page.locator('.uo-card').count(),0);
    const money=await t.page.evaluate(()=>window.__island.engine.state.money);
    await showTennisWin(t.page);await t.page.waitForTimeout(800);
    const again=await t.page.evaluate(()=>document.querySelector('.uo-card')?.parentElement.dataset.upgradeOffer||null);
    assert.notEqual(again,first,'not the same upgrade at the same stage');
    assert.ok(await t.page.evaluate(()=>window.__island.engine.state.money)>=money,'"later" spends nothing');
    assert.deepEqual(t.errors,[]);await t.csp.assertClean();
  }finally{await t.context.close();await t.csp.dispose();await browser.close();await server.close();}
});

test('racing league: a finished race with enough league coins offers a car part and buys it with league coins',{skip:!enabled,timeout:300000},async()=>{
  const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args});
  const t=await boot(browser,server,'');
  try{
    await t.page.evaluate(()=>{const e=window.__island.engine;e.state.islandRacingLeague.coins=260;e.state.money=5;
      window.__island.ui.activityInterface.showResult('islandRacing',undefined,{outcome:'win',score:5,money:0,parts:0,stars:0,stage:1,league:{place:1,points:25,coins:220,seasonDone:false,season:1,race:0,track:'x',laps:4,order:['player','ai-1','ai-2','ai-3','ai-4']}});});
    await t.page.waitForSelector('.uo-card');
    assert.equal(await t.page.locator('.uo-card').count(),1);
    assert.match(await t.page.locator('.uo-category').innerText(),/ליגת המירוצים/);
    if(shots){await t.page.waitForTimeout(800);await t.page.screenshot({path:`${shots}/league-offer-390x844.png`});}
    await t.page.locator('.uo-primary').click();
    await t.page.waitForFunction(()=>document.querySelector('.uo-card')?.dataset.state==='purchased');
    const s=await t.page.evaluate(()=>({coins:window.__island.engine.state.islandRacingLeague.coins,up:window.__island.engine.state.islandRacingLeague.upgrades,money:window.__island.engine.state.money}));
    assert.equal(s.coins,160);assert.equal(Object.values(s.up).reduce((a,b)=>a+b,0),1);assert.ok(s.money>=5&&s.money<10,'island coins untouched (only the slow income may add a little)');
    assert.deepEqual(t.errors,[]);await t.csp.assertClean();
  }finally{await t.context.close();await t.csp.dispose();await browser.close();await server.close();}
});

test('not enough coins, a lost empty stage and ?upgradeOffer=0 show no offer; a failed load leaves the result screen alone',{skip:!enabled,timeout:300000},async()=>{
  const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args});
  try{
    let t=await boot(browser,server,'');
    try{
      await t.page.evaluate(()=>{window.__island.engine.state.money=10;});await showTennisWin(t.page);await t.page.waitForSelector('[data-result=tennis]');await t.page.waitForTimeout(600);
      assert.equal(await t.page.locator('.uo-card').count(),0,'10 coins: nothing to offer');
      await t.page.evaluate(()=>{window.__island.engine.state.money=900;window.__island.ui.activityInterface.showResult('tennis',undefined,{outcome:'lose',score:0,money:0,parts:0,stars:0,stage:2});});
      await t.page.waitForTimeout(600);assert.equal(await t.page.locator('.uo-card').count(),0,'lost with nothing earned');
      assert.deepEqual(t.errors,[]);
    }finally{await t.context.close();await t.csp.dispose();}
    t=await boot(browser,server,'&upgradeOffer=0');
    try{await showTennisWin(t.page);await t.page.waitForSelector('[data-result=tennis]');await t.page.waitForTimeout(600);assert.equal(await t.page.locator('.uo-card').count(),0,'flag off');}
    finally{await t.context.close();await t.csp.dispose();}
    // the kit file cannot be fetched: the result screen is intact and there are no page errors
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await context.route(/assets\/upgrade-offer\/offer\.mjs/,route=>route.abort());
    await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view?.metrics().avatarLoaded);
    if(await page.locator('[data-action=avatar-start]').count())await page.locator('[data-action=avatar-start]').click();
    await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;e.state.money=400;e.learningStatus=()=>({locked:false});window.__island.ui.activityInterface.requireDaily=()=>false;});await page.waitForTimeout(2500);
    await showTennisWin(page);await page.waitForSelector('[data-result=tennis]');await page.waitForTimeout(800);
    assert.equal(await page.locator('.uo-card').count(),0);assert.equal(await page.locator('[data-action=game-again]').count(),1,'result screen intact');assert.deepEqual(errors,[]);
    await context.close();await csp.dispose();
  }finally{await browser.close();await server.close();}
});
