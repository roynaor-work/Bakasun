// Independent QA scenario for the boar game (11/11/2026). MODE=after|v20
import {serveIsland,islandChromium} from '../../../../../tests/helpers/island-browser.mjs';
import {writeFile} from 'node:fs/promises';
const MODE=process.env.MODE||'after';const out=new URL('./',import.meta.url).pathname;
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
const page=await ctx.newPage();page.setDefaultTimeout(240000);const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
const log=(...a)=>console.error('['+MODE+']',...a);
const query='?dev=1'+(MODE==='v20'?'&boarFire=v20&boarHud=v20&boarStick=v20':'');
await page.goto(server.url+query,{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
await page.locator('[data-action=avatar-start]').tap();
await page.evaluate(()=>{const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;});
await page.evaluate(()=>window.__island.games.start('boarDefense'));
if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').tap();
await page.waitForFunction(()=>document.querySelector('.game-screen')?.dataset.starting==='false');
const frameEl=page.locator('iframe.boar-game-frame');await frameEl.waitFor();
const frame=await (await frameEl.elementHandle()).contentFrame();
await frame.waitForFunction(()=>window.__boar&&window.__boarIsland?.ready);
const box=await frameEl.boundingBox();log('frame box',box);
const saveBefore=await frame.evaluate(()=>localStorage.getItem('boar-island-v1'));
const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x+box.x,y:p.y+box.y,id:p.id??1}))});
const wait=ms=>page.waitForTimeout(ms);
const st=()=>frame.evaluate(()=>{const s=window.__boar.state;return {shots:s.shots,frames:s.frames,elapsed:s.elapsed,aim:s.aim,firing:s.firing,fireHeld:s.fireHeld,stick:s.stick,stickInfo:s.stickInfo,shotsBy:s.shotsBy,stickNoButton:s.stickNoButton,abilityBy:s.abilityBy,abilityFromLeft:s.abilityFromLeft,current:s.current,heat:s.heat,mode:s.mode,enemies:s.enemies.length,flags:s.flags,stickR:s.stickR,rocketDis:document.getElementById('rocket')?.disabled,frostDis:document.getElementById('frost')?.disabled};});
const tillFrames=async(n,ms=60000)=>{const f0=(await st()).frames,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.frames>=f0+n)return s;await wait(80);}return st();};
const tillGame=async(sec,ms=150000)=>{const e0=(await st()).elapsed,t=Date.now();while(Date.now()-t<ms){const s=await st();if(s.elapsed>=e0+sec)return s;await wait(80);}return st();};
const cool=async()=>{for(let i=0;i<60;i++){if(((await st()).heat||0)<15)return;await wait(250);}};
const shotPic=n=>page.screenshot({path:out+`boar-${MODE}-${n}.jpg`,type:'jpeg',quality:82});
const R={mode:MODE,query,steps:{}};
await frame.evaluate(()=>window.__boar.start(1));await wait(1500);
await frame.evaluate(()=>{window.__boar.spawn('scout',-20);window.__boar.spawn('scout',-24);window.__boar.spawn('scout',-28);});
await tillFrames(3);
R.flags=(await st()).flags;
R.layout=await frame.evaluate(()=>{const r=e=>{if(!e)return null;const cs=getComputedStyle(e);if(cs.display==='none'||e.hidden)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];};
 const at=(x,y)=>{const e=document.elementFromPoint(x,y);return e?(e.closest('button')?.id||e.id||e.className||e.tagName):null;};
 return {aimZone:r(document.getElementById('aim-zone')),aimRest:r(document.getElementById('aim-rest')),fireBtn:r(document.getElementById('fire-btn')),weaponBtn:r(document.getElementById('weapon-btn')),rocket:r(document.getElementById('rocket')),frost:r(document.getElementById('frost')),fury:r(document.getElementById('fury')),
  under:Object.fromEntries([[60,200],[180,200],[290,200],[150,290],[40,370],[422,195],[600,150]].map(([x,y])=>[x+','+y,at(x,y)]))};});
log('layout',JSON.stringify(R.layout));
await shotPic('wave');
// (e) HUD coverage, two methods: A = fix agent's selector list; B = generic: every visible painting element in the frame (bg/border/text/img), not the canvas, not a >40% container
R.hud=await frame.evaluate(()=>{const W=innerWidth,H=innerHeight,g=2,GW=Math.ceil(W/g),GH=Math.ceil(H/g);
 const vis=e=>{if(e.closest('[hidden]'))return false;const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden')return false;let p=e;while(p&&p.nodeType===1){if(+getComputedStyle(p).opacity===0)return false;p=p.parentElement;}const b=e.getBoundingClientRect();return b.width>2&&b.height>2&&b.right>0&&b.bottom>0&&b.left<W&&b.top<H;};
 const ctrlIds=['aim-zone','aim-rest','aim-ring','fire-btn'];const isCtrl=e=>ctrlIds.some(id=>e.id===id||e.closest('#'+id));
 const transp=c=>!c||c==='transparent'||/rgba\(\d+, \d+, \d+, 0\)/.test(c);
 const paints=e=>{const cs=getComputedStyle(e);const hasBg=!transp(cs.backgroundColor)||cs.backgroundImage!=='none';const txt=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());const bord=parseFloat(cs.borderTopWidth)>0&&!transp(cs.borderTopColor);return hasBg||txt||bord||e.tagName==='IMG'||e.tagName==='svg';};
 const all=[...document.querySelectorAll('body *')].filter(e=>e.tagName!=='CANVAS'&&e.id!=='scene'&&!e.closest('#scene')&&vis(e)&&paints(e)).map(e=>({e,b:e.getBoundingClientRect()})).filter(o=>o.b.width*o.b.height<.4*W*H);
 const paint=list=>{const grid=new Uint8Array(GW*GH);for(const r of list){const x0=Math.max(0,Math.floor(r.left/g)),x1=Math.min(GW,Math.ceil(r.right/g)),y0=Math.max(0,Math.floor(r.top/g)),y1=Math.min(GH,Math.ceil(r.bottom/g));for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)grid[y*GW+x]=1;}return grid;};
 const frac=(grid,y0=0,y1=GH)=>{let n=0;for(let y=y0;y<y1;y++)for(let x=0;x<GW;x++)n+=grid[y*GW+x];return +(n/(GW*(y1-y0))).toFixed(4);};
 const nc=all.filter(o=>!isCtrl(o.e)).map(o=>o.b),wc=all.map(o=>o.b);
 const sel='.brand,.coin-block,.health-block,.wave-block,.top-controls button,.ammo-panel,.wslot,.ability,#weapon-btn,#battle-hint,#boss-hud';
 const A=[...document.querySelectorAll(sel)].filter(vis).map(e=>e.getBoundingClientRect());
 const band=[Math.floor(110/g),Math.ceil(290/g)];
 const gA=paint(A),gB=paint(nc),gBc=paint(wc);
 return {selectorList:{hud:frac(gA),band:frac(gA,...band)},generic:{hud:frac(gB),band:frac(gB,...band),nodes:nc.length},genericWithControls:{hud:frac(gBc),band:frac(gBc,...band)},
  nodes:all.filter(o=>!isCtrl(o.e)).map(o=>(o.e.id||String(o.e.className)||o.e.tagName)+':'+[o.b.x,o.b.y,o.b.width,o.b.height].map(Math.round).join('x')).slice(0,60)};});
log('hud',JSON.stringify(R.hud));
const sumBy=o=>Object.values(o).reduce((x,y)=>x+y,0);
const d=(a,b)=>({shots:b.shots-a.shots,frames:b.frames-a.frames,game:+(b.elapsed-a.elapsed).toFixed(2),abilities:['rocket','frost','fury'].reduce((n,k)=>n+(b.abilityBy[k]-a.abilityBy[k]),0),abilityFromLeft:b.abilityFromLeft-a.abilityFromLeft,aimFrom:a.aim,aimTo:b.aim,aimMoved:+Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y).toFixed(3),rocketDis:[a.rocketDis,b.rocketDis],frostDis:[a.frostDis,b.frostDis],enemies:b.enemies});
async function step(name,fn){try{const a=await st();const x=await fn()||{};const b=await st();R.steps[name]={...d(a,b),...x};}catch(e){R.steps[name]={error:String(e.message||e).split('\n')[0]};}log(name,JSON.stringify(R.steps[name]));}
const resetAim=()=>frame.evaluate(()=>window.__boar.aim(0,-.05));
// (a) 3 taps on the scene centre + a 1 s drag across the scene
await step('a_sceneTapsDrag',async()=>{for(let i=0;i<3;i++){await touch('touchStart',[{x:422,y:195}]);await wait(120);await touch('touchEnd',[]);await wait(200);}
 await touch('touchStart',[{x:300,y:200}]);const t=Date.now();let i=0;while(Date.now()-t<1000){i++;await touch('touchMove',[{x:300+(i*20)%400,y:200-(i*3)%80}]);await wait(50);}await touch('touchEnd',[]);await tillFrames(3);});
// (b) left stick 2 s in several directions, then out of the zone; plus drags starting where the v20 ability buttons sat
await resetAim();
await step('b_stickMulti',async()=>{const o={x:150,y:290};await touch('touchStart',[o]);const dirs=[[60,-50],[-60,0],[0,60],[0,-80],[70,30]];
 const t=Date.now();let k=0;while(Date.now()-t<2000){const [dx,dy]=dirs[k%dirs.length];await touch('touchMove',[{x:o.x+dx,y:o.y+dy}]);k++;await wait(130);}
 const mid=await st();for(let i=1;i<=8;i++){await touch('touchMove',[{x:o.x+i*60,y:o.y-i*20}]);await wait(80);}await wait(300);const out1=await st();await touch('touchEnd',[]);await tillFrames(2);
 return {stickWhileHeld:mid.stick,stickOutsideZone:out1.stick};});
await shotPic('stick');
await resetAim();
if(process.env.TAPS){await resetAim();await step('b_v20Taps',async()=>{const per=[];for(const [x,y] of [[180,200],[290,200]]){const a=await st();await touch('touchStart',[{x,y}]);await wait(120);await touch('touchEnd',[]);await tillFrames(2);const b=await st();per.push({at:[x,y],abilityBy:b.abilityBy,abilities:['rocket','frost','fury'].reduce((n,k)=>n+(b.abilityBy[k]-a.abilityBy[k]),0),aimMoved:+Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y).toFixed(3)});}return {per};});await browser.close();await server.close();process.exit(0);}
await step('b_leftThumbStarts',async()=>{const per=[];for(const [x,y] of [[60,200],[180,200],[290,200],[100,250]]){const a=await st();await touch('touchStart',[{x,y}]);for(let i=1;i<=5;i++){await touch('touchMove',[{x:x+i*6,y:y-i*6}]);await wait(90);}await touch('touchEnd',[]);await tillFrames(2);const b=await st();
  per.push({at:[x,y],abilities:['rocket','frost','fury'].reduce((n,k)=>n+(b.abilityBy[k]-a.abilityBy[k]),0),shots:b.shots-a.shots,aimMoved:+Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y).toFixed(3)});}return {per};});
// (c) hold fire 1 s, stray tap with a second finger, release
await cool();
await step('c_fireHold',async()=>{const b=R.layout.fireBtn;if(!b)return {skipped:'no fire button'};const bx=b[0]+b[2]/2,by=b[1]+b[3]/2;const a=await st();
 await touch('touchStart',[{x:bx,y:by,id:2}]);await wait(1000);await tillFrames(2);const held=await st();await shotPic('fire');
 await touch('touchStart',[{x:bx,y:by,id:2},{x:422,y:195,id:3}]);await wait(120);await touch('touchEnd',[{x:422,y:195,id:3}]);await wait(80);const s2=await st();const s3=await tillFrames(5);
 await touch('touchEnd',[{x:bx,y:by,id:2}]);await wait(150);const rel=await st();const rel2=await tillFrames(5);
 return {heldShots:held.shots-a.shots,byButton:held.shotsBy.button-a.shotsBy.button,totalBy:sumBy(held.shotsBy)-sumBy(a.shotsBy),heldFiring:held.firing,
  afterStray:{firing:s2.firing,fireHeld:s2.fireHeld,shotsNext5Frames:s3.shots-s2.shots},afterRelease:{firing:rel.firing,shotsNext5Frames:rel2.shots-rel.shots}};});
// (d) the weapon-switch button once
await step('d_weaponBtn',async()=>{await frame.evaluate(()=>{const s=window.__boar.state.save;s.weapons.shotgun=s.weapons.shotgun||1;window.__boar.setSave(s);});await tillFrames(1);
 const b=await frame.evaluate(()=>{const e=document.getElementById('weapon-btn');if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height];});
 if(!b)return {skipped:'no weapon button'};const a=await st();await touch('touchStart',[{x:b[0],y:b[1],id:4}]);await wait(120);await touch('touchEnd',[{x:b[0],y:b[1],id:4}]);await tillFrames(3);const c=await st();return {size:[b[2],b[3]],before:a.current,after:c.current};});
// (f) precision: 20%, 50%, 100% tilt, 1 s of game time each; after release the aim must stay put over 1 s of game time
await cool();await resetAim();
const speed=async(frac,dir)=>{const Rr=(await st()).stickR;const o={x:150,y:290};await touch('touchStart',[{...o,id:1}]);await touch('touchMove',[{x:o.x+Math.round(Rr*frac*dir[0]),y:o.y+Math.round(Rr*frac*dir[1]),id:1}]);await tillFrames(3);
 const s0=await st();const s1=await tillGame(1);await touch('touchEnd',[{x:o.x,y:o.y,id:1}]);const r0=await st();const r1=await tillGame(1);
 return {R:Rr,frac,game:+(s1.elapsed-s0.elapsed).toFixed(3),vx:+((s1.aim.x-s0.aim.x)/(s1.elapsed-s0.elapsed)).toFixed(3),vy:+((s1.aim.y-s0.aim.y)/(s1.elapsed-s0.elapsed)).toFixed(3),clamped:Math.abs(s1.aim.x)>=.94||Math.abs(s1.aim.y)>=.84,driftAfterRelease:+Math.hypot(r1.aim.x-r0.aim.x,r1.aim.y-r0.aim.y).toFixed(4),stickAfterRelease:r0.stickInfo,shots:s1.shots-s0.shots};};
await step('f_precision',async()=>{const res={};await frame.evaluate(()=>window.__boar.aim(-.9,-.05));res.p20=await speed(.2,[1,0]);await frame.evaluate(()=>window.__boar.aim(-.9,-.05));res.p50=await speed(.5,[1,0]);
 await frame.evaluate(()=>window.__boar.aim(-.9,-.05));res.p100=await speed(1,[1,0]);await frame.evaluate(()=>window.__boar.aim(0,-.8));res.p100up=await speed(1,[0,-1]);return res;});
R.final=await st();R.errors=errors;
R.saveKeys={before:saveBefore?Object.keys(JSON.parse(saveBefore)).sort():null,after:await frame.evaluate(()=>{const v=localStorage.getItem('boar-island-v1');return v?Object.keys(JSON.parse(v)).sort():null;}),aimKey:await frame.evaluate(()=>localStorage.getItem('boar-island-aim'))};
await writeFile(out+`qa-${MODE}.json`,JSON.stringify(R,null,1));console.log(JSON.stringify({steps:R.steps,hud:{...R.hud,nodes:undefined},errors},null,1));
await browser.close();await server.close();
