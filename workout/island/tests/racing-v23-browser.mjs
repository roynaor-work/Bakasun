// racing-v23 browser proof, real league race in Chromium/SwiftShader with REAL touch (CDP Input.dispatchTouchEvent: one finger holds the gas pedal,
// a second finger lands on the left half and drags to steer), phone viewport 844x390 with hasTouch + isMobile. Nothing in the race state is written by the test:
// the model is only read (and its step() is wrapped to log events), so the car meets the fence or the grass exactly as a child's thumbs would make it.
// Scenarios (RV23_SCENARIO):
//  wall     ?racingWalls=1: steer into the fence and keep pressing ("stuck in the wall"); every frame after the first hit is checked for the scene (not only sky).
//  offtrack the new default (no walls): steer off the circuit until the car flips and comes back to the centre line at speed 0, then drive on.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium ISLAND_CSP_BROWSER=1 RV23_SCENARIO=wall RV23_PART=racing-v23/wall node workout/island/tests/racing-v23-browser.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verify} from './night-browser.mjs';
const scenario=process.env.RV23_SCENARIO||'wall',part=process.env.RV23_PART||'racing-v23/'+scenario,extra=process.env.RV23_QUERY||(scenario==='wall'?'racingWalls=1':'');
const dir=fileURLToPath(new URL(`../verification/${part}/`,import.meta.url));await mkdir(dir+'frames/',{recursive:true});
await verify(part,[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,assert,ready,nav})=>{
 const report={scenario,query:extra,frames:[],events:[]};
 // the flags are read when the race session starts, so they are put on the address before the race opens
 await page.evaluate(q=>{if(q)history.replaceState(null,'',location.pathname+'?dev=1&'+q);},extra);
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;});
 await page.evaluate(()=>window.__island.games.stages('islandRacing'));await tick(60);await page.waitForFunction(()=>document.querySelector('[data-action=racing-league-go]'));
 await page.evaluate(()=>window.__island.games.racingLeagueGo());await tick(100);
 if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}
 for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}
 await ready();await tick(100);await nav();
 if(await page.locator('[data-action=racing-intro-go]').count()){await page.locator('[data-action=racing-intro-go]').tap();await tick(32);}
 // event log (read only): every event of every model step, as the session consumed it
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;window.__log=[];const step=m.step;m.step=(dt,i)=>{const r=step(dt,i);for(const e of m.state.events)window.__log.push({t:+m.state.time.toFixed(3),type:e.type,car:e.car,reason:e.reason,intensity:e.intensity,strength:e.strength});return r;};});
 for(let i=0;i<80&&(await snap()).phase!=='racing';i++)await tick(100);
 assert.equal((await snap()).phase,'racing','the race started');
 const cdp=await context.newCDPSession(page),touches=new Map();
 const send=async type=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...touches.values()]});};
 const down=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchStart');};
 const move=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchMove');};
 // CDP: touchEnd carries no points (it lifts every finger); lifting one finger of two is a touchMove with the fingers that stay
 const up=async id=>{const t=touches.get(id);touches.delete(id);if(touches.size)await send('touchMove');else await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return t;};
 const gas=await page.locator('.racing-accelerate').boundingBox(),pad=await page.locator('.racing-pad').boundingBox();
 assert.ok(gas&&gas.width>20,'the gas pedal is on screen');assert.ok(pad&&pad.width>200,'the steering pad covers the left half');
 report.controls={gas,pad};
 // pixel check of the 3D canvas alone: every other element of the game screen is made invisible for one screenshot (a class on <html>, no race state is touched), then
 // the mean per-row spread of brightness over the canvas is measured. A frame with only the sky backdrop is a flat vertical gradient (spread ~0.5); the scene is 20+.
 // With save, a second screenshot with the whole HUD is kept as the proof image.
 await page.addStyleTag({content:'html.rv23-measure .game-screen *{visibility:hidden!important}html.rv23-measure .game-screen canvas.rv23-scene{visibility:visible!important}'});
 await page.evaluate(()=>{const list=[...document.querySelectorAll('.game-screen canvas')].sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight);list[0]?.classList.add('rv23-scene');});
 const pixels=(png,save)=>page.evaluate(async({b,save})=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:'image/png'})),c=new OffscreenCanvas(bitmap.width,bitmap.height),g=c.getContext('2d');g.drawImage(bitmap,0,0);bitmap.close();
   const x0=Math.round(c.width*.08),x1=Math.round(c.width*.92),y0=Math.round(c.height*.2),y1=Math.round(c.height*.95),d=g.getImageData(x0,y0,x1-x0,y1-y0).data,w=x1-x0,h=y1-y0;let spread=0;const colors=new Set();
   for(let y=0;y<h;y++){let s=0,s2=0;for(let x=0;x<w;x++){const i=(y*w+x)*4,l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];s+=l;s2+=l*l;if(x%4===0&&y%4===0)colors.add((d[i]>>4)<<8|(d[i+1]>>4)<<4|d[i+2]>>4);}const m=s/w;spread+=Math.sqrt(Math.max(0,s2/w-m*m));}
   let webp=null;if(save){const blob=await c.convertToBlob({type:'image/webp',quality:.5});webp=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});}
   return {spread:+(spread/h).toFixed(2),colors:colors.size,webp};},{b:png.toString('base64'),save});
 const look=async(name,save=false)=>{await page.evaluate(()=>document.documentElement.classList.add('rv23-measure'));const bare=await pixels(await page.screenshot({type:'png'}),save);await page.evaluate(()=>document.documentElement.classList.remove('rv23-measure'));
  if(save){await writeFile(dir+'frames/'+name+'-scene.webp',Buffer.from(bare.webp,'base64'));const full=await pixels(await page.screenshot({type:'png'}),true);await writeFile(dir+'frames/'+name+'.webp',Buffer.from(full.webp,'base64'));}
  const s=await snap(),p=s.player,m=s.renderMetrics||{},inp=await page.evaluate(()=>{const i=window.__island.games.current?.session?.debug?.input?.sample?.();return i?{steer:+(i.steer||0).toFixed(2),throttle:i.throttle}:null;});return {name,input:inp,spread:bare.spread,colors:bare.colors,blank:bare.spread<4&&bare.colors<60,camera:m.cameraFinite===undefined?null:{finite:m.cameraFinite,fallbacks:m.cameraBad},time:+s.time.toFixed(2),speed:+p.speed.toFixed(1),lateral:+p.lateral.toFixed(2),crashT:+(p.crashT||0).toFixed(2),air:+(p.crashAir||0).toFixed(2),offroad:p.offroad,phase:s.phase};};
 report.frames.push(await look('0-racing',true));
 // finger 1 holds the gas for 2.5 s on the start straight
 await down(1,gas.x+gas.width/2,gas.y+gas.height/2);await tick(2500);
 report.frames.push(await look('1-gas',true));
 const cx=pad.x+pad.width*.45,cy=pad.y+pad.height*.62;
 if(scenario==='wall'){
  // finger 2: a third of a lock to the right, held: the car drifts across the road and meets the fence at a shallow angle (a wall hit, no flip), then keeps pressing into it
  await down(2,cx,cy);await tick(32);await move(2,cx+24,cy);await move(2,cx+30,cy);
  let hit=null;for(let i=0;i<400&&!hit;i++){await tick(16);hit=await page.evaluate(()=>window.__log.find(e=>e.type==='wall'&&e.car==='player')||null);}
  assert.ok(hit,'the player reached the fence by touch');report.firstHit=hit;
  // every frame for 1.2 s after the first hit (75 frames at 60 Hz): scene or only sky; the key frames are saved
  for(let k=0;k<75;k++){const f=await look('wall-'+String(k).padStart(2,'0'),k<6||k%10===0);f.frame=k;report.frames.push(f);await tick(16);}
  await up(2);await tick(600);report.frames.push(await look('wall-after',true));
 }else{
  // finger 2: full lock to one side on the start straight; the car leaves the asphalt, crosses the run-off and the gravel, flips and comes back to the centre line
  await down(2,cx,cy);await tick(32);await move(2,cx+60,cy);await move(2,cx+75,cy);
  let flip=null;for(let i=0;i<600&&!flip;i++){await tick(16);flip=await page.evaluate(()=>window.__log.find(e=>e.type==='crash'&&e.car==='player')||null);if(i%12===0)report.frames.push(await look('out-'+String(i).padStart(3,'0'),i%48===0));}
  assert.ok(flip,'driving off the circuit flips the car');report.flip=flip;await up(2);
  for(let k=0;k<90;k++){const f=await look('flip-'+String(k).padStart(2,'0'),k%6===0);f.frame=k;report.frames.push(f);if(f.crashT===0&&k>3)break;await tick(16);}
  const land=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,q=tr.project(p.x,p.z,p.s);return {speed:p.speed,lateral:p.lateral,projLateral:q.lateral,headingError:Math.atan2(Math.sin(p.heading-tr.sample(p.s).heading),Math.cos(p.heading-tr.sample(p.s).heading)),crashT:p.crashT,phase:m.state.phase,routeS:p.routeS,checkpoints:p.checkpoints};});
  report.land=land;report.frames.push(await look('landed',true));
  assert.equal(land.crashT,0,'the flip ended');assert.ok(Math.abs(land.projLateral)<1,'back on the centre line: '+land.projLateral);assert.ok(land.speed<.6,'from speed 0: '+land.speed);assert.ok(Math.abs(land.headingError)<.12,'pointing along the race direction: '+land.headingError);
  await tick(1500);const go=await snap();report.after={speed:go.player.speed,phase:go.phase};report.frames.push(await look('drive-on',true));
  assert.ok(go.player.speed>5,'the gas finger drives the car on after the reset: '+go.player.speed);
 }
 await up(1);
 report.events=await page.evaluate(()=>window.__log.filter(e=>e.car==='player'&&e.type!=='pass').slice(0,80));
 const after=report.frames.filter(f=>/^(wall-\d|flip-|landed|drive-on)/.test(f.name));report.blankFrames=after.filter(f=>f.blank).map(f=>f.name);
 report.summary={framesChecked:after.length,blank:report.blankFrames.length,minSpread:Math.min(...after.map(f=>f.spread))};
 await writeFile(dir+'frames.json',JSON.stringify(report,null,1)+'\n');
 if(process.env.RV23_EXPECT_BLANK!=='1')assert.equal(report.blankFrames.length,0,'no frame after the hit shows only the sky: '+report.blankFrames.join(','));
 return report.summary;
});
