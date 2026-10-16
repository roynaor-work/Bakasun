// Uses an already installed Playwright/Chromium. Never installs or downloads.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const {chromium}=await import(process.env.TENNIS_PLAYWRIGHT?pathToFileURL(process.env.TENNIS_PLAYWRIGHT).href:'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url))),output=fileURLToPath(new URL('./',import.meta.url));
const types={'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!pathname.startsWith('/codex-lab/island-tennis/')&&!pathname.startsWith('/codex-lab/kid-full/')){res.writeHead(403).end();return;}if(pathname.endsWith('/'))pathname+='index.html';const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error();res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.TENNIS_BROWSER||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling']});
const reports=[];
// Advance through the real pure model and sync the view once at the chosen event.
async function playUntil(page,target){return page.evaluate(target=>{
  const api=window.__tennis;let lastContact=-1,lastServe=-1;
  for(let frame=0;frame<60*2400;frame++){
    const s=api.model.getState();
    if(target==='incoming'&&s.phase==='rally'&&s.contact?.side===0&&s.contact.eta<.16&&s.contact.eta>.1){api.step(0,{});return api.state;}
    if(target==='game'&&s.phase==='game'||target==='complete'&&s.phase==='complete'){api.step(0,{});return api.state;}
    let swing=false;
    if(s.phase==='serve'&&s.server===0&&lastServe!==s.pointNumber){swing=true;lastServe=s.pointNumber;}
    if(s.phase==='rally'&&s.contact?.side===0&&s.contact.eta<=.15&&lastContact!==s.contact.at){swing=true;lastContact=s.contact.at;}
    api.model.update(1/60,{swing,targetX:s.contact?.side===0?s.contact.x:0});
  }throw Error('No '+target);
},target);}
async function layout(page,label){const m=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('button,summary')].filter(el=>el.getClientRects().length).map(el=>({id:el.id,text:el.textContent,r:el.getBoundingClientRect()})).filter(x=>x.r.width<55.5||x.r.height<55.5||x.r.left<-.5||x.r.right>innerWidth+.5).map(x=>({id:x.id,text:x.text,width:x.r.width,height:x.r.height,left:x.r.left,right:x.r.right}))}));assert.equal(m.scroll,m.w,label+' no horizontal overflow');assert.deepEqual(m.bad,[],label+' targets >=56 and inside viewport');}
try{
  for(const [width,height]of [[390,844],[360,740],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(60000);
    const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});page.on('request',req=>{const u=new URL(req.url());if(u.protocol.startsWith('http')&&u.hostname!=='127.0.0.1')requests.push(u.href);});
    await page.goto(`http://127.0.0.1:${server.address().port}/codex-lab/island-tennis/?dev=1`);await page.waitForFunction(()=>window.__tennis?.view.metrics().characterLoaded);
    await layout(page,'opening');await page.screenshot({path:path.join(output,`opening-${width}.png`)});
    await page.locator('#start').tap();await page.evaluate(()=>__tennis.pause(true));
    const session=await context.newCDPSession(page);
    const touch=async(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
    const startX=width*.46,startY=height*.70;
    await touch('touchStart',startX,startY);await touch('touchMove',width*.82,startY);await touch('touchEnd');
    const drag=await page.evaluate(()=>{const input=__tennis.controls.read();const x=__tennis.state.players[0].x;__tennis.advance(30,input);return {input,before:x,after:__tennis.state.players[0].x};});
    assert.ok(drag.input.targetX>0,'horizontal drag feeds target');assert.ok(drag.after>drag.before,'drag moves child');assert.equal(drag.input.swing,false,'drag does not also swing');
    await page.evaluate(()=>{__tennis.start(1);__tennis.pause(true);});
    const hit=await page.locator('#hit').boundingBox();await touch('touchStart',hit.x+hit.width/2,hit.y+hit.height/2);
    const charged=await page.evaluate(()=>{__tennis.advance(144,__tennis.controls.read());return __tennis.state.charge;});assert.equal(charged,1);
    await touch('touchEnd');const serve=await page.evaluate(()=>__tennis.step(1/60,__tennis.controls.read()));assert.equal(serve.shot.serving,true);assert.ok(serve.shot.power>.35);
    const incoming=await playUntil(page,'incoming');assert.ok(incoming.landing.valid);
    // Touch the court itself, away from controls, inside the timing window.
    await page.touchscreen.tap(width*.65,height*.55);
    const timed=await page.evaluate(()=>{const input=__tennis.controls.read();__tennis.step(1/60,input);return __tennis.advance(40,{});});
    assert.equal(timed.shot.side,0,'timed canvas tap returns the ball');assert.equal(timed.shot.serving,false);assert.ok(timed.players[0].swing>0);
    await page.screenshot({path:path.join(output,`hit-landing-${width}.png`)});const full=await page.evaluate(()=>__tennis.view.metrics());assert.ok(full.triangles<=50000);assert.ok(full.drawCalls<=40);
    const beforeQuality=await page.evaluate(()=>__tennis.view.metrics());assert.ok(beforeQuality.quality<2,'injected latency still has a quality tier to reduce');const degraded=await page.evaluate(()=>{for(let i=0;i<180;i++)__tennis.view.observeFrame(50);__tennis.step(0,{});return __tennis.view.metrics();});assert.equal(degraded.quality,2);assert.equal(degraded.shadows,false);assert.equal(degraded.crowd,0);assert.ok(degraded.pixelRatio<=beforeQuality.pixelRatio);assert.ok(degraded.drawCalls<=40);
    const game=await playUntil(page,'game');assert.ok(game.score.games[0]+game.score.games[1]>0);await page.locator('#break-panel').waitFor({state:'visible'});await layout(page,'game board');await page.screenshot({path:path.join(output,`scoreboard-${width}.png`)});
    const complete=await playUntil(page,'complete');assert.equal(complete.result.won,true);await page.locator('#result').waitFor({state:'visible'});assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('tennis-lab'))),complete.result);assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),['tennis-lab']);await layout(page,'result');await page.screenshot({path:path.join(output,`result-${width}.png`)});
    await page.locator('#settings').tap();await page.locator('[data-stage="10"]').tap();await page.locator('#rank-speed [data-rank="5"]').tap();await page.locator('#rank-hit [data-rank="4"]').tap();await page.locator('#rank-serve [data-rank="3"]').tap();await layout(page,'ranks');await page.screenshot({path:path.join(output,`ranks-${width}.png`)});await page.locator('#apply').tap();await page.evaluate(()=>__tennis.pause(true));assert.deepEqual(await page.evaluate(()=>__tennis.state.ranks),{speed:5,hit:4,serve:3});assert.equal(await page.evaluate(()=>__tennis.state.stage),10);
    // Keyboard arrows and Space use the same model input; no DOM-state injection.
    await page.keyboard.down('ArrowLeft');const keyMove=await page.evaluate(()=>{const input=__tennis.controls.read();__tennis.advance(30,input);return __tennis.state.players[0].x;});await page.keyboard.up('ArrowLeft');assert.ok(keyMove<0);
    await page.keyboard.down('Space');await page.evaluate(()=>__tennis.advance(144,__tennis.controls.read()));await page.keyboard.up('Space');assert.equal((await page.evaluate(()=>__tennis.step(1/60,__tennis.controls.read()))).shot.serving,true);
    // Pause/cancel clears charge and movement instead of leaving a stuck input.
    await page.keyboard.down('ArrowRight');await touch('touchStart',width*.7,height*.65);await touch('touchCancel');await page.keyboard.up('ArrowRight');const cleared=await page.evaluate(()=>__tennis.controls.read());assert.equal(cleared.charge,false);assert.equal(cleared.swing,false);
    await page.locator('#pause').tap();await page.locator('#paused').waitFor({state:'visible'});await page.locator('#resume').tap();
    const finalState=await playUntil(page,'complete');assert.equal(finalState.result.won,false);assert.equal(await page.locator('#result-title').textContent(),'כמעט, עוד פעם?');await page.locator('#retry').tap();assert.equal(await page.evaluate(()=>__tennis.state.stage),10);assert.equal(await page.evaluate(()=>__tennis.state.phase),'serve');
    await page.evaluate(()=>__tennis.dispose());assert.equal(await page.evaluate(()=>__tennis.view.metrics().disposed),true);await page.evaluate(()=>__tennis.dispose());
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);reports.push({viewport:[width,height],full,degraded,drag,chargedServe:serve.shot.power,completed:complete.result,loss:finalState.result,errors,externalRequests:requests,checks:['drag','timed court tap','charged serve','point','game','set','ranks','keyboard','cancel','pause/resume','quality injection','retry','dispose','storage isolation','56px targets','no overflow']});
    console.log(`PASS ${width}x${height}`,JSON.stringify({triangles:full.triangles,drawCalls:full.drawCalls,quality:degraded.quality}));await context.close();
  }
  await writeFile(path.join(output,'browser-report.json'),JSON.stringify({date:new Date().toISOString(),renderer:'Chromium / SwiftShader (software)',reports},null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
