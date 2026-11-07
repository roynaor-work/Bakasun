// Screenshots (844x390) of "תפוס את הפושע" for the verification report.
//   node workout/island/tools/catch-shots.mjs <outDir> [baseUrl=http://127.0.0.1:8765/workout/island/]
// Needs a static server on the repo root and Playwright (ISLAND_PLAYWRIGHT=/path/to/playwright/index.mjs).
// Throws are solved by brute force on the real engine (the same arc the player would find) and released
// through the session's own release(), so what is captured is the shipped HUD, view and effects.
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const [,,outDir='catch-shots',base='http://127.0.0.1:8765/workout/island/']=process.argv;
const {chromium}=await import(process.env.ISLAND_PLAYWRIGHT?pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href:'playwright');
await mkdir(outDir,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--no-proxy-server']});
const solve=(tools,mode)=>`(()=>{const s=session,e=s.engine,P=e.balance.physics;let best=null;
 for(const tool of ${JSON.stringify(tools)}){ if(!e.tools.some(t=>t.id===tool))continue;
  for(let a=4;a<=74&&!best;a+=.5)for(let p=.2;p<=1&&!best;p+=.004){const w=e.wobbleAt(e.clock);const f=e.trajectory(Math.max(0,a),p,tool,{resolve:true,t0:e.clock+P.throwSeconds});
   if(${mode==='miss'?"f.kind!=='catch'&&f.kind==='ground'":"f.kind==='catch'"}){best=[a,p,tool,w.angle,w.power];}}
  if(best)break;}
 if(!best)return null;
 e.setTool(best[2]);e.engine=null;e.setAim({angle:best[0]-best[3],power:best[1]-best[4]});s.debug.release();return best;})()`;
async function open(stage,seed=3,extra=''){
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
  page.on('pageerror',e=>console.log('pageerror',e.message.slice(0,300)));
  await page.goto(`${base}tools/catch-harness.html?stage=${stage}&seed=${seed}${extra}`);
  await page.waitForFunction('window.done===true',null,{timeout:120000});await page.waitForTimeout(500);
  return page;
}
const shot=(page,name)=>page.screenshot({path:path.join(outDir,name+'.png')});
async function untilPhase(page,phases,ms=9000){const t0=Date.now();while(Date.now()-t0<ms){const ph=await page.evaluate(()=>session.engine.state.phase);if(phases.includes(ph))return ph;await page.waitForTimeout(80);}return null;}
const report={};
for(const stage of [1,3,5,7,9,10]){
  const page=await open(stage);
  await shot(page,`stage${String(stage).padStart(2,'0')}-aim`);
  report[stage]=await page.evaluate(solve(['narrow','wide','rope'],'catch'));
  await page.waitForTimeout(450);await shot(page,`stage${String(stage).padStart(2,'0')}-flight`);
  await untilPhase(page,['impact','caught']);await page.waitForTimeout(260);await shot(page,`stage${String(stage).padStart(2,'0')}-catch`);
  await untilPhase(page,['caught','done'],5000);await page.waitForTimeout(700);await shot(page,`stage${String(stage).padStart(2,'0')}-caught`);
  await page.close();
}
{ // the three tools in flight on stage 3
  for(const tool of ['narrow','wide','rope']){
    const page=await open(3);const sol=await page.evaluate(solve([tool],'catch'));
    if(sol){await page.waitForTimeout(700);await shot(page,`tool-${tool}`);}else console.log('no solution for',tool);
    await page.close();
  }
}
{ // three misses: he flees, flees, escapes to the getaway car
  const page=await open(6);
  for(let i=0;i<3;i++){
    await page.evaluate(`(()=>{const e=session.engine;e.setAim({angle:62,power:1});})()`);await page.evaluate(()=>session.debug.release());
    await untilPhase(page,['impact']);await page.waitForTimeout(200);if(i===0)await shot(page,'miss-impact');
    const ph=await untilPhase(page,['flee','escape'],6000);if(ph==='flee'){await page.waitForTimeout(700);if(i===0)await shot(page,'flee');await untilPhase(page,['aim'],6000);}
  }
  await untilPhase(page,['escape'],6000);await page.waitForTimeout(1500);await shot(page,'escape-run');await page.waitForTimeout(1600);await shot(page,'escape-car');
  await untilPhase(page,['done'],8000);await page.waitForTimeout(400);await shot(page,'lose');
  await page.close();
}
{ const page=await open(1,3,'&help=1');await shot(page,'help');await page.close(); }
console.log(JSON.stringify(report));
await browser.close();
