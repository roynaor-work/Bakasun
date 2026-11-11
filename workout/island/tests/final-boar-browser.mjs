// Acceptance test for the boar game ("חזירים") through the REAL island shell with real touch (11/11/2026).
// Run: ISLAND_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs node workout/island/tests/final-boar-browser.mjs
//   MODE=after  (default) the fixed code: every shot must come from the fire button, the left stick only moves the aim.
//   MODE=v20    `?boarFire=v20` on the island URL: the v20 code (ability buttons inside the stick zone, F and mouse fire, a stray scene touch releases the button).
//   MODE=before `?boar=v1`: the code Roy's phone ran (v19 on the live site): any touch on the scene aims and fires.
// Exit code: MODE=after exits 1 on any failure. MODE=before/v20 exit 0 only when the old code is caught failing (the test proves it can see the bug) and 2 otherwise.
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const MODE=process.env.MODE||'after';
const out=new URL('../verification/final-fix-fable/',import.meta.url).pathname;await mkdir(out+'frames/',{recursive:true});
const server=await serveIsland('/workout/island/'),chromium=await islandChromium();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:Number(process.env.DPR||1)});
await ctx.addInitScript(()=>{try{localStorage.setItem('boar-island-quality','normal');localStorage.setItem('island.sound','off');}catch{}});
const page=await ctx.newPage();page.setDefaultTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const log=(...a)=>console.error('['+MODE+']',...a);
const query='?dev=1'+(MODE==='before'?'&boar=v1':MODE==='v20'?'&boarFire=v20':'');
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
const box=await frameEl.boundingBox();log('frame',box,'url',frame.url());
const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x+box.x,y:p.y+box.y,id:p.id??1}))});
const mouse=(type,x,y,button='left')=>cdp.send('Input.dispatchMouseEvent',{type,x:x+box.x,y:y+box.y,button,clickCount:1,pointerType:'mouse'});
const wait=ms=>page.waitForTimeout(ms);
const st=()=>frame.evaluate(()=>{const s=window.__boar.state;return {shots:s.shots,shotsBy:s.shotsBy||{},stickNoButton:s.stickNoButton||0,abilityBy:s.abilityBy||{},abilityFromLeft:s.abilityFromLeft||0,aim:s.aim,firing:s.firing,stick:s.stick,fireHeld:s.fireHeld,flags:s.flags||{},mode:s.mode,hp:s.hp,enemies:s.enemies.length};});
const shot=name=>page.screenshot({path:out+`frames/boar-${MODE}-${name}.jpg`,type:'jpeg',quality:80});
const env=await frame.evaluate(()=>({coarse:matchMedia('(pointer:coarse)').matches,hoverNone:matchMedia('(hover:none)').matches,maxTouchPoints:navigator.maxTouchPoints,fireBtn:!!document.getElementById('fire-btn'),aimZone:!!document.getElementById('aim-zone'),landscape:innerWidth>innerHeight}));
await frame.evaluate(()=>window.__boar.start(1));await wait(1500);
await frame.evaluate(()=>{window.__boar.spawn('scout',-20);window.__boar.spawn('scout',-24);});
const layout=await frame.evaluate(()=>{const at=(x,y)=>{const e=document.elementFromPoint(x,y);return e?(e.closest('button')?.id||e.id||e.className||e.tagName):null;};const r=id=>{const e=document.getElementById(id);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];};
 return {aimZone:r('aim-zone'),fireBtn:r('fire-btn'),rocket:r('rocket'),frost:r('frost'),fury:r('fury'),under:Object.fromEntries([[60,200],[180,200],[290,200],[150,290],[120,300],[450,150],[650,110],[520,60]].map(([x,y])=>[x+','+y,at(x,y)]))};});
log('env',env);log('layout',layout);await shot('layout');
const results={mode:MODE,query,env,layout,steps:{}};
const nonButton=s=>Object.entries(s.shotsBy).filter(([k])=>k!=='button').reduce((n,[,v])=>n+v,0);
const diff=(a,b)=>({shots:b.shots-a.shots,nonButton:nonButton(b)-nonButton(a),button:(b.shotsBy.button||0)-(a.shotsBy.button||0),stickNoButton:b.stickNoButton-a.stickNoButton,abilities:Object.keys(b.abilityBy).reduce((n,k)=>n+(b.abilityBy[k]||0)-(a.abilityBy[k]||0),0),abilityFromLeft:b.abilityFromLeft-a.abilityFromLeft,aimFrom:a.aim,aimTo:b.aim,aimMoved:Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y)>.03});
async function step(name,fn){const a=await st();const extra=await fn()||{};const b=await st();results.steps[name]={...diff(a,b),...extra};log(name,JSON.stringify(results.steps[name]));}
// A) three taps on the scene (right half, away from every control)
await step('sceneTaps',async()=>{for(const [x,y] of [[450,150],[650,110],[520,60]]){await touch('touchStart',[{x,y}]);await wait(150);await touch('touchEnd',[]);await wait(120);}await wait(400);});
// B) a long drag on the scene
await step('sceneDrag',async()=>{await touch('touchStart',[{x:500,y:150}]);for(let i=1;i<=10;i++){await touch('touchMove',[{x:500+i*16,y:150+i*5}]);await wait(60);}await wait(400);await touch('touchEnd',[]);await wait(400);});
// C) a two-second stick drag with enemies in range
await step('stickDrag2s',async()=>{await touch('touchStart',[{x:150,y:290}]);for(let i=1;i<=20;i++){await touch('touchMove',[{x:150+Math.min(i,8)*6,y:290-Math.min(i,8)*5}]);await wait(100);}await shot('stick');await touch('touchEnd',[]);await wait(400);});
// D) a stick drag that leaves the stick zone (and crosses the weapon bar and the fire button)
await step('stickLeavesZone',async()=>{await touch('touchStart',[{x:120,y:300}]);for(let i=1;i<=10;i++){await touch('touchMove',[{x:120+i*62,y:300-i*18}]);await wait(70);}await wait(600);await touch('touchEnd',[]);await wait(400);});
// E) the left thumb where the v20 ability buttons sat (taps and a short upward drag)
await step('leftThumbAbilityRow',async()=>{const before=await st();for(const [x,y] of [[60,200],[180,200],[290,200]]){await touch('touchStart',[{x,y}]);await wait(150);await touch('touchEnd',[]);await wait(300);}
 const mid=await st();await touch('touchStart',[{x:60,y:210}]);for(let i=1;i<=8;i++){await touch('touchMove',[{x:60+i*4,y:210-i*7}]);await wait(80);}await wait(500);await touch('touchEnd',[]);await wait(400);const after=await st();
 return {tapsAbilities:Object.keys(mid.abilityBy).reduce((n,k)=>n+(mid.abilityBy[k]||0)-(before.abilityBy[k]||0),0),dragAimMoved:Math.hypot(after.aim.x-mid.aim.x,after.aim.y-mid.aim.y)>.03,abilityBy:after.abilityBy};});
// F) two fingers: stick (id 1) moving while the fire button (id 2) is held; release the button first, then the stick
await step('twoFingers',async()=>{const b=layout.fireBtn,bx=b[0]+b[2]/2,by=b[1]+b[3]/2;await touch('touchStart',[{x:140,y:300,id:1}]);await wait(100);await touch('touchStart',[{x:140,y:300,id:1},{x:bx,y:by,id:2}]);
 for(let i=1;i<=10;i++){await touch('touchMove',[{x:140+i*5,y:300-i*4,id:1},{x:bx,y:by,id:2}]);await wait(100);}await shot('twofinger');const held=await st();
 await touch('touchEnd',[{x:190,y:260,id:1}]);await wait(500);const afterRelease=await st();await touch('touchEnd',[]);await wait(300);const end=await st();
 return {heldFiring:held.firing,heldFireHeld:held.fireHeld,stickActiveWhileHeld:held.stick,shotsAfterButtonRelease:end.shots-afterRelease.shots,aimKeptAfterStickRelease:Math.hypot(end.aim.x-afterRelease.aim.x,end.aim.y-afterRelease.aim.y)<.02};});
// G) hold the fire button and tap the scene with another finger: firing must continue
await step('strayTapWhileHeld',async()=>{const b=layout.fireBtn,bx=b[0]+b[2]/2,by=b[1]+b[3]/2;await touch('touchStart',[{x:bx,y:by,id:2}]);await wait(600);const s1=await st();
 await touch('touchStart',[{x:bx,y:by,id:2},{x:520,y:130,id:3}]);await wait(120);await touch('touchEnd',[{x:bx,y:by,id:2}]);await wait(100);const s2=await st();await wait(800);const s3=await st();await touch('touchEnd',[]);await wait(300);
 return {shotsBeforeTap:s1.shots,firingAfterStrayTap:s2.firing,shotsAfterStrayTap:s3.shots-s2.shots};});
// H) keyboard F (the frame has focus, as on a phone with a keyboard)
await step('keyboardF',async()=>{await frame.evaluate(()=>document.getElementById('scene').focus());await page.keyboard.down('KeyF');await wait(800);await page.keyboard.up('KeyF');await wait(300);});
// I) mouse-type pointer on the scene
await step('mouseOnScene',async()=>{await mouse('mouseMoved',500,200);await mouse('mousePressed',500,200);await wait(700);await mouse('mouseReleased',500,200);await wait(300);});
// J) the fire button alone: shots, all from the button, aim unchanged
await step('fireButtonHold',async()=>{const b=layout.fireBtn,bx=b[0]+b[2]/2,by=b[1]+b[3]/2;await touch('touchStart',[{x:bx,y:by,id:2}]);await wait(1000);await shot('fire');const held=await st();await touch('touchEnd',[]);await wait(300);return {heldFiring:held.firing};});
const final=await st();results.final=final;results.errors=errors;
const checks=[];const ok=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
const S=results.steps;
ok('aimstick controls exist (fire button + stick zone) in the frame on a coarse-pointer phone',env.coarse&&env.fireBtn&&env.aimZone);
ok('scene taps: 0 shots',S.sceneTaps.shots===0,S.sceneTaps.shots);
ok('scene drag: 0 shots',S.sceneDrag.shots===0,S.sceneDrag.shots);
ok('2 s stick drag: 0 shots, aim moved',S.stickDrag2s.shots===0&&S.stickDrag2s.aimMoved,S.stickDrag2s);
ok('stick drag leaving the zone: 0 shots, aim moved',S.stickLeavesZone.shots===0&&S.stickLeavesZone.aimMoved,S.stickLeavesZone);
ok('left thumb where the ability row sat: no ability fired, no press counted inside the zone, drag moves the aim',S.leftThumbAbilityRow.tapsAbilities===0&&S.leftThumbAbilityRow.abilityFromLeft===0&&S.leftThumbAbilityRow.dragAimMoved,S.leftThumbAbilityRow);
ok('two fingers: shots only from the button, stick active, firing stops when the button is released, aim kept',S.twoFingers.button>0&&S.twoFingers.nonButton===0&&S.twoFingers.stickActiveWhileHeld&&S.twoFingers.shotsAfterButtonRelease===0&&S.twoFingers.aimKeptAfterStickRelease,S.twoFingers);
ok('stray scene tap while the button is held: firing continues',S.strayTapWhileHeld.firingAfterStrayTap&&S.strayTapWhileHeld.shotsAfterStrayTap>0,S.strayTapWhileHeld);
ok('keyboard F: 0 shots',S.keyboardF.shots===0,S.keyboardF.shots);
ok('mouse on the scene: 0 shots',S.mouseOnScene.shots===0,S.mouseOnScene.shots);
ok('fire button alone: shots, aim unchanged',S.fireButtonHold.shots>0&&S.fireButtonHold.button===S.fireButtonHold.shots&&!S.fireButtonHold.aimMoved,S.fireButtonHold);
ok('every shot in the run is attributed to the fire button',nonButton(final)===0&&final.stickNoButton===0,{shotsBy:final.shotsBy,stickNoButton:final.stickNoButton});
ok('no page errors',errors.length===0,errors);
results.checks=checks;
await writeFile(out+`boar-${MODE}.json`,JSON.stringify(results,null,1)+'\n');
console.log(JSON.stringify({mode:MODE,env,steps:S,final:{shots:final.shots,shotsBy:final.shotsBy,stickNoButton:final.stickNoButton,abilityBy:final.abilityBy,abilityFromLeft:final.abilityFromLeft},checks},null,1));
await browser.close();await server.close();
const failed=checks.filter(c=>!c.pass);
if(MODE==='after'){if(failed.length){console.error('FAILED:',failed.map(c=>c.name));process.exit(1);}console.error('all checks passed');}
else{if(!failed.length){console.error('old code ('+MODE+') passed every check: the test cannot see the bug');process.exit(2);}console.error('old code ('+MODE+') caught failing:',failed.map(c=>c.name));}
