/** soccerShow v1 headless run: tools/soccer-show.html in software WebGL for N real league matches, then the page's JSON report plus the
 * browser's console errors. Usage: node tools/soccer-show-run.mjs <out.json> [query without ?, e.g. "matches=2&quality=2&soccerShow=0"]
 * Env: ISLAND_PLAYWRIGHT or PLAYWRIGHT_MODULE (path to playwright/index.mjs), CHROMIUM_PATH. */
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {serveIsland} from '../../../tests/helpers/island-browser.mjs';
const [out,extra='matches=2']=process.argv.slice(2);
if(!out)throw Error('usage: soccer-show-run.mjs <out.json> [query]');
const playwrightPath=process.env.ISLAND_PLAYWRIGHT||process.env.PLAYWRIGHT_MODULE||'/opt/node-tools/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--ignore-certificate-errors']});
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
const consoleErrors=[];page.on('pageerror',e=>consoleErrors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|manifest|404/.test(m.text()))consoleErrors.push(m.text());});
try{
  await page.goto(server.url+'tools/soccer-show.html?auto=1&dev=1&'+extra,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__show?.done,null,{timeout:3600000});
  const r=await page.evaluate(()=>window.__show);
  const result={query:extra,date:new Date().toISOString(),consoleErrors,...r};
  await writeFile(out,JSON.stringify(result,null,1));
  const s=r.result;
  console.log(JSON.stringify(s?{goals:s.goals,replays:s.replays,skipped:s.replaysSkipped,replayWall:s.replayWall,celebrateWall:s.celebrateWall,holdPerGoal:s.holdPerGoal,shorts:s.shortReplays,renderMs:s.renderMs,matches:s.matches.map(m=>({result:m.result,wall:m.wallSeconds,quality:m.quality,phases:m.phases,renderMs:m.renderMs})),errors:s.errors,consoleErrors}:r));
}finally{await context.close();await browser.close();await server.close();}
