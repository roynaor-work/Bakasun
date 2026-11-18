import {verify} from './night-browser.mjs';
// ALIEN_V14=0 captures v13 into verification/aliens-v14-before/, default into aliens-v14/.
const legacy=process.env.ALIEN_V14==='0';
await verify(legacy?'aliens-v14-before':'aliens-v14',[{width:844,height:390}],async({page,tick,snap,start,shot})=>{
 if(legacy)await page.evaluate(()=>{globalThis.__alienV14=false;});
 await start('alienDefense');
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});
 await tick(4500);
 await page.evaluate(()=>{const mm=window.__island.games.current.session.debug.model;mm.__orig??=mm.update;mm.update=(dt,i={})=>mm.__orig(dt,{...i,firing:true});});
 await tick(2200);await shot('01-firing-heat-rising');
 await tick(1600);await shot('02-overheated-cooling');
 await tick(2000);await shot('03-resumed');
 await tick(3000);
 const s=await snap();return {fired:s.fired,overheats:s.overheats,heat:s.heat,time:s.time};
});
