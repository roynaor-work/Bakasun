// Boars v24.1: every weapon its own round, look and sound, through the REAL island shell with real touch (14/11/2026).
// Run: ISLAND_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs node workout/island/tests/boar-fx-v241-browser.mjs
//   FX=v241 (default) the v24.1 rounds;  FX=v24  `?boarFx=v24` on the island URL (the v24 streaks and four sounds).
// Chromium with hasTouch + isMobile at 844x390 opens index.html?dev=1&adapt=1 and starts the game as a tap in the city would. Every input
// is CDP Input.dispatchTouchEvent on the controls inside the frame: the weapon button (to go through the chain) and the fire button. Set-up
// only (as boar-aim-v24-browser.mjs): a sandbox wave, a save with the twelve weapons bought (as the stages are unlocked in the ship tests),
// one standing boar, and the crosshair placed on it. The game is read only (__boar.fx/state/clock: which round and sound each shot used,
// what flies now). The container renders about a frame a second, so the frame loop is held while a frame is photographed.
// Frames and boar-fx.json go to verification/naval-boars-v241/.
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const FX=process.env.FX||'v241',T0=Date.now(),log=(...a)=>console.error(`[${FX} ${((Date.now()-T0)/1000).toFixed(0)}s]`,...a);
const out=new URL('../verification/naval-boars-v241/',import.meta.url).pathname;await mkdir(out+'frames/',{recursive:true});
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','on');}catch{}});
const page=await ctx.newPage();page.setDefaultTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(server.url+'?dev=1&adapt=1'+(FX==='v24'?'&boarFx=v24':''),{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
await page.locator('[data-action=avatar-start]').tap();
await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;});
await page.evaluate(()=>window.__island.games.start('boarDefense'));
if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').tap();
await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();
const frame=await (await frameEl.elementHandle()).contentFrame();
await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);
const box=await frameEl.boundingBox(),cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x+box.x,y:p.y+box.y,id:p.id}))});
const centre=sel=>frame.evaluate(s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r&&r.width?{x:r.x+r.width/2,y:r.y+r.height/2}:null;},sel);
// Set-up: the sandbox wave, the twelve weapons bought, a standing boar, the crosshair on it.
await frame.evaluate(()=>{const s=window.__boar.state.save;window.__boar.sandbox(1);});
await frame.evaluate(()=>{const b=window.__boar,save=JSON.parse(JSON.stringify(b.state.save));for(const k of ['mg','shotgun','cannon','tesla','mg2','shotgun2','cannon2','tesla2','mg3','shotgun3','cannon3','tesla3'])save.weapons[k]=10;b.setSave(save);});
await frame.waitForFunction(()=>!document.getElementById('fire-btn').hidden);
const run=ms=>frame.evaluate(ms=>new Promise(res=>{window.__boar.hold(false);const t0=window.__boar.clock().t;const f=()=>{if(window.__boar.clock().t-t0>=ms/1000){window.__boar.hold(true);res(window.__boar.clock().t);}else requestAnimationFrame(f);};requestAnimationFrame(f);}),ms);
const placeBoar=async()=>{await frame.evaluate(()=>{window.__boar.killAll();window.__boar.spawn('mortar',-28);});await run(200);const v=await frame.evaluate(()=>window.__boar.view());const t=v.targets[0];if(t)await frame.evaluate(([x,y,W,H])=>window.__boar.aim(x/W*2-1,-(y/H*2-1)),[t.x,t.y,v.W||844,v.H||390]);return t;};
const env=await frame.evaluate(()=>({flags:window.__boar.state.flags,current:window.__boar.state.current}));log('env',JSON.stringify(env));
const W=await centre('#weapon-btn'),F=await centre('#fire-btn');if(!W||!F)throw Error('no weapon or fire button');
const order=['mg','shotgun','cannon','tesla','mg2','shotgun2','cannon2','tesla2','mg3','shotgun3','cannon3','tesla3'],rows=[];
for(const key of order){
 // Go through the chain with the weapon button (real taps) until this weapon is in hand.
 for(let i=0;i<14&&(await frame.evaluate(()=>window.__boar.state.current))!==key;i++){await touch('touchStart',[{...W,id:3}]);await touch('touchEnd',[{...W,id:3}]);await run(80);}
 const cur=await frame.evaluate(()=>window.__boar.state.current);if(cur!==key){rows.push({key,error:'not reached by the weapon button: '+cur});continue;}
 await run(400);await placeBoar();const log0=(await frame.evaluate(()=>window.__boar.fx())).log.length;
 await touch('touchStart',[{...F,id:2}]);const fam=key.replace(/\d$/,'');await run(fam==='cannon'?160:fam==='tesla'?60:110);
 const mid=await frame.evaluate(()=>window.__boar.fx());await page.screenshot({path:`${out}frames/boar-${FX}-${key}.jpg`,type:'jpeg',quality:80});
 await run(fam==='cannon'?500:200);await touch('touchEnd',[{...F,id:2}]);const end=await frame.evaluate(()=>window.__boar.fx());await run(300);
 const shots=end.log.slice(Math.max(0,end.log.length-(end.log.length-log0))).filter(s=>s.key===key);
 const arc=mid.shells.filter(s=>s.fx).map(s=>s.vy);
 rows.push({key,shots:shots.length,kinds:[...new Set(shots.map(s=>s.kind))],sounds:[...new Set(shots.map(s=>s.sound))],streaks:mid.streaks,shellsInFlight:mid.shells.length,fxShells:mid.shells.filter(s=>s.fx).length,shellVy:arc});
 log(key,JSON.stringify(rows.at(-1)));
}
const state=await frame.evaluate(()=>({shotsBy:window.__boar.state.shotsBy,audio:window.__boar.state.audio}));
const result={fx:FX,env,rows,shotsBy:state.shotsBy,errors};await writeFile(`${out}boar-fx-${FX}.json`,JSON.stringify(result,null,1)+'\n');
console.log(JSON.stringify({fx:FX,rows:rows.map(r=>({key:r.key,shots:r.shots,kinds:r.kinds,sounds:r.sounds,colours:Object.keys(r.streaks||{}),fxShells:r.fxShells})),errors}));
await browser.close();await server.close();
const nonButton=Object.entries(state.shotsBy||{}).filter(([k])=>k!=='button').reduce((n,[,v])=>n+v,0);
if(errors.length||nonButton){console.error('FAILED: page errors or shots that did not come from the fire button',errors,state.shotsBy);process.exit(1);}
