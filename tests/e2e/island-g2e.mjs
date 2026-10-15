import assert from 'node:assert/strict';
import path from 'node:path';
import {DATA_VERSION} from '../../workout/island/release.mjs';

export async function checkG2e({browser,target,directory}){
  const reports=[];
  for(const width of [360,390]){
    const context=await browser.newContext({viewport:{width,height:width===360?740:844},hasTouch:true,deviceScaleFactor:1});
    const page=await context.newPage(),errors=[],jsonRequests=[],routes=[],shots=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('.json'))jsonRequests.push(r.url());});
    // Model the reported stale unversioned cache. A correct release never uses it.
    await page.route('**/data/*.json*',async route=>{if(!new URL(route.request().url()).searchParams.has('v'))await route.fulfill({json:{}});else await route.continue();});
    // Warm G2d module caches must not bypass the new versioned JSON loader.
    const changedModules=new Set(['release.mjs','ui/translate.mjs','ui/activity.mjs','engine/load-data.mjs','minigames/aliens.mjs','minigames/fire.mjs','minigames/naval.mjs','minigames/naval-view.mjs','minigames/canvas-session.mjs','minigames/art.mjs','minigames/pool.mjs','minigames/model-art.mjs','extensions/alien-defense.mjs','extensions/fire-rescue.mjs','extensions/naval-duel.mjs']);
    await page.route('**/*.mjs*',async route=>{const url=new URL(route.request().url()),key=url.pathname.split('/island/')[1];if(changedModules.has(key)&&url.searchParams.get('v')!==DATA_VERSION)await route.fulfill({contentType:'text/javascript',body:'throw Error("stale module cache")'});else await route.continue();});
    const cdp=await context.newCDPSession(page),tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot),tap=s=>page.locator(s).tap();
    const touch=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{...p,id:1}]});
    async function point(x,y){return page.locator('.minigame-canvas').evaluate((n,{x,y})=>{const r=n.getBoundingClientRect(),c=window.__island.data.config.minigames,h=window.__island.games.current.session.snapshot.enemies?c.navalDuel.render.height:c.height,s=Math.min(r.width/c.width,r.height/h);return {x:r.x+(r.width-c.width*s)/2+x*s,y:r.y+(r.height-h*s)/2+y*s};},{x,y});}
    async function start(id,stage=1){await page.evaluate(({id,stage})=>window.__island.games.start(id,undefined,stage),{id,stage});if(await page.locator('[data-action=game-understood]').count())await tap('[data-action=game-understood]');await tick(240);}
    async function exit(){await tap('[data-action=game-exit]');assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);}
    async function screenshot(id){const name=`${width}-${id}.png`;await page.screenshot({path:path.join(directory,name)});shots.push(name);}
    async function assertNoSelectionMenu(selector){
      const blocked=await page.locator(selector).evaluate(n=>{const context=new MouseEvent('contextmenu',{bubbles:true,cancelable:true}),select=new Event('selectstart',{bubbles:true,cancelable:true});return {context:!n.dispatchEvent(context),select:!n.dispatchEvent(select),text:getSelection().toString(),userSelect:getComputedStyle(n).userSelect,touchAction:getComputedStyle(n).touchAction};});
      assert.equal(blocked.context,true);assert.equal(blocked.select,true);assert.equal(blocked.text,'');assert.equal(blocked.userSelect,'none');assert.equal(blocked.touchAction,'none');
    }
    try{
      await page.clock.install();await page.goto(target,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await tap('[data-action=avatar-start]');
      await page.evaluate(()=>{window.__island.engine.skipTutorial();window.__island.data.featureFlags.events=false;});await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
      for(const boss of [false,true])for(const route of ['clear','timer']){
        console.log(`G2e ${width}: alien ${route}, boss=${boss}`);
        // Short deterministic encounter, real model, RAF, collision and finish UI.
        await page.evaluate(({boss,route})=>{const b=window.__island.data.config.minigames.alienDefense;window.__g2eLevel=b.levels[0];b.levels[0]={...b.levels[0],seconds:6,waves:1,rows:1,columns:1,boss,bossLives:1,alienSpeed:0,drop:0,boltSeconds:999};},{boss,route});
        await start('alienDefense');let holding=false;
        for(let i=0;i<180&&await page.locator('.minigame-canvas').count();i++){
          const m=await snap();if(route==='clear'){const a=m.aliens[0];if(a){const p=await point(a.x,440);await touch(holding?'touchMove':'touchStart',p);holding=true;}}await tick(50);
        }
        if(holding)await touch('touchEnd');await page.locator('[data-result=alienDefense]').waitFor();
        const values=await page.locator('.result-row bdi').allTextContents();assert.equal(values.length,4);assert.ok(Number(values[1])>0);assert.ok(Number(values[3])>=1);assert.equal(await page.locator('[data-action=game-next-stage]').count(),1);
        const wins=await page.evaluate(()=>window.__island.engine.state.minigameWins.alienDefense);await tick(500);assert.equal(await page.evaluate(()=>window.__island.engine.state.minigameWins.alienDefense),wins);
        await page.evaluate(()=>{window.__island.data.config.minigames.alienDefense.levels[0]=window.__g2eLevel;});await tap('[data-action=game-next-stage]');await tick(100);assert.equal(await page.locator('.game-screen').getAttribute('data-stage'),'2');await exit();routes.push({boss,route,result:true,stars:true,prize:true,next:true});
      }
      console.log(`G2e ${width}: fire long press, no selection or context menu`);
      await start('fireRescue');const p=await point(350,0);await touch('touchStart',p);await tick(3000);await touch('touchEnd');const before=await snap(),box=await page.locator('[data-game-control=refill]').boundingBox();await touch('touchStart',{x:box.x+box.width/2,y:box.y+box.height/2});
      await page.waitForTimeout(850);await tick(700);const mid=await snap();assert.ok(mid.water>before.water);await tick(500);assert.ok((await snap()).water>mid.water);await assertNoSelectionMenu('[data-game-control=refill]');await touch('touchEnd');const released=(await snap()).water;await tick(300);assert.equal((await snap()).water,released);await assertNoSelectionMenu('.minigame-canvas');await screenshot('fireRescue');await exit();
      console.log(`G2e ${width}: naval yaw, elevation, force, icons, fine angles and torpedo`);
      await start('navalDuel');let m=await snap(),initial=m;assert.equal(await page.locator('.ammo-rack canvas').count(),4);assert.deepEqual(await page.locator('[data-game-input=yaw]').evaluate(n=>[n.min,n.max]),['-90','90']);assert.deepEqual(await page.locator('[data-game-input=angle]').evaluate(n=>[n.min,n.max]),['0','90']);
      const origin=await point(130,120);await touch('touchStart',origin);await touch('touchMove',{x:origin.x+20,y:origin.y-20});await tick(100);await touch('touchEnd');m=await snap();assert.ok(m.aim.yaw>initial.aim.yaw);assert.ok(m.aim.angle>initial.aim.angle);assert.equal(m.aim.power,initial.aim.power);assert.equal(m.phase,'aim');assert.deepEqual(m.ammo,initial.ammo);
      const yaw=m.aim.yaw;await tap('[data-angle-axis=yaw][data-angle-step="1"]');await tick(240);assert.ok(Math.abs((await snap()).aim.yaw-yaw-1)<1e-8);
      const afterFine=await snap(),powerBox=await page.locator('[data-game-input=power]').boundingBox();await touch('touchStart',{x:powerBox.x+powerBox.width*.5,y:powerBox.y+powerBox.height/2});await touch('touchMove',{x:powerBox.x+powerBox.width*.2,y:powerBox.y+powerBox.height/2});await tick(240);await touch('touchEnd');m=await snap();assert.notEqual(m.aim.power,afterFine.aim.power);assert.equal(m.aim.yaw,afterFine.aim.yaw);assert.equal(m.aim.angle,afterFine.aim.angle);assert.equal(m.phase,'aim');assert.deepEqual(m.ammo,afterFine.ammo);
      await tap('[data-ammo-index="2"]');await tick(240);assert.equal(await page.locator('[data-ammo-index="2"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-game-input=angle]').isDisabled(),true);assert.match(await page.locator('[data-ammo-index="2"]').textContent(),/זמין/);await tap('[data-game-control=fire]');await tick(240);m=await snap();assert.equal(m.ball.ammo,2);assert.equal(m.ball.vy,0);assert.ok(m.cooldowns[2]>0);assert.match(await page.locator('[data-ammo-index="2"]').textContent(),/לא זמין: בטעינה/);await assertNoSelectionMenu('[data-game-control=fire]');await exit();
      await page.evaluate(()=>{const {engine}=window.__island,s=JSON.parse(engine.exportJSON());s.minigameProgress.navalDuel={stage:10,stars:[1,1,1,1,1,1,1,1,1,0]};if(!engine.importJSON(s).ok)throw Error('stage fixture');});await start('navalDuel',10);assert.equal((await snap()).enemies.filter(e=>e.active&&e.hp>0).length,3);await screenshot('navalDuel');await exit();
      // Default art plus configured GLB fallback; invalid optional bytes are 200,
      // so fallback is tested independently of missing-resource browser errors.
      await page.route('**/assets/g2e-optional.glb*',r=>r.fulfill({contentType:'model/gltf-binary',body:'invalid optional model'}));
      await page.evaluate(()=>{window.__island.data.config.minigames.alienDefense.models.player='assets/g2e-optional.glb';});await start('alienDefense');await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.artModels?.failed===1);assert.ok(await snap());await screenshot('alienDefense');await exit();
      await page.evaluate(()=>{window.__island.data.config.minigames.alienDefense.models.player='assets/kid-full.glb';});await start('alienDefense');await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.artModels?.loaded===1);assert.equal((await snap()).artModels.failed,0);await exit();
      await page.evaluate(()=>{window.__island.data.config.minigames.alienDefense.models.player=null;});
      assert.ok(jsonRequests.length>14);for(const url of jsonRequests)assert.equal(new URL(url).searchParams.get('v'),DATA_VERSION);
      assert.deepEqual(errors,[]);
      // Prove the same console-error guard observes a missing t(), as required.
      assert.equal(await page.evaluate(()=>window.__island.games.t('minigame.g2eMissingProbe')),'…');assert.deepEqual(errors.splice(0),['Missing translation: minigame.g2eMissingProbe']);
      assert.doesNotMatch(await page.locator('body').innerText(),/minigame\.[A-Za-z]/);reports.push({suite:'G2e',width,routes,longPress:true,nativeTriggerCancelled:true,angleScales:true,ammoIcons:4,optionalGlbFallback:true,optionalGlbLoaded:true,missingKeyGuard:true,jsonVersion:DATA_VERSION,shots,errors});
    }finally{await context.close();}
  }
  return reports;
}
