import assert from 'node:assert/strict';
import path from 'node:path';
import {pilotInput} from '../helpers/island-pilot.mjs';

export async function checkG2d({browser,target,directory}){
  const reports=[];
  for(const width of [360,390]){
    const context=await browser.newContext({viewport:{width,height:width===360?740:844},hasTouch:true,deviceScaleFactor:1});
    const page=await context.newPage(),errors=[],outside=[],failed=[],screenshots=[],games=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const root=new URL('.',target).href;page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(root))outside.push(r.url());});page.on('requestfailed',r=>failed.push(r.url()));
    const cdp=await context.newCDPSession(page),tick=ms=>page.clock.runFor(ms),snapshot=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot);
    const tap=s=>page.locator(s).tap();
    async function point(x,y){return page.locator('.minigame-canvas').evaluate((canvas,{x,y})=>{const r=canvas.getBoundingClientRect(),c=window.__island.data.config.minigames,s=Math.min(r.width/c.width,r.height/c.height);return {x:r.x+(r.width-c.width*s)/2+x*s,y:r.y+(r.height-c.height*s)/2+y*s};},{x,y});}
    async function touch(type,p){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{...p,id:1}]});}
    async function shot(id){const name=`${width}-${id}.png`;await page.screenshot({path:path.join(directory,name)});screenshots.push(name);}
    async function start(id,stage=1){await page.evaluate(({id,stage})=>window.__island.games.start(id,undefined,stage),{id,stage});if(await page.locator('[data-action=game-understood]').count())await tap('[data-action=game-understood]');await page.waitForTimeout(60);await tick(120);}
    async function layout(){assert.ok(await page.locator('.game-screen').evaluate(n=>n.scrollWidth===n.clientWidth&&n.scrollHeight===n.clientHeight));assert.ok(await page.locator('.game-screen button').evaluateAll(nodes=>nodes.every(n=>!n.getClientRects().length||(n.getBoundingClientRect().width>=56&&n.getBoundingClientRect().height>=56))));}
    async function exit(){await tap('[data-action=game-exit]');assert.equal(await page.evaluate(()=>window.__island.engine.isMinigameActive()),false);assert.equal(await page.locator('.minigame-canvas').count(),0);}
    try{
      await page.clock.install();await page.goto(target,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await tap('[data-action=avatar-start]');
      await page.evaluate(()=>{const {engine,data}=window.__island;engine.skipTutorial();data.featureFlags.events=false;const s=JSON.parse(engine.exportJSON());s.money=5000;s.minigameProgress.alienDefense={stage:4,stars:[3,3,3,0,0,0,0,0,0,0]};if(!engine.importJSON(s).ok)throw Error('fixture');for(const [id,key]of [['alienDefense','weapon'],['fireRescue','hose'],['navalDuel','hull']])if(!window.__island.activity.upgrade(id,key).ok)throw Error('purchase');});
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
      console.log(`G2d ${width}: naval angle-only gestures, ammo, Three.js and fallback`);
      await start('navalDuel');await layout();let initial=await snapshot();assert.equal(initial.renderMode,'three');
      const p=await point(150,220);await touch('touchStart',p);await tick(80);assert.equal((await snapshot()).phase,'aim');await touch('touchMove',{x:p.x+25,y:p.y-20});await tick(80);await touch('touchEnd');let m=await snapshot();assert.notEqual(m.aim.angle,initial.aim.angle);assert.equal(m.aim.power,initial.aim.power);assert.deepEqual(m.ammo,initial.ammo);
      const slider=page.locator('[data-game-input=power]');await slider.focus();await page.keyboard.press('End');await tick(40);assert.equal((await snapshot()).aim.power,100);assert.equal((await snapshot()).phase,'aim');
      await tap('[data-ammo-index="2"]');await tick(80);assert.equal((await snapshot()).ammoIndex,2);await tap('[data-game-control=fire]');await tick(120);m=await snapshot();assert.equal(m.phase,'shot');assert.equal(m.ball.ammo,2);assert.equal(m.ammo[2],initial.ammo[2]-1);assert.ok(m.cooldowns[2]>0);await shot('navalDuel');
      // Fault injection into quality thresholds exercises automatic fallback without changing physics.
      await page.evaluate(()=>{const c=window.__island.data.config.minigames,r=c.navalDuel.render;window.__g2dQualityConfig=[c.qualitySampleFrames,c.slowFrameMs,r.fallbackSampleFrames,r.fallbackFrameMs];c.qualitySampleFrames=4;c.slowFrameMs=0;r.fallbackSampleFrames=4;r.fallbackFrameMs=0;});await tick(32);assert.equal((await snapshot()).renderMode,'three','first reduce resolution and allow another sample window');await tick(100);assert.equal((await snapshot()).renderMode,'perspective');await page.evaluate(()=>{const c=window.__island.data.config.minigames,r=c.navalDuel.render;[c.qualitySampleFrames,c.slowFrameMs,r.fallbackSampleFrames,r.fallbackFrameMs]=window.__g2dQualityConfig;});await layout();await exit();games.push({id:'navalDuel',angleOnly:true,powerSeparate:true,explicitFire:true,ammoSlots:4,three:true,forcedSlowFrameFallback:true});
      console.log(`G2d ${width}: aliens, companions and a real between-wave choice`);
      await start('alienDefense',4);await layout();m=await snapshot();assert.equal(m.wings.filter(w=>w.active).length,1);const b=await page.evaluate(()=>window.__island.data.config.minigames.alienDefense),memory={};let down=false;
      for(let i=0;i<700;i++){
        m=await snapshot();assert.ok(m,'session remains open until upgrade');if(m.choosing)break;if(i===25)await shot('alienDefense');const input=pilotInput('alienDefense',{...m,settings:b.levels[3]},b,memory),p=await point(input.x,440);await touch(down?'touchMove':'touchStart',p);down=true;await tick(80);
      }
      if(down)await touch('touchEnd');m=await snapshot();assert.equal(m.choosing,true);await tick(180);assert.equal(await page.locator('[data-action=run-upgrade]').count(),3);const paused=m.time;await tick(1000);assert.equal((await snapshot()).time,paused);await layout();const selected=m.choices[0],wave=m.wave;await page.locator('[data-action=run-upgrade]').first().tap();await tick(80);m=await snapshot();assert.equal(m.wave,wave+1);assert.equal(m.upgrades[selected],1);assert.equal(m.choosing,false);await exit();games.push({id:'alienDefense',wing:true,threeChoices:true,combatPausedDuringChoice:true,selected,waveResumed:true});
      console.log(`G2d ${width}: fire crew, hose, spray, refill and rescue`);
      await start('fireRescue');await layout();m=await snapshot();const water=m.water,f=m.flames[0],targetPoint=await point(f.x,f.y);await touch('touchStart',targetPoint);await tick(320);m=await snapshot();assert.equal(m.spraying,true);assert.ok(m.water<water);assert.ok(m.flames[0].heat<f.heat);assert.equal(m.extraHose,1);await shot('fireRescue');await touch('touchEnd');
      const dry=m.water;await tick(200);assert.equal((await snapshot()).water,dry);await page.locator('[data-game-control=refill]').focus();await page.keyboard.down(' ');await tick(400);await page.keyboard.up(' ');assert.ok((await snapshot()).water>dry);
      m=await snapshot();const rescuePoint=await point(m.rescue.x,m.rescue.y);await touch('touchStart',rescuePoint);await tick(1400);await touch('touchEnd');assert.equal((await snapshot()).rescue.rescued,true);await exit();games.push({id:'fireRescue',crewAndHose:true,extraHosePurchased:true,spray:true,explicitRefill:true,rescue:true});
      const equipment=await page.evaluate(()=>window.__island.engine.state.minigameEquipment);await page.clock.resume();await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);assert.deepEqual(await page.evaluate(()=>window.__island.engine.state.minigameEquipment),equipment);
      assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.deepEqual(failed,[]);reports.push({suite:'G2d',width,games,screenshots,errors,outside,failed});
    }finally{await context.close();}
  }
  return reports;
}
