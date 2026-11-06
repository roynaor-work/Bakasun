// node soccer-goal-shot.mjs <label> [extra query] → soccer-goal-<label>-<WxH>.png (player + ball near the east goal) and metrics
import {islandChromium,serveIsland} from '../../../../tests/helpers/island-browser.mjs';
import {writeFileSync} from 'node:fs';
const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
const label=process.argv[2]||'run',extra=process.argv[3]||'',out=new URL('./',import.meta.url).pathname,res={};
const b=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-certificate-errors']});
for(const viewport of [{width:844,height:390},{width:390,height:844}]){
 const ctx=await b.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'?dev=1&soccerTier=0'+extra,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
 await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקה',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
 await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:180000});
 await page.evaluate(()=>{const s=window.__island.games.current.session.debug.model.getState();const x=22;s.ball.x=x;s.ball.z=0;s.ball.vx=s.ball.vz=0;s.ball.owner=null;const p=s.players[s.controlled];p.x=x-1;p.z=0;});
 await page.waitForTimeout(2500);
 const key=`${viewport.width}x${viewport.height}`;await page.screenshot({path:`${out}soccer-goal-${label}-${key}.png`});
 res[key]=await page.evaluate(()=>{const m=window.__island.games.current.session.snapshot.renderMetrics;return {quality:m.quality,triangles:m.triangles,drawCalls:m.drawCalls,scene:m.scene||m.designScene||null};});res[key].errors=errors;
 await ctx.close();
}
writeFileSync(`${out}soccer-goal-${label}.json`,JSON.stringify(res,null,1));console.log(JSON.stringify(res));await b.close();await server.close?.();
