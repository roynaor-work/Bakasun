import {verify} from './night-browser.mjs';
await verify('g4c',[{width:844,height:390},{width:740,height:360},{width:1440,height:1000}],async({page,tick,snap,tap,start,exit,shot,assert})=>{
 await start('tennis');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.characterLoaded);await tick(50);
 const initial=await snap(),metrics=initial.renderMetrics;assert.ok(metrics.triangles<=90000&&metrics.drawCalls<=70,JSON.stringify(metrics));assert.ok(initial.players[0].z>9&&initial.players[1].z<-9);await shot('serve-behind-baseline');
 for(const id of ['shoot','sprint']){await tap('#'+id);await tick(32);assert.equal((await snap()).phase,'serve');}
 await page.clock.fastForward(10000);assert.deepEqual((await snap()).score.points,[0,0]);assert.ok(await page.locator('#pass.serve-ready').isVisible());assert.ok(await page.locator('#pass.serve-ready svg.tennis-serve-hint').isVisible());await shot('time-to-serve');
 await tap('#pass');await tick(200);assert.equal((await snap()).phase,'toss');assert.ok(await page.locator('.tennis-serve-meter').isVisible());await shot('toss-meter');await tick(500);await tap('#pass');await tick(32);assert.equal((await snap()).phase,'rally');await shot('diagonal-serve-crowd');
 await page.evaluate(()=>window.__island.games.current.session.debug.fallback());await tick(32);assert.equal((await snap()).renderMetrics.mode,'canvas');await exit();return {metrics,checks:{baseline:true,onlyServeButton:true,tossThenServe:true,noIdlePenalty:true,noTapThrough:true,fallback:true}};
});
