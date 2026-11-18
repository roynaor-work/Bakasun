// 14/11/2026 fire v24: screenshots of the three-style comparison page (tools/fire-v24-styles.html) for the report.
//   ISLAND_PLAYWRIGHT=... node workout/island/tests/fire-v24-styles-shot.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';
const shots=fileURLToPath(new URL('../verification/fire-v24/shots/',import.meta.url));await mkdir(shots,{recursive:true});
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1500,height:560},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(server.url+'tools/fire-v24-styles.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__styles?.ready&&window.__styles.t>4.5,null,{timeout:120000});
await page.screenshot({path:shots+'styles-compare.jpg',type:'jpeg',quality:80});
for(const [id,name] of [['c2d','style-1-2d'],['c25','style-2-25d'],['c3d','style-3-3d']])await page.locator('#'+id).screenshot({path:shots+name+'.jpg',type:'jpeg',quality:82});
const metrics=await page.evaluate(()=>window.__styles.metrics);
await writeFile(shots+'../styles-metrics.json',JSON.stringify({metrics,errors},null,1)+'\n');
console.log(JSON.stringify({metrics,errors}));await browser.close();await server.close?.();
