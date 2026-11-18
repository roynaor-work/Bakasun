import assert from 'node:assert/strict';
import test from 'node:test';
import {serveIsland,islandChromium} from './helpers/island-browser.mjs';

// Opt-in browser test of the REAL tennis session (HUD, touch controls, hit bar) played through tools/tennis-session.html:
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/google-chrome node --test tests/island-tennis-session-browser.test.mjs
// It serves a return shot in an ordinary match and proves, with the frame frozen, that the hit bar is on screen (every incoming ball, not only
// while the button is held), is big, fills while the button is held, and has a green zone in the middle.
test('tennis session in the browser: the hit bar is up for a return shot, fills while held and reaches the green',
  {skip:process.env.ISLAND_CSP_BROWSER!=='1',timeout:300000},async()=>{
  const server=await serveIsland(),chromium=await islandChromium();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await context.newPage();
    await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.__gate={frozen:false,when:null,pending:[]};
      // conditions are named functions: the island CSP forbids eval, so no function is built from a string
      const model=()=>window.__ts.model.getState();
      window.__conds={serveGreen:()=>()=>{const s=model();return s.phase==='toss'&&s.serveZone==='green';},incoming:eta=>()=>{const s=model();return s.phase==='rally'&&s.contact&&s.contact.side===0&&s.shot&&s.shot.side===1&&s.contact.eta>eta;},charge:c=>()=>model().charge>=c};
      window.requestAnimationFrame=cb=>raf(t=>{const g=window.__gate;if(g.frozen){g.pending.push(()=>cb(t));return;}cb(t);if(g.when&&g.when()){g.frozen=true;g.when=null;}});});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${server.url}tools/tennis-session.html?dev=1`);await page.waitForFunction(()=>window.__tsReady,null,{timeout:120000});await page.waitForTimeout(2000);
    const press=(id,type)=>page.evaluate(([id,type])=>{const n=document.getElementById(id),r=n.getBoundingClientRect();n.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,button:0,buttons:type==='pointerup'?0:1}));},[id,type]);
    const freezeWhen=async(name,arg)=>{await page.evaluate(([n,a])=>{window.__gate.when=window.__conds[n](a);},[name,arg]);await page.waitForFunction(()=>window.__gate.frozen,null,{timeout:120000,polling:20});};
    const resume=()=>page.evaluate(()=>{const g=window.__gate;g.frozen=false;g.pending.splice(0).forEach(f=>f());});
    const bar=()=>page.evaluate(()=>{const m=document.querySelector('.tennis-serve-meter'),r=m.getBoundingClientRect(),s=window.__ts.model.getState();return {hidden:m.hidden,mode:m.dataset.mode,w:r.width,h:r.height,zone:s.hitMeter?.zone,value:s.hitMeter?.value,greenHalf:s.hitMeter?.greenHalf,charge:s.charge,onScreen:r.x>=0&&r.y>=0&&r.x+r.width<=innerWidth&&r.y+r.height<=innerHeight};});
    // serve
    await press('pass','pointerdown');await press('pass','pointerup');
    await freezeWhen('serveGreen');await resume();await press('pass','pointerdown');await press('pass','pointerup');
    // the opponent's return comes: the bar is up although nothing is pressed
    await freezeWhen('incoming',1.2);
    const idle=await bar();
    assert.equal(idle.hidden,false,'the bar is on screen for an incoming ball');assert.equal(idle.mode,'hit');assert.ok(idle.h>=100&&idle.w>=14,`big enough: ${idle.w}x${idle.h}`);assert.ok(idle.onScreen,'inside the screen');
    assert.ok(idle.value<.3,'the needle waits low, the player fills it');
    await resume();await press('shoot','pointerdown');
    await freezeWhen('charge',.3);
    const filled=await bar();
    assert.ok(filled.value>idle.value+.2,`the needle rises while the button is held (${idle.value} -> ${filled.value})`);assert.equal(filled.zone,'green','a third of the way up is already in the green');
    await resume();await press('shoot','pointerup');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await server.close();}
});
