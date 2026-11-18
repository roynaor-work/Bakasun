// racing-deep-m4: the Formula 1 style broadcast in the live island at 844x390 and 740x360 with touch: the race intro with the grid, the start lights
// following the model's countdown, the full-field tower above the wheel, the lower-third cards, the podium with the whole classification and the
// league marks, the upgrade offer after a league race (once), and ?racingBroadcast=0 bringing the old HUD back. Synthetic island, no personal data.
// Usage: CHROMIUM_PATH=... PLAYWRIGHT_MODULE=... node tests/racing-broadcast-browser.mjs   (shots: verification/racing-deep-fable/m4/shots/)
// SwiftShader renders a frame slowly, so the race itself is driven on the model (page.evaluate) and the clock only ticks to refresh the DOM.
import {verify} from './night-browser.mjs';
const sizes=[{width:844,height:390},{width:740,height:360}];
const box=(page,s)=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};},s);
const overlap=(a,b)=>!!a&&!!b&&a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
const driveModel=(page,seconds,stopAt)=>page.evaluate(({seconds,stopAt})=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,w=a=>Math.atan2(Math.sin(a),Math.cos(a));let n=0;
 for(;n<seconds*60&&m.state.phase!=='finished';n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=w(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);m.step(1/60,{steer:Math.max(-1,Math.min(1,e*1.7)),throttle:1,autoAccelerate:true});
  if(stopAt==='lap'&&m.state.events.some(ev=>ev.type==='lap'&&ev.car==='player'))break;}
 return {steps:n,phase:m.state.phase,time:m.state.time,rank:m.state.rank,lap:p.lap};},{seconds,stopAt});
await verify('racing-deep-fable/m4/shots',sizes,async({page,viewport,tick,snap,shot,assert,ready,nav,exit})=>{
 const tag=viewport.width,report={},full=viewport.width===844;
 await page.evaluate(()=>{const {engine,games,data}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.islandRacingLeague.coins=400;});
 const startLeagueRace=async()=>{await page.evaluate(()=>window.__island.games.racingLeagueGo());await tick(100);
  if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}
  for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}
  await ready();await tick(100);await nav();await tick(120);};
 await startLeagueRace();
 // 1. the race intro holds the model on the first lamp-less countdown and shows the grid of ten with the player's slot
 assert.equal(await page.locator('.racing-intro').count(),1);assert.equal(await page.locator('.racing-intro .rb-grid-slot').count(),10);assert.equal(await page.locator('.rb-intro-league').count(),1,'league race badge');
 assert.equal(await page.locator('.rb-grid-slot.you').count(),1);
 const countdown=()=>page.evaluate(()=>window.__island.games.current.session.debug.model.state.countdown);
 let s=await snap();assert.equal(s.phase,'countdown');assert.equal(await countdown(),3,'the model waits while the intro is up');
 const go=await box(page,'[data-action=racing-intro-go]');assert.ok(go.height>=44&&go.width>=44,'intro button 44px: '+JSON.stringify(go));
 assert.equal(await page.locator('.racing-countdown').isHidden(),true,'the digits are replaced by the lights');report.intro={track:await page.locator('.rb-intro-track').textContent(),meta:await page.locator('.rb-intro-meta').textContent()};
 await shot(`${tag}-1-intro`,tag);
 await page.locator('[data-action=racing-intro-go]').tap();await tick(40);
 assert.equal(await page.locator('.racing-intro').count(),0);s=await snap();assert.equal(s.phase,'countdown');assert.ok(await countdown()<3,'the countdown runs after the intro: '+await countdown());
 // 2. the start lights follow state.countdown (set on the model; the physics is untouched) and go out when the model starts racing
 assert.equal(await page.locator('.racing-lights').isVisible(),true);
 await page.evaluate(()=>{window.__island.games.current.session.debug.model.state.countdown=1.3;});await tick(40);
 assert.equal(await page.locator('.rb-lamp.on').count(),3,'1.7 s in: three lamps');
 await page.evaluate(()=>{window.__island.games.current.session.debug.model.state.countdown=.2;});await tick(40);
 assert.equal(await page.locator('.rb-lamp.on').count(),5,'all five lamps held');assert.equal(await page.locator('.rb-early').isHidden(),true,'no gas, no warning');
 const lightsBox=await box(page,'.racing-lights'),hud=await box(page,'.racing-hud'),mini=await box(page,'.racing-minimap');assert.ok(!overlap(lightsBox,hud)&&!overlap(lightsBox,mini),'lights clear of the HUD and the map');
 await shot(`${tag}-2-lights`,tag);
 await page.evaluate(()=>{window.__island.games.current.session.debug.model.state.countdown=.02;});await tick(80);
 s=await snap();assert.equal(s.phase,'racing');assert.equal(await page.locator('.racing-lights').getAttribute('data-out'),'true');assert.equal(await page.locator('.rb-lamp.on').count(),0);
 assert.equal((await page.locator('.rb-lights-label').textContent()).trim(),'זינוק');await shot(`${tag}-3-go`,tag);
 // 3. the tower: every car that fits above the wheel, numbers, colours, real gaps; never over a control
 let d=await driveModel(page,25);report.drive=d;await tick(300);
 const rows=await page.evaluate(()=>[...document.querySelectorAll('.racing-tower.broadcast .rt-row')].filter(r=>r.style.display!=='none').map(r=>({id:r.dataset.id,pos:r.querySelector('.rt-pos').textContent,no:r.querySelector('.rt-no').textContent,name:r.querySelector('.rt-name').textContent,gap:r.querySelector('.rt-gap').textContent,color:r.querySelector('.rt-bar').style.background,you:r.classList.contains('you')})));
 report.towerRows=rows;const expectRows=viewport.height>=390?10:8;assert.equal(rows.length,expectRows,'rows that fit: '+rows.length);
 assert.equal(rows.filter(r=>r.you).length,1,'the player is on the tower');assert.equal(new Set(rows.map(r=>r.no)).size,rows.length,'car numbers');assert.ok(rows.every(r=>r.color),'team colours');
 assert.ok(rows.slice(1).every(r=>r.gap===''||/^\+(\d|הקפה)/.test(r.gap)),'gap texts: '+rows.map(r=>r.gap).join(' '));assert.ok(rows.slice(1).filter(r=>/^\+\d/.test(r.gap)).length>=4,'time gaps shown: '+rows.map(r=>r.gap).join(' '));
 const tower=await box(page,'.racing-tower.broadcast'),wheel=await box(page,'.racing-wheel'),actions=await box(page,'.racing-actions'),auto=await box(page,'.game-controls .racing-auto'),readout=await box(page,'.racing-readout'),pause=await box(page,'.game-pause');
 assert.ok(tower.bottom<=wheel.top+.5,`tower above the wheel: ${tower.bottom} vs ${wheel.top}`);assert.ok(tower.top>=hud.bottom-.5,'tower under the HUD');
 for(const [name,b] of [['wheel',wheel],['actions',actions],['auto',auto],['readout',readout],['pause',pause]])assert.ok(!overlap(tower,b),'tower clear of '+name);
 report.layout={tower,wheel,hud};await shot(`${tag}-4-tower`,tag);
 if(!full){await exit();return report;}
 // 4. cards: a position card after an overtake, a lap card after a lap
 const seen=new Set();const readCard=async()=>{if(await page.locator('.racing-card').isVisible()){const k=await page.locator('.racing-card').getAttribute('data-kind');seen.add(k);return {kind:k,title:await page.locator('.rb-card-title').textContent(),sub:await page.locator('.rb-card-sub').textContent()};}return null;};
 report.cardAfterDrive=await readCard();
 for(let i=0;i<4&&!seen.has('lap');i++){d=await driveModel(page,120,'lap');if(d.phase==='finished')break;await tick(40);await readCard();await driveModel(page,1.5);await tick(40);await readCard();}
 report.cards=[...seen];assert.ok(seen.has('lap'),'a lap card was shown: '+[...seen].join(','));assert.ok(seen.has('up')||seen.has('down'),'a position card was shown: '+[...seen].join(','));
 const cardBox=await box(page,'.racing-card');if(cardBox)assert.ok(!overlap(cardBox,hud)&&!overlap(cardBox,mini)&&!overlap(cardBox,tower),'card clear of HUD, map and tower');
 await shot(`${tag}-5-card`,tag);
 // 5. the finish: podium with the three steps and the whole classification, league marks on the five scoring cars, a 44px button
 d=await driveModel(page,400);assert.equal(d.phase,'finished');await tick(200);
 await page.waitForSelector('.racing-podium.broadcast');
 const podium=await page.evaluate(()=>({rows:[...document.querySelectorAll('.rp-row')].map(r=>({rank:r.dataset.rank,id:r.dataset.id,gap:r.querySelector('.rp-gap').textContent,league:!!r.querySelector('.rp-league'),you:r.classList.contains('you')})),steps:document.querySelectorAll('.racing-podium-step').length,title:document.querySelector('.racing-podium-title').textContent}));
 report.podium=podium;assert.equal(podium.rows.length,10);assert.equal(podium.rows.filter(r=>r.league).length,5);assert.equal(podium.steps,3);assert.equal(podium.rows.filter(r=>r.you).length,1);
 assert.match(podium.rows[0].gap,/^\d+:\d\d\.\d\d$/,'winner time');const goBox=await box(page,'.rp-go');assert.ok(goBox.height>=44,'podium button 44px');
 await shot(`${tag}-6-podium`,tag);
 await page.locator('.rp-go').tap();await page.waitForSelector('[data-racing-league-result]',{timeout:60000});await tick(300);await page.waitForTimeout(300);
 // 6. the league result and one upgrade offer (league coins), never a second card for the same race
 const after=await page.evaluate(()=>{const l=window.__island.engine.state.islandRacingLeague;return {race:l.race,coins:l.coins,upgrades:{...l.upgrades}};});assert.equal(after.race,1);report.afterRace=after;
 await page.waitForSelector('[data-upgrade-offer]',{timeout:60000});assert.equal(await page.locator('[data-upgrade-offer]').count(),1,'one offer after the league race');
 assert.equal(await page.locator('[data-upgrade-offer]').getAttribute('data-upgrade-key'),'islandRacing:league:1:0');report.offer=await page.locator('[data-upgrade-offer]').getAttribute('data-upgrade-offer');
 await shot(`${tag}-7-result-offer`,tag);
 await page.locator('[data-upgrade-offer] .uo-primary').tap();await tick(60);
 const bought=await page.evaluate(()=>{const l=window.__island.engine.state.islandRacingLeague;return {coins:l.coins,upgrades:{...l.upgrades}};});assert.ok(Object.values(bought.upgrades).some(v=>v===1),'the offer bought a league upgrade');assert.ok(bought.coins<after.coins);report.bought=bought;
 await page.evaluate(()=>window.__island.games.offerUpgrade('islandRacing',{outcome:'lose',league:{season:1,race:0}},host=>document.body.append(host)));await tick(200);await page.waitForTimeout(300);
 assert.equal(await page.locator('[data-upgrade-offer]').count(),1,'the same race never gets a second card');
 // 7. ?racingBroadcast=0: the next race uses the old digits, toast and five-row tower
 await page.evaluate(()=>history.replaceState(null,'',location.pathname+'?dev=1&racingBroadcast=0'));
 await page.locator('[data-action=racing-league-go]').first().tap();await tick(100);
 for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}
 await ready();await tick(100);await nav();await tick(120);
 assert.equal(await page.locator('.racing-intro').count(),0);assert.equal(await page.locator('.racing-lights').count(),0);assert.equal(await page.locator('.racing-tower.broadcast').count(),0);assert.equal(await page.locator('.racing-tower').count(),1,'old tower');
 assert.equal(await page.locator('.racing-countdown').isVisible(),true,'old digits');report.flagOff=true;await shot(`${tag}-8-flag-off`,tag);
 await exit();
 return report;
});
