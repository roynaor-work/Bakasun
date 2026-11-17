// Exercise the delivered self-contained HTML with all network requests blocked.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
let chromium;
try {({chromium}=require('playwright'));}
catch {({chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright'));}
const browser=await chromium.launch({headless:true,executablePath:process.env.COACH_CHROME||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',e=>errors.push(String(e)));
await context.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
const html=await readFile(path.join(root,'preview.html'),'utf8');
await page.setContent(html,{waitUntil:'load'});
await page.waitForFunction(()=>window.__coach?.state.ready,{timeout:30000});
await mkdir(path.join(root,'verification'),{recursive:true});
const clips=await page.locator('#animation option').evaluateAll(opts=>opts.map(o=>o.value));
await page.selectOption('#animation','wave');
await page.locator('[data-expression="laughing"]').click();
await page.locator('#scrub').fill('500');
const ui=await page.evaluate(()=>({animation:window.__coach.state.animation,expression:window.__coach.state.expression,paused:!window.__coach.state.playing,time:window.__coach.state.time,duration:window.__coach.state.duration,blobDownload:document.querySelector('a[download="coach.glb"]').href.startsWith('blob:')}));
await page.locator('#play').click();
ui.playResumed=await page.evaluate(()=>window.__coach.state.playing);
await page.locator('#side').click();ui.camera=await page.evaluate(()=>window.__coach.state.camera);
await page.locator('#front').click();
ui.pass=ui.animation==='wave'&&ui.expression==='laughing'&&ui.paused&&Math.abs(ui.time/ui.duration-.5)<.01&&ui.playResumed&&ui.camera==='side'&&ui.blobDownload;
const expressions=['happy','surprised','encouraging','thoughtful','proud','gently_disappointed','laughing','wink'];
const results=[];
for(const clip of clips){
  const result=await page.evaluate(name=>{const c=window.__coach;c.setAnimation(name,0);const duration=c.state.duration;const times=[0,.25,.5,.75,1].map(f=>{c.setAnimation(name,Math.min(duration-.00001,duration*f));return Number.isFinite(c.state.time);});return {name,duration,pass:times.every(Boolean)};},clip);
  results.push(result);
}
const expressionChecks=[];
for(const expression of expressions){
  await page.evaluate(name=>{window.__coach.setAnimation('stand',1.5);window.__coach.setExpression(name);},expression);
  expressionChecks.push({name:expression,selected:await page.locator(`[data-expression="${expression}"]`).getAttribute('aria-pressed')==='true'});
}
await page.evaluate(()=>{window.__coach.setAnimation('wave',1.6);window.__coach.setExpression('happy');});
await page.screenshot({path:path.join(root,'verification/preview-844x390.png')});
// Contact sheets are independent rendered frames, all eight expressions and all gestures.
const stage=await page.locator('.stage').boundingBox();
const shots=path.join('/tmp','coach-rendered-frames');await mkdir(shots,{recursive:true});
for(const name of expressions){
  await page.evaluate(name=>{window.__coach.setAnimation('stand',1.5);window.__coach.setExpression(name);},name);
  await page.screenshot({path:path.join(shots,`expression-${name}.png`),clip:stage});
}
for(const name of clips){
  await page.evaluate(name=>{window.__coach.setAnimation(name,0);window.__coach.setAnimation(name,window.__coach.state.duration/2);window.__coach.setExpression('auto');},name);
  await page.screenshot({path:path.join(shots,`clip-${name}.png`),clip:stage});
}
await page.evaluate(()=>{window.__coach.setCamera('side');window.__coach.setAnimation('stand',1.5);window.__coach.setExpression('happy');});
await page.screenshot({path:path.join(shots,'side.png'),clip:stage});
await page.evaluate(()=>{window.__coach.setCamera('front');window.__coach.setAnimation('joy_jump',1.3);window.__coach.setExpression('laughing');});
await page.screenshot({path:path.join(root,'verification/jump-844x390.png')});
const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
const desktopPass=layout.scrollWidth===844&&layout.scrollHeight===390;
await page.setViewportSize({width:390,height:844});
const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
const report={htmlSha256:createHash('sha256').update(html).digest('hex'),mode:'HTML loaded into an opaque about:blank document; every network request intercepted and aborted',viewport:layout,requests,errors,ui,animations:results,expressions:expressionChecks,mobile,pass:ui.pass&&desktopPass&&mobile.width===mobile.scrollWidth&&requests.length===0&&errors.length===0&&results.length===18&&results.every(c=>c.pass)&&expressionChecks.every(e=>e.selected),limitations:['Chromium policy blocks file:// navigation in this execution environment. The self-contained document was instead executed with all network requests blocked.','Software Chromium checks loading, controls and renderability; no physical-phone performance claim.']};
await writeFile(path.join(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,requests:requests.length,errors,animations:results.length,expressions:expressionChecks.length,viewport:layout}));
await browser.close();
if(!report.pass)process.exitCode=1;
