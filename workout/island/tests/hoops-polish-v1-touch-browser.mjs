// Hoops polish v1 (20/11/2026) through the island shell with real touch: Chromium with hasTouch and isMobile (SwiftShader WebGL), 844x390,
// CDP Input.dispatchTouchEvent on the on-screen Shoot button (press, hold, release) whenever it is shown, real frames (Playwright's fake
// clock). The match is played twice for the same game-time window: on the default game and with ?hoopsPolish=0 (v24.5). Reads only: the
// engine's contact events as the view receives them (rim/board/floor, with the polish's side and contact normal), the impact sample
// counters of the audio mixer (what was scheduled to play; nothing here can hear it), and a frame at the first rim contact.
// Run: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node workout/island/tests/hoops-polish-v1-touch-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const frames=new URL((process.env.ISLAND_CSP_AUDIT_DIR?'file://'+process.env.ISLAND_CSP_AUDIT_DIR.replace(/\/?$/,'/'):'../verification/')+'hoops-polish-v1/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const WINDOW=Number(process.env.WINDOW||90);
await verify('hoops-polish-v1',[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,start,exit,assert})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const capture=name=>page.screenshot({path:new URL(`844x390-${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 assert.ok(await page.evaluate(()=>{const {engine:e}=window.__island;e.learningStatus=()=>({locked:false});for(let z=0;z<e.state.world.size;z++)for(let x=0;x<e.state.world.size;x++)if(e.place('basketball',x,z).ok)return true;return false;}),'basketball court built');
 const play=async search=>{
  // SwiftShader draws the full v8 arena at about one frame a second in the island shell, so the default run uses the light arena
  // (HOOPS_EXTRA='' keeps the full one); the physics, events and audio under test are the same on every venue.
  await page.evaluate(q=>{history.replaceState(null,'',location.pathname+'?dev=1'+q);},(process.env.HOOPS_EXTRA??'&hoopsQuality=0&hoopsCrowd3d=0&hoopsShow=0')+search);
  // Basketball opens through its own menu: the stages dialog, then "play next" (tapped), then the rules card.
  await page.evaluate(()=>window.__island.games.stages('streetSlam'));await tick(300);
  await page.locator('[data-action=hoops-play-next]').tap();await tick(400);
  if(await page.locator('[data-action=game-understood]:visible').count()){await page.locator('[data-action=game-understood]').tap();await tick(200);}
  for(let i=0;i<300&&!(await page.locator('.game-screen').count());i++)await tick(200);
  for(let i=0;i<300&&!(await page.evaluate(()=>Boolean(window.__island.games.current?.session.debug?.view)));i++)await tick(200);
  // The shell's start countdown runs on real frames.
  for(let i=0;i<100&&await page.locator('.shell-countdown:visible').count();i++)await tick(200);
  if(process.env.VERBOSE)console.log('view',await page.evaluate(()=>Boolean(window.__island.games.current?.session.debug?.view)),'controls',await page.locator('[data-hoops-control]').count(),JSON.stringify(await page.evaluate(()=>document.elementsFromPoint(300,300).slice(0,8).map(e=>e.tagName+'.'+e.className+(e.hidden?'[hidden]':'')))));
  await page.evaluate(()=>{const d=window.__island.games.current.session.debug;window.__polishSeen=[];const base=d.view.effects.bind(d.view);d.view.effects=(events,snapshot)=>{window.__polishSeen.push(...events.filter(e=>e.type==='contact'||e.type==='score'));return base(events,snapshot);};});
  // Real touch on the Shoot button; the match is advanced by the session's own fixed step (debug.step consumes the same controls),
  // with one rendered frame per round so the controls and the picture stay current (SwiftShader renders the arena slowly).
  const step=n=>page.evaluate(n=>window.__island.games.current.session.debug.step(n),n);
  const frame=async()=>{await page.evaluate(()=>{window.__island.games.current.session.debug.hold=false;});await tick(17);await page.evaluate(()=>{window.__island.games.current.session.debug.hold=true;});};
  await page.evaluate(()=>{window.__island.games.current.session.debug.hold=true;});
  let presses=0,rimShot=false,elapsed=0;
  const rimSeen=()=>page.evaluate(()=>window.__polishSeen.some(e=>e.what==='rim'));
  const shotOnRim=async()=>{if(!rimShot&&await rimSeen()){await frame();if(process.env.VERBOSE)console.log('cover',JSON.stringify(await page.evaluate(()=>document.elementsFromPoint(422,195).slice(0,6).map(e=>e.tagName+'.'+e.className))));await capture(`hoops-rim-${search?'v245':'polish'}`);rimShot=true;}};
  while(elapsed<WINDOW){
   await frame();elapsed+=1/60;
   const shootBtn=page.locator('[data-hoops-control=shoot]:visible').first(),shoot=await shootBtn.count()?await shootBtn.boundingBox({timeout:2000}).catch(()=>null):null;
   if(shoot){const q={x:Math.round(shoot.x+shoot.width/2),y:Math.round(shoot.y+shoot.height/2),id:3};await touch('touchStart',[q]);await tick(20);await step(24);await touch('touchEnd',[q]);await tick(20);presses++;elapsed+=.4;
    for(let k=0;k<16;k++){await step(10);elapsed+=10/60;await shotOnRim();}}
   else{await step(60);elapsed+=1;}
   await shotOnRim();
   if(process.env.VERBOSE)console.log('t',elapsed.toFixed(1),'presses',presses,'rim',rimShot,JSON.stringify(await page.evaluate(()=>{const s=window.__island.games.current?.session,c=s?.debug.engine.snapshot();return {phase:c?.phase,score:c?.score,clock:c?.clock,tick:c?.tick,ball:c?.ball&&{state:c.ball.state,owner:c.ball.owner,x:+c.ball.x?.toFixed?.(1)},mode:document.querySelector('[data-hoops-mode]')?.dataset.hoopsMode,shown:[...document.querySelectorAll('[data-hoops-control]')].filter(b=>b.getClientRects().length).map(b=>b.dataset.hoopsControl),seen:window.__polishSeen?.length,screen:document.querySelector('.game-screen')?.dataset.hoopsPhase};})));
   if(!await page.evaluate(()=>Boolean(window.__island.games.current)))break;
  }
  await page.evaluate(()=>{const g=window.__island.games.current;if(g)g.session.debug.hold=false;});
  const r=await page.evaluate(({presses,search})=>{const s=window.__island.games.current?.session,seen=window.__polishSeen,a=s?.snapshot.audioMetrics||{};
   const contacts=seen.filter(e=>e.type==='contact');const by=k=>contacts.filter(e=>e.what===k).length;
   return {mode:search?'?hoopsPolish=0':'default',presses,contacts:contacts.length,rim:by('rim'),board:by('board'),floor:by('floor'),
    rimWithNormal:contacts.filter(e=>e.what==='rim'&&Number.isFinite(e.ny)&&Number.isFinite(e.side)).length,
    sampleRim:contacts.find(e=>e.what==='rim')||null,impact:a.impact?{ready:a.impact.ready?.length??null,played:Object.fromEntries(Object.entries(a.played||{}).filter(([k])=>k.startsWith('impact:')))}:null,
    renderCalls:s?.snapshot.renderMetrics?.calls??null};},{presses,search});
  console.log('hoops',JSON.stringify(r));
  if(await page.evaluate(()=>Boolean(window.__island.games.current)))await exit();
  return r;
 };
 const polish=await play(''),v245=await play('&hoopsPolish=0');
 assert.ok(polish.presses>0&&v245.presses>0,'the Shoot button was pressed by touch');
 assert.ok(polish.impact&&polish.impact.ready===8,'the eight impact samples are loaded');
 assert.equal(v245.impact,null,'?hoopsPolish=0: no impact mixer');
 assert.equal(v245.rimWithNormal,0,'?hoopsPolish=0: contact events keep the v24.5 shape');
 if(polish.rim)assert.ok(polish.rimWithNormal===polish.rim,'every rim contact carries its side and normal');
 return {polish,v245};
});
