// Uses an already installed Playwright + browser. Never installs dependencies.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const output=fileURLToPath(new URL('./verification/',import.meta.url));await mkdir(output,{recursive:true});
let playwright;
try{playwright=await import('playwright');}catch{playwright=await import(pathToFileURL(process.env.SOCCER_PLAYWRIGHT||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs').href);}
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
    if(!pathname.startsWith('/codex-lab/island-soccer/') && pathname!=='/codex-lab/kid-full/kid-full.glb'){res.writeHead(403).end();return;}
    let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await playwright.chromium.launch({executablePath:process.env.SOCCER_BROWSER||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const origin=`http://127.0.0.1:${server.address().port}`,reports=[];
try{
  for(const [width,height] of [[390,844],[360,740],[844,390]]){
    const label=`${width}x${height}`,context=await browser.newContext({viewport:{width,height},hasTouch:true,deviceScaleFactor:2});
    const page=await context.newPage(),errors=[],requests=[],checks=[];page.setDefaultTimeout(30000);
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',request=>{if(request.url().startsWith('http'))requests.push(new URL(request.url()).pathname);});
    await page.goto(`${origin}/codex-lab/island-soccer/?dev=1`);await page.waitForFunction(()=>window.__soccer);
    const shot=name=>page.screenshot({path:path.join(output,`${label}-${name}.png`)});
    const tap=async selector=>{const box=await page.locator(selector).boundingBox();assert.ok(box,selector);await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);};
    const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
    await noOverflow();assert.ok(await page.locator('#stages button').evaluateAll(elements=>elements.every(el=>{const r=el.getBoundingClientRect();return r.width>=56&&r.height>=56;})),'stage targets at least 56px');await shot('opening');await page.locator('#team-settings summary').click();
    await page.locator('[data-player="0"][data-rank="speed"]').selectOption('2');await page.locator('[data-player="0"][data-rank="kick"]').selectOption('3');
    await page.locator('#ranks').evaluate(el=>el.scrollIntoView({block:'center'}));await noOverflow();await shot('ranks');
    await page.locator('#start').click();
    const touchSizes=await page.evaluate(()=>['#shoot','#switch','#pause','#hand'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,width:r.width,height:r.height};}));assert.ok(touchSizes.every(r=>r.width>=56&&r.height>=56));
    assert.equal(await page.evaluate(()=>__soccer.game.getState().players[0].speed),2);checks.push('manual ranks applied');
    await page.evaluate(()=>__soccer.setPaused(true));await page.clock.install({time:new Date('2026-10-16T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-16T10:00:01Z'));await page.evaluate(()=>__soccer.setPaused(false));
    async function scenario(){await page.evaluate(()=>{
      const a=__soccer;a.setPaused(true);const s=a.game.getState();s.phase='playing';s.result=null;s.controlled=0;s.half=1;s.attackDir=1;s.halfElapsed=0;s.elapsed=0;s.score=[0,0];s.idle=0;
      for(const p of s.players){p.x=p.team===0?-10:12;p.z=p.team===0?-6:7;p.vx=p.vz=0;p.cooldown=p.team===0?0:99;p.think=99;p.fx=p.team===0?1:-1;p.fz=0;}
      Object.assign(s.players[0],{x:-3,z:0});Object.assign(s.players[1],{x:0,z:-4});Object.assign(s.players[2],{x:-13,z:0});
      Object.assign(s.ball,{owner:0,x:-2.38,z:0,y:.22,vx:0,vz:0,vy:0,curve:0,grace:99,lastPlayer:0,lastTeam:0});a.setPaused(false);
    });await page.clock.runFor(50);}
    const cdp=await context.newCDPSession(page);
    const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:2,radiusY:2,force:1}))});
    const center=async selector=>{const b=await page.locator(selector).boundingBox();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
    await scenario();let stick=await center('#joystick'),kick=await center('#shoot');
    await touch('touchStart',[{id:1,...stick}]);await touch('touchMove',[{id:1,x:stick.x+38,y:stick.y}]);await page.clock.runFor(350);
    assert.ok(await page.evaluate(()=>__soccer.game.getState().players[0].x>-2),'joystick moves player');
    await touch('touchStart',[{id:1,x:stick.x+38,y:stick.y},{id:2,...kick}]);await page.clock.runFor(100);
    await touch('touchEnd',[]);await page.clock.runFor(35);
    assert.equal(await page.evaluate(()=>__soccer.game.getState().event?.type),'pass',JSON.stringify(await page.evaluate(()=>({s:__soccer.game.snapshot(),paused:__soccer.paused,held:document.querySelector('#shoot').className}))));checks.push('native multitouch joystick + short pass');
    await scenario();kick=await center('#shoot');await touch('touchStart',[{id:3,...kick}]);await page.clock.runFor(800);
    assert.ok(await page.evaluate(()=>__soccer.game.getState().charge>.65),'held shot charges');await touch('touchEnd',[]);await page.clock.runFor(35);
    assert.equal(await page.evaluate(()=>__soccer.game.getState().event?.type),'shot');assert.ok(await page.evaluate(()=>__soccer.game.getState().ball.vy>0));checks.push('charged touch shot with arc');
    await scenario();await page.evaluate(()=>{const s=__soccer.game.getState();Object.assign(s.ball,{owner:null,x:0,z:-4,y:2,grace:99});});await tap('#switch');await page.clock.runFor(50);
    assert.equal(await page.evaluate(()=>__soccer.game.getState().controlled),1);checks.push('switch to nearest player');
    await scenario();const before=await page.evaluate(()=>__soccer.game.getState().players[0].x);await page.keyboard.down('ArrowRight');await page.clock.runFor(300);await page.keyboard.up('ArrowRight');assert.ok(await page.evaluate(()=>__soccer.game.getState().players[0].x)>before+.5);
    await page.keyboard.down('Space');await page.clock.runFor(100);await page.keyboard.up('Space');await page.clock.runFor(35);assert.equal(await page.evaluate(()=>__soccer.game.getState().event.type),'pass');
    await scenario();await page.evaluate(()=>{const s=__soccer.game.getState();Object.assign(s.ball,{owner:null,x:0,z:-4,y:2,grace:99});});await page.keyboard.press('Shift');await page.clock.runFor(50);assert.equal(await page.evaluate(()=>__soccer.game.getState().controlled),1);checks.push('keyboard arrows, space and shift');
    await tap('#hand');assert.ok(await page.locator('#lab').evaluate(el=>el.classList.contains('left-handed')));const mirrored=await center('#joystick');assert.ok(mirrored.x>width/2);await tap('#hand');checks.push('handedness mirror');
    await scenario();await page.keyboard.down('Space');await page.clock.runFor(400);await tap('#pause');await page.keyboard.up('Space');const clock=await page.evaluate(()=>__soccer.game.getState().elapsed);await page.clock.runFor(600);assert.equal(await page.evaluate(()=>__soccer.game.getState().elapsed),clock);assert.equal(await page.evaluate(()=>__soccer.game.getState().charge),0);await tap('#resume');checks.push('pause freezes time and clears charge');
    await scenario();await page.evaluate(()=>{const s=__soccer.game.getState();Object.assign(s.ball,{owner:null,x:14.8,z:1.8,y:.35,vx:25,vz:0,vy:0});});await page.clock.runFor(100);assert.equal(await page.evaluate(()=>__soccer.game.getState().score[0]),1);assert.equal(await page.evaluate(()=>__soccer.game.getState().phase),'goal');assert.ok(await page.locator('#moment').isVisible());await shot('goal');checks.push('goal, net motion and fixed confetti');
    const high=await page.evaluate(()=>__soccer.view.metrics());assert.ok(high.triangles<=80000);assert.ok(high.drawCalls<=60);
    await page.evaluate(()=>{const a=__soccer;for(let i=0;i<520;i++)a.view.qualitySample(70,1/60);a.view.render(a.game.getState(),0);});const low=await page.evaluate(()=>__soccer.view.metrics());assert.equal(low.quality,2);assert.equal(low.shadows,false);assert.equal(low.crowdCount,36);assert.ok(low.pixelRatio<high.pixelRatio);checks.push('injected slowness reduces resolution, crowd and shadows');
    await page.evaluate(()=>{const a=__soccer,s=a.game.getState();s.phase='playing';s.half=2;s.attackDir=-1;s.halfElapsed=75-1/60;s.elapsed=150-1/60;s.score=[3,0];a.step(1/60,{});});await page.clock.runFor(50);
    assert.ok(await page.locator('#result').isVisible());const result=await page.evaluate(()=>__soccer.game.result);assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('soccer-lab'))),result);assert.equal(result.durationSeconds,150);assert.equal(result.stars,3);await noOverflow();await shot('scoreboard');checks.push('model full-time, result UI and lab-only storage');
    assert.deepEqual(errors,[]);assert.ok(requests.every(p=>p.startsWith('/codex-lab/island-soccer/')||p==='/codex-lab/kid-full/kid-full.glb'));
    await page.evaluate(()=>__soccer.dispose());const disposed=await page.evaluate(()=>__soccer.view.metrics());checks.push('dispose runs without errors');
    reports.push({viewport:{width,height},checks,high,low,touchSizes,result,requests:[...new Set(requests)],errors,disposed});await context.close();console.log(`${label}: ${checks.length} checks passed`);
  }
  await writeFile(path.join(output,'browser-report.json'),JSON.stringify({browser:browser.version(),renderer:'Chromium headless / ANGLE SwiftShader (not a physical phone)',reports},null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
