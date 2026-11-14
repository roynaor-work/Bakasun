// Aliens v24 (13/11/2026): the Codex effects (alien-fx-v1 and the alien-v16 effects) through the real phone path. Island shell (index.html?dev=1 ->
// games.start, the harness of the v23 test), Chromium with hasTouch + isMobile at 844x390 (SwiftShader WebGL), CDP Input.dispatchTouchEvent on the real
// #shoot and #vulcan buttons. Nothing in the game is written: the page is only read (model getters, the session snapshot with the effects' counters, the
// button's computed colour, screenshot pixels). The harness runs the fake page.clock, so every number is in the model's own time.
//  A. the sheets and sounds load (no failed request), B. regular fire: a flame on every shot, impacts on hits, explosions on kills, the laser volley with its
//  muzzle flash, the rate unchanged, C. the Vulcan held until it locks: the burst cycle, the sprite meter next to the ship (its pixels), the ring colours,
//  the shutdown and the reopening, the overheat sound, D. ?alienFx=0 (its global switch, the same function reads the URL): no effects, the v23 colours.
// Run: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium node workout/island/tests/aliens-v24-browser.mjs
// Numbers: verification/aliens-v24/browser/verification.json; frames: verification/aliens-v24/frames/.
import {verify} from './night-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const frames=new URL('../verification/aliens-v24/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const FX_COLORS={green:'#41e892',yellow:'#ffdc46',red:'#ff555a'},V23_COLORS={green:'#7fe0a0',yellow:'#ffd34a',red:'#ff4a30'};
let failures=[];
await verify('aliens-v24/browser',[{width:844,height:390,isMobile:true}],async({page,context,viewport,tick,snap,start,exit,nav})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const capture=name=>page.screenshot({path:new URL(`v24-${name}.jpg`,frames).pathname,type:'jpeg',quality:84});
 const fails=[];const check=(ok,text)=>{if(!ok)fails.push(text);console.log((ok?'PASS ':'FAIL ')+text);};
 const report={viewport:`${viewport.width}x${viewport.height}`,clock:'fake page.clock; rates use model time'},requests=[];
 page.on('request',r=>{const u=new URL(r.url()).pathname;if(/\/assets\/alien-(fx-v1|v16)\//.test(u))requests.push(u);});
 page.on('requestfailed',r=>{if(/alien-(fx-v1|v16)/.test(r.url()))fails.push('request failed '+r.url());});
 const alive=()=>page.evaluate(()=>Boolean(window.__island.games.current));
 const leave=async()=>{if(await alive()){await exit();return;}await tick(1500);await nav();};
 const fresh=async()=>{await start('alienDefense');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});await tick(1500);};
 /** read-only probe: the model's fire counters, the Vulcan, and the effects' counters from the session snapshot */
 const peek=()=>page.evaluate(()=>{const g=window.__island.games.current;if(!g)return null;const s=g.session.snapshot,m=g.session.debug.model,v=document.querySelector('#vulcan');
  return {t:m.time,rf:s.regularFired??null,vf:s.vulcanFired??null,steady:s.steadyShots,lasers:s.lasersFired,kills:s.kills,hits:s.hits,heat:m.vulcanHeat,locked:m.vulcanLocked,vulcanOn:m.vulcanOn,player:{x:m.player.x,y:m.player.y},vp:s.viewport,fx:s.fx??null,
   ring:v?{level:v.dataset.level,color:getComputedStyle(v).getPropertyValue('--vulcan-color').trim()}:null};});
 /** the meter next to the ship, from a screenshot: pixels in the colours of the sprite's fill (green to red) inside the box to the right of the ship */
 const meterPixels=async p=>{const sx=p.player.x*p.vp.scale,sy=p.player.y*p.vp.scaleY,clip={x:Math.max(0,Math.round(sx+18)),y:Math.max(0,Math.round(sy-18)),width:110,height:36};
  const png=await page.screenshot({type:'png',clip});
  return page.evaluate(async b=>{const bmp=await createImageBitmap(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:'image/png'})),c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.drawImage(bmp,0,0);const d=g.getImageData(0,0,c.width,c.height).data;let fill=0,x0=1e9,x1=-1,y0=1e9,y1=-1;
   for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],bb=d[i+2];if((gg>200&&r<140&&bb>110&&bb<180)||(r>230&&gg>180&&bb<110)||(r>230&&gg<120&&bb>70&&bb<120)){fill++;const x=(i/4)%c.width,y=Math.floor(i/4/c.width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
   // the sprite meter is a horizontal bar (wide, about 5 px of fill high); the v23 bar is a vertical one (8 px wide, up to 42 px high)
   return {fill,w:fill?x1-x0+1:0,h:fill?y1-y0+1:0,horizontal:fill>0&&x1-x0>2*(y1-y0),clip:[c.width,c.height]};},png.toString('base64'));};

 // A. the effects load with the game: every sheet but the boss explosion (it waits for a boss), and the four sounds decode once a finger is down
 await fresh();
 {await page.waitForFunction(()=>(window.__island.games.current.session.snapshot.fx?.sprites.length||0)>=11,{timeout:120000}).catch(()=>{});await tick(200);const p=await peek();
  report.loaded={sprites:p.fx?.sprites,failed:p.fx?.failed,requests:[...new Set(requests)].sort()};console.log('loaded',JSON.stringify(report.loaded));
  check(p.fx&&['cannon','vulcan','heatBar','heatIcon','shutdown','impact','explosion','shield','laser','muzzle','spark'].every(k=>p.fx.sprites.includes(k)),`the eleven sheets are loaded (${p.fx?.sprites})`);
  check(!p.fx?.sprites.includes('boss')&&!requests.some(r=>r.endsWith('boss-explosion.png')),'the boss explosion (1 MB) is not loaded before a boss is on screen');
  check(p.ring?.color===FX_COLORS.green,`the Vulcan ring takes the meter's green (${p.ring?.color})`);}

 // B. regular fire held 7 s while a finger on the flight surface keeps the ship under the lowest alien (the aim of a child; the v23 bot's mapping):
 //    a flame on every shot, impacts and explosions where shots land, the laser volley with its muzzle flash; the rate is v23's
 {const fire=await center('#shoot'),s0=await peek(),ship0=s0.player.x,perPx=s0.vp.modelWidth/844,finger=x=>({x:Math.max(2,Math.min(842,Math.round(422+(x-ship0)/perPx))),y:150,id:3});
  const aim=()=>page.evaluate(()=>{const m=window.__island.games.current?.session.debug.model;if(!m)return null;const a=[...m.aliens].filter(a=>a.y>0).sort((x,y)=>y.y-x.y)[0];return a?a.x:m.player.x;});
  let target=(await aim())??ship0;await touch('touchStart',[finger(ship0)]);await touch('touchMove',[finger(target)]);await touch('touchStart',[finger(target),{...fire,id:1}]);
  let shotFlame=false,shotHit=false,shotKill=false,shotLaser=false;
  for(let i=0;i<70;i++){await tick(100);if(i%3===0){target=(await aim())??target;await touch('touchMove',[finger(target),{...fire,id:1}]);}const p=await peek();if(!p)break;
   if(!shotFlame&&i>=6){shotFlame=true;await capture('1-regular-flame');}
   if(!shotHit&&p.fx.counts.impacts>s0.fx.counts.impacts&&p.fx.effects>0){shotHit=true;await capture('2-impact-sparks');}
   if(!shotKill&&p.fx.counts.explosions>s0.fx.counts.explosions){shotKill=true;await tick(100);await capture('3-alien-explosion');}
   if(!shotLaser&&p.fx.counts.muzzles>s0.fx.counts.muzzles){shotLaser=true;await tick(50);await capture('4-laser-volley');}}
  await touch('touchEnd');const s1=await peek(),d=k=>s1.fx.counts[k]-s0.fx.counts[k];
  const r={seconds:+(s1.t-s0.t).toFixed(2),regularRate:+((s1.rf-s0.rf)/(s1.t-s0.t)).toFixed(2),regularShots:s1.steady-s0.steady,flames:d('flames'),impacts:d('impacts'),hits:s1.hits-s0.hits,explosions:d('explosions'),kills:s1.kills-s0.kills,lasers:s1.lasers-s0.lasers,muzzles:d('muzzles'),vulcanBursts:d('bursts')};
  report.regular=r;console.log('regular',JSON.stringify(r));
  check(Math.abs(r.regularRate-5.56)<=.7,`regular fire rate unchanged: ${r.regularRate}/s (v23 5.56)`);
  check(r.flames>=r.regularShots-2&&r.flames<=r.regularShots,`a cannon flame on every pull of the regular trigger (${r.flames} flames, ${r.regularShots} pulls)`);
  check(r.impacts>0&&r.impacts<=r.hits,`impact sparks on hits (${r.impacts} impacts for ${r.hits} hits, at most one per alien per 80 ms)`);
  check(r.explosions>0&&r.explosions<=r.kills,`an explosion on kills (${r.explosions} for ${r.kills} kills)`);
  check(r.lasers===0||r.muzzles>0,`the laser volley shows the v16 muzzle flash (${r.lasers} lasers, ${r.muzzles} flashes)`);
  check(r.vulcanBursts===0,'the regular button never starts the Vulcan burst');
  await tick(1500);}

 // C. the Vulcan held until it locks and opens again: the burst cycle, the meter (sprite pixels next to the ship), the ring colours, the shutdown
 await leave();await fresh();
 {const vul=await center('#vulcan'),s0=await peek(),rows=[],shots={};await touch('touchStart',[{...vul,id:2}]);
  for(let i=0;i<120;i++){await tick(40);const p=await peek();if(!p)break;rows.push(p);const lvl=p.ring.level;
   if(lvl==='yellow'&&!shots.yellow){shots.yellow=await meterPixels(p);shots.yellowRing=p.ring.color;await capture('5-vulcan-burst-meter-yellow');}
   if(lvl==='red'&&!shots.red){shots.red=await meterPixels(p);shots.redRing=p.ring.color;await capture('6-vulcan-meter-red');}
   if(lvl==='lock'&&!shots.lock){shots.lock=await meterPixels(p);await capture('7-vulcan-shutdown');}
   if(shots.lock&&!p.locked&&p.vulcanOn&&!shots.open){shots.open=true;await capture('8-vulcan-open-again');}}
  await touch('touchEnd');const s1=rows.at(-1),d=k=>s1.fx.counts[k]-s0.fx.counts[k];
  const levels=[];for(const r of rows)if(levels.at(-1)!==r.ring.level)levels.push(r.ring.level);
  const r={levels,vulcanFired:s1.vf-s0.vf,bursts:d('bursts'),overheats:d('overheats'),flamesFromVulcan:d('flames'),meterYellow:shots.yellow,meterRed:shots.red,meterLocked:shots.lock,rings:{yellow:shots.yellowRing,red:shots.redRing},audio:s1.fx.audio};
  report.vulcan=r;console.log('vulcan',JSON.stringify(r));
  check(levels.join(',').startsWith('green,yellow,red,lock,green'),`the Vulcan heats, locks and opens again (${levels.join(' > ')})`);
  check(r.bursts>=2&&r.overheats>=1,`the burst cycle starts with every stream and the lock is seen (${r.bursts} bursts, ${r.overheats} locks)`);
  check(r.flamesFromVulcan===0,'Vulcan bullets show the burst cycle, not one-shot flames');
  check(shots.yellow?.horizontal&&shots.red?.horizontal&&shots.red.w>shots.yellow.w,`the sprite meter next to the ship is a horizontal bar that fills (${shots.yellow?.w}x${shots.yellow?.h} then ${shots.red?.w}x${shots.red?.h} px of fill colour)`);
  check(r.rings.yellow===FX_COLORS.yellow&&r.rings.red===FX_COLORS.red,`the ring follows the meter's colours (${r.rings.yellow}, ${r.rings.red})`);
  check(Array.isArray(r.audio?.loaded)&&['vulcan','overheat','boss'].every(k=>r.audio.loaded.includes(k)),`the sounds decode in Chromium (${r.audio?.loaded})`);
  check(r.audio?.played>=2,`the Vulcan bursts and the overheat play (${r.audio?.played} sounds played)`);
  await tick(2500);}

 // D. ?alienFx=0 (the global switch the same function reads): no effects, no new effect files, the v23 colours, the v23 bar
 await leave();await page.evaluate(()=>{globalThis.__alienFx=false;});const before=requests.length;await fresh();
 {const vul=await center('#vulcan');await touch('touchStart',[{...vul,id:2}]);let p=null,meter=null,ring=null;for(let i=0;i<30&&!meter;i++){await tick(40);p=await peek();if(p.ring.level==='yellow'){meter=await meterPixels(p);ring=p.ring.color;await capture('9-flag-off-v23');}}
  await touch('touchEnd');const s=await snap();
  const r={fx:'fx' in s,ring,newRequests:requests.length-before,meter};report.off=r;console.log('off',JSON.stringify(r));
  check(r.fx===false,'?alienFx=0: no effects in the session');check(r.newRequests===0,`?alienFx=0: no effect file requested (${r.newRequests})`);
  check(r.ring===V23_COLORS.yellow,`?alienFx=0: the v23 ring colour at the yellow band (${r.ring})`);
  check(meter&&!meter.horizontal&&meter.h>meter.w,`?alienFx=0: the v23 vertical bar, no sprite meter (${meter?.w}x${meter?.h} px of fill colour)`);}
 await leave();await page.evaluate(()=>{globalThis.__alienFx=undefined;});
 report.requests=[...new Set(requests)].sort();report.fails=fails;failures.push(...fails);
 await writeFile(new URL('../verification/aliens-v24/browser/report.json',import.meta.url),JSON.stringify(report,null,1)+'\n').catch(()=>{});
 return report;
});
if(failures.length){console.error('FAILED',failures);process.exitCode=1;}else console.log('all v24 effect checks passed');
