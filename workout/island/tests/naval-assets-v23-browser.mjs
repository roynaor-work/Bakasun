// The Codex plane, helicopter and supply buoy in the ships game, through the island shell with real touch only (CDP touch on the
// on-screen controls, 844x390, hasTouch + isMobile, SwiftShader) and real frames; the model is only read, never driven, and the stage
// data is not changed (the first helicopter of stage 3 arrives after 18 s of game time, as in the game).
// (A) stage 3: the aircraft are the GLB models (the HUD brackets them), the right thumb holds the Vulcan button and puts the crosshair
//     on the helicopter until it falls; (B) stage 1: taps on Fire spend the magazine, the supply buoy appears as the GLB model and the
//     left thumb sails into it. The render budget (70 draw calls, 90,000 triangles) is read from the renderer's peak.
// MODE=before applies `?navalAssets=0` (the procedural shapes) for the comparison of draw calls and triangles.
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const before=process.env.MODE==='before',part=before?'naval-assets-v23-before':'naval-assets-v23',flag=before?'&navalAssets=0':'';
const frames=new URL(`../verification/${part}/`,import.meta.url);await mkdir(frames,{recursive:true});
const DEG=180/Math.PI,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
try{
await verify(part,[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,start,exit,assert})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await page.evaluate(flag=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=30;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;history.replaceState(null,'',location.pathname+'?dev=1'+flag);},flag);
 const capture=name=>page.screenshot({path:new URL(`${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 const center=async selector=>{const b=await page.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const ready=async stage=>{await start('navalDuel',stage);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);};
 const report={mode:before?'before (?navalAssets=0)':'after (Codex models)',search:await page.evaluate(()=>location.search)};
 const peak=async()=>{const m=(await snap()).renderMetrics;return {drawCalls:m.peak?.drawCalls??m.drawCalls,triangles:m.peak?.triangles??m.triangles};};

 // (A) Stage 3: wait for the helicopter in real frames, then the Vulcan by touch.
 await ready(3);await touch('touchStart',[{x:300,y:150}]);await tick(40);await touch('touchEnd');await tick(200);
 let s,seen=null,inRange=0;for(let t=0;t<40000&&inRange<8;t+=250){await tick(250);s=await snap();const a=s.air?.find(a=>a.state!=='down');if(a&&!seen){seen={kind:a.kind,at:+s.time.toFixed(1)};}if(a&&Math.hypot(a.x-s.playerShip.x,a.z-s.playerShip.z)<=135)inRange++;}
 s=await snap();const air0=s.renderMetrics.air;report.arrival={...seen,models:air0?.models,assets:air0?.assets};await capture('a0-aircraft');
 assert.ok(seen,'an aircraft arrived on stage 3');assert.ok(inRange>=8,'it came in range of the Vulcan');
 if(before)assert.equal(air0.models.glb,0,'?navalAssets=0: the procedural shapes');else{assert.ok(air0.models.glb>=1&&air0.models.procedural===0,`the aircraft are the Codex models (${JSON.stringify(air0.models)})`);assert.deepEqual([...air0.assets.ready].sort(),['heli','plane']);}
 const vb=await center('.naval-vulcan');await touch('touchStart',[{x:vb.x,y:vb.y,id:5}]);await tick(60);s=await snap();
 const K=await page.evaluate(()=>{const b=window.__island.data.config.minigames.navalDuel;return {ws:b.render.worldScale,sp:b.render.enemySpacing/b.combat.laneSpacing};});
 const angles=(p,a)=>({yaw:Math.atan2(a.z-p.z,a.x-p.x),pitch:Math.atan2(Math.max(0,a.h)*.32,Math.max(.01,Math.hypot((a.x-p.x)*K.ws,(a.z-p.z)*K.sp)))});
 let dx=0,dy=0,onTarget=0,downShot=false;
 for(let i=0;i<260;i++){const a=s.air?.find(a=>a.state!=='down');if(!a)break;const want=angles(s.playerShip,a),yawErr=wrap(want.yaw-s.sky.yaw)*DEG,pitchErr=(want.pitch-s.sky.pitch)*DEG;
  if(Math.abs(yawErr)>2.4)dx=Math.sign(yawErr)*Math.min(78,26+Math.abs(yawErr)*.8);else dx=Math.max(-22,Math.min(22,Math.max(-22,Math.min(22,dx))+yawErr/.12));dy=Math.max(-150,Math.min(60,dy-pitchErr/.16));
  await touch('touchMove',[{x:vb.x+dx,y:vb.y+dy,id:5}]);await tick(50);s=await snap();if(s.vulcan.onTarget){onTarget++;if(onTarget===3)await capture('a1-vulcan-on-model');}if(s.vulcan.kills>0)break;}
 await touch('touchEnd');await tick(60);
 for(let t=0;t<1200&&!downShot;t+=100){await tick(100);s=await snap();if(s.air?.some(a=>a.state==='down')){downShot=true;await capture('a2-model-falling');}}
 for(let t=0;t<4000&&!(s.vulcan.splashes>0);t+=250){await tick(250);s=await snap();}
 report.vulcan={onTarget,kills:s.vulcan.kills,splashes:s.vulcan.splashes,shots:s.vulcan.shots,hits:s.vulcan.hits};report.airPeak=await peak();
 assert.equal(s.vulcan.kills,1,'the helicopter was shot down by touch');assert.ok(report.airPeak.drawCalls<=70&&report.airPeak.triangles<=90000,`render budget with aircraft (${JSON.stringify(report.airPeak)})`);
 await exit();await tick(300);

 // (B) Stage 1: the supply buoy.
 await ready(1);const fire=await center('#shoot');
 // Turn the turret to open water by hand and lift on the X (no shot), so the taps that follow do not end the stage.
 await touch('touchStart',[{x:fire.x,y:fire.y,id:4}]);await tick(80);await touch('touchMove',[{x:fire.x-30,y:fire.y,id:4}]);await tick(16);await touch('touchMove',[{x:fire.x-60,y:fire.y,id:4}]);await tick(900);
 const chip=await center('.naval-aim-cancel');await touch('touchMove',[{x:chip.x,y:chip.y,id:4}]);await tick(60);await touch('touchEnd');await tick(300);
 const tapFire=async()=>{await touch('touchStart',[fire]);await tick(60);await touch('touchEnd');await tick(420);};
 for(let i=0;i<30&&(await snap()).loaded>3;i++)await tapFire();await tick(200);s=await snap();
 report.buoy={appeared:s.buoys?.length||0,model:s.renderMetrics.supply?.model,assets:s.renderMetrics.supply?.assets};await capture('b0-buoy');
 assert.equal(s.buoys.length,1,'a supply buoy appeared');if(before)assert.equal(report.buoy.model,'procedural');else assert.equal(report.buoy.model,'glb','the buoy is the Codex model');
 // Left thumb: sail into the buoy.
 const z=await page.locator('.naval-stick-zone').boundingBox(),c={x:z.x+z.width*.45,y:z.y+z.height*.6};const b0={...s.buoys[0]};await touch('touchStart',[{...c,id:7}]);await tick(40);
 for(let t=0;t<12000;t+=100){s=await snap();if(s.supplies>=1||s.result)break;const p=s.playerShip,d=Math.hypot(b0.x-p.x,b0.z-p.z),rel=wrap(Math.atan2(b0.z-p.z,b0.x-p.x)-(s.camera?.heading||0)),k=Math.min(1,.4+d/50);await touch('touchMove',[{x:c.x+Math.sin(rel)*46*k,y:c.y-Math.cos(rel)*46*k,id:7}]);await tick(100);if(t===800)await capture('b1-buoy-near');}
 await touch('touchEnd');await tick(200);s=await snap();report.buoy.supplies=s.supplies;report.buoyPeak=await peak();
 assert.equal(s.supplies,1,'sailing into the buoy reloads');assert.ok(report.buoyPeak.drawCalls<=70&&report.buoyPeak.triangles<=90000,`render budget with the buoy (${JSON.stringify(report.buoyPeak)})`);
 console.log('ASSETS',JSON.stringify(report));await exit();return report;
});
}catch(e){console.error(e.message);process.exitCode=e.exitCode||1;}
