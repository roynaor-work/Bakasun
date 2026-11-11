// Final fix (Fable, 11/11/2026), aliens: Roy's "far too many shots in normal time" measured through the real
// phone path: the island shell (index.html?dev=1 -> games.start), Chromium with touch at 844x390, CDP touch
// events on the real fire button and stick (no model injection). MODE=before runs the v20 code (?alienV15 off)
// and is expected to fail; the default runs v15 (?alienV15 and ?alienMove on) and must pass. Exit code is non-zero on any failure.
// Clock: the shell harness installs a fake page.clock; the game loop advances with tick(ms), so every rate
// below is shots divided by the model's own elapsed time (snapshot.time), not wall-clock.
// Run: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node workout/island/tests/final-aliens-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const before=process.env.MODE==='before',part=before?'final-fix-fable/aliens-before':'final-fix-fable/aliens';
const frames=new URL('../verification/final-fix-fable/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const BOT_CAP_SECONDS=Number(process.env.FINAL_ALIENS_BOT_CAP||260);
await verify(part,[{width:844,height:390}],async({page,context,tick,snap,start,exit,nav,assert})=>{
 if(before)await page.evaluate(()=>{globalThis.__alienV15=false;globalThis.__alienMove=false;});
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const capture=name=>page.screenshot({path:new URL(`aliens-${before?'before-':''}${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 const report={mode:before?'v20 (alienV15 off)':'v15',clock:'fake page.clock; rates use model time'};
 const alive=()=>page.evaluate(()=>Boolean(window.__island.games.current));
 // The ship is a sitting duck while a button is held, so alien fire can end the round before we leave it.
 const leave=async()=>{if(await alive()){await exit();return;}await tick(1500);await nav();};
 const fresh=async()=>{await start('alienDefense');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});await tick(1500);};
 const rate=(a,b)=>+((b.fired-a.fired)/Math.max(.001,b.time-a.time)).toFixed(2);
 const pulls=s=>before?s.fired:s.steadyShots; // v15 counts trigger pulls; v20 has only the projectile count
 const fails=[];const check=(ok,text)=>{if(!ok)fails.push(text);console.log((ok?'PASS ':'FAIL ')+text);};
 /** Hold the real fire button (or Space) for totalMs while the other thumb (or the arrow keys) dodges left and
  * right; returns the snapshots taken at the given marks (ms after the press) and runs onMark for screenshots. */
 const hold=async(totalMs,marks,{keyboard=false,onMark=async()=>{}}={})=>{
  const fire=await center('#shoot'),stick=await center('#joystick');let dir=1,elapsed=0,mi=0;const out=[],sorted=[...marks].sort((a,b)=>a-b);
  const pts=()=>[{x:stick.x+dir*30,y:stick.y,id:1},{...fire,id:2}];
  if(keyboard){await page.locator('canvas.minigame-canvas').focus();await page.keyboard.down('ArrowRight');await page.keyboard.down('Space');}
  else{await touch('touchStart',[pts()[0]]);await touch('touchStart',pts());}
  while(elapsed<totalMs&&await alive()){
   const next=sorted[mi]??Infinity,step=Math.max(1,Math.min(400,totalMs-elapsed,next-elapsed));await tick(step);elapsed+=step;
   if(next===elapsed){const s=await snap();out.push(s);await onMark(mi,s);mi++;}
   dir=-dir;if(keyboard){await page.keyboard.up(dir>0?'ArrowLeft':'ArrowRight');await page.keyboard.down(dir>0?'ArrowRight':'ArrowLeft');}else await touch('touchMove',pts());
  }
  if(keyboard){await page.keyboard.up('Space');await page.keyboard.up('ArrowLeft');await page.keyboard.up('ArrowRight');}else await touch('touchEnd');
  return out;
 };
 const botOnly=process.env.FINAL_ALIENS_BOT_ONLY==='1'; // iteration aid only; the acceptance run covers everything
 // 1. Fresh save, stage 1: hold the real fire button for 6 s. v15: burst 1.2 s, cool 2 s, then a steady 4/s.
 if(!botOnly){
 await fresh();
 {const s0=await snap();const [burst,cooling,s4,s6]=await hold(6000,[900,2200,4000,6000],{onMark:async i=>{if(i===0)await capture('1-burst');if(i===1)await capture('2-cooling');if(i===3)await capture('3-steady');}});
  if(!s6){check(false,'the round ended during the fresh hold');}else{
  const r={total6s:s6.fired-s0.fired,secs:+(s6.time-s0.time).toFixed(2),overall:rate(s0,s6),burstPhase:rate(s0,burst),coolingFired:cooling.fired-burst.fired,steady:rate(s4,s6),overheats:s6.overheats-s0.overheats,fireMode:s6.fireMode,heatAtBurst:+burst.heat.toFixed(2),capDropped:s6.capDropped};
  report.holdFresh=r;console.log('hold-fresh',JSON.stringify(r));
  check(r.overall<=6.5,`fresh hold 6 s: ${r.overall} shots/s overall (target <= 6.5; v14 gave about 10)`);
  check(r.steady>=4.5&&r.steady<=6.5,`steady phase after the burst: ${r.steady} shots/s (target 5-6)`);
  check(r.overheats===1,`one short burst then cool-down (overheats ${r.overheats})`);}
  await tick(2500);
 }
 // 1b. Ship movement through the real stick (alienMove): top speed, time to 90% of it, lean angle, glide after release.
 if(await alive()){const stick=await center('#joystick');const samples=[];let t=0;
  await page.evaluate(()=>{window.__mv=[];const m=window.__island.games.current.session.debug.model;const u=m.update.bind(m);m.update=(dt,i)=>{const r=u(dt,i);window.__mv.push([+m.time.toFixed(3),+m.player.x.toFixed(2),+(m.player.vx||0).toFixed(1),+(m.player.bank||0).toFixed(3)]);return r;};});
  await touch('touchStart',[{...stick,id:1}]);await touch('touchMove',[{x:stick.x+46,y:stick.y,id:1}]);await tick(1000);await touch('touchEnd');await tick(900);
  const mv=await page.evaluate(()=>{const v=window.__mv;window.__mv=[];return v;});const t0=mv[0][0];let top=0;for(const r of mv)top=Math.max(top,Math.abs(r[2]));
  const t90=mv.find(r=>Math.abs(r[2])>=.9*top);const release=mv.find(r=>r[0]-t0>=1);const xAtRelease=release?release[1]:mv.at(-1)[1],glide=+(Math.abs(mv.at(-1)[1]-xAtRelease)).toFixed(1);
  const bankAngle=await page.evaluate(()=>window.__island.data.config.minigames.alienDefense.render.bankAngle),tilt=+(Math.max(...mv.map(r=>Math.abs(r[3])))*bankAngle*180/Math.PI).toFixed(1);
  const r={topSpeed:+top.toFixed(0),timeTo90pct:t90?+(t90[0]-t0).toFixed(2):null,tiltDeg:tilt,glideAfterRelease:glide,samples:mv.length};report.motion=r;console.log('motion',JSON.stringify(r));
  check(r.topSpeed>=200,`stick: top speed ${r.topSpeed} units/s`);check(before||(r.timeTo90pct!==null&&r.timeTo90pct<=.35),`stick: 90% of top speed after ${r.timeTo90pct} s (eased, target <= 0.35)`);check(before||r.tiltDeg>=8,`stick: lean ${r.tiltDeg} degrees`);check(before||r.glideAfterRelease>=6,`stick: glide ${r.glideAfterRelease} units after release (v20 stops dead)`);
  await tick(500);}
 // 2. Keyboard (Space) uses the same gate.
 if(await alive()){const s0=await snap();const [s1]=await hold(6000,[6000],{keyboard:true});
  if(s1){const r={overall:rate(s0,s1),fired:s1.fired-s0.fired};report.holdKeyboard=r;console.log('hold-keyboard',JSON.stringify(r));check(r.overall<=6.5,`keyboard hold 6 s: ${r.overall} shots/s (target <= 6.5)`);}await tick(2500);}
 // 3. Rapid-fire bonus (a time bonus) active: the floor still holds. fired counts the v11 laser volleys too
 //    (2-4 lasers every 5-6 s); the trigger pulls are what the rapid floor bounds.
 if(await alive()){await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.pickups.push({kind:2,x:m.player.x,y:m.player.y,vy:0});});await tick(120);
  const [s0,s1]=await hold(5400,[3400,5400]);
  if(s1){const r={steady:rate(s0,s1),triggerPulls:+((pulls(s1)-pulls(s0))/(s1.time-s0.time)).toFixed(2),powerup:s1.powerup,fireMode:s1.fireMode};report.rapidBonus=r;console.log('rapid-bonus',JSON.stringify(r));
   check(r.triggerPulls<=8,`rapid bonus steady phase: ${r.triggerPulls} trigger pulls/s, ${r.steady} projectiles/s incl. lasers (floor 7.7/s; v14 gave 16)`);}await tick(1500);}
 await leave();
 // 4. Maxed gear (equipment, permanent upgrades, hangar rank 20, power level 3): the cap holds.
 await page.evaluate(()=>{const {engine:e}=window.__island;Object.assign(e.state.minigameEquipment.alienDefense,{damage:3,rate:3,shield:3,weapon:2});for(const k of Object.keys(e.state.alienUpgrades))e.state.alienUpgrades[k]=3;e.state.hangar.rapid=20;e.state.minigameLevels.alienDefense=3;e.state.minigameWins.alienDefense=10;});
 await fresh();
 report.gear=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;return {equipment:m.equipment,upgrades:m.upgrades,hangar:m.snapshot().hangar.rapid};});
 {const s0=await snap();const [s3,s6]=await hold(6000,[3300,6000]);
  if(s6){const r={overall:rate(s0,s6),steadyRounds:+((pulls(s6)-pulls(s3))/(s6.time-s3.time)).toFixed(2),projectilesSteady:rate(s3,s6),fired:s6.fired-s0.fired,wings:s6.wings.filter(w=>w.active).length,capDropped:s6.capDropped};report.holdMaxed=r;console.log('hold-maxed',JSON.stringify(r));
   check(r.overall<=15,`maxed gear hold 6 s: ${r.overall} projectiles/s (hard cap 15/s)`);
   check(r.steadyRounds<=6.3,`maxed gear trigger pulls in the steady phase: ${r.steadyRounds}/s (floor 6/s; v14 gave about 13)`);}
  await tick(1500);
  // spread bonus on top: the spawn-point cap bounds projectiles per second whatever the mode.
  if(await alive()){await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;m.pickups.push({kind:0,x:m.player.x,y:m.player.y,vy:0});m.pickups.push({kind:4,x:m.player.x,y:m.player.y,vy:0});});await tick(120);
   const a=await snap();const [b]=await hold(4000,[4000]);
   if(b){const sp={projectilesPerSec:rate(a,b),spread:b.spreadTime>0||a.spreadTime>0,wings:b.wings.filter(w=>w.active).length,capDropped:b.capDropped-a.capDropped};report.spreadMaxed=sp;console.log('spread-maxed',JSON.stringify(sp));
    check(sp.projectilesPerSec<=16.5,`spread + wings + maxed gear: ${sp.projectilesPerSec} projectiles/s (hard cap 15/s plus the bucket)`);}}
 }
 await leave();
 }
 // 5. A good player (bot) through the real stick and fire button, fresh save: stage 1 should take 85-135 s.
 await page.evaluate(()=>{const {engine:e}=window.__island;Object.assign(e.state.minigameEquipment.alienDefense,{damage:0,rate:0,shield:0,weapon:0});for(const k of Object.keys(e.state.alienUpgrades))e.state.alienUpgrades[k]=0;e.state.hangar.rapid=0;e.state.minigameLevels.alienDefense=1;e.state.minigameWins.alienDefense=0;});
 await fresh();await page.evaluate(()=>{window.__island.games.current.session.debug.view?.degrade(true);});await tick(200);
 // Movement through the relative flight surface (a finger on the canvas outside the stick): the ship's target moves
 // by the finger's displacement times modelWidth/cssWidth, so a wanted model x maps to one finger x. Fire with the other thumb.
 {const fire=await center('#shoot');let s=await snap();const t0=s.time;let last=s,steps=0,fireHeld=true;const ship0=s.player.x,perPx=s.viewport.modelWidth/844,startX=422,fingerY=150,finger=x=>({x:Math.max(2,Math.min(842,Math.round(startX+(x-ship0)/perPx))),y:fingerY,id:1});
  await touch('touchStart',[finger(ship0)]);await touch('touchStart',[finger(ship0),{...fire,id:2}]);
  while(s&&!s.result&&s.time-t0<BOT_CAP_SECONDS){
   const plan=await page.evaluate(()=>{const g=window.__island.games.current;if(!g)return null;const m=g.session.debug.model;const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];const py=m.player.y,cross=[];for(const b of m.bolts){const vy=b.vy||1,tt=(py-b.y)/vy;if(tt>0&&tt<1.4)cross.push(b.x+(b.vx||0)*tt);}for(const a of m.aliens)if(a.diveAge>=0&&a.y<py)cross.push(a.x);let want=t?t.x:m.player.x;const safe=x=>cross.every(c=>Math.abs(c-x)>36);if(!safe(want)){out:for(let d=0;d<=844;d+=8)for(const sg of[1,-1]){const x=m.player.x+sg*d;if(x>20&&x<824&&safe(x)){want=x;break out;}}}return {dx:want-m.player.x,px:m.player.x,aim:t?Math.abs(t.x-m.player.x):999};});
   if(!plan)break;
   const f=finger(plan.px+plan.dx);
   // A good player keeps the button down (like the headless bot) and only steers; lifting it between columns cost about 10 s.
   const wantFire=true;void plan.aim;
   if(wantFire!==fireHeld){fireHeld=wantFire;if(wantFire)await touch('touchStart',[f,{...fire,id:2}]);else await touch('touchEnd',[{...fire,id:2}]);} // touchEnd lists the released point; the drag finger keeps its anchor
   const pts=[f];if(fireHeld)pts.push({...fire,id:2});await touch('touchMove',pts);
   await tick(100);last=s;s=await snap();steps++;
  }
  await touch('touchEnd');const end=s||last;
  // The shell closes the game on the last kill, so the final snapshot may be gone: the island's win counter says how the round ended.
  const won=end.result?.outcome==='win'||(!s&&await page.evaluate(()=>(window.__island.engine.state.minigameWins.alienDefense||0)>0));
  const r={stageSeconds:+((end.time)-t0).toFixed(1),outcome:won?'win':end.result?.outcome||(s?'running':'ended'),fired:end.fired,kills:end.kills,livesLeft:end.lives,maxLives:end.maxLives,wave:end.wave,overheats:end.overheats,steps};report.botStage1=r;console.log('bot-stage1',JSON.stringify(r));
  check(r.outcome==='win',`bot wins stage 1 (${r.outcome})`);check(r.stageSeconds>=90&&r.stageSeconds<=130,`stage 1 lasts ${r.stageSeconds} s (target 90-130)`);
  await tick(300);await capture('4-stage-end');
 }
 await leave();
 report.fails=fails;
 if(fails.length){console.error('FAILED',fails);assert.fail(`${fails.length} acceptance checks failed: ${fails.join(' | ')}`);}
 return report;
});
