import nodeTest from 'node:test';
// Browser suite (Chromium + Playwright), like the other island browser tests: runs with
//   ISLAND_CSP_BROWSER=1 ISLAND_PLAYWRIGHT=<playwright index.mjs> CHROMIUM_PATH=<chrome>
const test=process.env.ISLAND_CSP_BROWSER==='1'?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import {serveRepository,launchBrowser} from './review-v241/helpers-hoops.mjs';

test('V241-014: the real v13 pump fake raises both palms to a shooting position and returns without releasing', {timeout:240000}, async t=>{
 const server=await serveRepository(),browser=await launchBrowser();
 t.after(async()=>{await browser.close();await server.close();});
 const page=await browser.newPage();await page.goto(server.url+'/__review_fixture');
 const results=await page.evaluate(async()=>{
  const T=await import('/workout/island/vendor/three.module.js');
  const {loadAthleteHoops}=await import('/workout/island/minigames/hoops-athlete.mjs');
  const {createAvatarTall}=await import('/workout/island/minigames/hoops-tall.mjs');
  const cfg=(await(await fetch('/workout/island/data/config.json')).json()).minigames.streetSlam;
  const results=[];
  for(const query of ['', 'hoopsFakeV13=0','hoopsMotionV13=0','hoopsV241=0']){
   const assets=await loadAthleteHoops(cfg.assets,new URL('/workout/island/',location.href),null,{params:new URLSearchParams(query)});
   const av=createAvatarTall(assets,{id:'regression',pos:'PG',number:4,ratings:{height:188}},{primary:'#2b7bc7',trim:'#ffffff'});
   const samples=[];
   for(let k=0;k<=32;k++){
    const actT=.52*k/32,p={vx:0,vz:0,face:0,hasBall:true,dribbling:false,act:'fake',actT,y:0};
    av.pose(p,{},1/60);av.root.updateMatrixWorld(true);
    const l=av.hands.l.getWorldPosition(new T.Vector3()),r=av.hands.r.getWorldPosition(new T.Vector3()),chest=av.root.getObjectByName('Chest').getWorldPosition(new T.Vector3()),foot=av.root.getObjectByName('RightFoot').getWorldPosition(new T.Vector3());
    samples.push({actT,l:l.y,r:r.y,chest:chest.y,foot:foot.y,clipTime:av.actions.jump_shot.time});
   }
   const peak=samples[16],start=samples[0],end=samples.at(-1);
   results.push({query,peak,start,end,release:assets.pack.clips.jump_shot.events.release[0],bodyVersion:assets.bodyVersion,samples});
   av.dispose();assets.dispose();
  }
  return results;
 });
 console.log(JSON.stringify(results.map(({samples,...row})=>row)));
 const [fixed,off,v12,masterOff]=results;
 assert.ok(fixed.peak.r>fixed.peak.chest+.03,'right palm reaches a visible shooting position above the chest');
 assert.ok(fixed.peak.l>fixed.peak.chest+.03,'left palm supports the raised ball');
 assert.ok(fixed.peak.r-fixed.start.r>.18,'fake raises the shooting hand by at least 18 cm');
 assert.ok(fixed.peak.r-fixed.end.r>.18,'fake returns the hand to the gather');
 assert.ok(fixed.samples.every(s=>s.clipTime<fixed.release),'the ball stays held before the release event');
 assert.ok(Math.max(...fixed.samples.map(s=>s.foot))-Math.min(...fixed.samples.map(s=>s.foot))<.01,'pump fake keeps the feet planted');
 assert.ok(fixed.peak.r>off.peak.r+.18,'kill switch reproduces the low-hand defect');
 assert.ok(Math.abs(v12.peak.clipTime-.58)<1e-9,'v12 keeps its authored legacy fake window');
 assert.ok(Math.abs(masterOff.peak.clipTime-.58)<1e-9,'master rollback retains the v24 plan');
});
