import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {waitForGameStart,waitForGameNavigation,prepareGameBuildings} from './shell-ready.mjs?v=island-naval-aim-20261027-1';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=fileURLToPath(new URL('../verification/g8b/',import.meta.url));await mkdir(directory,{recursive:true});
const target=process.env.ISLAND_URL||'http://127.0.0.1:8765/workout/island/?dev=1';
const viewports=process.env.G8B_WIDTH?[{width:Number(process.env.G8B_WIDTH),height:Number(process.env.G8B_HEIGHT)||390}]:[{width:844,height:390},{width:740,height:360}];
const ids=['soccer','tennis','navalDuel','fireRescue','alienDefense'],report={browser:null,physicalPhone:false,reports:[]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});report.browser=browser.version();
// Capture every computed CSS property, both pseudo-elements and the actual
// bounding rect. Include hidden controls so resume cannot accidentally reveal one.
async function appearance(page){return page.evaluate(()=>{
 const css=(node,pseudo)=>{const s=getComputedStyle(node,pseudo);return Object.fromEntries(Array.from(s,key=>[key,s.getPropertyValue(key)]));};
 return [...document.querySelectorAll('.game-controls,.game-controls *,.game-header [data-action=game-pause],.game-header [data-action=game-pause] *')].map(node=>({
  tag:node.tagName,id:node.id,action:node.dataset.gameControl||node.dataset.action||'',rect:node.getBoundingClientRect().toJSON(),style:css(node),before:css(node,'::before'),after:css(node,'::after')
 }));
});}
try{for(const viewport of viewports){
 const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});context.setDefaultTimeout(240000);const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;});
 const tick=ms=>page.clock.runFor(ms),tap=s=>page.locator(s).tap();
 try{
  await page.clock.install({time:new Date('2026-10-20T08:00:00Z')});await page.goto(target,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(new Date('2026-10-20T09:00:00Z'));await tap('[data-action=avatar-start]');await tick(32);
  await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;for(const id of ['navalDuel','fireRescue','alienDefense'])data.config.minigames[id].render.fallbackFrameMs=10000;data.config.minigames.soccer.view.slowFrameMs=10000;});await prepareGameBuildings(page);
  for(const id of ids){
   await page.evaluate(id=>window.__island.games.start(id,undefined,1),id);if(await page.locator('[data-action=game-understood]').count()){await tick(32);await tap('[data-action=game-understood]');}await waitForGameStart(page);await waitForGameNavigation(page);await tick(100);
   await page.waitForLoadState('networkidle');await page.locator('.minigame-canvas').focus();
   // Native CSS animations use the browser timeline, outside page.clock. Hold
   // their current phase so the equality check measures pause/resume alone.
   await page.evaluate(async()=>{const animations=[...document.querySelectorAll('.game-controls,.game-header')].flatMap(root=>root.getAnimations({subtree:true}));for(const animation of animations)animation.pause();await Promise.all(animations.map(animation=>animation.ready));for(const animation of animations)animation.currentTime=0;});
   const before=await appearance(page),header=await page.locator('[data-action=game-pause]').innerHTML();assert.ok(before.some(n=>n.action==='fire'||n.id==='shoot'));
   let pausedShot,resumedShot;
   for(let cycle=0;cycle<3;cycle++){
    await tap('[data-action=game-pause]');assert.equal(await page.locator('.game-controls').evaluate(n=>n.inert),true);
    assert.equal(await page.locator('.game-controls button:visible,.game-controls #joystick:visible,.game-header button:visible').count(),0,'game controls completely hidden');
    const layout=await page.locator('.game-pause-actions button').evaluateAll(nodes=>nodes.map(n=>({action:n.dataset.action,rect:n.getBoundingClientRect().toJSON(),text:n.innerText,label:n.getAttribute('aria-label'),background:getComputedStyle(n).backgroundColor,icons:n.querySelectorAll('svg').length})));
    assert.deepEqual(layout.map(n=>n.action),['game-resume','game-pause-sound','game-exit']);for(const n of layout){assert.equal(n.text,'');assert.ok(n.label);assert.equal(n.icons,1);assert.ok(n.rect.width>=64&&n.rect.height>=64);assert.ok(n.rect.x>=0&&n.rect.y>=0&&n.rect.right<=viewport.width&&n.rect.bottom<=viewport.height);}
    assert.deepEqual(await page.locator('.game-pause-actions button svg').evaluateAll(nodes=>nodes.map(n=>[getComputedStyle(n).width,getComputedStyle(n).height])),[['48px','48px'],['32px','32px'],['32px','32px']]);
    assert.ok(layout[0].rect.width>layout[1].rect.width&&layout[0].rect.height>layout[1].rect.height);assert.equal(layout[1].rect.y,layout[2].rect.y);
    const green=layout[0].background.match(/\d+/g).map(Number),red=layout[2].background.match(/\d+/g).map(Number);assert.ok(green[1]>green[0]&&green[1]>green[2]);assert.ok(red[0]>red[1]&&red[0]>red[2]);
    const row=[...layout].sort((a,b)=>a.rect.x-b.rect.x);for(let i=0;i<row.length;i++){assert.ok(Math.abs(row[i].rect.y+row[i].rect.height/2-viewport.height/2)<=1);if(i)assert.ok(row[i-1].rect.right<row[i].rect.left);}
    const centered=await page.locator('.game-pause-card').boundingBox();assert.ok(Math.abs(centered.x+centered.width/2-viewport.width/2)<=1);assert.ok(Math.abs(centered.y+centered.height/2-viewport.height/2)<=1);
    const mute=page.locator('[data-action=game-pause-sound]'),path=await mute.locator('path').getAttribute('d'),muted=await mute.getAttribute('aria-pressed');
    await tap('[data-action=game-pause-sound]');assert.notEqual(await mute.locator('path').getAttribute('d'),path);assert.notEqual(await mute.getAttribute('aria-pressed'),muted);
    await tap('[data-action=game-pause-sound]');assert.equal(await mute.locator('path').getAttribute('d'),path);
    if(cycle===0)pausedShot=await page.screenshot();
    await tap('[data-action=game-resume]');assert.equal(await page.locator('.game-controls').evaluate(n=>n.inert),false);
    assert.deepEqual(await appearance(page),before,`${id} ${viewport.width}: rects and all computed styles after cycle ${cycle+1}`);
    assert.equal(await page.locator('[data-action=game-pause]').innerHTML(),header,'game-owned pause icon preserved');
    if(cycle===0)resumedShot=await page.screenshot();
   }
   // One image per game/viewport: paused on the left, resumed on the right.
   const shot=`${id}-${viewport.width}-pause-resume.webp`;
   const combined=await page.evaluate(async({paused,resumed,width,height})=>{
    const bitmap=async data=>createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'}));
    const [left,right]=await Promise.all([bitmap(paused),bitmap(resumed)]),canvas=new OffscreenCanvas(width*2,height),ctx=canvas.getContext('2d');ctx.drawImage(left,0,0);ctx.drawImage(right,width,0);left.close();right.close();
    const blob=await canvas.convertToBlob({type:'image/webp',quality:.88});return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
   },{paused:pausedShot.toString('base64'),resumed:resumedShot.toString('base64'),...viewport});await writeFile(directory+shot,Buffer.from(combined,'base64'));
   report.reports.push({id,viewport,cycles:3,comparedNodes:before.length,comparison:'exact getBoundingClientRect + every computed CSS property + ::before/::after',controls:before.filter(n=>n.tag==='BUTTON'||n.id==='joystick').map(n=>({tag:n.tag,id:n.id,action:n.action,rect:n.rect,style:Object.fromEntries(['display','visibility','position','width','height','background-color','color','opacity','transform','scale','filter','border-radius'].map(key=>[key,n.style[key]]))})),shot});
   await tap('[data-action=game-pause]');await tap('[data-action=game-exit]');await waitForGameNavigation(page);console.log('G8b verified',id,viewport.width);
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
}
 await writeFile(directory+'verification.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();}
