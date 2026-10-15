import assert from 'node:assert/strict';
import path from 'node:path';

/** G2c: real touch/keyboard controls and purchased equipment at phone sizes.
 * Only the initial city fixture uses the engine; no model/result is replaced. */
export async function checkG2c({browser,target,directory}){
  const reports=[];
  for(const width of [360,390]){
    const context=await browser.newContext({viewport:{width,height:width===360?740:844},hasTouch:true,deviceScaleFactor:1});
    const page=await context.newPage(),errors=[],outside=[],failed=[],screenshots=[],games=[];page.setDefaultTimeout(30000);
    const root=new URL('.',target).href;
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(root))outside.push(r.url());});page.on('requestfailed',r=>failed.push(r.url()));
    const cdp=await context.newCDPSession(page);
    const tap=selector=>page.locator(selector).tap();
    async function touch(type,x,y){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});}
    async function point(x,y){return page.locator('.minigame-canvas').evaluate((c,{x,y})=>{const r=c.getBoundingClientRect(),b=window.__island.data.config.minigames,s=Math.min(r.width/b.width,r.height/b.height);return {x:r.x+(r.width-b.width*s)/2+x*s,y:r.y+(r.height-b.height*s)/2+y*s};},{x,y});}
    async function shot(label){const name=`island-g2c-${width}-${label}.png`;await page.screenshot({path:path.join(directory,name)});screenshots.push(name);}
    const snapshot=()=>page.evaluate(()=>window.__island.games.current.session.snapshot);
    const tick=ms=>page.clock.runFor(ms);
    try{
      await page.clock.install();await page.goto(target,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await tap('[data-action="avatar-start"]');
      await page.evaluate(()=>{const {engine,data}=window.__island;engine.skipTutorial();data.featureFlags.events=false;const save=JSON.parse(engine.exportJSON());save.money=3000;const r=engine.importJSON(save);if(!r.ok)throw Error(r.reason);});
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
      for(const [id,track]of [['alienDefense','damage'],['fireRescue','pressure'],['navalDuel','ammo']]){
        console.log(`G2c ${width}: ${id} purchase, controls, exit`);
        await page.evaluate(()=>window.__island.games.menu());await tap(`[data-game="${id}"] [data-action="equipment-shop"]`);
        const money=await page.evaluate(()=>window.__island.engine.state.money);await tap(`[data-track="${track}"]`);
        assert.equal(await page.evaluate(({id,track})=>window.__island.engine.state.minigameEquipment[id][track],{id,track}),1);
        assert.ok(await page.evaluate(()=>window.__island.engine.state.money)<money);await shot(`${id}-equipment`);
        await tap('[data-action="equipment-play"]');await tap('[data-stage="1"]');
        if(await page.locator('[data-action="game-understood"]').count())await tap('[data-action="game-understood"]');
        await page.waitForTimeout(80);await tick(120);
        assert.ok(await page.locator('.game-screen').evaluate(n=>n.scrollWidth===n.clientWidth&&n.scrollHeight===n.clientHeight));
        assert.ok(await page.locator('.game-screen button').evaluateAll(nodes=>nodes.every(n=>{if(!n.getClientRects().length)return true;const r=n.getBoundingClientRect();return r.width>=56&&r.height>=56;})));
        if(id==='alienDefense'){
          const initial=await snapshot(),p=await point(initial.aliens[0].x,initial.aliens[0].y);await touch('touchStart',p.x,p.y);await tick(80);await touch('touchEnd');
          await tap('[data-game-control="nova"]');await tick(400);let m=await snapshot();assert.equal(m.novaCharges,initial.novaCharges-1);assert.ok(m.nova.life>0);assert.ok(m.score>0);
          await page.locator('[data-game-control="fire"]').focus();await page.keyboard.down(' ');await tick(240);await page.keyboard.up(' ');m=await snapshot();assert.ok(m.shots.length>0);await shot(`${id}-nova`);
          const x=m.player.x;await page.locator('[data-game-control="left"]').focus();await page.keyboard.down(' ');await tick(80);await page.keyboard.up(' ');assert.ok((await snapshot()).player.x<x);
          // Help pauses both timers and input; resume reuses the same session.
          await tap('[data-action="game-help"]');const paused=(await snapshot()).time;await tick(1000);assert.equal((await snapshot()).time,paused);await tap('[data-action="game-understood"]');
        }else if(id==='fireRescue'){
          let m=await snapshot(),water=m.water,heat=m.flames[0].heat;const p=await point(m.flames[0].x,m.flames[0].y);
          await touch('touchStart',p.x,p.y);await tick(320);m=await snapshot();assert.equal(m.spraying,true);assert.ok(m.flames[0].heat<heat);assert.ok(m.water<water);await shot(`${id}-water`);await touch('touchEnd');
          const dry=m.water;await page.locator('[data-game-control="refill"]').focus();await page.keyboard.down(' ');await tick(260);await page.keyboard.up(' ');assert.ok((await snapshot()).water>dry);
          await page.locator('[data-game-control="charge"]').focus();await page.keyboard.down(' ');await tick(1300);await page.keyboard.up(' ');assert.equal((await snapshot()).charge,1);await shot(`${id}-charged`);
        }else{
          let m=await snapshot();assert.ok(m.enemyFleetHp>0);await tap('[data-ammo-index="1"]');await tick(80);m=await snapshot();assert.equal(m.ammoIndex,1);
          const slider=page.locator('[data-game-input="power"]');await slider.focus();await page.keyboard.press('Home');const forward=await slider.evaluate(n=>getComputedStyle(n).direction==='rtl'?'ArrowLeft':'ArrowRight');for(let step=0;step<27;step++)await page.keyboard.press(forward);assert.equal(await slider.inputValue(),'27');
          await tap('[data-game-control="fire"]');await tick(250);m=await snapshot();assert.equal(m.ball.ammo,1);assert.equal(m.ammo[1],3);assert.equal(m.phase,'shot');assert.equal(await page.locator('.game-gauge progress').count(),2);await shot(`${id}-salvo`);
          // Wait for real physics to alter HP and the fleet meter, without editing a model.
          await tick(3000);m=await snapshot();assert.ok(m.enemyLives<m.enemyShip.maxHp);assert.ok(await page.locator('.game-gauge progress').nth(1).evaluate(n=>n.value<1));
        }
        const before=await page.evaluate(()=>{const s=window.__island.engine.state;return {equipment:s.minigameEquipment,stars:s.minigameProgress,money:s.money,buildings:s.buildings};});
        await tap('[data-action="game-exit"]');assert.equal(await page.locator('.minigame-canvas').count(),0);assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);
        assert.deepEqual(await page.evaluate(()=>{const s=window.__island.engine.state;return {equipment:s.minigameEquipment,stars:s.minigameProgress,money:s.money,buildings:s.buildings};}),before);
        games.push({id,purchased:track,controls:true,exit:true});
      }
      const equipment=await page.evaluate(()=>window.__island.engine.state.minigameEquipment);await page.clock.resume();await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);assert.deepEqual(await page.evaluate(()=>window.__island.engine.state.minigameEquipment),equipment);
      assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(failed,[]);reports.push({suite:'G2c',width,games,screenshots,errors,outside,failed});
    }catch(e){await shot('failure').catch(()=>{});console.error({width,errors,outside,failed});throw e;}
    finally{await context.close();}
  }return reports;
}
