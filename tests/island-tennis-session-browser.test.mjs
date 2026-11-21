import assert from 'node:assert/strict';
import test from 'node:test';
import {serveIsland,islandChromium} from './helpers/island-browser.mjs';

// Opt-in browser test of the REAL tennis session (HUD, touch controls, hit bar) played through tools/tennis-session.html:
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/google-chrome node --test tests/island-tennis-session-browser.test.mjs
// It serves in an ordinary match and proves, with the frame frozen, that the hit bar is on screen for the opponent's return (every incoming ball,
// not only while the button is held) and is big. Then, by version:
//  - default (v15 return meter, config.v9.returnMeter): the needle starts low, sweeps up by itself and is in the green when the ball arrives;
//  - ?tennisReturn=v14: the needle waits low and fills while the button is held.
test('tennis session in the browser: the hit bar is up for a return shot; the needle sweeps into the green (v15) or fills while held (?tennisReturn=v14)',
  {skip:process.env.ISLAND_CSP_BROWSER!=='1',timeout:900000},async t=>{
  const server=await serveIsland(),chromium=await islandChromium();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  // One served point up to the frozen frame of the opponent's return; `then` checks what the needle does from there.
  const point=async(query,then)=>{
    const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await context.newPage();
    try{
    // The simulation clock is the frame's timestamp. On software WebGL a frame of the default venue (v12 stadium, 3D crowd) takes 200-500 ms,
    // the session clamps that to simulation.maxDelta (0.25 s), and a quarter-second step can jump over the moment this test waits for (the first
    // frames of the opponent's return, eta > 1.2 s): the point is then lost and the wait never ends. Every frame is therefore handed a clock that
    // advances a steady 20 ms (below render.slowFrameMs, so the quality governor is not pushed either): the same play, just slower on a slow machine.
    await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.__gate={frozen:false,when:null,pending:[],real:-1,now:1000};
      const stamp=t=>{const g=window.__gate;if(t!==g.real){g.real=t;g.now+=20;}return g.now;};
      // conditions are named functions: the island CSP forbids eval, so no function is built from a string
      const model=()=>window.__ts.model.getState();
      const incoming=eta=>()=>{const s=model();return s.phase==='rally'&&s.contact&&s.contact.side===0&&s.shot&&s.shot.side===1&&s.contact.eta>eta;};
      // `incoming` holds for a second frame: the bar of a frame is computed before that frame's opponent hit, so the hit frame itself still shows the previous state
      window.__conds={serveGreen:()=>()=>{const s=model();return s.phase==='toss'&&s.serveZone==='green';},incoming:eta=>{const test=incoming(eta);let frames=0;return ()=>test()&&++frames>=2;},charge:c=>()=>model().charge>=c,
        needleGreen:()=>()=>{const s=model();return s.phase!=='rally'||s.hitMeter?.active&&s.hitMeter.zone==='green';}};
      window.requestAnimationFrame=cb=>raf(real=>{const g=window.__gate,t=stamp(real);if(g.frozen){g.pending.push(()=>cb(t));return;}cb(t);if(g.when&&g.when()){g.frozen=true;g.when=null;}});});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${server.url}tools/tennis-session.html?dev=1${query}`);await page.waitForFunction(()=>window.__tsReady,null,{timeout:120000});await page.waitForTimeout(2000);
    const press=(id,type)=>page.evaluate(([id,type])=>{const n=document.getElementById(id),r=n.getBoundingClientRect();n.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,button:0,buttons:type==='pointerup'?0:1}));},[id,type]);
    const freezeWhen=async(name,arg)=>{await page.evaluate(([n,a])=>{window.__gate.when=window.__conds[n](a);},[name,arg]);await page.waitForFunction(()=>window.__gate.frozen,null,{timeout:240000,polling:20});};
    const resume=()=>page.evaluate(()=>{const g=window.__gate;g.frozen=false;g.pending.splice(0).forEach(f=>f());});
    const bar=()=>page.evaluate(()=>{const m=document.querySelector('.tennis-serve-meter'),r=m.getBoundingClientRect(),s=window.__ts.model.getState();return {hidden:m.hidden,mode:m.dataset.mode,w:r.width,h:r.height,sweep:Boolean(s.hitMeter?.sweep),zone:s.hitMeter?.zone,value:s.hitMeter?.value,greenHalf:s.hitMeter?.greenHalf,charge:s.charge,phase:s.phase,eta:s.contact?.eta??null,onScreen:r.x>=0&&r.y>=0&&r.x+r.width<=innerWidth&&r.y+r.height<=innerHeight};});
    // serve
    await press('pass','pointerdown');await press('pass','pointerup');
    await freezeWhen('serveGreen');await resume();await press('pass','pointerdown');await press('pass','pointerup');
    // the opponent's return comes: the bar is up although nothing is pressed
    await freezeWhen('incoming',1.2);
    const idle=await bar();
    assert.equal(idle.hidden,false,'the bar is on screen for an incoming ball');assert.equal(idle.mode,'hit');assert.ok(idle.h>=100&&idle.w>=14,`big enough: ${idle.w}x${idle.h}`);assert.ok(idle.onScreen,'inside the screen');
    await then({idle,bar,press,freezeWhen,resume});
    assert.deepEqual(errors,[]);
    }finally{await context.close();}
  };
  try{
    await t.test('default: the v15 needle sweeps by itself and is in the green when the ball arrives',()=>point('',async({idle,bar,freezeWhen,resume})=>{
      assert.equal(idle.sweep,true,'the v15 return meter is on');assert.ok(idle.value<.3,`the needle has just left the bottom: ${idle.value}`);
      await resume();await freezeWhen('needleGreen');
      const green=await bar();
      assert.equal(green.phase,'rally','the needle reached the green during the rally');assert.equal(green.zone,'green');assert.equal(green.hidden,false);assert.equal(green.charge,0,'nothing is held: the needle moved by itself');
      assert.ok(green.value>idle.value+.2&&Math.abs(green.value-.5)<=green.greenHalf+1e-9,`the needle rose into the middle band (${idle.value} -> ${green.value})`);
      assert.ok(green.eta<idle.eta&&green.eta>-.3&&green.eta<.6,`the green comes as the ball arrives (eta ${green.eta})`);
    }));
    await t.test('?tennisReturn=v14: the needle waits low and fills while the button is held',()=>point('&tennisReturn=v14',async({idle,bar,press,freezeWhen,resume})=>{
      assert.equal(idle.sweep,false);assert.ok(idle.value<.3,'the needle waits low, the player fills it');
      await resume();await press('shoot','pointerdown');
      await freezeWhen('charge',.3);
      const filled=await bar();
      assert.ok(filled.value>idle.value+.2,`the needle rises while the button is held (${idle.value} -> ${filled.value})`);assert.equal(filled.zone,'green','a third of the way up is already in the green');
      await resume();await press('shoot','pointerup');
    }));
  }finally{await browser.close();await server.close();}
});
