import {verify} from './night-browser.mjs';
await verify('g3f',[{width:844,height:390},{width:740,height:360},{width:1440,height:1000}],async({page,tick,snap,start,exit,shot,assert})=>{
 await start('soccer');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics.assetStatus==='ready');
 const scenario=async ball=>{
  await page.evaluate(ball=>{
   const model=window.__island.games.current.session.debug.model,s=model.getState(),c=window.__island.data.config.minigames.soccer;
   model.clearInput();Object.assign(s,{phase:'playing',phaseTime:0,half:1,halfElapsed:0,elapsed:0,score:[0,0],controlled:0,attackDir:1,passTarget:null,event:null});
   for(const p of s.players)Object.assign(p,{x:p.team?8:-8,z:p.id%2?8:-8,vx:0,vz:0,cooldown:100,think:100,recover:0,slideTime:0,headerTime:0,kickTime:0,stealTime:0});
   Object.assign(s.players[0],{x:14,z:0,fx:1,fz:0});
   Object.assign(s.ball,{owner:null,flight:null,x:0,y:c.physics.ballRadius,z:0,vx:0,vy:0,vz:0,grace:100,lastTeam:0,lastPlayer:0,curve:0,...ball});
  },ball);await tick(40);
 };
 const c=await page.evaluate(()=>window.__island.data.config.minigames.soccer),hx=c.pitch.length/2,hz=c.pitch.width/2;
 await scenario({x:hx-.6,y:1,z:c.pitch.goalWidth/2,vx:60});
 let s=await snap();assert.equal(s.event.type,'post');assert.equal(s.event.kind,'post');assert.ok(s.ball.vx<0);assert.deepEqual(s.score,[0,0]);await shot('post');
 await scenario({x:hx-.6,y:c.pitch.goalHeight,z:0,vx:60});
 s=await snap();assert.equal(s.event.type,'post');assert.ok(s.ball.vx<0);assert.deepEqual(s.score,[0,0]);
 await scenario({x:3,z:hz+.1,vx:12,vz:30});s=await snap();assert.equal(s.restart.type,'throwIn');assert.equal(s.restart.team,1);
 assert.equal(await page.locator('.soccer-phase-banner').innerText(),'הוצאת חוץ');assert.ok(await page.locator('.soccer-phase-banner').isVisible());
 const elapsed=s.elapsed;await tick(300);assert.equal((await snap()).elapsed,elapsed);await shot('throw-in');
 await scenario({x:hx-.1,vx:30});s=await snap();assert.equal(s.phase,'goal');assert.deepEqual(s.score,[1,0]);assert.ok(await page.locator('.soccer-goal-banner').isVisible());
 const score=s.score;await tick(300);assert.deepEqual((await snap()).score,score);
 const metrics=(await snap()).renderMetrics;assert.ok(metrics.triangles<=130000&&metrics.drawCalls<=90);await exit();
 return {metrics:{triangles:metrics.triangles,drawCalls:metrics.drawCalls,modelCount:metrics.modelCount,assetStatus:metrics.assetStatus},checks:{visiblePostBounce:true,visibleCrossbarBounce:true,throwInLabel:true,correctThrowInTeam:true,restartFreezesClock:true,wholeBallGoal:true,noDoubleGoal:true}};
});
