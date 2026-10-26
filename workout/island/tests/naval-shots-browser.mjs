// Fixed-state naval screenshots for before/after comparison, and an optional
// frame sequence for a short clip (NAVAL_CLIP=1, 844x390 only). The same input
// stream runs on any branch: stage 3, normal shell, full health, untouched ammo.
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const out=process.env.NAVAL_SHOTS_DIR?new URL('file://'+process.env.NAVAL_SHOTS_DIR.replace(/\/?$/,'/')):new URL('../verification/naval-shots/',import.meta.url);await mkdir(out,{recursive:true});
const prefix=process.env.NAVAL_SHOTS_PREFIX||'after',clip=process.env.NAVAL_CLIP==='1';
const sizes=[{width:844,height:390},{width:740,height:360},{width:1366,height:768}].filter(v=>!process.env.NAVAL_SHOTS_ONLY||String(v.width)===process.env.NAVAL_SHOTS_ONLY);
await verify('naval-shots',clip?[{width:844,height:390}]:sizes,async({page,context,viewport,tick,snap,start,exit})=>{
 const tag=`${viewport.width}x${viewport.height}`,capture=name=>page.screenshot({path:new URL(`${prefix}-${tag}-${name}.jpg`,out).pathname,type:'jpeg',quality:90});
 const phone=viewport.width<1000,client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=10;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;});
 await start('navalDuel',3);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);
 // The hold starts on the aim pad, left of the Fire button and above the weapon dock, so a
 // straight upward drag never crosses the cancel chip in either version.
 const b=await page.locator('#shoot').boundingBox(),fire={x:b.x+b.width/2-viewport.width*.27,y:b.y+b.height/2-40};
 const down=async()=>{if(phone)await touch('touchStart',[fire]);else{await page.mouse.move(fire.x,fire.y);await page.mouse.down();}};
 const move=async(dx,dy)=>{if(phone)await touch('touchMove',[{x:fire.x+dx,y:fire.y+dy}]);else await page.mouse.move(fire.x+dx,fire.y+dy);};
 const up=async()=>{if(phone)await touch('touchEnd');else await page.mouse.up();};
 let frame=0;const film=async ms=>{for(let t=0;t<ms;t+=50){await tick(50);await page.screenshot({path:new URL(`clip-${String(frame++).padStart(3,'0')}.jpg`,out).pathname,type:'jpeg',quality:85});}};
 const report={};
 if(clip){await film(300);await down();await film(1300);for(let i=1;i<=12;i++){await move(0,-10*i);await film(50);}await film(500);await up();await film(2200);await exit();return {frames:frame};}
 let s=await snap();report.sea={peak:s.renderMetrics.peak};await capture('1-sea');
 await down();await tick(1300);s=await snap();report.aimWater={turret:s.turret,prediction:s.prediction,camera:s.camera?.zoom,box:s.renderMetrics.playerBox,aimArc:s.renderMetrics.aimArc};await capture('2-aim-water');
 for(let i=1;i<=12;i++){await move(0,-10*i);await tick(50);}await tick(500);s=await snap();report.aimHull={turret:s.turret,prediction:s.prediction,box:s.renderMetrics.playerBox,metrics:{triangles:s.renderMetrics.triangles,drawCalls:s.renderMetrics.drawCalls}};await capture('3-aim-hull');
 await up();await tick(40);s=await snap();const flight=s.ball.predicted?.contact?.t??s.ball.duration;report.release={fired:s.fired,predicted:s.ball.predicted?.end};
 await tick(Math.round(flight*500));await capture('4-flight');
 await tick(Math.round(flight*500)+30);await capture('5-impact');s=await snap();report.impact={last:s.lastShot?.actual,metrics:{triangles:s.renderMetrics.triangles,drawCalls:s.renderMetrics.drawCalls}};
 await tick(160);await capture('6-impact-late');await tick(1500);s=await snap();report.after={zoom:s.camera?.zoom,peak:s.renderMetrics.peak};
 await exit();return report;
});
