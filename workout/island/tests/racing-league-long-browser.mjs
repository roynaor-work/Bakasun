// racing-deep-m6: the long league in the live island at 844x390 with touch (and 740x360): the card with a 12-race calendar, the season screen with the drivers'
// and teams' tables and the rival, a real 12-car league race to the end, the result and the upgrade offer, the end of a season with podium and prize, the next
// season, a version-19 save with the old five-driver league that loads and continues, and ?racingLongLeague=0. Synthetic island, no personal data.
// Usage: ISLAND_CSP_BROWSER=1 CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/racing-league-long-browser.mjs
import {verify} from './night-browser.mjs';
const sizes=process.env.RLL_ONLY_844?[{width:844,height:390}]:[{width:844,height:390},{width:740,height:360}];
const BOT=`(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,w=a=>Math.atan2(Math.sin(a),Math.cos(a));
  for(let n=0;n<(m.stage.timeLimit+2)*60&&m.state.phase!=='finished';n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=w(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);m.step(1/60,{steer:Math.max(-1,Math.min(1,e*1.7)),throttle:1,autoAccelerate:true,nitro:p.nitro>70&&Math.abs(e)<.08});}
  return {cars:m.state.cars.length,scoring:m.state.cars.filter(c=>c.scoring!==false).length,rank:m.state.result?.rank,time:m.state.time,finished:p.finished};})()`;
await verify('racing-deep-fable/m6/shots',sizes,async({page,viewport,tick,snap,shot,assert,ready,nav})=>{
 const tag=viewport.width,report={};
 const open=async(call)=>{await page.evaluate(call);await tick(60);await page.waitForFunction(()=>document.querySelector('[data-racing-league],[data-racing-season],[data-racing-shop],[data-racing-league-result]'));await tick(30);};
 await page.evaluate(()=>{const {engine,games,data}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;});
 const league=()=>page.evaluate(()=>{const l=window.__island.engine.state.islandRacingLeague;return {season:l.season,race:l.race,coins:l.coins,table:Object.keys(l.table).length,upgrades:Object.keys(l.upgrades).length,history:l.history.length,podium:l.seasonPodium,prize:l.seasonPrize,teamChampion:l.teamChampion};});
 // 1. the card: twelve races on the calendar strip, twelve drivers, tags on the next race
 await open(()=>window.__island.games.stages('islandRacing'));
 assert.equal(await page.locator('.rl-card').getAttribute('data-long'),'true');assert.equal(await page.locator('.rl-card .rl-race').count(),12,'season 1 has twelve races');assert.equal(await page.locator('.rl-card .rl-race[data-state=next]').count(),1);
 assert.ok((await page.locator('.rl-card .rl-line').first().textContent()).includes('12 נהגים'));assert.ok(await page.locator('.rl-card .rl-next .rl-tag').count()>=1,'the next race carries a time-of-day tag');
 const strip=await page.locator('.rl-card .rl-races').evaluate(n=>({scrollWidth:n.scrollWidth,clientWidth:n.clientWidth}));assert.ok(strip.scrollWidth>strip.clientWidth,'the calendar scrolls sideways');report.strip=strip;
 report.card=await page.locator('.rl-card').boundingBox();await shot(`${tag}-1-card`);
 // 2. season screen: drivers' table of twelve, teams' table of six, five seasons, the short-races setting
 await page.locator('[data-action=racing-league-season]').tap();await tick(60);await page.waitForSelector('[data-racing-season]');
 assert.equal(await page.locator('.rl-table tr[data-driver]').count(),12);assert.equal(await page.locator('.rl-table tr.mine[data-driver=player]').count(),1,'the player row is marked');
 assert.equal(await page.locator('.rl-teams tr[data-team]').count(),6);assert.equal(await page.locator('.rl-gate').count(),5);assert.equal(await page.locator('[data-action=racing-league-short]').count(),1);
 const mineBox=await page.locator('.rl-table tr.mine[data-driver=player] .rl-pts').boundingBox();assert.ok(mineBox.height>=24,'large numbers for the child');
 await shot(`${tag}-2-season`);
 // 3. shop: six parts including ERS
 await page.locator('[data-action=racing-league-back]').tap();await tick(60);await page.waitForSelector('[data-racing-league]');
 await page.locator('[data-action=racing-league-shop]').tap();await tick(60);await page.waitForSelector('[data-racing-shop]');
 assert.equal(await page.locator('.rl-part').count(),6);assert.equal(await page.locator('.rl-part[data-part=ers]').count(),1);await shot(`${tag}-3-shop`);
 // 4. a real league race with the whole grid of twelve, to the end
 await page.evaluate(()=>{window.__island.engine.state.islandRacingLeague.coins=400;});
 await page.evaluate(()=>window.__island.games.racingLeagueGo());await tick(100);
 if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}
 for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}await tick(400);
 await ready();await tick(100);await nav();await tick(1500);let s=await snap();assert.equal(s.cars.length,12,'twelve cars on the track');assert.equal(s.cars.filter(c=>c.scoring!==false).length,12,'all twelve score');
 const header=await page.locator('.game-header h2').textContent();assert.ok(header.includes('ליגה')&&header.includes('מתוך 12'),header);assert.equal((await page.locator('.racing-of').textContent()).trim(),'/ 12','HUD place out of twelve');report.header=header;
 if(await page.locator('.rb-intro-go').count())await page.locator('.rb-intro-go').tap();await tick(4200);await shot(`${tag}-4-race`);
 const raced=await page.evaluate(BOT);assert.equal(raced.finished,true);assert.equal(raced.cars,12);report.race1=raced;
 await tick(500);if(await page.locator('.racing-podium,.rb-podium').count())await page.locator('.racing-podium,.rb-podium').first().tap();await page.waitForSelector('[data-racing-league-result]',{timeout:60000});
 let L=await league();assert.equal(L.race,1);assert.equal(L.history,1);assert.equal(L.table,12);
 assert.ok((await page.locator('[data-league-row=place]').textContent()).includes('/ 12'));assert.equal(await page.locator('[data-racing-league-result] .rl-table tr[data-driver]').count(),12);
 await page.waitForSelector('[data-upgrade-offer]',{timeout:20000});assert.equal(await page.locator('[data-upgrade-key="islandRacing:league:1:0"]').count(),1,'one upgrade offer for this race');report.afterRace1=L;
 await shot(`${tag}-5-result-offer`);
 // 5. the end of the season: jump to the last race, race it for real, see the podium, the prize and the way into season 2
 await page.evaluate(()=>{const l=window.__island.engine.state.islandRacingLeague;l.race=11;});
 await page.evaluate(()=>window.__island.games.racingLeagueGo());await tick(100);
 for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}await tick(400);
 await ready();await tick(100);await nav();await tick(1500);if(await page.locator('.rb-intro-go').count())await page.locator('.rb-intro-go').tap();await tick(4200);
 const raced2=await page.evaluate(BOT);assert.equal(raced2.finished,true);report.race2=raced2;
 await tick(500);if(await page.locator('.racing-podium,.rb-podium').count())await page.locator('.racing-podium,.rb-podium').first().tap();await page.waitForSelector('[data-racing-league-result]',{timeout:60000});
 L=await league();assert.equal(L.race,12);assert.ok(L.podium['1']?.length===3,'season podium saved');assert.ok(L.prize['1']>0,'season prize paid');assert.ok(L.teamChampion['1']);report.seasonEnd=L;
 assert.equal(await page.locator('[data-racing-league-result] [data-season-podium="1"]').count(),1);assert.equal(await page.locator('[data-racing-league-result] .rl-podium-step').count(),3);assert.equal(await page.locator('[data-league-row=prize]').count(),1);
 await shot(`${tag}-6-season-end`);
 const nextBtn=page.locator('[data-action=racing-league-next-season]');const restart=page.locator('[data-action=racing-league-restart]');
 assert.ok(await nextBtn.count()+await restart.count()===1,'either the next season opens or a replay is offered');report.gateOpen=await nextBtn.count()===1;
 if(await nextBtn.count()){await nextBtn.tap();await tick(60);await page.waitForSelector('[data-racing-league]');L=await league();assert.equal(L.season,2);assert.equal(L.race,0);
  assert.equal(await page.locator('.rl-card .rl-race').count(),14,'season 2 has fourteen races');assert.ok((await page.locator('.rl-card h3').textContent()).includes('ליגת הכסף'));await shot(`${tag}-7-season-2`);}
 else{await restart.tap();await tick(60);await page.waitForSelector('[data-racing-league]');L=await league();assert.equal(L.season,1);assert.equal(L.race,0);await shot(`${tag}-7-replay`);}
 // 6. the save stays at version 19 and holds the long league
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('island.v1')));assert.equal(saved.version,19);assert.equal(Object.keys(saved.islandRacingLeague.table).length,12);report.savedVersion=saved.version;
 // 7. an older version-19 save with the five-driver league (mid season 2 of six races) loads and continues on the long calendar without losing anything
 await page.evaluate(()=>{const save=JSON.parse(localStorage.getItem('island.v1'));save.islandRacingLeague={version:1,season:2,race:3,coins:415,upgrades:{engine:2,tires:1,steering:0,brakes:1,aero:0},table:{player:40,almog:33,turkiz:52,shemesh:18,barkat:25},
   history:[0,1,2,3,4,5].map(i=>({season:1,race:i,place:1+(i%5),points:[25,18,15,12,10][i%5],coins:[220,160,120,90,70][i%5]})).concat([0,1,2].map(i=>({season:2,race:i,place:2,points:18,coins:160}))),champion:{1:'player'},seasonRank:{1:1}};localStorage.setItem('island.v1',JSON.stringify(save));});
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.engine);await tick(200);
 if(await page.locator('[data-action=avatar-start]').count()){await page.locator('[data-action=avatar-start]').tap();await tick(32);}
 await page.evaluate(()=>{const {engine,games,data}=window.__island;engine.skipTutorial?.();engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;});
 L=await league();assert.equal(L.season,2);assert.equal(L.race,3);assert.equal(L.coins,415);assert.equal(L.table,12);assert.equal(L.upgrades,6);assert.equal(L.history,9);report.oldSave=L;
 const kept=await page.evaluate(()=>{const l=window.__island.engine.state.islandRacingLeague;return {turkiz:l.table.turkiz,gal:l.table.gal,engine:l.upgrades.engine,ers:l.upgrades.ers,champion:l.champion[1]};});assert.deepEqual(kept,{turkiz:52,gal:0,engine:2,ers:0,champion:'player'});
 await open(()=>window.__island.games.stages('islandRacing'));
 assert.equal(await page.locator('.rl-card .rl-race').count(),14);assert.equal(await page.locator('.rl-card .rl-race[data-state=done]').count(),3);assert.ok((await page.locator('.rl-card .rl-line').first().textContent()).includes('מרוץ 4 מתוך 14'));
 assert.ok(await page.locator('.rl-card .rl-rival-line').count()>=1,'the rival line appears once there are points');await shot(`${tag}-8-old-save`);
 // 8. the off flag: the short league of racing-v9 (six races, five drivers) on the same save
 await page.goto(page.url().split('?')[0]+'?dev=1&racingLongLeague=0',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.engine);await tick(200);
 if(await page.locator('[data-action=avatar-start]').count()){await page.locator('[data-action=avatar-start]').tap();await tick(32);}
 await page.evaluate(()=>{const {engine,games,data}=window.__island;engine.skipTutorial?.();engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;});
 await open(()=>window.__island.games.stages('islandRacing'));
 assert.equal(await page.locator('.rl-card').getAttribute('data-long'),'false');assert.equal(await page.locator('.rl-card .rl-race').count(),6,'flag off: six races');L=await league();assert.equal(L.season,2);assert.equal(L.race,3);assert.equal(L.coins,415);
 await page.locator('[data-action=racing-league-season]').tap();await tick(60);await page.waitForSelector('[data-racing-season]');assert.equal(await page.locator('.rl-table tr[data-driver]').count(),5,'flag off: five rows');await shot(`${tag}-9-flag-off`);
 return report;
});
