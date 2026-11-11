// Acceptance test for the boar game ("חזירים") through the REAL island shell with real touch (11/11/2026).
// Run: ISLAND_PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs node workout/island/tests/final-boar-browser.mjs
//   MODE=after  (default) the fixed code: every shot must come from the fire button, the left stick only moves the aim.
//   MODE=v20    `?boarFire=v20&boarHud=v20&boarStick=v20` on the island URL: the v20 code (HUD cards included) (ability buttons inside the stick zone, F and mouse fire, a stray scene touch releases the button).
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
const query='?dev=1'+(MODE==='before'?'&boar=v1':MODE==='v20'?'&boarFire=v20&boarHud=v20&boarStick=v20':'');
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
// CDP: touchStart/touchMove list the active points; touchEnd lists the points being RELEASED (an empty list releases every remaining point).
const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(p=>({x:p.x+box.x,y:p.y+box.y,id:p.id??1}))});
const mouse=(type,x,y,button='left')=>cdp.send('Input.dispatchMouseEvent',{type,x:x+box.x,y:y+box.y,button,clickCount:1,pointerType:'mouse'});
const wait=ms=>page.waitForTimeout(ms);let dead=false;
const st=()=>frame.evaluate(()=>{const s=window.__boar.state;return {shots:s.shots,heat:s.heat,frames:s.frames||0,current:s.current,elapsed:s.elapsed||0,stickInfo:s.stickInfo||null,stickR:s.stickR||62,shotsBy:s.shotsBy||{},stickNoButton:s.stickNoButton||0,abilityBy:s.abilityBy||{},abilityFromLeft:s.abilityFromLeft||0,aim:s.aim,firing:s.firing,stick:s.stick,fireHeld:s.fireHeld,flags:s.flags||{},mode:s.mode,hp:s.hp,enemies:s.enemies.length};});
const resetAim=()=>dead?null:frame.evaluate(()=>window.__boar.aim(0,-.05)).catch(()=>{dead=true;});
// the machine gun overheats after long holds; a step that counts shots waits for it to cool first
const framesLater=async(n,maxMs=40000)=>{const f0=(await st()).frames;const t=Date.now();while(Date.now()-t<maxMs){const s=await st();if(s.frames>=f0+n)return s;await wait(60);}return null;};
const cool=async()=>{if(dead)return;try{for(let i=0;i<40;i++){if(((await st()).heat||0)<15)return;await wait(250);}}catch{dead=true;}};
const shot=name=>page.screenshot({path:out+`frames/boar-${MODE}-${name}.jpg`,type:'jpeg',quality:80});
const env=await frame.evaluate(()=>({coarse:matchMedia('(pointer:coarse)').matches,hoverNone:matchMedia('(hover:none)').matches,maxTouchPoints:navigator.maxTouchPoints,fireBtn:!!document.getElementById('fire-btn'),aimZone:!!document.getElementById('aim-zone'),landscape:innerWidth>innerHeight}));
await frame.evaluate(()=>window.__boar.start(1));await wait(1500);
await frame.evaluate(()=>{window.__boar.spawn('scout',-20);window.__boar.spawn('scout',-24);});
const layout=await frame.evaluate(()=>{const at=(x,y)=>{const e=document.elementFromPoint(x,y);return e?(e.closest('button')?.id||e.id||e.className||e.tagName):null;};const r=id=>{const e=document.getElementById(id);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];};
 return {aimZone:r('aim-zone'),fireBtn:r('fire-btn'),rocket:r('rocket'),frost:r('frost'),fury:r('fury'),under:Object.fromEntries([[60,200],[180,200],[290,200],[150,290],[120,300],[450,150],[650,110],[520,60]].map(([x,y])=>[x+','+y,at(x,y)]))};});
log('env',env);log('layout',layout);await shot('layout');
// HUD coverage: union area of the visible HUD nodes (cards, strips, buttons, bars) on a 4 px grid, as a fraction of the viewport; `withControls` adds the stick rest ring and the fire button; `band` = the middle band (y 110..290) where the boars come out of the water.
const hudCoverage=await frame.evaluate(()=>{const sel='.brand,.coin-block,.health-block,.wave-block,.top-controls button,.ammo-panel,.wslot,.ability,#weapon-btn,#battle-hint,#boss-hud';
 const vis=e=>{const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0||e.hidden)return false;const b=e.getBoundingClientRect();return b.width>2&&b.height>2&&b.right>0&&b.bottom>0&&b.left<innerWidth&&b.top<innerHeight&&!e.closest('[hidden]');};
 const rects=[...document.querySelectorAll(sel)].filter(vis).map(e=>e.getBoundingClientRect()),ctrl=['aim-rest','fire-btn'].map(id=>document.getElementById(id)).filter(e=>e&&vis(e)).map(e=>e.getBoundingClientRect());
 const g=4,W=Math.ceil(innerWidth/g),H=Math.ceil(innerHeight/g);const paint=list=>{const grid=new Uint8Array(W*H);for(const r of list){const x0=Math.max(0,Math.floor(r.left/g)),x1=Math.min(W,Math.ceil(r.right/g)),y0=Math.max(0,Math.floor(r.top/g)),y1=Math.min(H,Math.ceil(r.bottom/g));for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)grid[y*W+x]=1;}return grid;};
 const frac=(grid,y0=0,y1=H)=>{let n=0;for(let y=y0;y<y1;y++)for(let x=0;x<W;x++)n+=grid[y*W+x];return n/(W*(y1-y0));};
 const a=paint(rects),b=paint([...rects,...ctrl]);return {hud:+frac(a).toFixed(4),withControls:+frac(b).toFixed(4),band:+frac(a,Math.floor(110/g),Math.ceil(290/g)).toFixed(4),nodes:rects.length};});
log('hudCoverage',hudCoverage);await page.screenshot({path:out+`frames/boar-hud-${MODE==='after'?'after':MODE==='v20'?'before':'v1'}.jpg`,type:'jpeg',quality:84});// hud-before = the v20 cards, hud-v1 = the code before 06/11
const results={mode:MODE,query,env,layout,hudCoverage,steps:{}};const hasBtn=!!layout.fireBtn;const noBtn={skipped:'no fire button in this mode (legacy touch-to-fire)'};
const nonButton=s=>Object.entries(s.shotsBy).filter(([k])=>k!=='button').reduce((n,[,v])=>n+v,0);
const diff=(a,b)=>({shots:b.shots-a.shots,frames:b.frames-a.frames,nonButton:nonButton(b)-nonButton(a),button:(b.shotsBy.button||0)-(a.shotsBy.button||0),stickNoButton:b.stickNoButton-a.stickNoButton,abilities:Object.keys(b.abilityBy).reduce((n,k)=>n+(b.abilityBy[k]||0)-(a.abilityBy[k]||0),0),abilityFromLeft:b.abilityFromLeft-a.abilityFromLeft,aimFrom:a.aim,aimTo:b.aim,aimMoved:Math.hypot(b.aim.x-a.aim.x,b.aim.y-a.aim.y)>.03});
async function step(name,fn){if(dead){results.steps[name]={error:'skipped: the game frame was lost earlier'};return;}
 try{const a=await st();const extra=await fn()||{};const b=await st();results.steps[name]={...diff(a,b),...extra};}
 catch(e){results.steps[name]={error:String(e.message||e).split('\n')[0]};if(/detached|closed/i.test(String(e.message)))dead=true;}
 log(name,JSON.stringify(results.steps[name]));}
// A) three taps on the scene (right half, away from every control)
await step('sceneTaps',async()=>{for(const [x,y] of [[450,150],[650,110],[520,60]]){await touch('touchStart',[{x,y}]);await wait(150);await touch('touchEnd',[]);await wait(120);}await wait(400);});
// B) a long drag on the scene
await step('sceneDrag',async()=>{await touch('touchStart',[{x:480,y:300}]);for(let i=1;i<=10;i++){await touch('touchMove',[{x:480+i*16,y:300-i*2}]);await wait(60);}await wait(400);await touch('touchEnd',[]);await wait(400);});
// C) a two-second stick drag with enemies in range
await resetAim();await step('stickDrag2s',async()=>{await touch('touchStart',[{x:150,y:290}]);for(let i=1;i<=20;i++){await touch('touchMove',[{x:150+Math.min(i,8)*6,y:290-Math.min(i,8)*5}]);await wait(100);}await shot('stick');await touch('touchEnd',[]);await wait(400);});
// D) a stick drag that leaves the stick zone (and crosses the weapon bar and the fire button)
await resetAim();await step('stickLeavesZone',async()=>{await touch('touchStart',[{x:120,y:300}]);for(let i=1;i<=10;i++){await touch('touchMove',[{x:120+i*62,y:300-i*18}]);await wait(70);}await wait(600);await touch('touchEnd',[]);await wait(400);});
// E) the left thumb where the v20 ability buttons sat (taps and a short upward drag)
await resetAim();await step('leftThumbAbilityRow',async()=>{const before=await st();for(const [x,y] of [[60,200],[180,200],[290,200]]){await touch('touchStart',[{x,y}]);await wait(150);await touch('touchEnd',[]);await wait(300);}
 const mid=await st();await touch('touchStart',[{x:60,y:210}]);for(let i=1;i<=8;i++){await touch('touchMove',[{x:60+i*4,y:210-i*7}]);await wait(80);}await wait(500);await touch('touchEnd',[]);await wait(400);const after=await st();
 return {tapsAbilities:Object.keys(mid.abilityBy).reduce((n,k)=>n+(mid.abilityBy[k]||0)-(before.abilityBy[k]||0),0),dragAimMoved:Math.hypot(after.aim.x-mid.aim.x,after.aim.y-mid.aim.y)>.03,abilityBy:after.abilityBy};});
// F) two fingers: stick (id 1) moving while the fire button (id 2) is held; release the button first, then the stick
await resetAim();await cool();await step('twoFingers',async()=>{if(!hasBtn)return noBtn;const b=layout.fireBtn,bx=b[0]+b[2]/2,by=b[1]+b[3]/2;await touch('touchStart',[{x:140,y:300,id:1}]);await wait(100);await touch('touchStart',[{x:140,y:300,id:1},{x:bx,y:by,id:2}]);
 for(let i=1;i<=10;i++){await touch('touchMove',[{x:140+i*5,y:300-i*4,id:1},{x:bx,y:by,id:2}]);await wait(100);}await shot('twofinger');const held=await st();
 await touch('touchEnd',[{x:bx,y:by,id:2}]);await wait(500);const afterRelease=await st();await touch('touchEnd',[{x:190,y:260,id:1}]);await wait(100);const released=await st();await wait(400);const end=await st();
 return {heldFiring:held.firing,heldFireHeld:held.fireHeld,stickActiveWhileHeld:held.stick,shotsAfterButtonRelease:end.shots-afterRelease.shots,aimKeptAfterStickRelease:Math.hypot(end.aim.x-released.aim.x,end.aim.y-released.aim.y)<.02};});
// G) hold the fire button and tap the scene with another finger: firing must continue
await cool();await step('strayTapWhileHeld',async()=>{if(!hasBtn)return noBtn;const b=layout.fireBtn,bx=b[0]+b[2]/2,by=b[1]+b[3]/2;await touch('touchStart',[{x:bx,y:by,id:2}]);await wait(400);const s1=await st();
 await touch('touchStart',[{x:bx,y:by,id:2},{x:520,y:130,id:3}]);await wait(120);await touch('touchEnd',[{x:520,y:130,id:3}]);await wait(100);const s2=await st();const s3=(await framesLater(6,20000))||await st();await touch('touchEnd',[{x:bx,y:by,id:2}]);await wait(300);
 return {shotsBeforeTap:s1.shots,heatAtTap:s1.heat,firingAfterStrayTap:s2.firing,fireHeldAfterStrayTap:s2.fireHeld,shotsAfterStrayTap:s3.shots-s2.shots,framesAfterStrayTap:s3.frames-s2.frames};});
// H) keyboard F (the frame has focus, as on a phone with a keyboard)
await cool();await step('keyboardF',async()=>{await frame.evaluate(()=>document.getElementById('scene').focus());await page.keyboard.down('KeyF');await framesLater(4,15000);await page.keyboard.up('KeyF');await wait(200);});
// I) mouse-type pointer on the scene
await cool();await step('mouseOnScene',async()=>{await mouse('mouseMoved',500,200);await mouse('mousePressed',500,200);await framesLater(4,15000);await mouse('mouseReleased',500,200);await wait(200);});
// J) the fire button alone: shots, all from the button, aim unchanged
await cool();await step('fireButtonHold',async()=>{if(!hasBtn)return noBtn;const b=layout.fireBtn,bx=b[0]+b[2]/2,by=b[1]+b[3]/2;await touch('touchStart',[{x:bx,y:by,id:2}]);await wait(1000);await shot('fire');const held=await st();await touch('touchEnd',[]);await wait(300);return {heldFiring:held.firing};});
// L) stick precision with real touch, measured in game time over game frames (`frames`/`elapsed`), so a starved CPU (about one frame a second here) measures the same
//    kinematics as a 60 fps phone: fine-aim speed at a 20% tilt, time to a target with a full tilt, overshoot after release (the crosshair must stop at once), and the
//    precision finger (second finger on the stick zone slows the crosshair).
const speedOver=async(n,axis)=>{const s0=await framesLater(1);if(!s0)return null;const s1=await framesLater(n);if(!s1||s1.elapsed<=s0.elapsed)return null;return +((s1.aim[axis]-s0.aim[axis])/(s1.elapsed-s0.elapsed)).toFixed(3);};
await cool();await resetAim();await step('stickPrecision',async()=>{if(!hasBtn)return noBtn;const R=(await st()).stickR;const o={x:150,y:290};
 // fine aim: 20% tilt to the right; let the smoothing settle for 3 frames, then measure over 4 frames
 await touch('touchStart',[{...o,id:1}]);await touch('touchMove',[{x:o.x+Math.round(R*.2),y:o.y,id:1}]);await framesLater(3);const fine=await speedOver(4,'x');await touch('touchEnd',[{x:o.x+Math.round(R*.2),y:o.y,id:1}]);await framesLater(1);
 // time to target: full tilt from x=0 until x>=0.6, then release at once and watch for overshoot over 3 more frames
 await resetAim();await touch('touchStart',[{...o,id:1}]);const t0=await st();await touch('touchMove',[{x:o.x+R+20,y:o.y,id:1}]);let reach=null;const tw=Date.now();
 while(Date.now()-tw<40000){const s=await st();if(s.aim.x>=.6){reach=s;break;}await wait(60);}
 await touch('touchEnd',[{x:o.x+R+20,y:o.y,id:1}]);const rel=await st();const after=await framesLater(3)||rel;
 const timeToTarget=reach?+(reach.elapsed-t0.elapsed).toFixed(3):null,overshoot=+(after.aim.x-rel.aim.x).toFixed(4),stickAfterRelease=rel.stickInfo;
 // precision finger: full tilt up, measure, then a second finger on the stick zone, measure again
 await resetAim();await touch('touchStart',[{...o,id:1}]);await touch('touchMove',[{x:o.x,y:o.y-R-20,id:1}]);await framesLater(3);const vFull=await speedOver(4,'y');
 await touch('touchStart',[{x:o.x,y:o.y-R-20,id:1},{x:60,y:360,id:5}]);await framesLater(2);const q=await st();const vPrecise=await speedOver(4,'y');
 await touch('touchEnd',[{x:60,y:360,id:5}]);await touch('touchEnd',[{x:o.x,y:o.y-R-20,id:1}]);await framesLater(1);
 return {R,fineSpeed:fine,timeToTarget,overshoot,stickAfterRelease,fullSpeed:vFull,preciseSpeed:vPrecise,preciseFlag:q.stickInfo?.precise??null};});
// K) the weapon-switch button: tap cycles the weapon (two owned weapons), fires nothing
await step('weaponButton',async()=>{await frame.evaluate(()=>{const s=window.__boar.state.save;s.weapons.shotgun=s.weapons.shotgun||1;window.__boar.setSave(s);});const a=await st();const b=await frame.evaluate(()=>{const e=document.getElementById('weapon-btn');if(!e)return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height];});
 if(!b)return {skipped:'no weapon button in this mode'};await touch('touchStart',[{x:b[0],y:b[1],id:4}]);await wait(120);await touch('touchEnd',[{x:b[0],y:b[1],id:4}]);await wait(500);const c=await st();return {size:[b[2],b[3]],weaponBefore:a.current,weaponAfter:c.current};});
const final=dead?{shots:-1,shotsBy:{},stickNoButton:-1,abilityBy:{},aim:{x:0,y:0}}:await st();results.final=final;results.errors=errors;results.frameLost=dead;
const checks=[];const ok=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
const S=new Proxy(results.steps,{get:(t,k)=>t[k]||{}});
ok('aimstick controls exist (fire button + stick zone) in the frame on a coarse-pointer phone',env.coarse&&env.fireBtn&&env.aimZone);
ok('scene taps: 0 shots',S.sceneTaps.shots===0,S.sceneTaps.shots);
ok('scene drag: 0 shots',S.sceneDrag.shots===0,S.sceneDrag.shots);
ok('2 s stick drag: 0 shots, aim moved',S.stickDrag2s.shots===0&&S.stickDrag2s.aimMoved,S.stickDrag2s);
ok('stick drag leaving the zone: 0 shots, aim moved',S.stickLeavesZone.shots===0&&S.stickLeavesZone.aimMoved,S.stickLeavesZone);
ok('left thumb where the ability row sat: no ability fired, no press counted inside the zone, drag moves the aim',S.leftThumbAbilityRow.tapsAbilities===0&&S.leftThumbAbilityRow.abilityFromLeft===0&&S.leftThumbAbilityRow.dragAimMoved,S.leftThumbAbilityRow);
ok('two fingers: shots only from the button, stick active, firing stops when the button is released, aim kept',S.twoFingers.button>0&&S.twoFingers.nonButton===0&&S.twoFingers.stickActiveWhileHeld&&S.twoFingers.shotsAfterButtonRelease===0&&S.twoFingers.aimKeptAfterStickRelease,S.twoFingers);
ok('stray scene tap while the button is held: the button stays held and firing continues',S.strayTapWhileHeld.firingAfterStrayTap&&S.strayTapWhileHeld.fireHeldAfterStrayTap&&(S.strayTapWhileHeld.shotsAfterStrayTap>0||S.strayTapWhileHeld.framesAfterStrayTap<6),S.strayTapWhileHeld);
ok('keyboard F: 0 shots over at least 4 game frames',S.keyboardF.shots===0&&S.keyboardF.frames>=4,S.keyboardF);
ok('mouse on the scene: 0 shots over at least 4 game frames',S.mouseOnScene.shots===0&&S.mouseOnScene.frames>=4,S.mouseOnScene);
ok('fire button alone: shots, aim unchanged',S.fireButtonHold.shots>0&&S.fireButtonHold.button===S.fireButtonHold.shots&&!S.fireButtonHold.aimMoved,S.fireButtonHold);
ok('weapon-switch button: at least 44 px, cycles the weapon, fires nothing',S.weaponButton.size&&S.weaponButton.size[0]>=44&&S.weaponButton.size[1]>=44&&S.weaponButton.weaponAfter!==S.weaponButton.weaponBefore&&S.weaponButton.shots===0,S.weaponButton);
// HUD coverage baseline of v20 (MODE=v20 on this harness, 844x390, wave 1): hud 0.2152 of the viewport, middle band 0.4297. Target: at least 50% less.
const HUD_V20={hud:0.2152,band:0.4297,withControls:0.2605};
ok('HUD coverage at most half of v20 (whole viewport and the middle band)',hudCoverage.hud<=HUD_V20.hud*.5&&hudCoverage.band<=HUD_V20.band*.5,{after:hudCoverage,v20:HUD_V20});
// v20 stick on this harness (MODE=v20): fine-aim speed at a 20% tilt 0.145 units/s (linear curve), no precision finger, R 62.
const P=S.stickPrecision;
ok('stick: a 20% tilt aims at most half the v20 speed (fine aiming)',P.fineSpeed!=null&&P.fineSpeed>0&&P.fineSpeed<=.145*.5,P);
ok('stick: a full tilt reaches x=0.6 within 1.2 s of game time and the crosshair stops at once on release (overshoot under 0.01)',P.timeToTarget!=null&&P.timeToTarget<=1.2&&Math.abs(P.overshoot)<.01&&P.stickAfterRelease===null,P);
ok('stick: a second finger on the stick zone slows the crosshair to under half',P.preciseFlag===true&&P.fullSpeed>0&&P.preciseSpeed!=null&&P.preciseSpeed<P.fullSpeed*.5,P);
ok('stick: the fine/target/precision drags fired nothing',P.shots===0,P.shots);
ok('every shot in the run is attributed to the fire button',nonButton(final)===0&&final.stickNoButton===0,{shotsBy:final.shotsBy,stickNoButton:final.stickNoButton});
ok('no page errors and the game frame stayed alive',errors.length===0&&!dead,{errors,frameLost:dead});
results.checks=checks;
await writeFile(out+`boar-${MODE}.json`,JSON.stringify(results,null,1)+'\n');
console.log(JSON.stringify({mode:MODE,env,steps:S,final:{shots:final.shots,shotsBy:final.shotsBy,stickNoButton:final.stickNoButton,abilityBy:final.abilityBy,abilityFromLeft:final.abilityFromLeft},checks},null,1));
await browser.close();await server.close();
const failed=checks.filter(c=>!c.pass);
if(MODE==='after'){if(failed.length){console.error('FAILED:',failed.map(c=>c.name));process.exit(1);}console.error('all checks passed');}
else{if(!failed.length){console.error('old code ('+MODE+') passed every check: the test cannot see the bug');process.exit(2);}console.error('old code ('+MODE+') caught failing:',failed.map(c=>c.name));}
