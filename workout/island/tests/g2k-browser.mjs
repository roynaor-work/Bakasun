import {verify} from './night-browser.mjs';
await verify('g2k',[{width:844,height:390},{width:740,height:360},{width:1440,height:1000}],async({page,context,viewport,tick,snap,tap,start,exit,shot,assert,nav,ready})=>{
 await page.evaluate(()=>{window.__island.games.stages('alienDefense');Object.assign(window.__island.engine.state.hangar,{damage:2,coins:10,credits:1});});
 await page.locator('[data-alien-hand]').waitFor();await tap('[data-action=open-hangar]');
 await page.waitForFunction(()=>document.querySelector('.hangar-preview')?.dataset.mode==='three');
 await page.locator('[data-alien-icon]').first().waitFor();await tick(32);await shot('hangar');
 for(const node of await page.locator('[data-hangar=true] button').all())if(await node.isVisible()){const box=await node.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=viewport.height,JSON.stringify(box));}
 await tap('[data-action=hangar-repair]');assert.equal(await page.evaluate(()=>window.__island.engine.state.hangar.damage),0);
 await tap('[data-action=hangar-upgrade]');await tap('[data-action=hangar-rapid]');assert.equal(await page.evaluate(()=>window.__island.engine.state.hangar.rapid),1);
 const paintBefore=await page.evaluate(()=>window.__island.engine.state.hangar.paint);await tap('[data-action=hangar-paint]');assert.equal(await page.evaluate(()=>window.__island.engine.state.hangar.paint),(paintBefore+1)%3);
 await tap('[data-alien-hand] button');assert.equal(await page.evaluate(()=>localStorage.getItem('island.aliens.hand')),'left');await tap('[data-action=hangar-play]');await tap('[data-action=stage-play][data-stage="1"]');
 if(await page.locator('[data-action=game-understood]').count()){await page.clock.runFor(32);await tap('[data-action=game-understood]');}await ready();await nav();await tick(32);
 await page.waitForFunction(()=>{const s=window.__island.games.current.session.snapshot;return s.renderMetrics?.playerLoaded&&s.artModels?.loaded===6;});
 await tick(32);await shot('wave-entry');
 const textCheck=async()=>{
  assert.equal(await page.locator('.game-status').isVisible(),false);
  const text=await page.locator('.game-screen').innerText();assert.match(text.trim(),/^\d+$/,'only missile count is visible: '+text);
  assert.equal(await page.locator('.game-controls button').count(),2);assert.equal(await page.locator('.soccer-stick-zone').count(),1);assert.equal(await page.locator('#sprint,.game-upgrade-panel').count(),0);
  for(const selector of ['#shoot','#pass','[data-action=game-pause]'])assert.ok(await page.locator(selector).getAttribute('aria-label'));
 };
 await textCheck();assert.equal(await page.locator('.alien-controls').getAttribute('data-movement-side'),'right');
 assert.equal((await snap()).shots.length,0);await tick(1800);assert.equal((await snap()).shots.length,0);await shot('wide-formation');
 const first=await snap();assert.equal(first.aliens.length,18);assert.equal(new Set(first.aliens.map(a=>a.kind)).size,2);assert.ok(first.aliens.every(a=>a.facing===1));
 await tap('#shoot');await tick(32);assert.equal((await snap()).shots.length,1);await tick(500);assert.ok((await snap()).shots.length<=1);
 // A floating stick actually moves the ship and resets on touch end.
 const zone=await page.locator('.soccer-stick-zone').boundingBox(),cdp=await context.newCDPSession(page),x=zone.x+zone.width/2,y=zone.y+zone.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+45,y}]});
 const beforeMove=(await snap()).player.x;await tick(150);const afterMove=(await snap()).player.x;assert.ok(afterMove>beforeMove);assert.equal(await page.locator('#joystick').isVisible(),true);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tick(32);assert.equal(await page.locator('#joystick').isVisible(),false);
 // Buttons are above the ship's entire horizontal lane, including both edges.
 const bounds=await page.locator('canvas.minigame-canvas').boundingBox();
 for(const selector of ['#shoot','#pass']){const box=await page.locator(selector).boundingBox();const shipTop=bounds.y+first.player.y/480*bounds.height-40;assert.ok(box.y+box.height<shipTop,JSON.stringify({selector,box,shipTop}));}
 let tactical;for(let i=0;i<100;i++){await tick(50);const s=await snap();if(s.bolts.some(b=>b.y>0)){tactical=s;break;}}
 assert.ok(tactical,'stage one has visible enemy fire before weavers unlock');await shot('stage-one-enemy-fire');
 const beforeNova=await snap();await tap('#pass');await tick(32);const rocket=await snap();assert.equal(rocket.novaCharges,beforeNova.novaCharges-1);assert.ok(rocket.nova.flight>0);await tick(96);await shot('nova');
 assert.ok(await page.locator('#pass').isDisabled());const charge=await page.locator('#pass').evaluate(n=>parseFloat(n.style.getPropertyValue('--charge')));assert.ok(charge>0&&charge<100);await shot('charging-ring');
 for(let i=0;i<20&&(await snap()).nova.life===0;i++)await tick(50);assert.ok((await snap()).nova.life>0);await shot('shockwave');await tick(850);assert.equal((await snap()).novaCharges,beforeNova.novaCharges-1);
 await tap('#pass');await tick(32);assert.equal((await snap()).novaCharges,beforeNova.novaCharges-2);assert.ok((await snap()).nova.flight>0);
 await textCheck();
 const metrics=[first.renderMetrics,tactical.renderMetrics,rocket.renderMetrics,(await snap()).renderMetrics];
 // Exercise the actual slow-frame detector, then the complete Canvas fallback.
 await page.evaluate(()=>{const r=window.__island.data.config.minigames.alienDefense.render;r.fallbackSampleFrames=2;r.fallbackFrameMs=1;});await tick(100);assert.equal((await snap()).renderMode,'canvas');await shot('fallback');await textCheck();
 await tap('#shoot');await tick(32);assert.ok((await snap()).shots.length>0);await exit();
 await page.evaluate(()=>window.__island.games.stages('alienDefense'));await page.locator('[data-alien-hand]').waitFor();await tap('[data-alien-hand] button');
 await page.evaluate(()=>{const b=window.__island.data.config.minigames.alienDefense;b.render.fallbackFrameMs=10000;b.levels[9].waves=1;window.__island.engine.state.minigameProgress.alienDefense.stage=10;});
 await start('alienDefense',10);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6);await tick(1800);const boss=await snap();assert.ok(boss.aliens.some(a=>a.boss));metrics.push(boss.renderMetrics);
 assert.equal(boss.renderMode,'three');assert.equal(await page.locator('.alien-controls').getAttribute('data-movement-side'),'left');for(const m of metrics)assert.ok(m.triangles<=90000&&m.drawCalls<=70,JSON.stringify(m));await exit();
 await page.evaluate(()=>{window.__island.engine.state.minigameProgress.alienDefense.stage=1;});
 const saved=await page.evaluate(()=>{const e=window.__island.engine;e.save();return JSON.parse(e.exportJSON()).hangar;});assert.equal(saved.rapid,1);assert.equal(saved.paint,(paintBefore+1)%3);assert.equal(await page.evaluate(()=>localStorage.getItem('island.aliens.hand')),'right');
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.engine);assert.equal(await page.evaluate(()=>window.__island.engine.state.hangar.paint),saved.paint);assert.equal(await page.evaluate(()=>window.__island.engine.state.hangar.rapid),1);
 return {metrics,peakTriangles:Math.max(...metrics.map(m=>m.triangles)),peakDrawCalls:Math.max(...metrics.map(m=>m.drawCalls)),nova:{before:beforeNova.novaCharges,after:rocket.novaCharges,flight:rocket.nova.flight,charge},movement:{before:beforeMove,after:afterMove},checks:{iconOnly:true,twoButtons:true,handedness:true,manualFire:true,shipClear:true,earlyEnemyFire:true,novaTouch:true,chargeRing:true,hangarSaved:true,slowFallback:true,bossBudget:true}};
});
