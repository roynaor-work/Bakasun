import assert from 'node:assert/strict';
import path from 'node:path';

// Uses a controlled browser clock, ordinary pointer input and the real game
// models. No test-only victory hook, result injection or shortened balance.
export async function checkActivity({browser,target,directory}) {
  const reports=[];
  const gameIds=['alienDefense','fireRescue','navalDuel'].filter(id=>!process.env.ISLAND_ACTIVITY_GAME||process.env.ISLAND_ACTIVITY_GAME===id);
  for(const width of [390,1440].filter(width=>!process.env.ISLAND_ACTIVITY_WIDTH||String(width)===process.env.ISLAND_ACTIVITY_WIDTH)) {
    const context=await browser.newContext({viewport:{width,height:width===390?844:900},hasTouch:true,deviceScaleFactor:1});
    const page=await context.newPage();page.setDefaultTimeout(30000);
    const errors=[],outside=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const root=new URL('.',target).href;
    page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(root))outside.push(r.url());});page.on('requestfailed',r=>failed.push(r.url()));
    const shots=[];
    async function shot(label){const name=`island-g2-${width}-${label}.png`;await page.screenshot({path:path.join(directory,name)});shots.push(name);}
    async function click(selector){const box=await page.locator(selector).boundingBox();assert.ok(box,selector);await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);}
    const cdp=await context.newCDPSession(page);
    async function touch(type,x,y){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});}
    async function gamePoint(x,y){return page.locator('.minigame-canvas').evaluate((canvas,{x,y})=>{
      const b=canvas.getBoundingClientRect(),c=window.__island.data.config.minigames,s=Math.min(b.width/c.width,b.height/c.height);
      return {x:b.x+(b.width-c.width*s)/2+x*s,y:b.y+(b.height-c.height*s)/2+y*s};
    },{x,y});}
    const camera=()=>page.evaluate(()=>{const v=window.__island.view;return {angle:v.angle,elevation:v.elevation,zoom:v.zoom,target:v.target.toArray()};});
    async function openGame(id) {
      await page.evaluate(()=>window.__island.games.menu());
      await click(`[data-game="${id}"] [data-action="game-play"]`);
      if(await page.locator('[data-action="game-understood"]').count()) {
        assert.equal(await page.locator('.game-help-lines p').count(),3);
        await click('[data-action="game-help-again"]');await click('[data-action="game-understood"]');
      }
      await page.clock.runFor(40);assert.equal(await page.locator('.minigame-canvas').count(),1);
      await page.waitForTimeout(40);await page.clock.runFor(40);
      assert.ok(await page.locator('.minigame-canvas').evaluate(canvas=>{
        const colors=new Set(),p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        for(let i=0;i<p.length;i+=64)colors.add(`${p[i]},${p[i+1]},${p[i+2]}`);return colors.size>4;
      }),'the canvas contains the real game artwork, not an empty layer');
      const targets=await page.locator('.game-screen button').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
      assert.ok(targets.every(b=>b.w>=56&&b.h>=56));
    }
    try {
      await page.clock.install();
      const shortcut=new URL(target);shortcut.searchParams.set('games','1');
      await page.goto(shortcut.href,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
      await click('[data-action="avatar-start"]');
      await page.locator('.game-cards').waitFor();assert.equal(await page.locator('.game-card').count(),3);
      await click('[data-action="close-modal"]');
      // Construction is covered by the existing G1 suite; this fixture uses the
      // real commands to leave the guide and construct a service-covered home.
      await page.evaluate(()=>{const {engine}=window.__island;engine.skipTutorial();engine.place('house',4,5);engine.place('fireStation',7,5);});
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
      // Track resources owned by sessions, including listeners registered with
      // an AbortSignal. Detached canvases must have no un-aborted listeners.
      await page.evaluate(()=>{
        window.__sessionSignals=[];const add=EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener=function(type,listener,options){if(options?.signal)window.__sessionSignals.push(options.signal);return add.call(this,type,listener,options);};
      });
      const startCamera=await camera(),results=[];
      for(const id of gameIds) {
        console.log(`activity ${width}: ${id}`);await openGame(id);await shot(id);
        if(id==='alienDefense') {
          let down=false;
          for(let i=0;i<500&&await page.locator('.minigame-canvas').count();i++) {
            const snapshot=await page.evaluate(()=>window.__island.games.current?.session.snapshot);
            if(!snapshot)break;
            const alien=snapshot.aliens.at(-1);const point=await gamePoint(alien?.x??180,440);
            await touch(down?'touchMove':'touchStart',point.x,point.y);down=true;await page.clock.runFor(250);
          }
          if(down)await touch('touchEnd');
        } else if(id==='fireRescue') {
          for(let i=0;i<100&&await page.locator('.minigame-canvas').count();i++) {
            const snapshot=await page.evaluate(()=>window.__island.games.current?.session.snapshot);if(!snapshot)break;
            const flame=snapshot.flames.find(f=>f.heat>0);if(!flame)break;
            const point=await gamePoint(flame.x,flame.y);await touch('touchStart',point.x,point.y);await page.clock.runFor(2300);await touch('touchEnd');await page.clock.runFor(1500);
          }
        } else {
          const force=await page.evaluate(()=>{
            const b=window.__island.data.config.minigames.navalDuel,a=b.defaultAngle*Math.PI/180,d=b.enemyX-b.shipX;
            const speed=Math.sqrt(b.gravity*d*d/(2*Math.cos(a)**2*(d*Math.tan(a)+b.muzzleRise)));
            return Math.round((speed-b.minSpeed)/(b.maxSpeed-b.minSpeed)*b.powerMaximum);
          });
          await page.locator('[data-game-input="power"]').evaluate((n,v)=>{n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));},force);
          for(let i=0;i<400&&await page.locator('.minigame-canvas').count();i++) {
            const phase=await page.evaluate(()=>window.__island.games.current?.session.snapshot.phase);
            if(phase==='aim')await click('[data-game-control="fire"]');await page.clock.runFor(250);
          }
        }
        await page.locator(`[data-result="${id}"]`).waitFor();await shot(`${id}-result`);
        assert.match(await page.locator('.game-result').textContent(),/ניקוד.*הרווחת/);
        results.push(await page.locator('.game-result').textContent());
        assert.equal(await page.locator('.minigame-canvas').count(),0);assert.equal(await page.evaluate(()=>window.__sessionSignals.every(s=>s.aborted)),true);
        await click('[data-action="game-exit"]');assert.deepEqual(await camera(),startCamera);
      }
      assert.equal(await page.evaluate(()=>Object.keys(window.__island.engine.state.highScores).length),gameIds.length);
      // Opening, help, cancellation and reopening must release all resources.
      for(let i=0;i<3;i++){await openGame('alienDefense');await click('[data-action="game-help"]');await click('[data-action="game-understood"]');await click('[data-action="game-exit"]');}
      assert.equal(await page.evaluate(()=>window.__sessionSignals.every(s=>s.aborted)),true);assert.deepEqual(await camera(),startCamera);
      // Each event is prepared through the registry. A warning must be visible
      // before the same event can become ready; a second cannot be prepared.
      for(const type of ['fire','aliens','ship']) {
        assert.equal(await page.evaluate(type=>window.__island.activity.prepare(type).ok,type),true);
        assert.equal(await page.evaluate(()=>window.__island.activity.prepare('ship').ok),false);
        await click('[data-action="toggle-event"]');assert.equal(await page.locator('[data-action="event-play"]').isDisabled(),true);
        if(type==='fire')assert.ok(await page.locator('.event-details').textContent().then(s=>s.includes('תוספת זמן ומים')));
        await page.evaluate(()=>window.__island.view.paused=true);await page.clock.runFor(await page.evaluate(()=>window.__island.data.config.events.warningMs+1000));await page.evaluate(()=>window.__island.view.paused=false);
        assert.equal(await page.locator('[data-action="event-play"]').isDisabled(),false);
        if(type==='fire') {
          const before=await page.evaluate(()=>window.__island.engine.state.buildings);
          await click('[data-action="event-play"]');
          if(await page.locator('[data-action="game-understood"]').count())await click('[data-action="game-understood"]');
          const seconds=await page.evaluate(()=>window.__island.games.current.session.snapshot.remaining);
          await page.clock.runFor((seconds+1)*1000);await page.locator('[data-result="fireRescue"]').waitFor();
          assert.deepEqual(await page.evaluate(()=>window.__island.engine.state.buildings),before);
          assert.equal(await page.evaluate(()=>window.__island.engine.state.events.active.phase),'ready');
          await click('[data-action="game-again"]');assert.equal(await page.locator('.minigame-canvas').count(),1);
          assert.equal(await page.evaluate(()=>window.__island.engine.state.events.active.phase),'playing');
          await click('[data-action="game-exit"]');await click('[data-action="toggle-event"]');
        }
        await click('[data-action="event-auto"]');assert.equal(await page.evaluate(()=>window.__island.engine.state.events.active),null);
      }
      const snapshot=await page.evaluate(()=>{window.__island.engine.save();const s=window.__island.engine.state;return {levels:s.minigameLevels,scores:s.highScores,seen:s.instructionsSeen,counts:s.events.counts};});
      await page.clock.resume();await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
      // The shareable games shortcut deliberately opens the menu on reload.
      // Close it through the same touch control before entering the parent gate.
      await page.locator('.game-cards').waitFor();await click('[data-action="close-modal"]');
      await page.evaluate(()=>window.__island.view.paused=true);
      assert.deepEqual(await page.evaluate(()=>{const s=window.__island.engine.state;return {levels:s.minigameLevels,scores:s.highScores,seen:s.instructionsSeen,counts:s.events.counts};}),snapshot);
      const parent=await page.locator('[data-action="parent"]').boundingBox();await page.mouse.move(parent.x+parent.width/2,parent.y+parent.height/2);await page.mouse.down();await page.waitForTimeout(await page.evaluate(()=>window.__island.data.config.ui.parentHoldMs+100));await page.mouse.up();
      await page.locator('[data-action="export"]').waitFor({state:'visible'});
      const [exported]=await Promise.all([page.waitForEvent('download'),click('[data-action="export"]')]);assert.match(exported.suggestedFilename(),/\.json$/);
      const raw=await page.evaluate(()=>window.__island.engine.exportJSON());await page.locator('#island-import').setInputFiles({name:'island-games.json',mimeType:'application/json',buffer:Buffer.from(raw)});
      assert.deepEqual(await page.evaluate(()=>window.__island.engine.state.highScores),snapshot.scores);
      assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(failed,[]);
      reports.push({width,results,screenshots:shots,errors,outside,failed});
    } catch(error){await shot('failure').catch(()=>{});console.error(JSON.stringify({width,errors,outside,failed},null,2));throw error;}
    finally {await context.close();}
  }return reports;
}
