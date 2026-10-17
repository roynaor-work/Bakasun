import {verify} from './night-browser.mjs';
await verify('g7',[{width:740,height:360},{width:844,height:390},{width:390,height:844},{width:1440,height:1000}],async({page,viewport,tick,snap,tap,start,exit,shot,nav,assert})=>{
 const landscape=viewport.width>viewport.height&&viewport.height<=600;
 const bounds=selector=>page.locator(selector).boundingBox();
 await page.evaluate(()=>window.__island.ui.toast('app.saved'));
 await tap('[data-action=toggle-city]');await tick(100);
 const city=await bounds('.hud');assert.ok(city.y+city.height<=viewport.height-7,JSON.stringify(city));
 const cityDetails=page.locator('.city-details');await cityDetails.evaluate(n=>n.scrollTop=n.scrollHeight);
 await tap('[data-action=toggle-city]');await tap('[data-action=toggle-build]');await tick(100);
 const hud=await bounds('.hud'),dock=await bounds('.build-dock');
 if(landscape)assert.ok(dock.y>=hud.y+hud.height+7,JSON.stringify({hud,dock}));
 await page.evaluate(()=>{const {ui,engine}=window.__island;ui.showInfo(engine.state.buildings.find(b=>b.typeId==='cityHall').id);});await tick(100);
 const info=await bounds('.info-card');assert.ok(info.y>=0&&info.y+info.height<=viewport.height);
 if(landscape){assert.ok(info.height>=250);assert.equal(await page.locator('.hud').isVisible(),false);assert.equal(await page.locator('.build-dock').isVisible(),false);}
 await shot('city-card',740);
 await tap('[data-action=city-hall-games]');assert.ok(await page.locator('.game-cards').isVisible());
 await tap('[data-action=close-modal]');await nav();
 if(landscape)assert.equal(await page.evaluate(()=>document.activeElement.closest('.info-card')!==null),true);
 await page.evaluate(()=>window.__island.ui.closeInfo());
 const rotation=[];
 for(const id of ['soccer','navalDuel','tennis']){
  await page.setViewportSize({width:390,height:844});await start(id);await tick(100);
  assert.equal((await snap()).paused,true);assert.ok(await page.locator('.soccer-rotate').isVisible());
  await tap('[data-action=game-rotate-pause]');assert.ok(await page.locator('.game-pause-sheet').isVisible());
  await shot('portrait-pause',740);await tap('[data-action=game-resume]');assert.equal((await snap()).paused,true);
  await page.goBack();await nav();assert.ok(await page.locator('.game-pause-sheet').isVisible());
  await tap('[data-action=game-resume]');
  await page.setViewportSize({width:844,height:390});await page.locator('.game-screen[data-orientation-blocked=false]').waitFor({state:'attached'});await tick(100);assert.equal((await snap()).paused,false);
  await page.setViewportSize({width:390,height:844});await page.locator('.game-screen[data-orientation-blocked=true]').waitFor({state:'attached'});await tick(50);assert.equal((await snap()).paused,true);
  await tap('[data-action=game-rotate-pause]');await tap('[data-action=game-exit]');await nav();assert.equal(await snap(),undefined);
  rotation.push(id);
 }
 await page.setViewportSize(viewport);
 return {city,hud,dock,info,rotation,checks:{boundedCityDetails:true,catalogBelowHud:true,usableCityCard:true,cityGamesReachable:true,visibleFocusAfterModal:true,portraitPauseReachable:true,portraitBackReachable:true,rotationResumesSameSession:true}};
});
