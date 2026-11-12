// Independent QA (final-fix-fable, aliens): Roy's three complaints, checked the way a phone sees the game.
// The real island shell (index.html?dev=1 + URL flags) -> window.__island.games.start('alienDefense'), Chromium
// with hasTouch + isMobile at 844x390, CDP Input.dispatchTouchEvent on the REAL fire button (#shoot), the REAL
// stick (#joystick) and the real flight surface (canvas). No model.update injection: the page's own loop runs the
// model; this script only READS the model (a read-only requestAnimationFrame sampler of model.snapshot()).
// Time: Playwright page.clock (fake, 16 ms frames); every rate below is counted in model time (snapshot.time).
// Upgraded gear goes through the island's own save: the save JSON written by the island itself (localStorage
// 'island.v1') is edited (equipment ranks, permanent upgrades, hangar rank, upgrade level) and loaded by a new page,
// where the island's persistence validates and migrates it like any saved game.
// Run (one Chromium at a time):
//   ISLAND_PLAYWRIGHT=... PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... QA_PART=fire node qa-aliens.mjs
// Parts: smoke, fire, taps, recharge, gear, motion, hit, save, bot. Output: qa-aliens-<part>.json (+ jpg frames).
import {writeFile} from 'node:fs/promises';
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';
import {waitForGameStart,waitForGameNavigation} from '../../../tests/shell-ready.mjs';

const OUT=new URL('./',import.meta.url);
const PARTS=(process.env.QA_PART||'smoke').split(',').map(s=>s.trim()).filter(Boolean);
const MODES={default:'',v15off:'&alienV15=0',movev20:'&alienMove=v20'};
const wall0=Date.now(),log=(...a)=>console.log(`[${((Date.now()-wall0)/1000).toFixed(0)}s]`,...a);
const round=(n,d=2)=>Number.isFinite(n)?+n.toFixed(d):n;

const needBrowser=PARTS.some(p=>p!=='reanalyse');
const chromium=needBrowser?await islandChromium():null;
const server=needBrowser?await serveIsland('/workout/island/'):null;
const browser=needBrowser?await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']}):null;

/** One fresh phone-like context with the island loaded and an air base built (the alien game needs one). */
async function openIsland(mode,{save=null}={}){
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 context.setDefaultTimeout(180000);
 const csp=await installIslandCspMonitor(context);
 if(save)await context.addInitScript(s=>{try{if(!sessionStorage.getItem('qa-save-written')){localStorage.setItem('island.v1',s);sessionStorage.setItem('qa-save-written','1');}}catch{}},save);
 const page=await context.newPage();await csp.attachPage(page);
 const errors=[],outside=[];
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('console.error: '+m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&!u.pathname.startsWith('/workout/island/'))outside.push(u.href);});
 // Headless Chromium has no fullscreen / orientation lock; the shell asks for both on a phone (same shim as the shared harness).
 await page.addInitScript(()=>{HTMLElement.prototype.requestFullscreen=undefined;try{Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async()=>{throw Error('unsupported');}});}catch{}});
 await page.clock.install();
 const url=server.url+'index.html?dev=1'+MODES[mode];
 await page.goto(url,{waitUntil:'networkidle'});
 for(let i=0;i<600&&!await page.evaluate(()=>Boolean(window.__island?.view?.metrics?.().avatarLoaded));i++)await new Promise(r=>setTimeout(r,100));
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60000));
 const tick=ms=>page.clock.runFor(ms);
 if(await page.locator('[data-action=avatar-start]').count()){await page.locator('[data-action=avatar-start]').tap();await tick(32);}
 // Test-environment settings only (same as the shared harness): no tutorial, no random city events, money to build an air base.
 const setup=await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;
  let placed=e.state.buildings.some(b=>b.typeId==='airbase');
  if(!placed){e.state.money=Math.max(e.state.money,100000);for(let z=0;z<e.state.world.size&&!placed;z++)for(let x=0;x<e.state.world.size&&!placed;x++)if(e.place('airbase',x,z).ok)placed=true;}
  const saved=e.save();return {placed,saved:saved.ok,search:location.search};});
 const cdp=await context.newCDPSession(page);
 const touch=async(type,points=[],fire)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});if(fire!==undefined)await page.evaluate(v=>{window.__qaHeld=v;},fire);};
 await page.evaluate(()=>{ // read-only per-frame sampler of the live model (no wrapping, no writes)
  if(window.__qaSampler)return;window.__qaSampler=true;window.__qaS=[];window.__qaOn=false;
  const loop=()=>{try{const g=window.__island?.games?.current,m=g?.session?.debug?.model;
   if(window.__qaOn&&m){const s=m.snapshot(),k=[0,0,0];for(const sh of s.shots)k[sh.kind]=(k[sh.kind]||0)+1;
    window.__qaS.push({t:+s.time.toFixed(4),fired:s.fired,hits:s.hits,kills:s.kills,lives:s.lives,mode:s.fireMode,heat:+(+s.heat).toFixed(3),cool:Boolean(m.overheated),inAir:s.shots.length,k0:k[0],k1:k[1],k2:k[2],burst:s.burstShots,steady:s.steadyShots,drop:s.capDropped,lasers:s.lasersFired,over:s.overheats,x:+s.player.x.toFixed(3),vx:+(s.player.vx||0).toFixed(3),bank:+(s.player.bank||0).toFixed(4),recoil:+(s.player.recoil||0).toFixed(3),held:Boolean(window.__qaHeld),btnHeld:[...document.querySelectorAll('#shoot')].some(n=>n.classList.contains('held')),wave:s.wave,aliens:s.aliens.length,powerup:s.powerup,spread:s.spreadTime>0,shotYs:s.shots.map(q=>[+q.x.toFixed(1),+q.y.toFixed(1),q.kind])});}
  }catch(e){window.__qaErr=String(e.stack||e);}requestAnimationFrame(loop);};
  requestAnimationFrame(loop);
 });
 return {mode,url,context,csp,page,errors,outside,tick,touch,setup};
}
async function closeIsland(I){
 let cspError=null;try{await I.csp.assertClean();}catch(e){cspError=e.message.slice(0,2000);}
 const snapshot=I.csp.snapshot();await I.context.close();try{await I.csp.assertClean();}catch(e){cspError??=e.message.slice(0,2000);}await I.csp.dispose();
 return {errors:I.errors,outside:I.outside,cspClean:!cspError,cspError,cspHtmlResponses:snapshot.htmlResponsesSeen,cspViolations:snapshot.violations.length,cspPolicyErrors:snapshot.policyErrors.length,setup:I.setup,url:I.url};
}
const center=async(page,sel)=>{const b=await page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height,left:b.x,top:b.y};};
const snap=page=>page.evaluate(()=>window.__island.games.current?.session.snapshot??null);
const alive=page=>page.evaluate(()=>Boolean(window.__island.games.current));

/** Start the alien game like a tap in the city; returns the intro (help) text if the instructions dialog appeared. */
async function startGame(I,{captureIntro=null}={}){
 const {page,tick}=I;let intro=null;
 await page.evaluate(()=>window.__island.games.start('alienDefense'));
 if(await page.locator('[data-action=game-understood]').count()){
  await tick(32);
  intro=await page.evaluate(()=>[...document.querySelectorAll('.game-help-lines p')].map(p=>p.textContent));
  if(captureIntro)await page.screenshot({path:new URL(captureIntro,OUT).pathname,type:'jpeg',quality:80});
  await page.locator('[data-action=game-understood]').tap();
 }
 await waitForGameStart(page);await tick(100);await waitForGameNavigation(page);
 // wait (real time, game clock paused) for the 3D ship and the alien models
 let s=await snap(page);for(let i=0;i<300&&!(s?.renderMetrics?.shipV13&&s?.artModels?.loaded>=s?.artModels?.requested);i++){await new Promise(r=>setTimeout(r,100));s=await snap(page);}
 const geometry=await page.evaluate(()=>{const r=e=>{const b=document.querySelector(e)?.getBoundingClientRect();return b?{x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1)}:null;};const m=window.__island.games.current.session.debug.model;
  return {canvas:r('canvas.minigame-canvas'),shoot:r('#shoot'),stick:r('#joystick'),pass:r('#pass'),effectAspect:+(m.effectAspect||1).toFixed(3),v15:m.v15,moveV15:m.moveV15,v14:m.v14,shipV13:m.shipV13,cannonOffset:m.cannonOffset,search:location.search,hudControl:document.querySelector('.alien-flight-control')?.textContent||null,hudWeapon:document.querySelector('.alien-flight-weapon')?.textContent||null,shootNodes:document.querySelectorAll('#shoot').length};});
 s=await snap(page);
 return {intro,geometry,renderMode:s.renderMode,renderMetrics:{shipV13:s.renderMetrics?.shipV13,playerLoaded:s.renderMetrics?.playerLoaded},artModels:s.artModels,timeAtStart:s.time,level:s.level,lives:s.lives,equipment:await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;return {equipment:{...m.equipment},upgrades:{...m.upgrades},hangar:m.snapshot().hangar,settingsSeconds:m.settings.seconds};})};
}
async function exitGame(I){
 const {page,tick}=I;
 if(await alive(page)){if(!await page.locator('.game-pause-sheet').count())await page.locator('[data-action=game-pause]').tap();await tick(50);await page.locator('[data-action=game-exit]').tap();await waitForGameNavigation(page);}
 else{await tick(1500);await waitForGameNavigation(page);}
 await tick(200);
}
async function sampling(I,on){await I.page.evaluate(v=>{window.__qaOn=v;if(v)window.__qaS=[];},on);}
async function samples(I){return I.page.evaluate(()=>{const s=window.__qaS;window.__qaS=[];return {s,err:window.__qaErr||null};});}
const shot=(I,name)=>I.page.screenshot({path:new URL(`qa-aliens-${name}.jpg`,OUT).pathname,type:'jpeg',quality:82});

/** Hold the real fire button (one finger) for ms of game time; marks = {ms:name} screenshots + snapshot. */
async function holdFire(I,ms,marks={}){
 const fire=await center(I.page,'#shoot');const keys=Object.keys(marks).map(Number).sort((a,b)=>a-b);const out={};
 await I.tick(48);await I.touch('touchStart',[{x:fire.x,y:fire.y,id:7}],true);let t=0;
 for(const k of [...keys,ms]){if(k>t){await I.tick(k-t);t=k;}if(marks[k]){await shot(I,marks[k]);const s=await snap(I.page);out[marks[k]]=s?{t:s.time,fireMode:s.fireMode,heat:s.heat,shots:s.shots.map(q=>({x:+q.x.toFixed(1),y:+q.y.toFixed(1),kind:q.kind,vx:+q.vx.toFixed(1)})),player:{x:s.player.x}}:null;}}
 await I.touch('touchEnd',[],false);return out;
}
/** Per-shot analysis of a sampled hold. The sampler's rAF callback runs before the game's own callback in each
 * frame, so sample i holds the state after frame i-1: the first sample with held=1 is the state at the moment of
 * the press and the first sample after the release is the state at the release. Accepts sample objects or the
 * compact trace rows [t,fired,lasers,mode,heat,cool,inAir,held]. */
const fromTrace=q=>Array.isArray(q)?{t:q[0],fired:q[1],lasers:q[2],mode:q[3],heat:q[4],cool:Boolean(q[5]),inAir:q[6],held:Boolean(q[7])}:q;
function analyseHold(rows,{v15}){
 const S=rows.map(fromTrace);const first=S.findIndex(s=>s.held);if(first<0)return {error:'no press seen'};
 let endIdx=S.findIndex((s,i)=>i>first&&!s.held);if(endIdx<0)endIdx=S.length-1;
 const base=S[first],end=S[endIdx],t0=base.t,dur=end.t-t0;
 const events=[];for(let i=first+1;i<=endIdx;i++){const a=S[i-1],b=S[i],n=b.fired-a.fired;if(n>0)events.push({t:b.t,n,lasers:b.lasers-a.lasers,mode:a.mode});}
 const total=end.fired-base.fired,lasers=end.lasers-base.lasers;
 const win=(a,b)=>{const ev=events.filter(e=>e.t>t0+a+1e-9&&e.t<=t0+b+1e-9);const shots=ev.reduce((n,e)=>n+e.n,0),cannon=ev.reduce((n,e)=>n+e.n-e.lasers,0);return {shots,cannon,perSec:round(shots/(b-a)),cannonPerSec:round(cannon/(b-a))};};
 // phases: v15 by fire mode (burst / cool / normal), v14 by the cool-down flag (fire / cool)
 const runs=[];let cur=null;for(let i=first+1;i<=endIdx;i++){const a=S[i-1],b=S[i],kind=v15?(a.mode==='idle'?'burst':a.mode):(a.cool?'cool':'fire');
  if(!cur||cur.kind!==kind){cur={kind,from:a.t,to:b.t,shots:0,cannon:0};runs.push(cur);}cur.to=b.t;cur.shots+=b.fired-a.fired;cur.cannon+=(b.fired-a.fired)-(b.lasers-a.lasers);}
 for(const r of runs){const d=r.to-r.from;r.seconds=round(d,3);r.perSec=round(r.shots/Math.max(1e-6,d));r.cannonPerSec=round(r.cannon/Math.max(1e-6,d));r.from=round(r.from-t0,3);r.to=round(r.to-t0,3);}
 const cannonEvents=events.filter(e=>e.n-e.lasers>0),gapsOf=list=>list.slice(1).map((e,i)=>round(e.t-list[i].t,3));
 const steadyKind=v15?'normal':'fire',steadyRuns=runs.filter((r,i)=>r.kind===steadyKind&&(v15||i>0)),steadyLast=steadyRuns.at(-1);
 const inAir=pred=>{const sel=S.slice(first,endIdx+1).filter(pred);return sel.length?{mean:round(sel.reduce((n,s)=>n+s.inAir,0)/sel.length,1),max:Math.max(...sel.map(s=>s.inAir))}:null;};
 const firstRun=runs[0];
 return {holdSeconds:round(dur,3),projectiles:total,lasers,cannon:total-lasers,overallPerSec:round(total/dur),cannonPerSec:round((total-lasers)/dur),
  first1s:win(0,1),first2s:win(0,2),firstFiringPhase:firstRun?{kind:firstRun.kind,seconds:firstRun.seconds,shots:firstRun.shots,perSec:firstRun.perSec}:null,runs,
  overheats:runs.filter(r=>r.kind==='cool').length,
  steady:steadyLast?{from:steadyLast.from,to:steadyLast.to,seconds:steadyLast.seconds,cannon:steadyLast.cannon,cannonPerSec:steadyLast.cannonPerSec,perSec:steadyLast.perSec,gaps:gapsOf(cannonEvents.filter(e=>e.t>t0+steadyLast.from&&e.t<=t0+steadyLast.to))}:null,
  firstGaps:gapsOf(cannonEvents).slice(0,14),
  inAirSteady:steadyLast?inAir(s=>s.t>t0+steadyLast.from+.9&&s.t<=t0+steadyLast.to):null,inAirAll:inAir(()=>true)};
}
async function writeJSON(name,value){await writeFile(new URL(`qa-aliens-${name}.json`,OUT),JSON.stringify(value,null,1)+'\n');log('wrote',`qa-aliens-${name}.json`);}

const results={};
if(PARTS.includes('reanalyse')){const {readFile}=await import('node:fs/promises');for(const part of ['fire','gear']){let r;try{r=JSON.parse(await readFile(new URL(`qa-aliens-${part}.json`,OUT),'utf8'));}catch{continue;}
 for(const mode of ['default','v15off'])if(r[mode]?.trace)r[mode].analysis=analyseHold(r[mode].trace,{v15:mode==='default'});await writeJSON(part,r);}}
try{
 // ---------------------------------------------------------------- smoke: setup, flags, geometry
 if(PARTS.includes('smoke')){const r={};
  for(const mode of ['default','v15off','movev20']){const I=await openIsland(mode);const g=await startGame(I);await I.tick(500);const s=await snap(I.page);
   r[mode]={...g,timeAfter500:s.time,fireMode:s.fireMode,v15:s.v15};await exitGame(I);r[mode].close=await closeIsland(I);log('smoke',mode,JSON.stringify(g.geometry));}
  results.smoke=r;await writeJSON('smoke',r);}

 // ---------------------------------------------------------------- fire: fresh save, hold the real button 8 s
 if(PARTS.includes('fire')){const r={};
  for(const mode of ['default','v15off']){const I=await openIsland(mode);const tag=mode==='default'?'new':'v20';
   const lsBefore=await I.page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
   const g=await startGame(I,{captureIntro:mode==='default'?new URL('qa-aliens-help-intro.jpg',OUT).pathname:null});
   await I.tick(2600); // formation entry (1.7 s) before the press, button untouched
   await sampling(I,true);
   const marks=mode==='default'?{700:`${tag}-burst`,2200:`${tag}-cooling`,5000:`${tag}-steady-a`,6600:`${tag}-steady-b`}:{700:`${tag}-burst`,2500:`${tag}-firing`,4200:`${tag}-cooling`,6600:`${tag}-after-cool`};
   const shots=await holdFire(I,8000,marks);await I.tick(300);
   const {s:S,err}=await samples(I);await sampling(I,false);
   const a=analyseHold(S,{v15:mode==='default'});
   const s=await snap(I.page);r[mode]={start:g,analysis:a,shotsAtMarks:shots,samplerError:err,audio:s?{audio:s.audio,shotAudio:s.shotAudio}:null,frames:S.length,trace:S.map(q=>[q.t,q.fired,q.lasers,q.mode,q.heat,q.cool?1:0,q.inAir,q.held?1:0,q.btnHeld?1:0])};
   await exitGame(I);
   const lsAfter=await I.page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
   r[mode].localStorage={before:lsBefore,after:lsAfter};
   r[mode].close=await closeIsland(I);log('fire',mode,JSON.stringify({overall:a.overallPerSec,first1s:a.first1s,steady:a.steady,overheats:a.overheats,inAir:a.inAirSteady}));}
  results.fire=r;await writeJSON('fire',r);}

 // ---------------------------------------------------------------- taps: a child hammering the real button
 if(PARTS.includes('taps')){const r={};
  for(const mode of ['default','v15off']){const I=await openIsland(mode);r[mode]={};
   for(const [name,down,up] of [['fast10hz',40,60],['tap6hz',64,96],['tap3hz',112,192]]){
    const g=await startGame(I);await I.tick(2600);await sampling(I,true);
    const fire=await center(I.page,'#shoot');let t=0,taps=0;
    while(t<6000){await I.touch('touchStart',[{x:fire.x,y:fire.y,id:9}],true);await I.tick(down);await I.touch('touchEnd',[],false);await I.tick(up);t+=down+up;taps++;}
    await I.tick(200);const {s:S}=await samples(I);await sampling(I,false);
    const first=S.findIndex(s=>s.held)-1,last=S.length-1,b=S[Math.max(0,first)],e=S[last];
    const modes={};for(const s of S)modes[s.mode]=(modes[s.mode]||0)+1;
    r[mode][name]={taps,downMs:down,upMs:up,seconds:round(e.t-b.t,3),projectiles:e.fired-b.fired,lasers:e.lasers-b.lasers,perSec:round((e.fired-b.fired)/(e.t-b.t)),cannonPerSec:round(((e.fired-b.fired)-(e.lasers-b.lasers))/(e.t-b.t)),overheats:e.over-b.over,burstPulls:(e.burst??0)-(b.burst??0),steadyPulls:(e.steady??0)-(b.steady??0),framesByMode:modes,maxHeat:Math.max(...S.map(s=>s.heat)),heatEnd:e.heat,heldFrames:S.filter(s=>s.held).length,frames:S.length};
    if(name==='fast10hz')await shot(I,`taps-${mode==='default'?'new':'v20'}-10hz`);
    await exitGame(I);log('taps',mode,name,JSON.stringify(r[mode][name]));}
   r[mode].close=await closeIsland(I);}
  results.taps=r;await writeJSON('taps',r);}

 // ---------------------------------------------------------------- recharge: after steady fire, how long a rest brings the Vulcan burst back
 if(PARTS.includes('recharge')){const r={};const I=await openIsland('default');
  for(const rest of [300,500,600,1500]){
   await startGame(I);await I.tick(2600);await sampling(I,true);
   const fire=await center(I.page,'#shoot');
   await I.touch('touchStart',[{x:fire.x,y:fire.y,id:3}],true);await I.tick(4200);await I.touch('touchEnd',[],false); // burst, cool, steady
   await I.tick(rest);
   await I.touch('touchStart',[{x:fire.x,y:fire.y,id:3}],true);await I.tick(1000);await I.touch('touchEnd',[],false);await I.tick(100);
   const {s:S}=await samples(I);await sampling(I,false);
   // sample i = state after frame i-1: a press is the first sample with held=1 (state at the touch), a release the first sample after it with held=0
   const presses=[];for(let i=0;i<S.length;i++)if(S[i].held&&(i===0||!S[i-1].held))presses.push(i);
   const p1=presses[0],p2=presses[1],r1=S.findIndex((q,i)=>i>p1&&!q.held),after=S.slice(p2+1,p2+1+62);
   r[rest]={restMs:rest,presses:presses.length,modeBeforeRelease:S[r1-1]?.mode,heatAtRelease:S[r1]?.heat,restSeconds:round(S[p2].t-S[r1].t,3),heatAtRepress:S[p2]?.heat,
    firstModeAfterRepress:after[0]?.mode,burstFramesInNextSecond:after.filter(q=>q.mode==='burst').length,shotsInNextSecond:after.length?after.at(-1).fired-S[p2].fired:null,
    trace:S.map(q=>[q.t,q.fired,q.mode,q.heat,q.held?1:0])};
   await exitGame(I);log('recharge',rest,JSON.stringify({...r[rest],trace:undefined}));}
  r.close=await closeIsland(I);results.recharge=r;await writeJSON('recharge',r);}

 // ---------------------------------------------------------------- gear: maxed equipment through the island's own save
 if(PARTS.includes('gear')){const r={};
  // 1. let the island write its own save (fresh profile + air base), 2. edit only the gear fields, 3. load it in a new page
  const I0=await openIsland('default');const raw=await I0.page.evaluate(()=>localStorage.getItem('island.v1'));const c0=await closeIsland(I0);
  const save=JSON.parse(raw);const before={equipment:save.minigameEquipment.alienDefense,alienUpgrades:save.alienUpgrades,hangar:save.hangar,level:save.minigameLevels.alienDefense};
  save.minigameEquipment.alienDefense={damage:3,rate:3,shield:3,weapon:2};
  for(const k of Object.keys(save.alienUpgrades))save.alienUpgrades[k]=3;
  Object.assign(save.hangar,{rapid:20,shield:0,spent:20});save.minigameLevels.alienDefense=3;
  r.saveEdit={before,after:{equipment:save.minigameEquipment.alienDefense,alienUpgrades:save.alienUpgrades,hangar:save.hangar,level:save.minigameLevels.alienDefense},firstProfile:c0};
  for(const mode of ['default','v15off']){const I=await openIsland(mode,{save:JSON.stringify(save)});const tag=mode==='default'?'new':'v20';
   const loaded=await I.page.evaluate(()=>{const s=window.__island.engine.state;return {equipment:s.minigameEquipment.alienDefense,alienUpgrades:s.alienUpgrades,hangar:s.hangar,level:s.minigameLevels.alienDefense,corrupt:Object.keys(localStorage).filter(k=>k.includes('corrupt'))};});
   const g=await startGame(I);await I.tick(2600);await sampling(I,true);
   const shots=await holdFire(I,8000,{5600:`gear-${tag}-steady`,1000:`gear-${tag}-burst`});await I.tick(300);
   const {s:S}=await samples(I);await sampling(I,false);
   r[mode]={loaded,start:g,analysis:analyseHold(S,{v15:mode==='default'}),shotsAtMarks:shots,trace:S.map(q=>[q.t,q.fired,q.lasers,q.mode,q.heat,q.cool?1:0,q.inAir,q.held?1:0,q.btnHeld?1:0])};
   await exitGame(I);r[mode].close=await closeIsland(I);log('gear',mode,JSON.stringify({loaded,overall:r[mode].analysis.overallPerSec,steady:r[mode].analysis.steady,first1s:r[mode].analysis.first1s}));}
  results.gear=r;await writeJSON('gear',r);}

 // ---------------------------------------------------------------- motion: the real stick, default vs ?alienMove=v20 vs ?alienV15=0
 if(PARTS.includes('motion')){const r={};
  for(const mode of ['default','movev20','v15off']){const I=await openIsland(mode);const g=await startGame(I);await I.tick(2600);
   const stick=await center(I.page,'#joystick'),canvas=g.geometry.canvas,pxPerUnit=canvas.w/360;
   const seg={};await sampling(I,true);
   const push=async(dx,ms)=>{await I.touch('touchStart',[{x:stick.x,y:stick.y,id:1}]);await I.touch('touchMove',[{x:stick.x+dx,y:stick.y,id:1}]);await I.tick(ms);};
   const release=async()=>{await I.touch('touchEnd',[]);};
   // a) to the left wall, rest
   await push(-60,1700);await release();await I.tick(900);seg.wall=(await samples(I)).s.at(-1);
   // b) full right 0.8 s from rest at the wall, release, glide
   await sampling(I,true);await push(60,800);const atRelease=await snap(I.page);await release();await I.tick(1200);seg.full=(await samples(I)).s;seg.fullRelease=atRelease.time;
   // c) reversal: full right 0.5 s, then full left (same finger) 0.6 s, release
   await sampling(I,true);await push(60,500);const tRev=(await snap(I.page)).time;await I.touch('touchMove',[{x:stick.x-60,y:stick.y,id:1}]);await I.tick(600);await release();await I.tick(900);seg.rev=(await samples(I)).s;seg.revAt=tRev;
   // d) half deflection (24 px of 48) for 0.8 s
   await sampling(I,true);await push(24,800);await release();await I.tick(900);seg.half=(await samples(I)).s;
   // e) relative drag on the flight surface: finger moves 100 px right and stays
   await sampling(I,true);const fx=420,fy=120;await I.touch('touchStart',[{x:fx,y:fy,id:2}]);await I.tick(64);const ds=await snap(I.page),dragFrom=ds.player.x;seg.dragAt=ds.time;await I.touch('touchMove',[{x:fx+100,y:fy,id:2}]);await I.tick(900);await I.touch('touchEnd',[]);await I.tick(300);seg.drag=(await samples(I)).s;seg.dragFrom=dragFrom;
   await sampling(I,false);
   // sample i = state after frame i-1, so rows[0] is the state at the moment the stick was pushed (t0)
   const an=(rows,releaseT)=>{const t0=rows[0].t,x0=rows[0].x;const pre=rows.filter(s=>s.t<=releaseT+1e-9),post=rows.filter(s=>s.t>releaseT+1e-9);const top=Math.max(...pre.map(s=>Math.abs(s.vx)));
    const t90=pre.find(s=>Math.abs(s.vx)>=.9*top),t50=pre.find(s=>Math.abs(s.vx)>=.5*top),xRel=pre.at(-1).x,rest=post.find(s=>s.vx===0);
    const at=sec=>rows.find(s=>s.t>=t0+sec-1e-6);let maxStep=0;for(let i=1;i<rows.length;i++)maxStep=Math.max(maxStep,Math.abs(rows[i].x-rows[i-1].x));
    return {topSpeed:round(top,1),topSpeedPxPerSec:round(top*pxPerUnit,0),t50:t50?round(t50.t-t0,3):null,t90:t90?round(t90.t-t0,3):null,
     distance100ms:round(Math.abs(at(.1).x-x0),1),distance250ms:round(Math.abs(at(.25).x-x0),1),distance500ms:round(Math.abs(at(.5).x-x0),1),
     glideUnits:round(Math.abs((post.at(-1)?.x??xRel)-xRel),1),glidePx:round(Math.abs((post.at(-1)?.x??xRel)-xRel)*pxPerUnit,0),glideSeconds:rest?round(rest.t-releaseT,3):(post.length?'>'+round(post.at(-1).t-releaseT,2):0),
     glideColumns:round(Math.abs((post.at(-1)?.x??xRel)-xRel)/46,2),
     maxBank:round(Math.max(...rows.map(s=>Math.abs(s.bank))),3),maxLeanDeg3d:round(Math.max(...rows.map(s=>Math.abs(s.bank)))*0.25*180/Math.PI,1),bankAtRelease:pre.at(-1).bank,maxFrameStep:round(maxStep,2),startX:x0,xAtRelease:round(xRel,1)};};
   const full=an(seg.full,seg.fullRelease);
   const rv=seg.rev;const ri=rv.findIndex(s=>s.t>seg.revAt+1e-9);const revTop=Math.max(...rv.slice(ri).map(s=>-s.vx));const zero=rv.slice(ri).find(s=>s.vx<=0);const r90=rv.slice(ri).find(s=>-s.vx>=.9*revTop);
   const half=seg.half;const halfTop=Math.max(...half.map(s=>Math.abs(s.vx)));
   const dr=seg.drag;const dTarget=seg.dragFrom+100*360/canvas.w;const dStart=dr.find(s=>s.t>0&&Math.abs(s.x-seg.dragFrom)>0.01);const d90=dr.find(s=>Math.abs(s.x-seg.dragFrom)>=.9*Math.abs(dTarget-seg.dragFrom));const dMax=Math.max(...dr.map(s=>s.x));
   r[mode]={start:{geometry:g.geometry,renderMode:g.renderMode},pxPerUnit:round(pxPerUnit,3),bankAngleRad:0.24,full,
    reverse:{topLeftSpeed:round(revTop,1),secondsToZero:zero?round(zero.t-seg.revAt,3):null,secondsTo90:r90?round(r90.t-seg.revAt,3):null},
    halfStick:{topSpeed:round(halfTop,1)},
    drag:{fromX:round(seg.dragFrom,2),targetX:round(dTarget,2),secondsTo90:d90?round(d90.t-seg.dragAt,3):null,overshoot:round(Math.max(0,dMax-dTarget),2),finalX:round(dr.at(-1).x,2)},
    traces:{full:seg.full.map(s=>[s.t,s.x,s.vx,s.bank]),release:seg.fullRelease}};
   await shot(I,`motion-${mode}`);
   await exitGame(I);r[mode].close=await closeIsland(I);log('motion',mode,JSON.stringify({full,reverse:r[mode].reverse,half:r[mode].halfStick,drag:r[mode].drag}));}
  results.motion=r;await writeJSON('motion',r);}

 // ---------------------------------------------------------------- hit: the ship directly under an alien, real fire button
 if(PARTS.includes('hit')){const r={};
  for(const mode of ['default','v15off']){const I=await openIsland(mode);r[mode]={};
   for(const offset of [0,4,9]){
    const g=await startGame(I);await I.tick(2600);const canvas=g.geometry.canvas,unitsPerPx=360/canvas.w;
    let s=await snap(I.page);const bottom=Math.max(...s.aliens.map(a=>a.y));const row=s.aliens.filter(a=>Math.abs(a.y-bottom)<2).sort((a,b)=>Math.abs(a.x-180)-Math.abs(b.x-180));const target=row[0];
    const wantX=target.x+offset;const fx=420,fy=110;
    await I.touch('touchStart',[{x:fx,y:fy,id:1}]);await I.tick(48);const shipFrom=(await snap(I.page)).player.x;
    await I.touch('touchMove',[{x:fx+(wantX-shipFrom)/unitsPerPx,y:fy,id:1}]);await I.tick(900);
    s=await snap(I.page);const t=s.aliens.find(a=>a.id===target.id);const aligned={ship:round(s.player.x,2),alien:round(t.x,2),dx:round(s.player.x-t.x,2),alienY:round(t.y,1),shipY:round(s.player.y,1),hpBefore:round(t.hp,3)};
    const fire=await center(I.page,'#shoot');await sampling(I,true);
    await I.touch('touchStart',[{x:fx+(wantX-shipFrom)/unitsPerPx,y:fy,id:1},{x:fire.x,y:fire.y,id:2}],true);await I.tick(450);
    await I.touch('touchMove',[{x:fx+(wantX-shipFrom)/unitsPerPx,y:fy,id:1}],false); // lift the fire finger only, the drag finger stays
    const heldAfterLift=await I.page.evaluate(()=>[...document.querySelectorAll('#shoot')].some(n=>n.classList.contains('held')));
    await I.tick(250);await shot(I,`hit-${mode==='default'?'new':'v20'}-dx${offset}`);await I.tick(800);
    const {s:S}=await samples(I);await sampling(I,false);s=await snap(I.page);const t2=s.aliens.find(a=>a.id===target.id);
    const fired=S.at(-1).fired-S[0].fired+(S[0].fired-(S[0].fired)),firstHeld=S.findIndex(q=>q.held);
    const shotsFired=S.at(-1).fired-S[Math.max(0,firstHeld-1)].fired,hits=S.at(-1).hits-S[Math.max(0,firstHeld-1)].hits;
    const shipDrift=Math.max(...S.map(q=>Math.abs(q.x-aligned.ship)));
    r[mode][`dx${offset}`]={aligned,shotsFired,hits,targetHpAfter:t2?round(t2.hp,3):'destroyed',targetHit:t2?round(aligned.hpBefore-t2.hp,3)>0:true,shipDriftDuringFire:round(shipDrift,2),fireReleasedWhileDragHeld:!heldAfterLift,effectAspect:g.geometry.effectAspect,cannonOffset:g.geometry.cannonOffset,shipV13:g.geometry.shipV13};
    await I.touch('touchEnd',[]);await exitGame(I);log('hit',mode,offset,JSON.stringify(r[mode][`dx${offset}`]));void fired;}
   r[mode].close=await closeIsland(I);}
  results.hit=r;await writeJSON('hit',r);}

 // ---------------------------------------------------------------- bot: a steady player through the real controls, stage 1
 if(PARTS.includes('bot')){const r={};const modes=(process.env.QA_BOT_MODES||'default').split(',');const cap=Number(process.env.QA_BOT_CAP||200);
  for(const mode of modes){const I=await openIsland(mode);const g=await startGame(I);await I.tick(1500);const canvas=g.geometry.canvas,unitsPerPx=360/canvas.w;
   const fire=await center(I.page,'#shoot');let s=await snap(I.page);const t0=s.time,ship0=s.player.x,fx0=420,fy=110;const finger=x=>({x:Math.max(2,Math.min(842,Math.round(fx0+(x-ship0)/unitsPerPx))),y:fy,id:1});
   await I.touch('touchStart',[finger(ship0)]);await I.touch('touchStart',[finger(ship0),{x:fire.x,y:fire.y,id:2}],true);let steps=0,last=s,pickups=[];const air=[];
   while(s&&!s.result&&s.time-t0<cap){
    const plan=await I.page.evaluate(()=>{const g=window.__island.games.current;if(!g)return null;const m=g.session.debug.model;const py=m.player.y;
     const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];const cross=[];for(const b of m.bolts){const vy=b.vy||1,tt=(py-b.y)/vy;if(tt>0&&tt<1.4)cross.push(b.x+(b.vx||0)*tt);}for(const a of m.aliens)if(a.diveAge>=0&&a.y<py)cross.push(a.x);
     let want=t?t.x:m.player.x;const p=m.pickups[0];if(p&&p.y>py-200)want=p.x;const safe=x=>cross.every(c=>Math.abs(c-x)>30);if(!safe(want)){out:for(let d=0;d<=360;d+=6)for(const sg of[1,-1]){const x=want+sg*d;if(x>20&&x<340&&safe(x)){want=x;break out;}}}
     return {want,pickup:p?{kind:p.kind,y:p.y}:null,powerup:m.powerup,spread:m.spreadTime>0,mode:m.fireMode,inAir:m.shots.length,aimDx:t?Math.abs(t.x-m.player.x):null};});
    if(!plan)break;air.push([plan.mode,plan.inAir,plan.aimDx]);if(plan.pickup&&!pickups.some(q=>q.kind===plan.pickup.kind&&Math.abs(q.at-s.time)<3))pickups.push({kind:plan.pickup.kind,at:round(s.time-t0,1)});
    await I.touch('touchMove',[finger(plan.want),{x:fire.x,y:fire.y,id:2}]);await I.tick(100);last=s;s=await snap(I.page);steps++;
    if(steps%100===0)log('bot',mode,round(s?.time-t0,1),'kills',s?.kills,'wave',s?.wave,'lives',s?.lives);
   }
   await I.touch('touchEnd',[]);const end=s||last;
   const won=end.result?.outcome==='win'||(!s&&await I.page.evaluate(()=>(window.__island.engine.state.minigameWins.alienDefense||0)>0));
   r[mode]={stageSeconds:round(end.time-t0,1),limitSeconds:g.equipment.settingsSeconds,outcome:won?'win':end.result?.outcome||(s?'running at cap':'ended'),fired:end.fired,kills:end.kills,shotsPerKill:round(end.fired/Math.max(1,end.kills),1),livesLeft:end.lives,maxLives:end.maxLives,wave:end.wave,overheats:end.overheats,capDropped:end.capDropped,pickupsSeen:pickups,steps,inAirSteadyAimed:(()=>{const q=air.filter(a=>a[0]==='normal'&&a[2]!==null&&a[2]<4);return q.length?{samples:q.length,mean:round(q.reduce((n,a)=>n+a[1],0)/q.length,1),max:Math.max(...q.map(a=>a[1]))}:null;})(),inAirSteadyAll:(()=>{const q=air.filter(a=>a[0]==='normal');return q.length?{samples:q.length,mean:round(q.reduce((n,a)=>n+a[1],0)/q.length,1),max:Math.max(...q.map(a=>a[1]))}:null;})()};
   await I.tick(300);await shot(I,`bot-${mode}-end`);
   await exitGame(I).catch(()=>{});r[mode].close=await closeIsland(I);log('bot',mode,JSON.stringify(r[mode]));}
  results.bot=r;await writeJSON('bot',r);}
}finally{if(browser)await browser.close();if(server)await server.close();log('done',PARTS.join(','));}
