/** Soccer v8 motion check (dev tool, evidence only).
 * A) For every v8 clip the game plays: 8-frame contact sheet (side and front) and measurements through tools/soccer-v7-frames.html
 *    (lowest skinned vertex = floor penetration if negative, stance float, hips step).
 * B) In a real match with a scripted bot: for each kick (shot/pass) the distance from the nearest boot to the ball at the clip's
 *    ball-contact time, so the visual strike lines up with the simulation's ball. Run once with v8 and once with `soccerV8=0`.
 * Usage: node tools/soccer-v8-motion-check.mjs <outDir> [sheets|contact|all] */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

const [outDir,mode='all']=process.argv.slice(2);
if(!outDir)throw Error('usage: soccer-v8-motion-check.mjs <outDir> [sheets|contact|all]');
await mkdir(outDir,{recursive:true});
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const FIELD=['v8_pass_short','v8_pass_long','v8_pass_loft','v8_shot'],KEEPER=['v8_keeper_ready',...['low','middle','high'].flatMap(r=>['left','center','right'].map(s=>`v8_keeper_dive_${r}_${s}`))];
const result={};
try{
 if(mode!=='contact'){
  result.clips={};
  for(const view of ['side','front']){
   const context=await browser.newContext({viewport:{width:1700,height:900},deviceScaleFactor:1}),page=await context.newPage();
   page.on('pageerror',e=>console.log('pageerror',e.message));
   await page.goto(`${server.url}tools/soccer-v7-frames.html?view=${view}`,{waitUntil:'load'});
   await page.waitForFunction(()=>window.__ready===true,null,{timeout:240000});
   for(const [group,list] of [['field',FIELD],['keeper',KEEPER]])for(const clip of list){
    const data=await page.evaluate(([clip,group])=>({m:window.__frames.measure(clip,group),png:window.__frames.sheet(clip,group)}),[clip,group]);
    await writeFile(path.join(outDir,`frames-${view}-${clip}.png`),Buffer.from(data.png.split(',')[1],'base64'));
    if(view==='side')result.clips[clip]=data.m;
   }
   await context.close();
  }
 }
 if(mode!=='sheets'){
  result.contact={};
  for(const [label,query] of [['v8','soccerTier=0'],['v7','soccerTier=0&soccerV8=0']]){
   const context=await browser.newContext({viewport:{width:320,height:180},hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
   page.on('pageerror',e=>console.log('pageerror',e.message));
   await page.goto(`${server.url}?dev=1&${query}`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
   await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
   await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));
   if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
   await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:240000});
   // Bot on the controlled player (chase, dribble to goal, shoot or pass), plus a sampler that records boot-to-ball distance at each kick's contact time.
   const samples=await page.evaluate(async seconds=>{
    const {model,view}=window.__island.games.current.session.debug,balance=model.getState();
    let n=7,hold=0,pass=0,since=0;const rnd=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
    const session=window.__island.games.current.session;session.setPaused(true); // stepped by hand: fixed 1/30 s, no wall-clock dependence
    const out=[],last=new Map(),ball={x:0,y:0,z:0},names=['LeftFoot','RightFoot'],tmp=new (view.characters[0].root.position.constructor)();
    const bot=(dt)=>{
     const s=model.getState(),p=s.players[s.controlled],b=s.ball,goalX=s.attackDir*24,i={moveX:0,moveZ:0,kickHeld:false,passHeld:false,sprintHeld:false,switchPlayer:false};since+=dt;
     let dx,dz;if(b.owner===p.id){dx=goalX-p.x;dz=-p.z*.35;if(hold<=0&&pass<=0&&since>.5){since=0;if(Math.abs(goalX-p.x)<14&&rnd()<.55)hold=.3+rnd()*.3;else if(rnd()<.45)pass=.08+rnd()*.5;}}else{dx=b.x-p.x;dz=b.z-p.z;i.sprintHeld=Math.hypot(dx,dz)>6;}
     const l=Math.hypot(dx,dz)||1;i.moveX=dx/l;i.moveZ=dz/l;if(hold>0){hold-=dt;i.kickHeld=hold>0;}if(pass>0){pass-=dt;i.passHeld=pass>0;}return i;};
    const dt=1/30;
    for(let step=0;step<seconds*30;step++){
     model.update(dt,bot(dt));model.drainEvents?.();view.render(model.renderState?.()??model.getState(),dt,16);
     const m=view.metrics().ballPosition;ball.x=m.x;ball.y=m.y;ball.z=m.z;
     view.characters.forEach((c,id)=>{
      if(!c.design||!c.pivot.visible)return;const state=c.motion.state,action=c.motion.actions[state],contact=c.motion.contactTime(state);
      if(!action||contact===null||!/pass|kick|shot/.test(state))return;
      const t=action.time,key=id+':'+state;let rec=last.get(key);
      if(!rec||t<rec.t-.01){rec={t,done:false,best:Infinity,at:0};last.set(key,rec);}
      rec.t=t;c.root.updateMatrixWorld(true);let d=Infinity;
      for(const nm of names){c.root.getObjectByName(nm).getWorldPosition(tmp);d=Math.min(d,Math.hypot(tmp.x-ball.x,tmp.y-ball.y,tmp.z-ball.z));}
      if(Math.abs(t-contact)<.1&&d<rec.best){rec.best=d;rec.at=t-contact;rec.ballY=ball.y;}
      if(t>contact+.1&&!rec.done&&rec.best<Infinity){rec.done=true;out.push({state,bootToBallM:+rec.best.toFixed(3),offsetS:+rec.at.toFixed(3),ballY:+(rec.ballY||0).toFixed(2)});}
     });
     if(step%15===0)await new Promise(r=>setTimeout(r));
    }
    return out;
   },150);
   result.contact[label]=samples;
   await context.close();
  }
 }
}finally{await browser.close();await server.close();}
await writeFile(path.join(outDir,'motion-check.json'),JSON.stringify(result,null,1));
for(const [clip,m] of Object.entries(result.clips||{}))console.log(clip.padEnd(28),`lowest ${m.lowestVertexM}m  float ${m.maxFloatM}m  hipsStep ${m.maxHipsStepM}m`);

for(const [label,list] of Object.entries(result.contact||{})){
 const by={};for(const r of list)(by[r.state]??=[]).push(r.bootToBallM);
 for(const [state,v] of Object.entries(by))console.log(label.padEnd(3),state.padEnd(16),`n=${v.length}`,`median boot-to-ball ${[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)]} m`,`max ${Math.max(...v)} m`);
}
