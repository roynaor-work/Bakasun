import assert from 'node:assert/strict';
import path from 'node:path';
import {pilotInput} from '../helpers/island-pilot.mjs';

// Real pointer/slider input, unmodified game balance and a controlled browser clock.
export async function checkActivity({browser,target,directory}) {
  const reports=[];
  const ids=['alienDefense','fireRescue','navalDuel'].filter(id=>!process.env.ISLAND_ACTIVITY_GAME||id===process.env.ISLAND_ACTIVITY_GAME);
  for(const width of [360,390,1440].filter(w=>!process.env.ISLAND_ACTIVITY_WIDTH||String(w)===process.env.ISLAND_ACTIVITY_WIDTH)) {
    const context=await browser.newContext({viewport:{width,height:width===360?800:width===390?844:900},hasTouch:true,deviceScaleFactor:1});
    const page=await context.newPage();page.setDefaultTimeout(30000);
    const errors=[],outside=[],failed=[],shots=[],results=[],events=[];
    const root=new URL('.',target).href;
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(root))outside.push(r.url());});page.on('requestfailed',r=>failed.push(r.url()));
    const cdp=await context.newCDPSession(page);
    async function touch(type,point){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{...point,id:1}]});}
    async function click(selector){await page.locator(selector).click();}
    async function shot(label){const name=`island-g2b-${width}-${label}.png`;await page.screenshot({path:path.join(directory,name)});shots.push(name);}
    const camera=()=>page.evaluate(()=>{const v=window.__island.view;return {angle:v.angle,elevation:v.elevation,zoom:v.zoom,target:v.target.toArray()};});
    async function map(id,level) {
      await page.evaluate(()=>window.__island.games.menu());await click(`[data-game="${id}"] [data-action="game-play"]`);
      assert.equal(await page.locator('[data-action="stage-play"]').count(),10);
      assert.equal(await page.locator('[data-action="stage-play"]:disabled').count(),10-level);
      assert.ok(await page.locator('.stage-map').evaluate(n=>n.scrollWidth<=n.clientWidth));
      await shot(`${id}-map-${level}`);await click(`[data-action="stage-play"][data-stage="${level}"]`);
      if(await page.locator('[data-action="game-understood"]').count()){assert.equal(await page.locator('.game-help-lines p').count(),3);await click('[data-action="game-help-again"]');await click('[data-action="game-understood"]');}
      await page.clock.runFor(40);
      // ResizeObserver runs on the browser's rendering cycle, outside the fake clock.
      await page.waitForTimeout(60);await page.clock.runFor(80);
      assert.ok(await page.locator('.minigame-canvas').evaluate(canvas=>{
        const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
        for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return colors.size>4;
      }),'the game canvas renders its shapes after resize');
      assert.equal(await page.locator('.game-screen').getAttribute('data-stage'),String(level));
      assert.ok(await page.locator('.game-screen button').evaluateAll(nodes=>nodes.every(n=>{if(!n.getClientRects().length)return true;const b=n.getBoundingClientRect();return b.width>=56&&b.height>=56;})));
      assert.ok(await page.locator('.game-screen').evaluate(n=>n.scrollHeight<=n.clientHeight&&n.scrollWidth<=n.clientWidth));
      await shot(`${id}-stage-${level}`);
    }
    async function play(id,level) {
      const balance=await page.evaluate(id=>window.__island.data.config.minigames[id],id),memory={};let down=false;
      for(let i=0;i<4000&&await page.locator('.minigame-canvas').count();i++) {
        const m=await page.evaluate(()=>window.__island.games.current?.session.snapshot);if(!m)break;
        if(id==='alienDefense'&&m.aliens.some(a=>a.boss)&&!memory.bossShot){await shot('alienDefense-boss-10');memory.bossShot=true;}
        if(m.choosing){if(down){await touch('touchEnd');down=false;}await page.clock.runFor(200);await page.locator('[data-action=run-upgrade]').first().click();await page.clock.runFor(200);continue;}
        m.settings=balance.levels[level-1];memory.last={lives:m.lives,score:m.score,wave:m.wave,aliens:m.aliens?.length,remaining:m.remaining,water:m.water};const input=pilotInput(id,m,balance,memory);
        if(id==='navalDuel') {
          if(m.phase==='aim') {
            await page.locator('[data-game-input="power"]').evaluate((n,value)=>{n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));},input.power);
            await click('[data-game-control="fire"]');
          }
        }else if(input.firing) {
          const point=await page.locator('.minigame-canvas').evaluate((canvas,input)=>{
            const b=canvas.getBoundingClientRect(),c=window.__island.data.config.minigames,s=Math.min(b.width/c.width,b.height/c.height);
            return {x:b.x+(b.width-c.width*s)/2+input.x*s,y:b.y+(b.height-c.height*s)/2+(input.y??440)*s};
          },input);
          await touch(down?'touchMove':'touchStart',point);down=true;
        }else if(down){await touch('touchEnd');down=false;}
        if(id==='fireRescue'&&input.refill){const node=page.locator('[data-game-control=refill]');await node.focus();await page.keyboard.down(' ');}else if(id==='fireRescue')await page.keyboard.up(' ');
        await page.clock.runFor(40);
      }
      if(down)await touch('touchEnd');
      console.log(id,level,JSON.stringify(memory.last));
      await page.locator(`[data-result="${id}"]`).waitFor();
      const outcome=await page.locator('[data-result] h2').textContent()==='הצלחת!'?'win':'lose';
      if(level===1)assert.equal(outcome,'win',`${id} first stage at ${width}`);
      assert.match(await page.locator('.game-result').textContent(),/כוכבים בשלב/);
      const progress=await page.evaluate(id=>window.__island.engine.state.minigameProgress[id],id);assert.equal(progress.stars[level-1]>0,outcome==='win');
      if(level===1)assert.equal(progress.stage,2);
      assert.ok(await page.evaluate(()=>window.__sessionSignals.every(s=>s.aborted)));
      await shot(`${id}-result-${level}`);results.push({id,level,outcome,stars:progress.stars[level-1]});await click('[data-action="game-exit"]');
    }
    try {
      await page.clock.install();const url=new URL(target);url.searchParams.set('games','1');
      await page.goto(url.href,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
      await click('[data-action="avatar-start"]');await page.locator('.game-cards').waitFor();assert.equal(await page.locator('.game-card').count(),3);await click('[data-action="close-modal"]');
      await page.evaluate(()=>{const {engine}=window.__island;engine.skipTutorial();engine.place('house',4,5);engine.place('fireStation',7,5);engine.grantParts('general',5);engine.state.buildings.push({id:'e2e-harbor',typeId:'harbor',x:0,z:6,level:1});engine.save();});
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));
      await page.evaluate(()=>{window.__sessionSignals=[];const add=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,listener,options){if(options?.signal)window.__sessionSignals.push(options.signal);return add.call(this,type,listener,options);};});
      const originalCamera=await camera();
      for(const id of ids) {
        console.log(`G2b ${width}: ${id} stages 1 and 10`);
        // Use a repeatable session seed while retaining the actual canvas adapter.
        await page.evaluate(id=>{const e=window.__island.engine,g=e.registry.minigames.get(id);e.registry.minigames.set(id,{...g,start:ctx=>g.start({...ctx,random:(()=>{let v=12;return()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};})()})});},id);
        await map(id,1);await play(id,1);assert.deepEqual(await camera(),originalCamera);
        // Load an additive valid backup of completed earlier stages. No skip API.
        await page.evaluate(id=>{const e=window.__island.engine,save=JSON.parse(e.exportJSON());save.minigameProgress[id]={stage:10,stars:[3,3,3,3,3,3,3,3,3,0]};save.minigameLevels[id]=3;const r=e.importJSON(save);if(!r.ok)throw Error(r.reason);},id);
        await map(id,10);await play(id,10);assert.deepEqual(await camera(),originalCamera);
        // Help, exiting and reopening release every session-owned listener.
        await map(id,10);await click('[data-action="game-help"]');await click('[data-action="game-understood"]');
        const before=await page.evaluate(()=>{const s=window.__island.engine.state;return {money:s.money,progress:s.minigameProgress,wins:s.minigameWins,repairs:s.events.repairs};});
        await click('[data-action="game-exit"]');
        assert.deepEqual(await page.evaluate(()=>{const s=window.__island.engine.state;return {money:s.money,progress:s.minigameProgress,wins:s.minigameWins,repairs:s.events.repairs};}),before);
        assert.ok(await page.evaluate(()=>window.__sessionSignals.every(s=>s.aborted)));
      }
      for(const [type,id]of [['fire','fireRescue'],['aliens','alienDefense'],['ship','navalDuel']].filter(([,id])=>ids.includes(id))) {
        console.log(`G2b ${width}: automatic ${type}`);
        await page.evaluate(id=>{const e=window.__island.engine;e.state.instructionsSeen=e.state.instructionsSeen.filter(game=>game!==id);},id);
        assert.equal(await page.evaluate(type=>window.__island.activity.prepare(type).ok,type),true);
        await click('[data-action="toggle-event"]');assert.equal(await page.locator('[data-action="event-play"]').isDisabled(),true);
        if(type==='fire') {await click('[data-action="event-defer"]');assert.equal(await page.locator('[data-action="event-defer"]').isDisabled(),true);}
        // A dialog blocks automatic entry even after the countdown expires.
        await page.evaluate(()=>window.__island.games.menu());
        const until=await page.evaluate(()=>window.__island.engine.state.events.active.warningUntil-Date.now());await page.clock.fastForward(until+1000);
        assert.equal(await page.locator('.minigame-canvas').count(),0);await click('[data-action="close-modal"]');await page.clock.runFor(1100);await page.waitForTimeout(60);await page.clock.runFor(80);
        assert.equal(await page.locator('.game-screen').getAttribute('data-game'),id);assert.equal(await page.locator('.game-screen').getAttribute('data-stage'),'10');
        assert.equal(await page.evaluate(()=>window.__island.engine.state.events.active.phase),'playing');await shot(`auto-${type}`);
        const before=await page.evaluate(()=>{const s=window.__island.engine.state;return {money:s.money,progress:s.minigameProgress,wins:s.minigameWins,repairs:s.events.repairs};});
        await click('[data-action="game-exit"]');assert.equal(await page.evaluate(()=>window.__island.engine.state.events.active),null);
        assert.deepEqual(await page.evaluate(()=>{const s=window.__island.engine.state;return {money:s.money,progress:s.minigameProgress,wins:s.minigameWins,repairs:s.events.repairs};}),before);events.push(type);
      }
      const snapshot=await page.evaluate(()=>{window.__island.engine.save();const s=window.__island.engine.state;return {progress:s.minigameProgress,levels:s.minigameLevels,scores:s.highScores,counts:s.events.counts};});
      await page.clock.resume();await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.locator('.game-cards').waitFor();await click('[data-action="close-modal"]');
      assert.deepEqual(await page.evaluate(()=>{const s=window.__island.engine.state;return {progress:s.minigameProgress,levels:s.minigameLevels,scores:s.highScores,counts:s.events.counts};}),snapshot);
      const parent=await page.locator('[data-action="parent"]').boundingBox();await page.mouse.move(parent.x+parent.width/2,parent.y+parent.height/2);await page.mouse.down();await page.clock.runFor(await page.evaluate(()=>window.__island.data.config.ui.parentHoldMs+100));await page.mouse.up();
      await page.locator('[data-action="export"]').waitFor({state:'visible'});
      const [download]=await Promise.all([page.waitForEvent('download'),click('[data-action="export"]')]);assert.match(download.suggestedFilename(),/\.json$/);
      const raw=await page.evaluate(()=>window.__island.engine.exportJSON());await page.locator('#island-import').setInputFiles({name:'stages.json',mimeType:'application/json',buffer:Buffer.from(raw)});
      assert.deepEqual(await page.evaluate(()=>window.__island.engine.state.minigameProgress),snapshot.progress);
      assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(failed,[]);
      reports.push({width,results,events,screenshots:shots,errors,outside,failed});
    }catch(error){await shot('failure').catch(()=>{});console.error(JSON.stringify({width,errors,outside,failed}));throw error;}
    finally{await context.close();}
  }return reports;
}
