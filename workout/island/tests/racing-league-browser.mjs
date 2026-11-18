// Racing league in the live island: entry card, season, shop, a real league race and its result at 844x390 (and 740x360). Synthetic island, no personal data.
// Usage: ISLAND_CSP_BROWSER=1 node tests/racing-league-browser.mjs   (CHROMIUM_PATH optional)
import {verify} from './night-browser.mjs';
const sizes=[{width:844,height:390},{width:740,height:360}];
await verify('racing-league-v1',sizes,async({page,viewport,tick,snap,shot,assert,ready,nav})=>{
 const tag=viewport.width,report={},requested=[];page.on('request',r=>{if(/\/ui\/racing-league\.(mjs|css)/.test(r.url()))requested.push(r.url().split('/').pop().split('?')[0]);});
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/\/ui\/racing-league\.(mjs|css)/.test(e.name)).length),0,'the league screens are not loaded at boot');
 const open=async(call)=>{await page.evaluate(call);await tick(60);await page.waitForFunction(()=>document.querySelector('[data-racing-league],[data-racing-season],[data-racing-shop],[data-racing-league-result]'));await tick(30);};
 await page.evaluate(()=>{const {engine,games,data}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;});
 // 1. the stage map shows the league card above the regular stages
 await open(()=>window.__island.games.stages('islandRacing'));
 assert.deepEqual([...new Set(requested)].sort(),['racing-league.css','racing-league.mjs'],'loaded only when the racing menu opens');report.lazyFiles=[...new Set(requested)];
 assert.equal(await page.locator('.rl-card .rl-race').count(),6);assert.equal(await page.locator('[data-action=racing-league-go]').count(),1);
 assert.equal(await page.locator('.stage-map button[data-stage]').count(),0,'racing-v11: the level map is gone, the league is the entry (saved stages stay in the save)');assert.equal(await page.evaluate(()=>window.__island.engine.state.minigameProgress.islandRacing.stage>=1),true,'saved progress is untouched');
 report.card=await page.locator('.rl-card').boundingBox();await shot(`${tag}-1-card`);
 // 2. season, table and gates
 await page.locator('[data-action=racing-league-season]').tap();await tick(60);await page.waitForSelector('[data-racing-season]');
 assert.equal(await page.locator('.rl-gate').count(),3);await shot(`${tag}-2-season`);
 // 3. shop: not enough coins, then buy after a prize
 await page.locator('[data-action=racing-league-back]').tap();await tick(60);await page.waitForSelector('[data-racing-league]');
 await page.locator('[data-action=racing-league-shop]').tap();await tick(60);await page.waitForSelector('[data-racing-shop]');
 assert.equal(await page.locator('[data-action=racing-league-buy]:not([disabled])').count(),0,'no coins, no purchase');await shot(`${tag}-3-shop-empty`);
 await page.evaluate(()=>{window.__island.engine.state.islandRacingLeague.coins=400;});await page.evaluate(()=>window.__island.games.racingLeagueScreen('shop'));await tick(60);await page.waitForSelector('[data-racing-shop]');
 await page.locator('[data-part=engine][data-action=racing-league-buy]').tap();await tick(60);
 assert.equal(await page.evaluate(()=>window.__island.engine.state.islandRacingLeague.upgrades.engine),1);assert.equal(await page.evaluate(()=>window.__island.engine.state.islandRacingLeague.coins),300);await shot(`${tag}-4-shop-bought`);
 // 4. a real league race: the model is the league circuit, then it ends and the result card appears
 await page.evaluate(()=>window.__island.games.racingLeagueGo());await tick(100);
 if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}
 for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}await tick(400);
 await ready();await tick(100);await nav();await tick(1500);let s=await snap();assert.equal(s.stage,1);assert.equal(await page.locator('.game-screen').getAttribute('data-league'),'true');
 assert.equal(await page.locator('.game-header h2').textContent().then(t=>t.includes('ליגה')),true);await shot(`${tag}-5-race`);
 // finish the race with the bot driving the real model, then let the session notice the result
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,w=a=>Math.atan2(Math.sin(a),Math.cos(a));
  for(let n=0;n<(m.stage.timeLimit+2)*60&&m.state.phase!=='finished';n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=w(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);m.step(1/60,{steer:Math.max(-1,Math.min(1,e*1.7)),throttle:1,autoAccelerate:true});}});
 await tick(500);if(await page.locator('.racing-podium').count())await page.locator('.racing-podium').tap();await page.waitForSelector('[data-racing-league-result]',{timeout:60000});
 const after=await page.evaluate(()=>{const l=window.__island.engine.state.islandRacingLeague,e=window.__island.engine.state;return {race:l.race,coins:l.coins,table:l.table,progress:e.minigameProgress.islandRacing.stage,history:l.history};});
 assert.equal(after.race,1);assert.equal(after.progress,1,'the regular stage progress is untouched');assert.equal(after.history.length,1);report.afterRace=after;
 await shot(`${tag}-6-result`);
 // 5. the save holds the league after a reload of the stored JSON
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('island.v1')));assert.equal(saved.version,19);assert.equal(saved.islandRacingLeague.race,1);report.savedVersion=saved.version;
 // back to the map: the next race is race 2
 await page.locator('[data-action=racing-league-season]').tap();await tick(60);await page.waitForSelector('[data-racing-season]');
 assert.equal(await page.locator('.rl-race[data-state=done]').count(),1);assert.equal(await page.locator('.rl-race[data-state=next]').count(),1);await shot(`${tag}-7-season-after`);
 return report;
});
