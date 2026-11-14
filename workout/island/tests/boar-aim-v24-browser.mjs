// Boar aiming, v23 against v24, through the REAL island shell with real touch (14/11/2026).
// Run: ISLAND_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs node workout/island/tests/boar-aim-v24-browser.mjs
//   AIM=v24 (default) the new aim;  AIM=v23  `?boarAim=v23` on the island URL (the code before v24).
//   TRIALS=16 boars for the child bot (half a standing mortar at z -28, half a runner coming from z -60), SIGMA=10 (deg), SEED=1, OUT=<file.json>.
// Chromium with hasTouch + isMobile at 844x390 opens index.html?dev=1&adapt=1 and starts the game as a tap in the city would. Every input is
// CDP Input.dispatchTouchEvent on the controls inside the frame: finger 1 = the left thumb on the stick, finger 2 = the fire button.
// The game state is only read (__boar.view/clock/hit: what a child sees on the screen). Set-up only: a sandbox wave (no wave plan, 999 hp),
// one boar spawned at a time, and the crosshair placed 140-320 px from it before each boar (as after the previous boar).
// The container renders about one frame a second, so everything is measured in game time (the game's dt is capped at 0.05 s);
// the kinematics match a phone, frame rate aside. The same child (boar-kid-bot.mjs) runs in the offline model in tests/island-boars-v24.test.mjs.
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {createKidBot,rng} from './boar-kid-bot.mjs';
import {stickCurve,topSpeed,V23,AIM24} from '../minigames/boar-island/aim-v24.mjs';
import {writeFile} from 'node:fs/promises';
const AIM=process.env.AIM||'v24',TRIALS=+(process.env.TRIALS||16),SIGMA=+(process.env.SIGMA||10),SEED=+(process.env.SEED||1),T0=Date.now();
const log=(...a)=>console.error(`[${AIM} ${((Date.now()-T0)/1000).toFixed(0)}s]`,...a);
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
const page=await ctx.newPage();page.setDefaultTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(server.url+'?dev=1&adapt=1'+(AIM==='v23'?'&boarAim=v23':''),{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
await page.locator('[data-action=avatar-start]').tap();
await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;});
await page.evaluate(()=>window.__island.games.start('boarDefense'));
if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').tap();
await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();
const frame=await (await frameEl.elementHandle()).contentFrame();
await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);
const box=await frameEl.boundingBox();
const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
// CDP: touchStart/touchMove list the active points; touchEnd lists the points being released.
const send=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x+box.x,y:p.y+box.y,id:p.id}))});
const fingers=new Map();const active=()=>[...fingers.entries()].map(([id,p])=>({...p,id}));
const down=async(id,p)=>{fingers.set(id,p);await send('touchStart',active());};
const move=async(id,p)=>{fingers.set(id,p);await send('touchMove',active());};
const up=async id=>{const p=fingers.get(id);if(!p)return;fingers.delete(id);await send('touchEnd',[{...p,id}]);};
// run the game in the page until game time t, recording per frame which boar the crosshair ray hits; then stop its clock (__boar.hold) and return
// the view. The bot decides and its touches arrive while the clock stands, so a slow machine adds no input delay in game time (a phone runs in
// real time); the child's own delays (seeing, reacting, moving the thumb) are in the bot.
const until=t=>frame.evaluate(t=>new Promise(res=>{const on=[];window.__boar.hold(false);const f=()=>{const c=window.__boar.clock();on.push([+c.t.toFixed(4),window.__boar.hit()]);if(c.t>=t||c.mode!=='battle'){window.__boar.hold(true);res({view:window.__boar.view(),on});}else requestAnimationFrame(f);};requestAnimationFrame(f);}),t);
const clock=()=>frame.evaluate(()=>window.__boar.clock());
await frame.evaluate(()=>window.__boar.sandbox(1));await frame.waitForFunction(()=>!document.getElementById('fire-btn').hidden);
const env=await frame.evaluate(()=>({flags:window.__boar.state.flags,aimMode:window.__boar.state.aimMode,coarse:matchMedia('(pointer:coarse)').matches,fire:(()=>{const r=document.getElementById('fire-btn').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})(),W:innerWidth,H:innerHeight}));
log('env',JSON.stringify(env));if(!(env.fire.x>0&&env.fire.y>0))throw Error('no fire button on the screen');
const results={aim:AIM,env,sigma:SIGMA,seed:SEED,stick:{},trials:[],errors};
// ---------------- A. the stick by itself (no boar near the crosshair) ----------------
const ndc=(x,y)=>[x/env.W*2-1,-(y/env.H*2-1)];
const setAim=(x,y)=>frame.evaluate(([a,b])=>window.__boar.aim(a,b),ndc(x,y));
async function speedAt(dx,dy=0,{o={x:150,y:290},settle=.15,span=.25}={}){ // px/s of the crosshair with the thumb held dx,dy from where it landed
  await setAim(env.W*.3,env.H*.35);await down(1,o);await move(1,{x:o.x+dx,y:o.y+dy});let c=await clock();let a=(await until(c.t+settle)).view;const b=(await until(a.t+span)).view;await up(1);await until(b.t+.06);
  return {vx:+((b.cx-a.cx)/(b.t-a.t)).toFixed(1),vy:+((b.cy-a.cy)/(b.t-a.t)).toFixed(1)};}
await frame.evaluate(()=>window.__boar.killAll());
if(!process.env.SKIP_STICK){
{const S={};for(const d of [5,7,9,12,16,24,40,60,80,100])S[d]=(await speedAt(d)).vx;results.stick.speedRight=S;
 S.up80=(await speedAt(0,-80)).vy;S.diag80=await speedAt(57,-57);log('speeds px/s',JSON.stringify(S));
 const dz=[5,7,9,12].find(d=>Math.abs(S[d])>.5)??null;results.stick.deadZonePx=dz;}
// skip check: per-frame steps at full tilt (the crosshair must not jump), with the game's own per-frame record
{await setAim(env.W*.15,env.H*.45);await frame.evaluate(()=>window.__boar.record(true));await down(1,{x:150,y:290});await move(1,{x:250,y:290});const c=await clock();await until(c.t+.6);
 const tr=await frame.evaluate(()=>window.__boar.trace());await up(1);await frame.evaluate(()=>window.__boar.record(false));
 const steps=[];for(let i=1;i<tr.length;i++)if(tr[i].s&&tr[i].x<.94)steps.push(Math.abs(tr[i].x-tr[i-1].x)*env.W/2/Math.max(1e-4,tr[i].dt));
 const held=steps.slice(4),mean=held.reduce((s,v)=>s+v,0)/(held.length||1),max=Math.max(...held),min=Math.min(...held);
 results.stick.fullTilt={frames:steps.length,meanPxPerS:+mean.toFixed(1),maxOverMean:+(max/mean).toFixed(3),minOverMean:+(min/mean).toFixed(3)};log('full tilt',JSON.stringify(results.stick.fullTilt));}
// after a fast thumb move: the thumb flicks 200 px right in one move, holds, then comes back 100 px (still right of where it landed)
{await setAim(env.W*.25,env.H*.45);const o={x:110,y:290};await down(1,o);await move(1,{x:o.x+200,y:o.y});let c=await clock();const a=(await until(c.t+.3)).view;
 await move(1,{x:o.x+100,y:o.y});const b=(await until(a.t+.05)).view;const samples=[];let v=b;for(let i=0;i<6;i++){v=(await until(v.t+.1)).view;samples.push({t:+(v.t-b.t).toFixed(3),cx:v.cx});}
 await up(1);const turn=samples.find((s,i)=>i>0&&s.cx<samples[i-1].cx-.5);
 const st=await frame.evaluate(()=>window.__boar.state);
 results.stick.fastFlick={cxAtComeBack:b.cx,cxAfter:samples.map(s=>s.cx),wrongWayPx:+(Math.max(...samples.map(s=>s.cx))-b.cx).toFixed(1),turnsBackAfter:turn?turn.t:null};
 log('fast flick',JSON.stringify(results.stick.fastFlick));}
}
// ---------------- B. the child bot, one boar at a time ----------------
const P=AIM==='v24'?AIM24:V23,speedOf=(ux,uy)=>topSpeed(ux,uy,env.W,env.H,P),curve=m=>stickCurve(m,P);
let anchor=null;const bot=createKidBot({seed:SEED,sigmaDeg:SIGMA,speedOf,curve,R:P.R,anchor:()=>anchor});
const r=rng(SEED*7919+13);let thumbDown=false,fireDown=false;
async function apply(d){
  if(d.thumb&&!thumbDown){await down(1,d.thumb);thumbDown=true;}else if(d.thumb)await move(1,d.thumb);else if(thumbDown){await up(1);thumbDown=false;}
  if(d.fire&&!fireDown){await down(2,env.fire);fireDown=true;}else if(!d.fire&&fireDown){await up(2);fireDown=false;}}
// the game records the crosshair every frame while the bot aims (not over the set-up placement): the largest per-frame speed shows whether the help ever makes it jump
const frameSpeeds=[];const collect=tr=>{for(let i=1;i<tr.length;i++){const dt=tr[i].dt;if(!tr[i].s||!tr[i-1].s||dt<=0)continue;frameSpeeds.push(Math.hypot((tr[i].x-tr[i-1].x)*env.W/2,(tr[i].y-tr[i-1].y)*env.H/2)/dt);}};
for(let n=0;n<TRIALS;n++){
  const kind=n%2?'moving':'standing';await frame.evaluate(()=>window.__boar.killAll());if(fireDown){await up(2);fireDown=false;}
  let c=await clock();let v=(await until(c.t+.4)).view;// pause between boars, no target (the bot may lift its thumb)
  {const d=bot.tick({t:v.t,cx:v.cx,cy:v.cy,target:null});await apply(d);}
  await frame.evaluate(([k,z])=>window.__boar.spawn(k,z),kind==='standing'?['mortar',-28]:['runner',-60]);
  v=(await until(v.t+.1)).view;const tg0=v.targets[0];if(!tg0){log('no target');continue;}const id=tg0.id;
  for(let k=0;k<50;k++){const a=r()*Math.PI*2,d=140+r()*180,x=tg0.x+Math.cos(a)*d,y=tg0.y+Math.sin(a)*d*.6;if(x>30&&x<env.W-30&&y>40&&y<env.H-40){await setAim(x,y);break;}}
  v=(await until(v.t+.05)).view;await frame.evaluate(()=>window.__boar.record(true));const t0=v.t,shots0=v.shots,hits0=v.hits;let tMove=null,tOn=null,onRun=0,lastT=t0,killed=false,strokes=null;
  while(v.t-t0<6){const tg=v.targets.find(t=>t.id===id);if(!tg){killed=true;break;}
    anchor=v.stick?{x:v.stick.ox,y:v.stick.oy}:null;
    const rb=Math.max(...tg.zones.map(z=>z.r));const d=bot.tick({t:v.t,cx:v.cx,cy:v.cy,target:{id,x:tg.x,y:tg.y,rv:rb/1.35}});await apply(d);
    if(tMove===null&&bot.moved)tMove=v.t;
    if(process.env.DEBUG)log(`  t${(v.t-t0).toFixed(2)} c(${v.cx.toFixed(0)},${v.cy.toFixed(0)}) tg(${tg.x.toFixed(0)},${tg.y.toFixed(0)}) r${rb.toFixed(1)} D${Math.hypot(tg.x-v.cx,tg.y-v.cy).toFixed(0)} thumb${d.thumb?`(${d.thumb.x.toFixed(0)},${d.thumb.y.toFixed(0)})`:'-'} anc${anchor?`(${anchor.x.toFixed(0)},${anchor.y.toFixed(0)})`:'-'} fire${d.fire?1:0} on${v.on===id?1:0} ${JSON.stringify(v.assist)}`);
    const w=await until(v.t+bot.step);
    for(const [t,on] of w.on){if(t<=lastT)continue;onRun=on===id?onRun+(t-lastT):0;lastT=t;if(tOn===null&&onRun>=.1){tOn=t;strokes=bot.strokes;}}
    v=w.view;if(v.mode!=='battle')break;}
  const row={kind,aimTime:tOn===null?null:+(tOn-.1-(tMove??t0)).toFixed(3),totalTime:tOn===null?null:+(tOn-.1-t0).toFixed(3),strokes,shots:v.shots-shots0,hits:v.hits-hits0,killed,gameTime:+(v.t-t0).toFixed(2)};
  collect(await frame.evaluate(()=>{const t=window.__boar.trace();window.__boar.record(false);return t;}));
  results.trials.push(row);log('trial',n,JSON.stringify(row));}
if(fireDown)await up(2);if(thumbDown)await up(1);
{results.stick.trialFrames={frames:frameSpeeds.length,maxPxPerS:+Math.max(0,...frameSpeeds).toFixed(1),p99PxPerS:+([...frameSpeeds].sort((a,b)=>a-b)[Math.floor(frameSpeeds.length*.99)]||0).toFixed(1)};log('trial frames',JSON.stringify(results.stick.trialFrames));}
// summary
const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0),med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2:null;};
results.summary={};for(const k of ['all','standing','moving']){const rs=results.trials.filter(x=>k==='all'||x.kind===k);if(!rs.length)continue;const shots=sum(rs,x=>x.shots),hits=sum(rs,x=>x.hits),aim=rs.map(x=>x.aimTime??6);
  results.summary[k]={n:rs.length,hitRate:shots?+(hits/shots).toFixed(3):null,shots,hits,aimMedian:+med(aim).toFixed(3),aimMean:+(sum(aim,x=>x)/aim.length).toFixed(3),reached:rs.filter(x=>x.aimTime!==null).length,strokes:+(sum(rs.filter(x=>x.strokes!==null),x=>x.strokes)/Math.max(1,rs.filter(x=>x.strokes!==null).length)).toFixed(2),killed:rs.filter(x=>x.killed).length};}
results.final=await frame.evaluate(()=>{const s=window.__boar.state;return {shotsBy:s.shotsBy,stickNoButton:s.stickNoButton,errors:0};});
log('summary',JSON.stringify(results.summary));log('shotsBy',JSON.stringify(results.final.shotsBy),'errors',errors.length);
if(process.env.OUT)await writeFile(process.env.OUT,JSON.stringify(results,null,1)+'\n');
console.log(JSON.stringify({aim:AIM,stick:results.stick,summary:results.summary,shotsBy:results.final.shotsBy,stickNoButton:results.final.stickNoButton,errors}));
await browser.close();await server.close();
const nonButton=Object.entries(results.final.shotsBy||{}).filter(([k])=>k!=='button').reduce((n,[,v])=>n+v,0);
if(errors.length||nonButton){console.error('FAILED: page errors or shots that did not come from the fire button',errors,results.final.shotsBy);process.exit(1);}
