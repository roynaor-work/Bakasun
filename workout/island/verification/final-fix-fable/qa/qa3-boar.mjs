// QA round 3 (independent) for the boar game ("חזירים"), 12/11/2026. Written from scratch by the QA agent.
// Through the REAL island: index.html?dev=1, games.start('boarDefense'), real CDP touch (Input.dispatchTouchEvent) on the controls inside the iframe.
// Every speed is measured in GAME time / GAME frames (window.__boar.state.elapsed / frames, per-frame trace), never wall clock.
// MODE=after (default build) | v20 (?boarFire=v20&boarHud=v20&boarStick=v20) | v1 (?boar=v1, before 06/11).
// Run: ISLAND_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome \
//      MODE=after node workout/island/verification/final-fix-fable/qa/qa3-boar.mjs
import {serveIsland,islandChromium,installIslandCspMonitor} from '../../../../../tests/helpers/island-browser.mjs';
import {writeFile} from 'node:fs/promises';
const MODE=process.env.MODE||'after';
const FLAGS={after:'',v20:'&boarFire=v20&boarHud=v20&boarStick=v20',v1:'&boar=v1'}[MODE];
if(FLAGS===undefined)throw Error('MODE must be after|v20|v1');
const out=new URL('./',import.meta.url).pathname,W=844,H=390;
const t0=Date.now(),log=(...a)=>console.error(`[qa3 ${MODE} ${((Date.now()-t0)/1000).toFixed(0)}s]`,...a);
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:W,height:H},hasTouch:true,isMobile:true,deviceScaleFactor:1});
const csp=await installIslandCspMonitor(ctx);
await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
const page=await ctx.newPage();page.setDefaultTimeout(300000);
const errors=[];page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
const R={mode:MODE,query:'index.html?dev=1&adapt=1'+FLAGS,viewport:[W,H],steps:{},notes:[]};
const shot=name=>page.screenshot({path:out+`qa3-boar-${MODE}-${name}.jpg`,type:'jpeg',quality:82}).catch(e=>log('shot failed',name,e.message));

// ---------- open the island like a phone, start the game like a tap in the city ----------
await page.goto(server.url+R.query,{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
await page.locator('[data-action=avatar-start]').tap();
await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();data.featureFlags.events=false;});
await page.evaluate(()=>window.__island.games.start('boarDefense'));
R.intro=await page.evaluate(()=>[...document.querySelectorAll('.game-help-lines p')].map(p=>p.textContent));
if(R.intro.length){await shot('intro');await page.locator('[data-action=game-understood]').tap();}
await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();
const frame=await (await frameEl.elementHandle()).contentFrame();
await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);
const box=await frameEl.boundingBox();R.frameBox=box;R.frameUrl=frame.url();
// instrumentation only: count focus loss of the game window (under ?qa the game ignores blur; on a phone a blur releases the fire button)
await frame.evaluate(()=>{window.__qa3={blur:0,focus:0,vis:0};addEventListener('blur',()=>window.__qa3.blur++);addEventListener('focus',()=>window.__qa3.focus++);document.addEventListener('visibilitychange',()=>window.__qa3.vis++);});
const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
// CDP: touchStart/touchMove carry every active point; touchEnd carries the points being released (empty = release all). Verified by qa3-boar-probe.mjs.
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x+box.x,y:p.y+box.y,id:p.id??1}))});
let lost=false;
const st=()=>frame.evaluate(()=>{const s=window.__boar.state;return {mode:s.mode,frames:s.frames,elapsed:s.elapsed,aim:s.aim,firing:s.firing,fireHeld:s.fireHeld,stick:s.stick,stickInfo:s.stickInfo,
  shots:s.shots,shotsBy:s.shotsBy||{},stickNoButton:s.stickNoButton||0,abilityBy:s.abilityBy||{},abilityFromLeft:s.abilityFromLeft||0,heat:s.heat,overheated:s.overheated,current:s.current,hp:s.hp,
  enemies:s.enemies.length,flags:s.flags||{},stickR:s.stickR||62,aimSens:s.aimSens||null,paused:s.paused,wave:s.wave,qa3:{...window.__qa3}};});
const sleep=ms=>page.waitForTimeout(ms);
const tillFrames=async(n,ms=180000)=>{const f0=(await st()).frames,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.frames>=f0+n)return s;await sleep(25);}log('tillFrames timeout',n);return st();};
const tillGame=async(sec,ms=240000)=>{const e0=(await st()).elapsed,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.elapsed>=e0+sec)return s;await sleep(25);}log('tillGame timeout',sec);return st();};
const cool=async()=>{for(let i=0;i<120;i++){const s=await st();if((s.heat||0)<12&&!s.overheated)return;await sleep(200);}};
const rect=id=>frame.evaluate(id=>{const e=document.getElementById(id);if(!e||e.hidden||e.closest('[hidden]'))return null;const cs=getComputedStyle(e);if(cs.display==='none')return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,cx:b.x+b.width/2,cy:b.y+b.height/2};},id);
const sumAb=s=>Object.values(s.abilityBy).reduce((a,b)=>a+b,0),nonButton=s=>Object.entries(s.shotsBy).filter(([k])=>k!=='button').reduce((a,[,v])=>a+v,0);
const delta=(a,b)=>({shots:b.shots-a.shots,button:(b.shotsBy.button||0)-(a.shotsBy.button||0),nonButton:nonButton(b)-nonButton(a),abilities:sumAb(b)-sumAb(a),
  abilityFromLeft:b.abilityFromLeft-a.abilityFromLeft,stickNoButton:b.stickNoButton-a.stickNoButton,aimMove:+Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y).toFixed(4),
  aimFrom:a.aim,aimTo:b.aim,frames:b.frames-a.frames,game:+(b.elapsed-a.elapsed).toFixed(3),weapon:a.current===b.current?a.current:a.current+'->'+b.current});
async function guard(){if(lost)return false;try{const s=await st();
  if(s.mode!=='battle'){R.notes.push(`mode was ${s.mode} before a step; restarted wave 1 with __boar.start(1)`);await frame.evaluate(()=>window.__boar.start(1));await tillFrames(3);}
  if(s.hp<45){R.notes.push(`hp ${s.hp} before a step: killAll to keep the battle alive`);await frame.evaluate(()=>window.__boar.killAll());await tillFrames(2);}
  if(s.enemies<2)await frame.evaluate(()=>{window.__boar.spawn('scout',-20);window.__boar.spawn('scout',-26);});return true;}catch(e){lost=true;R.notes.push('frame lost: '+e.message.split('\n')[0]);return false;}}
async function step(name,fn){if(!await guard()){R.steps[name]={error:'skipped: frame lost'};return;}
  try{const a=await st();const extra=await fn(a)||{};const b=await st();R.steps[name]={...delta(a,b),...extra};}
  catch(e){R.steps[name]={error:String(e.message||e).split('\n')[0]};if(/detached|closed|Target/i.test(String(e.message)))lost=true;}
  try{await touch('touchEnd',[]);}catch{}
  log(name,JSON.stringify({...R.steps[name],trace:undefined,deltas:undefined,speeds:undefined}).slice(0,600));}
const hasStick=async()=>!!(await rect('aim-zone'))||!!(await frame.evaluate(()=>!!document.getElementById('aim-zone')));
const pick=async(id,fallback)=>{const r=await rect(id);return r?[r.cx,r.cy]:fallback;};
const slide=async(id,from,to,n)=>{for(let i=1;i<=n;i++){await touch('touchMove',[{x:from[0]+(to[0]-from[0])*i/n,y:from[1]+(to[1]-from[1])*i/n,id}]);await tillFrames(1);}};

// ---------- game menu: the kid taps "start" ----------
R.menu=await frame.evaluate(()=>({buttons:[...document.querySelectorAll('#menu button')].map(b=>b.id+': '+b.textContent.trim()),aimSens:document.getElementById('aim-sens')?.textContent||null,
  help:document.querySelector('#help-screen .help-panel p')?.textContent||null,flags:window.__boar.state.flags,coarse:matchMedia('(pointer:coarse)').matches,maxTouchPoints:navigator.maxTouchPoints}));
// setup: a second weapon so the weapon-switch control has something to switch to (as in Roy's save)
await frame.evaluate(()=>{const s=window.__boar.state.save;s.weapons.shotgun=s.weapons.shotgun||1;window.__boar.setSave(s);});
await shot('menu');
{const s=await rect('start');await touch('touchStart',[{x:s.cx,y:s.cy,id:9}]);await sleep(90);await touch('touchEnd',[{x:s.cx,y:s.cy,id:9}]);}
await frame.waitForFunction(()=>window.__boar.state.mode==='battle',null,{timeout:120000});
await frame.evaluate(()=>{window.__boar.spawn('scout',-20);window.__boar.spawn('scout',-24);window.__boar.spawn('scout',-28);});
{const a=await st(),t=Date.now();await sleep(4000);const b=await st();R.load={framesPerWallSecond:+((b.frames-a.frames)/((Date.now()-t)/1000)).toFixed(2),gameSecondsPerWallSecond:+((b.elapsed-a.elapsed)/((Date.now()-t)/1000)).toFixed(3)};log('load',JSON.stringify(R.load));}
await frame.waitForFunction(()=>getComputedStyle(document.getElementById('banner')).opacity==='0',null,{timeout:240000}).catch(()=>R.notes.push('banner still visible at layout time'));
R.env=await st();
R.layout=await frame.evaluate(()=>{const r=e=>{if(!e||e.hidden||e.closest('[hidden]'))return null;const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden')return null;const b=e.getBoundingClientRect();return b.width>1?[Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]:null;};
  const o={};for(const id of ['aim-zone','aim-rest','fire-btn','weapon-btn','rocket','frost','fury','boss-hud','battle-hint'])o[id]=r(document.getElementById(id));
  for(const [k,s] of Object.entries({coins:'.coin-block',health:'.health-block',wave:'.wave-block',weapons:'#weapons',ammo:'.ammo-panel'}))o[k]=r(document.querySelector(s));
  const at=(x,y)=>{const e=document.elementFromPoint(x,y);return e?(e.closest('button')?.id||e.id||e.className||e.tagName):null;};
  o.under=Object.fromEntries([[76,209],[184,209],[292,209],[60,200],[110,320],[79,311],[150,290],[450,140],[620,110],[520,60]].map(([x,y])=>[x+','+y,at(x,y)]));
  // hit-test grid over the left 36% x bottom 78% (the area a left thumb uses): what does a touch there land on?
  const bad={};let n=0,ok=0;for(let x=8;x<innerWidth*.36;x+=16)for(let y=innerHeight*.22+8;y<innerHeight;y+=16){n++;const e=document.elementFromPoint(x,y);if(e&&(e.id==='aim-zone'||e.closest('#aim-zone')))ok++;else{const k=e?(e.closest('button')?.id||e.id||e.className||e.tagName):'none';bad[k]=(bad[k]||0)+1;}}
  o.leftThumbGrid={points:n,onStick:ok,other:bad};
  o.fonts={abilitySmall:[...document.querySelectorAll('.ability small')].map(e=>getComputedStyle(e).fontSize),weaponName:document.querySelector('#weapon-btn .wname')?getComputedStyle(document.querySelector('#weapon-btn .wname')).fontSize:null,
    weaponAmmo:document.querySelector('#weapon-btn .wammo')?getComputedStyle(document.querySelector('#weapon-btn .wammo')).fontSize:null};
  const rest=document.getElementById('aim-rest');o.rest=rest?{border:getComputedStyle(rest).borderTopColor,label:getComputedStyle(rest,'::after').content}:null;
  o.crosshairMode=document.getElementById('crosshair').style.transform?'transform':'left/top';o.hint=document.getElementById('battle-hint').textContent;return o;});
log('layout',JSON.stringify(R.layout));await shot('wave1');

// ---------- complaint 1: aiming must never fire ----------
await step('C1_sceneTaps',async()=>{for(const [x,y] of [[450,140],[620,110],[520,60]]){await touch('touchStart',[{x,y,id:3}]);await tillFrames(2);await touch('touchEnd',[{x,y,id:3}]);await tillFrames(1);}await tillFrames(4);});
await step('C1_sceneDrag',async()=>{await frame.evaluate(()=>window.__boar.aim(0,-.05));await touch('touchStart',[{x:450,y:150,id:3}]);await slide(3,[450,150],[610,110],10);await tillFrames(4);await touch('touchEnd',[{x:610,y:110,id:3}]);await tillFrames(3);});
const restR=await rect('aim-rest');const O=restR?[Math.round(restR.cx),Math.round(restR.cy)]:[200,150];R.origin=O;// v1 has no stick: the same gesture lands on the open scene
await step('C1_stickDrag2s',async()=>{await frame.evaluate(()=>window.__boar.aim(0,-.05));const a=await st();await touch('touchStart',[{x:O[0],y:O[1],id:1}]);
  const path=[[30,-20],[45,-5],[20,25],[-25,15],[-30,-25],[10,-40]];let i=0;let mid=null;while((await st()).elapsed<a.elapsed+2){const p=path[i%path.length];await slide(1,[O[0]+(i?path[(i-1)%path.length][0]:0),O[1]+(i?path[(i-1)%path.length][1]:0)],[O[0]+p[0],O[1]+p[1]],4);i++;if(i===2){mid=await st();await shot('stick');}}
  const held=await st();await touch('touchEnd',[{x:O[0],y:O[1],id:1}]);await tillFrames(4);return {stickWhileHeld:held.stick,firingWhileHeld:held.firing,enemiesInRange:held.enemies,midStick:mid?.stick??null};});

// ---------- complaint 2: the left thumb where the v20 ability cards sat (x 28..340, y 168..250) ----------
const spots=[[76,209],[184,209],[292,209]];
await step('C2_leftThumbSpots',async()=>{await frame.evaluate(()=>window.__boar.aim(0,-.05));const per=[];
  for(const [x,y] of spots){const a=await st();await touch('touchStart',[{x,y,id:1}]);await tillFrames(2);await touch('touchEnd',[{x,y,id:1}]);await tillFrames(3);const b=await st();
    await touch('touchStart',[{x,y,id:1}]);await slide(1,[x,y],[x+10,y-30],8);await tillFrames(3);const c=await st();await touch('touchEnd',[{x:x+10,y:y-30,id:1}]);await tillFrames(3);const d=await st();
    per.push({spot:[x,y],tap:{abilities:sumAb(b)-sumAb(a),abilityBy:b.abilityBy,shots:b.shots-a.shots,aimMove:+Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y).toFixed(4)},drag:{abilities:sumAb(d)-sumAb(b),shots:d.shots-b.shots,aimMove:+Math.hypot(c.aim.x-b.aim.x,c.aim.y-b.aim.y).toFixed(4),stickDuringDrag:c.stick}});
    if(x===184)await shot('leftthumb');}
  return {per};});

// ---------- complaint 2: only the fire button fires ----------
const hasFire=!!(await rect('fire-btn'));R.hasFire=hasFire;
if(hasFire){
  await cool();
  await step('C2_fireButtonHold',async()=>{const f=await pick('fire-btn');const a=await st();await touch('touchStart',[{x:f[0],y:f[1],id:2}]);await tillGame(1);const h=await st();await shot('fire');await touch('touchEnd',[{x:f[0],y:f[1],id:2}]);await tillFrames(2);const r=await st();await tillFrames(6);const e=await st();
    return {heldFiring:h.firing,heldShots:h.shots-a.shots,heldByButton:(h.shotsBy.button||0)-(a.shotsBy.button||0),firingAfterRelease:r.firing,shotsAfterRelease6f:e.shots-r.shots,aimMoveWhileHeld:+Math.hypot(h.aim.x-a.aim.x,h.aim.y-a.aim.y).toFixed(4)};});
  await cool();
  await step('C2_twoFingers',async()=>{const f=await pick('fire-btn');await frame.evaluate(()=>window.__boar.aim(-.4,-.05));await touch('touchStart',[{x:O[0],y:O[1],id:1}]);await tillFrames(1);
    await touch('touchStart',[{x:O[0],y:O[1],id:1},{x:f[0],y:f[1],id:2}]);const a=await st();
    for(let i=1;i<=10;i++){await touch('touchMove',[{x:O[0]+i*4,y:O[1]-i*3,id:1},{x:f[0],y:f[1],id:2}]);await tillFrames(1);}const h=await st();await shot('twofinger');
    await touch('touchEnd',[{x:f[0],y:f[1],id:2}]);await tillFrames(2);const r=await st();await tillFrames(6);const e=await st();await touch('touchEnd',[{x:O[0]+40,y:O[1]-30,id:1}]);await tillFrames(1);const s=await st();await tillFrames(4);const z=await st();
    return {held:{firing:h.firing,stick:h.stick,shots:h.shots-a.shots,byButton:(h.shotsBy.button||0)-(a.shotsBy.button||0),aimMove:+Math.hypot(h.aim.x-a.aim.x,h.aim.y-a.aim.y).toFixed(4)},
      afterFireRelease:{firing:r.firing,stick:r.stick,shots6f:e.shots-r.shots,aimMove6f:+Math.hypot(e.aim.x-r.aim.x,e.aim.y-r.aim.y).toFixed(4)},afterStickRelease:{aimDrift4f:+Math.hypot(z.aim.x-s.aim.x,z.aim.y-s.aim.y).toFixed(5)}};});
  await cool();
  await step('C2_strayTapWhileFiring',async()=>{const f=await pick('fire-btn');await touch('touchStart',[{x:f[0],y:f[1],id:2}]);await tillFrames(4);const a=await st();
    await touch('touchStart',[{x:f[0],y:f[1],id:2},{x:520,y:130,id:3}]);await tillFrames(1);await touch('touchEnd',[{x:520,y:130,id:3}]);await tillFrames(1);const b=await st();await tillFrames(6);const c=await st();await touch('touchEnd',[{x:f[0],y:f[1],id:2}]);await tillFrames(2);
    return {firingBeforeTap:a.firing,firingAfterStrayTap:b.firing,fireHeldAfterStrayTap:b.fireHeld,shots6fAfterTap:c.shots-b.shots,overheated:c.overheated};});
}
// ---------- weapon switch control and abilities, single finger and with the left thumb held on the stick ----------
await step('C3_weaponSwitchTap',async()=>{const wb=await rect('weapon-btn');let target=wb,kind='weapon-btn';
  if(!wb){const cards=await frame.evaluate(()=>[...document.querySelectorAll('#weapons .wslot')].map(b=>{const r=b.getBoundingClientRect();return {key:b.dataset.key,active:b.classList.contains('active'),locked:b.classList.contains('locked'),cx:r.x+r.width/2,cy:r.y+r.height/2,w:r.width,h:r.height};}));
    const c=cards.find(c=>!c.active&&!c.locked);if(!c)return {skipped:'no weapon control',cards};target=c;kind='card '+c.key;}
  const a=await st();await touch('touchStart',[{x:target.cx,y:target.cy,id:4}]);await sleep(90);await touch('touchEnd',[{x:target.cx,y:target.cy,id:4}]);await tillFrames(4);const b=await st();
  return {control:kind,size:[Math.round(target.w),Math.round(target.h)],weaponBefore:a.current,weaponAfter:b.current,switched:a.current!==b.current};});
if(await hasStick()){
  await step('C3_weaponSwitchWhileStickHeld',async()=>{const wb=await rect('weapon-btn');let target=wb,kind='weapon-btn';
    if(!wb){const cards=await frame.evaluate(()=>[...document.querySelectorAll('#weapons .wslot')].map(b=>{const r=b.getBoundingClientRect();return {key:b.dataset.key,active:b.classList.contains('active'),locked:b.classList.contains('locked'),cx:r.x+r.width/2,cy:r.y+r.height/2};}));const c=cards.find(c=>!c.active&&!c.locked);if(!c)return {skipped:'no card'};target=c;kind='card '+c.key;}
    await touch('touchStart',[{x:O[0],y:O[1],id:1}]);await slide(1,O,[O[0]+12,O[1]],3);const a=await st();
    await touch('touchStart',[{x:O[0]+12,y:O[1],id:1},{x:target.cx,y:target.cy,id:4}]);await sleep(90);await touch('touchEnd',[{x:target.cx,y:target.cy,id:4}]);await tillFrames(4);const b=await st();
    await touch('touchEnd',[{x:O[0]+12,y:O[1],id:1}]);await tillFrames(2);return {control:kind,stickHeld:a.stick,weaponBefore:a.current,weaponAfter:b.current,switched:a.current!==b.current};});
  await step('C3_abilityTap',async()=>{const r=await rect('rocket');if(!r)return {skipped:'no rocket button'};const a=await st();await touch('touchStart',[{x:r.cx,y:r.cy,id:4}]);await sleep(90);await touch('touchEnd',[{x:r.cx,y:r.cy,id:4}]);await tillFrames(4);const b=await st();
    return {rocketRect:[Math.round(r.x),Math.round(r.y),Math.round(r.w),Math.round(r.h)],rocketPresses:(b.abilityBy.rocket||0)-(a.abilityBy.rocket||0),bullets:b.shots-a.shots};});
  await step('C3_abilityWhileStickHeld',async()=>{const r=await rect('frost');if(!r)return {skipped:'no frost button'};const inZone=await frame.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('#aim-zone'),[r.cx,r.cy]);
    await touch('touchStart',[{x:O[0],y:O[1],id:1}]);await slide(1,O,[O[0]+12,O[1]],3);const a=await st();
    await touch('touchStart',[{x:O[0]+12,y:O[1],id:1},{x:r.cx,y:r.cy,id:4}]);await sleep(90);await touch('touchEnd',[{x:r.cx,y:r.cy,id:4}]);await tillFrames(4);const b=await st();await touch('touchEnd',[{x:O[0]+12,y:O[1],id:1}]);await tillFrames(2);
    return {frostRect:[Math.round(r.x),Math.round(r.y),Math.round(r.w),Math.round(r.h)],frostInsideStickZone:inZone,stickHeld:a.stick,frostPresses:(b.abilityBy.frost||0)-(a.abilityBy.frost||0)};});
}

// ---------- complaint 5: precision (speed per thumb offset, nudges, precision finger, edge, release) ----------
const P0=[110,320];
if(await hasStick()){
  await step('C5_speedCurve',async()=>{const Rr=(await st()).stickR;const rows=[];await touch('touchStart',[{x:P0[0],y:P0[1],id:1}]);await tillFrames(2);
    for(const d of [5,7,8,10,12,16,20,24,32,40,50,62,80]){await touch('touchMove',[{x:P0[0]+d,y:P0[1],id:1}]);await tillGame(.25);await frame.evaluate(()=>window.__boar.aim(-.9,-.05));await tillFrames(1);
      const s0=await st();const s1=await tillGame(.6);const v=(s1.aim.x-s0.aim.x)/(s1.elapsed-s0.elapsed);rows.push({thumbPx:d,tiltPct:Math.round(Math.min(1,d/Rr)*100),unitsPerS:+v.toFixed(4),pxPerS:+(v*W/2).toFixed(1),crossScreenS:v>0?+(1.9/v).toFixed(1):null,clamped:Math.abs(s1.aim.x)>=.94,yDrift:+(s1.aim.y-s0.aim.y).toFixed(4),shots:s1.shots-s0.shots});}
    await touch('touchEnd',[{x:P0[0]+80,y:P0[1],id:1}]);const r0=await st();await tillGame(.4);const r1=await st();
    return {R:Rr,rows,releaseDrift:+Math.hypot(r1.aim.x-r0.aim.x,r1.aim.y-r0.aim.y).toFixed(5),stickAfterRelease:r0.stickInfo};});
  await step('C5_nudges',async()=>{const rows=[];for(const d of [10,16,24]){await frame.evaluate(()=>window.__boar.aim(-.5,-.05));await tillFrames(1);const a=await st();
      await touch('touchStart',[{x:P0[0],y:P0[1],id:1}]);await touch('touchMove',[{x:P0[0]+d,y:P0[1],id:1}]);const h0=await st();await tillGame(.2);const h1=await st();await touch('touchEnd',[{x:P0[0]+d,y:P0[1],id:1}]);const r0=await st();await tillGame(.3);const r1=await st();
      rows.push({thumbPx:d,heldGame:+(h1.elapsed-h0.elapsed).toFixed(3),movedPx:+((r0.aim.x-a.aim.x)*W/2).toFixed(1),afterReleasePx:+((r1.aim.x-r0.aim.x)*W/2).toFixed(2)});}return {rows};});
  await step('C5_precisionFinger',async()=>{const Rr=(await st()).stickR;await frame.evaluate(()=>window.__boar.aim(0,-.8));await touch('touchStart',[{x:P0[0],y:P0[1],id:1}]);await touch('touchMove',[{x:P0[0],y:P0[1]-Rr-15,id:1}]);await tillGame(.25);
    const meas=async()=>{await frame.evaluate(()=>window.__boar.aim(0,-.8));await tillFrames(1);const s0=await st();const s1=await tillGame(.5);return +((s1.aim.y-s0.aim.y)/(s1.elapsed-s0.elapsed)).toFixed(4);};
    const full=await meas();await touch('touchStart',[{x:P0[0],y:P0[1]-Rr-15,id:1},{x:60,y:360,id:5}]);await tillGame(.25);const q=await st();
    const ring=await frame.evaluate(()=>{const r=document.getElementById('aim-ring');return {cls:r?.className||null,label:r?getComputedStyle(r,'::after').content:null};});await shot('precise');
    const precise=await meas();await touch('touchEnd',[{x:60,y:360,id:5}]);await tillGame(.25);const back=await meas();
    // the first finger lifts while the second one stays on the stick zone: does the second finger take over?
    await touch('touchStart',[{x:P0[0],y:P0[1]-Rr-15,id:1},{x:60,y:360,id:5}]);await tillFrames(2);await touch('touchEnd',[{x:P0[0],y:P0[1]-Rr-15,id:1}]);await tillFrames(2);const left=await st();
    await slide(5,[60,360],[60,300],6);await tillFrames(2);const left2=await st();await touch('touchEnd',[{x:60,y:300,id:5}]);await tillFrames(2);
    return {fullUnitsPerS:full,preciseUnitsPerS:precise,ratio:full?+(precise/full).toFixed(3):null,preciseFlag:q.stickInfo?.precise??null,ring,afterSecondFingerLifts:back,
      firstLiftsSecondStays:{stick:left.stick,aimMoveWhenSecondDrags:+Math.hypot(left2.aim.x-left.aim.x,left2.aim.y-left.aim.y).toFixed(4)}};});
  await step('C5_edgeThumb',async()=>{const rows=[];for(const [start,to,label] of [[[40,320],[0,320],'thumb lands 40 px from the left edge, pushes left to the edge'],[[O[0],O[1]],[Math.max(0,O[0]-120),O[1]],'thumb on the rest-ring centre, pushes left to the edge']]){
      await frame.evaluate(()=>window.__boar.aim(.9,-.05));await touch('touchStart',[{x:start[0],y:start[1],id:1}]);await touch('touchMove',[{x:to[0],y:to[1],id:1}]);await tillGame(.25);await frame.evaluate(()=>window.__boar.aim(.9,-.05));await tillFrames(1);
      const s0=await st();const s1=await tillGame(.5);await touch('touchEnd',[{x:to[0],y:to[1],id:1}]);await tillFrames(2);rows.push({label,start,to,unitsPerS:+((s1.aim.x-s0.aim.x)/(s1.elapsed-s0.elapsed)).toFixed(4)});}return {rows};});
}

// ---------- complaint 4: smoothness of a slow drag, a circle and a flick, recorded every frame by the game ----------
const trOf=async fn=>{await frame.evaluate(()=>{window.__boar.record(true);});await tillFrames(1);await frame.evaluate(()=>window.__boar.trace());await fn();const tr=await frame.evaluate(()=>window.__boar.trace());await frame.evaluate(()=>window.__boar.record(false));return tr;};
const sd=a=>{const m=a.reduce((s,v)=>s+v,0)/(a.length||1);return {mean:m,sd:Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length||1))};};
function ramp(tr,axis,sign,sent,R_,dz){const sc=axis==='x'?W/2:H/2;const fr=tr.filter(f=>f.s===1&&Math.abs(f.x)<.94&&Math.abs(f.y)<.84);if(fr.length<4)return {error:'too few frames',frames:fr.length};const m0=fr[0].m;const d=[];
  for(let i=1;i<fr.length;i++){const px=sign*(fr[i][axis]-fr[i-1][axis])*sc;d.push({px,dt:fr[i].dt,sp:fr[i].dt>0?px/fr[i].dt:0,nm:fr[i].m!==fr[i-1].m,moves:fr[i].m-m0,v:fr[i].v,r:fr[i].r});}
  const first=d.findIndex(x=>x.px>1e-6),last=d.findIndex(x=>x.moves>=sent);const rampF=d.slice(first+1,last>0?last+1:d.length);let flat=0,drops=0;
  for(let i=1;i<rampF.length;i++){const a=rampF[i-1].sp,b=rampF[i].sp;if(a>0&&Math.abs(b-a)/a<.005)flat++;if(b<a*.98)drops++;}
  let acc=0;const hold=(last>=0?d.slice(last+1):[]).filter(x=>(acc+=x.dt)>.2);const hs=sd(hold.map(x=>x.sp));const holdMean=hs.mean||1;
  const jumps=[];for(let i=Math.max(1,first+1);i<d.length;i++)jumps.push(Math.abs(d[i].sp-d[i-1].sp));
  let stall=0,run=0;for(const x of d){if(x.moves>dz*R_+1&&x.px<=1e-6){run++;stall=Math.max(stall,run);}else run=0;}
  return {frames:d.length,dtMedian:[...d.map(x=>x.dt)].sort((a,b)=>a-b)[d.length>>1],sentMoves:sent,receivedMoves:fr.at(-1).m-m0,firstMoveAfterThumbPx:first>=0?d[first].moves:null,firstStepPx:first>=0?+d[first].px.toFixed(3):null,firstSpeedPxS:first>=0?+d[first].sp.toFixed(1):null,
    rampFrames:rampF.length,rampFlatFrames:flat,rampSpeedDrops:drops,maxSpeedJumpPxS:jumps.length?+Math.max(...jumps).toFixed(1):null,maxSpeedJumpPctOfHold:jumps.length?+(Math.max(...jumps)/holdMean*100).toFixed(1):null,stallMaxFrames:stall,
    movedWithoutPointermove:d.filter(x=>x.px>1e-6&&!x.nm).length,holdFrames:hold.length,holdSpeedPxS:+hs.mean.toFixed(1),holdSpeedCvPct:hs.mean?+(hs.sd/hs.mean*100).toFixed(2):null,resChanges:fr.at(-1).r-fr[0].r,
    speeds:d.map(x=>+x.sp.toFixed(1)),moves:d.map(x=>x.moves)};}
if(await hasStick()){
  const Rr=(await st()).stickR,dz=Rr===80?.08:.12;
  for(const [name,dir,aim0] of [['C4_slowDragRight',[1,0],[-.6,-.3]],['C4_slowDragUp',[0,-1],[0,-.7]]]){
    await step(name,async()=>{await frame.evaluate(([x,y])=>window.__boar.aim(x,y),aim0);const N=24;let after=null;
      const tr=await trOf(async()=>{await touch('touchStart',[{x:P0[0],y:P0[1],id:1}]);await tillFrames(2);for(let i=1;i<=N;i++){await touch('touchMove',[{x:P0[0]+dir[0]*i,y:P0[1]+dir[1]*i,id:1}]);await tillFrames(2);}
        await tillFrames(30);await touch('touchEnd',[{x:P0[0]+dir[0]*N,y:P0[1]+dir[1]*N,id:1}]);const r0=await st();await tillFrames(10);const r1=await st();after={driftAfterRelease10f:+Math.hypot(r1.aim.x-r0.aim.x,r1.aim.y-r0.aim.y).toFixed(5)};});
      const a=ramp(tr,dir[0]?'x':'y',dir[0]?1:1,N,Rr,dz);return {thumb:'1 px every 2 game frames to 24 px, hold 30 frames',...a,...after};});}
  await step('C4_circle',async()=>{await frame.evaluate(()=>window.__boar.aim(0,-.1));const r=40;
    const tr=await trOf(async()=>{await touch('touchStart',[{x:P0[0],y:P0[1],id:1}]);await slide(1,P0,[P0[0]+r,P0[1]],4);for(let k=1;k<=48;k++){const an=k*Math.PI/24;await touch('touchMove',[{x:P0[0]+r*Math.cos(an),y:P0[1]+r*Math.sin(an),id:1}]);await tillFrames(2);}await touch('touchEnd',[{x:P0[0]+r,y:P0[1],id:1}]);await tillFrames(2);});
    const fr=tr.filter(f=>f.s===1&&Math.abs(f.x)<.94&&Math.abs(f.y)<.84);const hd=[],sp=[];let prev=null;
    for(let i=1;i<fr.length;i++){const dx=(fr[i].x-fr[i-1].x)*W/2,dy=-(fr[i].y-fr[i-1].y)*H/2;const m=Math.hypot(dx,dy);if(m<1e-6)continue;sp.push(m/fr[i].dt);const h=Math.atan2(dy,dx)*180/Math.PI;if(prev!==null){let dh=h-prev;while(dh>180)dh-=360;while(dh<-180)dh+=360;hd.push(dh);}prev=h;}
    const tail=hd.slice(6),sps=sd(sp.slice(8));return {thumb:'circle radius 40 px, one move every 2 game frames (48 per turn)',frames:fr.length,headingSteps:tail.length,zeroTurnFrames:tail.filter(x=>Math.abs(x)<.05).length,maxTurnDeg:tail.length?+Math.max(...tail.map(Math.abs)).toFixed(1):null,
      turnSdDeg:+sd(tail.map(Math.abs)).sd.toFixed(2),speedCvPct:sps.mean?+(sps.sd/sps.mean*100).toFixed(1):null,turns:tail.map(x=>+x.toFixed(1))};});
  await step('C4_flick',async()=>{await frame.evaluate(()=>window.__boar.aim(-.8,-.05));
    const tr=await trOf(async()=>{await touch('touchStart',[{x:P0[0],y:P0[1],id:1}]);await tillFrames(2);await touch('touchMove',[{x:P0[0]+48,y:P0[1],id:1}]);await tillFrames(12);await touch('touchEnd',[{x:P0[0]+48,y:P0[1],id:1}]);await tillFrames(3);});
    const fr=tr.filter(f=>f.s===1&&Math.abs(f.x)<.94);const s=[];for(let i=1;i<fr.length;i++)s.push(fr[i].dt>0?(fr[i].x-fr[i-1].x)*W/2/fr[i].dt:0);const i0=s.findIndex(v=>v>1e-6);const top=Math.max(...s);
    const to90=s.slice(i0).findIndex(v=>v>=top*.9);const dts=fr.slice(1).map(f=>f.dt);
    return {thumb:'one jump to 48 px, hold 12 frames',speeds:s.map(v=>+v.toFixed(1)),firstFramePctOfTop:+(s[i0]/top*100).toFixed(1),framesTo90pct:to90,gameMsTo90pct:+(dts.slice(i0,i0+to90+1).reduce((a,b)=>a+b,0)*1000).toFixed(0),topPxS:+top.toFixed(1)};});
}

// ---------- the island pause / resume, then the stick still only aims ----------
await step('pauseResume',async()=>{const p=await page.evaluate(()=>{const b=document.querySelector('[data-action=game-pause]');if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height];});if(!p)return {skipped:'no island pause button'};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p[0],y:p[1],id:7}]});await sleep(90);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:p[0],y:p[1],id:7}]});await sleep(1500);
  const paused=await st();await shot('pause');const res=await page.evaluate(()=>{const b=document.querySelector('[data-action=game-resume]');if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];});
  if(res){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:res[0],y:res[1],id:7}]});await sleep(90);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:res[0],y:res[1],id:7}]});}
  await sleep(1500);await tillFrames(3);const a=await st();let b=a;if(await hasStick()){await touch('touchStart',[{x:O[0],y:O[1],id:1}]);await slide(1,O,[O[0]+40,O[1]-20],8);await tillFrames(4);b=await st();await touch('touchEnd',[{x:O[0]+40,y:O[1]-20,id:1}]);await tillFrames(2);}
  return {pauseBtn:p,pausedFlag:paused.paused,resumeFound:!!res,resumedFlag:a.paused,afterResume:{aimMove:+Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y).toFixed(4),shots:b.shots-a.shots},blurCount:b.qa3.blur};});

// ---------- the sensitivity setting in the game menu (new build only) ----------
if(MODE==='after'&&!lost){
  await step('C5_sensitivitySetting',async()=>{await frame.evaluate(()=>window.__boar.menu());await tillFrames(2);const b=await rect('aim-sens');if(!b)return {skipped:'no #aim-sens'};const label0=await frame.evaluate(()=>document.getElementById('aim-sens').textContent);
    await touch('touchStart',[{x:b.cx,y:b.cy,id:8}]);await sleep(90);await touch('touchEnd',[{x:b.cx,y:b.cy,id:8}]);await tillFrames(2);
    const label1=await frame.evaluate(()=>document.getElementById('aim-sens').textContent),stored=await frame.evaluate(()=>localStorage.getItem('boar-island-aim'));await shot('sensitivity');
    const s=await rect('start');await touch('touchStart',[{x:s.cx,y:s.cy,id:9}]);await sleep(90);await touch('touchEnd',[{x:s.cx,y:s.cy,id:9}]);await frame.waitForFunction(()=>window.__boar.state.mode==='battle');await tillFrames(3);
    await touch('touchStart',[{x:P0[0],y:P0[1],id:1}]);await touch('touchMove',[{x:P0[0]+95,y:P0[1],id:1}]);await tillGame(.25);await frame.evaluate(()=>window.__boar.aim(-.9,-.05));await tillFrames(1);const s0=await st();const s1=await tillGame(.4);
    await touch('touchEnd',[{x:P0[0]+95,y:P0[1],id:1}]);await tillFrames(2);const v=(s1.aim.x-s0.aim.x)/(s1.elapsed-s0.elapsed);
    return {label0,label1,stored,aimSensState:s1.aimSens,fullTiltUnitsPerS:+v.toFixed(4),ratioToMid:+(v/1.6).toFixed(3),saveHasAimKey:await frame.evaluate(()=>{try{return 'aim' in JSON.parse(localStorage.getItem('boar-island-v1')||'{}')||/aimSens|boar-island-aim/.test(localStorage.getItem('boar-island-v1')||'');}catch{return null;}})};});
}

// ---------- end: leave through the island (pause -> exit), the save, focus, CSP, errors ----------
R.final=lost?null:await st().catch(()=>null);
R.focus=R.final?.qa3||null;
try{const p=await page.evaluate(()=>{const b=document.querySelector('[data-action=game-pause]');const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];});
  await page.touchscreen.tap(p[0],p[1]);await sleep(1200);const ex=await page.evaluate(()=>{const b=document.querySelector('[data-action=game-exit]');if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];});
  if(ex){await page.touchscreen.tap(ex[0],ex[1]);await sleep(2500);}R.exit={exitFound:!!ex,frameGone:!(await page.locator('iframe.boar-game-frame').count())};}catch(e){R.exit={error:e.message.split('\n')[0]};}
R.save=await page.evaluate(()=>{const v=localStorage.getItem('boar-island-v1');if(!v)return null;const o=JSON.parse(v);return {keys:Object.keys(o).sort(),weapons:Object.keys(o.weapons||{}).sort(),upgrades:Object.keys(o.upgrades||{}).sort(),
  otherBoarKeys:Object.keys(localStorage).filter(k=>k.startsWith('boar')).sort(),aimKey:localStorage.getItem('boar-island-aim')};});
{const chain=await import(new URL('../../../minigames/boar-island/chain.mjs',import.meta.url).href);const f=chain.freshSave();R.saveExpected={keys:Object.keys(f).sort(),weapons:Object.keys(f.weapons).sort(),upgrades:Object.keys(f.upgrades).sort()};
  R.saveNewFields=R.save?{top:R.save.keys.filter(k=>!R.saveExpected.keys.includes(k)),weapons:R.save.weapons.filter(k=>!R.saveExpected.weapons.includes(k)),upgrades:R.save.upgrades.filter(k=>!R.saveExpected.upgrades.includes(k))}:null;}
try{await csp.assertClean();R.csp='clean';}catch(e){R.csp=String(e.message).slice(0,800);}
R.errors=errors;R.frameLost=lost;R.wallSeconds=Math.round((Date.now()-t0)/1000);
await writeFile(out+`qa3-boar-${MODE}.json`,JSON.stringify(R,null,1)+'\n');
log('done: errors',errors.length,'csp',R.csp==='clean'?'clean':'NOT CLEAN','save new fields',JSON.stringify(R.saveNewFields),'lost',lost);
await csp.dispose().catch(()=>{});await browser.close();await server.close();
