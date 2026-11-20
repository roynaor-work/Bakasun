// aliens v24.6 laser burst in the real shell (evidence): Chromium as a phone (hasTouch, isMobile, 844x390, SwiftShader WebGL, the 3D layer as on the phone),
// stage 1, the ship set under the nearest column of ships, the laser pickup dropped on the ship (the way the game drops it: a pickup of kind 1 that the ship collects), then the Vulcan button pressed by
// real CDP touches: three taps of 0.15 s, 3 s apart, then a 3 s hold. Logged every frame: the beam's time left, the ships it hit, the laser rounds of
// v24.5 (beam25) in flight; screenshots of the beam. Run once per version:
//   node workout/island/tools/aliens-laser-burst-v24-6.mjs <outDir> [--query=alienLaserBurst=0] [--label=before]
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
const args=process.argv.slice(2),outDir=args.find(a=>!a.startsWith('--'))||'aliens-laser-burst-v24-6';
const opt=(name,fallback)=>{const hit=args.find(a=>a.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const QUERY=opt('query',''),LABEL=opt('label',QUERY?'before':'after');await mkdir(outDir,{recursive:true});
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await context.newPage();page.setDefaultTimeout(300000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await page.goto(`${server.url}?dev=1${QUERY?'&'+QUERY:''}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island,null,{timeout:300000});
 await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='airbase'))e.state.buildings.push({id:'t-airbase',typeId:'airbase',x:0,y:0,level:1});});
 await page.evaluate(()=>window.__island.games.start('alienDefense',undefined,1));
 if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>window.__island.games.current?.session?.debug?.model,null,{timeout:300000});
 await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.artModels?.loaded===6,null,{timeout:240000}).catch(()=>{});
 await page.waitForTimeout(2500);
 const view=await page.evaluate(()=>window.__island.games.current.session.debug.view?.mode??null);
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;const col=m.aliens.filter(a=>a.y>0).sort((a,b)=>Math.abs(a.x-m.player.x)-Math.abs(b.x-m.player.x))[0];if(col)m.player.x=col.x;m.pickups.push({kind:1,x:m.player.x,y:m.player.y,vy:0});
  const log=window.__burst=[];const orig=m.update.bind(m);m.update=(dt,input)=>{orig(dt,input);const b=m.laserBurst;log.push({t:+m.time.toFixed(2),laserTime:+(m.laserTime||0).toFixed(2),left:b?+b.left.toFixed(2):null,hits:b?.hits??null,kills:b?.kills??null,rounds:m.shots.filter(s=>s.beam25).length,firing:!!(input&&(input.firing||input.vulcan))});};});
 const V=await page.locator('#vulcan').boundingBox(),pt={x:Math.round(V.x+V.width/2),y:Math.round(V.y+V.height/2),id:1};
 const shots=[];const shot=async name=>{const file=path.join(outDir,`${LABEL}-${name}.jpg`);await page.screenshot({path:file,type:'jpeg',quality:80});shots.push(file);};
 for(let k=0;k<3;k++){await touch('touchStart',[pt]);await page.waitForTimeout(150);await touch('touchEnd',[]);await page.waitForTimeout(k===0?700:2850);if(k===0)await shot('after-tap');}
 await touch('touchStart',[pt]);await page.waitForTimeout(1500);await shot('hold');await page.waitForTimeout(1500);await touch('touchEnd',[]);await page.waitForTimeout(3000);
 const log=await page.evaluate(()=>window.__burst),snap=await page.evaluate(()=>window.__island.games.current?.session.debug.model.snapshot());
 const lit=log.filter(r=>r.left>0),dt=log.length>1?(log.at(-1).t-log[0].t)/(log.length-1):1/60;
 const summary={label:LABEL,query:QUERY,view,frames:log.length,litSeconds:+(lit.length*dt).toFixed(2),beamHits:snap?.laserBurst?.hits??0,beamKills:snap?.laserBurst?.kills??0,presses:snap?.laserBurst?.presses??0,
  laserRoundsSeen:log.reduce((n,r,i)=>n+Math.max(0,r.rounds-(log[i-1]?.rounds??0)),0),firingFrames:log.filter(r=>r.firing).length,laserTimeStart:log.find(r=>r.laserTime>0)?.laserTime??0,shots,errors};
 await writeFile(path.join(outDir,`${LABEL}.json`),JSON.stringify({...summary,log}));console.log(JSON.stringify(summary));
}finally{await browser.close();await server.close();}
