import assert from 'node:assert/strict';
import {serveIsland,islandChromium} from '../../../tests/helpers/island-browser.mjs';

export async function cityBrowser(width, height) {
  const server = await serveIsland(), browser = await (await islandChromium()).launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
  const context = await browser.newContext({viewport:{width,height},hasTouch:true,deviceScaleFactor:1,timezoneId:'Asia/Jerusalem'});
  // Every test owns a fresh synthetic local save. Random game launches are
  // covered by the activity suites and must not interrupt a city screenshot.
  await context.route('**/data/featureFlags.json*',async route => {const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),events:false}});});
  const page = await context.newPage(), errors=[], failed=[], outside=[];
  page.setDefaultTimeout(60000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>failed.push(request.url()));
  page.on('request',request=>{const url=new URL(request.url());if(url.protocol.startsWith('http')&&url.origin!==new URL(server.url).origin)outside.push(url.href);});
  try {
    await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
    await page.locator('[data-action=avatar-start]').tap();
    const ids=await page.evaluate(()=>{
      const {engine:e,ui,view}=window.__island;
      e.skipTutorial(); window.cityRealTick=e.tick; e.tick=()=>({ok:true});
      // Arrange an explicitly synthetic village, then exercise real commands.
      e.state.buildings=[{id:'city-hall',typeId:'cityHall',x:12,z:12,level:1},...Array.from({length:16},(_,x)=>({id:`seed-road-${x}`,typeId:'road',x,z:7,level:1}))];
      e.state.money=10000; e.state.resources={food:100,materials:100,energy:100};
      const ids={};
      for(const [name,type,x,z] of [['house','house',4,5],['second','house',6,5],['third','house',8,5],['tower','waterTower',4,8],['factory','factory',0,5],['farm','farm',10,5],['harbor','harbor',0,8]]){
        const result=e.place(type,x,z);if(!result.ok)throw Error(`${name}: ${result.reason}`);ids[name]=result.id;
      }
      ui.closeInfo();ui.closeDetails();ui.setDockOpen(false);view.home();return ids;
    });
    return {page,browser,ids,errors,failed,outside,async check(){assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(outside,[]);},async close(){await context.close();await browser.close();await server.close();}};
  } catch(error) {await browser.close();await server.close();throw error;}
}
