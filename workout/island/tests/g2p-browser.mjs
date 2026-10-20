import {verify} from './night-browser.mjs';
await verify('g2p',[{width:844,height:390},{width:390,height:844}],async({page,context,viewport,tick,snap,tap,start,exit,shot,assert})=>{
 await start('alienDefense');
 const portrait=viewport.width<viewport.height;
 if(portrait){const before=await snap();assert.equal(before.paused,true);assert.equal(await page.locator('.game-screen').getAttribute('data-orientation-blocked'),'true');await tick(400);assert.equal((await snap()).time,before.time);await shot('06-portrait-controls',390);await page.setViewportSize({width:844,height:390});await tick(32);assert.equal((await snap()).paused,false);}
 await page.waitForFunction(()=>{const s=window.__island.games.current.session.snapshot;return s.artModels?.loaded===6&&s.renderMetrics?.playerLoaded&&s.audio.loaded===7;});
 const noText=async()=>assert.match((await page.locator('.game-screen').innerText()).trim(),/^\d+$/);
 await noText();
 const controls=await page.locator('.alien-controls').evaluate(root=>Object.fromEntries(['shoot','pass','joystick'].map(id=>{const e=root.querySelector('#'+id),r=e.getBoundingClientRect(),s=getComputedStyle(e);return [id,{width:r.width,height:r.height,x:r.x,y:r.y,color:s.backgroundColor,visible:!e.hidden}];})));
 for(const c of Object.values(controls)){assert.ok(c.visible);assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=844&&c.y+c.height<=390);}
 assert.equal(controls.shoot.color,'rgb(207, 52, 70)');assert.equal(controls.pass.color,'rgb(221, 117, 40)');assert.ok(controls.shoot.width>=88);assert.equal((await snap()).novaAim,undefined);
 // First half of the real entrance; keep the clock and draw frame together.
 await tick(1000);if(!portrait)await shot('05-curved-entry');
 const entry=await snap();assert.ok(entry.aliens.some(a=>a.entry>0&&a.y>0));
 let maxEntryStep=0;
 for(let i=0;i<70;i++){const before=await snap();await tick(16);const after=await snap();for(const a of after.aliens){const p=before.aliens.find(p=>p.id===a.id);maxEntryStep=Math.max(maxEntryStep,Math.hypot(a.x-p.x,a.y-p.y));}}
 assert.ok(maxEntryStep<7);const settled=await snap();assert.ok(settled.aliens.every(a=>a.y<=120));assert.ok(settled.aliens.every(a=>settled.player.y-a.y-a.radius>=240));
 if(!portrait){await shot('01-stage-one');await shot('02-fire-missile-controls');}
 const cdp=await context.newCDPSession(page),center=async s=>{const r=await page.locator(s).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
 const touch=(type,points=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i+1}))});
 const stick=await center('#joystick'),fire=await center('#shoot'),beforeMove=await snap();await touch('touchStart',[stick,fire]);await touch('touchMove',[{x:stick.x+20,y:stick.y},fire]);await tick(160);assert.ok((await snap()).player.x>beforeMove.player.x);assert.ok((await snap()).shots.length>0);await touch('touchEnd');await tick(32);assert.ok(await page.locator('#joystick').isVisible());
 const before=await snap();await tap('#pass');await tick(32);let flying=await snap();assert.equal(flying.novaCharges,before.novaCharges-1);assert.equal(flying.nova.aim,undefined);assert.ok(flying.nova.flight>0);const x=flying.nova.x,y=flying.nova.y;
 await tick(200);flying=await snap();assert.equal(flying.nova.x,x);assert.ok(flying.nova.y<y);if(!portrait)await shot('03-missile-flight');await tick(420);const blast=await snap();assert.equal(blast.nova.flight,0);assert.ok(blast.nova.life>0);assert.equal(blast.nova.y,192);assert.equal(blast.nova.hitId,null);const fraction=(before.aliens.length-blast.aliens.length)/before.aliens.length;assert.ok(fraction>=.2&&fraction<=.4);await tick(160);if(!portrait)await shot('04-local-explosion');
 const impact=[blast.nova.x,blast.nova.y];await tick(120);assert.deepEqual([(await snap()).nova.x,(await snap()).nova.y],impact);assert.ok((await snap()).audio.played>0);
 await tap('[data-action=game-pause]');await tap('[data-action=game-pause-sound]');assert.ok((await snap()).audio.paused);await tap('[data-action=game-resume]');await tick(32);assert.ok((await snap()).audio.muted);await tap('[data-action=game-pause]');await tap('[data-action=game-pause-sound]');await tap('[data-action=game-resume]');await tick(32);assert.equal((await snap()).audio.muted,false);
 await page.evaluate(()=>window.__island.games.current.session.debug.view.degrade(true));await tick(32);assert.equal((await snap()).renderMode,'canvas');await noText();await exit();
 return {controls,maxEntryStep,missileKillFraction:fraction,audio:blast.audio,checks:{noTarget:true,straightFlight:true,localImpact:true,upperQuarter:true,curvedEntry:true,visibleStick:true,multitouch:true,sevenSoftSamples:true,mutePause:true,canvasFallback:true,portraitGuard:portrait,iconOnly:true}};
});
