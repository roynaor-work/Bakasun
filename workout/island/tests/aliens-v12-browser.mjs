import {verify} from './night-browser.mjs';
// ALIEN_V12=0 captures v11 into verification/aliens-v12-before/, default into aliens-v12/.
const legacy=process.env.ALIEN_V12==='0';
await verify(legacy?'aliens-v12-before':'aliens-v12',[{width:844,height:390}],async({page,tick,snap,start,shot})=>{
 if(legacy)await page.evaluate(()=>{globalThis.__alienV12=false;});
 await start('alienDefense');
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});
 await tick(4500);await shot('01-idle');
 await page.evaluate(()=>{const mm=window.__island.games.current.session.debug.model;mm.__orig??=mm.update;mm.update=(dt,i={})=>mm.__orig(dt,{...i,firing:true});});
 await tick(1300);await shot('02-firing');
 await tick(37);await shot('03-firing-b');
 await tick(2000);await shot('04-firing-later');
 const s=await snap();return {fired:s.fired,hits:s.hits,lasersFired:s.lasersFired,spinning:s.cannonSide};
});
