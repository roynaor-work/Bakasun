// Screenshots (844x390) of "תפוס את הפושע" v2 for the verification report.
//   node workout/island/tools/catch-shots.mjs <outDir> [baseUrl=http://127.0.0.1:8765/workout/island/]
// CATCH_ONLY=chase,ram,bend,throw,gang,boss,v1,escape,help limits the groups. Needs a static server on the repo
// root and Playwright (ISLAND_PLAYWRIGHT=/path/to/playwright/index.mjs). Throws are solved by brute force on
// the real engine and released through the session's own release(), so what is captured is the shipped
// HUD, view and effects.
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const [,,outDir='catch-shots',base='http://127.0.0.1:8765/workout/island/']=process.argv;
const {chromium}=await import(process.env.ISLAND_PLAYWRIGHT?pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href:'playwright');
await mkdir(outDir,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--no-proxy-server']});
const only=(process.env.CATCH_ONLY||'chase,ram,bend,throw,gang,boss,v1,escape,help').split(','),on=k=>only.includes(k);
const SOLVE=`(()=>{const s=session,e=s.engine,P=e.balance.physics,t0=e.clock+P.throwSeconds;let best=null;
 for(const tool of e.tools.map(t=>t.id)){for(let a=(tool==='rope'?4:26);a<=74&&!best;a+=.5)for(let p=.2;p<=1&&!best;p+=.004){
  const f0=e.trajectory(a,p,tool,{yaw:0,withWind:false}),c=e.criminalAt(t0+f0.duration),yaw=e.isArch?Math.atan2(c.z,c.x-P.release.x)*180/Math.PI:0;
  const f=e.trajectory(a,p,tool,{resolve:true,t0,yaw});if(f.kind==='catch')best=[a,p,tool,yaw];}if(best)break;}
 if(!best)return null;const w=e.wobbleAt(e.clock);e.setTool(best[2]);e.setAim({angle:best[0]-w.angle,power:best[1]-w.power,yaw:best[3]-w.yaw});s.debug.release();return best;})()`;
const open=async(stage,extra='')=>{ // extra: '&catchV5=0' = the v4 side view
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
  page.on('pageerror',e=>console.log('pageerror',e.message.slice(0,300)));
  await page.goto(`${base}tools/catch-harness.html?stage=${stage}&seed=3&dev=1${extra}`);
  await page.waitForFunction('window.done===true',null,{timeout:120000});await page.waitForTimeout(400);return page;
};
const shot=(page,name)=>page.screenshot({path:path.join(outDir,name+'.png')});
const phase=(page,list,ms=40000)=>page.waitForFunction(l=>l.includes(session.engine?.state.phase),list,{timeout:ms,polling:25}).then(()=>true,()=>false);
const stepChase=(page,sec)=>page.evaluate(n=>{for(let i=0;i<n*60;i++)session.debug.stepChase(1/60);},sec);
const toThrow=async page=>{await page.evaluate(()=>{for(let i=0;i<60*80&&session.snapshot.mode==='chase';i++)session.debug.stepChase(1/60);});await page.waitForFunction(()=>session.snapshot.mode==='throw',null,{timeout:60000});await page.waitForTimeout(500);};
const flightShare=(page,share,maxDist=99,ms=40000)=>page.waitForFunction(([sh,md])=>{const e=session.engine,f=e.flightNow();return !f&&e.state.phase!=='flight'&&e.state.phase!=='throw'?true:(f&&f.share>=sh&&f.dist<=md);},[share,maxDist],{timeout:ms,polling:20}).then(()=>true,()=>false);
const hold=async(page,sel,on)=>{const b=await page.locator(sel).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);if(on)await page.mouse.down();else await page.mouse.up();};
const n2=n=>String(n).padStart(2,'0');
const report={};

if(on('chase'))for(const stage of [1,5,8,10]){
  const page=await open(stage);
  await shot(page,`chase${n2(stage)}-1-countdown`);
  await stepChase(page,4);await hold(page,'.catch-boost',true);await stepChase(page,3);await page.waitForTimeout(350);await shot(page,`chase${n2(stage)}-2-boost`);
  // run on until something crashes, to capture the hit effect
  const crashed=await page.evaluate(()=>{let hit=false;for(let i=0;i<60*20&&!hit;i++){session.debug.stepChase(1/60);hit=session.chase.state.hits>0||session.chase.state.crim.hits>0;}return hit;});
  if(crashed){await page.waitForTimeout(120);await shot(page,`chase${n2(stage)}-3-crash`);}
  await hold(page,'.catch-boost',false);await toThrow(page);await shot(page,`chase${n2(stage)}-4-handoff`);
  await page.close();
}
if(on('ram')){ // v3: overtake, ram from the side, the damage meter fills and the car stops
  const page=await open(1);await stepChase(page,3);
  await page.evaluate(()=>{session.chase.obstacles.length=0;const s=session.chase.state;s.crim.x=s.x+12;});
  await hold(page,'.catch-boost',true);await page.waitForTimeout(300);
  await page.evaluate(()=>{const s=session.chase.state;for(let i=0;i<60*8&&s.x<s.crim.x+4&&s.phase==='run';i++){s.lat=Math.max(-1,Math.min(1,s.crim.lat+(s.crim.lat>0?-.8:.8)));session.debug.stepChase(1/60);}});
  await page.waitForTimeout(350);await shot(page,'ram-1-overtake');
  await hold(page,'.catch-boost',false);
  for(let k=0;k<3;k++){
    await page.evaluate(()=>{const s=session.chase.state;for(let i=0;i<40&&s.phase==='run';i++){s.x=s.crim.x-1.2;s.lat=s.crim.lat+(s.crim.lat>0?-.8:.8);s.v=s.crim.v+2;session.debug.stepChase(1/60);}});
    await page.waitForTimeout(250);if(k===0)await shot(page,'ram-2-contact');if(k===1)await shot(page,'ram-3-damage');
  }
  await page.evaluate(()=>{const s=session.chase.state;for(let i=0;i<60*20&&s.phase==='run';i++){s.x=s.crim.x-1.2;s.lat=s.crim.lat+(s.crim.lat>0?-.8:.8);s.v=s.crim.v+2;session.debug.stepChase(1/60);}});
  await page.waitForTimeout(900);await shot(page,'ram-4-stopped');
  await page.waitForFunction(()=>session.snapshot.mode==='throw',null,{timeout:60000});await page.waitForTimeout(900);await shot(page,'ram-5-throw');
  await page.close();
}
if(on('bend'))for(const stage of [3,8]){ // v5: the road bends; frames a few seconds apart
  const page=await open(stage);await stepChase(page,4);
  for(let k=0;k<3;k++){await page.evaluate(()=>{for(let i=0;i<8;i++){for(let j=0;j<25;j++)session.debug.stepChase(1/60);session.debug.view().update(25/60,{});}});await page.waitForTimeout(400);await shot(page,`bend${n2(stage)}-${k+1}`);}
  await page.close();
}
if(on('throw'))for(const stage of [1,3,6,8]){
  const page=await open(stage);await toThrow(page);
  await shot(page,`throw${n2(stage)}-1-aim`);
  report[stage]=await page.evaluate(SOLVE);
  await flightShare(page,.5);await shot(page,`throw${n2(stage)}-2-flight`);
  await flightShare(page,.8,2.6);await shot(page,`throw${n2(stage)}-3-slowmo`);
  await phase(page,['impact','caught','rearm','flee']);await page.waitForTimeout(200);await shot(page,`throw${n2(stage)}-4-impact`);
  await phase(page,['caught','rearm','done'],8000);await page.waitForTimeout(900);await shot(page,`throw${n2(stage)}-5-after`);
  await page.close();
}
if(on('gang')){ // stage 6: two thieves
  const page=await open(6);await toThrow(page);await shot(page,'gang-1-first');
  await page.evaluate(SOLVE);await phase(page,['rearm'],60000);await page.waitForTimeout(500);await shot(page,'gang-2-second-arrives');
  await phase(page,['aim']);await page.evaluate(SOLVE);await phase(page,['caught','done'],60000);await page.waitForTimeout(1300);await shot(page,'gang-3-both-caught');
  await page.close();
}
if(on('boss')){ // stage 5: armoured van boss needs two hits
  const page=await open(5);await toThrow(page);await shot(page,'boss-1-aim');
  await page.evaluate(SOLVE);await phase(page,['flee','escape'],60000);await page.waitForTimeout(250);await shot(page,'boss-2-first-hit');
  await phase(page,['aim']);await page.evaluate(SOLVE);await phase(page,['flee','escape'],60000);await page.waitForTimeout(250);await shot(page,'boss-3-second-hit');
  await phase(page,['aim']);await page.evaluate(SOLVE);await phase(page,['caught','done'],60000);await page.waitForTimeout(1300);await shot(page,'boss-4-caught');
  await page.close();
}
if(on('v1')){ // the off switch: v1 look of the same stage
  const page=await open(5,'&catchV2=0');await shot(page,'v1-stage05-aim');await page.close();
}
if(on('escape')){
  const page=await open(6);await toThrow(page);
  await page.evaluate(()=>{session.engine.state.throwsLeft=1;});
  await page.evaluate(()=>{const e=session.engine;e.setAim({angle:45,power:.3});session.debug.release();});
  await phase(page,['escape']);await page.waitForTimeout(1200);await shot(page,'escape-run');
  await page.waitForFunction(()=>{const e=session.engine,st=e.state;return st.phase==='escape'&&(e.clock-st.phaseAt)/e.balance.physics.escapeSeconds>=.86;},null,{timeout:60000,polling:25});await shot(page,'escape-car');
  await phase(page,['done']);await page.waitForTimeout(300);await shot(page,'lose');await page.close();
}
if(on('help')){const page=await open(1,'&help=1');await shot(page,'help');await page.close();}
console.log(JSON.stringify(report));
await browser.close();
