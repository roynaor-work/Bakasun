// Final fix (Fable, 11/11/2026), aliens: Roy's "far too many shots in normal time" measured through the real
// phone path: the island shell (index.html?dev=1 -> games.start), Chromium with touch at 844x390, CDP touch
// events on the real fire button and stick (no model injection). MODE=before runs the v20 code (?alienV15 off)
// and is expected to fail; the default runs v15 and must pass. Exit code is non-zero on any failure.
// Clock: the shell harness installs a fake page.clock; the game loop advances with tick(ms), so every rate
// below is shots divided by the model's own elapsed time (snapshot.time), not wall-clock.
// Run: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node workout/island/tests/final-aliens-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const before=process.env.MODE==='before',part=before?'final-fix-fable/aliens-before':'final-fix-fable/aliens';
const frames=new URL('../verification/final-fix-fable/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const BOT_CAP_SECONDS=Number(process.env.FINAL_ALIENS_BOT_CAP||260);
await verify(part,[{width:844,height:390}],async({page,context,tick,snap,start,exit,assert})=>{
 if(before)await page.evaluate(()=>{globalThis.__alienV15=false;});
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const capture=name=>page.screenshot({path:new URL(`aliens-${before?'before-':''}${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 const report={mode:before?'v20 (alienV15 off)':'v15',clock:'fake page.clock; rates use model time'};
 const fresh=async()=>{await start('alienDefense');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});await tick(1500);};
 const rate=(a,b)=>+((b.fired-a.fired)/Math.max(.001,b.time-a.time)).toFixed(2);
 const fails=[];const check=(ok,text)=>{if(!ok)fails.push(text);console.log((ok?'PASS ':'FAIL ')+text);};
 // 1. Fresh save, stage 1: hold the real fire button for 6 s. Burst for 1.2 s, cool 2 s, then a steady 4/s.
 await fresh();await page.evaluate(()=>{window.__island.games.current.session.snapshot;});
 {const fire=await center('#shoot');const s0=await snap();await touch('touchStart',[{...fire,id:1}]);
  await tick(900);const burst=await snap();await capture('1-burst');
  await tick(1300);const cooling=await snap();await capture('2-cooling');
  await tick(1800);const s4=await snap();await tick(2000);const s6=await snap();await capture('3-steady');await touch('touchEnd');
  const r={fired5s:null,total6s:s6.fired-s0.fired,secs:+(s6.time-s0.time).toFixed(2),overall:rate(s0,s6),burstPhase:rate(s0,burst),coolingFired:cooling.fired-burst.fired,steady:rate(s4,s6),overheats:s6.overheats-s0.overheats,fireMode:s6.fireMode,heatAtBurst:burst.heat,capDropped:s6.capDropped};
  report.holdFresh=r;console.log('hold-fresh',JSON.stringify(r));
  check(r.overall<=6,`fresh hold 6 s: ${r.overall} shots/s overall (target <= 6; v14 gave about 10)`);
  check(r.steady>=3&&r.steady<=5.5,`steady phase after the burst: ${r.steady} shots/s (target 3-5.5)`);
  check(r.overheats===1,`one short burst then cool-down (overheats ${r.overheats})`);
  await tick(2500);
 }
 // 2. Keyboard (Space) uses the same gate.
 {await page.locator('canvas.minigame-canvas').focus();const s0=await snap();await page.keyboard.down('Space');await tick(6000);const s1=await snap();await page.keyboard.up('Space');
  const r={overall:rate(s0,s1),fired:s1.fired-s0.fired};report.holdKeyboard=r;console.log('hold-keyboard',JSON.stringify(r));check(r.overall<=6,`keyboard hold 6 s: ${r.overall} shots/s (target <= 6)`);await tick(2500);}
 // 3. Rapid-fire bonus (time bonus) active: the floor still holds.
 {await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.pickups.push({kind:2,x:m.player.x,y:m.player.y,vy:0});});await tick(120);
  const fire=await center('#shoot');await touch('touchStart',[{...fire,id:1}]);await tick(3300);const s0=await snap();await tick(2000);const s1=await snap();await touch('touchEnd');
  const r={steady:rate(s0,s1),powerup:s1.powerup,fireMode:s1.fireMode};report.rapidBonus=r;console.log('rapid-bonus',JSON.stringify(r));check(r.steady<=7.5,`rapid bonus steady phase: ${r.steady} shots/s (target <= 7.5; v14 gave 16)`);await tick(2500);}
 await exit();
 // 4. Maxed gear (equipment, permanent upgrades, hangar rank 20, power level 3): the cap holds.
 await page.evaluate(()=>{const {engine:e}=window.__island;Object.assign(e.state.minigameEquipment.alienDefense,{damage:3,rate:3,shield:3,weapon:2});for(const k of Object.keys(e.state.alienUpgrades))e.state.alienUpgrades[k]=3;e.state.hangar.rapid=20;e.state.minigameLevels.alienDefense=3;e.state.minigameWins.alienDefense=10;});
 await fresh();
 report.gear=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;return {equipment:m.equipment,upgrades:m.upgrades,hangar:m.snapshot().hangar.rapid};});
 {const fire=await center('#shoot');const s0=await snap();await touch('touchStart',[{...fire,id:1}]);await tick(3300);const s3=await snap();await tick(2700);const s6=await snap();await touch('touchEnd');
  const r={overall:rate(s0,s6),steadyRounds:+((s6.steadyShots-s3.steadyShots)/(s6.time-s3.time)).toFixed(2),projectilesSteady:rate(s3,s6),fired:s6.fired-s0.fired,wings:s6.wings.filter(w=>w.active).length,capDropped:s6.capDropped};report.holdMaxed=r;console.log('hold-maxed',JSON.stringify(r));
  check(r.overall<=15,`maxed gear hold 6 s: ${r.overall} projectiles/s incl. two wing ships (hard cap 15/s)`);
  check(before||r.steadyRounds<=5.2,`maxed gear trigger pulls in the steady phase: ${r.steadyRounds}/s (floor 5/s)`);
  await tick(1500);
  // spread bonus on top: the spawn-point cap bounds projectiles per second whatever the mode.
  await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.pickups.push({kind:0,x:m.player.x,y:m.player.y,vy:0});});await tick(120);
  const a=await snap();await touch('touchStart',[{...fire,id:1}]);await tick(4000);const b=await snap();await touch('touchEnd');
  const sp={projectilesPerSec:rate(a,b),spread:b.spreadTime>0||a.spreadTime>0,capDropped:b.capDropped-a.capDropped};report.spreadMaxed=sp;console.log('spread-maxed',JSON.stringify(sp));
  check(sp.projectilesPerSec<=16.5,`spread + wings + maxed gear: ${sp.projectilesPerSec} projectiles/s (hard cap 15/s plus bucket)`);
 }
 await exit();
 // 5. A good player (bot) through the real stick and fire button, fresh save: stage 1 should take 85-135 s.
 await page.evaluate(()=>{const {engine:e}=window.__island;Object.assign(e.state.minigameEquipment.alienDefense,{damage:0,rate:0,shield:0,weapon:0});for(const k of Object.keys(e.state.alienUpgrades))e.state.alienUpgrades[k]=0;e.state.hangar.rapid=0;e.state.minigameLevels.alienDefense=1;e.state.minigameWins.alienDefense=0;});
 await fresh();await page.evaluate(()=>{window.__island.games.current.session.debug.view?.degrade(true);});await tick(200);
 {const fire=await center('#shoot'),stick=await center('#joystick');let s=await snap();const t0=s.time;let last=s,steps=0,fireHeld=true;
  await touch('touchStart',[{...stick,id:1}]);await touch('touchStart',[{...stick,id:1},{...fire,id:2}]);
  while(s&&!s.result&&s.time-t0<BOT_CAP_SECONDS){
   const plan=await page.evaluate(()=>{const g=window.__island.games.current;if(!g)return null;const m=g.session.debug.model;const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];const py=m.player.y,cross=[];for(const b of m.bolts){const vy=b.vy||1,tt=(py-b.y)/vy;if(tt>0&&tt<1.4)cross.push(b.x+(b.vx||0)*tt);}for(const a of m.aliens)if(a.diveAge>=0&&a.y<py)cross.push(a.x);let want=t?t.x:m.player.x;const safe=x=>cross.every(c=>Math.abs(c-x)>36);if(!safe(want)){out:for(let d=0;d<=844;d+=8)for(const sg of[1,-1]){const x=m.player.x+sg*d;if(x>20&&x<824&&safe(x)){want=x;break out;}}}return {dx:want-m.player.x,aim:t?Math.abs(t.x-m.player.x):999};});
   if(!plan)break;
   const ax=Math.max(-1,Math.min(1,plan.dx/30));
   // A good player lifts the finger when far from any target, and lets the Vulcan recharge for the next column.
   const wantFire=plan.aim<70;
   if(wantFire!==fireHeld){fireHeld=wantFire;if(wantFire)await touch('touchStart',[{x:stick.x+ax*40,y:stick.y,id:1},{...fire,id:2}]);else await touch('touchEnd',[{x:stick.x+ax*40,y:stick.y,id:1}]);}
   const pts=[{x:stick.x+ax*40,y:stick.y,id:1}];if(fireHeld)pts.push({...fire,id:2});await touch('touchMove',pts);
   await tick(120);last=s;s=await snap();steps++;
  }
  await touch('touchEnd');const end=s||last;const r={stageSeconds:+((end.time)-t0).toFixed(1),outcome:end.result?.outcome||(s?'running':'ended'),fired:end.fired,kills:end.kills,livesLeft:end.lives,maxLives:end.maxLives,wave:end.wave,overheats:end.overheats,steps};report.botStage1=r;console.log('bot-stage1',JSON.stringify(r));
  check(r.outcome==='win',`bot wins stage 1 (${r.outcome})`);check(r.stageSeconds>=85&&r.stageSeconds<=135,`stage 1 lasts ${r.stageSeconds} s (target 85-135)`);
  await tick(300);await capture('4-stage-end');
 }
 if(await page.evaluate(()=>Boolean(window.__island.games.current)))await exit();
 report.fails=fails;
 if(fails.length){console.error('FAILED',fails);assert.fail(`${fails.length} acceptance checks failed: ${fails.join(' | ')}`);}
 return report;
});
