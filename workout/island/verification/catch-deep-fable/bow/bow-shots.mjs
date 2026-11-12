// Proof screenshots of the v6 archery stage (first person, launcher, sight, net) through the real session (tools/catch-harness6.html).
//   node workout/island/verification/catch-deep-fable/bow/bow-shots.mjs [outDir] [stages=1,5,7,10]
// Needs a static server on the repo root (http://127.0.0.1:8765/) and Playwright under /opt/node-tools.
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
const [,,outDir=new URL('.', import.meta.url).pathname, stagesArg='1,5,7,10']=process.argv;
const {chromium}=await import('/opt/node-tools/node_modules/playwright/index.mjs');
const base='http://127.0.0.1:8765/workout/island/';
await mkdir(outDir,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--no-proxy-server']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true});
await context.addInitScript(()=>{localStorage.setItem('island.sound','off');localStorage.setItem('island.catch.help2','1');localStorage.setItem('island.catch.help6','1');});
const report={stages:{}};
const S=()=>window.session, n2=n=>String(n).padStart(2,'0');
const shot=(page,name)=>page.screenshot({path:path.join(outDir,name+'.png')});
const open=async stage=>{
  const page=await context.newPage(); page.on('pageerror',e=>console.log('pageerror',e.message.slice(0,300))); page.on('console',m=>{if(m.type()==='error')console.log('console',m.text().slice(0,300));});
  await page.goto(`${base}tools/catch-harness6.html?stage=${stage}&seed=3&dev=1`);
  await page.waitForFunction('window.done===true',null,{timeout:180000,polling:300});
  await page.waitForFunction(()=>session.snapshot.mode==='chase',null,{timeout:90000,polling:200});
  await page.evaluate(()=>session.debug.skipChase());
  await page.waitForFunction(()=>session.snapshot.mode==='throw',null,{timeout:90000,polling:200});
  await page.waitForTimeout(5200); // the camera blend from the chase, drawn slowly in software GL
  return page;
};
// solve a shot at full draw on the real engine: the (angle, yaw) whose wind-aware flight catches (or catches perfectly)
const SOLVE=(wantPerfect)=>{const e=session.engine,P=e.balance.physics,t0=e.clock+P.throwSeconds;let best=null,fallback=null;
 for(let a=P.angle.min;a<=60&&!best;a+=.25){const f0=e.trajectory(a,1,e.aim.tool,{yaw:0,withWind:false,stopAtObstacle:false});const c=e.criminalAt(t0+f0.duration);
  for(let dy=-3;dy<=3&&!best;dy+=.4){const yaw=Math.atan2(c.z,c.x-P.release.x)*180/Math.PI+dy;const f=e.trajectory(a,1,e.aim.tool,{resolve:true,t0,yaw});
   if(f.kind==='catch'){if(!fallback)fallback=[a,yaw];if(!wantPerfect||f.perfect)best=[a,yaw];}}}
 const r=best||fallback;if(!r)return null;const w=e.wobbleAt(e.clock);e.setAim({angle:r[0]-w.angle,power:1,yaw:r[1]-w.yaw});return {angle:r[0],yaw:r[1],perfect:Boolean(best)&&wantPerfect};};
const waitPhase=(page,list,ms=60000)=>page.waitForFunction(l=>l.includes(session.engine.state.phase),list,{timeout:ms,polling:30}).then(()=>true,()=>false);
const waitShare=(page,share,maxDist=99)=>page.waitForFunction(([sh,md])=>{const e=session.engine,f=e.flightNow();return (!f&&e.state.phase!=='flight'&&e.state.phase!=='throw')||(f&&f.share>=sh&&f.dist<=md);},[share,maxDist],{timeout:60000,polling:20}).then(()=>true,()=>false);
const aimOf=page=>page.evaluate(()=>({...session.engine.aim,phase:session.engine.state.phase}));
const thiefPx=page=>page.evaluate(()=>{const v=session.debug.view(),th=v.thieves[0].actor,root=th.root.position;const head=th.headWorld();const a=v.project(root.x,0,root.z),b=v.project(head.x,head.y+.12,head.z);return {feetY:a.y,headY:b.y,height:Math.round(a.y-b.y),dist:+v.bow.thiefDistance().toFixed(1)};});
const info=page=>page.evaluate(()=>{const r=session.debug.view().renderer.info;return {calls:r.render.calls,triangles:r.render.triangles};});

for(const stage of stagesArg.split(',').map(Number)){
  const page=await open(stage), R=report.stages[stage]={};
  await shot(page,`stage${n2(stage)}-1-idle`); R.idle=await aimOf(page); R.thief=await thiefPx(page); R.render=await info(page);
  // hold = draw (power 1), drag right and up = sight moves right and up
  const before=await aimOf(page);
  await page.mouse.move(430,210); await page.mouse.down(); await page.waitForTimeout(500);
  await page.mouse.move(470,180,{steps:6}); await page.waitForTimeout(400);
  R.drawn=await aimOf(page); R.drawnOk=R.drawn.power===1&&R.drawn.yaw>before.yaw&&R.drawn.angle>before.angle;
  await shot(page,`stage${n2(stage)}-2-drawn`);
  await page.mouse.up();
  R.released=await waitPhase(page,['throw','flight']); 
  await waitShare(page,.3); await shot(page,`stage${n2(stage)}-3-flight`);
  await waitShare(page,.5,3.2); await shot(page,`stage${n2(stage)}-4-slowmo`);
  await waitPhase(page,['impact','flee','escape','caught','aim']); await page.waitForTimeout(250); await shot(page,`stage${n2(stage)}-5-after-drag-shot`);
  await waitPhase(page,['aim','done']); await page.waitForTimeout(600);
  // a solved hit at full draw
  for(const [kind,perfect,name] of [['hit',false,'6-hit'],['head',true,'7-head-hit']]){
    if(await page.evaluate(()=>session.engine.state.phase)!=='aim')break;
    const sol=await page.evaluate(SOLVE,perfect); R[kind]=sol; if(!sol){console.log('stage',stage,'no solution for',kind);continue;}
    await page.evaluate(()=>session.debug.release());
    await waitShare(page,.6,2.6); await shot(page,`stage${n2(stage)}-${name}-approach`);
    await waitPhase(page,['impact']); await page.waitForTimeout(350); await shot(page,`stage${n2(stage)}-${name}`);
    R[kind+'Result']=await page.evaluate(()=>({kind:session.engine.state.flight?.kind,perfect:session.engine.state.flight?.perfect,catches:session.engine.state.catches}));
    await waitPhase(page,['aim','done']); await page.waitForTimeout(700);
  }
  // a miss: short and to the side
  if(await page.evaluate(()=>session.engine.state.phase)==='aim'){
    await page.evaluate(()=>{const e=session.engine;e.setAim({angle:3,power:1,yaw:14});session.debug.release();});
    await waitPhase(page,['impact']); await page.waitForTimeout(350); await shot(page,`stage${n2(stage)}-8-miss`);
    R.miss=await page.evaluate(()=>({kind:session.engine.state.flight?.kind}));
  }
  R.state=await page.evaluate(()=>({phase:session.engine.state.phase,catches:session.engine.state.catches,throwsLeft:session.engine.state.throwsLeft,won:session.engine.state.won}));
  await page.close();
}
// an 8-frame sheet of one solved shot on stage 5
{
  const page=await open(5); const frames=[];
  await page.mouse.move(430,210); await page.mouse.down(); await page.waitForTimeout(450);
  await page.evaluate(SOLVE,false); await shot(page,'sheet-f0-drawn'); frames.push('sheet-f0-drawn');
  await page.mouse.up(); // the release fires the solved aim
  await waitPhase(page,['throw','flight']); await page.waitForTimeout(120); await shot(page,'sheet-f1-release'); frames.push('sheet-f1-release');
  for(const [i,sh] of [[2,.15],[3,.35],[4,.55],[5,.72]]){await waitShare(page,sh);await shot(page,`sheet-f${i}-flight`);frames.push(`sheet-f${i}-flight`);}
  await waitShare(page,.6,2.4); await shot(page,'sheet-f6-slowmo'); frames.push('sheet-f6-slowmo');
  await waitPhase(page,['impact']); await page.waitForTimeout(300); await shot(page,'sheet-f7-impact'); frames.push('sheet-f7-impact');
  report.sheet={frames,result:await page.evaluate(()=>({kind:session.engine.state.flight?.kind,perfect:session.engine.state.flight?.perfect}))};
  await page.close();
}
await writeFile(path.join(outDir,'bow-report.json'),JSON.stringify(report,null,1));
console.log(JSON.stringify(report,null,1));
await browser.close();
